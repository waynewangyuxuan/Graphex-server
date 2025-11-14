/**
 * Worker Entry Point
 *
 * Standalone process that runs background workers for job processing.
 * This file is executed separately from the main API server.
 *
 * Usage:
 *   npm run worker          # Start all workers
 *   npm run worker:dev      # Start with auto-reload in development
 *
 * Architecture:
 * - API Server (src/server.ts) - Handles HTTP requests, creates jobs
 * - Worker Process (this file) - Processes jobs from queue
 * - Shared Redis - Communication layer between API and workers
 *
 * WHY: Separate process allows independent scaling:
 * - Scale API servers horizontally for request handling
 * - Scale worker processes for job processing capacity
 * - Workers can be deployed on different machines with more CPU/memory
 *
 * @see META/Core/TECHNICAL.md Section 10.4 (Worker Configuration)
 */

import { Worker } from 'bullmq';
import { createGraphGenerationWorker, setupSignalHandlers } from './graph-generation.worker';
import { logger } from '../utils/logger.util';
import { env } from '../config/env';

// ============================================================
// WORKER REGISTRY
// ============================================================

/**
 * Registry of all active workers
 * WHY: Enables graceful shutdown of all workers
 */
const activeWorkers: Worker[] = [];

/**
 * Worker health status
 */
interface WorkerHealth {
  name: string;
  status: 'running' | 'paused' | 'closing' | 'closed';
  jobsProcessed: number;
  jobsFailed: number;
  uptime: number;
}

// ============================================================
// WORKER STARTUP
// ============================================================

/**
 * Start all workers
 * WHY: Initialize all background job processors
 */
async function startWorkers(): Promise<void> {
  logger.info('Starting background workers...', {
    environment: env.NODE_ENV,
    redisUrl: env.REDIS_URL ? 'configured' : 'using default',
  });

  try {
    // Start graph generation worker
    const graphWorker = createGraphGenerationWorker();
    activeWorkers.push(graphWorker);

    // Setup signal handlers for graceful shutdown
    setupSignalHandlers(graphWorker);

    // Add more workers here as needed:
    // const documentWorker = createDocumentProcessingWorker();
    // activeWorkers.push(documentWorker);
    // setupSignalHandlers(documentWorker);

    logger.info('All workers started successfully', {
      workerCount: activeWorkers.length,
    });

    // Keep process alive
    process.on('beforeExit', () => {
      logger.info('Worker process exiting...');
    });
  } catch (error) {
    logger.error('Failed to start workers', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Exit with error code
    process.exit(1);
  }
}

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

/**
 * Shutdown all workers gracefully
 * WHY: Complete in-flight jobs before terminating
 */
async function shutdownAllWorkers(): Promise<void> {
  logger.info('Shutting down all workers...');

  const shutdownPromises = activeWorkers.map(async (worker) => {
    try {
      await worker.close();
      logger.info('Worker closed', { name: worker.name });
    } catch (error) {
      logger.error('Error closing worker', {
        name: worker.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  await Promise.all(shutdownPromises);

  logger.info('All workers shut down successfully');
}

/**
 * Setup global signal handlers
 * WHY: Ensure clean shutdown on SIGTERM/SIGINT
 */
function setupGlobalSignalHandlers(): void {
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];

  signals.forEach((signal) => {
    process.on(signal, async () => {
      logger.info(`Received ${signal}, initiating graceful shutdown...`);

      try {
        await shutdownAllWorkers();
        logger.info('Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', {
          error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
      }
    });
  });
}

/**
 * Handle uncaught errors
 * WHY: Log critical errors before process crashes
 */
function setupErrorHandlers(): void {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', {
      error: error.message,
      stack: error.stack,
    });

    // Attempt graceful shutdown
    shutdownAllWorkers()
      .then(() => process.exit(1))
      .catch(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled promise rejection', {
      reason,
      promise,
    });

    // Don't exit on unhandled rejection (may be recoverable)
    // But log it for debugging
  });
}

// ============================================================
// WORKER HEALTH MONITORING
// ============================================================

/**
 * Get health status of all workers
 * WHY: Monitoring and debugging
 */
async function getWorkerHealth(): Promise<WorkerHealth[]> {
  const healthChecks = activeWorkers.map(async (worker) => {
    const metrics = await worker.getMetrics();

    return {
      name: worker.name,
      status: worker.closing ? 'closing' : worker.paused ? 'paused' : 'running',
      jobsProcessed: metrics.completed?.count || 0,
      jobsFailed: metrics.failed?.count || 0,
      uptime: Date.now() - worker.startedOn,
    } as WorkerHealth;
  });

  return Promise.all(healthChecks);
}

/**
 * Log worker health periodically
 * WHY: Monitor worker performance and detect issues
 */
function startHealthMonitoring(intervalMs: number = 60000): void {
  setInterval(async () => {
    try {
      const health = await getWorkerHealth();

      logger.info('Worker health check', {
        workers: health.map((h) => ({
          name: h.name,
          status: h.status,
          jobsProcessed: h.jobsProcessed,
          jobsFailed: h.jobsFailed,
          uptimeMinutes: Math.round(h.uptime / 60000),
        })),
      });
    } catch (error) {
      logger.error('Health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, intervalMs);
}

// ============================================================
// MAIN EXECUTION
// ============================================================

/**
 * Main entry point
 */
async function main(): Promise<void> {
  logger.info('Worker process starting...', {
    nodeVersion: process.version,
    platform: process.platform,
    pid: process.pid,
  });

  // Setup error handlers first
  setupErrorHandlers();

  // Setup signal handlers
  setupGlobalSignalHandlers();

  // Start workers
  await startWorkers();

  // Start health monitoring (every minute)
  if (env.NODE_ENV === 'production') {
    startHealthMonitoring(60000);
  }

  logger.info('Worker process ready');
}

// ============================================================
// EXECUTE
// ============================================================

// Only run if this file is executed directly (not imported)
if (require.main === module) {
  main().catch((error) => {
    logger.error('Fatal error in worker process', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  });
}

// ============================================================
// EXPORTS (for testing)
// ============================================================

export { startWorkers, shutdownAllWorkers, getWorkerHealth };

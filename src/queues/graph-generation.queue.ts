/**
 * Graph Generation Queue Configuration
 *
 * Sets up BullMQ queue for graph generation jobs with:
 * - Redis connection using existing config
 * - Job timeout (5 minutes for large documents)
 * - Priority-based processing (medium priority)
 * - Job removal on completion (prevents Redis memory bloat)
 *
 * WHY: Graph generation can take 30s-5min for large documents.
 * Offloading to background queue prevents API timeouts and enables
 * progress tracking for better UX.
 *
 * @see META/Core/TECHNICAL.md Section 10.2 (Job Types)
 */

import { Queue, QueueOptions } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env';
import { logger } from '../utils/logger.util';
import { GraphGenerationJobData, GraphGenerationJobResult } from '../types/job.types';

// ============================================================
// CONFIGURATION
// ============================================================

/**
 * Queue name constant
 * WHY: Centralized naming prevents typos and enables refactoring
 */
export const GRAPH_GENERATION_QUEUE_NAME = 'graph-generation';

/**
 * Job configuration defaults
 */
export const GRAPH_GENERATION_JOB_CONFIG = {
  /** Maximum processing time before timeout */
  timeout: 300000, // 5 minutes in milliseconds

  /** Priority level (1 = highest, 2097152 = lowest) */
  priority: 1000, // Medium priority (range: 101-10000)

  /** Maximum retry attempts */
  maxAttempts: 3,

  /** Remove job from Redis after completion (prevents memory bloat) */
  removeOnComplete: {
    age: 3600, // Keep for 1 hour after completion (for status queries)
    count: 100, // Keep last 100 completed jobs
  },

  /** Remove failed jobs after a period */
  removeOnFail: {
    age: 86400, // Keep failed jobs for 24 hours (for debugging)
  },
} as const;

// ============================================================
// REDIS CONNECTION
// ============================================================

/**
 * Create Redis connection for BullMQ
 *
 * WHY: BullMQ requires a separate Redis connection from the cache client.
 * Uses IORedis (ioredis) which BullMQ is built on.
 */
function createRedisConnection(): IORedis {
  const connection = new IORedis(env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null, // Required for BullMQ
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      logger.warn('BullMQ Redis connection retry', { attempt: times, delay });
      return delay;
    },
    reconnectOnError: (err) => {
      logger.error('BullMQ Redis connection error', { error: err.message });
      // Reconnect on all errors
      return true;
    },
  });

  // Event handlers
  connection.on('connect', () => {
    logger.info('BullMQ Redis connected');
  });

  connection.on('ready', () => {
    logger.info('BullMQ Redis ready');
  });

  connection.on('error', (err) => {
    logger.error('BullMQ Redis error', { error: err.message });
  });

  connection.on('close', () => {
    logger.warn('BullMQ Redis connection closed');
  });

  return connection;
}

// ============================================================
// QUEUE SETUP
// ============================================================

/**
 * Queue options for graph generation
 */
const queueOptions: QueueOptions = {
  connection: createRedisConnection(),

  // Default job options (can be overridden per job)
  defaultJobOptions: {
    attempts: GRAPH_GENERATION_JOB_CONFIG.maxAttempts,
    backoff: {
      type: 'exponential',
      delay: 1000, // Start with 1s, then 2s, 4s, 8s...
    },
    removeOnComplete: GRAPH_GENERATION_JOB_CONFIG.removeOnComplete,
    removeOnFail: GRAPH_GENERATION_JOB_CONFIG.removeOnFail,
    timeout: GRAPH_GENERATION_JOB_CONFIG.timeout,
  },

  // Prefix for Redis keys (allows multiple environments)
  prefix: `{${env.NODE_ENV || 'development'}}`,
};

/**
 * Graph Generation Queue instance
 *
 * Type-safe queue using discriminated union types
 */
export const graphGenerationQueue = new Queue<
  GraphGenerationJobData,
  GraphGenerationJobResult,
  typeof GRAPH_GENERATION_QUEUE_NAME
>(GRAPH_GENERATION_QUEUE_NAME, queueOptions);

// ============================================================
// QUEUE EVENT HANDLERS
// ============================================================

/**
 * Set up queue-level event listeners for monitoring
 *
 * WHY: Queue events provide visibility into overall system health
 * and enable alerting on issues like stalled jobs or errors.
 */
function setupQueueEventHandlers(): void {
  // Job added to queue
  graphGenerationQueue.on('waiting', (job) => {
    logger.debug('Job added to queue', {
      jobId: job.id,
      queue: GRAPH_GENERATION_QUEUE_NAME,
    });
  });

  // Job started processing
  graphGenerationQueue.on('active', (job) => {
    logger.info('Job started processing', {
      jobId: job.id,
      queue: GRAPH_GENERATION_QUEUE_NAME,
      documentId: job.data.documentId,
    });
  });

  // Job completed successfully
  graphGenerationQueue.on('completed', (job, result) => {
    logger.info('Job completed', {
      jobId: job.id,
      queue: GRAPH_GENERATION_QUEUE_NAME,
      documentId: job.data.documentId,
      graphId: result.graphId,
      nodeCount: result.nodeCount,
      edgeCount: result.edgeCount,
      qualityScore: result.qualityScore,
      cost: result.cost,
      processingTimeMs: result.processingTimeMs,
    });
  });

  // Job failed
  graphGenerationQueue.on('failed', (job, error) => {
    logger.error('Job failed', {
      jobId: job?.id,
      queue: GRAPH_GENERATION_QUEUE_NAME,
      documentId: job?.data.documentId,
      error: error.message,
      stack: error.stack,
      attempts: job?.attemptsMade,
      maxAttempts: GRAPH_GENERATION_JOB_CONFIG.maxAttempts,
    });
  });

  // Job stalled (worker crashed or timeout)
  graphGenerationQueue.on('stalled', (jobId) => {
    logger.warn('Job stalled', {
      jobId,
      queue: GRAPH_GENERATION_QUEUE_NAME,
      message: 'Job may have exceeded timeout or worker crashed',
    });
  });

  // Queue error
  graphGenerationQueue.on('error', (error) => {
    logger.error('Queue error', {
      queue: GRAPH_GENERATION_QUEUE_NAME,
      error: error.message,
      stack: error.stack,
    });
  });
}

// Initialize event handlers
setupQueueEventHandlers();

// ============================================================
// QUEUE HEALTH AND METRICS
// ============================================================

/**
 * Get queue health metrics
 *
 * Returns current state of the queue for monitoring
 */
export async function getQueueMetrics(): Promise<{
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}> {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    graphGenerationQueue.getWaitingCount(),
    graphGenerationQueue.getActiveCount(),
    graphGenerationQueue.getCompletedCount(),
    graphGenerationQueue.getFailedCount(),
    graphGenerationQueue.getDelayedCount(),
  ]);

  const isPaused = await graphGenerationQueue.isPaused();

  return {
    name: GRAPH_GENERATION_QUEUE_NAME,
    waiting,
    active,
    completed,
    failed,
    delayed,
    paused: isPaused,
  };
}

/**
 * Pause queue processing
 * WHY: Useful for maintenance or when AI service is down
 */
export async function pauseQueue(): Promise<void> {
  await graphGenerationQueue.pause();
  logger.warn('Queue paused', { queue: GRAPH_GENERATION_QUEUE_NAME });
}

/**
 * Resume queue processing
 */
export async function resumeQueue(): Promise<void> {
  await graphGenerationQueue.resume();
  logger.info('Queue resumed', { queue: GRAPH_GENERATION_QUEUE_NAME });
}

/**
 * Drain queue (remove all waiting jobs)
 * WHY: Emergency cleanup or testing
 */
export async function drainQueue(): Promise<void> {
  await graphGenerationQueue.drain();
  logger.warn('Queue drained', { queue: GRAPH_GENERATION_QUEUE_NAME });
}

/**
 * Clean old completed/failed jobs
 * WHY: Prevent Redis memory bloat over time
 */
export async function cleanQueue(
  grace: number = 3600000, // 1 hour
  limit: number = 1000,
): Promise<void> {
  const [completedCount, failedCount] = await Promise.all([
    graphGenerationQueue.clean(grace, limit, 'completed'),
    graphGenerationQueue.clean(grace * 24, limit, 'failed'), // Keep failed longer
  ]);

  logger.info('Queue cleaned', {
    queue: GRAPH_GENERATION_QUEUE_NAME,
    completedRemoved: completedCount.length,
    failedRemoved: failedCount.length,
  });
}

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

/**
 * Close queue connection gracefully
 * WHY: Ensures all jobs are processed and connections are closed properly
 */
export async function closeQueue(): Promise<void> {
  try {
    await graphGenerationQueue.close();
    logger.info('Queue closed gracefully', { queue: GRAPH_GENERATION_QUEUE_NAME });
  } catch (error) {
    logger.error('Error closing queue', {
      queue: GRAPH_GENERATION_QUEUE_NAME,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ============================================================
// EXPORTS
// ============================================================

export default graphGenerationQueue;

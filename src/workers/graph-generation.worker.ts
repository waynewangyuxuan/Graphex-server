/**
 * Graph Generation Worker
 *
 * Background worker that processes graph generation jobs from the queue.
 * Integrates with GraphGeneratorService and provides progress tracking.
 *
 * Flow:
 * 1. Receive job from BullMQ
 * 2. Validate job data
 * 3. Call GraphGeneratorService.generateGraph()
 * 4. Track progress and update job
 * 5. Save result to database
 * 6. Return success or handle errors
 *
 * Error Handling:
 * - Classify errors (transient, permanent, rate limit)
 * - Only retry on transient errors
 * - Log all failures with context
 * - Update job metadata for debugging
 *
 * WHY: Graph generation can take 30s-5min. Background processing prevents
 * API timeouts and enables progress tracking for better UX.
 *
 * @see META/Core/TECHNICAL.md Section 10.3 (Job Flow)
 */

import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import { logger } from '../utils/logger.util';
import { GRAPH_GENERATION_QUEUE_NAME } from '../queues/graph-generation.queue';
import {
  GraphGenerationJobData,
  GraphGenerationJobResult,
  GraphGenerationProgress,
  classifyJobError,
  shouldRetryError,
  calculateRetryDelay,
  JobErrorType,
} from '../types/job.types';
import { GraphGeneratorService } from '../services/graph-generator.service';
import { AIOrchestrator } from '../services/ai-orchestrator.service';
import { CostTrackerService } from '../services/cost-tracker.service';
import { TextChunker } from '../lib/chunking/text-chunker';
import { SemanticNodeDeduplicator } from '../lib/graph/semantic-deduplicator';

// ============================================================
// CONFIGURATION
// ============================================================

/**
 * Worker concurrency configuration
 * WHY: Limit to 2 concurrent jobs to avoid AI rate limits
 */
const WORKER_CONCURRENCY = 2;

/**
 * Stall detection interval (ms)
 * WHY: Detect and recover stalled jobs quickly
 */
const STALL_INTERVAL = 30000; // 30 seconds

// ============================================================
// DEPENDENCY INITIALIZATION
// ============================================================

/**
 * Initialize dependencies for graph generation
 * WHY: Single responsibility - each service handles one concern
 */
function initializeDependencies() {
  const prisma = new PrismaClient();

  // AI Orchestrator for API calls
  const aiOrchestrator = new AIOrchestrator(logger);

  // Cost tracker for budget management
  const costTracker = new CostTrackerService(prisma, logger);

  // Text chunker for document splitting
  const textChunker = new TextChunker();

  // Semantic deduplicator for node merging
  const semanticDeduplicator = new SemanticNodeDeduplicator(aiOrchestrator, logger);

  // Graph generator service (main orchestrator)
  const graphGenerator = new GraphGeneratorService(
    textChunker,
    aiOrchestrator,
    costTracker,
    semanticDeduplicator,
    logger,
  );

  return {
    prisma,
    graphGenerator,
  };
}

// ============================================================
// JOB PROCESSOR
// ============================================================

/**
 * Process a single graph generation job
 *
 * This is the main entry point for job processing.
 * BullMQ calls this function for each job in the queue.
 */
async function processGraphGenerationJob(
  job: Job<GraphGenerationJobData, GraphGenerationJobResult>,
): Promise<GraphGenerationJobResult> {
  const startTime = Date.now();
  const { prisma, graphGenerator } = initializeDependencies();

  logger.info('Processing graph generation job', {
    jobId: job.id,
    documentId: job.data.documentId,
    documentLength: job.data.documentText.length,
    maxNodes: job.data.maxNodes,
    attempt: job.attemptsMade + 1,
  });

  try {
    // Step 1: Validate job data
    validateJobData(job.data);

    // Step 2: Generate graph with progress tracking
    const result = await graphGenerator.generateGraph(
      {
        documentId: job.data.documentId || '',
        documentText: job.data.documentText,
        documentTitle: job.data.documentTitle,
        options: {
          maxNodes: job.data.maxNodes,
          skipCache: job.data.skipCache,
        },
      },
      // Progress callback - updates BullMQ job progress
      (progress) => {
        updateJobProgress(job, progress);
      },
    );

    // Step 3: Save graph to database
    const graph = await saveGraphToDatabase(prisma, job.data, result);

    // Step 4: Build job result
    const jobResult: GraphGenerationJobResult = {
      graphId: graph.id,
      nodeCount: result.statistics.totalNodes,
      edgeCount: result.statistics.totalEdges,
      mergedNodes: result.statistics.mergedNodes,
      qualityScore: result.statistics.qualityScore,
      fallbackUsed: result.metadata.fallbackUsed,
      model: result.metadata.model,
      warnings: result.metadata.warnings,
      cost: result.statistics.totalCost,
      processingTimeMs: Date.now() - startTime,
      completedAt: Date.now(),
    };

    logger.info('Graph generation job completed', {
      jobId: job.id,
      graphId: jobResult.graphId,
      nodeCount: jobResult.nodeCount,
      edgeCount: jobResult.edgeCount,
      qualityScore: jobResult.qualityScore,
      cost: jobResult.cost,
      processingTimeMs: jobResult.processingTimeMs,
    });

    return jobResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error('Graph generation job failed', {
      jobId: job.id,
      documentId: job.data.documentId,
      error: errorMessage,
      stack: errorStack,
      attempt: job.attemptsMade + 1,
      processingTimeMs: Date.now() - startTime,
    });

    // Classify error for retry decision
    const errorType = error instanceof Error ? classifyJobError(error) : JobErrorType.UNKNOWN;
    const shouldRetry = shouldRetryError(errorType);

    logger.info('Error classification', {
      jobId: job.id,
      errorType,
      shouldRetry,
    });

    // For non-retryable errors, mark graph as failed in database
    if (!shouldRetry && job.data.documentId) {
      await markGraphAsFailed(prisma, job.data.documentId, errorMessage);
    }

    // Re-throw for BullMQ retry logic
    throw error;
  } finally {
    // Cleanup
    await prisma.$disconnect();
  }
}

// ============================================================
// VALIDATION
// ============================================================

/**
 * Validate job data before processing
 * WHY: Catch invalid data early to avoid wasted processing
 */
function validateJobData(data: GraphGenerationJobData): void {
  if (!data.documentText || data.documentText.trim().length === 0) {
    throw new Error('Document text is empty');
  }

  if (data.documentText.length < 100) {
    throw new Error('Document text too short (minimum 100 characters)');
  }

  if (!data.documentTitle || data.documentTitle.trim().length === 0) {
    throw new Error('Document title is missing');
  }

  if (data.maxNodes && (data.maxNodes < 3 || data.maxNodes > 50)) {
    throw new Error('maxNodes must be between 3 and 50');
  }
}

// ============================================================
// PROGRESS TRACKING
// ============================================================

/**
 * Update job progress in BullMQ
 * WHY: Enables frontend to show real-time progress to users
 */
function updateJobProgress(
  job: Job<GraphGenerationJobData, GraphGenerationJobResult>,
  progress: GraphGenerationProgress,
): void {
  job.updateProgress(progress).catch((error) => {
    logger.warn('Failed to update job progress', {
      jobId: job.id,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  logger.debug('Job progress updated', {
    jobId: job.id,
    stage: progress.stage,
    percentage: progress.percentage,
    message: progress.message,
  });
}

// ============================================================
// DATABASE OPERATIONS
// ============================================================

/**
 * Save generated graph to database
 * WHY: Persistent storage enables retrieval and analytics
 */
async function saveGraphToDatabase(
  prisma: PrismaClient,
  jobData: GraphGenerationJobData,
  result: any,
) {
  const graph = await prisma.graph.create({
    data: {
      documentId: jobData.documentId || '',
      mermaidCode: result.mermaidCode,
      generationModel: result.metadata.model,
      status: 'ready',
      nodes: {
        create: result.nodes.map((node: any, index: number) => ({
          nodeKey: node.id,
          title: node.title,
          contentSnippet: node.description,
          nodeType: node.nodeType,
          summary: node.summary,
          positionX: null,
          positionY: null,
          metadata: node.metadata || {},
        })),
      },
      edges: {
        create: result.edges.map((edge: any) => {
          // Find node IDs from nodeKeys
          const fromNodeIndex = result.nodes.findIndex((n: any) => n.id === edge.from);
          const toNodeIndex = result.nodes.findIndex((n: any) => n.id === edge.to);

          return {
            fromNode: { connect: { nodeKey: edge.from } },
            toNode: { connect: { nodeKey: edge.to } },
            relationship: edge.relationship,
            metadata: edge.metadata || {},
          };
        }),
      },
    },
    include: {
      nodes: true,
      edges: true,
    },
  });

  logger.info('Graph saved to database', {
    graphId: graph.id,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
  });

  return graph;
}

/**
 * Mark graph as failed in database
 * WHY: Track failures for debugging and user notification
 */
async function markGraphAsFailed(
  prisma: PrismaClient,
  documentId: string,
  errorMessage: string,
): Promise<void> {
  try {
    // Find existing graph record (if any)
    const existingGraph = await prisma.graph.findFirst({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
    });

    if (existingGraph) {
      await prisma.graph.update({
        where: { id: existingGraph.id },
        data: { status: 'failed' },
      });
    } else {
      // Create a failed graph record
      await prisma.graph.create({
        data: {
          documentId,
          mermaidCode: '',
          generationModel: 'failed',
          status: 'failed',
        },
      });
    }

    logger.info('Graph marked as failed in database', {
      documentId,
      errorMessage,
    });
  } catch (error) {
    logger.error('Failed to mark graph as failed', {
      documentId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ============================================================
// WORKER INITIALIZATION
// ============================================================

/**
 * Create Redis connection for worker
 * WHY: Workers need their own Redis connection separate from queue
 */
function createWorkerRedisConnection(): IORedis {
  return new IORedis(env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null, // Required for BullMQ
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });
}

/**
 * Create and configure the worker
 */
export function createGraphGenerationWorker(): Worker<
  GraphGenerationJobData,
  GraphGenerationJobResult
> {
  const worker = new Worker<GraphGenerationJobData, GraphGenerationJobResult>(
    GRAPH_GENERATION_QUEUE_NAME,
    processGraphGenerationJob,
    {
      connection: createWorkerRedisConnection(),
      concurrency: WORKER_CONCURRENCY,
      stalledInterval: STALL_INTERVAL,
      prefix: `{${env.NODE_ENV || 'development'}}`,

      // Custom retry strategy based on error classification
      settings: {
        // Use default backoff from job options
      },
    },
  );

  // ============================================================
  // WORKER EVENT HANDLERS
  // ============================================================

  worker.on('active', (job) => {
    logger.info('Worker picked up job', {
      jobId: job.id,
      documentId: job.data.documentId,
    });
  });

  worker.on('completed', (job, result) => {
    logger.info('Worker completed job', {
      jobId: job.id,
      graphId: result.graphId,
      processingTimeMs: result.processingTimeMs,
    });
  });

  worker.on('failed', (job, error) => {
    if (job) {
      const errorType = classifyJobError(error);
      const shouldRetry = shouldRetryError(errorType);

      logger.error('Worker job failed', {
        jobId: job.id,
        documentId: job.data.documentId,
        error: error.message,
        errorType,
        willRetry: shouldRetry && job.attemptsMade < 3,
        attempt: job.attemptsMade,
      });
    }
  });

  worker.on('stalled', (jobId) => {
    logger.warn('Worker job stalled', {
      jobId,
      message: 'Job exceeded timeout or worker crashed',
    });
  });

  worker.on('error', (error) => {
    logger.error('Worker error', {
      error: error.message,
      stack: error.stack,
    });
  });

  logger.info('Graph generation worker started', {
    concurrency: WORKER_CONCURRENCY,
    stalledInterval: STALL_INTERVAL,
  });

  return worker;
}

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

/**
 * Shutdown worker gracefully
 * WHY: Complete in-flight jobs before terminating
 */
export async function shutdownWorker(worker: Worker): Promise<void> {
  logger.info('Shutting down graph generation worker...');

  try {
    // Close worker (waits for active jobs to complete)
    await worker.close();
    logger.info('Worker shut down gracefully');
  } catch (error) {
    logger.error('Error shutting down worker', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ============================================================
// SIGNAL HANDLERS
// ============================================================

/**
 * Setup signal handlers for graceful shutdown
 * WHY: Ensure clean shutdown on SIGTERM/SIGINT
 */
export function setupSignalHandlers(worker: Worker): void {
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];

  signals.forEach((signal) => {
    process.on(signal, async () => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      await shutdownWorker(worker);
      process.exit(0);
    });
  });
}

// ============================================================
// EXPORTS
// ============================================================

export default createGraphGenerationWorker;

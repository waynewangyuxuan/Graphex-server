/**
 * Queue Service
 *
 * High-level service wrapper for job queue operations.
 * Provides simple API for controllers to create jobs and check status.
 *
 * Responsibilities:
 * - Add jobs to queues with appropriate options
 * - Retrieve job status and results
 * - Handle job cancellation (if needed)
 * - Abstract BullMQ complexity from controllers
 *
 * WHY: Controllers should not interact with BullMQ directly.
 * This service provides a clean API and encapsulates queue logic.
 *
 * @see META/Core/TECHNICAL.md Section 10.3 (Job Flow)
 */

import { Job } from 'bullmq';
import { logger } from '../utils/logger.util';
import { graphGenerationQueue, GRAPH_GENERATION_JOB_CONFIG } from '../queues/graph-generation.queue';
import {
  GraphGenerationJobData,
  GraphGenerationJobResult,
  JobStatus,
  JobProgress,
} from '../types/job.types';
import { v4 as uuidv4 } from 'uuid';

// ============================================================
// QUEUE SERVICE CLASS
// ============================================================

export class QueueService {
  constructor() {
    logger.info('Queue Service initialized');
  }

  // ============================================================
  // GRAPH GENERATION JOBS
  // ============================================================

  /**
   * Add a graph generation job to the queue
   *
   * @param data Job data
   * @param options Optional job configuration overrides
   * @returns Job ID for status tracking
   *
   * WHY: Controllers call this to start async graph generation.
   * Returns immediately with job ID, allowing non-blocking API responses.
   */
  async addGraphGenerationJob(
    data: Omit<GraphGenerationJobData, 'type' | 'requestId' | 'timestamp'>,
    options?: {
      priority?: number;
      delay?: number;
      attempts?: number;
    },
  ): Promise<string> {
    // Generate request ID for tracking
    const requestId = uuidv4();

    // Build complete job data
    const jobData: GraphGenerationJobData = {
      ...data,
      type: 'graph-generation',
      requestId,
      timestamp: Date.now(),
    };

    // Validate required fields
    this.validateGraphGenerationData(jobData);

    // Add job to queue
    const job = await graphGenerationQueue.add(
      'generate-graph', // Job name
      jobData,
      {
        // Override defaults with custom options
        priority: options?.priority || GRAPH_GENERATION_JOB_CONFIG.priority,
        delay: options?.delay || 0,
        attempts: options?.attempts || GRAPH_GENERATION_JOB_CONFIG.maxAttempts,
        // Include job metadata for debugging
        jobId: requestId, // Use requestId as jobId for easier tracking
      },
    );

    logger.info('Graph generation job added to queue', {
      jobId: job.id,
      requestId,
      documentId: jobData.documentId,
      documentLength: jobData.documentText.length,
      priority: options?.priority,
    });

    return job.id || requestId;
  }

  /**
   * Get job status and progress
   *
   * @param jobId Job ID returned from addGraphGenerationJob
   * @returns Current job status, progress, and result (if completed)
   *
   * WHY: API endpoints use this to respond to status polling requests.
   */
  async getJobStatus(jobId: string): Promise<JobStatus> {
    const job = await graphGenerationQueue.getJob(jobId);

    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    // Get job state
    const state = await job.getState();

    // Build status response
    const status: JobStatus = {
      jobId: job.id || jobId,
      state: state as JobStatus['state'],
      createdAt: job.timestamp,
      updatedAt: job.processedOn || job.timestamp,
      attempts: job.attemptsMade,
      maxAttempts: job.opts.attempts || GRAPH_GENERATION_JOB_CONFIG.maxAttempts,
    };

    // Add progress if available
    if (job.progress) {
      status.progress = job.progress as JobProgress;
    }

    // Add result if completed
    if (state === 'completed' && job.returnvalue) {
      status.result = job.returnvalue as GraphGenerationJobResult;
    }

    // Add error if failed
    if (state === 'failed' && job.failedReason) {
      status.error = {
        message: job.failedReason,
        stack: job.stacktrace?.join('\n'),
      };
    }

    // Estimate completion time if active
    if (state === 'active' && job.progress) {
      const progress = job.progress as GraphGenerationProgress;
      if (progress.percentage > 0) {
        const elapsed = Date.now() - job.timestamp;
        const estimatedTotal = (elapsed / progress.percentage) * 100;
        const estimatedRemaining = estimatedTotal - elapsed;
        status.estimatedCompletionTime = Date.now() + estimatedRemaining;
      }
    }

    return status;
  }

  /**
   * Get job result (shorthand for completed jobs)
   *
   * @param jobId Job ID
   * @returns Job result or throws if not completed
   *
   * WHY: Convenience method for controllers that only need the result.
   */
  async getJobResult(jobId: string): Promise<GraphGenerationJobResult> {
    const status = await this.getJobStatus(jobId);

    if (status.state !== 'completed') {
      throw new Error(`Job not completed yet. Current state: ${status.state}`);
    }

    if (!status.result) {
      throw new Error('Job completed but no result available');
    }

    return status.result as GraphGenerationJobResult;
  }

  /**
   * Cancel a job (if still waiting or active)
   *
   * @param jobId Job ID to cancel
   * @returns true if cancelled, false if already completed/failed
   *
   * WHY: Users may want to cancel long-running jobs.
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = await graphGenerationQueue.getJob(jobId);

    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    const state = await job.getState();

    // Can only cancel waiting or delayed jobs
    if (state === 'waiting' || state === 'delayed') {
      await job.remove();
      logger.info('Job cancelled', { jobId });
      return true;
    }

    // Cannot cancel active/completed/failed jobs
    logger.warn('Cannot cancel job in current state', { jobId, state });
    return false;
  }

  /**
   * Retry a failed job
   *
   * @param jobId Job ID to retry
   * @returns New job ID
   *
   * WHY: Users may want to retry failed jobs after fixing issues.
   */
  async retryJob(jobId: string): Promise<string> {
    const job = await graphGenerationQueue.getJob(jobId);

    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    const state = await job.getState();

    if (state !== 'failed') {
      throw new Error(`Can only retry failed jobs. Current state: ${state}`);
    }

    // Retry the job
    await job.retry();
    logger.info('Job retried', { jobId });

    return job.id || jobId;
  }

  // ============================================================
  // BATCH OPERATIONS
  // ============================================================

  /**
   * Add multiple graph generation jobs at once
   *
   * @param dataArray Array of job data
   * @returns Array of job IDs
   *
   * WHY: Efficient bulk processing for batch imports.
   */
  async addGraphGenerationJobsBulk(
    dataArray: Array<Omit<GraphGenerationJobData, 'type' | 'requestId' | 'timestamp'>>,
  ): Promise<string[]> {
    const jobIds: string[] = [];

    for (const data of dataArray) {
      const jobId = await this.addGraphGenerationJob(data);
      jobIds.push(jobId);
    }

    logger.info('Bulk graph generation jobs added', { count: jobIds.length });

    return jobIds;
  }

  /**
   * Get status for multiple jobs
   *
   * @param jobIds Array of job IDs
   * @returns Array of job statuses
   *
   * WHY: Dashboard/monitoring needs to check multiple jobs at once.
   */
  async getJobStatusBulk(jobIds: string[]): Promise<JobStatus[]> {
    const statuses = await Promise.all(
      jobIds.map((jobId) =>
        this.getJobStatus(jobId).catch((error) => {
          logger.warn('Failed to get job status', { jobId, error: error.message });
          return null;
        }),
      ),
    );

    // Filter out null values (jobs not found)
    return statuses.filter((status): status is JobStatus => status !== null);
  }

  // ============================================================
  // QUEUE MANAGEMENT
  // ============================================================

  /**
   * Get queue metrics for monitoring
   *
   * @returns Current queue state
   *
   * WHY: Monitoring dashboards need queue health information.
   */
  async getQueueMetrics(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      graphGenerationQueue.getWaitingCount(),
      graphGenerationQueue.getActiveCount(),
      graphGenerationQueue.getCompletedCount(),
      graphGenerationQueue.getFailedCount(),
      graphGenerationQueue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Clean old completed/failed jobs
   *
   * @param maxAge Maximum age in milliseconds (default: 1 hour)
   * @param limit Maximum number of jobs to clean (default: 1000)
   *
   * WHY: Prevent Redis memory bloat from old job records.
   */
  async cleanOldJobs(maxAge: number = 3600000, limit: number = 1000): Promise<void> {
    await Promise.all([
      graphGenerationQueue.clean(maxAge, limit, 'completed'),
      graphGenerationQueue.clean(maxAge * 24, limit, 'failed'), // Keep failed longer
    ]);

    logger.info('Old jobs cleaned', { maxAge, limit });
  }

  // ============================================================
  // VALIDATION
  // ============================================================

  /**
   * Validate graph generation job data
   * WHY: Catch invalid data before adding to queue
   */
  private validateGraphGenerationData(data: GraphGenerationJobData): void {
    if (!data.documentText || data.documentText.trim().length === 0) {
      throw new Error('Document text is required');
    }

    if (data.documentText.length < 100) {
      throw new Error('Document text too short (minimum 100 characters)');
    }

    if (!data.documentTitle || data.documentTitle.trim().length === 0) {
      throw new Error('Document title is required');
    }

    if (data.maxNodes !== undefined && (data.maxNodes < 3 || data.maxNodes > 50)) {
      throw new Error('maxNodes must be between 3 and 50');
    }
  }
}

// ============================================================
// SINGLETON INSTANCE
// ============================================================

/**
 * Export singleton instance
 * WHY: Single instance ensures consistent queue access across application
 */
export const queueService = new QueueService();

/**
 * Type alias for progress updates in GraphGeneratorService
 * WHY: Enables compatibility between service progress and job progress
 */
type GraphGenerationProgress = {
  stage: 'estimating' | 'chunking' | 'generating' | 'merging' | 'validating' | 'saving' | 'complete';
  percentage: number;
  message: string;
  chunksProcessed?: number;
  totalChunks?: number;
  currentChunk?: number;
};

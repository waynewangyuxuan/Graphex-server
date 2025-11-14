/**
 * BullMQ Job Type Definitions
 *
 * Defines all job data structures, results, and progress types for background processing.
 * Uses discriminated unions for type safety across different job types.
 *
 * WHY: Type-safe job processing prevents runtime errors and improves developer experience.
 * Each job type has specific data requirements and result formats.
 *
 * @see META/Core/TECHNICAL.md Section 10 (Background Job System)
 */

// ============================================================
// BASE JOB INTERFACES
// ============================================================

/**
 * Base interface for all job data
 * Contains common fields required by all jobs
 */
export interface BaseJobData {
  /** Unique identifier for tracking across systems */
  requestId: string;

  /** User ID if available (nullable for MVP without auth) */
  userId?: string;

  /** Document ID for tracking and cost attribution */
  documentId?: string;

  /** Timestamp when job was created */
  timestamp: number;
}

/**
 * Base interface for all job results
 */
export interface BaseJobResult {
  /** Job completion timestamp */
  completedAt: number;

  /** Processing duration in milliseconds */
  processingTimeMs: number;

  /** Cost in USD for AI operations */
  cost?: number;
}

// ============================================================
// GRAPH GENERATION JOB
// ============================================================

/**
 * Input data for graph generation jobs
 *
 * Duration: 30s - 5min (depends on document size)
 * Priority: Medium
 * Retry: 3 attempts with exponential backoff
 */
export interface GraphGenerationJobData extends BaseJobData {
  type: 'graph-generation';

  /** Full document text to generate graph from */
  documentText: string;

  /** Document title for context */
  documentTitle: string;

  /** Maximum number of nodes in graph (default: 15) */
  maxNodes?: number;

  /** Skip cache for this generation */
  skipCache?: boolean;
}

/**
 * Result of successful graph generation
 */
export interface GraphGenerationJobResult extends BaseJobResult {
  /** Generated graph ID in database */
  graphId: string;

  /** Number of nodes in generated graph */
  nodeCount: number;

  /** Number of edges in generated graph */
  edgeCount: number;

  /** Number of nodes that were merged during deduplication */
  mergedNodes: number;

  /** Quality score (0-100) */
  qualityScore: number;

  /** Whether structure-based fallback was used */
  fallbackUsed: boolean;

  /** Model used for generation */
  model: string;

  /** Warnings during generation */
  warnings: string[];
}

/**
 * Progress updates for graph generation
 */
export interface GraphGenerationProgress {
  /** Current stage of processing */
  stage: 'estimating' | 'chunking' | 'generating' | 'merging' | 'validating' | 'saving' | 'complete';

  /** Percentage complete (0-100) */
  percentage: number;

  /** Human-readable message */
  message: string;

  /** Number of chunks processed (for generating stage) */
  chunksProcessed?: number;

  /** Total number of chunks */
  totalChunks?: number;

  /** Current mini-graph being processed */
  currentChunk?: number;
}

// ============================================================
// DOCUMENT PROCESSING JOB (Future)
// ============================================================

/**
 * Input data for document processing jobs
 *
 * Duration: 10s - 60s
 * Priority: High
 * Retry: 3 attempts
 */
export interface DocumentProcessingJobData extends BaseJobData {
  type: 'document-processing';

  /** Path to uploaded file */
  filePath: string;

  /** Original filename */
  fileName: string;

  /** File MIME type */
  mimeType: string;
}

/**
 * Result of document processing
 */
export interface DocumentProcessingJobResult extends BaseJobResult {
  /** Document ID in database */
  documentId: string;

  /** Extracted text length */
  textLength: number;

  /** Document title (extracted or from filename) */
  title: string;

  /** Whether extraction was successful */
  success: boolean;
}

// ============================================================
// QUIZ GENERATION JOB (Future)
// ============================================================

/**
 * Input data for quiz generation jobs
 *
 * Duration: 5s - 30s
 * Priority: Low
 * Retry: 2 attempts
 */
export interface QuizGenerationJobData extends BaseJobData {
  type: 'quiz-generation';

  /** Graph ID to generate quiz from */
  graphId: string;

  /** Number of questions to generate */
  questionCount: number;

  /** Difficulty level */
  difficulty: 'easy' | 'medium' | 'hard';
}

/**
 * Result of quiz generation
 */
export interface QuizGenerationJobResult extends BaseJobResult {
  /** Number of questions generated */
  questionCount: number;

  /** Question IDs in database */
  questionIds: string[];
}

// ============================================================
// CONNECTION EXPLANATION JOB (Future)
// ============================================================

/**
 * Input data for connection explanation jobs
 *
 * Duration: 3s - 10s
 * Priority: High
 * Retry: 3 attempts
 */
export interface ConnectionExplanationJobData extends BaseJobData {
  type: 'connection-explanation';

  /** Edge ID to explain */
  edgeId: string;

  /** User's hypothesis (optional) */
  userHypothesis?: string;
}

/**
 * Result of connection explanation
 */
export interface ConnectionExplanationJobResult extends BaseJobResult {
  /** Edge ID */
  edgeId: string;

  /** Generated explanation */
  explanation: string;

  /** Source citations */
  citations: string[];
}

// ============================================================
// DISCRIMINATED UNION TYPES
// ============================================================

/**
 * Union of all job data types
 * Discriminated by 'type' field for type-safe handling
 */
export type JobData =
  | GraphGenerationJobData
  | DocumentProcessingJobData
  | QuizGenerationJobData
  | ConnectionExplanationJobData;

/**
 * Union of all job result types
 */
export type JobResult =
  | GraphGenerationJobResult
  | DocumentProcessingJobResult
  | QuizGenerationJobResult
  | ConnectionExplanationJobResult;

/**
 * Union of all progress types
 */
export type JobProgress = GraphGenerationProgress; // Add more as needed

// ============================================================
// JOB STATUS AND METADATA
// ============================================================

/**
 * Job status information for API responses
 */
export interface JobStatus {
  /** Job ID */
  jobId: string;

  /** Current state */
  state: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';

  /** Progress information (if available) */
  progress?: JobProgress;

  /** Result (if completed) */
  result?: JobResult;

  /** Error information (if failed) */
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };

  /** When the job was created */
  createdAt: number;

  /** When the job was last updated */
  updatedAt: number;

  /** Number of retry attempts */
  attempts: number;

  /** Maximum attempts allowed */
  maxAttempts: number;

  /** Estimated completion time (if active) */
  estimatedCompletionTime?: number;
}

// ============================================================
// ERROR CLASSIFICATION
// ============================================================

/**
 * Error types for retry strategy determination
 */
export enum JobErrorType {
  /** Temporary network/API issues - RETRY */
  TRANSIENT = 'transient',

  /** Rate limits hit - RETRY with delay */
  RATE_LIMIT = 'rate_limit',

  /** AI service timeout - RETRY with extended timeout */
  TIMEOUT = 'timeout',

  /** Budget exceeded - DO NOT RETRY */
  BUDGET_EXCEEDED = 'budget_exceeded',

  /** Invalid input data - DO NOT RETRY */
  INVALID_INPUT = 'invalid_input',

  /** Validation failed - DO NOT RETRY */
  VALIDATION_FAILED = 'validation_failed',

  /** Database error - RETRY */
  DATABASE_ERROR = 'database_error',

  /** Unknown error - RETRY with caution */
  UNKNOWN = 'unknown',
}

/**
 * Classify an error for retry decision
 */
export function classifyJobError(error: Error): JobErrorType {
  const message = error.message.toLowerCase();

  // Budget errors - do not retry
  if (message.includes('budget') || message.includes('cost limit')) {
    return JobErrorType.BUDGET_EXCEEDED;
  }

  // Rate limit errors - retry with delay
  if (message.includes('rate limit') || message.includes('429')) {
    return JobErrorType.RATE_LIMIT;
  }

  // Timeout errors - retry with extended timeout
  if (message.includes('timeout') || message.includes('timed out')) {
    return JobErrorType.TIMEOUT;
  }

  // Validation errors - do not retry
  if (message.includes('validation') || message.includes('invalid')) {
    return JobErrorType.VALIDATION_FAILED;
  }

  // Input errors - do not retry
  if (message.includes('empty') || message.includes('missing')) {
    return JobErrorType.INVALID_INPUT;
  }

  // Database errors - retry
  if (message.includes('database') || message.includes('prisma')) {
    return JobErrorType.DATABASE_ERROR;
  }

  // Network/connection errors - retry
  if (
    message.includes('network') ||
    message.includes('connection') ||
    message.includes('econnrefused') ||
    message.includes('fetch')
  ) {
    return JobErrorType.TRANSIENT;
  }

  return JobErrorType.UNKNOWN;
}

/**
 * Determine if an error should trigger a retry
 */
export function shouldRetryError(errorType: JobErrorType): boolean {
  switch (errorType) {
    case JobErrorType.TRANSIENT:
    case JobErrorType.RATE_LIMIT:
    case JobErrorType.TIMEOUT:
    case JobErrorType.DATABASE_ERROR:
    case JobErrorType.UNKNOWN:
      return true;

    case JobErrorType.BUDGET_EXCEEDED:
    case JobErrorType.INVALID_INPUT:
    case JobErrorType.VALIDATION_FAILED:
      return false;
  }
}

/**
 * Calculate retry delay based on error type and attempt number
 */
export function calculateRetryDelay(errorType: JobErrorType, attempt: number): number {
  const baseDelay = 1000; // 1 second
  const maxDelay = 300000; // 5 minutes
  const jitter = Math.random() * 1000; // 0-1s random jitter

  switch (errorType) {
    case JobErrorType.RATE_LIMIT:
      // Longer delays for rate limits: 5s, 10s, 20s
      return Math.min(maxDelay, baseDelay * 5 * Math.pow(2, attempt - 1) + jitter);

    case JobErrorType.TIMEOUT:
      // Medium delays for timeouts: 2s, 4s, 8s
      return Math.min(maxDelay, baseDelay * 2 * Math.pow(2, attempt - 1) + jitter);

    case JobErrorType.TRANSIENT:
    case JobErrorType.DATABASE_ERROR:
    case JobErrorType.UNKNOWN:
    default:
      // Standard exponential backoff: 1s, 2s, 4s, 8s
      return Math.min(maxDelay, baseDelay * Math.pow(2, attempt - 1) + jitter);
  }
}

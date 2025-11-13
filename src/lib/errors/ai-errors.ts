/**
 * AI Orchestration Error Classes
 *
 * Specialized error types for AI operations including validation failures,
 * budget limits, timeouts, and model unavailability.
 *
 * WHY: Specific error types enable precise error handling, retry logic,
 * and user-friendly error messages in the orchestration layer.
 */

/**
 * Base error for all AI orchestration failures
 */
export class AIOrchestrationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'AIOrchestrationError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Thrown when AI output fails validation after max retries
 *
 * This is the most common AI failure mode - the AI generates output
 * that doesn't meet quality standards even after multiple attempts.
 */
export class AIValidationError extends AIOrchestrationError {
  constructor(
    message: string,
    public readonly validationDetails: {
      /** Number of attempts made */
      attempts: number;

      /** Validation feedback from each attempt */
      feedback: string[];

      /** Last error encountered (if any) */
      lastError?: Error;

      /** Quality scores from each attempt */
      qualityScores?: number[];
    }
  ) {
    super(message, 'AI_VALIDATION_FAILED', validationDetails);
    this.name = 'AIValidationError';
  }
}

/**
 * Thrown when budget/cost limits are exceeded
 *
 * Prevents runaway AI costs by blocking operations that would
 * exceed user or system budget limits.
 */
export class BudgetExceededError extends AIOrchestrationError {
  constructor(
    reason: string,
    public readonly budgetInfo?: {
      /** Estimated cost for blocked operation */
      estimatedCost?: number;

      /** Current usage today */
      usageToday?: number;

      /** Current usage this month */
      usageThisMonth?: number;

      /** Limit that was exceeded */
      limitType?: 'daily' | 'monthly' | 'per-document';

      /** When limit resets */
      resetAt?: Date;
    }
  ) {
    super(`Budget exceeded: ${reason}`, 'BUDGET_EXCEEDED', budgetInfo);
    this.name = 'BudgetExceededError';
  }
}

/**
 * Thrown when AI request times out
 *
 * AI APIs can be slow, especially for complex tasks. Timeouts prevent
 * hanging requests and allow for retries or fallbacks.
 */
export class AITimeoutError extends AIOrchestrationError {
  constructor(
    model: string,
    timeoutMs: number,
    public readonly requestDetails?: {
      /** Prompt type that timed out */
      promptType?: string;

      /** Context size (tokens) */
      contextSize?: number;
    }
  ) {
    super(
      `AI request timed out after ${timeoutMs}ms (model: ${model})`,
      'AI_TIMEOUT',
      { model, timeoutMs, ...requestDetails }
    );
    this.name = 'AITimeoutError';
  }
}

/**
 * Thrown when AI model is unavailable or returns error
 *
 * AI providers can experience outages, rate limiting, or maintenance.
 * This error triggers fallback to alternative models.
 */
export class AIModelUnavailableError extends AIOrchestrationError {
  constructor(
    model: string,
    public readonly providerError?: {
      /** HTTP status code from provider */
      statusCode?: number;

      /** Error code from provider */
      errorCode?: string;

      /** Error message from provider */
      message?: string;

      /** Whether error is retryable */
      retryable?: boolean;
    }
  ) {
    super(
      `AI model unavailable: ${model}${providerError?.message ? ` - ${providerError.message}` : ''}`,
      'MODEL_UNAVAILABLE',
      { model, ...providerError }
    );
    this.name = 'AIModelUnavailableError';
  }
}

/**
 * Thrown when rate limit is hit
 *
 * AI providers have rate limits. This error triggers exponential backoff
 * and retry logic.
 */
export class AIRateLimitError extends AIOrchestrationError {
  constructor(
    model: string,
    public readonly rateLimitInfo?: {
      /** How long to wait before retry (ms) */
      retryAfterMs?: number;

      /** Requests remaining (if known) */
      remaining?: number;

      /** When limit resets */
      resetAt?: Date;
    }
  ) {
    super(
      `Rate limit exceeded for ${model}`,
      'RATE_LIMIT_EXCEEDED',
      { model, ...rateLimitInfo }
    );
    this.name = 'AIRateLimitError';
  }
}

/**
 * Thrown when AI response cannot be parsed
 *
 * AI sometimes returns malformed JSON or unexpected formats.
 * This error triggers retry with clearer format instructions.
 */
export class AIParseError extends AIOrchestrationError {
  constructor(
    message: string,
    public readonly parseDetails: {
      /** Raw content that failed to parse */
      rawContent?: string;

      /** Expected format */
      expectedFormat?: string;

      /** Parse error message */
      parseError?: string;
    }
  ) {
    super(message, 'PARSE_ERROR', parseDetails);
    this.name = 'AIParseError';
  }
}

/**
 * Thrown when prompt template is invalid or missing
 */
export class PromptTemplateError extends AIOrchestrationError {
  constructor(
    message: string,
    public readonly templateDetails: {
      /** Prompt type requested */
      promptType?: string;

      /** Version requested */
      version?: string;

      /** Missing context fields */
      missingFields?: string[];
    }
  ) {
    super(message, 'PROMPT_TEMPLATE_ERROR', templateDetails);
    this.name = 'PromptTemplateError';
  }
}

/**
 * Thrown when caching operation fails
 *
 * Cache failures should not break the main flow, but we track them
 * for monitoring and degradation handling.
 */
export class CacheOperationError extends AIOrchestrationError {
  constructor(
    operation: 'get' | 'set' | 'delete',
    error: Error,
    public readonly cacheDetails?: {
      /** Cache key that failed */
      key?: string;

      /** Cache backend (redis, memory, etc.) */
      backend?: string;
    }
  ) {
    super(
      `Cache ${operation} failed: ${error.message}`,
      'CACHE_ERROR',
      { operation, ...cacheDetails, originalError: error }
    );
    this.name = 'CacheOperationError';
  }
}

/**
 * Type guard to check if error is retryable
 *
 * WHY: Some errors should trigger retry (rate limits, timeouts),
 * while others should fail immediately (validation, budget).
 */
export function isRetryableError(error: Error): boolean {
  if (error instanceof AIRateLimitError) {
    return true;
  }

  if (error instanceof AITimeoutError) {
    return true;
  }

  if (error instanceof AIModelUnavailableError) {
    return error.providerError?.retryable !== false;
  }

  if (error instanceof AIParseError) {
    return true; // Retry with better format instructions
  }

  // Validation and budget errors are NOT retryable
  if (error instanceof AIValidationError) {
    return false;
  }

  if (error instanceof BudgetExceededError) {
    return false;
  }

  return false;
}

/**
 * Extract retry delay from error
 *
 * WHY: Rate limit errors often include suggested retry delay.
 * We respect these hints to avoid additional rate limiting.
 */
export function getRetryDelayMs(error: Error, attemptNumber: number): number {
  if (error instanceof AIRateLimitError && error.rateLimitInfo?.retryAfterMs) {
    return error.rateLimitInfo.retryAfterMs;
  }

  // Exponential backoff: 1s, 2s, 4s, 8s
  return Math.min(1000 * Math.pow(2, attemptNumber - 1), 8000);
}

/**
 * Format error for user display
 *
 * WHY: Internal errors need to be translated to user-friendly messages
 * without exposing system details.
 */
export function formatErrorForUser(error: Error): {
  message: string;
  userAction?: string;
  technicalDetails?: string;
} {
  if (error instanceof BudgetExceededError) {
    return {
      message: 'You have reached your usage limit for today.',
      userAction: error.budgetInfo?.resetAt
        ? `Your limit will reset at ${error.budgetInfo.resetAt.toLocaleString()}`
        : 'Consider upgrading to a premium plan for higher limits.',
      technicalDetails: error.message,
    };
  }

  if (error instanceof AIValidationError) {
    return {
      message: 'We were unable to generate a valid result after multiple attempts.',
      userAction: 'Try uploading a different document or contact support if the issue persists.',
      technicalDetails: `${error.validationDetails.attempts} attempts, feedback: ${error.validationDetails.feedback.join('; ')}`,
    };
  }

  if (error instanceof AITimeoutError) {
    return {
      message: 'The request took too long to process.',
      userAction: 'Try again with a smaller document or wait a few minutes.',
      technicalDetails: error.message,
    };
  }

  if (error instanceof AIModelUnavailableError) {
    return {
      message: 'Our AI service is temporarily unavailable.',
      userAction: 'Please try again in a few minutes.',
      technicalDetails: error.providerError?.message || error.message,
    };
  }

  if (error instanceof AIRateLimitError) {
    return {
      message: 'Too many requests. Please wait a moment.',
      userAction: error.rateLimitInfo?.resetAt
        ? `You can try again after ${error.rateLimitInfo.resetAt.toLocaleString()}`
        : 'Wait a few seconds before trying again.',
      technicalDetails: error.message,
    };
  }

  // Generic error
  return {
    message: 'An unexpected error occurred while processing your request.',
    userAction: 'Please try again. If the issue persists, contact support.',
    technicalDetails: error.message,
  };
}

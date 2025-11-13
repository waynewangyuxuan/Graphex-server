/**
 * Type definitions for AI Orchestration System
 *
 * Defines interfaces for AI requests, responses, configuration, and metadata
 * used throughout the AI orchestration pipeline.
 *
 * WHY: Centralized type definitions ensure consistency across all AI operations
 * and enable type-safe validation, retry logic, and cost tracking.
 */

import { PromptType, PromptContext, PromptVersion } from './prompt.types';
import { ValidationResult } from './validation.types';

/**
 * AI request configuration
 *
 * Controls behavior of AI orchestration including retries, quality thresholds,
 * cost limits, and model selection.
 */
export interface AIRequestConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;

  /** Minimum quality score to accept (0-100, default: 60) */
  qualityThreshold?: number;

  /** Maximum cost for this request in USD (optional budget override) */
  maxCost?: number;

  /** Prompt version to use (default: 'production') */
  promptVersion?: PromptVersion;

  /** Request timeout in milliseconds (default: 30000) */
  timeoutMs?: number;

  /** Override automatic model selection */
  preferredModel?: string;

  /** User ID for cost tracking and personalization */
  userId?: string;

  /** Document ID for document-level cost limits */
  documentId?: string;
}

/**
 * AI request structure
 *
 * Complete request package for AI orchestration containing prompt type,
 * context data, and configuration options.
 */
export interface AIRequest {
  /** Type of prompt to execute */
  promptType: PromptType;

  /** Context data for prompt variable injection */
  context: PromptContext;

  /** Optional configuration overrides */
  config?: AIRequestConfig;
}

/**
 * Token usage breakdown
 */
export interface TokenUsage {
  /** Input tokens (system prompt + user prompt) */
  input: number;

  /** Output tokens (AI response) */
  output: number;

  /** Total tokens (input + output) */
  total: number;
}

/**
 * AI response metadata
 *
 * Metadata about AI request execution including tokens, cost, performance,
 * and quality metrics.
 */
export interface AIResponseMetadata {
  /** Token usage breakdown */
  tokensUsed: TokenUsage;

  /** Cost in USD */
  cost: number;

  /** Whether response came from cache */
  cached: boolean;

  /** Total processing time in milliseconds */
  processingTime: number;

  /** Number of attempts made (1 = success on first try) */
  attempts: number;

  /** Whether validation passed */
  validationPassed: boolean;

  /** Prompt version used */
  promptVersion: string;

  /** Model that generated the response */
  model: string;

  /** Timestamp when request started */
  timestamp: Date;
}

/**
 * AI response structure
 *
 * Complete response from AI orchestration including parsed data,
 * quality validation results, and execution metadata.
 */
export interface AIResponse<T = any> {
  /** Parsed and validated AI output */
  data: T;

  /** Model used to generate response */
  model: string;

  /** Validation result with quality score and issues */
  quality: ValidationResult;

  /** Execution metadata */
  metadata: AIResponseMetadata;
}

/**
 * Model configuration
 *
 * Defines capabilities and pricing for an AI model.
 */
export interface ModelConfig {
  /** Model identifier */
  name: string;

  /** AI provider */
  provider: 'anthropic' | 'openai';

  /** Maximum output tokens */
  maxTokens: number;

  /** Temperature for response randomness (0-1) */
  temperature: number;

  /** Pricing information per 1M tokens */
  pricing: {
    /** Cost per 1M input tokens (USD) */
    input: number;

    /** Cost per 1M output tokens (USD) */
    output: number;
  };

  /** Whether model supports vision/multimodal input */
  supportsVision?: boolean;
}

/**
 * Raw AI response from provider
 *
 * Unparsed response from AI API before validation and processing.
 */
export interface AIRawResponse {
  /** Raw response content string */
  content: string;

  /** Model that generated the response */
  model: string;

  /** Token usage from API */
  usage: {
    /** Input tokens consumed */
    inputTokens: number;

    /** Output tokens generated */
    outputTokens: number;

    /** Total tokens */
    totalTokens: number;
  };

  /** API finish reason (stop, length, error, etc.) */
  finishReason: string;

  /** Processing time in milliseconds */
  processingTime: number;
}

/**
 * Budget check result from cost tracker
 */
export interface BudgetCheck {
  /** Whether operation is allowed within budget */
  allowed: boolean;

  /** Reason for denial if not allowed */
  reason?: string;

  /** Estimated cost for the operation */
  estimatedCost?: number;

  /** Current usage context */
  currentUsage?: {
    today: number;
    thisMonth: number;
  };
}

/**
 * Model fallback configuration
 *
 * Defines cascade of models to try if primary fails.
 */
export interface ModelFallbackChain {
  /** Primary model to try first */
  primary: string;

  /** Secondary model if primary fails */
  secondary: string;

  /** Tertiary fallback (different provider) */
  tertiary: string;
}

/**
 * AI client configuration
 */
export interface AIClientConfig {
  /** Anthropic API key */
  anthropicApiKey: string;

  /** OpenAI API key */
  openaiApiKey: string;

  /** Default timeout for all requests (ms) */
  defaultTimeout: number;

  /** Enable request logging */
  enableLogging: boolean;
}

/**
 * Cache key generation input
 */
export interface CacheKeyInput {
  /** Prompt type */
  promptType: PromptType;

  /** Context data (will be hashed) */
  context: PromptContext;

  /** Model used */
  model: string;

  /** Prompt version */
  version: PromptVersion;
}

/**
 * Cached AI result
 */
export interface CachedResult<T = any> {
  /** Cached data */
  data: T;

  /** When it was cached */
  cachedAt: Date;

  /** Original quality score */
  qualityScore: number;

  /** Model that generated it */
  model: string;
}

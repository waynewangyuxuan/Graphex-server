/**
 * Type definitions for Prompt Manager system
 *
 * Provides centralized prompt template management with versioning,
 * context injection, and performance tracking for continuous improvement.
 */

/**
 * Supported prompt types for AI operations
 */
export type PromptType =
  | 'graph-generation'
  | 'connection-explanation'
  | 'quiz-generation'
  | 'image-description'
  | 'node-deduplication';

/**
 * Prompt version for A/B testing and staged rollouts
 *
 * - production: Stable, proven prompts
 * - staging: Being tested, may promote to production
 * - experimental: Research/testing, not for production use
 */
export type PromptVersion = 'production' | 'staging' | 'experimental';

/**
 * Prompt template definition with metadata and performance stats
 */
export interface PromptTemplate {
  /** Unique identifier for this template */
  id: string;

  /** Type of AI operation this prompt supports */
  type: PromptType;

  /** Version designation */
  version: PromptVersion;

  /** Main prompt template with {{variable}} placeholders */
  template: string;

  /** Optional system prompt to set AI behavior context */
  systemPrompt?: string;

  /** Template metadata for documentation and validation */
  metadata: {
    /** Template author/creator */
    author: string;

    /** Creation timestamp */
    created: Date;

    /** Description of what this prompt does */
    description: string;

    /** Required context field names for validation */
    requiredContext: string[];

    /** Optional context fields that enhance quality */
    optionalContext?: string[];

    /** Constraints and expectations for AI output */
    constraints?: {
      /** Minimum/maximum values for generated content */
      nodeCount?: { min: number; max: number };
      questionCount?: { min: number; max: number };
      maxTokens?: number;
    };
  };

  /**
   * Performance metrics (populated over time from actual usage)
   * Used for A/B testing and continuous improvement
   */
  stats?: PromptPerformanceStats;
}

/**
 * Performance statistics for a prompt template version
 */
export interface PromptPerformanceStats {
  /** Total number of times this prompt was used */
  totalUses: number;

  /** Percentage of requests that passed validation (0-100) */
  successRate: number;

  /** Average quality score from AI output validator (0-100) */
  avgQualityScore: number;

  /** Average cost per request in USD */
  avgCost: number;

  /** Average number of retries needed (1.0 = no retries) */
  avgRetries: number;

  /** Last updated timestamp */
  lastUpdated: Date;
}

/**
 * Context data for prompt template variable substitution
 *
 * Contains all dynamic data needed to build a specific prompt instance.
 * Specific prompt types require specific context fields.
 */
export interface PromptContext {
  /** Generic key-value pairs for custom context */
  [key: string]: any;

  // Common context fields across prompt types
  /** Full document text (for graph-generation) */
  documentText?: string;

  /** Document title */
  documentTitle?: string;

  /** Complete graph structure (for quiz-generation) */
  graphData?: any;

  /** First node in a relationship (for connection-explanation) */
  nodeA?: any;

  /** Second node in a relationship (for connection-explanation) */
  nodeB?: any;

  /** Type of relationship between nodes */
  relationship?: string;

  /** User's hypothesis about connection (for connection-explanation) */
  userHypothesis?: string;

  /** Image data for vision AI (for image-description) */
  imageData?: string | Buffer;

  /** Image context (caption, page number, etc.) */
  imageContext?: {
    caption?: string;
    pageNumber?: number;
    position?: { x: number; y: number; width: number; height: number };
  };

  /** User ID for tracking and personalization */
  userId?: string;

  /** Previous validation errors (for retry with feedback) */
  validationFeedback?: string[];
}

/**
 * Built prompt ready for AI API call
 *
 * Result of template + context injection, validated and ready to send.
 */
export interface BuiltPrompt {
  /** System prompt to set AI behavior/context */
  systemPrompt: string;

  /** User prompt with all context variables injected */
  userPrompt: string;

  /** Metadata about prompt construction */
  metadata: {
    /** Source template ID */
    templateId: string;

    /** Template version used */
    version: PromptVersion;

    /** Context keys that were injected */
    contextKeys: string[];

    /** Estimated token count for cost prediction */
    estimatedTokens?: number;

    /** Timestamp when prompt was built */
    timestamp: Date;
  };
}

/**
 * Outcome data for tracking prompt performance
 */
export interface PromptOutcome {
  /** Quality score from validator (0-100) */
  qualityScore: number;

  /** Actual cost incurred */
  cost: number;

  /** Whether request succeeded */
  success: boolean;

  /** Number of retry attempts needed */
  retries: number;

  /** Processing time in milliseconds */
  processingTimeMs?: number;

  /** Model used (claude-sonnet-4, claude-haiku, etc.) */
  model?: string;

  /** Specific validation issues encountered */
  validationIssues?: string[];
}

/**
 * Model recommendation result
 */
export interface ModelRecommendation {
  /** Recommended model ID */
  model: 'claude-haiku' | 'claude-sonnet-4' | 'gpt-4-turbo';

  /** Reason for this recommendation */
  reason: string;

  /** Estimated cost for this model */
  estimatedCost: number;

  /** Alternative models if primary unavailable */
  fallbacks: string[];
}

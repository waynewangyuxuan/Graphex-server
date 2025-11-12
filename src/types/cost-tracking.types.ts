/**
 * Cost Tracking Type Definitions
 *
 * Defines types for AI usage tracking, budget management, and cost analytics.
 * These types support the Cost Tracker Service in preventing financial overruns.
 */

/**
 * Budget check result
 *
 * Returned when checking if an operation is within budget limits.
 * Contains information about whether the operation is allowed and why.
 */
export interface BudgetCheckResult {
  /** Whether the operation is allowed within budget */
  allowed: boolean;

  /** Estimated cost for this operation in USD */
  estimatedCost: number;

  /** Current usage statistics */
  currentUsage: {
    /** Total spent today in USD */
    today: number;
    /** Total spent this month in USD */
    thisMonth: number;
  };

  /** Reason for denial (if not allowed) */
  reason?: 'daily-limit-exceeded' | 'monthly-limit-exceeded' | 'document-limit-exceeded';

  /** When the limit will reset (if exceeded) */
  resetAt?: Date;

  /** Suggested upgrade option (if limit exceeded) */
  upgradeOption?: string;
}

/**
 * Cost limits for different user tiers
 *
 * Defines maximum spending limits at different scopes.
 * These limits prevent uncontrolled AI costs.
 */
export interface CostLimits {
  /** Maximum cost per single document processing (USD) */
  perDocument: number;

  /** Maximum cost per user per day (USD) */
  perUserPerDay: number;

  /** Maximum cost per user per month (USD) */
  perUserPerMonth: number;
}

/**
 * Token usage breakdown
 *
 * Tracks input and output tokens separately for accurate cost calculation.
 */
export interface TokenUsage {
  /** Input tokens (prompt + context) */
  input: number;

  /** Output tokens (AI response) */
  output: number;
}

/**
 * Usage recording data
 *
 * Information recorded after an AI operation completes.
 * This data is stored in both database (persistent) and Redis (fast access).
 */
export interface UsageRecordData {
  /** User ID (nullable for MVP without auth) */
  userId?: string;

  /** Operation type (e.g., 'graph-generation', 'connection-explanation') */
  operation: string;

  /** AI model used (e.g., 'claude-sonnet-4') */
  model: string;

  /** Token usage breakdown */
  tokensUsed: TokenUsage;

  /** Calculated cost in USD */
  cost: number;

  /** Quality score (0-100) if applicable */
  quality?: number;

  /** Number of retry attempts made */
  attempts: number;

  /** Whether the operation succeeded */
  success: boolean;

  /** Related document ID (if applicable) */
  documentId?: string;

  /** Related graph ID (if applicable) */
  graphId?: string;
}

/**
 * Budget check request
 *
 * Parameters for checking if an operation is within budget.
 */
export interface BudgetCheckRequest {
  /** User ID (nullable for MVP) */
  userId?: string;

  /** Type of operation to perform */
  operation: AIOperation;

  /** Estimated token count (if known) */
  estimatedTokens?: number;

  /** Related document ID (for document-level limits) */
  documentId?: string;
}

/**
 * AI operation types
 *
 * Supported operations that consume AI resources.
 * Each operation has different cost characteristics.
 */
export type AIOperation =
  | 'graph-generation'
  | 'connection-explanation'
  | 'quiz-generation'
  | 'image-description'
  | 'node-description';

/**
 * Usage summary statistics
 *
 * Aggregated usage data for reporting and analytics.
 */
export interface UsageSummary {
  /** Total cost in USD */
  totalCost: number;

  /** Total tokens consumed (input + output) */
  totalTokens: number;

  /** Number of operations performed */
  operationCount: number;

  /** Average cost per operation in USD */
  averageCostPerOperation: number;

  /** Token breakdown if detailed is requested */
  tokenBreakdown?: {
    input: number;
    output: number;
  };
}

/**
 * Cost breakdown by operation type
 *
 * Shows which operations are consuming the most budget.
 */
export interface CostBreakdown {
  /** Operation type */
  operation: string;

  /** Total cost for this operation type in USD */
  totalCost: number;

  /** Number of times this operation was performed */
  count: number;

  /** Average cost per operation in USD */
  averageCost: number;

  /** Percentage of total cost */
  percentage: number;
}

/**
 * Cost alert/warning
 *
 * Sent to users when approaching or exceeding limits.
 */
export interface CostAlert {
  /** Type of alert */
  type: 'daily-threshold-warning' | 'monthly-threshold-warning' | 'limit-exceeded';

  /** Human-readable message */
  message: string;

  /** Remaining budget in USD */
  remaining: number;

  /** Current usage in USD */
  current: number;

  /** Limit that triggered the alert in USD */
  limit: number;

  /** Timestamp of alert */
  timestamp: Date;
}

/**
 * Operation cost estimate
 *
 * Estimated cost for a specific operation before execution.
 */
export interface OperationCostEstimate {
  /** Operation type */
  operation: AIOperation;

  /** Estimated cost in USD */
  estimatedCost: number;

  /** Estimated token usage */
  estimatedTokens: {
    input: number;
    output: number;
  };

  /** Model to be used */
  model: string;
}

/**
 * Time period for usage queries
 */
export type UsagePeriod = 'day' | 'week' | 'month' | 'year' | 'all-time';

/**
 * User usage context
 *
 * Current usage state for a user, cached in Redis for fast access.
 */
export interface UserUsageContext {
  /** User ID */
  userId: string;

  /** Usage for current day in USD */
  today: number;

  /** Usage for current month in USD */
  thisMonth: number;

  /** Number of operations today */
  operationsToday: number;

  /** Last operation timestamp */
  lastOperation?: Date;

  /** Cache timestamp */
  cachedAt: Date;
}

/**
 * AI pricing configuration
 *
 * Per-model pricing information for cost calculation.
 * Prices are per 1 million tokens.
 */
export interface ModelPricing {
  /** Cost per 1M input tokens in USD */
  input: number;

  /** Cost per 1M output tokens in USD */
  output: number;

  /** Additional per-image cost for vision models (if applicable) */
  imageBase?: number;
}

/**
 * Cost tracking configuration
 *
 * Configuration options for the cost tracking service.
 */
export interface CostTrackingConfig {
  /** Cost limits to enforce */
  limits: CostLimits;

  /** Whether to send alerts */
  enableAlerts: boolean;

  /** Threshold percentages for warnings (0-1) */
  warningThresholds: {
    daily: number; // Default: 0.8 (80%)
    monthly: number; // Default: 0.9 (90%)
  };

  /** Redis TTL for cached usage data (seconds) */
  cacheTTL: {
    usage: number; // Default: 3600 (1 hour)
    estimates: number; // Default: 300 (5 minutes)
  };
}

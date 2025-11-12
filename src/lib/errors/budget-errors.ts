/**
 * Budget and Cost Tracking Error Classes
 *
 * Custom error types for budget-related failures.
 * These errors help prevent financial overruns and provide clear user feedback.
 */

import { UserUsageContext } from '../../types/cost-tracking.types';

/**
 * Base class for all budget-related errors
 *
 * Why: Provides common structure for budget errors with detailed context
 */
export class BudgetError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, any>
  ) {
    super(message);
    this.name = 'BudgetError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Thrown when operation would exceed budget limits
 *
 * Why: Prevents financial overruns by blocking operations that exceed limits
 * This is the primary protection mechanism against uncontrolled AI costs.
 *
 * Example: User has spent $9.50 today, trying to run $1.00 operation with $10 daily limit
 */
export class BudgetExceededError extends BudgetError {
  public readonly reason: 'daily-limit-exceeded' | 'monthly-limit-exceeded' | 'document-limit-exceeded';
  public readonly currentUsage: UserUsageContext | { today: number; thisMonth: number };
  public readonly estimatedCost: number;
  public readonly limit: number;
  public readonly resetAt?: Date;

  constructor(
    reason: 'daily-limit-exceeded' | 'monthly-limit-exceeded' | 'document-limit-exceeded',
    currentUsage: UserUsageContext | { today: number; thisMonth: number },
    estimatedCost: number,
    limit: number,
    resetAt?: Date
  ) {
    const messages = {
      'daily-limit-exceeded': `Daily budget limit of $${limit.toFixed(2)} would be exceeded. Current usage: $${('today' in currentUsage ? currentUsage.today : 0).toFixed(2)}, estimated cost: $${estimatedCost.toFixed(2)}`,
      'monthly-limit-exceeded': `Monthly budget limit of $${limit.toFixed(2)} would be exceeded. Current usage: $${('thisMonth' in currentUsage ? currentUsage.thisMonth : 0).toFixed(2)}, estimated cost: $${estimatedCost.toFixed(2)}`,
      'document-limit-exceeded': `Document processing limit of $${limit.toFixed(2)} would be exceeded. Estimated cost: $${estimatedCost.toFixed(2)}`,
    };

    super(
      messages[reason],
      'BUDGET_EXCEEDED',
      {
        reason,
        currentUsage,
        estimatedCost,
        limit,
        resetAt,
      }
    );

    this.reason = reason;
    this.currentUsage = currentUsage;
    this.estimatedCost = estimatedCost;
    this.limit = limit;
    this.resetAt = resetAt;
    this.name = 'BudgetExceededError';
  }
}

/**
 * Thrown when cost tracking operation fails
 *
 * Why: Indicates infrastructure issues (Redis/DB down) that prevent cost tracking
 * These errors should trigger alerts because they could lead to uncontrolled spending.
 *
 * Example: Redis connection lost, cannot check current usage
 */
export class CostTrackingError extends BudgetError {
  public readonly operation: 'check-budget' | 'record-usage' | 'get-summary';
  public override readonly cause?: Error;

  constructor(
    message: string,
    operation: 'check-budget' | 'record-usage' | 'get-summary',
    cause?: Error
  ) {
    super(
      `Cost tracking failed during ${operation}: ${message}`,
      'COST_TRACKING_ERROR',
      {
        operation,
        cause: cause?.message,
      }
    );

    this.operation = operation;
    this.cause = cause;
    this.name = 'CostTrackingError';
  }
}

/**
 * Thrown when usage data is unavailable or corrupted
 *
 * Why: Indicates data integrity issues that could lead to incorrect budget decisions
 *
 * Example: Redis cache returns malformed usage data
 */
export class UsageDataError extends BudgetError {
  public readonly userId?: string;

  constructor(
    message: string,
    userId?: string,
    details?: Record<string, any>
  ) {
    super(
      `Usage data error: ${message}`,
      'USAGE_DATA_ERROR',
      {
        userId,
        ...details,
      }
    );

    this.userId = userId;
    this.name = 'UsageDataError';
  }
}

/**
 * Thrown when attempting to record invalid usage data
 *
 * Why: Ensures data quality in usage tracking
 * Invalid data could lead to incorrect cost calculations or budget decisions.
 *
 * Example: Negative cost, missing required fields, invalid operation type
 */
export class InvalidUsageDataError extends BudgetError {
  constructor(
    message: string,
    public readonly validationErrors: string[]
  ) {
    super(
      `Invalid usage data: ${message}`,
      'INVALID_USAGE_DATA',
      {
        validationErrors,
      }
    );
    this.name = 'InvalidUsageDataError';
  }
}

/**
 * Thrown when cost calculation fails
 *
 * Why: Indicates problems with pricing data or calculation logic
 *
 * Example: Unknown model, missing pricing information
 */
export class CostCalculationError extends BudgetError {
  constructor(
    message: string,
    public readonly model?: string,
    public readonly tokensUsed?: { input: number; output: number }
  ) {
    super(
      `Cost calculation failed: ${message}`,
      'COST_CALCULATION_ERROR',
      {
        model,
        tokensUsed,
      }
    );
    this.name = 'CostCalculationError';
  }
}

/**
 * Thrown when user has insufficient quota
 *
 * Why: Indicates user needs to upgrade or wait for quota reset
 * Different from BudgetExceededError - this is for pre-allocated quotas.
 *
 * Example: Free tier user has used all 10 daily documents
 */
export class InsufficientQuotaError extends BudgetError {
  constructor(
    public readonly quotaType: string,
    public readonly used: number,
    public readonly limit: number,
    public readonly resetAt?: Date
  ) {
    super(
      `Insufficient ${quotaType} quota. Used: ${used}/${limit}`,
      'INSUFFICIENT_QUOTA',
      {
        quotaType,
        used,
        limit,
        resetAt,
      }
    );
    this.name = 'InsufficientQuotaError';
  }
}

/**
 * Thrown when cost estimation is not possible
 *
 * Why: Cannot make budget decisions without cost estimate
 *
 * Example: Unknown operation type, missing required parameters
 */
export class CostEstimationError extends BudgetError {
  constructor(
    message: string,
    public readonly operation?: string,
    public readonly reason?: string
  ) {
    super(
      `Cannot estimate cost: ${message}`,
      'COST_ESTIMATION_ERROR',
      {
        operation,
        reason,
      }
    );
    this.name = 'CostEstimationError';
  }
}

/**
 * Check if an error is a budget-related error
 *
 * Why: Helper for error handling logic to identify budget errors
 *
 * @param error - Error to check
 * @returns true if error is a budget error
 */
export function isBudgetError(error: unknown): error is BudgetError {
  return error instanceof BudgetError;
}

/**
 * Check if an error indicates user hit a limit (actionable by user)
 *
 * Why: These errors should show upgrade prompts to users
 *
 * @param error - Error to check
 * @returns true if error indicates user limit
 */
export function isUserLimitError(error: unknown): boolean {
  return (
    error instanceof BudgetExceededError ||
    error instanceof InsufficientQuotaError
  );
}

/**
 * Check if an error indicates system/infrastructure issue
 *
 * Why: These errors should trigger alerts and use fallback logic
 *
 * @param error - Error to check
 * @returns true if error indicates infrastructure issue
 */
export function isInfrastructureError(error: unknown): boolean {
  return (
    error instanceof CostTrackingError ||
    error instanceof UsageDataError
  );
}

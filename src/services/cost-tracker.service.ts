/**
 * Cost Tracker Service
 *
 * CRITICAL SERVICE: Prevents financial disaster by tracking and limiting AI costs.
 *
 * Core responsibilities:
 * 1. Budget checks BEFORE expensive AI operations
 * 2. Cost tracking AFTER operations complete
 * 3. User-level usage tracking (daily/monthly limits)
 * 4. Real-time Redis caching for fast limit checks
 * 5. Database persistence for analytics
 * 6. Budget alerts and warnings
 *
 * Why this service is critical:
 * Without proper cost control, uncontrolled AI API usage could bankrupt the project.
 * This service is the primary defense against runaway costs.
 *
 * @see cost-tracking-META.md for detailed architecture and decision rationale
 */

import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { startOfDay, startOfMonth } from 'date-fns';
import {
  BudgetCheckRequest,
  BudgetCheckResult,
  UsageRecordData,
  UsageSummary,
  CostBreakdown,
  CostLimits,
  AIOperation,
  UserUsageContext,
  OperationCostEstimate,
  CostAlert,
  ModelPricing,
  CostTrackingConfig,
} from '../types/cost-tracking.types';
import {
  CostTrackingError,
  InvalidUsageDataError,
  CostCalculationError,
  CostEstimationError,
} from '../lib/errors/budget-errors';
import { logger } from '../utils/logger.util';

/**
 * Default cost limits (Free Tier)
 *
 * Why these specific limits:
 * - $5 per document: Prevents single large document from consuming daily budget
 * - $10 per day: Allows ~2-3 medium documents per day on free tier
 * - $50 per month: ~100-150 operations per month, suitable for personal use
 */
const DEFAULT_LIMITS: CostLimits = {
  perDocument: 5.0,
  perUserPerDay: 10.0,
  perUserPerMonth: 50.0,
};

/**
 * AI model pricing (per 1M tokens)
 *
 * Updated: November 2024 pricing
 * Source: Anthropic and OpenAI pricing pages
 */
const AI_PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-4': {
    input: 3.0, // $3 per 1M input tokens
    output: 15.0, // $15 per 1M output tokens
  },
  'claude-haiku': {
    input: 0.25,
    output: 1.25,
  },
  'gpt-4-turbo': {
    input: 10.0,
    output: 30.0,
  },
  'gpt-4-vision': {
    input: 10.0,
    output: 30.0,
    imageBase: 0.00765,
  },
};

/**
 * Token estimates for different operations
 *
 * Why: Need to estimate cost BEFORE operation for budget checks
 * These are conservative estimates based on typical usage patterns
 */
const OPERATION_TOKEN_ESTIMATES: Record<AIOperation, { input: number; output: number }> = {
  'graph-generation': { input: 12000, output: 3000 }, // Large prompt + context
  'connection-explanation': { input: 2400, output: 600 }, // Medium prompt
  'quiz-generation': { input: 4000, output: 1000 }, // Medium-large prompt
  'image-description': { input: 800, output: 200 }, // Small prompt
  'node-description': { input: 1600, output: 400 }, // Small-medium prompt
};

/**
 * Default configuration
 */
const DEFAULT_CONFIG: CostTrackingConfig = {
  limits: DEFAULT_LIMITS,
  enableAlerts: true,
  warningThresholds: {
    daily: 0.8, // Warn at 80% of daily limit
    monthly: 0.9, // Warn at 90% of monthly limit
  },
  cacheTTL: {
    usage: 3600, // 1 hour
    estimates: 300, // 5 minutes
  },
};

/**
 * Cost Tracker Service
 *
 * Singleton service that manages all cost tracking operations.
 */
export class CostTrackerService {
  private readonly config: CostTrackingConfig;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
    config: Partial<CostTrackingConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    logger.info('Cost Tracker Service initialized', {
      limits: this.config.limits,
      alertsEnabled: this.config.enableAlerts,
    });
  }

  /**
   * Check if operation is within budget
   *
   * CRITICAL: Always call this BEFORE expensive AI operations.
   * This prevents budget overruns by rejecting operations that would exceed limits.
   *
   * Why: Proactive budget enforcement prevents financial disasters
   *
   * @param request - Budget check request with operation details
   * @returns Budget check result indicating if operation is allowed
   * @throws CostTrackingError if check fails due to infrastructure issues
   *
   * @example
   * ```typescript
   * const check = await costTracker.checkBudget({
   *   userId: 'user123',
   *   operation: 'graph-generation',
   * });
   *
   * if (!check.allowed) {
   *   throw new BudgetExceededError(check.reason!, check.currentUsage, check.estimatedCost);
   * }
   * ```
   */
  async checkBudget(request: BudgetCheckRequest): Promise<BudgetCheckResult> {
    try {
      // 1. Estimate cost for operation
      const estimate = this.estimateCost(request.operation, request.estimatedTokens);

      // 2. Get current usage (from Redis cache for speed)
      const usage = await this.getUserUsage(request.userId);

      // 3. Check document-level limit (if applicable)
      if (request.documentId && estimate.estimatedCost > this.config.limits.perDocument) {
        return {
          allowed: false,
          reason: 'document-limit-exceeded',
          estimatedCost: estimate.estimatedCost,
          currentUsage: {
            today: usage.today,
            thisMonth: usage.thisMonth,
          },
          upgradeOption: 'premium-tier',
        };
      }

      // 4. Check daily limit
      if (usage.today + estimate.estimatedCost > this.config.limits.perUserPerDay) {
        return {
          allowed: false,
          reason: 'daily-limit-exceeded',
          estimatedCost: estimate.estimatedCost,
          currentUsage: {
            today: usage.today,
            thisMonth: usage.thisMonth,
          },
          resetAt: this.getNextDayReset(),
          upgradeOption: 'premium-tier',
        };
      }

      // 5. Check monthly limit
      if (usage.thisMonth + estimate.estimatedCost > this.config.limits.perUserPerMonth) {
        return {
          allowed: false,
          reason: 'monthly-limit-exceeded',
          estimatedCost: estimate.estimatedCost,
          currentUsage: {
            today: usage.today,
            thisMonth: usage.thisMonth,
          },
          resetAt: this.getNextMonthReset(),
          upgradeOption: 'premium-tier',
        };
      }

      // 6. Operation allowed
      logger.info('Budget check passed', {
        userId: request.userId,
        operation: request.operation,
        estimatedCost: estimate.estimatedCost,
        currentUsage: usage,
      });

      return {
        allowed: true,
        estimatedCost: estimate.estimatedCost,
        currentUsage: {
          today: usage.today,
          thisMonth: usage.thisMonth,
        },
      };
    } catch (error) {
      logger.error('Budget check failed', {
        error: (error as Error).message,
        request,
      });

      throw new CostTrackingError(
        'Failed to check budget',
        'check-budget',
        error as Error
      );
    }
  }

  /**
   * Record AI usage after operation completes
   *
   * CRITICAL: Always call this AFTER AI operations to track actual costs.
   * Records to both database (persistent) and Redis (fast access).
   *
   * Why dual storage:
   * - Redis: Fast access for real-time budget checks
   * - Database: Persistent storage for analytics and auditing
   *
   * @param data - Usage record data with actual tokens and costs
   * @throws InvalidUsageDataError if data is invalid
   * @throws CostTrackingError if recording fails
   */
  async recordUsage(data: UsageRecordData): Promise<void> {
    try {
      // 1. Validate usage data
      this.validateUsageData(data);

      // 2. Save to database (persistent)
      await this.prisma.aIUsage.create({
        data: {
          userId: data.userId,
          operation: data.operation,
          model: data.model,
          inputTokens: data.tokensUsed.input,
          outputTokens: data.tokensUsed.output,
          totalTokens: data.tokensUsed.input + data.tokensUsed.output,
          cost: data.cost,
          qualityScore: data.quality,
          attempts: data.attempts,
          success: data.success,
          documentId: data.documentId,
          graphId: data.graphId,
          timestamp: new Date(),
        },
      });

      // 3. Update Redis cache (real-time limits)
      await this.updateUsageCache(data);

      // 4. Check if approaching limits (send warning)
      if (this.config.enableAlerts && data.userId) {
        await this.checkThresholdsAndAlert(data.userId);
      }

      logger.info('Usage recorded', {
        userId: data.userId,
        operation: data.operation,
        cost: data.cost,
        success: data.success,
      });
    } catch (error) {
      logger.error('Failed to record usage', {
        error: (error as Error).message,
        data,
      });

      throw new CostTrackingError(
        'Failed to record usage',
        'record-usage',
        error as Error
      );
    }
  }

  /**
   * Get usage summary for user
   *
   * Retrieves aggregated usage statistics for a specific time period.
   * Useful for user dashboards and admin analytics.
   *
   * @param userId - User ID (required)
   * @param period - Time period ('day' | 'month')
   * @returns Aggregated usage summary
   */
  async getUserSummary(userId: string, period: 'day' | 'month'): Promise<UsageSummary> {
    try {
      const startDate = period === 'day' ? startOfDay(new Date()) : startOfMonth(new Date());

      const result = await this.prisma.aIUsage.aggregate({
        where: {
          userId,
          timestamp: { gte: startDate },
        },
        _sum: {
          cost: true,
          totalTokens: true,
          inputTokens: true,
          outputTokens: true,
        },
        _count: true,
      });

      return {
        totalCost: result._sum.cost || 0,
        totalTokens: result._sum.totalTokens || 0,
        operationCount: result._count,
        averageCostPerOperation: (result._sum.cost || 0) / (result._count || 1),
        tokenBreakdown: {
          input: result._sum.inputTokens || 0,
          output: result._sum.outputTokens || 0,
        },
      };
    } catch (error) {
      logger.error('Failed to get user summary', {
        error: (error as Error).message,
        userId,
        period,
      });

      throw new CostTrackingError(
        'Failed to get user summary',
        'get-summary',
        error as Error
      );
    }
  }

  /**
   * Get cost breakdown by operation type
   *
   * Shows which operations are consuming the most budget.
   * Useful for identifying optimization opportunities.
   *
   * @param userId - User ID
   * @param period - Time period
   * @returns Cost breakdown by operation
   */
  async getCostBreakdown(userId: string, period: 'day' | 'month' = 'month'): Promise<CostBreakdown[]> {
    try {
      const startDate = period === 'day' ? startOfDay(new Date()) : startOfMonth(new Date());

      const results = await this.prisma.aIUsage.groupBy({
        by: ['operation'],
        where: {
          userId,
          timestamp: { gte: startDate },
        },
        _sum: {
          cost: true,
        },
        _count: true,
      });

      // Calculate total for percentages
      const totalCost = results.reduce((sum: number, r: any) => sum + (r._sum.cost || 0), 0);

      return results.map((r: any) => ({
        operation: r.operation,
        totalCost: r._sum.cost || 0,
        count: r._count,
        averageCost: (r._sum.cost || 0) / r._count,
        percentage: totalCost > 0 ? ((r._sum.cost || 0) / totalCost) * 100 : 0,
      }));
    } catch (error) {
      logger.error('Failed to get cost breakdown', {
        error: (error as Error).message,
        userId,
        period,
      });

      throw new CostTrackingError(
        'Failed to get cost breakdown',
        'get-summary',
        error as Error
      );
    }
  }

  /**
   * Calculate cost from token usage
   *
   * Used to calculate actual cost after AI operation completes.
   *
   * Why separate from estimation: Actual token counts may differ from estimates
   *
   * @param tokensUsed - Actual tokens consumed
   * @param model - AI model used
   * @returns Cost in USD
   * @throws CostCalculationError if model pricing not found
   */
  calculateCost(tokensUsed: { input: number; output: number }, model: string): number {
    const pricing = AI_PRICING[model];

    if (!pricing) {
      throw new CostCalculationError(
        `Unknown model: ${model}`,
        model,
        tokensUsed
      );
    }

    const inputCost = (tokensUsed.input / 1_000_000) * pricing.input;
    const outputCost = (tokensUsed.output / 1_000_000) * pricing.output;

    return inputCost + outputCost;
  }

  /**
   * Estimate cost for operation BEFORE execution
   *
   * Uses conservative estimates to prevent underestimation.
   *
   * Why: Need cost estimate for budget checks before running expensive operations
   *
   * @param operation - Operation type
   * @param providedTokens - Optional token count override
   * @returns Cost estimate
   */
  private estimateCost(operation: AIOperation, providedTokens?: number): OperationCostEstimate {
    const tokenEstimate = OPERATION_TOKEN_ESTIMATES[operation];

    if (!tokenEstimate) {
      throw new CostEstimationError(
        `Unknown operation type: ${operation}`,
        operation
      );
    }

    // Use provided tokens or default estimate
    const estimatedTokens = providedTokens
      ? { input: Math.ceil(providedTokens * 0.8), output: Math.ceil(providedTokens * 0.2) }
      : tokenEstimate;

    // Assume Claude Sonnet 4 for cost estimation (our primary model)
    const model = 'claude-sonnet-4';
    const pricing = AI_PRICING[model];

    if (!pricing) {
      throw new CostEstimationError('Pricing not found for model', model);
    }

    const cost =
      (estimatedTokens.input / 1_000_000) * pricing.input +
      (estimatedTokens.output / 1_000_000) * pricing.output;

    return {
      operation,
      estimatedCost: cost,
      estimatedTokens,
      model,
    };
  }

  /**
   * Get user usage from cache or database
   *
   * Why Redis first: 1000x faster than database for real-time checks
   * Falls back to database if cache miss
   *
   * @param userId - User ID (optional for MVP)
   * @returns Current usage context
   */
  private async getUserUsage(userId?: string): Promise<UserUsageContext> {
    if (!userId) {
      // For MVP without auth, return zero usage
      return {
        userId: 'anonymous',
        today: 0,
        thisMonth: 0,
        operationsToday: 0,
        cachedAt: new Date(),
      };
    }

    try {
      // Try Redis cache first
      const cached = await this.getUserUsageFromCache(userId);
      if (cached) {
        return cached;
      }

      // Cache miss - query database
      const usage = await this.getUserUsageFromDatabase(userId);

      // Cache for future requests
      await this.cacheUserUsage(userId, usage);

      return usage;
    } catch (error) {
      logger.error('Failed to get user usage', {
        error: (error as Error).message,
        userId,
      });

      // Return zero usage on error to fail safe (allows operation)
      return {
        userId,
        today: 0,
        thisMonth: 0,
        operationsToday: 0,
        cachedAt: new Date(),
      };
    }
  }

  /**
   * Get usage from Redis cache
   */
  private async getUserUsageFromCache(userId: string): Promise<UserUsageContext | null> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const month = new Date().toISOString().slice(0, 7); // YYYY-MM

    const [todayUsage, monthUsage] = await Promise.all([
      this.redis.get(`usage:${userId}:${today}`),
      this.redis.get(`usage:${userId}:${month}`),
    ]);

    if (todayUsage !== null && monthUsage !== null) {
      return {
        userId,
        today: parseFloat(todayUsage),
        thisMonth: parseFloat(monthUsage),
        operationsToday: 0, // Not cached for simplicity
        cachedAt: new Date(),
      };
    }

    return null;
  }

  /**
   * Get usage from database
   */
  private async getUserUsageFromDatabase(userId: string): Promise<UserUsageContext> {
    const todayStart = startOfDay(new Date());
    const monthStart = startOfMonth(new Date());

    const [todayUsage, monthUsage] = await Promise.all([
      this.prisma.aIUsage.aggregate({
        where: { userId, timestamp: { gte: todayStart } },
        _sum: { cost: true },
        _count: true,
      }),
      this.prisma.aIUsage.aggregate({
        where: { userId, timestamp: { gte: monthStart } },
        _sum: { cost: true },
      }),
    ]);

    return {
      userId,
      today: todayUsage._sum.cost || 0,
      thisMonth: monthUsage._sum.cost || 0,
      operationsToday: todayUsage._count,
      cachedAt: new Date(),
    };
  }

  /**
   * Cache user usage in Redis
   */
  private async cacheUserUsage(userId: string, usage: UserUsageContext): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const month = new Date().toISOString().slice(0, 7);
    const ttl = this.config.cacheTTL.usage;

    await Promise.all([
      this.redis.setex(`usage:${userId}:${today}`, ttl, usage.today.toString()),
      this.redis.setex(`usage:${userId}:${month}`, ttl, usage.thisMonth.toString()),
    ]);
  }

  /**
   * Update usage cache after recording
   */
  private async updateUsageCache(data: UsageRecordData): Promise<void> {
    if (!data.userId) return;

    const today = new Date().toISOString().split('T')[0];
    const month = new Date().toISOString().slice(0, 7);

    await Promise.all([
      this.redis.incrbyfloat(`usage:${data.userId}:${today}`, data.cost),
      this.redis.incrbyfloat(`usage:${data.userId}:${month}`, data.cost),
    ]);
  }

  /**
   * Check thresholds and send alerts
   *
   * Sends warnings when users approach budget limits.
   * This gives users time to upgrade before hitting hard limits.
   */
  private async checkThresholdsAndAlert(userId: string): Promise<void> {
    const usage = await this.getUserUsage(userId);

    const alerts: CostAlert[] = [];

    // Check daily threshold (80%)
    const dailyThreshold = this.config.limits.perUserPerDay * this.config.warningThresholds.daily;
    if (usage.today > dailyThreshold && usage.today <= this.config.limits.perUserPerDay) {
      alerts.push({
        type: 'daily-threshold-warning',
        message: `You've used $${usage.today.toFixed(2)} of your $${this.config.limits.perUserPerDay} daily limit`,
        remaining: this.config.limits.perUserPerDay - usage.today,
        current: usage.today,
        limit: this.config.limits.perUserPerDay,
        timestamp: new Date(),
      });
    }

    // Check monthly threshold (90%)
    const monthlyThreshold = this.config.limits.perUserPerMonth * this.config.warningThresholds.monthly;
    if (usage.thisMonth > monthlyThreshold && usage.thisMonth <= this.config.limits.perUserPerMonth) {
      alerts.push({
        type: 'monthly-threshold-warning',
        message: `You've used $${usage.thisMonth.toFixed(2)} of your $${this.config.limits.perUserPerMonth} monthly limit`,
        remaining: this.config.limits.perUserPerMonth - usage.thisMonth,
        current: usage.thisMonth,
        limit: this.config.limits.perUserPerMonth,
        timestamp: new Date(),
      });
    }

    // Send alerts (would integrate with notification system)
    for (const alert of alerts) {
      logger.warn('Budget threshold warning', {
        userId,
        alert,
      });

      // TODO: Integrate with notification service when implemented
      // await this.notificationService.sendAlert(userId, alert);
    }
  }

  /**
   * Validate usage data before recording
   */
  private validateUsageData(data: UsageRecordData): void {
    const errors: string[] = [];

    if (data.cost < 0) {
      errors.push('Cost cannot be negative');
    }

    if (data.tokensUsed.input < 0 || data.tokensUsed.output < 0) {
      errors.push('Token counts cannot be negative');
    }

    if (!data.operation || data.operation.trim() === '') {
      errors.push('Operation type is required');
    }

    if (!data.model || data.model.trim() === '') {
      errors.push('Model is required');
    }

    if (data.attempts < 1) {
      errors.push('Attempts must be at least 1');
    }

    if (errors.length > 0) {
      throw new InvalidUsageDataError('Invalid usage data', errors);
    }
  }

  /**
   * Get next day reset time (midnight UTC)
   */
  private getNextDayReset(): Date {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    return tomorrow;
  }

  /**
   * Get next month reset time (first day of next month, midnight UTC)
   */
  private getNextMonthReset(): Date {
    const nextMonth = new Date();
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    nextMonth.setUTCDate(1);
    nextMonth.setUTCHours(0, 0, 0, 0);
    return nextMonth;
  }
}

/**
 * Singleton instance factory
 *
 * Why singleton: Cost tracker must use same Redis/Prisma connections throughout app
 *
 * @param prisma - Prisma client instance
 * @param redis - Redis client instance
 * @param config - Optional configuration overrides
 * @returns Cost tracker service instance
 */
export function createCostTrackerService(
  prisma: PrismaClient,
  redis: Redis,
  config?: Partial<CostTrackingConfig>
): CostTrackerService {
  return new CostTrackerService(prisma, redis, config);
}

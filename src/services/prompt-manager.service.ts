/**
 * Prompt Manager Service
 *
 * Centralized management of AI prompts with:
 * - Template retrieval and version control
 * - Dynamic context injection with validation
 * - Performance tracking for continuous improvement
 * - Model recommendation based on task complexity
 * - A/B testing support
 *
 * WHY: Separating prompt management from AI orchestration enables
 * data-driven prompt optimization and reduces coupling between
 * prompt design and AI API implementation.
 */

import Redis from 'ioredis';
import { Logger } from 'winston';
import {
  PromptType,
  PromptVersion,
  PromptContext,
  BuiltPrompt,
  PromptOutcome,
  PromptTemplate,
  ModelRecommendation,
  PromptPerformanceStats,
} from '../types/prompt.types';
import { getTemplate, getTemplateVersions } from '../lib/ai/prompt-templates';

/**
 * Configuration for prompt manager
 */
export interface PromptManagerConfig {
  /** Enable performance tracking */
  enableTracking: boolean;

  /** Redis key prefix for stats */
  statsKeyPrefix: string;

  /** Default prompt version if not specified */
  defaultVersion: PromptVersion;
}

const DEFAULT_CONFIG: PromptManagerConfig = {
  enableTracking: true,
  statsKeyPrefix: 'prompt:stats',
  defaultVersion: 'production',
};

/**
 * Prompt Manager Service
 */
export class PromptManagerService {
  private readonly config: PromptManagerConfig;

  constructor(
    private readonly redis: Redis,
    private readonly logger: Logger,
    config?: Partial<PromptManagerConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Build prompt from template with context injection
   *
   * Flow:
   * 1. Retrieve template
   * 2. Validate required context fields
   * 3. Inject context variables
   * 4. Estimate token count
   * 5. Return built prompt ready for AI API
   */
  async build(
    type: PromptType,
    context: PromptContext,
    version: PromptVersion = this.config.defaultVersion
  ): Promise<BuiltPrompt> {
    const startTime = Date.now();

    try {
      // 1. Get template
      const template = getTemplate(type, version);

      this.logger.debug('Building prompt', {
        templateId: template.id,
        type,
        version,
        contextKeys: Object.keys(context),
      });

      // 2. Validate required context
      this.validateContext(template, context);

      // 3. Inject context into template
      const userPrompt = this.injectContext(template.template, context);
      const systemPrompt = template.systemPrompt || this.getDefaultSystemPrompt();

      // 4. Estimate tokens for cost prediction
      const estimatedTokens = this.estimateTokens(systemPrompt, userPrompt);

      // 5. Build final prompt object
      const builtPrompt: BuiltPrompt = {
        systemPrompt,
        userPrompt,
        metadata: {
          templateId: template.id,
          version,
          contextKeys: Object.keys(context),
          estimatedTokens,
          timestamp: new Date(),
        },
      };

      this.logger.info('Prompt built successfully', {
        templateId: template.id,
        estimatedTokens,
        buildTimeMs: Date.now() - startTime,
      });

      return builtPrompt;
    } catch (error) {
      this.logger.error('Failed to build prompt', {
        type,
        version,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Record outcome for continuous improvement
   *
   * WHY: Tracking outcomes enables A/B testing and data-driven
   * prompt improvement. We can compare success rates and quality
   * scores across different prompt versions.
   */
  async recordOutcome(
    type: PromptType,
    version: PromptVersion,
    outcome: PromptOutcome
  ): Promise<void> {
    if (!this.config.enableTracking) {
      return;
    }

    try {
      const key = this.getStatsKey(type, version);

      // Get current stats
      const stats = await this.getStats(type, version);

      // Calculate new running averages
      const totalUses = stats.totalUses + 1;
      const successRate = this.calculateRunningAverage(
        stats.successRate,
        outcome.success ? 100 : 0,
        stats.totalUses,
        totalUses
      );
      const avgQualityScore = this.calculateRunningAverage(
        stats.avgQualityScore,
        outcome.qualityScore,
        stats.totalUses,
        totalUses
      );
      const avgCost = this.calculateRunningAverage(
        stats.avgCost,
        outcome.cost,
        stats.totalUses,
        totalUses
      );
      const avgRetries = this.calculateRunningAverage(
        stats.avgRetries,
        outcome.retries,
        stats.totalUses,
        totalUses
      );

      // Update stats in Redis
      const updatedStats: PromptPerformanceStats = {
        totalUses,
        successRate,
        avgQualityScore,
        avgCost,
        avgRetries,
        lastUpdated: new Date(),
      };

      await this.redis.set(key, JSON.stringify(updatedStats), 'EX', 60 * 60 * 24 * 30); // 30 day TTL

      this.logger.debug('Recorded prompt outcome', {
        type,
        version,
        totalUses,
        successRate: successRate.toFixed(2),
        avgQualityScore: avgQualityScore.toFixed(2),
      });
    } catch (error) {
      // Don't throw - tracking failures shouldn't break the main flow
      this.logger.warn('Failed to record prompt outcome', {
        type,
        version,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get performance statistics for a prompt version
   */
  async getStats(type: PromptType, version: PromptVersion): Promise<PromptPerformanceStats> {
    const key = this.getStatsKey(type, version);
    const data = await this.redis.get(key);

    if (!data) {
      // Return default stats for new templates
      return {
        totalUses: 0,
        successRate: 0,
        avgQualityScore: 0,
        avgCost: 0,
        avgRetries: 1,
        lastUpdated: new Date(),
      };
    }

    return JSON.parse(data);
  }

  /**
   * Get recommended model for prompt type and context
   *
   * WHY: Different tasks need different models. Graph generation
   * requires complex reasoning (Sonnet 4), while simple explanations
   * can use cheaper models (Haiku). Large documents also need better models.
   */
  getRecommendedModel(type: PromptType, context: PromptContext): ModelRecommendation {
    // Graph generation: Complex reasoning task
    if (type === 'graph-generation') {
      const docLength = context.documentText?.length || 0;

      // Large documents (>10k tokens ~40k chars) need better model
      if (docLength > 40000) {
        return {
          model: 'claude-sonnet-4',
          reason: 'Large document requires advanced reasoning and context handling',
          estimatedCost: this.estimateCostForModel('claude-sonnet-4', docLength * 1.5),
          fallbacks: ['claude-haiku', 'gpt-4-turbo'],
        };
      }

      // Medium documents can try Haiku first for cost savings
      return {
        model: 'claude-haiku',
        reason: 'Document size allows cost-effective model with quality recovery option',
        estimatedCost: this.estimateCostForModel('claude-haiku', docLength * 1.5),
        fallbacks: ['claude-sonnet-4', 'gpt-4-turbo'],
      };
    }

    // Image description: Needs vision capabilities
    if (type === 'image-description') {
      return {
        model: 'claude-sonnet-4',
        reason: 'Multimodal task requires vision-enabled model',
        estimatedCost: 0.015, // Typical image + description cost
        fallbacks: ['gpt-4-turbo'],
      };
    }

    // Connection explanation & quiz generation: Simple tasks
    return {
      model: 'claude-haiku',
      reason: 'Straightforward task suitable for fast, cost-effective model',
      estimatedCost: this.estimateCostForModel('claude-haiku', 2000),
      fallbacks: ['claude-sonnet-4', 'gpt-4-turbo'],
    };
  }

  /**
   * Compare performance of different prompt versions for A/B testing
   */
  async compareVersions(type: PromptType): Promise<{
    versions: Array<{
      version: PromptVersion;
      stats: PromptPerformanceStats;
      recommendation: 'use' | 'test' | 'retire';
    }>;
    bestVersion: PromptVersion;
  }> {
    const versions = getTemplateVersions(type);
    const results = await Promise.all(
      versions.map(async (template) => ({
        version: template.version,
        stats: await this.getStats(type, template.version),
        recommendation: this.recommendVersionAction(await this.getStats(type, template.version)),
      }))
    );

    // Find best version based on composite score
    const bestVersion = results.reduce((best, current) => {
      const bestScore = this.calculateCompositeScore(best.stats);
      const currentScore = this.calculateCompositeScore(current.stats);
      return currentScore > bestScore ? current : best;
    }).version;

    return {
      versions: results,
      bestVersion,
    };
  }

  // ============================================================
  // PRIVATE HELPER METHODS
  // ============================================================

  /**
   * Validate that all required context fields are present
   */
  private validateContext(template: PromptTemplate, context: PromptContext): void {
    const missing = template.metadata.requiredContext.filter((field) => !(field in context));

    if (missing.length > 0) {
      throw new Error(
        `Missing required context fields for ${template.id}: ${missing.join(', ')}`
      );
    }

    // Warn about missing optional context
    const missingOptional =
      template.metadata.optionalContext?.filter((field) => !(field in context)) || [];

    if (missingOptional.length > 0) {
      this.logger.debug('Optional context fields missing', {
        templateId: template.id,
        missing: missingOptional,
      });
    }
  }

  /**
   * Inject context values into template string
   *
   * Supports:
   * - Simple variables: {{variableName}}
   * - Nested properties: {{object.property}}
   * - Conditional blocks: {{#if variable}}...{{/if}}
   */
  private injectContext(template: string, context: PromptContext): string {
    let result = template;

    // First, handle nested property access: {{object.property}}
    result = result.replace(/{{([a-zA-Z0-9_.]+)}}/g, (match, path) => {
      const value = this.getNestedValue(context, path);
      return this.formatContextValue(value);
    });

    // Handle conditional blocks: {{#if variable}}...{{/if}}
    result = this.processConditionals(result, context);

    return result;
  }

  /**
   * Get nested value from object using dot notation
   * Example: getNestedValue({nodeA: {title: 'Test'}}, 'nodeA.title') => 'Test'
   */
  private getNestedValue(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === undefined || current === null) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  /**
   * Process conditional template blocks
   */
  private processConditionals(template: string, context: PromptContext): string {
    // Match {{#if variable}}...{{/if}} blocks
    const conditionalRegex = /{{#if\s+([\w.]+)}}([\s\S]*?){{\/if}}/g;

    return template.replace(conditionalRegex, (match, variable, content) => {
      // Check if variable exists and is truthy (supports nested paths)
      const value = this.getNestedValue(context, variable);
      if (value) {
        // Process nested variables in content (but don't recurse conditionals)
        return content.replace(/{{([a-zA-Z0-9_.]+)}}/g, (innerMatch, path) => {
          const innerValue = this.getNestedValue(context, path);
          return this.formatContextValue(innerValue);
        });
      }
      return ''; // Remove block if condition false
    });
  }

  /**
   * Format context value for template injection
   */
  private formatContextValue(value: any): string {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (typeof value === 'object' && value !== null) {
      // For objects, return JSON representation
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  }

  /**
   * Get default system prompt for cases where template doesn't specify one
   */
  private getDefaultSystemPrompt(): string {
    return `You are an AI assistant specializing in educational content analysis and knowledge graph generation. Provide accurate, well-structured responses based strictly on the provided content.`;
  }

  /**
   * Estimate token count for cost prediction
   *
   * Simple heuristic: ~4 characters per token for English text.
   * For production, could use tiktoken library for accurate counting.
   */
  private estimateTokens(...texts: string[]): number {
    const totalChars = texts.reduce((sum, text) => sum + text.length, 0);
    return Math.ceil(totalChars / 4);
  }

  /**
   * Estimate cost for a specific model and token count
   */
  private estimateCostForModel(
    model: 'claude-haiku' | 'claude-sonnet-4' | 'gpt-4-turbo',
    estimatedTokens: number
  ): number {
    const rates = {
      'claude-haiku': {
        input: 0.25 / 1_000_000,
        output: 1.25 / 1_000_000,
      },
      'claude-sonnet-4': {
        input: 3.0 / 1_000_000,
        output: 15.0 / 1_000_000,
      },
      'gpt-4-turbo': {
        input: 10.0 / 1_000_000,
        output: 30.0 / 1_000_000,
      },
    };

    const rate = rates[model];
    // Assume 2:1 input:output ratio for estimation
    const inputTokens = Math.floor(estimatedTokens * 0.67);
    const outputTokens = Math.floor(estimatedTokens * 0.33);

    return inputTokens * rate.input + outputTokens * rate.output;
  }

  /**
   * Calculate running average for incremental stats updates
   */
  private calculateRunningAverage(
    currentAvg: number,
    newValue: number,
    currentCount: number,
    newCount: number
  ): number {
    return (currentAvg * currentCount + newValue) / newCount;
  }

  /**
   * Get Redis key for stats storage
   */
  private getStatsKey(type: PromptType, version: PromptVersion): string {
    return `${this.config.statsKeyPrefix}:${type}:${version}`;
  }

  /**
   * Calculate composite score for version comparison
   *
   * WHY: We need a single metric to compare prompt versions.
   * This balances success rate, quality, cost, and reliability.
   */
  private calculateCompositeScore(stats: PromptPerformanceStats): number {
    if (stats.totalUses === 0) {
      return 0;
    }

    // Weighted scoring:
    // - Success rate: 40% (most important)
    // - Quality: 30%
    // - Cost efficiency: 20% (inverse - lower is better)
    // - Reliability: 10% (fewer retries is better)

    const successScore = stats.successRate * 0.4;
    const qualityScore = stats.avgQualityScore * 0.3;
    const costScore = Math.max(0, (1 - stats.avgCost / 0.1) * 100) * 0.2; // Normalize assuming $0.10 max
    const reliabilityScore = Math.max(0, (2 - stats.avgRetries) * 100) * 0.1; // Normalize assuming 2 max retries

    return successScore + qualityScore + costScore + reliabilityScore;
  }

  /**
   * Recommend action for a prompt version based on stats
   */
  private recommendVersionAction(stats: PromptPerformanceStats): 'use' | 'test' | 'retire' {
    // Not enough data
    if (stats.totalUses < 10) {
      return 'test';
    }

    // Poor performance - retire
    if (stats.successRate < 70 || stats.avgQualityScore < 60) {
      return 'retire';
    }

    // Good performance - use
    if (stats.successRate >= 85 && stats.avgQualityScore >= 75) {
      return 'use';
    }

    // Mediocre - keep testing
    return 'test';
  }
}

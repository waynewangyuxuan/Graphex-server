/**
 * AI Orchestrator Service v2 - Production-Ready
 *
 * CRITICAL COMPONENT: This service orchestrates all AI operations with:
 * - Validation loops (retry with feedback until quality passes)
 * - Budget enforcement (prevent runaway costs)
 * - Cost tracking (monitor usage and spending)
 * - Quality recovery (upgrade model if cheap model fails)
 * - Fallback cascade (Claude -> OpenAI -> error)
 * - Caching (reduce duplicate AI calls by 60-80%)
 *
 * This is the ONLY entry point for AI operations. All AI calls must go through
 * this orchestrator to ensure budget limits, quality standards, and cost tracking.
 *
 * WHY: Without this orchestration layer, we would have:
 * - Uncontrolled costs (AI could bankrupt the project)
 * - Low quality outputs (30% of raw AI outputs fail validation)
 * - No retryability (transient failures would break features)
 * - No visibility (no idea what's costing money)
 *
 * @see META/SERVICE_DESIGN_V2.md Section 3.1-3.2
 */

import Redis from 'ioredis';
import { Logger } from 'winston';
import crypto from 'crypto';

import { AIClient } from '../lib/ai/ai-client';
import { PromptManagerService } from './prompt-manager.service';
import { AIOutputValidator } from '../lib/validation/ai-output-validator';
import { CostTrackerService } from './cost-tracker.service';

import {
  AIRequest,
  AIResponse,
  AIRequestConfig,
  AIRawResponse,
  BudgetCheck,
  CacheKeyInput,
  CachedResult,
  TokenUsage,
} from '../types/ai.types';
import { BuiltPrompt, PromptType, PromptVersion } from '../types/prompt.types';
import { ValidationResult, AIOutputType } from '../types/validation.types';

import {
  AIValidationError,
  BudgetExceededError,
  AIRateLimitError,
  AIModelUnavailableError,
  getRetryDelayMs,
  isRetryableError,
  AIParseError,
} from '../lib/errors/ai-errors';

/**
 * Default configuration for AI orchestrator
 */
const DEFAULT_CONFIG: Required<AIRequestConfig> = {
  maxRetries: 3,
  qualityThreshold: 60,
  maxCost: Infinity,
  promptVersion: 'production',
  timeoutMs: 30000,
  preferredModel: '',
  userId: undefined,
  documentId: undefined,
};

/**
 * Cache TTL configuration (in seconds)
 */
const CACHE_TTL = {
  graph: 3600, // 1 hour for graphs
  explanation: 3600, // 1 hour for explanations
  quiz: 1800, // 30 minutes for quizzes
  imageDescription: 86400, // 24 hours for image descriptions (stable)
};

/**
 * AI Orchestrator Service
 *
 * Coordinates all AI operations with validation, retry, budget control, and caching.
 */
export class AIOrchestrator {
  constructor(
    private readonly aiClient: AIClient,
    private readonly promptManager: PromptManagerService,
    private readonly validator: AIOutputValidator,
    private readonly costTracker: CostTrackerService,
    private readonly redis: Redis,
    private readonly logger: Logger
  ) {
    this.logger.info('AI Orchestrator initialized');
  }

  /**
   * Execute AI request with full orchestration
   *
   * Complete flow:
   * 1. Merge configuration with defaults
   * 2. Check budget (CRITICAL - prevent overruns)
   * 3. Check cache (60-80% hit rate saves costs)
   * 4. Build prompt from template + context
   * 5. Get recommended model
   * 6. Execute with validation loop (retry until quality passes)
   * 7. Cache successful result
   * 8. Track cost and quality metrics
   * 9. Record prompt performance
   * 10. Return validated response
   *
   * @param request - AI request with prompt type and context
   * @returns Validated AI response with quality metadata
   * @throws BudgetExceededError if budget check fails
   * @throws AIValidationError if all retries fail validation
   */
  async execute<T>(request: AIRequest): Promise<AIResponse<T>> {
    const startTime = Date.now();

    // 1. Merge config with defaults
    const config = this.mergeConfig(request.config);

    this.logger.info('Starting AI request', {
      promptType: request.promptType,
      userId: config.userId,
      documentId: config.documentId,
    });

    try {
      // 2. Check budget BEFORE expensive operations
      const budgetCheck = await this.checkBudget(request, config);
      if (!budgetCheck.allowed) {
        throw new BudgetExceededError(budgetCheck.reason!, budgetCheck);
      }

      // 3. Check cache for previous identical request
      const cached = await this.checkCache<T>(request, config);
      if (cached) {
        this.logger.info('Cache hit - returning cached result', {
          promptType: request.promptType,
        });

        return this.buildCachedResponse(cached, startTime);
      }

      // 4. Build prompt from template
      const builtPrompt = await this.promptManager.build(
        request.promptType,
        request.context,
        config.promptVersion
      );

      // 5. Get recommended model (unless overridden)
      const modelRecommendation = this.promptManager.getRecommendedModel(
        request.promptType,
        request.context
      );
      const initialModel = config.preferredModel || modelRecommendation.model;

      // 6. Execute with validation loop (CRITICAL COMPONENT)
      const result = await this.executeWithValidation<T>(
        builtPrompt,
        request.promptType,
        initialModel,
        config
      );

      // 7. Cache successful result
      if (result.quality.passed) {
        await this.cacheResult(request, config, result.data, result.quality.score);
      }

      // 8. Track cost and quality in cost tracker
      await this.trackMetrics(request, result, config);

      // 9. Record prompt performance for A/B testing
      await this.promptManager.recordOutcome(request.promptType, config.promptVersion, {
        success: result.quality.passed,
        qualityScore: result.quality.score,
        cost: result.metadata.cost,
        retries: result.metadata.attempts,
        processingTimeMs: result.metadata.processingTime,
        model: result.model,
        validationIssues: result.quality.issues.map(i => i.message),
      });

      this.logger.info('AI request completed successfully', {
        promptType: request.promptType,
        model: result.model,
        attempts: result.metadata.attempts,
        qualityScore: result.quality.score,
        cost: result.metadata.cost,
        cached: result.metadata.cached,
        totalTimeMs: Date.now() - startTime,
      });

      return result;
    } catch (error) {
      this.logger.error('AI request failed', {
        promptType: request.promptType,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });

      throw error;
    }
  }

  // ============================================================
  // CRITICAL: VALIDATION LOOP WITH RETRY AND FEEDBACK
  // ============================================================

  /**
   * Execute AI request with validation loop
   *
   * This is the MOST CRITICAL function in the entire AI system.
   *
   * Flow for each attempt:
   * 1. Call AI with current prompt
   * 2. Parse response to expected structure
   * 3. Validate output quality
   * 4. If validation passes → Return success
   * 5. If validation fails → Add feedback to prompt and retry
   * 6. If all retries exhausted → Throw error with details
   *
   * Quality recovery:
   * - If using Haiku and validation fails twice → Upgrade to Sonnet 4
   * - Tracks cost difference for analytics
   *
   * Fallback cascade:
   * - Rate limit error → Exponential backoff and retry
   * - Model unavailable → Switch to fallback model
   * - Parse error → Retry with better format instructions
   *
   * @param builtPrompt - Compiled prompt ready for AI
   * @param promptType - Type of AI operation
   * @param initialModel - Model to try first
   * @param config - Request configuration
   * @returns Validated AI response
   * @throws AIValidationError if all retries fail
   */
  private async executeWithValidation<T>(
    builtPrompt: BuiltPrompt,
    promptType: PromptType,
    initialModel: string,
    config: Required<AIRequestConfig>
  ): Promise<AIResponse<T>> {
    let attempts = 0;
    let currentModel = initialModel;
    let validationFeedback: string[] = [];
    let lastError: Error | null = null;
    const qualityScores: number[] = [];

    while (attempts < config.maxRetries) {
      // Increment attempts at the START so rate limits and model fallbacks
      // still count as an attempt
      attempts++;

      this.logger.debug(`Validation attempt ${attempts}/${config.maxRetries}`, {
        model: currentModel,
        hasFeedback: validationFeedback.length > 0,
      });

      try {
        // Build user prompt with validation feedback from previous attempts
        const userPrompt =
          validationFeedback.length > 0
            ? this.addValidationFeedback(builtPrompt.userPrompt, validationFeedback)
            : builtPrompt.userPrompt;

        // Call AI model
        const rawResponse = await this.callAI(
          builtPrompt.systemPrompt,
          userPrompt,
          currentModel,
          config
        );

        // Parse response to expected structure
        const parsed = this.parseResponse<T>(rawResponse.content, promptType);

        // Validate output quality (CRITICAL)
        const validation = await this.validator.validate(parsed, promptType as AIOutputType, {
          threshold: config.qualityThreshold,
          mode: 'quick',
          includeMetadata: true,
        });

        qualityScores.push(validation.score);

        // If validation passed, return success
        if (validation.passed) {
          this.logger.info('Validation passed', {
            model: currentModel,
            attempt: attempts,
            qualityScore: validation.score,
          });

          return this.buildSuccessResponse<T>(
            parsed,
            rawResponse,
            validation,
            builtPrompt,
            attempts,
            currentModel  // Pass model key for cost calculation
          );
        }

        // Validation failed - prepare feedback for next attempt
        validationFeedback = this.extractFeedback(validation);

        this.logger.warn(`Validation failed (attempt ${attempts}/${config.maxRetries})`, {
          model: currentModel,
          qualityScore: validation.score,
          issueCount: validation.issues.length,
          issues: validationFeedback,
        });

        // Quality recovery: Upgrade to Sonnet 4 if Haiku fails repeatedly
        if (currentModel === 'claude-haiku' && attempts === 2) {
          this.logger.info('Quality recovery: Upgrading to Sonnet 4 for better reasoning');
          currentModel = 'claude-sonnet-4';
        }
      } catch (error) {
        lastError = error as Error;

        // Handle rate limits with exponential backoff
        // Don't decrement attempts - this counts as a real attempt
        if (error instanceof AIRateLimitError) {
          const delayMs = getRetryDelayMs(error, attempts);
          this.logger.warn(`Rate limit hit, waiting ${delayMs}ms before retry`, {
            model: currentModel,
            attempt: attempts,
          });

          await this.sleep(delayMs);

          // DON'T decrement attempts - rate limit response counts as an attempt
          // Just loop again to retry
          continue;
        }

        // Handle model unavailable - try fallback
        // Don't decrement attempts - switching models counts as an attempt
        if (error instanceof AIModelUnavailableError && error.providerError?.retryable) {
          const fallback = this.getNextFallbackModel(currentModel);
          this.logger.warn(`Model unavailable, switching to fallback: ${fallback}`, {
            previousModel: currentModel,
            error: error.message,
          });

          currentModel = fallback;
          // DON'T decrement attempts - model switch counts as an attempt
          continue;
        }

        // Handle parse errors - retry with better format instructions
        if (error instanceof AIParseError) {
          this.logger.warn('Parse error, retrying with format guidance', {
            model: currentModel,
            attempt: attempts,
          });

          validationFeedback = [
            'The previous response had invalid format.',
            'Please ensure output is valid JSON matching the expected structure.',
            error.parseDetails.parseError || 'Failed to parse response',
          ];
          continue;
        }

        // Non-retryable error
        if (!isRetryableError(error as Error)) {
          this.logger.error('Non-retryable error encountered', {
            model: currentModel,
            attempt: attempts,
            error: error instanceof Error ? error.message : String(error),
          });

          throw error;
        }

        // Log other errors and continue retrying
        this.logger.error(`AI request failed (attempt ${attempts})`, {
          error: error instanceof Error ? error.message : String(error),
          model: currentModel,
        });
      }
    }

    // All retries exhausted without success
    throw new AIValidationError(
      `Failed to generate valid output after ${attempts} attempts. ` +
        `Quality issues: ${validationFeedback.join(', ')}`,
      {
        attempts,
        feedback: validationFeedback,
        lastError,
        qualityScores,
      }
    );
  }

  // ============================================================
  // AI CALLING AND RESPONSE HANDLING
  // ============================================================

  /**
   * Call AI model with timeout and error handling
   */
  private async callAI(
    systemPrompt: string,
    userPrompt: string,
    model: string,
    config: Required<AIRequestConfig>
  ): Promise<AIRawResponse> {
    return this.aiClient.call(systemPrompt, userPrompt, model, {
      maxTokens: 4096,
      temperature: 0.7,
      timeoutMs: config.timeoutMs,
    });
  }

  /**
   * Parse AI response to expected structure
   *
   * WHY: AI returns raw string, need to parse to typed structure
   * for validation and application use.
   */
  private parseResponse<T>(content: string, promptType: PromptType): T {
    try {
      // Try parsing as JSON first
      return JSON.parse(content) as T;
    } catch (jsonError) {
      // If JSON parse fails, try extracting JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1]) as T;
        } catch (innerError) {
          throw new AIParseError('Failed to parse JSON from code block', {
            rawContent: content.substring(0, 500),
            expectedFormat: 'Valid JSON object',
            parseError: innerError instanceof Error ? innerError.message : String(innerError),
          });
        }
      }

      // No JSON found
      throw new AIParseError('Response is not valid JSON', {
        rawContent: content.substring(0, 500),
        expectedFormat: `JSON object for ${promptType}`,
        parseError: jsonError instanceof Error ? jsonError.message : String(jsonError),
      });
    }
  }

  // ============================================================
  // BUDGET AND COST MANAGEMENT
  // ============================================================

  /**
   * Check if operation is within budget
   */
  private async checkBudget(
    request: AIRequest,
    config: Required<AIRequestConfig>
  ): Promise<BudgetCheck> {
    // Estimate tokens from context
    const contextText = JSON.stringify(request.context);
    const estimatedTokens = Math.ceil(contextText.length / 4); // Rough estimation

    const budgetCheck = await this.costTracker.checkBudget({
      userId: config.userId,
      operation: this.mapPromptTypeToOperation(request.promptType),
      estimatedTokens,
      documentId: config.documentId,
    });

    return {
      allowed: budgetCheck.allowed,
      reason: budgetCheck.reason,
      estimatedCost: budgetCheck.estimatedCost,
      currentUsage: budgetCheck.currentUsage,
    };
  }

  /**
   * Track cost and quality metrics
   */
  private async trackMetrics(
    request: AIRequest,
    result: AIResponse<any>,
    config: Required<AIRequestConfig>
  ): Promise<void> {
    try {
      await this.costTracker.recordUsage({
        userId: config.userId,
        operation: this.mapPromptTypeToOperation(request.promptType),
        model: result.model,
        tokensUsed: {
          input: result.metadata.tokensUsed.input,
          output: result.metadata.tokensUsed.output,
        },
        cost: result.metadata.cost,
        quality: result.quality.score,
        attempts: result.metadata.attempts,
        success: result.quality.passed,
        documentId: config.documentId,
      });
    } catch (error) {
      // Don't fail request if tracking fails
      this.logger.warn('Failed to track metrics', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Map prompt type to cost tracker operation type
   */
  private mapPromptTypeToOperation(
    promptType: PromptType
  ): 'graph-generation' | 'connection-explanation' | 'quiz-generation' | 'image-description' {
    return promptType as any; // Types are aligned
  }

  // ============================================================
  // CACHING
  // ============================================================

  /**
   * Check cache for previous identical request
   */
  private async checkCache<T>(
    request: AIRequest,
    config: Required<AIRequestConfig>
  ): Promise<CachedResult<T> | null> {
    try {
      const cacheKey = this.buildCacheKey({
        promptType: request.promptType,
        context: request.context,
        model: config.preferredModel || 'claude-haiku',
        version: config.promptVersion,
      });

      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as CachedResult<T>;
      }

      return null;
    } catch (error) {
      // Cache failures shouldn't break the main flow
      this.logger.warn('Cache check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Cache successful result
   */
  private async cacheResult<T>(
    request: AIRequest,
    config: Required<AIRequestConfig>,
    data: T,
    qualityScore: number
  ): Promise<void> {
    try {
      const cacheKey = this.buildCacheKey({
        promptType: request.promptType,
        context: request.context,
        model: config.preferredModel || 'claude-haiku',
        version: config.promptVersion,
      });

      const cached: CachedResult<T> = {
        data,
        cachedAt: new Date(),
        qualityScore,
        model: config.preferredModel || 'claude-haiku',
      };

      const ttl = CACHE_TTL[request.promptType] || CACHE_TTL.explanation;

      await this.redis.setex(cacheKey, ttl, JSON.stringify(cached));

      this.logger.debug('Result cached successfully', {
        promptType: request.promptType,
        ttl,
      });
    } catch (error) {
      // Cache failures shouldn't break the main flow
      this.logger.warn('Failed to cache result', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Build cache key from request parameters
   */
  private buildCacheKey(input: CacheKeyInput): string {
    // Create deterministic hash of context
    const contextHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(input.context))
      .digest('hex')
      .substring(0, 16);

    return `ai:${input.promptType}:${input.version}:${input.model}:${contextHash}`;
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================

  /**
   * Merge request config with defaults
   */
  private mergeConfig(config?: AIRequestConfig): Required<AIRequestConfig> {
    return {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * Add validation feedback to prompt for retry
   */
  private addValidationFeedback(basePrompt: string, feedback: string[]): string {
    const feedbackSection =
      '\n\n---\nIMPORTANT: Previous attempt had issues. Please fix:\n' +
      feedback.map((f, i) => `${i + 1}. ${f}`).join('\n') +
      '\n---\n\n';

    return feedbackSection + basePrompt;
  }

  /**
   * Extract actionable feedback from validation result
   */
  private extractFeedback(validation: ValidationResult): string[] {
    return validation.issues
      .filter(issue => issue.fix) // Only issues with fixes
      .map(issue => `${issue.type}: ${issue.fix}`);
  }

  /**
   * Get next fallback model in cascade
   */
  private getNextFallbackModel(currentModel: string): string {
    // Fallback cascade: Claude Sonnet 4 -> Claude Haiku -> GPT-4 Turbo
    if (currentModel === 'claude-sonnet-4') {
      return 'claude-haiku';
    }
    if (currentModel === 'claude-haiku') {
      return 'gpt-4-turbo';
    }
    // Last resort - throw error
    throw new AIModelUnavailableError('All fallback models exhausted', {
      message: 'No more fallback models available',
      retryable: false,
    });
  }

  /**
   * Build successful response object
   */
  private buildSuccessResponse<T>(
    data: T,
    rawResponse: AIRawResponse,
    validation: ValidationResult,
    builtPrompt: BuiltPrompt,
    attempts: number,
    modelKey: string  // Model key for cost lookup (e.g., 'claude-haiku')
  ): AIResponse<T> {
    const cost = this.aiClient.calculateCost(
      {
        input: rawResponse.usage.inputTokens,
        output: rawResponse.usage.outputTokens,
        total: rawResponse.usage.totalTokens,
      },
      modelKey  // Use model key instead of API model name
    );

    return {
      data,
      model: rawResponse.model,
      quality: validation,
      metadata: {
        tokensUsed: {
          input: rawResponse.usage.inputTokens,
          output: rawResponse.usage.outputTokens,
          total: rawResponse.usage.totalTokens,
        },
        cost,
        cached: false,
        processingTime: rawResponse.processingTime,
        attempts,
        validationPassed: validation.passed,
        promptVersion: builtPrompt.metadata.version,
        model: rawResponse.model,
        timestamp: new Date(),
      },
    };
  }

  /**
   * Build response from cached result
   */
  private buildCachedResponse<T>(cached: CachedResult<T>, startTime: number): AIResponse<T> {
    return {
      data: cached.data,
      model: cached.model,
      quality: {
        passed: true,
        score: cached.qualityScore,
        issues: [],
        warnings: [],
      },
      metadata: {
        tokensUsed: { input: 0, output: 0, total: 0 },
        cost: 0, // Cached results are free
        cached: true,
        processingTime: Date.now() - startTime,
        attempts: 1,
        validationPassed: true,
        promptVersion: 'production',
        model: cached.model,
        timestamp: new Date(),
      },
    };
  }

  /**
   * Sleep helper for exponential backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

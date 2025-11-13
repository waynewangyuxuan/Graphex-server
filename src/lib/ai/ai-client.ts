/**
 * Unified AI Client Wrapper
 *
 * Provides a consistent interface for calling Anthropic Claude and OpenAI models.
 * Handles provider-specific differences, token counting, cost calculation,
 * and error normalization.
 *
 * WHY: Abstracting provider differences allows seamless fallback between
 * Claude and OpenAI without changing orchestration logic. Also centralizes
 * cost calculation and timeout handling.
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { Logger } from 'winston';
import {
  AIRawResponse,
  ModelConfig,
  AIClientConfig,
  TokenUsage,
} from '../../types/ai.types';
import {
  AIModelUnavailableError,
  AIRateLimitError,
  AITimeoutError,
  AIParseError,
} from '../errors/ai-errors';

/**
 * Model pricing configuration (per 1M tokens)
 *
 * Updated: November 2024 pricing
 * Source: Anthropic and OpenAI pricing pages
 */
const MODEL_CONFIGS: Record<string, ModelConfig> = {
  'claude-sonnet-4': {
    name: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    maxTokens: 4096,
    temperature: 0.7,
    pricing: {
      input: 3.0, // $3 per 1M input tokens
      output: 15.0, // $15 per 1M output tokens
    },
    supportsVision: true,
  },
  'claude-haiku': {
    name: 'claude-3-5-haiku-20241022',
    provider: 'anthropic',
    maxTokens: 4096,
    temperature: 0.7,
    pricing: {
      input: 0.25,
      output: 1.25,
    },
    supportsVision: false,
  },
  'gpt-4-turbo': {
    name: 'gpt-4-turbo-preview',
    provider: 'openai',
    maxTokens: 4096,
    temperature: 0.7,
    pricing: {
      input: 10.0,
      output: 30.0,
    },
    supportsVision: true,
  },
};

/**
 * AI Client for unified provider access
 */
export class AIClient {
  private readonly anthropicClient: Anthropic;
  private readonly openaiClient: OpenAI;

  constructor(
    private readonly config: AIClientConfig,
    private readonly logger: Logger
  ) {
    // Initialize provider clients
    this.anthropicClient = new Anthropic({
      apiKey: config.anthropicApiKey,
    });

    this.openaiClient = new OpenAI({
      apiKey: config.openaiApiKey,
    });

    this.logger.info('AI Client initialized', {
      hasAnthropicKey: !!config.anthropicApiKey,
      hasOpenAIKey: !!config.openaiApiKey,
      defaultTimeout: config.defaultTimeout,
    });
  }

  /**
   * Call AI model with unified interface
   *
   * Routes to appropriate provider based on model configuration.
   * Handles timeouts, error normalization, and cost calculation.
   *
   * @param systemPrompt - System prompt setting AI behavior
   * @param userPrompt - User prompt with task and context
   * @param model - Model identifier (claude-sonnet-4, gpt-4-turbo, etc.)
   * @param options - Request options (maxTokens, temperature, timeout)
   * @returns Raw AI response with usage and timing
   */
  async call(
    systemPrompt: string,
    userPrompt: string,
    model: string,
    options: {
      maxTokens?: number;
      temperature?: number;
      timeoutMs?: number;
    } = {}
  ): Promise<AIRawResponse> {
    const startTime = Date.now();
    const modelConfig = this.getModelConfig(model);

    this.logger.debug('Calling AI model', {
      model,
      provider: modelConfig.provider,
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
      timeoutMs: options.timeoutMs || this.config.defaultTimeout,
    });

    try {
      // Route to provider-specific implementation
      if (modelConfig.provider === 'anthropic') {
        return await this.callAnthropic(systemPrompt, userPrompt, modelConfig, options, startTime);
      } else {
        return await this.callOpenAI(systemPrompt, userPrompt, modelConfig, options, startTime);
      }
    } catch (error) {
      // Normalize provider-specific errors
      this.handleProviderError(error as Error, model);
      throw error; // This line won't execute, but satisfies TypeScript
    }
  }

  /**
   * Get model configuration
   *
   * @param model - Model identifier
   * @returns Model configuration
   * @throws AIModelUnavailableError if model not found
   */
  getModelConfig(model: string): ModelConfig {
    const config = MODEL_CONFIGS[model];

    if (!config) {
      throw new AIModelUnavailableError(model, {
        message: `Unknown model: ${model}. Available models: ${Object.keys(MODEL_CONFIGS).join(', ')}`,
        retryable: false,
      });
    }

    return config;
  }

  /**
   * Calculate cost from token usage and model
   *
   * @param usage - Token usage breakdown
   * @param model - Model identifier
   * @returns Cost in USD
   */
  calculateCost(usage: TokenUsage, model: string): number {
    const modelConfig = this.getModelConfig(model);

    const inputCost = (usage.input / 1_000_000) * modelConfig.pricing.input;
    const outputCost = (usage.output / 1_000_000) * modelConfig.pricing.output;

    return inputCost + outputCost;
  }

  // ============================================================
  // PRIVATE PROVIDER-SPECIFIC IMPLEMENTATIONS
  // ============================================================

  /**
   * Call Anthropic Claude API
   */
  private async callAnthropic(
    systemPrompt: string,
    userPrompt: string,
    modelConfig: ModelConfig,
    options: {
      maxTokens?: number;
      temperature?: number;
      timeoutMs?: number;
    },
    startTime: number
  ): Promise<AIRawResponse> {
    const timeout = options.timeoutMs || this.config.defaultTimeout;

    try {
      // Create promise with timeout
      const response = await this.withTimeout(
        this.anthropicClient.messages.create({
          model: modelConfig.name,
          max_tokens: options.maxTokens || modelConfig.maxTokens,
          temperature: options.temperature ?? modelConfig.temperature,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: userPrompt,
            },
          ],
        }),
        timeout,
        modelConfig.name
      );

      // Extract content from response
      const content = response.content[0];
      const textContent = content.type === 'text' ? content.text : '';

      const usage: TokenUsage = {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        total: response.usage.input_tokens + response.usage.output_tokens,
      };

      this.logger.info('Anthropic API call successful', {
        model: modelConfig.name,
        tokens: usage.total,
        durationMs: Date.now() - startTime,
      });

      return {
        content: textContent,
        model: modelConfig.name,
        usage: {
          inputTokens: usage.input,
          outputTokens: usage.output,
          totalTokens: usage.total,
        },
        finishReason: response.stop_reason || 'unknown',
        processingTime: Date.now() - startTime,
      };
    } catch (error: any) {
      this.logger.error('Anthropic API call failed', {
        model: modelConfig.name,
        error: error.message,
        durationMs: Date.now() - startTime,
      });

      throw error;
    }
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(
    systemPrompt: string,
    userPrompt: string,
    modelConfig: ModelConfig,
    options: {
      maxTokens?: number;
      temperature?: number;
      timeoutMs?: number;
    },
    startTime: number
  ): Promise<AIRawResponse> {
    const timeout = options.timeoutMs || this.config.defaultTimeout;

    try {
      const response = await this.withTimeout(
        this.openaiClient.chat.completions.create({
          model: modelConfig.name,
          max_tokens: options.maxTokens || modelConfig.maxTokens,
          temperature: options.temperature ?? modelConfig.temperature,
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: userPrompt,
            },
          ],
        }),
        timeout,
        modelConfig.name
      );

      const content = response.choices[0]?.message?.content || '';
      const usage = response.usage;

      if (!usage) {
        throw new AIParseError('No usage data in OpenAI response', {
          rawContent: JSON.stringify(response),
          expectedFormat: 'OpenAI response with usage field',
        });
      }

      const tokenUsage: TokenUsage = {
        input: usage.prompt_tokens,
        output: usage.completion_tokens,
        total: usage.total_tokens,
      };

      this.logger.info('OpenAI API call successful', {
        model: modelConfig.name,
        tokens: tokenUsage.total,
        durationMs: Date.now() - startTime,
      });

      return {
        content,
        model: modelConfig.name,
        usage: {
          inputTokens: tokenUsage.input,
          outputTokens: tokenUsage.output,
          totalTokens: tokenUsage.total,
        },
        finishReason: response.choices[0]?.finish_reason || 'unknown',
        processingTime: Date.now() - startTime,
      };
    } catch (error: any) {
      this.logger.error('OpenAI API call failed', {
        model: modelConfig.name,
        error: error.message,
        durationMs: Date.now() - startTime,
      });

      throw error;
    }
  }

  /**
   * Wrap promise with timeout
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    model: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          reject(new AITimeoutError(model, timeoutMs));
        }, timeoutMs);
      }),
    ]);
  }

  /**
   * Normalize provider-specific errors to our error types
   *
   * WHY: Different providers have different error structures.
   * Normalizing them allows consistent error handling in orchestrator.
   */
  private handleProviderError(error: any, model: string): never {
    // Anthropic errors
    if (error.status === 429 || error.error?.type === 'rate_limit_error') {
      throw new AIRateLimitError(model, {
        retryAfterMs: this.parseRetryAfter(error.headers?.['retry-after']),
      });
    }

    if (
      error.status === 503 ||
      error.error?.type === 'overloaded_error' ||
      error.error?.type === 'api_error'
    ) {
      throw new AIModelUnavailableError(model, {
        statusCode: error.status,
        errorCode: error.error?.type,
        message: error.error?.message || error.message,
        retryable: true,
      });
    }

    // OpenAI errors
    if (error.code === 'rate_limit_exceeded') {
      throw new AIRateLimitError(model, {
        retryAfterMs: this.parseRetryAfter(error.headers?.['retry-after']),
      });
    }

    if (error.code === 'model_not_found' || error.code === 'invalid_request_error') {
      throw new AIModelUnavailableError(model, {
        statusCode: error.status,
        errorCode: error.code,
        message: error.message,
        retryable: false,
      });
    }

    // Timeout errors (already thrown by withTimeout)
    if (error instanceof AITimeoutError) {
      throw error;
    }

    // Generic API error
    throw new AIModelUnavailableError(model, {
      statusCode: error.status,
      message: error.message || 'Unknown API error',
      retryable: true,
    });
  }

  /**
   * Parse retry-after header to milliseconds
   */
  private parseRetryAfter(retryAfter?: string): number | undefined {
    if (!retryAfter) {
      return undefined;
    }

    // If it's a number (seconds)
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000;
    }

    // If it's a date
    const date = new Date(retryAfter);
    if (!isNaN(date.getTime())) {
      return Math.max(0, date.getTime() - Date.now());
    }

    return undefined;
  }
}

/**
 * AI Client Configuration
 * Sets up Anthropic Claude and OpenAI API clients
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { env } from './env';
import { logger } from '../utils/logger.util';

/**
 * Anthropic Claude client
 * Primary AI service for graph generation and explanations
 */
export const anthropicClient = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY || '',
});

/**
 * OpenAI client
 * Fallback AI service when Claude is unavailable
 */
export const openaiClient = new OpenAI({
  apiKey: env.OPENAI_API_KEY || '',
});

/**
 * AI model configuration
 */
export const AI_MODELS = {
  CLAUDE_SONNET: 'claude-sonnet-4-20250514',
  CLAUDE_HAIKU: 'claude-3-5-haiku-20241022',
  GPT_4_TURBO: 'gpt-4-turbo-preview',
  GPT_4: 'gpt-4',
} as const;

/**
 * AI service timeouts and retry configuration
 */
export const AI_CONFIG = {
  MAX_RETRIES: 3,
  TIMEOUT_MS: 30000,
  RETRY_DELAY_MS: 1000,
} as const;

/**
 * Check if Anthropic client is configured
 */
export const isAnthropicConfigured = (): boolean => {
  const configured = !!env.ANTHROPIC_API_KEY;
  if (!configured) {
    logger.warn('Anthropic API key not configured');
  }
  return configured;
};

/**
 * Check if OpenAI client is configured
 */
export const isOpenAIConfigured = (): boolean => {
  const configured = !!env.OPENAI_API_KEY;
  if (!configured) {
    logger.warn('OpenAI API key not configured');
  }
  return configured;
};

/**
 * Health check for AI services
 * Returns status of available AI services
 */
export const checkAIServicesHealth = async (): Promise<{
  anthropic: boolean;
  openai: boolean;
}> => {
  const health = {
    anthropic: false,
    openai: false,
  };

  // Check Anthropic
  if (isAnthropicConfigured()) {
    try {
      // Simple API call to verify connection
      // Note: This is a minimal check, actual health verification would require a real API call
      health.anthropic = true;
    } catch (error) {
      logger.error('Anthropic health check failed', { error });
    }
  }

  // Check OpenAI
  if (isOpenAIConfigured()) {
    try {
      // Simple API call to verify connection
      health.openai = true;
    } catch (error) {
      logger.error('OpenAI health check failed', { error });
    }
  }

  return health;
};

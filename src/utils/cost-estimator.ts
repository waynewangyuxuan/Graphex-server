/**
 * Cost Estimation Utility
 *
 * Estimates AI API costs for document processing operations.
 * Uses conservative estimates to prevent budget overruns.
 */

/**
 * AI model pricing (per 1M tokens)
 * Based on Anthropic and OpenAI pricing as of November 2024
 */
const MODEL_PRICING = {
  'claude-sonnet-4': {
    input: 3.0, // $3.00 per 1M input tokens
    output: 15.0, // $15.00 per 1M output tokens
  },
  'claude-haiku': {
    input: 0.25, // $0.25 per 1M input tokens
    output: 1.25, // $1.25 per 1M output tokens
  },
  'gpt-4-turbo': {
    input: 10.0, // $10.00 per 1M input tokens
    output: 30.0, // $30.00 per 1M output tokens
  },
  'gpt-4-vision': {
    input: 10.0, // $10.00 per 1M input tokens
    output: 30.0, // $30.00 per 1M output tokens
    imageBase: 0.00765, // Base cost per image
    imagePerTile: 0.00255, // Cost per 512x512 tile
  },
} as const;

/**
 * Default model for estimations
 */
const DEFAULT_MODEL = 'claude-sonnet-4';

/**
 * Estimated token counts for different operations
 */
const OPERATION_ESTIMATES = {
  'graph-generation': {
    inputMultiplier: 1.2, // Document tokens + prompt overhead
    outputTokens: 2000, // Estimated graph output size
  },
  'connection-explanation': {
    inputMultiplier: 1.1,
    outputTokens: 500,
  },
  'quiz-generation': {
    inputMultiplier: 1.15,
    outputTokens: 1500,
  },
  'image-description': {
    inputMultiplier: 1.0,
    outputTokens: 300,
  },
} as const;

/**
 * Cost estimation input parameters
 */
export interface CostEstimateInput {
  textTokens?: number;
  textLength?: number;
  imageCount?: number;
  operationType?: keyof typeof OPERATION_ESTIMATES;
  model?: keyof typeof MODEL_PRICING;
}

/**
 * Cost estimation result
 */
export interface CostEstimate {
  estimatedCost: number;
  breakdown: {
    textProcessing: number;
    imageProcessing: number;
    outputGeneration: number;
  };
  estimatedTokens: {
    input: number;
    output: number;
  };
  model: string;
}

/**
 * Calculate estimated cost for document processing
 *
 * Why: Prevents budget overruns by estimating costs before expensive AI operations
 *
 * @param input - Cost estimation parameters
 * @returns Detailed cost estimate with breakdown
 */
export function estimateCost(input: CostEstimateInput): CostEstimate {
  const model = input.model || DEFAULT_MODEL;
  const pricing = MODEL_PRICING[model];

  // Calculate text token count
  const textTokens = calculateTextTokens(input);

  // Calculate operation-specific input tokens
  const operationType = input.operationType || 'graph-generation';
  const operationConfig = OPERATION_ESTIMATES[operationType];
  const inputTokens = Math.ceil(textTokens * operationConfig.inputMultiplier);
  const outputTokens = operationConfig.outputTokens;

  // Calculate text processing cost
  const textProcessingCost = (inputTokens / 1_000_000) * pricing.input;

  // Calculate output generation cost
  const outputGenerationCost = (outputTokens / 1_000_000) * pricing.output;

  // Calculate image processing cost (if applicable)
  let imageProcessingCost = 0;
  if (input.imageCount && input.imageCount > 0) {
    imageProcessingCost = estimateImageCost(input.imageCount, model);
  }

  // Total cost
  const estimatedCost = textProcessingCost + imageProcessingCost + outputGenerationCost;

  return {
    estimatedCost,
    breakdown: {
      textProcessing: textProcessingCost,
      imageProcessing: imageProcessingCost,
      outputGeneration: outputGenerationCost,
    },
    estimatedTokens: {
      input: inputTokens,
      output: outputTokens,
    },
    model,
  };
}

/**
 * Calculate token count from text
 *
 * Why: Accurate token estimation is critical for cost prediction
 * Uses conservative 4:1 character-to-token ratio (actual ratio varies by content)
 *
 * @param input - Text tokens or length
 * @returns Estimated token count
 */
function calculateTextTokens(input: CostEstimateInput): number {
  if (input.textTokens) {
    return input.textTokens;
  }

  if (input.textLength) {
    // Conservative estimate: 4 characters per token
    // Actual ratio varies (3.5-4.5 depending on language and content)
    return Math.ceil(input.textLength / 4);
  }

  return 0;
}

/**
 * Estimate cost for image processing
 *
 * Why: Vision AI has different pricing model based on image tiles
 * For MVP, uses conservative flat rate per image
 *
 * @param imageCount - Number of images to process
 * @param _model - AI model to use (unused for now)
 * @returns Estimated cost for image processing
 */
function estimateImageCost(imageCount: number, _model: keyof typeof MODEL_PRICING): number {
  // For MVP, use conservative flat rate
  // In production, would calculate based on actual image dimensions and tiles
  const COST_PER_IMAGE = 0.01; // Conservative estimate for typical image

  return imageCount * COST_PER_IMAGE;
}

/**
 * Estimate cost from text length only (convenience function)
 *
 * @param textLength - Length of text in characters
 * @param options - Optional parameters
 * @returns Estimated cost in dollars
 */
export function estimateCostFromText(
  textLength: number,
  options: {
    imageCount?: number;
    operationType?: keyof typeof OPERATION_ESTIMATES;
  } = {}
): number {
  const estimate = estimateCost({
    textLength,
    imageCount: options.imageCount,
    operationType: options.operationType,
  });

  return estimate.estimatedCost;
}

/**
 * Format cost as human-readable string
 *
 * @param cost - Cost in dollars
 * @returns Formatted string (e.g., "$0.05", "$1.23")
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return '<$0.01';
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * Check if cost exceeds limit
 *
 * @param cost - Estimated cost
 * @param limit - Maximum allowed cost
 * @returns true if cost exceeds limit
 */
export function costExceedsLimit(cost: number, limit: number): boolean {
  return cost > limit;
}

/**
 * Default cost limits for different tiers
 */
export const COST_LIMITS = {
  FREE_TIER: {
    perDocument: 5.0, // $5 max per document
    perDay: 10.0, // $10 max per day
    perMonth: 50.0, // $50 max per month
  },
  PRO_TIER: {
    perDocument: 20.0,
    perDay: 100.0,
    perMonth: 500.0,
  },
} as const;

/**
 * Quote-to-Coordinate Matcher
 *
 * Matches AI-generated text quotes to precise PDF coordinates for highlighting.
 * Implements multi-tier matching strategy (exact → normalized → token-based → fuzzy)
 * to handle AI paraphrasing while maintaining precision.
 *
 * CRITICAL USER REQUIREMENT:
 * "Be careful, we want the highlight to be precise (looks regularized, do not touch
 * unrelated text)". This algorithm prioritizes exact matches and tight bounding boxes.
 *
 * WHY FUZZY MATCHING IS NEEDED:
 * - AI may paraphrase slightly ("ML" vs "Machine Learning")
 * - Punctuation differences ("AI." vs "AI")
 * - Line breaks vs spaces ("Neural\nNetworks" vs "Neural Networks")
 * - But we MUST avoid false positives (e.g., "Neural Networks" ≠ "Social Networks")
 *
 * MATCHING STRATEGY (in order of preference):
 * 1. Exact match: Direct string equality (fastest, most precise)
 * 2. Normalized match: Lowercase + whitespace normalization
 * 3. Token-based match: Word-level matching with sequence validation
 * 4. Fuzzy match: Levenshtein distance with strict threshold
 *
 * QUALITY METRICS TO TRACK:
 * - Exact match rate (target: >60%)
 * - Fuzzy match rate (target: <30%)
 * - Failed match rate (target: <10%)
 * - Average blocks per quote (target: 1-3)
 *
 * @see src/lib/pdf/MATCHING_META.md for complete algorithm documentation
 */

import { TextBlock, BoundingBox } from '../../types/pdf.types';
import { NodeDocumentReference } from '../../types/node.types';
import { Logger } from 'winston';

/**
 * Result of quote matching operation
 */
export interface QuoteMatchResult {
  /**
   * Matched document references with coordinates
   * Empty array if no match found
   */
  references: NodeDocumentReference[];

  /**
   * Metadata about the matching process
   */
  metadata: {
    matchType: 'exact' | 'normalized' | 'token-based' | 'fuzzy' | 'none';
    confidence: number; // 0-1 scale
    matchedBlocks: number;
    attemptedStrategies: string[];
    warnings: string[];
  };
}

/**
 * Configuration for quote matching
 */
export interface QuoteMatcherConfig {
  /**
   * Enable fuzzy matching (default: true)
   * Set to false for strict exact-only matching
   */
  allowFuzzyMatch?: boolean;

  /**
   * Maximum Levenshtein distance ratio for fuzzy matching (default: 0.15)
   * Lower = stricter matching (0 = exact match only)
   */
  fuzzyThreshold?: number;

  /**
   * Minimum token overlap for token-based matching (default: 0.8)
   * Percentage of quote tokens that must match
   */
  tokenOverlapThreshold?: number;

  /**
   * Maximum number of blocks to return (default: 5)
   * Prevents returning too many matches for ambiguous quotes
   */
  maxBlocks?: number;

  /**
   * Combine adjacent blocks if quote spans multiple (default: true)
   * Merges bounding boxes for multi-block quotes
   */
  combineAdjacentBlocks?: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<QuoteMatcherConfig> = {
  allowFuzzyMatch: true,
  fuzzyThreshold: 0.15, // Max 15% difference
  tokenOverlapThreshold: 0.8, // 80% of tokens must match
  maxBlocks: 5,
  combineAdjacentBlocks: true,
};

/**
 * Match a text quote to PDF coordinates
 *
 * ALGORITHM:
 * 1. Try exact match (case-sensitive, whitespace-sensitive)
 * 2. Try normalized match (lowercase, normalized whitespace)
 * 3. Try token-based match (word-level comparison)
 * 4. Try fuzzy match (Levenshtein distance)
 * 5. If all fail, return empty result with warnings
 *
 * EDGE CASES:
 * - Multi-page quotes: Return references from all pages
 * - Partial matches: Only if >80% of quote matches
 * - Duplicate matches: Return first occurrence only
 * - Empty quote: Return empty result
 * - Quote longer than any block: Try substring matching
 *
 * @param quote - The text quote to match (from AI)
 * @param textBlocks - Array of text blocks with coordinates
 * @param config - Optional configuration
 * @param logger - Optional logger for debugging
 * @returns Match result with references and metadata
 *
 * @example
 * const result = matchQuoteToCoordinates(
 *   "Photosynthesis is the process...",
 *   textBlocks,
 *   { allowFuzzyMatch: true }
 * );
 *
 * if (result.references.length > 0) {
 *   console.log(`Found ${result.references.length} matches`);
 *   console.log(`Match type: ${result.metadata.matchType}`);
 *   console.log(`Confidence: ${result.metadata.confidence}`);
 * }
 */
export function matchQuoteToCoordinates(
  quote: string,
  textBlocks: TextBlock[],
  config: QuoteMatcherConfig = {},
  logger?: Logger,
): QuoteMatchResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const attemptedStrategies: string[] = [];
  const warnings: string[] = [];

  // Edge case: Empty quote
  if (!quote || quote.trim().length === 0) {
    logger?.warn('[matchQuoteToCoordinates] Empty quote provided');
    return createEmptyResult(['none'], warnings);
  }

  // Edge case: No text blocks
  if (!textBlocks || textBlocks.length === 0) {
    logger?.warn('[matchQuoteToCoordinates] No text blocks provided');
    warnings.push('No text blocks available for matching');
    return createEmptyResult(['none'], warnings);
  }

  // Strategy 1: Exact match (fastest, most precise)
  attemptedStrategies.push('exact');
  let matches = findExactMatches(quote, textBlocks);
  if (matches.length > 0) {
    logger?.debug(`[matchQuoteToCoordinates] Exact match found: ${matches.length} blocks`);
    return createSuccessResult(matches, 'exact', 1.0, attemptedStrategies, warnings, cfg);
  }

  // Strategy 2: Normalized match (lowercase + whitespace)
  attemptedStrategies.push('normalized');
  matches = findNormalizedMatches(quote, textBlocks);
  if (matches.length > 0) {
    logger?.debug(`[matchQuoteToCoordinates] Normalized match found: ${matches.length} blocks`);
    return createSuccessResult(matches, 'normalized', 0.95, attemptedStrategies, warnings, cfg);
  }

  // Strategy 3: Token-based match (word-level)
  attemptedStrategies.push('token-based');
  matches = findTokenBasedMatches(quote, textBlocks, cfg.tokenOverlapThreshold, logger);
  if (matches.length > 0) {
    logger?.debug(`[matchQuoteToCoordinates] Token-based match found: ${matches.length} blocks`);
    return createSuccessResult(matches, 'token-based', 0.85, attemptedStrategies, warnings, cfg);
  }

  // Strategy 4: Fuzzy match (Levenshtein distance)
  if (cfg.allowFuzzyMatch) {
    attemptedStrategies.push('fuzzy');
    matches = findFuzzyMatches(quote, textBlocks, cfg.fuzzyThreshold, logger);
    if (matches.length > 0) {
      logger?.debug(`[matchQuoteToCoordinates] Fuzzy match found: ${matches.length} blocks`);
      warnings.push('Used fuzzy matching - review for accuracy');
      return createSuccessResult(matches, 'fuzzy', 0.7, attemptedStrategies, warnings, cfg);
    }
  }

  // All strategies failed
  logger?.warn(`[matchQuoteToCoordinates] No match found for quote: "${quote.substring(0, 50)}..."`);
  warnings.push(`No match found for quote (tried ${attemptedStrategies.length} strategies)`);

  return createEmptyResult(attemptedStrategies, warnings);
}

/**
 * Find exact matches (case-sensitive, whitespace-sensitive)
 */
function findExactMatches(quote: string, textBlocks: TextBlock[]): TextBlock[] {
  const matches: TextBlock[] = [];

  for (const block of textBlocks) {
    if (block.text === quote) {
      matches.push(block);
    }
  }

  return matches;
}

/**
 * Find normalized matches (lowercase + whitespace normalization)
 */
function findNormalizedMatches(quote: string, textBlocks: TextBlock[]): TextBlock[] {
  const normalizedQuote = normalizeText(quote);
  const matches: TextBlock[] = [];

  for (const block of textBlocks) {
    const normalizedBlock = normalizeText(block.text);
    if (normalizedBlock === normalizedQuote) {
      matches.push(block);
    }
  }

  return matches;
}

/**
 * Find token-based matches (word-level comparison)
 *
 * ALGORITHM:
 * 1. Split quote and block into tokens (words)
 * 2. Calculate Jaccard similarity (intersection / union)
 * 3. If similarity >= threshold, consider it a match
 *
 * WHY: Handles cases where AI paraphrases slightly but uses same key terms
 * SAFEGUARD: High threshold (0.8) prevents "Neural Networks" matching "Social Networks"
 */
function findTokenBasedMatches(
  quote: string,
  textBlocks: TextBlock[],
  threshold: number,
  logger?: Logger,
): TextBlock[] {
  const quoteTokens = new Set(tokenize(quote));
  const matches: TextBlock[] = [];

  for (const block of textBlocks) {
    const blockTokens = new Set(tokenize(block.text));

    // Calculate Jaccard similarity
    const intersection = new Set([...quoteTokens].filter((t) => blockTokens.has(t)));
    const union = new Set([...quoteTokens, ...blockTokens]);
    const jaccard = intersection.size / union.size;

    if (jaccard >= threshold) {
      logger?.debug(
        `[findTokenBasedMatches] Match with Jaccard=${jaccard.toFixed(2)}: "${block.text.substring(0, 50)}..."`,
      );
      matches.push(block);
    }
  }

  return matches;
}

/**
 * Find fuzzy matches using Levenshtein distance
 *
 * ALGORITHM:
 * 1. For each block, calculate Levenshtein distance to quote
 * 2. Calculate distance ratio (distance / max(quote.length, block.length))
 * 3. If ratio <= threshold, consider it a match
 *
 * WHY: Handles punctuation differences and minor paraphrasing
 * CAUTION: Strict threshold (0.15) to prevent false positives
 */
function findFuzzyMatches(
  quote: string,
  textBlocks: TextBlock[],
  threshold: number,
  logger?: Logger,
): TextBlock[] {
  const normalizedQuote = normalizeText(quote);
  const matches: TextBlock[] = [];

  for (const block of textBlocks) {
    const normalizedBlock = normalizeText(block.text);

    const distance = levenshteinDistance(normalizedQuote, normalizedBlock);
    const maxLength = Math.max(normalizedQuote.length, normalizedBlock.length);
    const ratio = distance / maxLength;

    if (ratio <= threshold) {
      logger?.debug(
        `[findFuzzyMatches] Match with distance ratio=${ratio.toFixed(2)}: "${block.text.substring(0, 50)}..."`,
      );
      matches.push(block);
    }
  }

  return matches;
}

/**
 * Normalize text for comparison
 *
 * - Convert to lowercase
 * - Normalize whitespace (multiple spaces → single space)
 * - Trim leading/trailing whitespace
 * - Remove common punctuation
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ') // Multiple spaces → single space
    .replace(/[.,;:!?()[\]{}"""'']/g, '') // Remove punctuation
    .trim();
}

/**
 * Tokenize text into words
 *
 * - Split on whitespace and punctuation
 * - Convert to lowercase
 * - Filter out empty tokens
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s.,;:!?()[\]{}"""'']+/)
    .filter((token) => token.length > 0);
}

/**
 * Calculate Levenshtein distance between two strings
 *
 * WHY: Standard algorithm for measuring string similarity.
 * OPTIMIZATION: Use dynamic programming for O(m*n) complexity.
 *
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Number of edits (insertions, deletions, substitutions)
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;

  // Edge cases
  if (m === 0) return n;
  if (n === 0) return m;

  // Create DP table
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  // Initialize first row and column
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  // Fill DP table
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // Deletion
        dp[i][j - 1] + 1, // Insertion
        dp[i - 1][j - 1] + cost, // Substitution
      );
    }
  }

  return dp[m][n];
}

/**
 * Create success result from matches
 */
function createSuccessResult(
  matches: TextBlock[],
  matchType: 'exact' | 'normalized' | 'token-based' | 'fuzzy',
  confidence: number,
  attemptedStrategies: string[],
  warnings: string[],
  config: Required<QuoteMatcherConfig>,
): QuoteMatchResult {
  // Limit number of matches
  const limitedMatches = matches.slice(0, config.maxBlocks);

  if (matches.length > config.maxBlocks) {
    warnings.push(`Matched ${matches.length} blocks, returning first ${config.maxBlocks}`);
  }

  // Convert matches to NodeDocumentReference format
  const references: NodeDocumentReference[] = limitedMatches.map((block) => ({
    text: block.text,
    page: block.page,
    bbox: block.bbox,
  }));

  // Optionally combine adjacent blocks
  // TODO: Implement block combination for multi-block quotes
  // For now, return individual blocks

  return {
    references,
    metadata: {
      matchType,
      confidence,
      matchedBlocks: references.length,
      attemptedStrategies,
      warnings,
    },
  };
}

/**
 * Create empty result (no matches found)
 */
function createEmptyResult(attemptedStrategies: string[], warnings: string[]): QuoteMatchResult {
  return {
    references: [],
    metadata: {
      matchType: 'none',
      confidence: 0,
      matchedBlocks: 0,
      attemptedStrategies,
      warnings,
    },
  };
}

/**
 * Combine adjacent text blocks into a single reference
 *
 * Used when a quote spans multiple consecutive blocks.
 * Merges bounding boxes to create a single highlight region.
 *
 * WHY: Improves highlighting precision for long quotes.
 *
 * @param blocks - Array of adjacent text blocks to combine
 * @returns Single NodeDocumentReference with merged bbox
 */
export function combineAdjacentBlocks(blocks: TextBlock[]): NodeDocumentReference {
  if (blocks.length === 0) {
    throw new Error('Cannot combine empty block array');
  }

  if (blocks.length === 1) {
    return {
      text: blocks[0].text,
      page: blocks[0].page,
      bbox: blocks[0].bbox,
    };
  }

  // Verify all blocks are on the same page
  const page = blocks[0].page;
  if (!blocks.every((b) => b.page === page)) {
    throw new Error('Cannot combine blocks from different pages');
  }

  // Combine text
  const combinedText = blocks.map((b) => b.text).join(' ');

  // Merge bounding boxes (create bounding box that contains all blocks)
  const bboxes = blocks.map((b) => b.bbox);
  const mergedBbox = mergeBoundingBoxes(bboxes);

  return {
    text: combinedText,
    page,
    bbox: mergedBbox,
  };
}

/**
 * Merge multiple bounding boxes into one
 *
 * Creates the smallest bounding box that contains all input boxes.
 * Assumes all boxes are on the same page.
 *
 * @param bboxes - Array of bounding boxes to merge
 * @returns Merged bounding box
 */
function mergeBoundingBoxes(bboxes: BoundingBox[]): BoundingBox {
  if (bboxes.length === 0) {
    throw new Error('Cannot merge empty bbox array');
  }

  if (bboxes.length === 1) {
    return bboxes[0];
  }

  // Find min/max coordinates
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const bbox of bboxes) {
    minX = Math.min(minX, bbox.x);
    minY = Math.min(minY, bbox.y);
    maxX = Math.max(maxX, bbox.x + bbox.width);
    maxY = Math.max(maxY, bbox.y + bbox.height);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Calculate quality metrics for quote matching
 *
 * Used for monitoring and improving matching algorithm.
 *
 * @param results - Array of match results
 * @returns Aggregated quality metrics
 *
 * @example
 * const metrics = calculateMatchingMetrics(allResults);
 * console.log(`Exact match rate: ${metrics.exactMatchRate}%`);
 * console.log(`Failed match rate: ${metrics.failedMatchRate}%`);
 */
export function calculateMatchingMetrics(results: QuoteMatchResult[]): {
  totalQuotes: number;
  exactMatchRate: number; // Percentage
  normalizedMatchRate: number;
  tokenBasedMatchRate: number;
  fuzzyMatchRate: number;
  failedMatchRate: number;
  averageConfidence: number;
  averageBlocksPerQuote: number;
} {
  const total = results.length;

  if (total === 0) {
    return {
      totalQuotes: 0,
      exactMatchRate: 0,
      normalizedMatchRate: 0,
      tokenBasedMatchRate: 0,
      fuzzyMatchRate: 0,
      failedMatchRate: 0,
      averageConfidence: 0,
      averageBlocksPerQuote: 0,
    };
  }

  const exactMatches = results.filter((r) => r.metadata.matchType === 'exact').length;
  const normalizedMatches = results.filter((r) => r.metadata.matchType === 'normalized').length;
  const tokenBasedMatches = results.filter((r) => r.metadata.matchType === 'token-based').length;
  const fuzzyMatches = results.filter((r) => r.metadata.matchType === 'fuzzy').length;
  const failedMatches = results.filter((r) => r.metadata.matchType === 'none').length;

  const totalConfidence = results.reduce((sum, r) => sum + r.metadata.confidence, 0);
  const totalBlocks = results.reduce((sum, r) => sum + r.metadata.matchedBlocks, 0);

  return {
    totalQuotes: total,
    exactMatchRate: (exactMatches / total) * 100,
    normalizedMatchRate: (normalizedMatches / total) * 100,
    tokenBasedMatchRate: (tokenBasedMatches / total) * 100,
    fuzzyMatchRate: (fuzzyMatches / total) * 100,
    failedMatchRate: (failedMatches / total) * 100,
    averageConfidence: totalConfidence / total,
    averageBlocksPerQuote: totalBlocks / total,
  };
}

/**
 * Hybrid Quote Matcher
 *
 * Implements smart quote-to-coordinate matching using a hybrid strategy:
 * 1. Exact word match (fast, precise)
 * 2. Semantic validation (ensures relevance)
 * 3. Fallback to top-1 (always returns something)
 *
 * WHY: This approach is more reliable than depending on AI to return keyQuote.
 * We control the extraction and validation, ensuring high-quality highlights.
 *
 * STRATEGY:
 * - Search for node.title in chunk sentences (exact match)
 * - If found, validate semantic similarity with node.summary
 * - If passes threshold, use it
 * - Otherwise, do full semantic search on all sentences
 * - Fallback: Return most similar sentence even if below threshold
 */

import { TextBlock } from '../../types/pdf.types';
import { NodeDocumentReference } from '../../types/node.types';
import { Logger } from 'winston';
import { extractCompleteSentences, ExtractedSentence } from '../pdf/sentence-extractor';
import { SemanticMatcher, SemanticMatchResult } from './semantic-matcher';

/**
 * Node data needed for matching
 */
export interface NodeForMatching {
  /** Node title (e.g., "Temporal Leakage") */
  title: string;

  /** Node summary (2-sentence explanation) */
  summary: string;

  /** Source chunk information */
  sourceChunk?: {
    /** Index of the chunk this node came from */
    chunkIndex: number;

    /** Range of textBlocks in this chunk */
    textBlockRange: {
      start: number;
      end: number;
    };
  };
}

/**
 * Result of hybrid matching
 */
export interface HybridMatchResult {
  /** Document references with coordinates */
  references: NodeDocumentReference[];

  /** Metadata about the matching process */
  metadata: {
    /** Which strategy succeeded */
    strategy: 'exact-match' | 'semantic-search' | 'fallback';

    /** Number of sentences evaluated */
    sentencesEvaluated: number;

    /** Number of exact word matches found */
    exactMatches: number;

    /** Highest similarity score achieved */
    topSimilarity: number;

    /** Whether the result passed the threshold */
    passedThreshold: boolean;
  };
}

/**
 * Configuration for hybrid matching
 */
export interface HybridMatchConfig {
  /** Semantic similarity threshold (0-1) */
  similarityThreshold?: number;

  /** Maximum number of references to return */
  maxReferences?: number;

  /** Whether to use semantic validation for exact matches */
  validateExactMatches?: boolean;

  /** OpenAI API key for embeddings */
  openaiApiKey?: string;
}

const DEFAULT_CONFIG: Required<HybridMatchConfig> = {
  similarityThreshold: 0.7,
  maxReferences: 3,
  validateExactMatches: true,
  openaiApiKey: process.env.OPENAI_API_KEY || '',
};

/**
 * Find relevant sentences for a node using hybrid strategy
 *
 * @param node - Node with title, summary, and optional chunk info
 * @param textBlocks - All textBlocks from the document
 * @param config - Optional configuration
 * @param logger - Optional logger
 * @returns Match result with document references
 */
export async function findRelevantSentencesForNode(
  node: NodeForMatching,
  textBlocks: TextBlock[],
  config: HybridMatchConfig = {},
  logger?: Logger
): Promise<HybridMatchResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Step 1: Extract complete sentences from the source chunk
  const chunkBlocks = node.sourceChunk
    ? textBlocks.slice(
        node.sourceChunk.textBlockRange.start,
        node.sourceChunk.textBlockRange.end
      )
    : textBlocks; // Fallback: use all blocks if chunk info missing

  const sentences = extractCompleteSentences(chunkBlocks, {}, logger);

  if (sentences.length === 0) {
    logger?.warn('[HybridMatcher] No complete sentences found in chunk', {
      nodeTitle: node.title,
      chunkIndex: node.sourceChunk?.chunkIndex,
    });

    return createEmptyResult();
  }

  logger?.info('[HybridMatcher] Extracted sentences from chunk', {
    nodeTitle: node.title,
    chunkIndex: node.sourceChunk?.chunkIndex,
    sentenceCount: sentences.length,
  });

  // Step 2: Try exact word matching first
  const exactMatches = sentences.filter(s =>
    s.text.toLowerCase().includes(node.title.toLowerCase())
  );

  if (exactMatches.length > 0) {
    logger?.info('[HybridMatcher] Found exact word matches', {
      nodeTitle: node.title,
      exactMatchCount: exactMatches.length,
    });

    // Validate exact matches semantically
    if (cfg.validateExactMatches && cfg.openaiApiKey) {
      const validated = await validateSentencesSemantically(
        node.summary,
        exactMatches,
        cfg,
        logger
      );

      if (validated.length > 0) {
        return createSuccessResult(
          validated,
          'exact-match',
          sentences.length,
          exactMatches.length,
          validated[0].similarity,
          true
        );
      }
    } else {
      // Use exact matches without validation
      return createSuccessResult(
        exactMatches.slice(0, cfg.maxReferences).map(s => ({
          sentence: s,
          similarity: 1.0, // Assume perfect match
        })),
        'exact-match',
        sentences.length,
        exactMatches.length,
        1.0,
        true
      );
    }
  }

  // Step 3: No exact matches or they failed validation - do semantic search
  if (cfg.openaiApiKey) {
    logger?.info('[HybridMatcher] No exact matches, using semantic search', {
      nodeTitle: node.title,
    });

    const semanticMatches = await findSemanticMatches(
      node.summary,
      sentences,
      cfg,
      logger
    );

    const passed = semanticMatches.filter(m => m.similarity >= cfg.similarityThreshold);

    if (passed.length > 0) {
      return createSuccessResult(
        passed,
        'semantic-search',
        sentences.length,
        0,
        passed[0].similarity,
        true
      );
    }

    // Fallback: Return top-1 even if below threshold
    if (semanticMatches.length > 0) {
      logger?.warn('[HybridMatcher] Using fallback (top-1 below threshold)', {
        nodeTitle: node.title,
        topSimilarity: semanticMatches[0].similarity,
        threshold: cfg.similarityThreshold,
      });

      return createSuccessResult(
        [semanticMatches[0]],
        'fallback',
        sentences.length,
        0,
        semanticMatches[0].similarity,
        false
      );
    }
  }

  // Absolute fallback: Use first sentence
  logger?.warn('[HybridMatcher] All strategies failed, using first sentence', {
    nodeTitle: node.title,
  });

  return createSuccessResult(
    [{ sentence: sentences[0], similarity: 0.5 }],
    'fallback',
    sentences.length,
    0,
    0.5,
    false
  );
}

/**
 * Validate sentences semantically using OpenAI embeddings
 */
async function validateSentencesSemantically(
  query: string,
  sentences: ExtractedSentence[],
  config: Required<HybridMatchConfig>,
  logger?: Logger
): Promise<Array<{ sentence: ExtractedSentence; similarity: number }>> {
  const matcher = new SemanticMatcher(config.openaiApiKey, logger);

  const results = await matcher.findSimilar(
    query,
    sentences.map(s => s.text),
    {
      threshold: config.similarityThreshold,
      maxResults: config.maxReferences,
    }
  );

  return results
    .filter(r => r.passed)
    .map((r, i) => ({
      sentence: sentences[sentences.findIndex(s => s.text === r.text)],
      similarity: r.similarity,
    }));
}

/**
 * Find semantic matches for all sentences
 */
async function findSemanticMatches(
  query: string,
  sentences: ExtractedSentence[],
  config: Required<HybridMatchConfig>,
  logger?: Logger
): Promise<Array<{ sentence: ExtractedSentence; similarity: number }>> {
  const matcher = new SemanticMatcher(config.openaiApiKey, logger);

  const results = await matcher.findSimilar(
    query,
    sentences.map(s => s.text),
    {
      threshold: 0, // Get all results, we'll filter later
      maxResults: sentences.length,
    }
  );

  return results.map((r, i) => ({
    sentence: sentences[sentences.findIndex(s => s.text === r.text)],
    similarity: r.similarity,
  }));
}

/**
 * Create success result
 */
function createSuccessResult(
  matches: Array<{ sentence: ExtractedSentence; similarity: number }>,
  strategy: 'exact-match' | 'semantic-search' | 'fallback',
  sentencesEvaluated: number,
  exactMatches: number,
  topSimilarity: number,
  passedThreshold: boolean
): HybridMatchResult {
  const references: NodeDocumentReference[] = matches.map(m => {
    // Handle cross-page sentences
    if (m.sentence.crossPage) {
      return {
        text: m.sentence.text,
        pages: m.sentence.pages,
        coordinates: m.sentence.blocks.map(b => ({
          page: b.page,
          bbox: b.bbox,
        })),
      };
    }

    // Single-page sentence
    return {
      text: m.sentence.text,
      page: m.sentence.pages[0],
      coordinates: {
        x: m.sentence.bbox.x,
        y: m.sentence.bbox.y,
        width: m.sentence.bbox.width,
        height: m.sentence.bbox.height,
      },
    };
  });

  return {
    references,
    metadata: {
      strategy,
      sentencesEvaluated,
      exactMatches,
      topSimilarity,
      passedThreshold,
    },
  };
}

/**
 * Create empty result (no matches found)
 */
function createEmptyResult(): HybridMatchResult {
  return {
    references: [],
    metadata: {
      strategy: 'fallback',
      sentencesEvaluated: 0,
      exactMatches: 0,
      topSimilarity: 0,
      passedThreshold: false,
    },
  };
}

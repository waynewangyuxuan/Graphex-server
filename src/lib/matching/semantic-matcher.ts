/**
 * Semantic Matcher
 *
 * Uses OpenAI embeddings to find semantically similar sentences.
 * Implements caching to avoid redundant API calls and improve performance.
 *
 * WHY: We need to validate that extracted sentences are actually relevant
 * to the node concept, not just matching by keyword. Semantic similarity
 * ensures we highlight text that truly explains the concept.
 */

import OpenAI from 'openai';
import { Logger } from 'winston';

/**
 * Result of semantic matching
 */
export interface SemanticMatchResult {
  /** The text that was matched */
  text: string;

  /** Cosine similarity score (0-1, higher is better) */
  similarity: number;

  /** Whether this match passed the threshold */
  passed: boolean;
}

/**
 * Configuration for semantic matching
 */
export interface SemanticMatchConfig {
  /** Minimum similarity threshold (0-1) */
  threshold?: number;

  /** OpenAI embedding model to use */
  embeddingModel?: string;

  /** Maximum number of results to return */
  maxResults?: number;
}

const DEFAULT_CONFIG: Required<SemanticMatchConfig> = {
  threshold: 0.7,
  embeddingModel: 'text-embedding-3-small', // Faster and cheaper
  maxResults: 3,
};

/**
 * Semantic Matcher class with embedding caching
 */
export class SemanticMatcher {
  private openai: OpenAI;
  private embeddingCache: Map<string, number[]>;
  private logger?: Logger;

  constructor(apiKey: string, logger?: Logger) {
    this.openai = new OpenAI({ apiKey });
    this.embeddingCache = new Map();
    this.logger = logger;
  }

  /**
   * Find sentences semantically similar to a query
   *
   * @param query - The text to match against (e.g., node summary)
   * @param candidates - Array of candidate texts to search
   * @param config - Optional configuration
   * @returns Array of matches sorted by similarity (highest first)
   */
  async findSimilar(
    query: string,
    candidates: string[],
    config: SemanticMatchConfig = {}
  ): Promise<SemanticMatchResult[]> {
    const cfg = { ...DEFAULT_CONFIG, ...config };

    if (!query || candidates.length === 0) {
      return [];
    }

    try {
      // Get embedding for query
      const queryEmbedding = await this.getEmbedding(query);

      // Get embeddings for all candidates
      const candidateEmbeddings = await Promise.all(
        candidates.map(text => this.getEmbedding(text))
      );

      // Calculate cosine similarities
      const results: SemanticMatchResult[] = candidates.map((text, i) => {
        const similarity = this.cosineSimilarity(
          queryEmbedding,
          candidateEmbeddings[i]
        );

        return {
          text,
          similarity,
          passed: similarity >= cfg.threshold,
        };
      });

      // Sort by similarity (highest first)
      results.sort((a, b) => b.similarity - a.similarity);

      // Return top N results
      return results.slice(0, cfg.maxResults);
    } catch (error) {
      this.logger?.error('[SemanticMatcher] Error during matching', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get embedding for text (with caching)
   */
  private async getEmbedding(text: string): Promise<number[]> {
    // Check cache first
    if (this.embeddingCache.has(text)) {
      this.logger?.debug('[SemanticMatcher] Cache hit for embedding');
      return this.embeddingCache.get(text)!;
    }

    // Generate embedding
    this.logger?.debug('[SemanticMatcher] Generating embedding', {
      textLength: text.length,
    });

    const response = await this.openai.embeddings.create({
      model: DEFAULT_CONFIG.embeddingModel,
      input: text,
    });

    const embedding = response.data[0].embedding;

    // Cache it
    this.embeddingCache.set(text, embedding);

    return embedding;
  }

  /**
   * Calculate cosine similarity between two embeddings
   *
   * Formula: cos(θ) = (A · B) / (||A|| * ||B||)
   * Result: 0-1 (higher is more similar)
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have same length');
    }

    // Dot product
    let dotProduct = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
    }

    // Magnitudes
    let magnitudeA = 0;
    let magnitudeB = 0;
    for (let i = 0; i < a.length; i++) {
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    // Avoid division by zero
    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Clear the embedding cache (useful for testing or memory management)
   */
  clearCache(): void {
    this.embeddingCache.clear();
    this.logger?.debug('[SemanticMatcher] Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hits: number } {
    return {
      size: this.embeddingCache.size,
      hits: 0, // Can be tracked separately if needed
    };
  }
}

/**
 * Helper function for one-off semantic matching without instantiating class
 */
export async function findSemanticMatches(
  query: string,
  candidates: string[],
  apiKey: string,
  config?: SemanticMatchConfig,
  logger?: Logger
): Promise<SemanticMatchResult[]> {
  const matcher = new SemanticMatcher(apiKey, logger);
  return matcher.findSimilar(query, candidates, config);
}

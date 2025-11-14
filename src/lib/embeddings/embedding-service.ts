/**
 * Embedding Service
 *
 * WHY: Provides semantic embeddings for text deduplication and similarity search.
 * Uses OpenAI text-embedding-3-large (1536 dimensions) as a high-quality,
 * cost-effective alternative to local GTE-large models.
 *
 * Cost: ~$0.00013 per 1K tokens (~$0.002 for 20 nodes)
 * Quality: Comparable to GTE-large on semantic similarity tasks
 *
 * Future: Can swap to local GTE-large or other models without changing interface
 */

import OpenAI from 'openai';
import { Logger } from 'winston';

/**
 * Configuration for embedding service
 */
interface EmbeddingConfig {
  /** OpenAI API key */
  apiKey: string;

  /** Model to use for embeddings */
  model: 'text-embedding-3-large' | 'text-embedding-3-small';

  /** Batch size for API calls (max 2048 for OpenAI) */
  batchSize: number;

  /** Request timeout in milliseconds */
  timeout: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Partial<EmbeddingConfig> = {
  model: 'text-embedding-3-large', // 1536 dimensions, high quality
  batchSize: 100, // Process 100 texts per API call
  timeout: 30000, // 30 seconds
};

/**
 * Embedding service for generating semantic embeddings
 */
export class EmbeddingService {
  private readonly client: OpenAI;
  private readonly config: EmbeddingConfig;

  constructor(
    config: EmbeddingConfig,
    private readonly logger: Logger,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config } as EmbeddingConfig;
    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      timeout: this.config.timeout,
    });

    this.logger.info('Embedding Service initialized', {
      model: this.config.model,
      batchSize: this.config.batchSize,
    });
  }

  /**
   * Generate embeddings for an array of texts
   *
   * @param texts - Array of text strings to embed
   * @returns Array of embedding vectors (each is number[])
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const startTime = Date.now();

    try {
      // Process in batches to avoid API limits
      const batches = this.chunkArray(texts, this.config.batchSize);
      const allEmbeddings: number[][] = [];

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        if (!batch || batch.length === 0) continue;

        this.logger.debug('Generating embeddings batch', {
          batchIndex: i + 1,
          totalBatches: batches.length,
          batchSize: batch.length,
        });

        const response = await this.client.embeddings.create({
          model: this.config.model,
          input: batch as string[],
          encoding_format: 'float', // Get actual numbers, not base64
        });

        // Extract embeddings in original order
        const batchEmbeddings = response.data.map((item) => item.embedding);
        allEmbeddings.push(...batchEmbeddings);

        // Log usage for cost tracking
        this.logger.debug('Embeddings generated', {
          tokensUsed: response.usage.total_tokens,
          costEstimate: this.estimateCost(response.usage.total_tokens),
        });
      }

      this.logger.info('All embeddings generated', {
        textCount: texts.length,
        durationMs: Date.now() - startTime,
        avgDimensions: allEmbeddings[0]?.length || 0,
      });

      return allEmbeddings;
    } catch (error) {
      this.logger.error('Failed to generate embeddings', {
        error: error instanceof Error ? error.message : String(error),
        textCount: texts.length,
      });

      throw new Error(
        `Embedding generation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Generate embedding for a single text
   *
   * @param text - Text string to embed
   * @returns Embedding vector
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const embeddings = await this.generateEmbeddings([text]);
    const embedding = embeddings[0];
    if (!embedding) {
      throw new Error('Failed to generate embedding for text');
    }
    return embedding;
  }

  /**
   * Compute cosine similarity between two embedding vectors
   *
   * @param vecA - First embedding vector
   * @param vecB - Second embedding vector
   * @returns Cosine similarity (0.0 to 1.0)
   */
  static cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have same dimension');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      const valA = vecA[i];
      const valB = vecB[i];
      if (valA === undefined || valB === undefined) continue;

      dotProduct += valA * valB;
      normA += valA * valA;
      normB += valB * valB;
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }

  /**
   * Estimate cost for embedding generation
   *
   * @param tokens - Number of tokens processed
   * @returns Estimated cost in USD
   */
  private estimateCost(tokens: number): number {
    // text-embedding-3-large: $0.13 per 1M tokens
    const pricePerMillion = 0.13;
    return (tokens / 1_000_000) * pricePerMillion;
  }

  /**
   * Chunk array into batches
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Get embedding dimensions for current model
   */
  getDimensions(): number {
    return this.config.model === 'text-embedding-3-large' ? 1536 : 512;
  }
}

/**
 * Text Chunking Library
 *
 * WHY: Splits large documents into AI-processable chunks while preserving context.
 * Uses smart boundary detection (chapters > paragraphs > sentences) and overlap
 * to maintain semantic continuity between chunks.
 *
 * Updated parameters based on review:
 * - Max chunk size: 30k chars (~7.5k tokens, ~10 pages) - Better AI focus
 * - Overlap: 1k chars (~250 tokens) - Stronger context preservation
 */

import { Logger } from 'winston';
import {
  ChunkingConfig,
  ChunkingResult,
  TextChunk,
  ChunkMetadata,
  ChunkingError,
  ChunkingErrorCode,
  ChunkingStatistics,
} from '../../types/chunking.types';

/**
 * Default configuration optimized for graph generation quality
 * WHY these values: Smaller chunks = better AI focus on key concepts
 */
const DEFAULT_CONFIG: ChunkingConfig = {
  maxChunkSize: 30000,       // ~7.5k tokens (~10 pages) - down from 40k for quality
  overlapSize: 1000,         // ~250 tokens - up from 800 for better context
  minChunkSize: 1000,        // Avoid tiny fragments
  separators: [
    '\n# ',                  // Markdown H1 chapters
    '\n## ',                 // Markdown H2 sections
    '\n### ',                // Markdown H3 subsections
    '\n\n',                  // Paragraphs (most common)
    '. ',                    // Sentences
    ' ',                     // Words (last resort)
  ],
  preserveMarkdown: true,
};

/**
 * Main text chunking service
 */
export class TextChunker {
  private readonly config: ChunkingConfig;

  constructor(
    private readonly logger: Logger,
    config?: Partial<ChunkingConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Main entry point: chunk a document into overlapping pieces
   *
   * WHY: Large documents exceed AI context limits and reduce quality.
   * Chunking allows parallel processing and better concept extraction.
   */
  async chunk(text: string, documentTitle?: string): Promise<ChunkingResult> {
    const startTime = Date.now();

    // Validate input
    this.validateInput(text);

    // Check if chunking is needed
    if (text.length <= this.config.minChunkSize) {
      return this.createSingleChunkResult(text, documentTitle);
    }

    // Detect document structure
    const structure = this.analyzeStructure(text);

    // Perform smart chunking
    const chunks = this.performChunking(text, structure);

    // Add overlap between chunks
    const chunksWithOverlap = this.addOverlap(chunks, text);

    // Calculate statistics
    const statistics = this.calculateStatistics(chunksWithOverlap, text.length);

    // Build result
    const result: ChunkingResult = {
      chunks: chunksWithOverlap,
      documentMetadata: {
        totalCharacters: text.length,
        totalWords: this.countWords(text),
        documentType: structure.type,
        title: documentTitle || structure.title,
      },
      statistics,
    };

    this.logger.info('Document chunked successfully', {
      totalChunks: chunks.length,
      avgChunkSize: statistics.averageChunkSize,
      qualityScore: statistics.qualityScore,
      durationMs: Date.now() - startTime,
    });

    return result;
  }

  /**
   * Validate input text
   */
  private validateInput(text: string): void {
    if (!text || text.trim().length === 0) {
      throw new ChunkingError(
        'Document text is empty',
        ChunkingErrorCode.DOCUMENT_TOO_SHORT,
      );
    }

    if (text.length < this.config.minChunkSize) {
      this.logger.warn('Document is very short', {
        length: text.length,
        minSize: this.config.minChunkSize,
      });
    }

    if (text.length > 200000) {
      // ~50k tokens, ~140 pages
      this.logger.warn('Document is very large, may be expensive to process', {
        length: text.length,
        estimatedCost: this.estimateCost(text.length),
      });
    }
  }

  /**
   * Create result for documents that don't need chunking
   */
  private createSingleChunkResult(
    text: string,
    documentTitle?: string,
  ): ChunkingResult {
    const chunk: TextChunk = {
      id: 'chunk_0',
      content: text,
      startIndex: 0,
      endIndex: text.length,
      chunkIndex: 0,
      totalChunks: 1,
      estimatedTokens: Math.ceil(text.length / 4),
      overlapWithPrevious: 0,
      overlapWithNext: 0,
      metadata: {
        title: documentTitle,
        headings: this.extractHeadings(text).map((h) => h.text),
        splitMethod: 'paragraph',
        quality: {
          hasCleanBoundaries: true,
          isOptimalSize: true,
          hasSufficientContext: true,
        },
        wordCount: this.countWords(text),
        lineCount: text.split('\n').length,
      },
    };

    return {
      chunks: [chunk],
      documentMetadata: {
        totalCharacters: text.length,
        totalWords: this.countWords(text),
        documentType: this.detectDocumentType(text),
        title: documentTitle,
      },
      statistics: {
        totalChunks: 1,
        averageChunkSize: text.length,
        minChunkSize: text.length,
        maxChunkSize: text.length,
        totalOverlapCharacters: 0,
        overlapPercentage: 0,
        qualityScore: 100,
        warnings: [],
      },
    };
  }

  /**
   * Analyze document structure to inform chunking strategy
   */
  private analyzeStructure(text: string): {
    type: 'markdown' | 'plain' | 'structured';
    title?: string;
    headings: Array<{ level: number; text: string; position: number }>;
    paragraphs: number;
  } {
    const headings = this.extractHeadings(text);
    const paragraphs = text.split(/\n\n+/).length;

    // Detect type
    let type: 'markdown' | 'plain' | 'structured' = 'plain';
    if (headings.length > 0) {
      type = 'markdown';
    } else if (paragraphs > 10) {
      type = 'structured';
    }

    // Extract title (first H1 heading or first line)
    const title =
      headings.length > 0 ? headings[0].text : text.split('\n')[0] || 'Untitled';

    return { type, title, headings, paragraphs };
  }

  /**
   * Extract markdown headings from text
   */
  private extractHeadings(
    text: string,
  ): Array<{ level: number; text: string; position: number }> {
    const headings: Array<{ level: number; text: string; position: number }> =
      [];
    const lines = text.split('\n');
    let position = 0;

    for (const line of lines) {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        headings.push({
          level: match[1].length,
          text: match[2].trim(),
          position,
        });
      }
      position += line.length + 1; // +1 for newline
    }

    return headings;
  }

  /**
   * Perform smart chunking using boundary priority
   *
   * Algorithm: Greedy chunking with look-ahead
   * WHY: Balance between optimal chunk size and semantic boundaries
   */
  private performChunking(
    text: string,
    structure: { headings: Array<{ level: number; text: string; position: number }> },
  ): Array<{ content: string; startIndex: number; endIndex: number; splitMethod: ChunkMetadata['splitMethod'] }> {
    const chunks: Array<{
      content: string;
      startIndex: number;
      endIndex: number;
      splitMethod: ChunkMetadata['splitMethod'];
    }> = [];

    let currentIndex = 0;

    while (currentIndex < text.length) {
      const remainingText = text.slice(currentIndex);

      // If remaining text fits in one chunk, take it all
      if (remainingText.length <= this.config.maxChunkSize) {
        chunks.push({
          content: remainingText,
          startIndex: currentIndex,
          endIndex: text.length,
          splitMethod: 'paragraph',
        });
        break;
      }

      // Find best split point
      const splitResult = this.findBestSplitPoint(
        remainingText,
        this.config.maxChunkSize,
      );

      chunks.push({
        content: text.slice(currentIndex, currentIndex + splitResult.position),
        startIndex: currentIndex,
        endIndex: currentIndex + splitResult.position,
        splitMethod: splitResult.method,
      });

      currentIndex += splitResult.position;
    }

    return chunks;
  }

  /**
   * Find the best split point using boundary priority
   *
   * Priority: Chapter > Section > Paragraph > Sentence > Word
   */
  private findBestSplitPoint(
    text: string,
    maxSize: number,
  ): { position: number; method: ChunkMetadata['splitMethod'] } {
    // Try each separator in priority order
    for (const separator of this.config.separators) {
      const position = this.findSplitWithSeparator(text, maxSize, separator);

      if (position > 0) {
        return {
          position,
          method: this.getSplitMethodFromSeparator(separator),
        };
      }
    }

    // Last resort: hard split at maxSize
    this.logger.warn('Using hard split (no semantic boundary found)', {
      position: maxSize,
    });

    return { position: maxSize, method: 'hard_limit' };
  }

  /**
   * Find split point using a specific separator
   * Returns 0 if no suitable split found
   */
  private findSplitWithSeparator(
    text: string,
    maxSize: number,
    separator: string,
  ): number {
    // Search backwards from maxSize to find last occurrence
    const searchText = text.slice(0, maxSize);
    const lastIndex = searchText.lastIndexOf(separator);

    if (lastIndex > this.config.minChunkSize) {
      // Found a good split point
      return lastIndex + separator.length;
    }

    return 0; // No suitable split found
  }

  /**
   * Map separator to split method for metadata
   */
  private getSplitMethodFromSeparator(
    separator: string,
  ): ChunkMetadata['splitMethod'] {
    if (separator.includes('# ')) return 'chapter';
    if (separator.includes('## ')) return 'section';
    if (separator === '\n\n') return 'paragraph';
    if (separator === '. ') return 'sentence';
    if (separator === ' ') return 'word';
    return 'paragraph';
  }

  /**
   * Add overlap between chunks for context continuity
   *
   * WHY: Overlap ensures AI sees context from previous chunk,
   * improving concept extraction quality at chunk boundaries.
   */
  private addOverlap(
    chunks: Array<{ content: string; startIndex: number; endIndex: number; splitMethod: ChunkMetadata['splitMethod'] }>,
    fullText: string,
  ): TextChunk[] {
    return chunks.map((chunk, index) => {
      // Calculate overlap with previous chunk
      let overlapWithPrevious = 0;
      let content = chunk.content;

      if (index > 0) {
        overlapWithPrevious = Math.min(
          this.config.overlapSize,
          chunks[index - 1].content.length,
        );

        // Prepend last N chars from previous chunk
        const previousChunk = chunks[index - 1];
        const overlapText = previousChunk.content.slice(-overlapWithPrevious);
        content = overlapText + chunk.content;
      }

      // Calculate overlap with next chunk
      let overlapWithNext = 0;
      if (index < chunks.length - 1) {
        overlapWithNext = Math.min(
          this.config.overlapSize,
          chunk.content.length,
        );
      }

      // Extract headings from this chunk
      const chunkHeadings = this.extractHeadings(chunk.content)
        .map((h) => h.text)
        .filter((text): text is string => text !== undefined);

      const textChunk: TextChunk = {
        id: `chunk_${index}`,
        content,
        startIndex: chunk.startIndex - overlapWithPrevious,
        endIndex: chunk.endIndex,
        chunkIndex: index,
        totalChunks: chunks.length,
        estimatedTokens: Math.ceil(content.length / 4),
        overlapWithPrevious,
        overlapWithNext,
        metadata: {
          title: chunkHeadings.length > 0 ? chunkHeadings[0] : undefined,
          headings: chunkHeadings,
          splitMethod: chunk.splitMethod,
          quality: {
            hasCleanBoundaries: chunk.splitMethod !== 'hard_limit',
            isOptimalSize:
              content.length >= this.config.minChunkSize &&
              content.length <= this.config.maxChunkSize,
            hasSufficientContext: overlapWithPrevious > 0 || index === 0,
          },
          wordCount: this.countWords(content),
          lineCount: content.split('\n').length,
        },
      };

      return textChunk;
    });
  }

  /**
   * Calculate statistics about chunking quality
   */
  private calculateStatistics(
    chunks: TextChunk[],
    totalChars: number,
  ): ChunkingStatistics {
    const sizes = chunks.map((c) => c.content.length);
    const totalOverlap = chunks.reduce(
      (sum, c) => sum + c.overlapWithPrevious,
      0,
    );

    const warnings: string[] = [];

    // Check for quality issues
    const hardSplits = chunks.filter(
      (c) => c.metadata.splitMethod === 'hard_limit',
    );
    if (hardSplits.length > 0) {
      warnings.push(
        `${hardSplits.length} chunks split at hard limit (no semantic boundary)`,
      );
    }

    const tooSmall = chunks.filter(
      (c) => c.content.length < this.config.minChunkSize,
    );
    if (tooSmall.length > 0) {
      warnings.push(`${tooSmall.length} chunks below minimum size`);
    }

    // Calculate quality score (0-100)
    let qualityScore = 100;
    qualityScore -= hardSplits.length * 10; // -10 per hard split
    qualityScore -= tooSmall.length * 5; // -5 per small chunk
    qualityScore = Math.max(0, qualityScore);

    return {
      totalChunks: chunks.length,
      averageChunkSize: Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length),
      minChunkSize: Math.min(...sizes),
      maxChunkSize: Math.max(...sizes),
      totalOverlapCharacters: totalOverlap,
      overlapPercentage: (totalOverlap / totalChars) * 100,
      qualityScore,
      warnings,
    };
  }

  /**
   * Detect document type
   */
  private detectDocumentType(text: string): 'markdown' | 'plain' | 'structured' {
    if (text.match(/^#{1,6}\s+/m)) return 'markdown';
    if (text.split(/\n\n+/).length > 10) return 'structured';
    return 'plain';
  }

  /**
   * Count words in text
   */
  private countWords(text: string): number {
    return text.split(/\s+/).filter((word) => word.length > 0).length;
  }

  /**
   * Estimate processing cost (for logging)
   */
  private estimateCost(textLength: number): number {
    const tokens = textLength / 4;
    const chunks = Math.ceil(textLength / this.config.maxChunkSize);
    const COST_PER_1K_TOKENS = 0.003; // Claude Sonnet 4 input

    return (tokens / 1000) * COST_PER_1K_TOKENS * chunks;
  }
}

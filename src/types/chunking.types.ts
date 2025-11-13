/**
 * Text Chunking Types
 *
 * WHY: Define type-safe interfaces for document chunking operations.
 * Used by text-chunker library to split large documents intelligently.
 */

/**
 * Configuration for text chunking strategy
 */
export interface ChunkingConfig {
  /** Maximum characters per chunk (default: 40,000 = ~10,000 tokens) */
  maxChunkSize: number;

  /** Overlap between chunks in characters (default: 800 = ~200 tokens) */
  overlapSize: number;

  /**
   * Minimum chunk size to avoid tiny fragments (default: 1,000 chars)
   * WHY: Chunks below this are merged with adjacent chunks
   */
  minChunkSize: number;

  /**
   * Separator priorities for splitting (tried in order)
   * WHY: Prefer semantic boundaries (chapters > sections > paragraphs > sentences)
   */
  separators: string[];

  /**
   * Preserve markdown structure during chunking
   * WHY: Keeps headings and formatting intact for better context
   */
  preserveMarkdown: boolean;
}

/**
 * A single chunk of text with metadata
 */
export interface TextChunk {
  /** Unique identifier for this chunk */
  id: string;

  /** The actual text content */
  content: string;

  /** Character position in original document (0-indexed) */
  startIndex: number;

  /** Character position where chunk ends (exclusive) */
  endIndex: number;

  /** Chunk sequence number (0-indexed) */
  chunkIndex: number;

  /** Total number of chunks in the document */
  totalChunks: number;

  /** Estimated token count (using 4 chars = 1 token heuristic) */
  estimatedTokens: number;

  /**
   * Overlap with previous chunk (in characters)
   * WHY: Maintains context continuity between chunks
   */
  overlapWithPrevious: number;

  /**
   * Overlap with next chunk (in characters)
   */
  overlapWithNext: number;

  /**
   * Metadata extracted from chunk
   */
  metadata: ChunkMetadata;
}

/**
 * Metadata about a chunk's content and context
 */
export interface ChunkMetadata {
  /** Document title or first heading found */
  title?: string;

  /** Section headings found in this chunk */
  headings: string[];

  /**
   * How this chunk was split (for debugging)
   * e.g., "paragraph", "sentence", "word", "hard_limit"
   */
  splitMethod: 'chapter' | 'section' | 'paragraph' | 'sentence' | 'word' | 'hard_limit';

  /**
   * Quality indicators
   */
  quality: {
    /** Does chunk start/end at semantic boundaries? */
    hasCleanBoundaries: boolean;

    /** Is chunk within recommended size range? */
    isOptimalSize: boolean;

    /** Does chunk have sufficient context? */
    hasSufficientContext: boolean;
  };

  /** Word count in this chunk */
  wordCount: number;

  /** Line count in this chunk */
  lineCount: number;
}

/**
 * Result of chunking operation
 */
export interface ChunkingResult {
  /** Array of text chunks */
  chunks: TextChunk[];

  /** Original document metadata */
  documentMetadata: {
    /** Total characters in original document */
    totalCharacters: number;

    /** Total words in original document */
    totalWords: number;

    /** Detected document structure (markdown, plain text, etc.) */
    documentType: 'markdown' | 'plain' | 'structured';

    /** Main title/heading from document */
    title?: string;
  };

  /** Statistics about the chunking operation */
  statistics: ChunkingStatistics;
}

/**
 * Statistics about chunking quality and efficiency
 */
export interface ChunkingStatistics {
  /** Total chunks created */
  totalChunks: number;

  /** Average chunk size in characters */
  averageChunkSize: number;

  /** Smallest chunk size */
  minChunkSize: number;

  /** Largest chunk size */
  maxChunkSize: number;

  /** Total overlap characters across all chunks */
  totalOverlapCharacters: number;

  /** Percentage of document that is overlap (efficiency metric) */
  overlapPercentage: number;

  /**
   * Quality score (0-100)
   * WHY: High score = clean boundaries, optimal sizes, good context
   */
  qualityScore: number;

  /**
   * Warnings about chunking quality
   */
  warnings: string[];
}

/**
 * Error thrown during chunking operations
 */
export class ChunkingError extends Error {
  constructor(
    message: string,
    public readonly code: ChunkingErrorCode,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ChunkingError';
  }
}

/**
 * Chunking error codes
 */
export enum ChunkingErrorCode {
  DOCUMENT_TOO_SHORT = 'DOCUMENT_TOO_SHORT',
  DOCUMENT_TOO_LONG = 'DOCUMENT_TOO_LONG',
  INVALID_CONFIG = 'INVALID_CONFIG',
  CHUNKING_FAILED = 'CHUNKING_FAILED',
}

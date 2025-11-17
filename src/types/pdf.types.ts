/**
 * PDF Extraction Type Definitions
 *
 * Types for coordinate-based PDF text extraction with spatial positioning.
 * Supports precise text highlighting in frontend by providing bounding boxes
 * for each text block.
 */

/**
 * Bounding box coordinates in PDF coordinate system
 *
 * PDF Coordinate System:
 * - Origin (0,0) is at bottom-left corner of page
 * - X increases from left to right
 * - Y increases from bottom to top
 * - Units are in PDF points (1 point = 1/72 inch)
 */
export interface BoundingBox {
  x: number;      // Left position in PDF points
  y: number;      // Bottom position in PDF points (NOT top)
  width: number;  // Width in PDF points
  height: number; // Height in PDF points
}

/**
 * Single text block with spatial coordinates
 *
 * Text blocks are semantically meaningful units (sentences, paragraphs)
 * combined from individual text items for better highlighting precision.
 */
export interface TextBlock {
  text: string;           // The actual text content
  page: number;           // Page number (0-indexed)
  bbox: BoundingBox;      // Bounding box coordinates
}

/**
 * Complete PDF extraction result
 *
 * Includes both full text (for AI processing) and coordinate-mapped
 * text blocks (for precise frontend highlighting).
 */
export interface PDFExtractionResult {
  fullText: string;           // Complete text content for AI processing
  textBlocks: TextBlock[];    // Text blocks with coordinates for highlighting
  totalPages: number;         // Total number of pages
  metadata: PDFMetadata;      // Document metadata
}

/**
 * PDF document metadata
 *
 * Extracted from PDF info dictionary.
 * All fields are optional as not all PDFs include metadata.
 */
export interface PDFMetadata {
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
  producer?: string;
  createdDate?: string;  // ISO 8601 format
  modifiedDate?: string; // ISO 8601 format
}

/**
 * Raw text item from pdfjs-dist getTextContent()
 *
 * Internal type representing a single text item from PDF.js
 * before combination into text blocks.
 */
export interface RawTextItem {
  str: string;           // Text content
  transform: number[];   // [scaleX, skewY, skewX, scaleY, x, y]
  width: number;         // Width in PDF points
  height: number;        // Height in PDF points
  fontName?: string;     // Font name (for advanced processing)
}

/**
 * Configuration for PDF extraction
 */
export interface PDFExtractionConfig {
  /**
   * Combine adjacent text items on same line
   * Default: true
   *
   * When true, combines text items that are on the same line
   * into single text blocks for better highlighting.
   */
  combineTextBlocks?: boolean;

  /**
   * Y-coordinate threshold for same-line detection (in PDF points)
   * Default: 2
   *
   * Text items with Y coordinates within this threshold
   * are considered to be on the same line.
   */
  sameLineThreshold?: number;

  /**
   * X-coordinate threshold for adjacent text detection (in PDF points)
   * Default: 5
   *
   * Text items with X coordinates within this threshold
   * are considered adjacent and will be combined.
   */
  adjacentTextThreshold?: number;

  /**
   * Maximum page processing time in milliseconds
   * Default: 60000 (60 seconds)
   *
   * If processing a single page exceeds this time, it will be skipped.
   */
  pageTimeout?: number;

  /**
   * Include empty text blocks
   * Default: false
   *
   * When false, filters out text blocks with only whitespace.
   */
  includeEmptyBlocks?: boolean;
}

/**
 * Quality metrics for PDF extraction
 */
export interface ExtractionQualityMetrics {
  totalTextBlocks: number;           // Total number of text blocks extracted
  pagesProcessed: number;            // Number of pages successfully processed
  pagesSkipped: number;              // Number of pages skipped due to errors
  averageBlocksPerPage: number;      // Average text blocks per page
  coordinateExtractionRate: number;  // Percentage of blocks with valid coordinates (0-1)
  warnings: string[];                // List of warnings during extraction
}

/**
 * Page Marker Formatter
 *
 * Formats document text with page markers (PAGE 1:, PAGE 2:, etc.) for AI processing.
 * This enables the AI to identify which page a concept appears on, facilitating
 * precise coordinate-based references in the generated knowledge graph.
 *
 * WHY: AI needs page context to return page numbers for each node. Without page
 * markers, AI cannot determine which page a concept is from, making coordinate
 * matching impossible.
 *
 * ARCHITECTURE:
 * - Input: Full document text + textBlocks with page numbers
 * - Process: Group text blocks by page, insert PAGE markers
 * - Output: Formatted text string with clear page boundaries
 *
 * EXAMPLE OUTPUT:
 * ```
 * PAGE 0:
 * Introduction to Photosynthesis
 * Photosynthesis is the process by which plants convert light energy...
 *
 * PAGE 1:
 * The Role of Chlorophyll
 * Chlorophyll is the green pigment found in plants...
 * ```
 *
 * @see src/lib/pdf/MATCHING_META.md for complete algorithm documentation
 */

import { TextBlock } from '../../types/pdf.types';
import { Logger } from 'winston';

/**
 * Result of page marker formatting
 */
export interface PageMarkerFormattingResult {
  /**
   * Formatted text with PAGE markers
   */
  formattedText: string;

  /**
   * Metadata about formatting
   */
  metadata: {
    totalPages: number;
    totalBlocks: number;
    averageBlocksPerPage: number;
    emptyPages: number[];
  };
}

/**
 * Configuration for page marker formatting
 */
export interface PageMarkerFormatterConfig {
  /**
   * Include page markers (default: true)
   * Set to false to get plain text without markers
   */
  includeMarkers?: boolean;

  /**
   * Separator between pages (default: double newline)
   */
  pageSeparator?: string;

  /**
   * Minimum text length per page to include (default: 10 characters)
   * Pages with less text are marked as empty but still included
   */
  minPageLength?: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<PageMarkerFormatterConfig> = {
  includeMarkers: true,
  pageSeparator: '\n\n',
  minPageLength: 10,
};

/**
 * Format document text with page markers
 *
 * ALGORITHM:
 * 1. Group textBlocks by page number
 * 2. Sort pages in ascending order
 * 3. For each page:
 *    a. Insert "PAGE {pageNum}:" marker
 *    b. Concatenate all text blocks from that page
 *    c. Preserve paragraph breaks between blocks
 * 4. Join pages with separator
 *
 * EDGE CASES:
 * - Empty pages: Include marker but no content
 * - Missing page numbers: Group under page 0
 * - Duplicate page numbers: Merge text blocks
 * - Non-sequential pages: Fill gaps with empty markers (optional)
 *
 * @param fullText - Original full text (fallback if textBlocks empty)
 * @param textBlocks - Array of text blocks with page numbers
 * @param config - Optional configuration
 * @param logger - Optional logger for warnings
 * @returns Formatted text with page markers and metadata
 *
 * @example
 * const result = formatTextWithPageMarkers(
 *   fullText,
 *   textBlocks,
 *   { includeMarkers: true }
 * );
 * console.log(result.formattedText);
 * // PAGE 0:
 * // Introduction to Photosynthesis...
 * //
 * // PAGE 1:
 * // The Role of Chlorophyll...
 */
export function formatTextWithPageMarkers(
  fullText: string,
  textBlocks: TextBlock[],
  config: PageMarkerFormatterConfig = {},
  logger?: Logger,
): PageMarkerFormattingResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Edge case: No text blocks provided, return full text as single page
  if (!textBlocks || textBlocks.length === 0) {
    logger?.warn('[formatTextWithPageMarkers] No text blocks provided, using full text as page 0');

    return {
      formattedText: cfg.includeMarkers ? `PAGE 0:\n${fullText}` : fullText,
      metadata: {
        totalPages: 1,
        totalBlocks: 0,
        averageBlocksPerPage: 0,
        emptyPages: [],
      },
    };
  }

  // Step 1: Group text blocks by page
  const pageMap = new Map<number, TextBlock[]>();

  for (const block of textBlocks) {
    const page = block.page ?? 0; // Default to page 0 if missing

    if (!pageMap.has(page)) {
      pageMap.set(page, []);
    }

    pageMap.get(page)!.push(block);
  }

  // Step 2: Sort pages in ascending order
  const sortedPages = Array.from(pageMap.keys()).sort((a, b) => a - b);

  // Step 3: Build formatted text
  const pageTexts: string[] = [];
  const emptyPages: number[] = [];

  for (const pageNum of sortedPages) {
    const blocks = pageMap.get(pageNum)!;

    // Concatenate all text blocks from this page
    const pageText = blocks
      .map((block) => block.text.trim())
      .filter((text) => text.length > 0)
      .join('\n'); // Preserve paragraph breaks

    // Check if page is effectively empty
    if (pageText.length < cfg.minPageLength) {
      emptyPages.push(pageNum);
      logger?.debug(`[formatTextWithPageMarkers] Page ${pageNum} is empty or too short`);
    }

    // Add page marker if enabled
    if (cfg.includeMarkers) {
      pageTexts.push(`PAGE ${pageNum}:\n${pageText}`);
    } else {
      pageTexts.push(pageText);
    }
  }

  // Step 4: Join pages with separator
  const formattedText = pageTexts.join(cfg.pageSeparator);

  // Build metadata
  const totalPages = sortedPages.length;
  const totalBlocks = textBlocks.length;
  const averageBlocksPerPage = totalBlocks / totalPages;

  return {
    formattedText,
    metadata: {
      totalPages,
      totalBlocks,
      averageBlocksPerPage: Math.round(averageBlocksPerPage * 10) / 10, // Round to 1 decimal
      emptyPages,
    },
  };
}

/**
 * Extract page number from AI-generated text
 *
 * Parses text like "PAGE 5:" or "page 5:" to extract page number.
 * Used for testing and validation.
 *
 * @param text - Text potentially containing page marker
 * @returns Page number or null if not found
 *
 * @example
 * extractPageNumber("PAGE 5: Photosynthesis...") // => 5
 * extractPageNumber("This is regular text") // => null
 */
export function extractPageNumber(text: string): number | null {
  const match = text.match(/^PAGE\s+(\d+):/i);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Validate that formatted text contains expected page markers
 *
 * Used for quality assurance during development and testing.
 *
 * @param formattedText - The formatted text to validate
 * @param expectedPages - Array of expected page numbers
 * @returns Validation result with issues
 *
 * @example
 * const result = validatePageMarkers(formattedText, [0, 1, 2]);
 * if (!result.valid) {
 *   console.error('Missing pages:', result.missingPages);
 * }
 */
export function validatePageMarkers(
  formattedText: string,
  expectedPages: number[],
): {
  valid: boolean;
  foundPages: number[];
  missingPages: number[];
  extraPages: number[];
} {
  // Extract all page markers from text
  const pageRegex = /^PAGE\s+(\d+):/gim;
  const matches = Array.from(formattedText.matchAll(pageRegex));
  const foundPages = matches.map((m) => parseInt(m[1], 10));

  // Find missing and extra pages
  const expectedSet = new Set(expectedPages);
  const foundSet = new Set(foundPages);

  const missingPages = expectedPages.filter((p) => !foundSet.has(p));
  const extraPages = foundPages.filter((p) => !expectedSet.has(p));

  return {
    valid: missingPages.length === 0 && extraPages.length === 0,
    foundPages,
    missingPages,
    extraPages,
  };
}

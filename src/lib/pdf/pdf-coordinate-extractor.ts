/**
 * PDF Coordinate-Based Text Extraction
 *
 * Extracts text from PDFs WITH spatial coordinates for precise frontend highlighting.
 * Uses pdfjs-dist to extract text items with bounding boxes, then intelligently
 * combines adjacent items into semantic text blocks.
 *
 * Why this approach:
 * - pdf-parse extracts text but loses spatial information
 * - pdfjs-dist provides low-level access to text items with coordinates
 * - Combining adjacent items prevents awkward mid-word/mid-sentence splits
 * - Bounding boxes enable precise highlighting without touching unrelated text
 */

import * as fs from 'fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { logger } from '../../utils/logger.util';
import {
  PDFExtractionResult,
  PDFExtractionConfig,
  TextBlock,
  BoundingBox,
  RawTextItem,
  PDFMetadata,
  ExtractionQualityMetrics,
} from '../../types/pdf.types';
import {
  ExtractionError,
  EncryptedPDFError,
  ScannedPDFError,
} from '../errors/document-errors';

/**
 * Default extraction configuration
 */
const DEFAULT_CONFIG: Required<PDFExtractionConfig> = {
  combineTextBlocks: true,
  sameLineThreshold: 2,
  adjacentTextThreshold: 5,
  pageTimeout: 60000, // 60 seconds per page
  includeEmptyBlocks: false,
};

/**
 * Extract text with coordinates from PDF file
 *
 * Main entry point for coordinate-based PDF extraction.
 * Returns both full text (for AI) and coordinate-mapped blocks (for highlighting).
 *
 * @param filePath - Path to PDF file
 * @param config - Optional extraction configuration
 * @returns PDF extraction result with text blocks and coordinates
 * @throws ExtractionError if extraction fails
 * @throws EncryptedPDFError if PDF is encrypted
 * @throws ScannedPDFError if PDF has no text layer
 */
export async function extractPDFWithCoordinates(
  filePath: string,
  config: PDFExtractionConfig = {}
): Promise<PDFExtractionResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();

  logger.info('Starting coordinate-based PDF extraction', { filePath });

  try {
    // Read PDF file
    const dataBuffer = await fs.readFile(filePath);
    const data = new Uint8Array(dataBuffer);

    // Load PDF document
    const loadingTask = getDocument({
      data,
      useSystemFonts: true,
      standardFontDataUrl: undefined, // Don't load font data for Node.js
    });

    const pdfDoc = await loadingTask.promise;

    const totalPages = pdfDoc.numPages;
    logger.info('PDF loaded successfully', { totalPages });

    // Extract metadata
    const metadata = await extractPDFMetadata(pdfDoc);

    // Extract text blocks from all pages
    const allTextBlocks: TextBlock[] = [];
    const warnings: string[] = [];
    let pagesProcessed = 0;
    let pagesSkipped = 0;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      try {
        const pageBlocks = await extractPageTextBlocks(
          pdfDoc,
          pageNum,
          cfg
        );

        allTextBlocks.push(...pageBlocks);
        pagesProcessed++;

        logger.debug('Page processed', {
          pageNum,
          blocksExtracted: pageBlocks.length,
        });
      } catch (error) {
        pagesSkipped++;
        const warningMsg = `Failed to process page ${pageNum}: ${(error as Error).message}`;
        warnings.push(warningMsg);
        logger.warn(warningMsg);

        // Continue to next page instead of failing entire document
        continue;
      }
    }

    // Check if any text was extracted
    if (allTextBlocks.length === 0) {
      if (pagesSkipped === totalPages) {
        throw new ScannedPDFError();
      }

      throw new ExtractionError(
        'No text found in PDF',
        'pdf',
        { totalPages, pagesSkipped }
      );
    }

    // Combine text blocks into full text
    const fullText = allTextBlocks
      .map(block => block.text)
      .join(' ')
      .trim();

    // Calculate quality metrics
    const qualityMetrics: ExtractionQualityMetrics = {
      totalTextBlocks: allTextBlocks.length,
      pagesProcessed,
      pagesSkipped,
      averageBlocksPerPage: pagesProcessed > 0
        ? allTextBlocks.length / pagesProcessed
        : 0,
      coordinateExtractionRate: calculateCoordinateRate(allTextBlocks),
      warnings,
    };

    const extractionTime = Date.now() - startTime;
    logger.info('PDF extraction completed', {
      totalPages,
      pagesProcessed,
      pagesSkipped,
      textBlocks: allTextBlocks.length,
      extractionTime,
      qualityScore: qualityMetrics.coordinateExtractionRate,
    });

    return {
      fullText,
      textBlocks: allTextBlocks,
      totalPages,
      metadata,
    };
  } catch (error) {
    // Re-throw known errors
    if (
      error instanceof EncryptedPDFError ||
      error instanceof ScannedPDFError ||
      error instanceof ExtractionError
    ) {
      throw error;
    }

    // Wrap unknown errors
    throw new ExtractionError(
      `Failed to extract PDF with coordinates: ${(error as Error).message}`,
      'pdf',
      { originalError: (error as Error).message }
    );
  }
}

/**
 * Extract text blocks from a single page
 *
 * Why: Process each page individually to enable progress tracking
 * and recover from per-page errors.
 *
 * @param pdfDoc - PDF.js document object
 * @param pageNum - Page number (1-indexed)
 * @param config - Extraction configuration
 * @returns Array of text blocks for this page
 */
async function extractPageTextBlocks(
  pdfDoc: any,
  pageNum: number,
  config: Required<PDFExtractionConfig>
): Promise<TextBlock[]> {
  // Load page
  const page = await pdfDoc.getPage(pageNum);

  // Get text content with positions
  const textContent = await page.getTextContent();

  // Extract raw text items
  const rawItems: RawTextItem[] = textContent.items
    .filter((item: any) => item.str && item.transform)
    .map((item: any) => ({
      str: item.str,
      transform: item.transform,
      width: item.width,
      height: item.height,
      fontName: item.fontName,
    }));

  // Convert raw items to text blocks with bounding boxes
  const textBlocks = rawItems.map(item => {
    const bbox = extractBoundingBox(item);
    return {
      text: item.str,
      page: pageNum - 1, // Convert to 0-indexed
      bbox,
    };
  });

  // Filter empty blocks if configured
  let filteredBlocks = textBlocks;
  if (!config.includeEmptyBlocks) {
    filteredBlocks = textBlocks.filter(block => block.text.trim().length > 0);
  }

  // Combine adjacent text blocks if configured
  if (config.combineTextBlocks) {
    return combineAdjacentBlocks(filteredBlocks, config);
  }

  return filteredBlocks;
}

/**
 * Extract bounding box from raw text item
 *
 * Why: PDF.js provides transform matrix, need to extract position and dimensions.
 * Transform array format: [scaleX, skewY, skewX, scaleY, x, y]
 *
 * PDF Coordinate System:
 * - Origin (0,0) is at BOTTOM-LEFT corner
 * - Y increases from bottom to top (inverted from most screen coordinates)
 * - This is critical for frontend highlighting
 *
 * @param item - Raw text item from PDF.js
 * @returns Bounding box in PDF coordinate system
 */
function extractBoundingBox(item: RawTextItem): BoundingBox {
  // Extract position from transform matrix
  // Transform: [scaleX, skewY, skewX, scaleY, x, y]
  const x = item.transform[4] || 0;
  const y = item.transform[5] || 0;

  // Width and height are provided directly
  const width = item.width || 0;
  const height = item.height || 0;

  return {
    x,
    y,
    width,
    height,
  };
}

/**
 * Combine adjacent text blocks for better highlighting
 *
 * Why: Individual text items can be single characters or words.
 * Combining them into sentence/paragraph-level blocks provides
 * more natural highlighting boundaries.
 *
 * Algorithm:
 * 1. Group blocks by line (similar Y coordinate)
 * 2. Within each line, sort by X coordinate (left to right)
 * 3. Combine adjacent blocks (close X coordinates)
 * 4. Merge bounding boxes to encompass all combined text
 *
 * @param blocks - Individual text blocks
 * @param config - Extraction configuration
 * @returns Combined text blocks
 */
function combineAdjacentBlocks(
  blocks: TextBlock[],
  config: Required<PDFExtractionConfig>
): TextBlock[] {
  if (blocks.length === 0) return blocks;

  // Group blocks by line (similar Y coordinate)
  const lines = groupBlocksByLine(blocks, config.sameLineThreshold);

  // Combine adjacent blocks within each line
  const combined: TextBlock[] = [];

  for (const lineBlocks of lines) {
    if (lineBlocks.length === 0) continue;

    // Sort by X coordinate (left to right)
    const sorted = lineBlocks.sort((a, b) => a.bbox.x - b.bbox.x);

    // Combine adjacent blocks
    let currentBlock: TextBlock | null = sorted[0] || null;
    if (!currentBlock) continue;

    for (let i = 1; i < sorted.length; i++) {
      const nextBlock = sorted[i];
      if (!nextBlock || !currentBlock) continue;

      // Check if blocks are adjacent (close X coordinates)
      const gap = nextBlock.bbox.x - (currentBlock.bbox.x + currentBlock.bbox.width);

      if (gap <= config.adjacentTextThreshold) {
        // Combine blocks
        currentBlock = mergeBlocks(currentBlock, nextBlock);
      } else {
        // Save current block and start new one
        combined.push(currentBlock);
        currentBlock = nextBlock;
      }
    }

    // Don't forget the last block
    if (currentBlock) {
      combined.push(currentBlock);
    }
  }

  return combined;
}

/**
 * Group text blocks by line based on Y coordinate
 *
 * Why: Blocks on the same line should be combined first.
 * Use threshold to handle slight Y-coordinate variations.
 *
 * @param blocks - Text blocks to group
 * @param threshold - Y-coordinate threshold for same line
 * @returns Array of line groups
 */
function groupBlocksByLine(
  blocks: TextBlock[],
  threshold: number
): TextBlock[][] {
  if (blocks.length === 0) return [];

  const lines: TextBlock[][] = [];
  const firstBlock = blocks[0];
  if (!firstBlock) return [];

  let currentLine: TextBlock[] = [firstBlock];

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const prevBlock = currentLine[0];
    if (!block || !prevBlock) continue;

    // Check if on same line (similar Y coordinate)
    const yDiff = Math.abs(block.bbox.y - prevBlock.bbox.y);

    if (yDiff <= threshold) {
      // Same line
      currentLine.push(block);
    } else {
      // New line
      lines.push(currentLine);
      currentLine = [block];
    }
  }

  // Don't forget the last line
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Merge two adjacent text blocks
 *
 * Why: Combine text and expand bounding box to encompass both blocks.
 * Add space between texts if needed.
 *
 * @param block1 - First text block
 * @param block2 - Second text block
 * @returns Merged text block
 */
function mergeBlocks(block1: TextBlock, block2: TextBlock): TextBlock {
  // Combine text (add space if needed)
  const needsSpace = !block1.text.endsWith(' ') && !block2.text.startsWith(' ');
  const combinedText = needsSpace
    ? `${block1.text} ${block2.text}`
    : `${block1.text}${block2.text}`;

  // Merge bounding boxes (encompass both blocks)
  const minX = Math.min(block1.bbox.x, block2.bbox.x);
  const minY = Math.min(block1.bbox.y, block2.bbox.y);
  const maxX = Math.max(
    block1.bbox.x + block1.bbox.width,
    block2.bbox.x + block2.bbox.width
  );
  const maxY = Math.max(
    block1.bbox.y + block1.bbox.height,
    block2.bbox.y + block2.bbox.height
  );

  return {
    text: combinedText,
    page: block1.page, // Both should be on same page
    bbox: {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    },
  };
}

/**
 * Extract metadata from PDF document
 *
 * Why: Metadata provides context (title, author, etc.) that may be useful.
 *
 * @param pdfDoc - PDF.js document object
 * @returns PDF metadata
 */
async function extractPDFMetadata(pdfDoc: any): Promise<PDFMetadata> {
  try {
    const metadata = await pdfDoc.getMetadata();
    const info = metadata.info;

    return {
      title: info.Title || undefined,
      author: info.Author || undefined,
      subject: info.Subject || undefined,
      creator: info.Creator || undefined,
      producer: info.Producer || undefined,
      createdDate: info.CreationDate
        ? parsePDFDate(info.CreationDate)
        : undefined,
      modifiedDate: info.ModDate
        ? parsePDFDate(info.ModDate)
        : undefined,
    };
  } catch (error) {
    logger.warn('Failed to extract PDF metadata', {
      error: (error as Error).message,
    });
    return {};
  }
}

/**
 * Parse PDF date format to ISO 8601 string
 *
 * Why: PDF dates are in special format (D:YYYYMMDDHHmmSS)
 * Need to convert to standard format for storage.
 *
 * @param pdfDate - PDF date string
 * @returns ISO 8601 date string
 */
function parsePDFDate(pdfDate: string): string | undefined {
  try {
    // PDF date format: D:YYYYMMDDHHmmSS
    if (pdfDate.startsWith('D:')) {
      const dateStr = pdfDate.substring(2);
      const year = parseInt(dateStr.substring(0, 4), 10);
      const month = parseInt(dateStr.substring(4, 6), 10) - 1; // 0-indexed
      const day = parseInt(dateStr.substring(6, 8), 10);
      const hour = parseInt(dateStr.substring(8, 10), 10) || 0;
      const minute = parseInt(dateStr.substring(10, 12), 10) || 0;
      const second = parseInt(dateStr.substring(12, 14), 10) || 0;

      const date = new Date(year, month, day, hour, minute, second);
      return date.toISOString();
    }

    // Try parsing as regular date string
    return new Date(pdfDate).toISOString();
  } catch (error) {
    return undefined;
  }
}

/**
 * Calculate coordinate extraction success rate
 *
 * Why: Quality metric to assess extraction reliability.
 * Low rate indicates potential issues with PDF structure.
 *
 * @param textBlocks - Extracted text blocks
 * @returns Coordinate extraction rate (0-1)
 */
function calculateCoordinateRate(textBlocks: TextBlock[]): number {
  if (textBlocks.length === 0) return 0;

  // Count blocks with valid coordinates
  const validBlocks = textBlocks.filter(block => {
    const bbox = block.bbox;
    return (
      bbox.x >= 0 &&
      bbox.y >= 0 &&
      bbox.width > 0 &&
      bbox.height > 0
    );
  });

  return validBlocks.length / textBlocks.length;
}

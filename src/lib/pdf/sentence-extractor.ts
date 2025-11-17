/**
 * Sentence Extraction Utility
 *
 * Extracts complete sentences from PDF textBlocks with support for:
 * - Two-column layouts
 * - Cross-page sentences
 * - Complete sentence validation
 * - Bounding box combination
 *
 * WHY: We need clean, complete sentences for highlighting, not partial phrases.
 * The visual quality depends on showing complete thoughts, not mid-sentence cuts.
 */

import { TextBlock, BoundingBox } from '../../types/pdf.types';
import { Logger } from 'winston';

/**
 * A sentence with its source textBlocks and combined bounding box
 */
export interface ExtractedSentence {
  /** The complete sentence text */
  text: string;

  /** All textBlocks that make up this sentence */
  blocks: TextBlock[];

  /** All pages this sentence appears on (for cross-page sentences) */
  pages: number[];

  /** Combined bounding box for the entire sentence */
  bbox: BoundingBox;

  /** Whether this sentence spans multiple pages */
  crossPage: boolean;

  /** Confidence that this is a complete sentence (0-1) */
  completeness: number;
}

/**
 * Configuration for sentence extraction
 */
export interface SentenceExtractionConfig {
  /** Minimum sentence length in characters */
  minLength?: number;

  /** Maximum sentence length in characters */
  maxLength?: number;

  /** Whether to combine adjacent blocks on same line */
  combineAdjacentBlocks?: boolean;

  /** Threshold for detecting two-column layout (X-axis separation in px) */
  columnSeparationThreshold?: number;
}

const DEFAULT_CONFIG: Required<SentenceExtractionConfig> = {
  minLength: 20,
  maxLength: 500,
  combineAdjacentBlocks: true,
  columnSeparationThreshold: 50,
};

/**
 * Extract complete sentences from textBlocks
 *
 * Handles:
 * - Two-column PDFs (sorts blocks correctly)
 * - Cross-page sentences (combines blocks across pages)
 * - Incomplete sentences at chunk boundaries (filters them out)
 *
 * @param textBlocks - Array of textBlocks with coordinates
 * @param config - Optional configuration
 * @param logger - Optional logger
 * @returns Array of complete sentences with coordinates
 */
export function extractCompleteSentences(
  textBlocks: TextBlock[],
  config: SentenceExtractionConfig = {},
  logger?: Logger
): ExtractedSentence[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (!textBlocks || textBlocks.length === 0) {
    return [];
  }

  // Step 1: Sort blocks properly (handle two-column layouts)
  const sortedBlocks = sortBlocksWithColumnDetection(textBlocks, cfg, logger);

  // Step 2: Extract sentences (handling cross-page spans)
  const sentences = extractSentencesFromSortedBlocks(sortedBlocks, cfg, logger);

  // Step 3: Filter for completeness
  const completeSentences = sentences.filter(s => {
    return (
      s.completeness >= 0.8 &&
      s.text.length >= cfg.minLength &&
      s.text.length <= cfg.maxLength
    );
  });

  logger?.debug('[extractCompleteSentences] Extracted sentences', {
    totalBlocks: textBlocks.length,
    sentencesFound: sentences.length,
    completeOnly: completeSentences.length,
  });

  return completeSentences;
}

/**
 * Sort textBlocks with two-column layout detection
 *
 * For single-column: Sort by (page, y-position)
 * For two-column: Sort by (page, y-position, then x-position for same Y)
 */
function sortBlocksWithColumnDetection(
  textBlocks: TextBlock[],
  config: Required<SentenceExtractionConfig>,
  logger?: Logger
): TextBlock[] {
  // Group by page
  const byPage = groupBlocksByPage(textBlocks);

  const sortedBlocks: TextBlock[] = [];

  for (const [page, blocks] of Object.entries(byPage)) {
    const pageNum = parseInt(page);

    // Detect if this page has two columns
    const hasColumns = detectTwoColumnLayout(blocks, config);

    if (hasColumns) {
      logger?.debug(`[sortBlocks] Page ${pageNum} has two-column layout`);
      sortedBlocks.push(...sortColumnarBlocks(blocks));
    } else {
      // Single column: sort by Y position only
      sortedBlocks.push(...blocks.sort((a, b) => a.bbox.y - b.bbox.y));
    }
  }

  return sortedBlocks;
}

/**
 * Group textBlocks by page number
 */
function groupBlocksByPage(blocks: TextBlock[]): Record<number, TextBlock[]> {
  const grouped: Record<number, TextBlock[]> = {};

  for (const block of blocks) {
    if (!grouped[block.page]) {
      grouped[block.page] = [];
    }
    grouped[block.page].push(block);
  }

  return grouped;
}

/**
 * Detect if a page has a two-column layout
 *
 * Strategy: Cluster X positions - if we find 2 distinct clusters with
 * significant separation, it's likely a two-column layout.
 */
function detectTwoColumnLayout(
  blocks: TextBlock[],
  config: Required<SentenceExtractionConfig>
): boolean {
  if (blocks.length < 10) return false; // Too few blocks to detect

  const xPositions = blocks.map(b => b.bbox.x);

  // Simple clustering: find leftmost and rightmost X positions
  const sorted = [...xPositions].sort((a, b) => a - b);
  const leftCluster = sorted.slice(0, Math.floor(sorted.length / 2));
  const rightCluster = sorted.slice(Math.floor(sorted.length / 2));

  const leftAvg = average(leftCluster);
  const rightAvg = average(rightCluster);

  const separation = Math.abs(rightAvg - leftAvg);

  return separation >= config.columnSeparationThreshold;
}

/**
 * Sort blocks in a two-column layout
 *
 * Strategy:
 * 1. Group blocks by Y position (rows)
 * 2. Within each row, sort by X position (left column first)
 */
function sortColumnarBlocks(blocks: TextBlock[]): TextBlock[] {
  // Group by Y position (with tolerance for slight misalignment)
  const yTolerance = 5; // px
  const rows: TextBlock[][] = [];

  for (const block of blocks) {
    let foundRow = false;

    for (const row of rows) {
      if (Math.abs(row[0].bbox.y - block.bbox.y) <= yTolerance) {
        row.push(block);
        foundRow = true;
        break;
      }
    }

    if (!foundRow) {
      rows.push([block]);
    }
  }

  // Sort rows by Y position
  rows.sort((a, b) => a[0].bbox.y - b[0].bbox.y);

  // Within each row, sort by X position (left to right)
  for (const row of rows) {
    row.sort((a, b) => a.bbox.x - b.bbox.x);
  }

  // Flatten
  return rows.flat();
}

/**
 * Extract sentences from sorted textBlocks
 *
 * Handles cross-page sentences by continuing until a sentence terminator is found.
 */
function extractSentencesFromSortedBlocks(
  blocks: TextBlock[],
  config: Required<SentenceExtractionConfig>,
  logger?: Logger
): ExtractedSentence[] {
  const sentences: ExtractedSentence[] = [];

  let currentSentence: {
    text: string;
    blocks: TextBlock[];
  } = { text: '', blocks: [] };

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    currentSentence.text += (currentSentence.text ? ' ' : '') + block.text;
    currentSentence.blocks.push(block);

    // Check if sentence ends (look for terminators)
    if (isSentenceTerminator(block.text)) {
      // Complete sentence found!
      const pages = getUniquePages(currentSentence.blocks);
      const bbox = combineBoundingBoxes(currentSentence.blocks);

      sentences.push({
        text: currentSentence.text.trim(),
        blocks: [...currentSentence.blocks],
        pages,
        bbox,
        crossPage: pages.length > 1,
        completeness: assessSentenceCompleteness(currentSentence.text),
      });

      // Reset for next sentence
      currentSentence = { text: '', blocks: [] };
    }
  }

  // Handle incomplete sentence at end (mark as low completeness)
  if (currentSentence.blocks.length > 0) {
    const pages = getUniquePages(currentSentence.blocks);
    const bbox = combineBoundingBoxes(currentSentence.blocks);

    sentences.push({
      text: currentSentence.text.trim(),
      blocks: currentSentence.blocks,
      pages,
      bbox,
      crossPage: pages.length > 1,
      completeness: 0.3, // Low completeness - likely incomplete
    });
  }

  return sentences;
}

/**
 * Check if text ends with a sentence terminator
 */
function isSentenceTerminator(text: string): boolean {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed);
}

/**
 * Assess sentence completeness (0-1 score)
 *
 * Checks:
 * - Starts with capital letter
 * - Ends with proper terminator
 * - Has reasonable length
 * - Contains subject and predicate (basic heuristic)
 */
function assessSentenceCompleteness(text: string): number {
  let score = 0.0;

  const trimmed = text.trim();

  // Starts with capital letter
  if (/^[A-Z]/.test(trimmed)) {
    score += 0.3;
  }

  // Ends with terminator
  if (/[.!?]$/.test(trimmed)) {
    score += 0.3;
  }

  // Has reasonable length
  if (trimmed.length >= 20 && trimmed.length <= 300) {
    score += 0.2;
  }

  // Contains verb (basic check for predicate)
  if (/\b(is|are|was|were|has|have|do|does|did|can|could|will|would|should)\b/i.test(trimmed)) {
    score += 0.2;
  }

  return Math.min(score, 1.0);
}

/**
 * Get unique page numbers from blocks
 */
function getUniquePages(blocks: TextBlock[]): number[] {
  return [...new Set(blocks.map(b => b.page))].sort((a, b) => a - b);
}

/**
 * Combine multiple bounding boxes into one that encompasses all
 */
function combineBoundingBoxes(blocks: TextBlock[]): BoundingBox {
  if (blocks.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  if (blocks.length === 1) {
    return blocks[0].bbox;
  }

  // Find min/max coordinates
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const block of blocks) {
    const bbox = block.bbox;
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
 * Calculate average of numbers
 */
function average(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

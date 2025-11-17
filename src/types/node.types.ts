/**
 * Node Document Reference Type Definitions
 *
 * Types for coordinate-based document references in knowledge graph nodes.
 * Enables precise highlighting of source text in the frontend by providing
 * bounding box coordinates for each reference.
 *
 * ARCHITECTURE:
 * - Phase 1: Extract PDF text with coordinates (documents.metadata.textBlocks)
 * - Phase 2: AI generates nodes with coordinate references (nodes.documentRefs)
 * - Phase 3: Frontend highlights precise regions using coordinates
 */

import type { BoundingBox } from './pdf.types';

/**
 * Single document reference with coordinates
 *
 * Represents a specific text snippet from the source document that supports
 * a node's content. Includes precise coordinates for frontend highlighting.
 *
 * IMPORTANT: A node can have MULTIPLE references (same concept on different pages)
 *
 * CROSS-PAGE SUPPORT:
 * - Use `page` + `bbox` for single-page references (simple case)
 * - Use `pages` + `coordinates` for cross-page references (sentences spanning pages)
 *
 * Format 1 (Single page):
 * {
 *   text: "Complete sentence on one page.",
 *   page: 5,
 *   bbox: { x: 108, y: 650, width: 390, height: 40 }
 * }
 *
 * Format 2 (Cross-page):
 * {
 *   text: "Sentence starting on page 5 and continuing to page 6.",
 *   pages: [5, 6],
 *   coordinates: [
 *     { page: 5, bbox: { x: 108, y: 650, width: 390, height: 40 } },
 *     { page: 6, bbox: { x: 108, y: 50, width: 390, height: 20 } }
 *   ]
 * }
 */
export interface NodeDocumentReference {
  /**
   * The quoted text from the document
   *
   * This is the actual text snippet that supports the node's concept.
   * Should be semantically meaningful (sentence or paragraph).
   *
   * Example: "Photosynthesis is the process by which plants convert light energy..."
   */
  text: string;

  /**
   * Page number (0-indexed) - for single-page references
   *
   * Zero-based page index in the PDF.
   * First page = 0, second page = 1, etc.
   *
   * Use this OR `pages` array (not both).
   */
  page?: number;

  /**
   * Pages array - for cross-page references
   *
   * Array of page numbers this reference spans (in order).
   * Example: [5, 6] means text starts on page 5 and continues to page 6.
   *
   * Use this OR `page` number (not both).
   */
  pages?: number[];

  /**
   * Bounding box coordinates - for single-page references
   *
   * PDF Coordinate System:
   * - Origin (0,0) is at bottom-left corner of page
   * - X increases from left to right
   * - Y increases from bottom to top (NOT from top!)
   * - Units are in PDF points (1 point = 1/72 inch)
   *
   * Example: { x: 72, y: 650, width: 400, height: 48 }
   * Represents a text block starting 72pt from left, 650pt from bottom,
   * spanning 400pt width and 48pt height.
   *
   * Use this OR `coordinates` array (not both).
   */
  bbox?: BoundingBox;

  /**
   * Coordinates array - for cross-page references
   *
   * Array of { page, bbox } objects, one for each page the text spans.
   * Order matches the `pages` array.
   *
   * Example:
   * [
   *   { page: 5, bbox: { x: 108, y: 650, width: 390, height: 40 } },
   *   { page: 6, bbox: { x: 108, y: 50, width: 390, height: 20 } }
   * ]
   *
   * Use this OR `bbox` object (not both).
   */
  coordinates?: Array<{
    page: number;
    bbox: BoundingBox;
  }>;
}

/**
 * Complete document references structure for a node
 *
 * Stored in nodes.documentRefs JSONB field.
 * Supports multiple references per node (same concept across multiple pages).
 *
 * USAGE:
 * - AI generates nodes and identifies supporting text snippets
 * - For each snippet, find matching TextBlock from documents.metadata.textBlocks
 * - Store reference with text, page, and bbox coordinates
 * - Frontend uses coordinates to highlight precise regions when node is selected
 */
export interface NodeDocumentRefs {
  /**
   * Array of document references
   *
   * Can be empty if node is a high-level concept without direct quotes.
   * Typically contains 1-3 references for well-grounded nodes.
   */
  references: NodeDocumentReference[];
}

/**
 * Edge document references (optional - for future use)
 *
 * Similar structure for edge explanations that need source citations.
 * Can be added to edges.metadata field when implementing edge highlighting.
 */
export interface EdgeDocumentRefs {
  /**
   * Array of document references supporting the edge relationship
   */
  references: NodeDocumentReference[];
}

/**
 * Legacy document reference format (text-only)
 *
 * @deprecated Use NodeDocumentRefs instead
 *
 * Old format used character indices without coordinates:
 * { "text": "...", "startIndex": 1200, "endIndex": 1450 }
 *
 * This format is still supported for backward compatibility,
 * but new code should use coordinate-based references.
 */
export interface LegacyDocumentReference {
  text: string;
  startIndex: number;
  endIndex: number;
}

/**
 * Type guard to check if documentRefs uses new coordinate format
 *
 * @param refs - The documentRefs object to check
 * @returns True if refs uses new NodeDocumentRefs format
 *
 * @example
 * const refs = node.documentRefs as any;
 * if (isCoordinateBasedRefs(refs)) {
 *   // Use refs.references with coordinates
 * } else {
 *   // Handle legacy format or null
 * }
 */
export function isCoordinateBasedRefs(refs: unknown): refs is NodeDocumentRefs {
  return (
    refs !== null &&
    typeof refs === 'object' &&
    'references' in refs &&
    Array.isArray((refs as NodeDocumentRefs).references)
  );
}

/**
 * Helper to find text block matching a text snippet
 *
 * Used during graph generation to find coordinates for a text snippet.
 *
 * @param snippet - The text to search for
 * @param textBlocks - Array of text blocks from documents.metadata.textBlocks
 * @param fuzzyMatch - Allow fuzzy matching (default: true)
 * @returns Matching text block or null if not found
 *
 * @example
 * import { TextBlock } from './pdf.types';
 *
 * const textBlocks: TextBlock[] = document.metadata.textBlocks;
 * const snippet = "Photosynthesis is the process...";
 * const block = findTextBlock(snippet, textBlocks);
 * if (block) {
 *   const ref: NodeDocumentReference = {
 *     text: snippet,
 *     page: block.page,
 *     bbox: block.bbox
 *   };
 * }
 */
export function findTextBlock(
  snippet: string,
  textBlocks: Array<{ text: string; page: number; bbox: BoundingBox }>,
  fuzzyMatch = true,
): { text: string; page: number; bbox: BoundingBox } | null {
  // Normalize whitespace for comparison
  const normalizedSnippet = snippet.trim().replace(/\s+/g, ' ').toLowerCase();

  // Exact match first
  for (const block of textBlocks) {
    const normalizedBlock = block.text.trim().replace(/\s+/g, ' ').toLowerCase();
    if (normalizedBlock === normalizedSnippet) {
      return block;
    }
  }

  // Fuzzy match: check if snippet is contained in block
  if (fuzzyMatch) {
    for (const block of textBlocks) {
      const normalizedBlock = block.text.trim().replace(/\s+/g, ' ').toLowerCase();
      if (normalizedBlock.includes(normalizedSnippet) || normalizedSnippet.includes(normalizedBlock)) {
        return block;
      }
    }
  }

  return null;
}

/**
 * Helper to create node document references from text snippets
 *
 * Convenience function to create coordinate-based references during graph generation.
 *
 * @param snippets - Array of text snippets to reference
 * @param textBlocks - Array of text blocks from documents.metadata.textBlocks
 * @returns NodeDocumentRefs object with coordinate-based references
 *
 * @example
 * const snippets = [
 *   "Photosynthesis converts light energy...",
 *   "Chlorophyll absorbs light primarily..."
 * ];
 * const textBlocks = document.metadata.textBlocks;
 * const documentRefs = createNodeDocumentRefs(snippets, textBlocks);
 * // Store in node.documentRefs
 */
export function createNodeDocumentRefs(
  snippets: string[],
  textBlocks: Array<{ text: string; page: number; bbox: BoundingBox }>,
): NodeDocumentRefs {
  const references: NodeDocumentReference[] = [];

  for (const snippet of snippets) {
    const block = findTextBlock(snippet, textBlocks);
    if (block) {
      references.push({
        text: snippet,
        page: block.page,
        bbox: block.bbox,
      });
    } else {
      // Log warning if block not found, but continue
      console.warn(`[createNodeDocumentRefs] Text block not found for snippet: "${snippet.substring(0, 50)}..."`);
    }
  }

  return { references };
}

/**
 * Validation helper for NodeDocumentReference
 *
 * @param ref - The reference to validate
 * @returns True if reference is valid
 */
export function isValidNodeDocumentReference(ref: unknown): ref is NodeDocumentReference {
  if (!ref || typeof ref !== 'object') return false;

  const r = ref as NodeDocumentReference;

  return (
    typeof r.text === 'string' &&
    r.text.trim().length > 0 &&
    typeof r.page === 'number' &&
    r.page >= 0 &&
    Number.isInteger(r.page) &&
    r.bbox !== null &&
    typeof r.bbox === 'object' &&
    typeof r.bbox.x === 'number' &&
    typeof r.bbox.y === 'number' &&
    typeof r.bbox.width === 'number' &&
    typeof r.bbox.height === 'number' &&
    r.bbox.width > 0 &&
    r.bbox.height > 0
  );
}

/**
 * Validation helper for NodeDocumentRefs
 *
 * @param refs - The references object to validate
 * @returns True if all references are valid
 */
export function isValidNodeDocumentRefs(refs: unknown): refs is NodeDocumentRefs {
  if (!isCoordinateBasedRefs(refs)) return false;

  return refs.references.every((ref) => isValidNodeDocumentReference(ref));
}

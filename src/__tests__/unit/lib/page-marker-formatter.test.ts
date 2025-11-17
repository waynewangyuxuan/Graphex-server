/**
 * Page Marker Formatter Unit Tests
 *
 * Tests page marker formatting functionality for AI processing.
 * Validates correct formatting of document text with PAGE markers.
 */

import {
  formatTextWithPageMarkers,
  extractPageNumber,
  validatePageMarkers,
} from '../../../lib/pdf/page-marker-formatter';
import { TextBlock } from '../../../types/pdf.types';

describe('Page Marker Formatter Unit Tests', () => {
  describe('formatTextWithPageMarkers', () => {
    it('should format text with page markers', () => {
      // WHY: Basic functionality test - ensures PAGE markers are inserted correctly
      const textBlocks: TextBlock[] = [
        {
          text: 'Introduction to Photosynthesis',
          page: 0,
          bbox: { x: 72, y: 650, width: 400, height: 48 },
        },
        {
          text: 'Plants convert light energy',
          page: 0,
          bbox: { x: 72, y: 600, width: 380, height: 36 },
        },
        {
          text: 'The Role of Chlorophyll',
          page: 1,
          bbox: { x: 72, y: 650, width: 350, height: 42 },
        },
      ];

      const result = formatTextWithPageMarkers('', textBlocks);

      expect(result.formattedText).toContain('PAGE 0:');
      expect(result.formattedText).toContain('PAGE 1:');
      expect(result.formattedText).toContain('Introduction to Photosynthesis');
      expect(result.formattedText).toContain('The Role of Chlorophyll');
      expect(result.metadata.totalPages).toBe(2);
      expect(result.metadata.totalBlocks).toBe(3);
    });

    it('should handle empty textBlocks array', () => {
      // WHY: Edge case - ensures graceful handling when no textBlocks provided
      const result = formatTextWithPageMarkers('Full text fallback', []);

      expect(result.formattedText).toContain('PAGE 0:');
      expect(result.formattedText).toContain('Full text fallback');
      expect(result.metadata.totalPages).toBe(1);
      expect(result.metadata.totalBlocks).toBe(0);
    });

    it('should handle single page document', () => {
      // WHY: Common case - many documents are single page
      const textBlocks: TextBlock[] = [
        {
          text: 'Single page content',
          page: 0,
          bbox: { x: 72, y: 650, width: 400, height: 48 },
        },
      ];

      const result = formatTextWithPageMarkers('', textBlocks);

      expect(result.formattedText).toContain('PAGE 0:');
      expect(result.formattedText).toContain('Single page content');
      expect(result.metadata.totalPages).toBe(1);
    });

    it('should preserve paragraph breaks between blocks', () => {
      // WHY: Important for AI readability - blocks should be separated by newlines
      const textBlocks: TextBlock[] = [
        {
          text: 'First paragraph',
          page: 0,
          bbox: { x: 72, y: 650, width: 400, height: 48 },
        },
        {
          text: 'Second paragraph',
          page: 0,
          bbox: { x: 72, y: 600, width: 380, height: 36 },
        },
      ];

      const result = formatTextWithPageMarkers('', textBlocks);

      expect(result.formattedText).toMatch(/First paragraph\nSecond paragraph/);
    });

    it('should handle non-sequential page numbers', () => {
      // WHY: PDFs may have missing pages or non-sequential numbering
      const textBlocks: TextBlock[] = [
        {
          text: 'Page 0 content',
          page: 0,
          bbox: { x: 72, y: 650, width: 400, height: 48 },
        },
        {
          text: 'Page 2 content',
          page: 2,
          bbox: { x: 72, y: 650, width: 400, height: 48 },
        },
        {
          text: 'Page 5 content',
          page: 5,
          bbox: { x: 72, y: 650, width: 400, height: 48 },
        },
      ];

      const result = formatTextWithPageMarkers('', textBlocks);

      expect(result.formattedText).toContain('PAGE 0:');
      expect(result.formattedText).toContain('PAGE 2:');
      expect(result.formattedText).toContain('PAGE 5:');
      expect(result.metadata.totalPages).toBe(3);
    });

    it('should identify empty pages', () => {
      // WHY: Empty pages should be tracked in metadata
      const textBlocks: TextBlock[] = [
        {
          text: 'Full page content',
          page: 0,
          bbox: { x: 72, y: 650, width: 400, height: 48 },
        },
        {
          text: 'X', // Very short content (below minPageLength)
          page: 1,
          bbox: { x: 72, y: 650, width: 10, height: 12 },
        },
      ];

      const result = formatTextWithPageMarkers('', textBlocks, { minPageLength: 10 });

      expect(result.metadata.emptyPages).toContain(1);
      expect(result.metadata.emptyPages).not.toContain(0);
    });

    it('should respect includeMarkers config', () => {
      // WHY: Sometimes we want text without markers
      const textBlocks: TextBlock[] = [
        {
          text: 'Content',
          page: 0,
          bbox: { x: 72, y: 650, width: 400, height: 48 },
        },
      ];

      const result = formatTextWithPageMarkers('', textBlocks, { includeMarkers: false });

      expect(result.formattedText).not.toContain('PAGE 0:');
      expect(result.formattedText).toContain('Content');
    });

    it('should handle custom page separator', () => {
      // WHY: Configurable separator for different use cases
      const textBlocks: TextBlock[] = [
        {
          text: 'Page 0',
          page: 0,
          bbox: { x: 72, y: 650, width: 400, height: 48 },
        },
        {
          text: 'Page 1',
          page: 1,
          bbox: { x: 72, y: 650, width: 400, height: 48 },
        },
      ];

      const result = formatTextWithPageMarkers('', textBlocks, { pageSeparator: '\n---\n' });

      expect(result.formattedText).toContain('\n---\n');
    });

    it('should calculate average blocks per page', () => {
      // WHY: Useful metric for quality assessment
      const textBlocks: TextBlock[] = [
        { text: 'Block 1', page: 0, bbox: { x: 0, y: 0, width: 100, height: 20 } },
        { text: 'Block 2', page: 0, bbox: { x: 0, y: 0, width: 100, height: 20 } },
        { text: 'Block 3', page: 0, bbox: { x: 0, y: 0, width: 100, height: 20 } },
        { text: 'Block 4', page: 1, bbox: { x: 0, y: 0, width: 100, height: 20 } },
        { text: 'Block 5', page: 1, bbox: { x: 0, y: 0, width: 100, height: 20 } },
      ];

      const result = formatTextWithPageMarkers('', textBlocks);

      // 5 blocks / 2 pages = 2.5 blocks per page
      expect(result.metadata.averageBlocksPerPage).toBe(2.5);
    });
  });

  describe('extractPageNumber', () => {
    it('should extract page number from text', () => {
      // WHY: Utility for parsing page markers from formatted text
      expect(extractPageNumber('PAGE 5: Some content')).toBe(5);
      expect(extractPageNumber('PAGE 0: Introduction')).toBe(0);
      expect(extractPageNumber('PAGE 123: Large document')).toBe(123);
    });

    it('should handle case-insensitive matching', () => {
      // WHY: Be forgiving with case variations
      expect(extractPageNumber('page 5: Content')).toBe(5);
      expect(extractPageNumber('Page 10: Content')).toBe(10);
    });

    it('should return null for text without page marker', () => {
      // WHY: Graceful handling of non-page text
      expect(extractPageNumber('This is regular text')).toBeNull();
      expect(extractPageNumber('Some content')).toBeNull();
    });

    it('should return null for malformed page markers', () => {
      // WHY: Only accept properly formatted markers
      expect(extractPageNumber('PAGE: No number')).toBeNull();
      expect(extractPageNumber('PAGE abc: Invalid')).toBeNull();
    });
  });

  describe('validatePageMarkers', () => {
    it('should validate correct page markers', () => {
      // WHY: Quality assurance for formatted output
      const formattedText = `PAGE 0:\nContent A\n\nPAGE 1:\nContent B\n\nPAGE 2:\nContent C`;

      const result = validatePageMarkers(formattedText, [0, 1, 2]);

      expect(result.valid).toBe(true);
      expect(result.foundPages).toEqual([0, 1, 2]);
      expect(result.missingPages).toEqual([]);
      expect(result.extraPages).toEqual([]);
    });

    it('should detect missing pages', () => {
      // WHY: Catch formatting errors where pages are missing
      const formattedText = `PAGE 0:\nContent A\n\nPAGE 2:\nContent C`;

      const result = validatePageMarkers(formattedText, [0, 1, 2]);

      expect(result.valid).toBe(false);
      expect(result.missingPages).toEqual([1]);
    });

    it('should detect extra pages', () => {
      // WHY: Catch formatting errors where unexpected pages appear
      const formattedText = `PAGE 0:\nContent A\n\nPAGE 1:\nContent B\n\nPAGE 3:\nExtra`;

      const result = validatePageMarkers(formattedText, [0, 1]);

      expect(result.valid).toBe(false);
      expect(result.extraPages).toEqual([3]);
    });

    it('should handle non-sequential expected pages', () => {
      // WHY: Support PDFs with missing page numbers
      const formattedText = `PAGE 0:\nA\n\nPAGE 2:\nB\n\nPAGE 5:\nC`;

      const result = validatePageMarkers(formattedText, [0, 2, 5]);

      expect(result.valid).toBe(true);
      expect(result.foundPages).toEqual([0, 2, 5]);
    });
  });
});

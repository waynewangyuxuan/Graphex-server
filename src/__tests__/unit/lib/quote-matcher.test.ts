/**
 * Quote-to-Coordinate Matcher Unit Tests
 *
 * Tests multi-tier matching algorithm for linking AI quotes to PDF coordinates.
 * Critical for precise highlighting functionality in frontend.
 *
 * User requirement: "Be careful, we want the highlight to be precise"
 */

import {
  matchQuoteToCoordinates,
  combineAdjacentBlocks,
  calculateMatchingMetrics,
} from '../../../lib/pdf/quote-matcher';
import { TextBlock } from '../../../types/pdf.types';

describe('Quote-to-Coordinate Matcher Unit Tests', () => {
  // Sample test data
  const sampleTextBlocks: TextBlock[] = [
    {
      text: 'Photosynthesis is the process by which plants convert light energy into chemical energy.',
      page: 0,
      bbox: { x: 72, y: 650, width: 400, height: 48 },
    },
    {
      text: 'Chlorophyll absorbs light primarily in the blue and red wavelengths.',
      page: 1,
      bbox: { x: 72, y: 600, width: 380, height: 36 },
    },
    {
      text: 'Neural Networks are used in machine learning.',
      page: 2,
      bbox: { x: 72, y: 550, width: 350, height: 32 },
    },
    {
      text: 'Social Networks connect people online.',
      page: 2,
      bbox: { x: 72, y: 500, width: 320, height: 32 },
    },
  ];

  describe('matchQuoteToCoordinates - Exact Match', () => {
    it('should find exact matches', () => {
      // WHY: Best case scenario - AI returns verbatim quote
      const quote = 'Photosynthesis is the process by which plants convert light energy into chemical energy.';

      const result = matchQuoteToCoordinates(quote, sampleTextBlocks);

      expect(result.references.length).toBe(1);
      expect(result.metadata.matchType).toBe('exact');
      expect(result.metadata.confidence).toBe(1.0);
      expect(result.references[0].text).toBe(quote);
      expect(result.references[0].page).toBe(0);
    });

    it('should return correct bounding box for exact match', () => {
      // WHY: Frontend needs precise coordinates for highlighting
      const quote = 'Chlorophyll absorbs light primarily in the blue and red wavelengths.';

      const result = matchQuoteToCoordinates(quote, sampleTextBlocks);

      expect(result.references[0].bbox).toEqual({
        x: 72,
        y: 600,
        width: 380,
        height: 36,
      });
    });
  });

  describe('matchQuoteToCoordinates - Normalized Match', () => {
    it('should find normalized matches (case-insensitive)', () => {
      // WHY: AI may change case
      const quote = 'PHOTOSYNTHESIS IS THE PROCESS BY WHICH PLANTS CONVERT LIGHT ENERGY INTO CHEMICAL ENERGY.';

      const result = matchQuoteToCoordinates(quote, sampleTextBlocks);

      expect(result.references.length).toBeGreaterThan(0);
      expect(result.metadata.matchType).toBe('normalized');
      expect(result.metadata.confidence).toBe(0.95);
    });

    it('should handle punctuation differences', () => {
      // WHY: AI may add or remove punctuation
      const quote = 'Chlorophyll absorbs light primarily in the blue and red wavelengths';

      const result = matchQuoteToCoordinates(quote, sampleTextBlocks);

      expect(result.references.length).toBeGreaterThan(0);
      expect(result.metadata.matchType).toBe('normalized');
    });

    it('should handle extra whitespace', () => {
      // WHY: AI may normalize whitespace differently
      const quote = 'Photosynthesis  is   the   process by which plants convert light energy into chemical energy.';

      const result = matchQuoteToCoordinates(quote, sampleTextBlocks);

      expect(result.references.length).toBeGreaterThan(0);
      expect(result.metadata.matchType).toBe('normalized');
    });
  });

  describe('matchQuoteToCoordinates - Token-Based Match', () => {
    it('should find token-based matches', () => {
      // WHY: AI uses same key terms but slight rewording
      const quote = 'Photosynthesis is the process plants use to convert light energy';

      const result = matchQuoteToCoordinates(quote, sampleTextBlocks);

      expect(result.references.length).toBeGreaterThan(0);
      expect(['token-based', 'fuzzy']).toContain(result.metadata.matchType);
    });

    it('should NOT match different concepts (Neural vs Social Networks)', () => {
      // WHY: CRITICAL - prevent false positives
      // "Neural Networks" should NOT match "Social Networks"
      const quote = 'Neural Networks';

      const result = matchQuoteToCoordinates(quote, sampleTextBlocks, {
        allowFuzzyMatch: false, // Disable fuzzy to test token-based only
      });

      // Should either match "Neural Networks" exactly or fail
      if (result.references.length > 0) {
        expect(result.references[0].text).toContain('Neural');
        expect(result.references[0].text).not.toContain('Social');
      }
    });

    it('should respect token overlap threshold', () => {
      // WHY: High threshold prevents false positives
      const quote = 'Plants and energy conversion'; // Only 2/7 words match

      const result = matchQuoteToCoordinates(quote, sampleTextBlocks, {
        tokenOverlapThreshold: 0.8, // Require 80% overlap
        allowFuzzyMatch: false,
      });

      // Should fail due to low overlap
      expect(result.metadata.matchType).toBe('none');
    });
  });

  describe('matchQuoteToCoordinates - Fuzzy Match', () => {
    it('should find fuzzy matches within threshold', () => {
      // WHY: Handle minor typos or paraphrasing
      const quote = 'Photosynthesis is the proces by which plants convert lite energy';

      const result = matchQuoteToCoordinates(quote, sampleTextBlocks, {
        allowFuzzyMatch: true,
        fuzzyThreshold: 0.15,
      });

      expect(result.references.length).toBeGreaterThan(0);
      expect(result.metadata.matchType).toBe('fuzzy');
      expect(result.metadata.confidence).toBe(0.7);
    });

    it('should reject matches beyond threshold', () => {
      // WHY: Prevent matching completely different text
      const quote = 'Completely different text that should not match anything';

      const result = matchQuoteToCoordinates(quote, sampleTextBlocks, {
        fuzzyThreshold: 0.15,
      });

      expect(result.metadata.matchType).toBe('none');
      expect(result.references.length).toBe(0);
    });

    it('should respect allowFuzzyMatch config', () => {
      // WHY: Allow disabling fuzzy matching for stricter mode
      const quote = 'Photosynthesis is the proces'; // Typo

      const result = matchQuoteToCoordinates(quote, sampleTextBlocks, {
        allowFuzzyMatch: false,
      });

      expect(result.metadata.matchType).toBe('none');
      expect(result.references.length).toBe(0);
    });
  });

  describe('matchQuoteToCoordinates - Edge Cases', () => {
    it('should handle empty quote', () => {
      // WHY: Graceful handling of invalid input
      const result = matchQuoteToCoordinates('', sampleTextBlocks);

      expect(result.metadata.matchType).toBe('none');
      expect(result.references.length).toBe(0);
      expect(result.metadata.warnings).toContain('No match found for quote (tried 1 strategies)');
    });

    it('should handle empty textBlocks', () => {
      // WHY: Graceful handling when no coordinates available
      const quote = 'Some quote';

      const result = matchQuoteToCoordinates(quote, []);

      expect(result.metadata.matchType).toBe('none');
      expect(result.references.length).toBe(0);
      expect(result.metadata.warnings.length).toBeGreaterThan(0);
    });

    it('should respect maxBlocks limit', () => {
      // WHY: Prevent returning too many matches
      const duplicateBlocks: TextBlock[] = Array(10).fill({
        text: 'Repeated text',
        page: 0,
        bbox: { x: 72, y: 650, width: 400, height: 48 },
      });

      const result = matchQuoteToCoordinates('Repeated text', duplicateBlocks, {
        maxBlocks: 3,
      });

      expect(result.references.length).toBeLessThanOrEqual(3);
      expect(result.metadata.warnings.some(w => w.includes('returning first'))).toBe(true);
    });

    it('should track attempted strategies in metadata', () => {
      // WHY: Useful for debugging and metrics
      const quote = 'Non-existent quote';

      const result = matchQuoteToCoordinates(quote, sampleTextBlocks);

      expect(result.metadata.attemptedStrategies).toContain('exact');
      expect(result.metadata.attemptedStrategies).toContain('normalized');
      expect(result.metadata.attemptedStrategies).toContain('token-based');
      expect(result.metadata.attemptedStrategies).toContain('fuzzy');
    });
  });

  describe('combineAdjacentBlocks', () => {
    it('should combine multiple blocks into one reference', () => {
      // WHY: Handle quotes that span multiple text blocks
      const blocks: TextBlock[] = [
        {
          text: 'First part of quote',
          page: 0,
          bbox: { x: 72, y: 650, width: 200, height: 24 },
        },
        {
          text: 'Second part of quote',
          page: 0,
          bbox: { x: 72, y: 626, width: 210, height: 24 },
        },
      ];

      const result = combineAdjacentBlocks(blocks);

      expect(result.text).toBe('First part of quote Second part of quote');
      expect(result.page).toBe(0);
      expect(result.bbox.x).toBe(72);
      expect(result.bbox.width).toBe(210); // Max width
    });

    it('should handle single block', () => {
      // WHY: No-op for single block
      const blocks: TextBlock[] = [
        {
          text: 'Single block',
          page: 0,
          bbox: { x: 72, y: 650, width: 200, height: 24 },
        },
      ];

      const result = combineAdjacentBlocks(blocks);

      expect(result.text).toBe('Single block');
      expect(result.bbox).toEqual({ x: 72, y: 650, width: 200, height: 24 });
    });

    it('should throw error for empty blocks array', () => {
      // WHY: Invalid input should be caught
      expect(() => combineAdjacentBlocks([])).toThrow('Cannot combine empty block array');
    });

    it('should throw error for blocks from different pages', () => {
      // WHY: Cannot combine blocks across pages
      const blocks: TextBlock[] = [
        {
          text: 'Page 0',
          page: 0,
          bbox: { x: 72, y: 650, width: 200, height: 24 },
        },
        {
          text: 'Page 1',
          page: 1,
          bbox: { x: 72, y: 650, width: 200, height: 24 },
        },
      ];

      expect(() => combineAdjacentBlocks(blocks)).toThrow('Cannot combine blocks from different pages');
    });

    it('should merge bounding boxes correctly', () => {
      // WHY: Frontend needs precise combined bbox
      const blocks: TextBlock[] = [
        {
          text: 'Block 1',
          page: 0,
          bbox: { x: 72, y: 650, width: 100, height: 20 },
        },
        {
          text: 'Block 2',
          page: 0,
          bbox: { x: 72, y: 625, width: 150, height: 25 },
        },
      ];

      const result = combineAdjacentBlocks(blocks);

      // Should create bbox that contains both blocks
      expect(result.bbox.x).toBe(72); // Min x
      expect(result.bbox.y).toBe(625); // Min y
      expect(result.bbox.width).toBe(150); // Max (x + width) - min x
      expect(result.bbox.height).toBe(45); // Max (y + height) - min y
    });
  });

  describe('calculateMatchingMetrics', () => {
    it('should calculate metrics correctly', () => {
      // WHY: Quality monitoring for production
      const results = [
        {
          references: [{ text: 'A', page: 0, bbox: { x: 0, y: 0, width: 100, height: 20 } }],
          metadata: {
            matchType: 'exact' as const,
            confidence: 1.0,
            matchedBlocks: 1,
            attemptedStrategies: ['exact'],
            warnings: [],
          },
        },
        {
          references: [{ text: 'B', page: 0, bbox: { x: 0, y: 0, width: 100, height: 20 } }],
          metadata: {
            matchType: 'normalized' as const,
            confidence: 0.95,
            matchedBlocks: 1,
            attemptedStrategies: ['exact', 'normalized'],
            warnings: [],
          },
        },
        {
          references: [],
          metadata: {
            matchType: 'none' as const,
            confidence: 0,
            matchedBlocks: 0,
            attemptedStrategies: ['exact', 'normalized', 'token-based', 'fuzzy'],
            warnings: ['No match found'],
          },
        },
      ];

      const metrics = calculateMatchingMetrics(results);

      expect(metrics.totalQuotes).toBe(3);
      expect(metrics.exactMatchRate).toBe(100 / 3); // 33.33%
      expect(metrics.normalizedMatchRate).toBe(100 / 3); // 33.33%
      expect(metrics.failedMatchRate).toBe(100 / 3); // 33.33%
      expect(metrics.averageConfidence).toBeCloseTo(0.65, 2); // (1.0 + 0.95 + 0) / 3
      expect(metrics.averageBlocksPerQuote).toBeCloseTo(0.67, 2); // (1 + 1 + 0) / 3
    });

    it('should handle empty results array', () => {
      // WHY: Graceful handling of no results
      const metrics = calculateMatchingMetrics([]);

      expect(metrics.totalQuotes).toBe(0);
      expect(metrics.exactMatchRate).toBe(0);
      expect(metrics.averageConfidence).toBe(0);
    });

    it('should calculate all match type rates', () => {
      // WHY: Track distribution of match strategies
      const results = [
        {
          references: [{ text: 'A', page: 0, bbox: { x: 0, y: 0, width: 100, height: 20 } }],
          metadata: {
            matchType: 'exact' as const,
            confidence: 1.0,
            matchedBlocks: 1,
            attemptedStrategies: ['exact'],
            warnings: [],
          },
        },
        {
          references: [{ text: 'B', page: 0, bbox: { x: 0, y: 0, width: 100, height: 20 } }],
          metadata: {
            matchType: 'token-based' as const,
            confidence: 0.85,
            matchedBlocks: 1,
            attemptedStrategies: ['exact', 'normalized', 'token-based'],
            warnings: [],
          },
        },
        {
          references: [{ text: 'C', page: 0, bbox: { x: 0, y: 0, width: 100, height: 20 } }],
          metadata: {
            matchType: 'fuzzy' as const,
            confidence: 0.7,
            matchedBlocks: 1,
            attemptedStrategies: ['exact', 'normalized', 'token-based', 'fuzzy'],
            warnings: ['Used fuzzy matching'],
          },
        },
      ];

      const metrics = calculateMatchingMetrics(results);

      expect(metrics.exactMatchRate).toBeCloseTo(33.33, 1);
      expect(metrics.tokenBasedMatchRate).toBeCloseTo(33.33, 1);
      expect(metrics.fuzzyMatchRate).toBeCloseTo(33.33, 1);
    });
  });
});

/**
 * Unit Tests for Cost Estimator
 */

import {
  estimateCost,
  estimateCostFromText,
  formatCost,
  costExceedsLimit,
  COST_LIMITS,
} from '../cost-estimator';

describe('Cost Estimator', () => {
  describe('estimateCost', () => {
    it('should estimate cost for text-only document', () => {
      const result = estimateCost({
        textLength: 10000, // ~2500 tokens
        operationType: 'graph-generation',
      });

      expect(result.estimatedCost).toBeGreaterThan(0);
      expect(result.breakdown.textProcessing).toBeGreaterThan(0);
      expect(result.breakdown.outputGeneration).toBeGreaterThan(0);
      expect(result.breakdown.imageProcessing).toBe(0);
      expect(result.estimatedTokens.input).toBeGreaterThan(0);
      expect(result.model).toBe('claude-sonnet-4');
    });

    it('should estimate cost with images', () => {
      const result = estimateCost({
        textLength: 10000,
        imageCount: 5,
        operationType: 'graph-generation',
      });

      expect(result.breakdown.imageProcessing).toBeGreaterThan(0);
      expect(result.estimatedCost).toBeGreaterThan(
        estimateCost({ textLength: 10000 }).estimatedCost
      );
    });

    it('should use textTokens if provided', () => {
      const result = estimateCost({
        textTokens: 5000,
        operationType: 'graph-generation',
      });

      expect(result.estimatedTokens.input).toBeGreaterThanOrEqual(5000);
    });

    it('should apply operation-specific multipliers', () => {
      const graphResult = estimateCost({
        textLength: 10000,
        operationType: 'graph-generation',
      });

      const explanationResult = estimateCost({
        textLength: 10000,
        operationType: 'connection-explanation',
      });

      // Graph generation has more overhead
      expect(graphResult.estimatedCost).toBeGreaterThan(explanationResult.estimatedCost);
    });

    it('should support different models', () => {
      const sonnetResult = estimateCost({
        textLength: 10000,
        model: 'claude-sonnet-4',
      });

      const haikuResult = estimateCost({
        textLength: 10000,
        model: 'claude-haiku',
      });

      // Haiku is cheaper than Sonnet
      expect(haikuResult.estimatedCost).toBeLessThan(sonnetResult.estimatedCost);
    });
  });

  describe('estimateCostFromText', () => {
    it('should estimate cost from text length', () => {
      const cost = estimateCostFromText(10000);

      expect(cost).toBeGreaterThan(0);
      expect(cost).toBeLessThan(1); // Should be < $1 for 10k chars
    });

    it('should include image costs', () => {
      const withoutImages = estimateCostFromText(10000);
      const withImages = estimateCostFromText(10000, { imageCount: 10 });

      expect(withImages).toBeGreaterThan(withoutImages);
    });

    it('should handle very long documents', () => {
      const cost = estimateCostFromText(200000); // 200k chars = ~50k tokens

      expect(cost).toBeGreaterThan(0.2);
      expect(cost).toBeLessThan(10); // Should still be reasonable
    });

    it('should handle very short documents', () => {
      const cost = estimateCostFromText(500); // 500 chars

      expect(cost).toBeGreaterThan(0);
      expect(cost).toBeLessThan(0.1);
    });
  });

  describe('formatCost', () => {
    it('should format costs correctly', () => {
      expect(formatCost(0.05)).toBe('$0.05');
      expect(formatCost(1.234)).toBe('$1.23');
      expect(formatCost(10.0)).toBe('$10.00');
    });

    it('should handle very small costs', () => {
      expect(formatCost(0.001)).toBe('<$0.01');
      expect(formatCost(0.009)).toBe('<$0.01');
    });

    it('should handle large costs', () => {
      expect(formatCost(99.99)).toBe('$99.99');
      expect(formatCost(100.5)).toBe('$100.50');
    });
  });

  describe('costExceedsLimit', () => {
    it('should return true when cost exceeds limit', () => {
      expect(costExceedsLimit(10, 5)).toBe(true);
      expect(costExceedsLimit(5.01, 5)).toBe(true);
    });

    it('should return false when cost is within limit', () => {
      expect(costExceedsLimit(3, 5)).toBe(false);
      expect(costExceedsLimit(5, 5)).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(costExceedsLimit(0, 5)).toBe(false);
      expect(costExceedsLimit(5, 0)).toBe(true);
    });
  });

  describe('COST_LIMITS', () => {
    it('should define free tier limits', () => {
      expect(COST_LIMITS.FREE_TIER.perDocument).toBe(5.0);
      expect(COST_LIMITS.FREE_TIER.perDay).toBe(10.0);
      expect(COST_LIMITS.FREE_TIER.perMonth).toBe(50.0);
    });

    it('should define pro tier limits', () => {
      expect(COST_LIMITS.PRO_TIER.perDocument).toBe(20.0);
      expect(COST_LIMITS.PRO_TIER.perDay).toBe(100.0);
      expect(COST_LIMITS.PRO_TIER.perMonth).toBe(500.0);
    });
  });

  describe('Real-world scenarios', () => {
    it('should estimate cost for typical research paper', () => {
      // Typical paper: 20 pages, ~10k words, ~40k chars, 5 images
      const cost = estimateCostFromText(40000, { imageCount: 5 });

      expect(cost).toBeGreaterThan(0.1);
      expect(cost).toBeLessThan(5); // Should be under free tier limit
    });

    it('should estimate cost for large textbook chapter', () => {
      // Large chapter: 50 pages, ~25k words, ~100k chars, 20 images
      const cost = estimateCostFromText(100000, { imageCount: 20 });

      expect(cost).toBeGreaterThan(0.3);
      expect(cost).toBeLessThan(10);
    });

    it('should estimate cost for short article', () => {
      // Short article: 2-3 pages, ~1k words, ~5k chars, 2 images
      const cost = estimateCostFromText(5000, { imageCount: 2 });

      expect(cost).toBeGreaterThan(0.01);
      expect(cost).toBeLessThan(1);
    });
  });
});

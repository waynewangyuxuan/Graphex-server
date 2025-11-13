/**
 * Node Deduplicator Tests
 *
 * Tests for multi-phase node deduplication algorithm:
 * - Phase 1: Exact match
 * - Phase 2: Acronym detection
 * - Phase 3: Fuzzy matching with word overlap
 */

import { NodeDeduplicator } from '../node-deduplicator';
import { logger } from '../../../utils/logger.util';
import { DeduplicationInput } from '../../../types/graph.types';

describe('NodeDeduplicator', () => {
  let deduplicator: NodeDeduplicator;

  beforeEach(() => {
    deduplicator = new NodeDeduplicator(logger);
  });

  describe('Phase 1: Exact Match', () => {
    it('should merge nodes with identical titles (case-insensitive)', async () => {
      const input: DeduplicationInput = {
        nodes: [
          { id: '1', title: 'Machine Learning' },
          { id: '2', title: 'machine learning' },
          { id: '3', title: 'MACHINE LEARNING' },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      expect(result.deduplicatedNodes).toHaveLength(1);
      expect(result.statistics.mergedCount).toBe(2);
      expect(result.statistics.mergesByPhase.exact).toBe(2);
    });

    it('should handle whitespace variations', async () => {
      const input: DeduplicationInput = {
        nodes: [
          { id: '1', title: 'Neural Networks' },
          { id: '2', title: '  Neural   Networks  ' },
          { id: '3', title: 'Neural Networks' },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      expect(result.deduplicatedNodes).toHaveLength(1);
      expect(result.statistics.mergedCount).toBe(2);
    });

    it('should preserve the best description when merging', async () => {
      const input: DeduplicationInput = {
        nodes: [
          { id: '1', title: 'AI', description: 'Short' },
          {
            id: '2',
            title: 'ai',
            description: 'A comprehensive description of artificial intelligence',
          },
          { id: '3', title: 'AI' },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      expect(result.deduplicatedNodes).toHaveLength(1);
      const mergedNode = result.deduplicatedNodes[0];
      expect(mergedNode.description).toBe(
        'A comprehensive description of artificial intelligence',
      );
    });
  });

  describe('Phase 2: Acronym Detection', () => {
    it('should match acronyms with full forms', async () => {
      const input: DeduplicationInput = {
        nodes: [
          { id: '1', title: 'ML' },
          { id: '2', title: 'Machine Learning' },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      expect(result.deduplicatedNodes).toHaveLength(1);
      expect(result.statistics.mergesByPhase.acronym).toBe(1);
    });

    it('should match NLP with Natural Language Processing', async () => {
      const input: DeduplicationInput = {
        nodes: [
          { id: '1', title: 'NLP' },
          { id: '2', title: 'Natural Language Processing' },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      expect(result.deduplicatedNodes).toHaveLength(1);
      expect(result.statistics.mergesByPhase.acronym).toBe(1);
    });

    it('should NOT match incorrect acronyms', async () => {
      const input: DeduplicationInput = {
        nodes: [
          { id: '1', title: 'ML' },
          { id: '2', title: 'Natural Language' },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      expect(result.deduplicatedNodes).toHaveLength(2);
      expect(result.statistics.mergesByPhase.acronym).toBe(0);
    });

    it('should handle multiple acronym candidates', async () => {
      const input: DeduplicationInput = {
        nodes: [
          { id: '1', title: 'AI' },
          { id: '2', title: 'Artificial Intelligence' },
          { id: '3', title: 'Automated Inference' },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      // Should merge AI with first match only
      expect(result.deduplicatedNodes).toHaveLength(2);
      expect(result.statistics.mergesByPhase.acronym).toBe(1);
    });
  });

  describe('Phase 3: Fuzzy Matching', () => {
    it('should match similar titles with high Levenshtein similarity AND good word overlap', async () => {
      const input: DeduplicationInput = {
        nodes: [
          { id: '1', title: 'Machine Learning Algorithm' },
          { id: '2', title: 'Machine Learning Algorithms' }, // Very similar + good overlap
        ],
      };

      const result = await deduplicator.deduplicate(input);

      expect(result.deduplicatedNodes).toHaveLength(1);
      expect(result.statistics.mergesByPhase.fuzzy).toBe(1);
    });

    it('should NOT match titles with low word overlap', async () => {
      const input: DeduplicationInput = {
        nodes: [
          { id: '1', title: 'Neural Networks' },
          { id: '2', title: 'Social Networks' }, // Only 1 word overlap
        ],
      };

      const result = await deduplicator.deduplicate(input);

      // Should NOT merge (different concepts)
      expect(result.deduplicatedNodes).toHaveLength(2);
      expect(result.statistics.mergesByPhase.fuzzy).toBe(0);
    });

    it('should match titles with typos and good word overlap', async () => {
      const input: DeduplicationInput = {
        nodes: [
          { id: '1', title: 'Machine Learning Algorithms' },
          { id: '2', title: 'Machine Lerning Algorithms' }, // Typo
        ],
      };

      const result = await deduplicator.deduplicate(input);

      expect(result.deduplicatedNodes).toHaveLength(1);
      expect(result.statistics.mergesByPhase.fuzzy).toBe(1);
    });

    it('should NOT match completely different concepts', async () => {
      const input: DeduplicationInput = {
        nodes: [
          { id: '1', title: 'Supervised Learning' },
          { id: '2', title: 'Reinforcement Learning' },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      expect(result.deduplicatedNodes).toHaveLength(2);
      expect(result.statistics.mergesByPhase.fuzzy).toBe(0);
    });
  });

  describe('Multi-Phase Integration', () => {
    it('should apply all phases in sequence', async () => {
      const input: DeduplicationInput = {
        nodes: [
          { id: '1', title: 'ML' }, // Acronym (Phase 2)
          { id: '2', title: 'Machine Learning' }, // Full form
          { id: '3', title: 'machine learning' }, // Exact match (Phase 1)
          { id: '4', title: 'Machine  Learning' }, // Fuzzy match (extra space, Phase 3)
          { id: '5', title: 'Deep Learning' }, // Different concept
        ],
      };

      const result = await deduplicator.deduplicate(input);

      // All should merge: ML, Machine Learning, machine learning, Machine  Learning (4 nodes)
      // Deep Learning stays separate
      expect(result.deduplicatedNodes).toHaveLength(2);
      expect(result.statistics.originalCount).toBe(5);
      expect(result.statistics.finalCount).toBe(2);
      expect(result.statistics.mergedCount).toBe(3);

      // Verify multiple phases were used (exact + acronym at minimum)
      expect(result.statistics.mergesByPhase.exact).toBeGreaterThan(0);
      expect(result.statistics.mergesByPhase.acronym).toBeGreaterThan(0);
    });

    it('should provide correct mapping for all merged nodes', async () => {
      const input: DeduplicationInput = {
        nodes: [
          { id: '1', title: 'Concept A' },
          { id: '2', title: 'concept a' },
          { id: '3', title: 'Concept B' },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      expect(result.mapping['1']).toBeDefined();
      expect(result.mapping['2']).toBeDefined();
      expect(result.mapping['3']).toBeDefined();

      // 1 and 2 should map to same node
      expect(result.mapping['1']).toBe(result.mapping['2']);

      // 3 should map to different node
      expect(result.mapping['3']).not.toBe(result.mapping['1']);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty node list', async () => {
      const input: DeduplicationInput = {
        nodes: [],
      };

      await expect(deduplicator.deduplicate(input)).rejects.toThrow(
        'Input nodes array is empty',
      );
    });

    it('should handle single node', async () => {
      const input: DeduplicationInput = {
        nodes: [{ id: '1', title: 'Single Node' }],
      };

      const result = await deduplicator.deduplicate(input);

      expect(result.deduplicatedNodes).toHaveLength(1);
      expect(result.statistics.mergedCount).toBe(0);
    });

    it('should handle nodes with missing required fields', async () => {
      const input: DeduplicationInput = {
        nodes: [{ id: '', title: 'Valid Title' }] as any,
      };

      await expect(deduplicator.deduplicate(input)).rejects.toThrow(
        'Node missing required fields',
      );
    });

    it('should handle nodes with no similarities', async () => {
      const input: DeduplicationInput = {
        nodes: [
          { id: '1', title: 'Alpha' },
          { id: '2', title: 'Beta' },
          { id: '3', title: 'Gamma' },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      expect(result.deduplicatedNodes).toHaveLength(3);
      expect(result.statistics.mergedCount).toBe(0);
    });

    it('should handle very long titles', async () => {
      const longTitle =
        'This is an extremely long title that represents a very specific concept in machine learning and artificial intelligence systems';

      const input: DeduplicationInput = {
        nodes: [
          { id: '1', title: longTitle },
          { id: '2', title: longTitle.toLowerCase() },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      expect(result.deduplicatedNodes).toHaveLength(1);
    });

    it('should handle special characters in titles', async () => {
      const input: DeduplicationInput = {
        nodes: [
          { id: '1', title: 'C++ Programming' },
          { id: '2', title: 'C++ programming' },
          { id: '3', title: 'Node.js Development' },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      expect(result.deduplicatedNodes).toHaveLength(2);
    });
  });

  describe('Performance', () => {
    it('should handle large node sets efficiently', async () => {
      // Generate 100 nodes with some duplicates
      const nodes = [];
      for (let i = 0; i < 100; i++) {
        nodes.push({
          id: `node_${i}`,
          title: `Concept ${Math.floor(i / 3)}`, // Create groups of 3 duplicates
        });
      }

      const input: DeduplicationInput = { nodes };

      const startTime = Date.now();
      const result = await deduplicator.deduplicate(input);
      const duration = Date.now() - startTime;

      expect(result.deduplicatedNodes.length).toBeLessThan(100);
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    });
  });

  describe('Union-Find Correctness', () => {
    it('should handle transitive merging correctly', async () => {
      // A merges with B, B merges with C -> all should be in same group
      const input: DeduplicationInput = {
        nodes: [
          { id: '1', title: 'Artificial Intelligence' },
          { id: '2', title: 'AI' }, // Merges with 1 (acronym)
          { id: '3', title: 'ai' }, // Merges with 2 (exact)
        ],
      };

      const result = await deduplicator.deduplicate(input);

      expect(result.deduplicatedNodes).toHaveLength(1);

      // All should map to same node
      const canonicalId = result.mapping['1'];
      expect(result.mapping['2']).toBe(canonicalId);
      expect(result.mapping['3']).toBe(canonicalId);
    });
  });
});

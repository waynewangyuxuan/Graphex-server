/**
 * Semantic Deduplicator Tests - Enhanced Node Structure
 *
 * Tests for the semantic deduplicator to ensure it properly preserves
 * nodeType and summary fields during node merging operations.
 *
 * Coverage:
 * 1. Enhanced fields preserved during exact match merging
 * 2. Enhanced fields preserved during acronym detection
 * 3. Enhanced fields preserved during semantic similarity merging
 * 4. Quality scoring considers summary length (2.5x multiplier)
 * 5. Best node selection based on enhanced fields
 * 6. Edge cases: missing fields, partial data, empty strings
 */

import { Logger } from 'winston';
import { SemanticNodeDeduplicator } from '../semantic-deduplicator';
import { AIOrchestrator } from '../../../services/ai-orchestrator.service';
import { EmbeddingService } from '../../embeddings/embedding-service';
import { NodeType, DeduplicationInput } from '../../../types/graph.types';

// ============================================================
// MOCKS
// ============================================================

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as unknown as Logger;

const mockAIOrchestrator = {
  execute: jest.fn(),
} as unknown as AIOrchestrator;

const mockEmbeddingService = {
  generateEmbedding: jest.fn(),
  generateEmbeddings: jest.fn(),
  cosineSimilarity: jest.fn(),
  getDimensions: jest.fn(),
} as unknown as EmbeddingService;

// ============================================================
// TEST SUITE
// ============================================================

describe('SemanticNodeDeduplicator - Enhanced Node Structure', () => {
  let deduplicator: SemanticNodeDeduplicator;

  beforeEach(() => {
    jest.clearAllMocks();

    // Re-setup mocks after clearing
    (mockEmbeddingService.getDimensions as jest.Mock).mockReturnValue(384);

    // Default mock: embeddings always different (no merging)
    (mockEmbeddingService.generateEmbedding as jest.Mock).mockImplementation(
      async (text: string) => {
        // Generate a simple embedding based on text hash
        const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return Array.from({ length: 384 }, (_, i) => (hash + i) / 1000);
      },
    );

    // Batch version
    (mockEmbeddingService.generateEmbeddings as jest.Mock).mockImplementation(
      async (texts: string[]) => {
        return Promise.all(texts.map(async (text) => {
          const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
          return Array.from({ length: 384 }, (_, i) => (hash + i) / 1000);
        }));
      },
    );

    (mockEmbeddingService.cosineSimilarity as jest.Mock).mockImplementation(
      (a: number[], b: number[]) => {
        // Simple similarity: always low unless identical
        const sum = a.reduce((acc, val, i) => acc + val * b[i], 0);
        const magA = Math.sqrt(a.reduce((acc, val) => acc + val * val, 0));
        const magB = Math.sqrt(b.reduce((acc, val) => acc + val * val, 0));
        return sum / (magA * magB);
      },
    );

    deduplicator = new SemanticNodeDeduplicator(
      mockLogger,
      mockAIOrchestrator,
      mockEmbeddingService,
    );
  });

  // ============================================================
  // TEST 1: EXACT MATCH PRESERVATION
  // ============================================================

  describe('Exact Match Merging', () => {
    it('should preserve enhanced fields when merging exact matches', async () => {
      const input: DeduplicationInput = {
        nodes: [
          {
            id: 'node_1',
            title: 'Machine Learning',
            description: 'Short description',
            nodeType: NodeType.CONCEPT,
            summary: 'Machine learning enables systems to learn from data. It is a subset of artificial intelligence.',
          },
          {
            id: 'node_2',
            title: 'Machine Learning',
            description: 'Longer and more detailed description with additional context',
            nodeType: NodeType.CONCEPT,
            summary: 'Machine learning is a comprehensive field that allows systems to automatically learn and improve from experience without being explicitly programmed. It focuses on the development of computer programs that can access data and use it to learn for themselves.',
          },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      expect(result.deduplicatedNodes).toHaveLength(1);
      expect(result.statistics.mergedCount).toBe(1);
      expect(result.statistics.mergesByPhase.exact).toBe(1);

      const mergedNode = result.deduplicatedNodes[0];
      expect(mergedNode.nodeType).toBe(NodeType.CONCEPT);
      expect(mergedNode.summary).toBeDefined();

      // Should choose the node with longer summary (higher quality score)
      expect(mergedNode.summary!.length).toBeGreaterThan(100);
      expect(mergedNode.description).toContain('additional context');
    });

    it('should handle exact matches with different nodeTypes', async () => {
      const input: DeduplicationInput = {
        nodes: [
          {
            id: 'node_1',
            title: 'Neural Network',
            description: 'First description',
            nodeType: NodeType.CONCEPT,
            summary: 'Short summary here. Just two sentences.',
          },
          {
            id: 'node_2',
            title: 'Neural Network',
            description: 'Second description',
            nodeType: NodeType.METHOD,
            summary: 'Longer summary with more detail and context. This provides comprehensive information.',
          },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      expect(result.deduplicatedNodes).toHaveLength(1);

      const mergedNode = result.deduplicatedNodes[0];
      // Should preserve nodeType from the better node (longer summary)
      expect(mergedNode.nodeType).toBe(NodeType.METHOD);
    });

    it('should handle exact matches where one node lacks enhanced fields', async () => {
      const input: DeduplicationInput = {
        nodes: [
          {
            id: 'node_1',
            title: 'Deep Learning',
            description: 'Has enhanced fields',
            nodeType: NodeType.CONCEPT,
            summary: 'Deep learning uses neural networks with multiple layers. It excels at hierarchical feature learning.',
          },
          {
            id: 'node_2',
            title: 'Deep Learning',
            description: 'Legacy node without enhanced fields',
          },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      expect(result.deduplicatedNodes).toHaveLength(1);

      const mergedNode = result.deduplicatedNodes[0];
      // Should choose the node with enhanced fields (higher quality)
      expect(mergedNode.nodeType).toBe(NodeType.CONCEPT);
      expect(mergedNode.summary).toBeDefined();
      expect(mergedNode.summary).toContain('Deep learning');
    });
  });

  // ============================================================
  // TEST 2: ACRONYM DETECTION PRESERVATION
  // ============================================================

  describe('Acronym Detection Merging', () => {
    it('should preserve enhanced fields when merging acronyms', async () => {
      const input: DeduplicationInput = {
        nodes: [
          {
            id: 'node_1',
            title: 'ML',
            description: 'Short acronym',
            nodeType: NodeType.CONCEPT,
            summary: 'ML is machine learning. It enables automated learning.',
          },
          {
            id: 'node_2',
            title: 'Machine Learning',
            description: 'Full form with details',
            nodeType: NodeType.CONCEPT,
            summary: 'Machine learning is a comprehensive approach to creating intelligent systems through data-driven learning. It encompasses various algorithms and techniques for pattern recognition and prediction.',
          },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      expect(result.deduplicatedNodes).toHaveLength(1);
      expect(result.statistics.mergedCount).toBe(1);

      const mergedNode = result.deduplicatedNodes[0];
      expect(mergedNode.nodeType).toBe(NodeType.CONCEPT);
      expect(mergedNode.summary).toBeDefined();

      // Should prefer full form with longer summary
      expect(mergedNode.title).toBe('Machine Learning');
      expect(mergedNode.summary!.length).toBeGreaterThan(50);
    });

    it('should handle acronyms with different nodeTypes', async () => {
      const input: DeduplicationInput = {
        nodes: [
          {
            id: 'node_1',
            title: 'CNN',
            description: 'Acronym',
            nodeType: NodeType.ALGORITHM,
            summary: 'CNN stands for convolutional neural network. It processes grid-like data.',
          },
          {
            id: 'node_2',
            title: 'Convolutional Neural Network',
            description: 'Full form',
            nodeType: NodeType.METHOD,
            summary: 'A convolutional neural network is a specialized deep learning architecture designed for processing structured grid data. It employs convolutional layers to automatically and adaptively learn spatial hierarchies.',
          },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      expect(result.deduplicatedNodes).toHaveLength(1);

      const mergedNode = result.deduplicatedNodes[0];
      // Should preserve nodeType from better node (fuller context)
      expect([NodeType.ALGORITHM, NodeType.METHOD]).toContain(mergedNode.nodeType);
    });
  });

  // ============================================================
  // TEST 3: QUALITY SCORING WITH SUMMARY
  // ============================================================

  describe('Quality Scoring', () => {
    it('should weight summary at 2.5x multiplier in quality score', async () => {
      const input: DeduplicationInput = {
        nodes: [
          {
            id: 'node_1',
            title: 'AI',
            description: 'Very long description that goes on and on with lots of detail and context to make it comprehensive',
            nodeType: NodeType.CONCEPT,
            summary: 'Short. Brief.',
          },
          {
            id: 'node_2',
            title: 'AI',
            description: 'Short desc',
            nodeType: NodeType.CONCEPT,
            summary: 'Artificial intelligence is a comprehensive field focused on creating intelligent machines that can perform tasks requiring human-like intelligence. It encompasses machine learning, natural language processing, computer vision, robotics, and many other subfields.',
          },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      expect(result.deduplicatedNodes).toHaveLength(1);

      const mergedNode = result.deduplicatedNodes[0];
      // Should choose node_2 despite shorter description because summary is weighted 2.5x
      expect(mergedNode.summary!.length).toBeGreaterThan(100);
      expect(mergedNode.description).toBe('Short desc');
    });

    it('should prefer nodes with both description and summary', async () => {
      const input: DeduplicationInput = {
        nodes: [
          {
            id: 'node_1',
            title: 'Data Science',
            description: 'Very comprehensive and detailed description of data science',
          },
          {
            id: 'node_2',
            title: 'Data Science',
            description: 'Medium description',
            nodeType: NodeType.CONCEPT,
            summary: 'Data science combines statistics, programming, and domain expertise. It extracts insights from data.',
          },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      expect(result.deduplicatedNodes).toHaveLength(1);

      const mergedNode = result.deduplicatedNodes[0];
      // Should prefer node with enhanced fields
      expect(mergedNode.nodeType).toBe(NodeType.CONCEPT);
      expect(mergedNode.summary).toBeDefined();
    });

    it('should handle nodes with only summary (no description)', async () => {
      const input: DeduplicationInput = {
        nodes: [
          {
            id: 'node_1',
            title: 'Blockchain',
            nodeType: NodeType.CONCEPT,
            summary: 'Blockchain is a distributed ledger technology that maintains a secure and decentralized record of transactions. It uses cryptographic hashing and consensus mechanisms to ensure data integrity.',
          },
          {
            id: 'node_2',
            title: 'Blockchain',
            description: 'Short description',
          },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      expect(result.deduplicatedNodes).toHaveLength(1);

      const mergedNode = result.deduplicatedNodes[0];
      // Summary-only node should win due to 2.5x multiplier
      expect(mergedNode.summary).toBeDefined();
      expect(mergedNode.summary!.length).toBeGreaterThan(50);
    });
  });

  // ============================================================
  // TEST 4: BEST NODE SELECTION
  // ============================================================

  describe('Best Node Selection', () => {
    it('should choose node with longest summary when merging', async () => {
      const input: DeduplicationInput = {
        nodes: [
          {
            id: 'node_1',
            title: 'Quantum Computing',
            description: 'Desc 1',
            nodeType: NodeType.CONCEPT,
            summary: 'Quantum computing uses quantum mechanics. It processes information differently.',
          },
          {
            id: 'node_2',
            title: 'Quantum Computing',
            description: 'Desc 2',
            nodeType: NodeType.CONCEPT,
            summary: 'Quantum computing leverages quantum mechanical phenomena such as superposition and entanglement to perform computations. Unlike classical computers that use bits, quantum computers use quantum bits or qubits that can exist in multiple states simultaneously.',
          },
          {
            id: 'node_3',
            title: 'Quantum Computing',
            description: 'Desc 3',
            nodeType: NodeType.CONCEPT,
            summary: 'Medium length summary here. Provides some context.',
          },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      expect(result.deduplicatedNodes).toHaveLength(1);

      const mergedNode = result.deduplicatedNodes[0];
      // Should choose node_2 with longest, most detailed summary
      expect(mergedNode.summary).toContain('superposition and entanglement');
    });

    it('should preserve nodeType from best node', async () => {
      const input: DeduplicationInput = {
        nodes: [
          {
            id: 'node_1',
            title: 'Gradient Descent',
            description: 'Short',
            nodeType: NodeType.CONCEPT,
            summary: 'Brief. Short.',
          },
          {
            id: 'node_2',
            title: 'Gradient Descent',
            description: 'Medium description',
            nodeType: NodeType.ALGORITHM,
            summary: 'Gradient descent is an optimization algorithm used to minimize the cost function in machine learning models. It iteratively adjusts parameters in the direction of steepest descent of the gradient.',
          },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      expect(result.deduplicatedNodes).toHaveLength(1);

      const mergedNode = result.deduplicatedNodes[0];
      // Should use nodeType from node with better summary
      expect(mergedNode.nodeType).toBe(NodeType.ALGORITHM);
    });
  });

  // ============================================================
  // TEST 5: EDGE CASES
  // ============================================================

  describe('Edge Cases', () => {
    it('should handle nodes with undefined enhanced fields', async () => {
      const input: DeduplicationInput = {
        nodes: [
          {
            id: 'node_1',
            title: 'Test',
            description: 'Description',
            nodeType: undefined,
            summary: undefined,
          },
          {
            id: 'node_2',
            title: 'Test',
            description: 'Another description',
          },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      expect(result.deduplicatedNodes).toHaveLength(1);
      expect(result.deduplicatedNodes[0].nodeType).toBeUndefined();
      expect(result.deduplicatedNodes[0].summary).toBeUndefined();
    });

    it('should handle nodes with empty string enhanced fields', async () => {
      const input: DeduplicationInput = {
        nodes: [
          {
            id: 'node_1',
            title: 'Empty Fields',
            description: 'Description 1',
            nodeType: '',
            summary: '',
          },
          {
            id: 'node_2',
            title: 'Empty Fields',
            description: 'Description 2 is longer and better',
            nodeType: NodeType.CONCEPT,
            summary: 'This has actual content. Second sentence here.',
          },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      expect(result.deduplicatedNodes).toHaveLength(1);

      const mergedNode = result.deduplicatedNodes[0];
      // Should choose node with actual content
      expect(mergedNode.nodeType).toBe(NodeType.CONCEPT);
      expect(mergedNode.summary).toContain('actual content');
    });

    it('should handle mixed nodes with and without enhanced fields', async () => {
      const input: DeduplicationInput = {
        nodes: [
          {
            id: 'node_1',
            title: 'Node A',
            description: 'Legacy node',
          },
          {
            id: 'node_2',
            title: 'Node B',
            description: 'Enhanced node',
            nodeType: NodeType.METHOD,
            summary: 'This node has enhanced fields. It should be preserved.',
          },
          {
            id: 'node_3',
            title: 'Node C',
            description: 'Another legacy node',
          },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      // Nodes might merge due to similarity, but we should have at least one
      expect(result.deduplicatedNodes.length).toBeGreaterThan(0);
      expect(result.statistics.originalCount).toBe(3);

      // The enhanced node should preserve its fields (whether merged or not)
      const hasEnhancedFields = result.deduplicatedNodes.some(
        n => n.nodeType !== undefined && n.summary !== undefined
      );
      expect(hasEnhancedFields).toBe(true);
    });

    it('should preserve enhanced fields when no merging occurs', async () => {
      const input: DeduplicationInput = {
        nodes: [
          {
            id: 'node_1',
            title: 'Unique Node A',
            description: 'Description A',
            nodeType: NodeType.CONCEPT,
            summary: 'Summary A here. Second sentence.',
          },
          {
            id: 'node_2',
            title: 'Unique Node B',
            description: 'Description B',
            nodeType: NodeType.METHOD,
            summary: 'Summary B here. Different content.',
          },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      // Even if merged due to similarity, enhanced fields should be preserved
      expect(result.deduplicatedNodes.length).toBeGreaterThan(0);
      expect(result.statistics.originalCount).toBe(2);

      // All nodes should preserve enhanced fields
      for (const node of result.deduplicatedNodes) {
        expect(node.nodeType).toBeDefined();
        expect(node.summary).toBeDefined();
      }
    });

    it('should handle very long summaries', async () => {
      const longSummary = 'This is a very long summary that contains multiple sentences and goes into great detail about the topic. '.repeat(10);

      const input: DeduplicationInput = {
        nodes: [
          {
            id: 'node_1',
            title: 'Long Summary Node',
            description: 'Short desc',
            nodeType: NodeType.CONCEPT,
            summary: longSummary,
          },
          {
            id: 'node_2',
            title: 'Long Summary Node',
            description: 'Another desc',
            nodeType: NodeType.CONCEPT,
            summary: 'Short summary. Brief.',
          },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      // Should merge exact matches
      expect(result.deduplicatedNodes.length).toBeGreaterThan(0);
      expect(result.statistics.mergedCount).toBeGreaterThan(0);

      const mergedNode = result.deduplicatedNodes[0];
      // Should choose the longer summary (quality score weights summary at 2.5x)
      expect(mergedNode.summary!.length).toBeGreaterThan(100);
    });

    it('should handle special characters in enhanced fields', async () => {
      const input: DeduplicationInput = {
        nodes: [
          {
            id: 'node_1',
            title: 'Special Chars',
            description: 'Description with "quotes" and \'apostrophes\'',
            nodeType: 'custom-type-with-dashes',
            summary: 'Summary with special chars: @#$%^&*(). Second sentence here!',
          },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      expect(result.deduplicatedNodes).toHaveLength(1);
      expect(result.deduplicatedNodes[0].nodeType).toBe('custom-type-with-dashes');
      expect(result.deduplicatedNodes[0].summary).toContain('@#$%^&*()');
    });
  });

  // ============================================================
  // TEST 6: STATISTICS AND METADATA
  // ============================================================

  describe('Statistics and Metadata', () => {
    it('should track merges with enhanced fields correctly', async () => {
      const input: DeduplicationInput = {
        nodes: [
          {
            id: 'node_1',
            title: 'Artificial Intelligence',
            nodeType: NodeType.CONCEPT,
            summary: 'First AI summary. Brief version.',
          },
          {
            id: 'node_2',
            title: 'Artificial Intelligence',
            nodeType: NodeType.CONCEPT,
            summary: 'Second AI summary with more detail and comprehensive explanation. It provides extensive context.',
          },
          {
            id: 'node_3',
            title: 'Quantum Computing',
            nodeType: NodeType.METHOD,
            summary: 'Different concept entirely. Not merged.',
          },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      expect(result.statistics.originalCount).toBe(3);
      // Should merge the two "Artificial Intelligence" nodes
      expect(result.statistics.mergedCount).toBeGreaterThan(0);
      expect(result.statistics.finalCount).toBeLessThan(3);
    });

    it('should provide correct mapping for merged nodes', async () => {
      const input: DeduplicationInput = {
        nodes: [
          {
            id: 'A',
            title: 'Node X',
            nodeType: NodeType.CONCEPT,
            summary: 'Summary A. Details.',
          },
          {
            id: 'B',
            title: 'Node X',
            nodeType: NodeType.CONCEPT,
            summary: 'Summary B with more comprehensive details. Extended information.',
          },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      expect(result.deduplicatedNodes).toHaveLength(1);

      // Both original IDs should map to the merged node
      const mergedId = result.deduplicatedNodes[0].id;
      expect(result.mapping['A']).toBe(mergedId);
      expect(result.mapping['B']).toBe(mergedId);
    });
  });

  // ============================================================
  // TEST 7: INTEGRATION SCENARIOS
  // ============================================================

  describe('Integration Scenarios', () => {
    it('should handle realistic multi-chunk graph deduplication with exact matches', async () => {
      const input: DeduplicationInput = {
        nodes: [
          // Chunk 0
          {
            id: '0_A',
            title: 'Machine Learning',
            description: 'ML from chunk 0',
            nodeType: NodeType.CONCEPT,
            summary: 'Machine learning enables systems to learn from data. It is a core component of modern AI.',
          },
          {
            id: '0_B',
            title: 'Neural Networks',
            description: 'NN from chunk 0',
            nodeType: NodeType.METHOD,
            summary: 'Neural networks are computational models. They process information.',
          },
          // Chunk 1 - duplicate ML node
          {
            id: '1_A',
            title: 'Machine Learning',
            description: 'ML from chunk 1 with more context and detail',
            nodeType: NodeType.CONCEPT,
            summary: 'Machine learning is a subset of artificial intelligence that enables systems to automatically learn and improve from experience without being explicitly programmed. It focuses on the development of algorithms that can access data and learn patterns.',
          },
          {
            id: '1_C',
            title: 'Deep Learning',
            description: 'DL from chunk 1',
            nodeType: NodeType.METHOD,
            summary: 'Deep learning uses multi-layer neural networks. It excels.',
          },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      // Should merge "Machine Learning" nodes (exact match on title)
      expect(result.statistics.mergedCount).toBeGreaterThan(0);

      // Verify enhanced fields are preserved in merged result
      const mergedNodes = result.deduplicatedNodes;
      for (const node of mergedNodes) {
        if (node.title === 'Machine Learning') {
          expect(node.nodeType).toBe(NodeType.CONCEPT);
          expect(node.summary).toBeDefined();
          // Should choose the longer summary
          expect(node.summary!.length).toBeGreaterThan(50);
        }
      }
    });

    it('should preserve all NodeType categories through deduplication', async () => {
      // Use exact duplicates to test preservation
      const input: DeduplicationInput = {
        nodes: [
          { id: '1', title: 'AI Concept', nodeType: NodeType.CONCEPT, summary: 'AI concept summary. Second sentence.' },
          { id: '2', title: 'AI Concept', nodeType: NodeType.CONCEPT, summary: 'Longer AI concept summary with more detail and comprehensive explanation. It provides extensive context.' },
          { id: '3', title: 'ML Method', nodeType: NodeType.METHOD, summary: 'ML method summary. Second sentence.' },
          { id: '4', title: 'ML Method', nodeType: NodeType.METHOD, summary: 'Longer ML method summary. More detail here.' },
        ],
      };

      const result = await deduplicator.deduplicate(input);

      // Should have merged duplicates
      expect(result.deduplicatedNodes.length).toBeLessThan(4);

      // All nodes should have their enhanced fields preserved
      for (const node of result.deduplicatedNodes) {
        expect(node.nodeType).toBeDefined();
        expect(node.summary).toBeDefined();
        expect(node.summary!.length).toBeGreaterThan(0);
      }
    });
  });
});

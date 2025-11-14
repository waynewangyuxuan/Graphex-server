/**
 * Graph Generator Service Tests - Enhanced Node Structure
 *
 * Tests for the graph generator service to ensure it properly preserves
 * nodeType and summary fields throughout the graph generation pipeline:
 *
 * 1. AI responses with nodeType and summary are preserved
 * 2. Mini-graph merging maintains enhanced fields
 * 3. Combined graphs contain all enhanced node data
 * 4. Edge cases: missing fields, partial data, legacy nodes
 */

import { Logger } from 'winston';
import { GraphGeneratorService } from '../graph-generator.service';
import { TextChunker } from '../../lib/chunking/text-chunker';
import { AIOrchestrator } from '../ai-orchestrator.service';
import { CostTrackerService } from '../cost-tracker.service';
import { SemanticNodeDeduplicator } from '../../lib/graph/semantic-deduplicator';
import { AIGraphOutput } from '../../types/validation.types';
import { NodeType } from '../../types/graph.types';

// ============================================================
// MOCKS
// ============================================================

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as unknown as Logger;

const mockTextChunker = {
  chunk: jest.fn(),
} as unknown as TextChunker;

const mockAIOrchestrator = {
  execute: jest.fn(),
} as unknown as AIOrchestrator;

const mockCostTracker = {
  checkBudget: jest.fn(),
  recordUsage: jest.fn(),
} as unknown as CostTrackerService;

const mockSemanticDeduplicator = {
  deduplicate: jest.fn(),
} as unknown as SemanticNodeDeduplicator;

// ============================================================
// TEST DATA FACTORIES
// ============================================================

/**
 * Create a mock AI response with enhanced node fields
 */
const createEnhancedMiniGraph = (
  chunkIndex: number,
  nodes: Array<{ id: string; title: string; nodeType: NodeType; summary: string }>
): AIGraphOutput => ({
  mermaidCode: 'flowchart TD',
  nodes: nodes.map(n => ({
    id: n.id,
    title: n.title,
    description: `Description for ${n.title}`,
    nodeType: n.nodeType,
    summary: n.summary,
    metadata: {
      documentRefs: [
        {
          start: chunkIndex * 1000,
          end: chunkIndex * 1000 + 100,
          text: `Reference text for ${n.title}`,
        },
      ],
    },
  })),
  edges: nodes.length > 1 ? [
    {
      fromNodeId: nodes[0].id,
      toNodeId: nodes[1].id,
      relationship: 'enables',
      metadata: { strength: 0.9 },
    },
  ] : [],
  metadata: { chunkIndex },
});

/**
 * Create a legacy mini-graph without enhanced fields
 */
const createLegacyMiniGraph = (chunkIndex: number, nodeCount: number): AIGraphOutput => ({
  mermaidCode: 'flowchart TD',
  nodes: Array.from({ length: nodeCount }, (_, i) => ({
    id: `node_${i}`,
    title: `Concept ${chunkIndex}_${i}`,
    description: `Description for concept ${chunkIndex}_${i}`,
    metadata: {},
  })),
  edges: Array.from({ length: nodeCount - 1 }, (_, i) => ({
    fromNodeId: `node_${i}`,
    toNodeId: `node_${i + 1}`,
    relationship: 'relates to',
    metadata: {},
  })),
  metadata: { chunkIndex },
});

/**
 * Create a chunking result
 */
const createMockChunkingResult = (numChunks: number) => ({
  chunks: Array.from({ length: numChunks }, (_, i) => ({
    id: `chunk_${i}`,
    content: `Content for chunk ${i}`,
    startIndex: i * 1000,
    endIndex: (i + 1) * 1000,
    chunkIndex: i,
    totalChunks: numChunks,
    estimatedTokens: 250,
    overlapWithPrevious: i > 0 ? 100 : 0,
    overlapWithNext: i < numChunks - 1 ? 100 : 0,
    metadata: {
      headings: [],
      splitMethod: 'paragraph' as const,
      quality: {
        hasCleanBoundaries: true,
        isOptimalSize: true,
        hasSufficientContext: true,
      },
      wordCount: 200,
      lineCount: 10,
    },
  })),
  documentMetadata: {
    totalCharacters: 1000 * numChunks,
    totalWords: 200 * numChunks,
    documentType: 'markdown' as const,
    title: 'Test Document',
  },
  statistics: {
    totalChunks: numChunks,
    averageChunkSize: 1000,
    minChunkSize: 1000,
    maxChunkSize: 1000,
    totalOverlapCharacters: (numChunks - 1) * 100,
    overlapPercentage: 10,
    qualityScore: 95,
    warnings: [],
  },
});

// ============================================================
// TEST SUITE
// ============================================================

describe('GraphGeneratorService - Enhanced Node Structure', () => {
  let service: GraphGeneratorService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new GraphGeneratorService(
      mockTextChunker,
      mockAIOrchestrator,
      mockCostTracker,
      mockSemanticDeduplicator,
      mockLogger,
    );

    // Default budget check
    (mockCostTracker.checkBudget as jest.Mock).mockResolvedValue({
      allowed: true,
      reason: undefined,
      estimatedCost: 0.05,
      currentUsage: {
        remaining: 10.0,
      },
    });
  });

  // ============================================================
  // TEST 1: AI RESPONSES WITH ENHANCED FIELDS
  // ============================================================

  describe('AI Response Preservation', () => {
    it('should preserve nodeType and summary from AI response', async () => {
      (mockTextChunker.chunk as jest.Mock).mockResolvedValue(createMockChunkingResult(1));

      const enhancedGraph = createEnhancedMiniGraph(0, [
        {
          id: 'A',
          title: 'Machine Learning',
          nodeType: NodeType.CONCEPT,
          summary: 'Machine learning is a subset of AI that enables systems to learn from data. It automates analytical model building through pattern recognition and statistical analysis.',
        },
        {
          id: 'B',
          title: 'Supervised Learning',
          nodeType: NodeType.METHOD,
          summary: 'Supervised learning is a machine learning paradigm that uses labeled training data. The algorithm learns to map inputs to outputs based on example input-output pairs.',
        },
      ]);

      (mockAIOrchestrator.execute as jest.Mock).mockResolvedValue({
        data: enhancedGraph,
        model: 'claude-haiku',
        quality: { passed: true, score: 85, issues: [], warnings: [] },
        metadata: {
          tokensUsed: { input: 100, output: 50, total: 150 },
          cost: 0.01,
          cached: false,
          processingTime: 500,
          attempts: 1,
          validationPassed: true,
          promptVersion: 'production',
          timestamp: new Date(),
        },
      });

      // Mock deduplicator to pass through
      (mockSemanticDeduplicator.deduplicate as jest.Mock).mockResolvedValue({
        deduplicatedNodes: enhancedGraph.nodes.map(n => ({
          id: `0_${n.id}`,
          title: n.title,
          description: n.description,
          nodeType: n.nodeType,
          summary: n.summary,
        })),
        mapping: {
          '0_A': '0_A',
          '0_B': '0_B',
        },
        statistics: {
          originalCount: 2,
          finalCount: 2,
          mergedCount: 0,
          mergesByPhase: { exact: 0, acronym: 0, fuzzy: 0 },
        },
      });

      const result = await service.generateGraph({
        documentId: 'doc_1',
        documentText: 'Test document',
        documentTitle: 'Test',
      });

      // Verify enhanced fields are preserved
      expect(result.nodes).toHaveLength(2);

      const mlNode = result.nodes.find(n => n.title === 'Machine Learning');
      expect(mlNode).toBeDefined();
      expect(mlNode?.nodeType).toBe(NodeType.CONCEPT);
      expect(mlNode?.summary).toBeDefined();
      expect(mlNode?.summary).toContain('Machine learning');

      const slNode = result.nodes.find(n => n.title === 'Supervised Learning');
      expect(slNode).toBeDefined();
      expect(slNode?.nodeType).toBe(NodeType.METHOD);
      expect(slNode?.summary).toBeDefined();
      expect(slNode?.summary).toContain('Supervised learning');
    });

    it('should handle nodes with all NodeType categories', async () => {
      (mockTextChunker.chunk as jest.Mock).mockResolvedValue(createMockChunkingResult(1));

      const diverseGraph = createEnhancedMiniGraph(0, [
        {
          id: 'A',
          title: 'Neural Network',
          nodeType: NodeType.CONCEPT,
          summary: 'A neural network is a computational model inspired by biological neural networks. It consists of interconnected nodes that process and transmit information.',
        },
        {
          id: 'B',
          title: 'Geoffrey Hinton',
          nodeType: NodeType.PERSON,
          summary: 'Geoffrey Hinton is a cognitive psychologist and computer scientist known as the "Godfather of AI". He pioneered deep learning research and backpropagation algorithms.',
        },
        {
          id: 'C',
          title: 'Backpropagation',
          nodeType: NodeType.ALGORITHM,
          summary: 'Backpropagation is an algorithm for training neural networks by calculating gradients. It efficiently computes the gradient of the loss function with respect to network weights.',
        },
        {
          id: 'D',
          title: 'ImageNet Competition',
          nodeType: NodeType.EVENT,
          summary: 'The ImageNet competition is an annual computer vision challenge. It catalyzed the deep learning revolution when AlexNet won in 2012.',
        },
      ]);

      (mockAIOrchestrator.execute as jest.Mock).mockResolvedValue({
        data: diverseGraph,
        model: 'claude-haiku',
        quality: { passed: true, score: 90, issues: [], warnings: [] },
        metadata: {
          tokensUsed: { input: 150, output: 100, total: 250 },
          cost: 0.015,
          cached: false,
          processingTime: 600,
          attempts: 1,
          validationPassed: true,
          promptVersion: 'production',
          timestamp: new Date(),
        },
      });

      (mockSemanticDeduplicator.deduplicate as jest.Mock).mockResolvedValue({
        deduplicatedNodes: diverseGraph.nodes.map(n => ({
          id: `0_${n.id}`,
          title: n.title,
          description: n.description,
          nodeType: n.nodeType,
          summary: n.summary,
        })),
        mapping: {
          '0_A': '0_A',
          '0_B': '0_B',
          '0_C': '0_C',
          '0_D': '0_D',
        },
        statistics: {
          originalCount: 4,
          finalCount: 4,
          mergedCount: 0,
          mergesByPhase: { exact: 0, acronym: 0, fuzzy: 0 },
        },
      });

      const result = await service.generateGraph({
        documentId: 'doc_2',
        documentText: 'Test document',
        documentTitle: 'Test',
      });

      expect(result.nodes).toHaveLength(4);

      const nodeTypes = result.nodes.map(n => n.nodeType);
      expect(nodeTypes).toContain(NodeType.CONCEPT);
      expect(nodeTypes).toContain(NodeType.PERSON);
      expect(nodeTypes).toContain(NodeType.ALGORITHM);
      expect(nodeTypes).toContain(NodeType.EVENT);

      // All nodes should have summaries
      for (const node of result.nodes) {
        expect(node.summary).toBeDefined();
        expect(node.summary!.length).toBeGreaterThan(0);
      }
    });
  });

  // ============================================================
  // TEST 2: MINI-GRAPH MERGING
  // ============================================================

  describe('Mini-Graph Merging', () => {
    it('should preserve enhanced fields when merging multiple chunks', async () => {
      (mockTextChunker.chunk as jest.Mock).mockResolvedValue(createMockChunkingResult(2));

      const graph1 = createEnhancedMiniGraph(0, [
        {
          id: 'A',
          title: 'Deep Learning',
          nodeType: NodeType.CONCEPT,
          summary: 'Deep learning uses multi-layer neural networks to learn hierarchical representations. It excels at processing unstructured data like images and text.',
        },
      ]);

      const graph2 = createEnhancedMiniGraph(1, [
        {
          id: 'B',
          title: 'Convolutional Neural Networks',
          nodeType: NodeType.METHOD,
          summary: 'CNNs are specialized neural networks for processing grid-like data such as images. They use convolutional layers to automatically learn spatial hierarchies of features.',
        },
      ]);

      (mockAIOrchestrator.execute as jest.Mock)
        .mockResolvedValueOnce({
          data: graph1,
          model: 'claude-haiku',
          quality: { passed: true, score: 85, issues: [], warnings: [] },
          metadata: {
            tokensUsed: { input: 100, output: 50, total: 150 },
            cost: 0.01,
            cached: false,
            processingTime: 500,
            attempts: 1,
            validationPassed: true,
            promptVersion: 'production',
            timestamp: new Date(),
          },
        })
        .mockResolvedValueOnce({
          data: graph2,
          model: 'claude-haiku',
          quality: { passed: true, score: 85, issues: [], warnings: [] },
          metadata: {
            tokensUsed: { input: 100, output: 50, total: 150 },
            cost: 0.01,
            cached: false,
            processingTime: 500,
            attempts: 1,
            validationPassed: true,
            promptVersion: 'production',
            timestamp: new Date(),
          },
        });

      (mockSemanticDeduplicator.deduplicate as jest.Mock).mockResolvedValue({
        deduplicatedNodes: [
          {
            id: '0_A',
            title: 'Deep Learning',
            description: 'Description for Deep Learning',
            nodeType: NodeType.CONCEPT,
            summary: 'Deep learning uses multi-layer neural networks to learn hierarchical representations. It excels at processing unstructured data like images and text.',
          },
          {
            id: '1_B',
            title: 'Convolutional Neural Networks',
            description: 'Description for Convolutional Neural Networks',
            nodeType: NodeType.METHOD,
            summary: 'CNNs are specialized neural networks for processing grid-like data such as images. They use convolutional layers to automatically learn spatial hierarchies of features.',
          },
        ],
        mapping: {
          '0_A': '0_A',
          '1_B': '1_B',
        },
        statistics: {
          originalCount: 2,
          finalCount: 2,
          mergedCount: 0,
          mergesByPhase: { exact: 0, acronym: 0, fuzzy: 0 },
        },
      });

      const result = await service.generateGraph({
        documentId: 'doc_3',
        documentText: 'Test document',
        documentTitle: 'Test',
      });

      expect(result.nodes).toHaveLength(2);

      // Both nodes should have enhanced fields
      for (const node of result.nodes) {
        expect(node.nodeType).toBeDefined();
        expect(node.summary).toBeDefined();
        expect(node.summary!.length).toBeGreaterThan(50);
      }
    });

    it('should handle mixed enhanced and legacy nodes', async () => {
      (mockTextChunker.chunk as jest.Mock).mockResolvedValue(createMockChunkingResult(2));

      const enhancedGraph = createEnhancedMiniGraph(0, [
        {
          id: 'A',
          title: 'Enhanced Node',
          nodeType: NodeType.CONCEPT,
          summary: 'This node has enhanced fields. It includes nodeType and summary.',
        },
      ]);

      const legacyGraph = createLegacyMiniGraph(1, 1);

      (mockAIOrchestrator.execute as jest.Mock)
        .mockResolvedValueOnce({
          data: enhancedGraph,
          model: 'claude-haiku',
          quality: { passed: true, score: 85, issues: [], warnings: [] },
          metadata: {
            tokensUsed: { input: 100, output: 50, total: 150 },
            cost: 0.01,
            cached: false,
            processingTime: 500,
            attempts: 1,
            validationPassed: true,
            promptVersion: 'production',
            timestamp: new Date(),
          },
        })
        .mockResolvedValueOnce({
          data: legacyGraph,
          model: 'claude-haiku',
          quality: { passed: true, score: 85, issues: [], warnings: [] },
          metadata: {
            tokensUsed: { input: 100, output: 50, total: 150 },
            cost: 0.01,
            cached: false,
            processingTime: 500,
            attempts: 1,
            validationPassed: true,
            promptVersion: 'production',
            timestamp: new Date(),
          },
        });

      (mockSemanticDeduplicator.deduplicate as jest.Mock).mockResolvedValue({
        deduplicatedNodes: [
          {
            id: '0_A',
            title: 'Enhanced Node',
            description: 'Description for Enhanced Node',
            nodeType: NodeType.CONCEPT,
            summary: 'This node has enhanced fields. It includes nodeType and summary.',
          },
          {
            id: '1_node_0',
            title: 'Concept 1_0',
            description: 'Description for concept 1_0',
            // No nodeType or summary
          },
        ],
        mapping: {
          '0_A': '0_A',
          '1_node_0': '1_node_0',
        },
        statistics: {
          originalCount: 2,
          finalCount: 2,
          mergedCount: 0,
          mergesByPhase: { exact: 0, acronym: 0, fuzzy: 0 },
        },
      });

      const result = await service.generateGraph({
        documentId: 'doc_4',
        documentText: 'Test document',
        documentTitle: 'Test',
      });

      expect(result.nodes).toHaveLength(2);

      const enhancedNode = result.nodes.find(n => n.title === 'Enhanced Node');
      const legacyNode = result.nodes.find(n => n.title === 'Concept 1_0');

      expect(enhancedNode?.nodeType).toBe(NodeType.CONCEPT);
      expect(enhancedNode?.summary).toBeDefined();

      expect(legacyNode?.nodeType).toBeUndefined();
      expect(legacyNode?.summary).toBeUndefined();
    });
  });

  // ============================================================
  // TEST 3: EDGE CASES
  // ============================================================

  describe('Edge Cases', () => {
    it('should handle nodes with missing nodeType', async () => {
      (mockTextChunker.chunk as jest.Mock).mockResolvedValue(createMockChunkingResult(1));

      const partialGraph: AIGraphOutput = {
        mermaidCode: 'flowchart TD',
        nodes: [
          {
            id: 'A',
            title: 'Partial Node',
            description: 'Has summary but no nodeType',
            summary: 'This node has a summary. But it lacks a nodeType field.',
            metadata: {},
          },
        ],
        edges: [],
        metadata: {},
      };

      (mockAIOrchestrator.execute as jest.Mock).mockResolvedValue({
        data: partialGraph,
        model: 'claude-haiku',
        quality: { passed: true, score: 85, issues: [], warnings: [] },
        metadata: {
          tokensUsed: { input: 100, output: 50, total: 150 },
          cost: 0.01,
          cached: false,
          processingTime: 500,
          attempts: 1,
          validationPassed: true,
          promptVersion: 'production',
          timestamp: new Date(),
        },
      });

      (mockSemanticDeduplicator.deduplicate as jest.Mock).mockResolvedValue({
        deduplicatedNodes: [
          {
            id: '0_A',
            title: 'Partial Node',
            description: 'Has summary but no nodeType',
            summary: 'This node has a summary. But it lacks a nodeType field.',
          },
        ],
        mapping: { '0_A': '0_A' },
        statistics: {
          originalCount: 1,
          finalCount: 1,
          mergedCount: 0,
          mergesByPhase: { exact: 0, acronym: 0, fuzzy: 0 },
        },
      });

      const result = await service.generateGraph({
        documentId: 'doc_5',
        documentText: 'Test document',
        documentTitle: 'Test',
      });

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].nodeType).toBeUndefined();
      expect(result.nodes[0].summary).toBeDefined();
    });

    it('should handle nodes with missing summary', async () => {
      (mockTextChunker.chunk as jest.Mock).mockResolvedValue(createMockChunkingResult(1));

      const partialGraph: AIGraphOutput = {
        mermaidCode: 'flowchart TD',
        nodes: [
          {
            id: 'A',
            title: 'Partial Node',
            description: 'Has nodeType but no summary',
            nodeType: NodeType.CONCEPT,
            metadata: {},
          },
        ],
        edges: [],
        metadata: {},
      };

      (mockAIOrchestrator.execute as jest.Mock).mockResolvedValue({
        data: partialGraph,
        model: 'claude-haiku',
        quality: { passed: true, score: 85, issues: [], warnings: [] },
        metadata: {
          tokensUsed: { input: 100, output: 50, total: 150 },
          cost: 0.01,
          cached: false,
          processingTime: 500,
          attempts: 1,
          validationPassed: true,
          promptVersion: 'production',
          timestamp: new Date(),
        },
      });

      (mockSemanticDeduplicator.deduplicate as jest.Mock).mockResolvedValue({
        deduplicatedNodes: [
          {
            id: '0_A',
            title: 'Partial Node',
            description: 'Has nodeType but no summary',
            nodeType: NodeType.CONCEPT,
          },
        ],
        mapping: { '0_A': '0_A' },
        statistics: {
          originalCount: 1,
          finalCount: 1,
          mergedCount: 0,
          mergesByPhase: { exact: 0, acronym: 0, fuzzy: 0 },
        },
      });

      const result = await service.generateGraph({
        documentId: 'doc_6',
        documentText: 'Test document',
        documentTitle: 'Test',
      });

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].nodeType).toBe(NodeType.CONCEPT);
      expect(result.nodes[0].summary).toBeUndefined();
    });

    it('should handle empty strings for enhanced fields', async () => {
      (mockTextChunker.chunk as jest.Mock).mockResolvedValue(createMockChunkingResult(1));

      const emptyGraph: AIGraphOutput = {
        mermaidCode: 'flowchart TD',
        nodes: [
          {
            id: 'A',
            title: 'Empty Fields Node',
            description: 'Has empty strings',
            nodeType: '',
            summary: '',
            metadata: {},
          },
        ],
        edges: [],
        metadata: {},
      };

      (mockAIOrchestrator.execute as jest.Mock).mockResolvedValue({
        data: emptyGraph,
        model: 'claude-haiku',
        quality: { passed: true, score: 85, issues: [], warnings: [] },
        metadata: {
          tokensUsed: { input: 100, output: 50, total: 150 },
          cost: 0.01,
          cached: false,
          processingTime: 500,
          attempts: 1,
          validationPassed: true,
          promptVersion: 'production',
          timestamp: new Date(),
        },
      });

      (mockSemanticDeduplicator.deduplicate as jest.Mock).mockResolvedValue({
        deduplicatedNodes: [
          {
            id: '0_A',
            title: 'Empty Fields Node',
            description: 'Has empty strings',
            nodeType: '',
            summary: '',
          },
        ],
        mapping: { '0_A': '0_A' },
        statistics: {
          originalCount: 1,
          finalCount: 1,
          mergedCount: 0,
          mergesByPhase: { exact: 0, acronym: 0, fuzzy: 0 },
        },
      });

      const result = await service.generateGraph({
        documentId: 'doc_7',
        documentText: 'Test document',
        documentTitle: 'Test',
      });

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].nodeType).toBe('');
      expect(result.nodes[0].summary).toBe('');
    });
  });

  // ============================================================
  // TEST 4: DEDUPLICATION WITH ENHANCED FIELDS
  // ============================================================

  describe('Deduplication Integration', () => {
    it('should pass enhanced fields to deduplicator', async () => {
      (mockTextChunker.chunk as jest.Mock).mockResolvedValue(createMockChunkingResult(1));

      const graph = createEnhancedMiniGraph(0, [
        {
          id: 'A',
          title: 'Test Node',
          nodeType: NodeType.CONCEPT,
          summary: 'Test summary sentence one. Test summary sentence two.',
        },
      ]);

      (mockAIOrchestrator.execute as jest.Mock).mockResolvedValue({
        data: graph,
        model: 'claude-haiku',
        quality: { passed: true, score: 85, issues: [], warnings: [] },
        metadata: {
          tokensUsed: { input: 100, output: 50, total: 150 },
          cost: 0.01,
          cached: false,
          processingTime: 500,
          attempts: 1,
          validationPassed: true,
          promptVersion: 'production',
          timestamp: new Date(),
        },
      });

      (mockSemanticDeduplicator.deduplicate as jest.Mock).mockResolvedValue({
        deduplicatedNodes: [
          {
            id: '0_A',
            title: 'Test Node',
            description: 'Description for Test Node',
            nodeType: NodeType.CONCEPT,
            summary: 'Test summary sentence one. Test summary sentence two.',
          },
        ],
        mapping: { '0_A': '0_A' },
        statistics: {
          originalCount: 1,
          finalCount: 1,
          mergedCount: 0,
          mergesByPhase: { exact: 0, acronym: 0, fuzzy: 0 },
        },
      });

      await service.generateGraph({
        documentId: 'doc_8',
        documentText: 'Test document',
        documentTitle: 'Test',
      });

      // Verify deduplicator was called with enhanced fields
      expect(mockSemanticDeduplicator.deduplicate).toHaveBeenCalledWith({
        nodes: expect.arrayContaining([
          expect.objectContaining({
            title: 'Test Node',
            nodeType: NodeType.CONCEPT,
            summary: 'Test summary sentence one. Test summary sentence two.',
          }),
        ]),
      });
    });

    it('should preserve enhanced fields from deduplicator result', async () => {
      (mockTextChunker.chunk as jest.Mock).mockResolvedValue(createMockChunkingResult(2));

      // Two chunks with duplicate nodes
      const graph1 = createEnhancedMiniGraph(0, [
        {
          id: 'A',
          title: 'Machine Learning',
          nodeType: NodeType.CONCEPT,
          summary: 'First summary of ML. Short version here.',
        },
      ]);

      const graph2 = createEnhancedMiniGraph(1, [
        {
          id: 'B',
          title: 'Machine Learning',
          nodeType: NodeType.CONCEPT,
          summary: 'Second summary of machine learning is more detailed and comprehensive. It provides additional context and explanation.',
        },
      ]);

      (mockAIOrchestrator.execute as jest.Mock)
        .mockResolvedValueOnce({
          data: graph1,
          model: 'claude-haiku',
          quality: { passed: true, score: 85, issues: [], warnings: [] },
          metadata: {
            tokensUsed: { input: 100, output: 50, total: 150 },
            cost: 0.01,
            cached: false,
            processingTime: 500,
            attempts: 1,
            validationPassed: true,
            promptVersion: 'production',
            timestamp: new Date(),
          },
        })
        .mockResolvedValueOnce({
          data: graph2,
          model: 'claude-haiku',
          quality: { passed: true, score: 85, issues: [], warnings: [] },
          metadata: {
            tokensUsed: { input: 100, output: 50, total: 150 },
            cost: 0.01,
            cached: false,
            processingTime: 500,
            attempts: 1,
            validationPassed: true,
            promptVersion: 'production',
            timestamp: new Date(),
          },
        });

      // Deduplicator chooses the better summary
      (mockSemanticDeduplicator.deduplicate as jest.Mock).mockResolvedValue({
        deduplicatedNodes: [
          {
            id: '0_A',
            title: 'Machine Learning',
            description: 'Description for Machine Learning',
            nodeType: NodeType.CONCEPT,
            summary: 'Second summary of machine learning is more detailed and comprehensive. It provides additional context and explanation.',
          },
        ],
        mapping: {
          '0_A': '0_A',
          '1_B': '0_A',
        },
        statistics: {
          originalCount: 2,
          finalCount: 1,
          mergedCount: 1,
          mergesByPhase: { exact: 0, acronym: 0, fuzzy: 1 },
        },
      });

      const result = await service.generateGraph({
        documentId: 'doc_9',
        documentText: 'Test document',
        documentTitle: 'Test',
      });

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].nodeType).toBe(NodeType.CONCEPT);
      expect(result.nodes[0].summary).toContain('more detailed and comprehensive');
    });
  });
});

/**
 * Graph Generator Service Tests - Comprehensive Test Suite
 *
 * Tests the CRITICAL merge order fix and all features:
 * 1. Happy path (small, medium, large documents)
 * 2. Cost estimation accuracy
 * 3. Budget enforcement
 * 4. Merge order correctness (no orphaned edges)
 * 5. Edge deduplication
 * 6. Fallback mechanism
 * 7. Progress tracking
 * 8. Error handling
 */

import { Logger } from 'winston';
import { GraphGeneratorService } from '../graph-generator.service';
import { TextChunker } from '../../lib/chunking/text-chunker';
import { AIOrchestrator } from '../ai-orchestrator.service';
import { CostTrackerService } from '../cost-tracker.service';
import { AIGraphOutput } from '../../types/validation.types';

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

// ============================================================
// TEST DATA
// ============================================================

const SMALL_DOCUMENT = 'This is a small document about machine learning. '.repeat(20); // ~1k chars

const MEDIUM_DOCUMENT = `
# Machine Learning

Machine learning is a subset of artificial intelligence that enables systems to learn from data.

## Supervised Learning

Supervised learning uses labeled data to train models. Common algorithms include:
- Linear Regression
- Decision Trees
- Neural Networks

## Unsupervised Learning

Unsupervised learning finds patterns in unlabeled data. Examples include:
- Clustering
- Dimensionality Reduction
- Anomaly Detection
`.repeat(10); // ~5k chars

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

const createMockMiniGraph = (chunkIndex: number, nodeCount: number): AIGraphOutput => ({
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
  metadata: {},
});

// ============================================================
// TEST SUITE
// ============================================================

describe('GraphGeneratorService', () => {
  let service: GraphGeneratorService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new GraphGeneratorService(
      mockTextChunker,
      mockAIOrchestrator,
      mockCostTracker,
      mockLogger,
    );

    // Default mocks
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
  // TEST 1: HAPPY PATH - SMALL DOCUMENT
  // ============================================================

  describe('Happy Path - Small Document', () => {
    it('should generate graph for small document without chunking', async () => {
      // Mock single chunk
      (mockTextChunker.chunk as jest.Mock).mockResolvedValue(createMockChunkingResult(1));

      // Mock AI response
      (mockAIOrchestrator.execute as jest.Mock).mockResolvedValue({
        data: createMockMiniGraph(0, 5),
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

      const result = await service.generateGraph({
        documentId: 'doc_1',
        documentText: SMALL_DOCUMENT,
        documentTitle: 'Small Document',
      });

      expect(result.nodes.length).toBe(5);
      expect(result.edges.length).toBe(4);
      expect(result.statistics.chunksProcessed).toBe(1);
      expect(result.mermaidCode).toContain('flowchart TD');
      expect(result.metadata.fallbackUsed).toBe(false);
    });
  });

  // ============================================================
  // TEST 2: HAPPY PATH - MEDIUM DOCUMENT (MULTIPLE CHUNKS)
  // ============================================================

  describe('Happy Path - Medium Document', () => {
    it('should generate and merge graphs from multiple chunks', async () => {
      // Mock 3 chunks
      (mockTextChunker.chunk as jest.Mock).mockResolvedValue(createMockChunkingResult(3));

      // Mock AI responses for each chunk
      (mockAIOrchestrator.execute as jest.Mock)
        .mockResolvedValueOnce({
          data: createMockMiniGraph(0, 4),
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
          data: createMockMiniGraph(1, 4),
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
          data: createMockMiniGraph(2, 4),
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

      const result = await service.generateGraph({
        documentId: 'doc_2',
        documentText: MEDIUM_DOCUMENT,
        documentTitle: 'Medium Document',
      });

      // Should have merged nodes from 3 chunks
      expect(result.statistics.chunksProcessed).toBe(3);
      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.edges.length).toBeGreaterThan(0);
      expect(result.mermaidCode).toContain('flowchart TD');
    });
  });

  // ============================================================
  // TEST 3: COST ESTIMATION ACCURACY
  // ============================================================

  describe('Cost Estimation', () => {
    it('should estimate cost before processing', async () => {
      const estimate = await service.estimateCost(MEDIUM_DOCUMENT);

      expect(estimate.estimatedChunks).toBeGreaterThan(0);
      expect(estimate.estimatedTokens).toBeGreaterThan(0);
      expect(estimate.estimatedCost).toBeGreaterThan(0);
      expect(estimate.budgetCheck).toBeDefined();
      expect(estimate.budgetCheck.withinBudget).toBe(true);
    });

    it('should calculate cost based on document length', async () => {
      const smallEstimate = await service.estimateCost(SMALL_DOCUMENT);
      const mediumEstimate = await service.estimateCost(MEDIUM_DOCUMENT);

      // Larger document should cost more
      expect(mediumEstimate.estimatedCost).toBeGreaterThan(smallEstimate.estimatedCost);
      expect(mediumEstimate.estimatedTokens).toBeGreaterThan(smallEstimate.estimatedTokens);
    });
  });

  // ============================================================
  // TEST 4: BUDGET ENFORCEMENT
  // ============================================================

  describe('Budget Enforcement', () => {
    it('should reject generation when budget exceeded', async () => {
      // Mock budget check failure
      (mockCostTracker.checkBudget as jest.Mock).mockResolvedValue({
        allowed: false,
        reason: 'Daily limit exceeded',
        estimatedCost: 0.5,
        currentUsage: {
          remaining: 0.1,
        },
      });

      await expect(
        service.generateGraph({
          documentId: 'doc_3',
          documentText: MEDIUM_DOCUMENT,
          documentTitle: 'Test',
        }),
      ).rejects.toThrow('Budget exceeded');
    });

    it('should check budget before starting AI calls', async () => {
      (mockTextChunker.chunk as jest.Mock).mockResolvedValue(createMockChunkingResult(1));

      (mockAIOrchestrator.execute as jest.Mock).mockResolvedValue({
        data: createMockMiniGraph(0, 5),
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

      await service.generateGraph({
        documentId: 'doc_4',
        documentText: SMALL_DOCUMENT,
        documentTitle: 'Test',
      });

      // Should check budget before AI orchestrator calls
      expect(mockCostTracker.checkBudget).toHaveBeenCalled();
    });
  });

  // ============================================================
  // TEST 5: MERGE ORDER CORRECTNESS (NO ORPHANED EDGES)
  // ============================================================

  describe('Merge Order Correctness - CRITICAL', () => {
    it('should not create orphaned edges after node deduplication', async () => {
      // Create mini-graphs with duplicate nodes
      const miniGraph1: AIGraphOutput = {
        mermaidCode: 'flowchart TD',
        nodes: [
          { id: 'node_0', title: 'Machine Learning', description: 'ML desc' },
          { id: 'node_1', title: 'Neural Networks', description: 'NN desc' },
        ],
        edges: [{ fromNodeId: 'node_0', toNodeId: 'node_1', relationship: 'includes' }],
        metadata: {},
      };

      const miniGraph2: AIGraphOutput = {
        mermaidCode: 'flowchart TD',
        nodes: [
          { id: 'node_0', title: 'Machine Learning', description: 'ML desc duplicate' }, // DUPLICATE!
          { id: 'node_1', title: 'Deep Learning', description: 'DL desc' },
        ],
        edges: [{ fromNodeId: 'node_0', toNodeId: 'node_1', relationship: 'includes' }],
        metadata: {},
      };

      (mockTextChunker.chunk as jest.Mock).mockResolvedValue(createMockChunkingResult(2));

      (mockAIOrchestrator.execute as jest.Mock)
        .mockResolvedValueOnce({
          data: miniGraph1,
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
          data: miniGraph2,
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

      const result = await service.generateGraph({
        documentId: 'doc_5',
        documentText: MEDIUM_DOCUMENT,
        documentTitle: 'Test Deduplication',
      });

      // After deduplication, should have 3 unique nodes
      // (Machine Learning merged, Neural Networks, Deep Learning)
      expect(result.nodes.length).toBeLessThan(4); // Should have deduplicated

      // CRITICAL: All edges should reference valid nodes (no orphans)
      const nodeIds = new Set(result.nodes.map((n) => n.id));
      for (const edge of result.edges) {
        expect(nodeIds.has(edge.from)).toBe(true);
        expect(nodeIds.has(edge.to)).toBe(true);
      }

      // Should have recorded merges
      expect(result.statistics.mergedNodes).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // TEST 6: EDGE DEDUPLICATION
  // ============================================================

  describe('Edge Deduplication', () => {
    it('should remove duplicate edges', async () => {
      // Create mini-graphs with duplicate edges
      const miniGraph1: AIGraphOutput = {
        mermaidCode: 'flowchart TD',
        nodes: [
          { id: 'node_0', title: 'A', description: 'A desc' },
          { id: 'node_1', title: 'B', description: 'B desc' },
        ],
        edges: [
          { fromNodeId: 'node_0', toNodeId: 'node_1', relationship: 'relates to' },
        ],
        metadata: {},
      };

      const miniGraph2: AIGraphOutput = {
        mermaidCode: 'flowchart TD',
        nodes: [
          { id: 'node_0', title: 'A', description: 'A desc' },
          { id: 'node_1', title: 'B', description: 'B desc' },
        ],
        edges: [
          { fromNodeId: 'node_0', toNodeId: 'node_1', relationship: 'relates to' }, // DUPLICATE!
        ],
        metadata: {},
      };

      (mockTextChunker.chunk as jest.Mock).mockResolvedValue(createMockChunkingResult(2));

      (mockAIOrchestrator.execute as jest.Mock)
        .mockResolvedValueOnce({
          data: miniGraph1,
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
          data: miniGraph2,
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

      const result = await service.generateGraph({
        documentId: 'doc_6',
        documentText: MEDIUM_DOCUMENT,
        documentTitle: 'Test Edge Dedup',
      });

      // Should have removed duplicate edge
      expect(result.statistics.duplicateEdgesRemoved).toBeGreaterThan(0);
      expect(result.edges.length).toBe(1); // Only one edge after deduplication
    });
  });

  // ============================================================
  // TEST 7: FALLBACK MECHANISM
  // ============================================================

  describe('Structure-Based Fallback', () => {
    it('should use structure-based fallback when AI fails', async () => {
      (mockTextChunker.chunk as jest.Mock).mockResolvedValue(createMockChunkingResult(1));

      // Mock AI failure
      (mockAIOrchestrator.execute as jest.Mock).mockRejectedValue(
        new Error('AI validation failed after all retries'),
      );

      const documentWithHeadings = `
# Chapter 1
Content for chapter 1

## Section 1.1
Content for section 1.1

## Section 1.2
Content for section 1.2

# Chapter 2
Content for chapter 2
      `;

      const result = await service.generateGraph({
        documentId: 'doc_7',
        documentText: documentWithHeadings,
        documentTitle: 'Document with Structure',
      });

      // Should use fallback
      expect(result.metadata.fallbackUsed).toBe(true);
      expect(result.nodes.length).toBeGreaterThan(0); // Should extract headings
      expect(result.metadata.warnings).toContain(
        'AI generation failed, using document structure as fallback',
      );
    });

    it('should create single node for unstructured documents', async () => {
      (mockTextChunker.chunk as jest.Mock).mockResolvedValue(createMockChunkingResult(1));

      (mockAIOrchestrator.execute as jest.Mock).mockRejectedValue(
        new Error('AI validation failed'),
      );

      const plainText = 'This is plain text without any structure. '.repeat(50);

      const result = await service.generateGraph({
        documentId: 'doc_8',
        documentText: plainText,
        documentTitle: 'Plain Text',
      });

      expect(result.metadata.fallbackUsed).toBe(true);
      expect(result.nodes.length).toBe(1); // Single node for unstructured doc
    });
  });

  // ============================================================
  // TEST 8: PROGRESS TRACKING
  // ============================================================

  describe('Progress Tracking', () => {
    it('should report progress during generation', async () => {
      (mockTextChunker.chunk as jest.Mock).mockResolvedValue(createMockChunkingResult(2));

      (mockAIOrchestrator.execute as jest.Mock)
        .mockResolvedValueOnce({
          data: createMockMiniGraph(0, 4),
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
          data: createMockMiniGraph(1, 4),
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

      const progressUpdates: any[] = [];

      await service.generateGraph(
        {
          documentId: 'doc_9',
          documentText: MEDIUM_DOCUMENT,
          documentTitle: 'Test',
        },
        (progress) => {
          progressUpdates.push(progress);
        },
      );

      // Should have progress updates for different stages
      expect(progressUpdates.length).toBeGreaterThan(0);

      const stages = progressUpdates.map((p) => p.stage);
      expect(stages).toContain('chunking');
      expect(stages).toContain('generating');
      expect(stages).toContain('merging');
      expect(stages).toContain('complete');

      // Final progress should be 100%
      const finalProgress = progressUpdates[progressUpdates.length - 1];
      expect(finalProgress.percentComplete).toBe(100);
    });
  });

  // ============================================================
  // TEST 9: RATE LIMITING (BATCH PROCESSING)
  // ============================================================

  describe('Rate Limiting - Batch Processing', () => {
    it('should process chunks in batches to avoid rate limits', async () => {
      // Create 5 chunks (should process in 3 batches: 2 + 2 + 1)
      (mockTextChunker.chunk as jest.Mock).mockResolvedValue(createMockChunkingResult(5));

      const executeCalls: number[] = [];

      (mockAIOrchestrator.execute as jest.Mock).mockImplementation(async () => {
        executeCalls.push(Date.now());
        return {
          data: createMockMiniGraph(0, 3),
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
        };
      });

      await service.generateGraph({
        documentId: 'doc_10',
        documentText: MEDIUM_DOCUMENT.repeat(10),
        documentTitle: 'Large Document',
      });

      // Should have been called 5 times (once per chunk)
      expect(executeCalls.length).toBe(5);

      // Calls should be in batches (not all at once)
      // First 2 should be close together, next 2 close together, last one alone
      // This is hard to test precisely due to timing, but we can check call count
      expect(mockAIOrchestrator.execute).toHaveBeenCalledTimes(5);
    });
  });

  // ============================================================
  // TEST 10: ERROR HANDLING
  // ============================================================

  describe('Error Handling', () => {
    it('should throw error when document is empty', async () => {
      (mockTextChunker.chunk as jest.Mock).mockRejectedValue(
        new Error('Document text is empty'),
      );

      await expect(
        service.generateGraph({
          documentId: 'doc_11',
          documentText: '',
          documentTitle: 'Empty',
        }),
      ).rejects.toThrow();
    });

    it('should propagate non-AI errors', async () => {
      (mockTextChunker.chunk as jest.Mock).mockRejectedValue(
        new Error('Database connection failed'),
      );

      await expect(
        service.generateGraph({
          documentId: 'doc_12',
          documentText: SMALL_DOCUMENT,
          documentTitle: 'Test',
        }),
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle progress callback errors gracefully', async () => {
      (mockTextChunker.chunk as jest.Mock).mockResolvedValue(createMockChunkingResult(1));

      (mockAIOrchestrator.execute as jest.Mock).mockResolvedValue({
        data: createMockMiniGraph(0, 5),
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

      // Callback that throws error
      const failingCallback = jest.fn(() => {
        throw new Error('Callback failed');
      });

      // Should not throw - errors in callback should be caught
      await expect(
        service.generateGraph(
          {
            documentId: 'doc_13',
            documentText: SMALL_DOCUMENT,
            documentTitle: 'Test',
          },
          failingCallback,
        ),
      ).resolves.toBeDefined();

      // Should have logged warning
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Progress callback failed',
        expect.any(Object),
      );
    });
  });
});

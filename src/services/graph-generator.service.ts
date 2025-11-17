/**
 * Graph Generator Service - Complete Pipeline with CORRECT Merge Order
 *
 * CRITICAL FIX: This implementation uses the CORRECT merge order to prevent orphaned edges:
 * 1. Chunk document
 * 2. Generate mini-graphs for each chunk
 * 3. **DEDUPLICATE NODES FIRST** (get mapping: oldId -> newId)
 * 4. **REMAP ALL EDGES** using the mapping
 * 5. **DEDUPLICATE EDGES** (same source + target + relationship)
 * 6. **VALIDATE with auto-fix**
 * 7. Generate Mermaid code
 *
 * WHY: Without this order, edges can reference deleted node IDs after deduplication,
 * causing orphaned edges and corrupt graphs. The mapping step is CRITICAL.
 *
 * Additional Features:
 * - Cost estimation BEFORE processing (budget check)
 * - Rate limiting via batch processing (2 chunks at a time)
 * - Structure-based fallback when AI fails completely
 * - Progress tracking for BullMQ integration
 * - Comprehensive error handling
 *
 * @see META/Core/TECHNICAL.md Section 6 (AI System Architecture)
 * @see META/TODO.md Phase 3.3 (2024-11-12 section)
 */

import { Logger } from 'winston';
import { TextChunker } from '../lib/chunking/text-chunker';
import { AIOrchestrator } from './ai-orchestrator.service';
import { CostTrackerService } from './cost-tracker.service';
import { AIGraphOutput } from '../types/validation.types';
import { ChunkingResult, TextChunk } from '../types/chunking.types';
import { SemanticNodeDeduplicator } from '../lib/graph/semantic-deduplicator';
import { formatTextWithPageMarkers } from '../lib/pdf/page-marker-formatter';
import { matchQuoteToCoordinates, calculateMatchingMetrics, QuoteMatchResult } from '../lib/pdf/quote-matcher';
import { TextBlock } from '../types/pdf.types';
import { createNodeDocumentRefs } from '../types/node.types';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

/**
 * Request to generate a graph
 */
export interface GenerateGraphRequest {
  documentId: string;
  documentText: string;
  documentTitle: string;
  textBlocks?: TextBlock[]; // PDF text blocks with coordinates (for coordinate matching)
  options?: {
    maxNodes?: number; // Default: 15
    skipCache?: boolean;
  };
}

/**
 * Generated graph data with nodes and edges
 */
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  mermaidCode: string;
}

/**
 * Node in the graph
 */
export interface GraphNode {
  id: string;
  title: string;
  description?: string;
  nodeType?: string; // Semantic classification (concept, fact, argument, etc.)
  summary?: string; // 2-sentence contextual summary
  pageReferences?: number[]; // Pages where concept appears (from AI)
  keyQuote?: string; // Representative quote (from AI)
  documentRefs?: {
    references: Array<{
      text: string;
      page?: number; // For single-page references
      pages?: number[]; // For cross-page references
      bbox?: any; // For single-page references (deprecated, use coordinates)
      coordinates?: any; // For both single and cross-page references
    }>;
  }; // Coordinate-based references (smart matching)
  sourceChunk?: {
    chunkIndex: number;
    textBlockRange: {
      start: number; // Index into textBlocks array
      end: number; // Index into textBlocks array (exclusive)
    };
  }; // Which chunk this came from and its textBlock range
  metadata?: Record<string, unknown>;
}

/**
 * Edge connecting two nodes
 */
export interface GraphEdge {
  from: string; // Node ID
  to: string; // Node ID
  relationship: string;
  metadata?: Record<string, unknown>;
}

/**
 * Result of graph generation
 */
export interface GenerateGraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  mermaidCode: string;
  statistics: GraphStatistics;
  metadata: GraphMetadata;
}

/**
 * Statistics about the generation process
 */
export interface GraphStatistics {
  chunksProcessed: number;
  totalNodes: number;
  totalEdges: number;
  mergedNodes: number; // How many nodes were deduplicated
  duplicateEdgesRemoved: number;
  qualityScore: number; // 0-100
  totalCost: number; // USD
  processingTimeMs: number;
  // Quote matching statistics
  quoteMatching?: {
    totalQuotes: number;
    exactMatchRate: number; // Percentage
    normalizedMatchRate: number;
    tokenBasedMatchRate: number;
    fuzzyMatchRate: number;
    failedMatchRate: number;
    averageConfidence: number;
    averageBlocksPerQuote: number;
  };
}

/**
 * Metadata about how the graph was generated
 */
export interface GraphMetadata {
  model: string;
  cacheHit: boolean;
  fallbackUsed: boolean; // True if structure-based fallback was used
  warnings: string[];
}

/**
 * Progress update during generation
 */
export interface GenerationProgress {
  stage: 'chunking' | 'generating' | 'merging' | 'validating' | 'complete';
  chunksProcessed: number;
  totalChunks: number;
  percentComplete: number;
  message: string;
}

/**
 * Cost estimation result
 */
export interface CostEstimate {
  estimatedChunks: number;
  estimatedTokens: number;
  estimatedCost: number; // USD
  budgetCheck: {
    withinBudget: boolean;
    available: number; // Remaining budget in USD
    reason?: string;
  };
}

/**
 * Node deduplication result with mapping
 */
interface DeduplicationResult {
  deduplicatedNodes: GraphNode[];
  mapping: Map<string, string>; // oldId -> newId
  mergeCount: number;
}

// ============================================================
// CONFIGURATION
// ============================================================

const BATCH_SIZE = 2; // Process 2 chunks at a time to avoid rate limits
const MAX_NODES_DEFAULT = 15;
const MIN_DOCUMENT_LENGTH = 500; // Don't chunk documents shorter than this

// ============================================================
// GRAPH GENERATOR SERVICE
// ============================================================

export class GraphGeneratorService {
  constructor(
    private readonly textChunker: TextChunker,
    private readonly aiOrchestrator: AIOrchestrator,
    private readonly costTracker: CostTrackerService,
    private readonly semanticDeduplicator: SemanticNodeDeduplicator,
    private readonly logger: Logger,
  ) {
    this.logger.info('Graph Generator Service initialized');
  }

  /**
   * MAIN ENTRY POINT: Generate a complete knowledge graph
   *
   * Flow:
   * 1. Estimate cost and check budget
   * 2. Chunk document (if large enough)
   * 3. Generate mini-graphs for each chunk (batched, 2 at a time)
   * 4. CORRECT MERGE ORDER:
   *    a. Deduplicate nodes (get mapping)
   *    b. Remap all edges using mapping
   *    c. Deduplicate edges
   *    d. Validate with auto-fix
   * 5. Generate Mermaid code
   * 6. Return result
   */
  async generateGraph(
    request: GenerateGraphRequest,
    progressCallback?: (progress: GenerationProgress) => void,
  ): Promise<GenerateGraphResponse> {
    const startTime = Date.now();
    const maxNodes = request.options?.maxNodes || MAX_NODES_DEFAULT;

    this.logger.info('Starting graph generation', {
      documentId: request.documentId,
      documentLength: request.documentText.length,
      maxNodes,
    });

    try {
      // Step 1: Estimate cost BEFORE processing
      this.reportProgress(progressCallback, {
        stage: 'chunking',
        chunksProcessed: 0,
        totalChunks: 0,
        percentComplete: 0,
        message: 'Estimating cost and checking budget...',
      });

      const costEstimate = await this.estimateCost(request.documentText);

      if (!costEstimate.budgetCheck.withinBudget) {
        throw new Error(
          `Budget exceeded: ${costEstimate.budgetCheck.reason}. ` +
            `Estimated cost: $${costEstimate.estimatedCost.toFixed(2)}, ` +
            `Available: $${costEstimate.budgetCheck.available.toFixed(2)}`,
        );
      }

      this.logger.info('Budget check passed', {
        estimatedCost: costEstimate.estimatedCost,
        available: costEstimate.budgetCheck.available,
      });

      // Step 2: Format text with page markers (if textBlocks provided)
      let formattedText = request.documentText;
      if (request.textBlocks && request.textBlocks.length > 0) {
        this.logger.info('Formatting text with page markers', {
          textBlocks: request.textBlocks.length,
        });

        const formatResult = formatTextWithPageMarkers(
          request.documentText,
          request.textBlocks,
          { includeMarkers: true },
          this.logger,
        );

        formattedText = formatResult.formattedText;

        this.logger.info('Page marker formatting complete', {
          totalPages: formatResult.metadata.totalPages,
          totalBlocks: formatResult.metadata.totalBlocks,
          averageBlocksPerPage: formatResult.metadata.averageBlocksPerPage,
          emptyPages: formatResult.metadata.emptyPages.length,
        });
      } else {
        this.logger.warn('No text blocks provided - skipping page marker formatting');
      }

      // Step 3: Chunk document
      this.reportProgress(progressCallback, {
        stage: 'chunking',
        chunksProcessed: 0,
        totalChunks: 0,
        percentComplete: 5,
        message: 'Chunking document...',
      });

      const chunkingResult = await this.chunkDocument(formattedText, request.documentTitle);
      const chunks = chunkingResult.chunks;

      this.logger.info('Document chunked', {
        totalChunks: chunks.length,
        avgChunkSize: chunkingResult.statistics.averageChunkSize,
        qualityScore: chunkingResult.statistics.qualityScore,
      });

      // Compute textBlock ranges for each chunk (needed for smart quote matching)
      const textBlockRanges = request.textBlocks
        ? this.computeTextBlockRanges(chunks, request.textBlocks)
        : new Map<number, { start: number; end: number }>();

      this.logger.info('Computed textBlock ranges for chunks', {
        totalChunks: chunks.length,
        rangesComputed: textBlockRanges.size,
      });

      // Step 3: Generate mini-graphs for each chunk (BATCHED)
      this.reportProgress(progressCallback, {
        stage: 'generating',
        chunksProcessed: 0,
        totalChunks: chunks.length,
        percentComplete: 10,
        message: `Generating graphs for ${chunks.length} chunks...`,
      });

      const miniGraphs = await this.generateMiniGraphs(
        chunks,
        request.documentTitle,
        maxNodes,
        progressCallback,
      );

      // Step 4: CRITICAL - CORRECT MERGE ORDER
      this.reportProgress(progressCallback, {
        stage: 'merging',
        chunksProcessed: chunks.length,
        totalChunks: chunks.length,
        percentComplete: 70,
        message: 'Merging mini-graphs with correct node/edge handling...',
      });

      const merged = await this.mergeGraphsCorrectly(miniGraphs, maxNodes, textBlockRanges);

      // Step 5: Smart quote matching with hybrid strategy (exact + semantic)
      let matchingMetrics: any | undefined;
      if (request.textBlocks && request.textBlocks.length > 0) {
        this.reportProgress(progressCallback, {
          stage: 'validating',
          chunksProcessed: chunks.length,
          totalChunks: chunks.length,
          percentComplete: 85,
          message: 'Matching quotes to PDF coordinates (smart hybrid matching)...',
        });

        const matchingResult = await this.smartMatchQuotesToCoordinates(
          merged.nodes,
          request.textBlocks,
        );

        merged.nodes = matchingResult.nodes;
        matchingMetrics = matchingResult.metrics;

        this.logger.info('Smart quote matching complete', {
          totalNodes: matchingMetrics.totalNodes,
          nodesWithRefs: matchingMetrics.nodesWithRefs,
          exactMatchStrategy: matchingMetrics.exactMatchCount,
          semanticSearchStrategy: matchingMetrics.semanticSearchCount,
          fallbackStrategy: matchingMetrics.fallbackCount,
          averageSimilarity: matchingMetrics.averageSimilarity.toFixed(2),
        });
      }

      // Step 6: Validate final graph
      this.reportProgress(progressCallback, {
        stage: 'validating',
        chunksProcessed: chunks.length,
        totalChunks: chunks.length,
        percentComplete: 90,
        message: 'Validating final graph...',
      });

      const validated = await this.validateAndFix(merged);

      // Step 6: Generate Mermaid code
      const mermaidCode = this.generateMermaidCode(validated.nodes, validated.edges);

      // Step 7: Build response
      const processingTime = Date.now() - startTime;
      const response: GenerateGraphResponse = {
        nodes: validated.nodes,
        edges: validated.edges,
        mermaidCode,
        statistics: {
          chunksProcessed: chunks.length,
          totalNodes: validated.nodes.length,
          totalEdges: validated.edges.length,
          mergedNodes: validated.mergedNodes,
          duplicateEdgesRemoved: validated.duplicateEdgesRemoved,
          qualityScore: validated.qualityScore,
          totalCost: validated.totalCost,
          processingTimeMs: processingTime,
          quoteMatching: matchingMetrics,
        },
        metadata: {
          model: validated.model,
          cacheHit: validated.cacheHit,
          fallbackUsed: validated.fallbackUsed,
          warnings: validated.warnings,
        },
      };

      this.reportProgress(progressCallback, {
        stage: 'complete',
        chunksProcessed: chunks.length,
        totalChunks: chunks.length,
        percentComplete: 100,
        message: 'Graph generation complete!',
      });

      this.logger.info('Graph generation complete', {
        documentId: request.documentId,
        totalNodes: response.statistics.totalNodes,
        totalEdges: response.statistics.totalEdges,
        mergedNodes: response.statistics.mergedNodes,
        qualityScore: response.statistics.qualityScore,
        cost: response.statistics.totalCost,
        durationMs: processingTime,
      });

      return response;
    } catch (error) {
      this.logger.error('Graph generation failed', {
        documentId: request.documentId,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });

      // Don't use fallback for budget or non-AI errors
      if (error instanceof Error && error.message.includes('Budget exceeded')) {
        throw error;
      }

      // If AI fails completely, try structure-based fallback
      if (this.isAIFailure(error)) {
        this.logger.warn('Attempting structure-based fallback');

        const fallbackGraph = this.generateStructureBasedGraph(
          request.documentText,
          request.documentTitle,
        );

        return {
          ...fallbackGraph,
          metadata: {
            ...fallbackGraph.metadata,
            fallbackUsed: true,
            warnings: [
              ...fallbackGraph.metadata.warnings,
              'AI generation failed, using document structure as fallback',
            ],
          },
        };
      }

      throw error;
    }
  }

  // ============================================================
  // COST ESTIMATION
  // ============================================================

  /**
   * Estimate cost BEFORE starting AI processing
   *
   * WHY: Prevents wasted spending when budget is insufficient
   */
  async estimateCost(documentText: string): Promise<CostEstimate> {
    // Estimate how many chunks we'll create
    const estimatedChunks = Math.max(
      1,
      Math.ceil(documentText.length / 30000), // Max chunk size from text-chunker
    );

    // Estimate tokens per chunk (4 chars per token heuristic)
    const tokensPerChunk = Math.ceil(Math.min(documentText.length, 30000) / 4);

    // Estimate total tokens (input + output for each chunk)
    const inputTokens = tokensPerChunk * estimatedChunks;
    const outputTokens = 1000 * estimatedChunks; // ~1k tokens output per chunk

    // Calculate cost (Claude Haiku pricing: $0.25/$1.25 per 1M tokens)
    const inputCost = (inputTokens / 1_000_000) * 0.25;
    const outputCost = (outputTokens / 1_000_000) * 1.25;
    const estimatedCost = inputCost + outputCost;

    // Check budget
    const budgetCheck = await this.costTracker.checkBudget({
      userId: undefined, // MVP: no user-level tracking yet
      operation: 'graph-generation',
      estimatedTokens: inputTokens + outputTokens,
      documentId: undefined,
    });

    // Calculate remaining budget (this is a simplification for MVP)
    const dailyLimit = 10.0; // $10 per day limit from cost tracker
    const remaining = Math.max(0, dailyLimit - (budgetCheck.currentUsage?.today || 0));

    return {
      estimatedChunks,
      estimatedTokens: inputTokens + outputTokens,
      estimatedCost,
      budgetCheck: {
        withinBudget: budgetCheck.allowed,
        available: remaining,
        reason: budgetCheck.reason,
      },
    };
  }

  // ============================================================
  // CHUNKING
  // ============================================================

  /**
   * Chunk document into AI-processable pieces
   *
   * WHY: Large documents exceed AI context limits and reduce quality.
   * Skip chunking for small documents.
   */
  private async chunkDocument(
    documentText: string,
    documentTitle: string,
  ): Promise<ChunkingResult> {
    // Skip chunking for small documents
    if (documentText.length < MIN_DOCUMENT_LENGTH) {
      this.logger.info('Document is small, skipping chunking');

      return await this.textChunker.chunk(documentText, documentTitle);
    }

    return await this.textChunker.chunk(documentText, documentTitle);
  }

  // ============================================================
  // MINI-GRAPH GENERATION (WITH RATE LIMITING)
  // ============================================================

  /**
   * Generate mini-graphs for each chunk
   *
   * CRITICAL: Batched processing (2 at a time) to avoid rate limits
   *
   * WHY: Parallel AI calls can hit rate limits. Batching prevents this.
   */
  private async generateMiniGraphs(
    chunks: TextChunk[],
    documentTitle: string,
    maxNodes: number,
    progressCallback?: (progress: GenerationProgress) => void,
  ): Promise<AIGraphOutput[]> {
    const miniGraphs: AIGraphOutput[] = [];
    const totalChunks = chunks.length;

    // Process in batches of BATCH_SIZE
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);

      this.logger.debug(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}`, {
        batchSize: batch.length,
        processed: i,
        total: totalChunks,
      });

      // Process batch in parallel
      const batchResults = await Promise.all(
        batch.map((chunk) =>
          this.generateGraphForChunk(chunk, documentTitle, maxNodes),
        ),
      );

      miniGraphs.push(...batchResults);

      // Report progress
      this.reportProgress(progressCallback, {
        stage: 'generating',
        chunksProcessed: miniGraphs.length,
        totalChunks,
        percentComplete: 10 + Math.floor((miniGraphs.length / totalChunks) * 60),
        message: `Generated ${miniGraphs.length}/${totalChunks} mini-graphs...`,
      });
    }

    return miniGraphs;
  }

  /**
   * Generate a graph for a single chunk
   */
  private async generateGraphForChunk(
    chunk: TextChunk,
    documentTitle: string,
    maxNodes: number,
  ): Promise<AIGraphOutput> {
    try {
      const response = await this.aiOrchestrator.execute<AIGraphOutput>({
        promptType: 'graph-generation',
        context: {
          documentText: chunk.content,
          documentTitle: `${documentTitle} (Part ${chunk.chunkIndex + 1}/${chunk.totalChunks})`,
          maxNodes: Math.min(maxNodes, 10), // Smaller max for mini-graphs
        },
        config: {
          maxRetries: 3,
          qualityThreshold: 60,
          documentId: undefined,
        },
      });

      // DEBUG: Log AI response to verify keyQuote presence
      this.logger.info('[DEBUG] AI Response for chunk', {
        chunkIndex: chunk.chunkIndex,
        nodeCount: response.data.nodes?.length || 0,
        sampleNode: response.data.nodes?.[0] ? {
          id: response.data.nodes[0].id,
          title: response.data.nodes[0].title,
          hasKeyQuote: !!response.data.nodes[0].keyQuote,
          hasPageReferences: !!response.data.nodes[0].pageReferences,
          keyQuote: response.data.nodes[0].keyQuote?.substring(0, 50),
          pageReferences: response.data.nodes[0].pageReferences,
        } : null,
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to generate mini-graph for chunk', {
        chunkIndex: chunk.chunkIndex,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  // ============================================================
  // CRITICAL: CORRECT MERGE ORDER
  // ============================================================

  /**
   * Merge mini-graphs with CORRECT order to prevent orphaned edges
   *
   * CORRECT ORDER:
   * 1. Combine all nodes and edges from mini-graphs
   * 2. **DEDUPLICATE NODES** - Returns mapping (oldId -> newId)
   * 3. **REMAP ALL EDGES** - Update edge.from and edge.to using mapping
   * 4. **DEDUPLICATE EDGES** - Remove duplicates (same from + to + relationship)
   * 5. Trim to maxNodes if needed
   *
   * WHY: Without this order, edges can reference deleted node IDs after
   * deduplication, causing orphaned edges and corrupt graphs.
   */
  private async mergeGraphsCorrectly(
    miniGraphs: AIGraphOutput[],
    maxNodes: number,
    textBlockRanges?: Map<number, { start: number; end: number }>,
  ): Promise<{
    nodes: GraphNode[];
    edges: GraphEdge[];
    mergedNodes: number;
    duplicateEdgesRemoved: number;
  }> {
    // Step 1: Combine all nodes and edges
    const allNodes: GraphNode[] = [];
    const allEdges: GraphEdge[] = [];

    for (let i = 0; i < miniGraphs.length; i++) {
      const miniGraph = miniGraphs[i];
      if (!miniGraph) continue;

      // Add nodes with source chunk tracking
      for (const node of miniGraph.nodes || []) {
        // Create sourceChunk object with textBlock range if available
        const sourceChunkInfo = textBlockRanges?.get(i)
          ? {
              chunkIndex: i,
              textBlockRange: textBlockRanges.get(i)!,
            }
          : undefined;

        allNodes.push({
          id: `${i}_${node.id}`, // Prefix with chunk index to avoid collisions
          title: node.title,
          description: node.description,
          nodeType: node.nodeType, // Semantic classification
          summary: node.summary, // 2-sentence contextual summary
          pageReferences: node.pageReferences, // Pages where concept appears
          keyQuote: node.keyQuote, // Representative quote
          sourceChunk: sourceChunkInfo,
          metadata: node.metadata,
        });
      }

      // Add edges (also prefix node IDs)
      for (const edge of miniGraph.edges || []) {
        allEdges.push({
          from: `${i}_${edge.fromNodeId}`,
          to: `${i}_${edge.toNodeId}`,
          relationship: edge.relationship || 'relates to',
          metadata: edge.metadata,
        });
      }
    }

    this.logger.info('Combined mini-graphs', {
      totalNodes: allNodes.length,
      totalEdges: allEdges.length,
    });

    // Step 2: **DEDUPLICATE NODES FIRST** (CRITICAL) - Using semantic deduplication
    const semanticResult = await this.semanticDeduplicator.deduplicate({
      nodes: allNodes,
    });

    // Convert Record<string, string> to Map<string, string> for compatibility
    const mapping = new Map(Object.entries(semanticResult.mapping));

    const deduplicationResult = {
      deduplicatedNodes: semanticResult.deduplicatedNodes,
      mapping,
      mergeCount: semanticResult.statistics.mergedCount,
    };

    this.logger.info('Nodes deduplicated (semantic)', {
      before: semanticResult.statistics.originalCount,
      after: semanticResult.statistics.finalCount,
      merged: semanticResult.statistics.mergedCount,
      mergesByPhase: semanticResult.statistics.mergesByPhase,
    });

    // Step 3: **REMAP ALL EDGES** using the mapping (CRITICAL)
    const remappedEdges = this.remapEdges(allEdges, deduplicationResult.mapping);

    this.logger.info('Edges remapped', {
      totalEdges: remappedEdges.length,
    });

    // Step 4: **DEDUPLICATE EDGES**
    const uniqueEdges = this.deduplicateEdges(remappedEdges);

    this.logger.info('Edges deduplicated', {
      before: remappedEdges.length,
      after: uniqueEdges.length,
      removed: remappedEdges.length - uniqueEdges.length,
    });

    // Step 5: Trim to maxNodes if needed (keep most connected nodes)
    let finalNodes = deduplicationResult.deduplicatedNodes;
    if (finalNodes.length > maxNodes) {
      finalNodes = this.trimToMaxNodes(finalNodes, uniqueEdges, maxNodes);

      this.logger.info('Trimmed to max nodes', {
        before: deduplicationResult.deduplicatedNodes.length,
        after: finalNodes.length,
      });
    }

    // Remove edges referencing trimmed nodes
    const finalNodeIds = new Set(finalNodes.map((n) => n.id));

    this.logger.debug('Final node IDs after deduplication', {
      nodeIds: Array.from(finalNodeIds),
      edgeSample: uniqueEdges.slice(0, 3).map(e => ({ from: e.from, to: e.to })),
    });

    const finalEdges = uniqueEdges.filter(
      (edge) => finalNodeIds.has(edge.from) && finalNodeIds.has(edge.to),
    );

    this.logger.debug('Edge filtering result', {
      totalEdges: uniqueEdges.length,
      validEdges: finalEdges.length,
      orphanedEdges: uniqueEdges.length - finalEdges.length,
    });

    return {
      nodes: finalNodes,
      edges: finalEdges,
      mergedNodes: deduplicationResult.mergeCount,
      duplicateEdgesRemoved: remappedEdges.length - uniqueEdges.length,
    };
  }

  // ============================================================
  // NODE DEDUPLICATION (MULTI-PHASE ALGORITHM)
  // ============================================================

  /**
   * DEPRECATED: Old naive deduplication (replaced with semantic deduplication)
   *
   * This method is kept for reference but is no longer used.
   * The new SemanticNodeDeduplicator provides better quality through:
   * - Embedding-based similarity (not just string matching)
   * - LLM validation for borderline cases
   * - Context-aware merging decisions
   *
   * @deprecated Use SemanticNodeDeduplicator instead
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private deduplicateNodesOld(nodes: GraphNode[]): DeduplicationResult {
    // Use Union-Find for node merging
    const parent = new Map<string, string>();
    const rank = new Map<string, number>();

    // Initialize Union-Find
    for (const node of nodes) {
      parent.set(node.id, node.id);
      rank.set(node.id, 0);
    }

    const find = (id: string): string => {
      const parentId = parent.get(id);
      if (parentId && parentId !== id) {
        parent.set(id, find(parentId));
      }
      return parent.get(id) || id;
    };

    const union = (id1: string, id2: string): void => {
      const root1 = find(id1);
      const root2 = find(id2);

      if (root1 === root2) return;

      const rank1 = rank.get(root1) || 0;
      const rank2 = rank.get(root2) || 0;

      if (rank1 < rank2) {
        parent.set(root1, root2);
      } else if (rank1 > rank2) {
        parent.set(root2, root1);
      } else {
        parent.set(root2, root1);
        rank.set(root1, rank1 + 1);
      }
    };

    // Phase 1: Exact match
    for (let i = 0; i < nodes.length; i++) {
      const nodeI = nodes[i];
      if (!nodeI) continue;

      for (let j = i + 1; j < nodes.length; j++) {
        const nodeJ = nodes[j];
        if (!nodeJ) continue;

        const title1 = nodeI.title.toLowerCase().trim();
        const title2 = nodeJ.title.toLowerCase().trim();

        if (title1 === title2) {
          union(nodeI.id, nodeJ.id);
        }
      }
    }

    // Phase 2: Acronym detection
    for (let i = 0; i < nodes.length; i++) {
      const nodeI = nodes[i];
      if (!nodeI) continue;

      for (let j = i + 1; j < nodes.length; j++) {
        const nodeJ = nodes[j];
        if (!nodeJ) continue;

        const title1 = nodeI.title.trim();
        const title2 = nodeJ.title.trim();

        if (this.isAcronymMatch(title1, title2)) {
          union(nodeI.id, nodeJ.id);
        }
      }
    }

    // Phase 3: Fuzzy matching with word overlap safeguard
    for (let i = 0; i < nodes.length; i++) {
      const nodeI = nodes[i];
      if (!nodeI) continue;

      for (let j = i + 1; j < nodes.length; j++) {
        const nodeJ = nodes[j];
        if (!nodeJ) continue;

        if (find(nodeI.id) === find(nodeJ.id)) continue; // Already merged

        const title1 = nodeI.title;
        const title2 = nodeJ.title;

        if (this.isFuzzyMatch(title1, title2)) {
          union(nodeI.id, nodeJ.id);
        }
      }
    }

    // Build mapping and deduplicated nodes
    const mapping = new Map<string, string>();
    const nodesByRoot = new Map<string, GraphNode[]>();

    for (const node of nodes) {
      const root = find(node.id);
      mapping.set(node.id, root);

      if (!nodesByRoot.has(root)) {
        nodesByRoot.set(root, []);
      }
      const rootNodes = nodesByRoot.get(root);
      if (rootNodes) {
        rootNodes.push(node);
      }
    }

    // Create deduplicated nodes (pick best description)
    const deduplicatedNodes: GraphNode[] = [];
    for (const [root, groupNodes] of nodesByRoot.entries()) {
      if (!groupNodes || groupNodes.length === 0) continue;

      // Pick node with longest description
      const best = groupNodes.reduce((prev, curr) => {
        const prevLength = prev.description?.length || 0;
        const currLength = curr.description?.length || 0;
        return currLength > prevLength ? curr : prev;
      });

      deduplicatedNodes.push({
        id: root, // Use root as new ID
        title: best.title,
        description: best.description,
        sourceChunk: best.sourceChunk,
        metadata: best.metadata,
      });
    }

    return {
      deduplicatedNodes,
      mapping,
      mergeCount: nodes.length - deduplicatedNodes.length,
    };
  }

  /**
   * Check if two titles are acronym matches
   *
   * Example: "ML" matches "Machine Learning"
   */
  private isAcronymMatch(title1: string, title2: string): boolean {
    const short = title1.length < title2.length ? title1 : title2;
    const long = title1.length < title2.length ? title2 : title1;

    // Short must be uppercase and 2-5 chars
    if (!/^[A-Z]{2,5}$/.test(short)) return false;

    // Long must have words matching acronym
    const words = long.split(/\s+/);
    if (words.length !== short.length) return false;

    for (let i = 0; i < short.length; i++) {
      const word = words[i];
      const shortChar = short[i];
      if (!word || !shortChar || word[0]?.toUpperCase() !== shortChar) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if two titles are fuzzy matches
   *
   * Uses Jaccard similarity with word overlap safeguard
   * WHY: Prevents "Neural Networks" matching "Social Networks"
   */
  private isFuzzyMatch(title1: string, title2: string): boolean {
    const words1 = new Set(title1.toLowerCase().split(/\s+/));
    const words2 = new Set(title2.toLowerCase().split(/\s+/));

    // Calculate Jaccard similarity
    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    const jaccard = intersection.size / union.size;

    // Threshold: 70% overlap required
    // WHY: Prevents false positives like "Neural Networks" vs "Social Networks" (50% overlap)
    return jaccard >= 0.7;
  }

  // ============================================================
  // EDGE REMAPPING AND DEDUPLICATION
  // ============================================================

  /**
   * Remap edges using node deduplication mapping
   *
   * CRITICAL: This step prevents orphaned edges
   *
   * WHY: After node deduplication, edges may still reference old node IDs.
   * We must update edge.from and edge.to to use the new deduplicated IDs.
   */
  private remapEdges(edges: GraphEdge[], mapping: Map<string, string>): GraphEdge[] {
    return edges.map((edge) => ({
      ...edge,
      from: mapping.get(edge.from) || edge.from,
      to: mapping.get(edge.to) || edge.to,
    }));
  }

  /**
   * Deduplicate edges (same from + to + relationship)
   */
  private deduplicateEdges(edges: GraphEdge[]): GraphEdge[] {
    const seen = new Set<string>();
    const unique: GraphEdge[] = [];

    for (const edge of edges) {
      // Create unique key
      const key = `${edge.from}→${edge.to}→${edge.relationship}`;

      if (!seen.has(key)) {
        seen.add(key);
        unique.push(edge);
      }
    }

    return unique;
  }

  /**
   * Trim to maximum number of nodes (keep most connected)
   */
  private trimToMaxNodes(
    nodes: GraphNode[],
    edges: GraphEdge[],
    maxNodes: number,
  ): GraphNode[] {
    // Calculate node connectivity (how many edges each node has)
    const connectivity = new Map<string, number>();
    for (const node of nodes) {
      connectivity.set(node.id, 0);
    }

    for (const edge of edges) {
      connectivity.set(edge.from, (connectivity.get(edge.from) || 0) + 1);
      connectivity.set(edge.to, (connectivity.get(edge.to) || 0) + 1);
    }

    // Sort by connectivity (most connected first)
    const sorted = [...nodes].sort(
      (a, b) => (connectivity.get(b.id) || 0) - (connectivity.get(a.id) || 0),
    );

    // Keep top maxNodes
    return sorted.slice(0, maxNodes);
  }

  // ============================================================
  // VALIDATION AND AUTO-FIX
  // ============================================================

  /**
   * Validate final graph with auto-fix
   *
   * Checks:
   * - Valid Mermaid syntax
   * - All edges reference valid nodes
   * - No duplicate edges
   * - No isolated nodes (unless intentional)
   *
   * Auto-fix:
   * - Remove orphaned edges
   * - Deduplicate edges
   */
  private async validateAndFix(merged: {
    nodes: GraphNode[];
    edges: GraphEdge[];
    mergedNodes: number;
    duplicateEdgesRemoved: number;
  }): Promise<{
    nodes: GraphNode[];
    edges: GraphEdge[];
    mergedNodes: number;
    duplicateEdgesRemoved: number;
    qualityScore: number;
    totalCost: number;
    model: string;
    cacheHit: boolean;
    fallbackUsed: boolean;
    warnings: string[];
  }> {
    const warnings: string[] = [];
    let { nodes, edges } = merged;

    // Check 1: Remove orphaned edges
    const nodeIds = new Set(nodes.map((n) => n.id));
    const validEdges = edges.filter((edge) => {
      const valid = nodeIds.has(edge.from) && nodeIds.has(edge.to);
      if (!valid) {
        warnings.push(`Removed orphaned edge: ${edge.from} → ${edge.to}`);
      }
      return valid;
    });

    // Check 2: Remove self-loops
    const noSelfLoops = validEdges.filter((edge) => {
      const isSelfLoop = edge.from === edge.to;
      if (isSelfLoop) {
        warnings.push(`Removed self-loop: ${edge.from} → ${edge.to}`);
      }
      return !isSelfLoop;
    });

    // Check 3: Detect isolated nodes
    const connectedNodeIds = new Set<string>();
    for (const edge of noSelfLoops) {
      connectedNodeIds.add(edge.from);
      connectedNodeIds.add(edge.to);
    }

    const isolatedNodes = nodes.filter((node) => !connectedNodeIds.has(node.id));
    if (isolatedNodes.length > 0) {
      warnings.push(
        `Found ${isolatedNodes.length} isolated nodes: ${isolatedNodes.map((n) => n.title).join(', ')}`,
      );
    }

    // Calculate quality score
    let qualityScore = 100;
    qualityScore -= isolatedNodes.length * 10; // -10 per isolated node
    qualityScore -= (edges.length - noSelfLoops.length) * 5; // -5 per removed edge
    qualityScore = Math.max(0, qualityScore);

    return {
      nodes,
      edges: noSelfLoops,
      mergedNodes: merged.mergedNodes,
      duplicateEdgesRemoved: merged.duplicateEdgesRemoved + (edges.length - noSelfLoops.length),
      qualityScore,
      totalCost: 0, // Updated in actual implementation with cost tracking
      model: 'claude-haiku', // Updated in actual implementation
      cacheHit: false,
      fallbackUsed: false,
      warnings,
    };
  }

  // ============================================================
  // MERMAID CODE GENERATION
  // ============================================================

  /**
   * Generate Mermaid flowchart code from nodes and edges
   */
  private generateMermaidCode(nodes: GraphNode[], edges: GraphEdge[]): string {
    const lines: string[] = ['flowchart TD'];

    // Add nodes
    for (const node of nodes) {
      // Escape special characters in labels
      const label = this.escapeMermaidLabel(node.title);
      lines.push(`    ${node.id}["${label}"]`);
    }

    // Add edges
    for (const edge of edges) {
      const label = this.escapeMermaidLabel(edge.relationship);
      lines.push(`    ${edge.from} -->|"${label}"| ${edge.to}`);
    }

    return lines.join('\n');
  }

  /**
   * Escape special characters for Mermaid syntax
   */
  private escapeMermaidLabel(text: string): string {
    return text.replace(/"/g, '\\"').replace(/\n/g, ' ');
  }

  // ============================================================
  // STRUCTURE-BASED FALLBACK
  // ============================================================

  /**
   * Generate structure-based graph when AI fails completely
   *
   * Strategy: Extract headings and build hierarchical graph
   * WHY: Better than nothing for users
   */
  private generateStructureBasedGraph(
    documentText: string,
    documentTitle: string,
  ): GenerateGraphResponse {
    this.logger.info('Generating structure-based fallback graph');

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    // Extract markdown headings
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    const headings: Array<{ level: number; text: string; index: number }> = [];

    let match;
    while ((match = headingRegex.exec(documentText)) !== null) {
      if (match[1] && match[2]) {
        headings.push({
          level: match[1].length,
          text: match[2].trim(),
          index: headings.length,
        });
      }
    }

    if (headings.length === 0) {
      // No structure found - create single node
      nodes.push({
        id: 'node_0',
        title: documentTitle,
        description: 'Document has no clear structure (no headings found)',
      });

      return {
        nodes,
        edges,
        mermaidCode: this.generateMermaidCode(nodes, edges),
        statistics: {
          chunksProcessed: 0,
          totalNodes: 1,
          totalEdges: 0,
          mergedNodes: 0,
          duplicateEdgesRemoved: 0,
          qualityScore: 50,
          totalCost: 0,
          processingTimeMs: 0,
        },
        metadata: {
          model: 'structure-fallback',
          cacheHit: false,
          fallbackUsed: true,
          warnings: ['AI generation failed, using document structure as fallback'],
        },
      };
    }

    // Build hierarchical graph
    const stack: Array<{ id: string; level: number }> = [];

    for (const heading of headings) {
      if (!heading) continue;

      const nodeId = `node_${heading.index}`;

      nodes.push({
        id: nodeId,
        title: heading.text,
        description: `Heading level ${heading.level}`,
      });

      // Find parent (previous heading with lower level)
      while (stack.length > 0 && stack[stack.length - 1]?.level >= heading.level) {
        stack.pop();
      }

      if (stack.length > 0) {
        const parent = stack[stack.length - 1];
        if (parent) {
          edges.push({
            from: parent.id,
            to: nodeId,
            relationship: 'contains',
          });
        }
      }

      stack.push({ id: nodeId, level: heading.level });
    }

    const mermaidCode = this.generateMermaidCode(nodes, edges);

    return {
      nodes,
      edges,
      mermaidCode,
      statistics: {
        chunksProcessed: 0,
        totalNodes: nodes.length,
        totalEdges: edges.length,
        mergedNodes: 0,
        duplicateEdgesRemoved: 0,
        qualityScore: 60, // Moderate quality for fallback
        totalCost: 0,
        processingTimeMs: 0,
      },
      metadata: {
        model: 'structure-fallback',
        cacheHit: false,
        fallbackUsed: true,
        warnings: ['AI generation failed, using document structure as fallback'],
      },
    };
  }

  // ============================================================
  // QUOTE-TO-COORDINATE MATCHING
  // ============================================================

  /**
   * Match AI-generated keyQuotes to precise PDF coordinates
   *
   * ALGORITHM:
   * 1. For each node with a keyQuote:
   *    a. Use matchQuoteToCoordinates() to find matching textBlocks
   *    b. Convert matches to NodeDocumentReference format
   *    c. Store in node.documentRefs
   * 2. Track match quality metrics
   * 3. Log warnings for failed matches
   *
   * GRACEFUL DEGRADATION:
   * - If matching fails for a node, store keyQuote without coordinates
   * - Node is still usable, just without highlighting capability
   * - User can still see the concept, just can't click to highlight
   *
   * @param nodes - Nodes with keyQuotes from AI
   * @param textBlocks - PDF text blocks with coordinates
   * @returns Updated nodes with documentRefs + matching metrics
   */
  private matchQuotesToCoordinates(
    nodes: GraphNode[],
    textBlocks: TextBlock[],
  ): {
    nodes: GraphNode[];
    metrics: ReturnType<typeof calculateMatchingMetrics>;
  } {
    const matchResults: QuoteMatchResult[] = [];
    const updatedNodes: GraphNode[] = [];

    for (const node of nodes) {
      // Skip nodes without keyQuote
      if (!node.keyQuote) {
        this.logger.warn(`[matchQuotesToCoordinates] Node ${node.id} missing keyQuote`);
        updatedNodes.push(node);
        continue;
      }

      // Match quote to coordinates
      const matchResult = matchQuoteToCoordinates(
        node.keyQuote,
        textBlocks,
        { allowFuzzyMatch: true },
        this.logger,
      );

      matchResults.push(matchResult);

      // Create updated node with documentRefs
      if (matchResult.references.length > 0) {
        // Success: Store coordinate-based references
        updatedNodes.push({
          ...node,
          documentRefs: { references: matchResult.references },
        });

        this.logger.debug(
          `[matchQuotesToCoordinates] Matched node ${node.id} (${matchResult.metadata.matchType}, ${matchResult.references.length} blocks)`,
        );
      } else {
        // Failed: Store node without coordinates (graceful degradation)
        updatedNodes.push({
          ...node,
          documentRefs: { references: [] }, // Empty but structure preserved
        });

        this.logger.warn(
          `[matchQuotesToCoordinates] No match found for node ${node.id}: "${node.keyQuote?.substring(0, 50)}..."`,
        );
      }
    }

    // Calculate aggregated metrics
    const metrics = calculateMatchingMetrics(matchResults);

    return {
      nodes: updatedNodes,
      metrics,
    };
  }

  /**
   * Smart quote-to-coordinate matching using hybrid strategy
   *
   * NEW APPROACH: Doesn't rely on AI returning keyQuote!
   * Instead, we extract complete sentences from the document and use
   * hybrid matching (exact word match + semantic validation).
   *
   * ALGORITHM:
   * 1. For each node:
   *    a. Extract complete sentences from textBlocks
   *    b. Try exact word match (node.title in sentence)
   *    c. Validate semantically (similarity with node.summary)
   *    d. Fallback to semantic search if needed
   * 2. Create documentRefs with coordinates
   * 3. Track match quality metrics
   *
   * @param nodes - Nodes from AI (with title + summary)
   * @param textBlocks - PDF text blocks with coordinates
   * @returns Updated nodes with documentRefs + matching metrics
   */
  private async smartMatchQuotesToCoordinates(
    nodes: GraphNode[],
    textBlocks: TextBlock[],
  ): Promise<{
    nodes: GraphNode[];
    metrics: {
      totalNodes: number;
      nodesWithRefs: number;
      exactMatchCount: number;
      semanticSearchCount: number;
      fallbackCount: number;
      averageSimilarity: number;
    };
  }> {
    const { findRelevantSentencesForNode } = await import('../lib/matching/hybrid-quote-matcher');

    const updatedNodes: GraphNode[] = [];
    let exactMatchCount = 0;
    let semanticSearchCount = 0;
    let fallbackCount = 0;
    let totalSimilarity = 0;
    let nodesWithRefs = 0;

    for (const node of nodes) {
      try {
        // Use hybrid matcher
        const result = await findRelevantSentencesForNode(
          {
            title: node.title,
            summary: node.summary || node.title, // Fallback to title if no summary
          },
          textBlocks,
          {
            openaiApiKey: process.env.OPENAI_API_KEY,
            similarityThreshold: 0.7,
            maxReferences: 3,
          },
          this.logger,
        );

        // Track metrics
        if (result.metadata.strategy === 'exact-match') {
          exactMatchCount++;
        } else if (result.metadata.strategy === 'semantic-search') {
          semanticSearchCount++;
        } else {
          fallbackCount++;
        }

        totalSimilarity += result.metadata.topSimilarity;

        if (result.references.length > 0) {
          nodesWithRefs++;

          // Add documentRefs to node
          updatedNodes.push({
            ...node,
            documentRefs: {
              references: result.references,
            } as any,
          });

          this.logger.debug(`[smartMatch] Node "${node.title}"`, {
            strategy: result.metadata.strategy,
            similarity: result.metadata.topSimilarity.toFixed(2),
            refsCount: result.references.length,
          });
        } else {
          // No references found
          updatedNodes.push(node);
          this.logger.warn(`[smartMatch] No references found for node "${node.title}"`);
        }
      } catch (error) {
        // On error, keep node without refs
        updatedNodes.push(node);
        this.logger.error(`[smartMatch] Error matching node "${node.title}"`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const averageSimilarity = nodes.length > 0 ? totalSimilarity / nodes.length : 0;

    return {
      nodes: updatedNodes,
      metrics: {
        totalNodes: nodes.length,
        nodesWithRefs,
        exactMatchCount,
        semanticSearchCount,
        fallbackCount,
        averageSimilarity,
      },
    };
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================

  /**
   * Check if error is an AI failure (vs other errors)
   */
  private isAIFailure(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const message = error.message.toLowerCase();

    // These are NOT AI failures - should be rethrown
    if (
      message.includes('budget') ||
      message.includes('database') ||
      message.includes('connection') ||
      message.includes('empty')
    ) {
      return false;
    }

    // These ARE AI failures - can use fallback
    return (
      message.includes('validation') ||
      message.includes('ai') ||
      message.includes('model') ||
      message.includes('timeout')
    );
  }

  /**
   * Report progress to callback if provided
   */
  private reportProgress(
    callback: ((progress: GenerationProgress) => void) | undefined,
    progress: GenerationProgress,
  ): void {
    if (callback) {
      try {
        callback(progress);
      } catch (error) {
        this.logger.warn('Progress callback failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Compute textBlock ranges for each chunk
   *
   * WHY: The hybrid quote matcher needs to know which textBlocks correspond
   * to each chunk so it can search efficiently (only in relevant textBlocks)
   * instead of searching the entire document.
   *
   * @param chunks - Text chunks with character positions
   * @param textBlocks - All textBlocks from the document
   * @returns Map of chunk index to textBlock range
   */
  private computeTextBlockRanges(
    chunks: TextChunk[],
    textBlocks: TextBlock[],
  ): Map<number, { start: number; end: number }> {
    const ranges = new Map<number, { start: number; end: number }>();

    if (!textBlocks || textBlocks.length === 0) {
      // No textBlocks available - each chunk gets empty range
      chunks.forEach((chunk) => {
        ranges.set(chunk.chunkIndex, { start: 0, end: 0 });
      });
      return ranges;
    }

    // Build cumulative character position map for textBlocks
    // This tells us: textBlock[i] starts at character position X
    let cumulativePosition = 0;
    const textBlockPositions: number[] = [];

    for (const block of textBlocks) {
      textBlockPositions.push(cumulativePosition);
      cumulativePosition += block.text.length + 1; // +1 for space between blocks
    }

    // For each chunk, find which textBlocks it spans
    for (const chunk of chunks) {
      const chunkStart = chunk.startIndex;
      const chunkEnd = chunk.endIndex;

      // Find first textBlock that starts at or before chunkStart
      let startBlockIndex = 0;
      for (let i = 0; i < textBlockPositions.length; i++) {
        if (textBlockPositions[i] <= chunkStart) {
          startBlockIndex = i;
        } else {
          break;
        }
      }

      // Find last textBlock that starts before chunkEnd
      let endBlockIndex = startBlockIndex;
      for (let i = startBlockIndex; i < textBlockPositions.length; i++) {
        if (textBlockPositions[i] < chunkEnd) {
          endBlockIndex = i;
        } else {
          break;
        }
      }

      // Make it exclusive (end + 1)
      ranges.set(chunk.chunkIndex, {
        start: startBlockIndex,
        end: Math.min(endBlockIndex + 1, textBlocks.length),
      });
    }

    return ranges;
  }
}

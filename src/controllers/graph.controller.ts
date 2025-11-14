/**
 * Graph Controller
 * Handles graph generation and retrieval endpoints
 *
 * WHY: Separates HTTP handling from business logic, validates requests,
 * manages database operations, and returns standardized responses.
 *
 * Architecture: Controller → Service → Database/AI
 */

import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendError } from '../utils/response.util';
import { ExtendedRequest } from '../types/api.types';
import { ErrorCode } from '../types/api.types';
import { GraphStatus } from '../types/graph.types';
import { services } from '../services/service-container';
import { prisma } from '../config/database';
import { logger } from '../utils/logger.util';
import { Prisma } from '@prisma/client';

/**
 * Generate knowledge graph from document text
 * POST /api/v1/graphs/generate
 *
 * Flow:
 * 1. Extract and validate request data
 * 2. Call GraphGeneratorService to generate graph
 * 3. Save graph, nodes, and edges to database
 * 4. Return graph ID and statistics
 *
 * WHY: This is synchronous for MVP (BullMQ integration will make it async later)
 */
export const generateGraph = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const extReq = req as ExtendedRequest;
  const startTime = Date.now();

  try {
    // Extract validated data (validated by Zod middleware)
    const { documentId, documentText, documentTitle, userId, options } = req.body;

    // Determine document source and text
    let finalDocumentText: string;
    let finalDocumentTitle: string;
    let finalDocumentId: string;

    if (documentId) {
      // Mode A: Lookup document from database
      logger.info('Looking up document for graph generation', {
        requestId: extReq.requestId,
        documentId,
      });

      const document = await prisma.document.findUnique({
        where: { id: documentId },
      });

      if (!document) {
        return sendError(
          res,
          ErrorCode.DOCUMENT_NOT_FOUND,
          `Document with ID '${documentId}' not found`,
          404,
          extReq.requestId
        );
      }

      if (document.status !== 'ready') {
        return sendError(
          res,
          ErrorCode.PROCESSING_FAILED,
          `Document is not ready. Current status: ${document.status}`,
          400,
          extReq.requestId
        );
      }

      finalDocumentText = document.contentText;
      finalDocumentTitle = document.title;
      finalDocumentId = document.id;
    } else {
      // Mode B: Direct text (backward compatibility)
      finalDocumentText = documentText!; // Non-null assertion safe due to Zod validation
      finalDocumentTitle = documentTitle || 'Untitled Document';

      // Create temporary document record for direct text
      logger.info('Creating temporary document record for direct text', {
        requestId: extReq.requestId,
        documentLength: finalDocumentText.length,
      });

      const tempDoc = await prisma.document.create({
        data: {
          title: finalDocumentTitle,
          contentText: finalDocumentText,
          sourceType: 'text',
          status: 'ready',
        },
      });

      finalDocumentId = tempDoc.id;
    }

    logger.info('Starting graph generation', {
      requestId: extReq.requestId,
      documentId: finalDocumentId,
      documentLength: finalDocumentText.length,
      documentTitle: finalDocumentTitle,
      maxNodes: options?.maxNodes,
    });

    // Call Graph Generator Service
    const graphGenerator = services.getGraphGenerator();

    const result = await graphGenerator.generateGraph({
      documentId: finalDocumentId,
      documentText: finalDocumentText,
      documentTitle: finalDocumentTitle,
      options: {
        maxNodes: options?.maxNodes || 15,
        skipCache: options?.skipCache || false,
      },
    });

    logger.info('Graph generation completed', {
      requestId: extReq.requestId,
      nodeCount: result.statistics.totalNodes,
      edgeCount: result.statistics.totalEdges,
      cost: result.statistics.totalCost,
      durationMs: Date.now() - startTime,
    });

    // Save to database (link to existing document)
    const savedGraph = await saveGraphToDatabase(
      result,
      finalDocumentId,
      userId
    );

    // Return response
    sendSuccess(
      res,
      {
        graphId: savedGraph.id,
        status: 'completed',
        nodeCount: result.statistics.totalNodes,
        edgeCount: result.statistics.totalEdges,
        qualityScore: result.statistics.qualityScore,
        cost: result.statistics.totalCost,
        processingTimeMs: result.statistics.processingTimeMs,
        warnings: result.metadata.warnings,
      },
      201,
      extReq.requestId
    );
  } catch (error) {
    logger.error('Graph generation failed', {
      requestId: extReq.requestId,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime,
    });

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('Budget exceeded')) {
        return sendError(
          res,
          ErrorCode.PROCESSING_FAILED,
          'Graph generation failed: Budget exceeded. Please try with a shorter document.',
          400,
          extReq.requestId,
          { message: error.message }
        );
      }

      if (error.message.includes('validation')) {
        return sendError(
          res,
          ErrorCode.PROCESSING_FAILED,
          'Graph generation failed: AI output validation failed',
          500,
          extReq.requestId,
          { message: error.message }
        );
      }

      if (error.message.includes('AI') || error.message.includes('model')) {
        return sendError(
          res,
          ErrorCode.AI_SERVICE_UNAVAILABLE,
          'AI service temporarily unavailable. Please try again.',
          503,
          extReq.requestId,
          { message: error.message }
        );
      }
    }

    // Generic error
    next(error);
  }
};

/**
 * Get graph by ID with all nodes and edges
 * GET /api/v1/graphs/:id
 *
 * Flow:
 * 1. Validate graph ID
 * 2. Fetch graph with nodes and edges from database
 * 3. Return full graph structure
 */
export const getGraphById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const extReq = req as ExtendedRequest;

  try {
    const { id } = req.params;

    logger.info('Fetching graph', {
      requestId: extReq.requestId,
      graphId: id,
    });

    // Fetch graph with nodes and edges
    const graph = await prisma.graph.findUnique({
      where: { id },
      include: {
        nodes: {
          orderBy: { nodeKey: 'asc' },
        },
        edges: {
          include: {
            fromNode: { select: { nodeKey: true, title: true } },
            toNode: { select: { nodeKey: true, title: true } },
          },
        },
        document: {
          select: {
            id: true,
            title: true,
            sourceType: true,
            createdAt: true,
          },
        },
      },
    });

    if (!graph) {
      return sendError(
        res,
        ErrorCode.GRAPH_NOT_FOUND,
        `Graph with ID '${id}' not found`,
        404,
        extReq.requestId
      );
    }

    // Format response
    const response = {
      id: graph.id,
      status: graph.status,
      mermaidCode: graph.mermaidCode,
      generationModel: graph.generationModel,
      version: graph.version,
      createdAt: graph.createdAt.toISOString(),
      document: graph.document,
      nodes: graph.nodes.map((node) => ({
        id: node.id,
        nodeKey: node.nodeKey,
        title: node.title,
        contentSnippet: node.contentSnippet,
        nodeType: node.nodeType,
        summary: node.summary,
        documentRefs: node.documentRefs,
        position: {
          x: node.positionX,
          y: node.positionY,
        },
        metadata: node.metadata,
      })),
      edges: graph.edges.map((edge) => ({
        id: edge.id,
        from: edge.fromNodeId,
        to: edge.toNodeId,
        fromNode: edge.fromNode,
        toNode: edge.toNode,
        relationship: edge.relationship,
        aiExplanation: edge.aiExplanation,
        strength: edge.strength,
        metadata: edge.metadata,
      })),
    };

    sendSuccess(res, response, 200, extReq.requestId);
  } catch (error) {
    logger.error('Failed to fetch graph', {
      requestId: extReq.requestId,
      graphId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });

    next(error);
  }
};

/**
 * Get job status (for future BullMQ integration)
 * GET /api/v1/jobs/:id
 *
 * Current implementation: Returns "completed" for all jobs
 * WHY: MVP uses synchronous processing. BullMQ will add async job tracking.
 */
export const getJobStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const extReq = req as ExtendedRequest;

  try {
    const { id } = req.params;

    logger.info('Checking job status', {
      requestId: extReq.requestId,
      jobId: id,
    });

    // MVP: All jobs are synchronous, so always return completed
    // TODO: Implement actual job tracking when BullMQ is integrated
    const response = {
      jobId: id,
      status: 'completed' as const,
      progress: 100,
      result: {
        message: 'Job completed (synchronous processing)',
      },
    };

    sendSuccess(res, response, 200, extReq.requestId);
  } catch (error) {
    logger.error('Failed to check job status', {
      requestId: extReq.requestId,
      jobId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });

    next(error);
  }
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Save generated graph to database
 *
 * WHY: Atomic transaction ensures all nodes and edges are saved together.
 * If any part fails, entire operation rolls back.
 *
 * Updated: Links to existing document instead of creating new one
 */
async function saveGraphToDatabase(
  graphResult: {
    nodes: Array<{
      id: string;
      title: string;
      description?: string;
      nodeType?: string;
      summary?: string;
      sourceChunk?: number;
      metadata?: Record<string, unknown>;
    }>;
    edges: Array<{
      from: string;
      to: string;
      relationship: string;
      metadata?: Record<string, unknown>;
    }>;
    mermaidCode: string;
    statistics: {
      totalNodes: number;
      totalEdges: number;
      qualityScore: number;
      totalCost: number;
    };
    metadata: {
      model: string;
      fallbackUsed: boolean;
    };
  },
  documentId: string,
  _userId?: string // Prefixed with _ to indicate intentionally unused
): Promise<{ id: string }> {
  // Use transaction to ensure atomicity
  return await prisma.$transaction(async (tx) => {
    // 1. Create graph record (link to existing document)
    const graph = await tx.graph.create({
      data: {
        documentId,
        mermaidCode: graphResult.mermaidCode,
        generationModel: graphResult.metadata.model,
        status: GraphStatus.READY,
        version: 1,
      },
    });

    // 2. Create node ID mapping (graphResult.id -> database.id)
    const nodeIdMapping = new Map<string, string>();

    // 3. Create all nodes
    for (const node of graphResult.nodes) {
      const createdNode = await tx.node.create({
        data: {
          graphId: graph.id,
          nodeKey: node.id, // Store original ID as nodeKey
          title: node.title,
          contentSnippet: node.description,
          nodeType: node.nodeType,
          summary: node.summary,
          documentRefs: (node.metadata?.documentRefs as Prisma.InputJsonValue) || Prisma.JsonNull,
          metadata: (node.metadata as Prisma.InputJsonValue) || Prisma.JsonNull,
        },
      });

      nodeIdMapping.set(node.id, createdNode.id);
    }

    // 4. Create all edges (using mapped node IDs)
    for (const edge of graphResult.edges) {
      const fromNodeId = nodeIdMapping.get(edge.from);
      const toNodeId = nodeIdMapping.get(edge.to);

      if (!fromNodeId || !toNodeId) {
        logger.warn('Skipping edge with invalid node reference', {
          from: edge.from,
          to: edge.to,
          fromNodeId,
          toNodeId,
        });
        continue;
      }

      await tx.edge.create({
        data: {
          graphId: graph.id,
          fromNodeId,
          toNodeId,
          relationship: edge.relationship,
          metadata: (edge.metadata as Prisma.InputJsonValue) || Prisma.JsonNull,
        },
      });
    }

    logger.info('Graph saved to database', {
      graphId: graph.id,
      documentId,
      nodeCount: graphResult.nodes.length,
      edgeCount: graphResult.edges.length,
    });

    return graph;
  });
}

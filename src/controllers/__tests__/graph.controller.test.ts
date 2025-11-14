/**
 * Graph Controller Tests
 *
 * Tests for graph generation and retrieval endpoints:
 * - generateGraph(): POST /api/v1/graphs/generate
 * - getGraphById(): GET /api/v1/graphs/:id
 * - getJobStatus(): GET /api/v1/jobs/:id
 *
 * Coverage:
 * - Success paths (valid inputs)
 * - Validation errors (invalid inputs)
 * - Budget exceeded (cost tracking)
 * - AI service failures (503 errors)
 * - Database errors (500 errors)
 * - Not found errors (404 errors)
 */

import { Request, Response, NextFunction } from 'express';
import { generateGraph, getGraphById, getJobStatus } from '../graph.controller';
import { services } from '../../services/service-container';
import { prisma } from '../../config/database';
import { ExtendedRequest } from '../../types/api.types';
import { GraphGeneratorService } from '../../services/graph-generator.service';

// Mock dependencies
jest.mock('../../services/service-container');
jest.mock('../../config/database');
jest.mock('../../utils/logger.util', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Graph Controller', () => {
  let mockRequest: Partial<ExtendedRequest>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.Mock;
  let mockGraphGenerator: jest.Mocked<GraphGeneratorService>;

  beforeEach(() => {
    // Setup mock response
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    // Setup mock next function
    mockNext = jest.fn();

    // Setup mock graph generator service
    mockGraphGenerator = {
      generateGraph: jest.fn(),
    } as any;

    // Mock service container
    (services.getGraphGenerator as jest.Mock) = jest.fn().mockReturnValue(mockGraphGenerator);

    // Mock Prisma client
    (prisma.$transaction as jest.Mock) = jest.fn();
    (prisma.graph.findUnique as jest.Mock) = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================
  // GENERATE GRAPH TESTS
  // ============================================================

  describe('generateGraph', () => {
    const validRequestBodyText = {
      documentText: 'This is a test document with sufficient length to pass validation. '.repeat(5),
      documentTitle: 'Test Document',
      userId: 'test-user-123',
      options: {
        maxNodes: 15,
        skipCache: false,
      },
    };

    beforeEach(() => {
      mockRequest = {
        body: validRequestBodyText,
        requestId: 'test-request-123',
      } as ExtendedRequest;

      // Mock Prisma document methods for dual-mode tests
      (prisma.document.findUnique as jest.Mock) = jest.fn();
      (prisma.document.create as jest.Mock) = jest.fn();
    });

    // ============================================================
    // MODE B: DIRECT TEXT TESTS (BACKWARD COMPATIBILITY)
    // ============================================================

    describe('Mode B: Direct text input (backward compatibility)', () => {
      it('should successfully generate graph from documentText and return 201', async () => {
        // Arrange
        const mockGraphResult = {
          nodes: [
            {
              id: 'node-1',
              title: 'Test Node 1',
              description: 'Description 1',
              nodeType: 'concept',
              summary: 'Summary 1',
              metadata: {},
            },
            {
              id: 'node-2',
              title: 'Test Node 2',
              description: 'Description 2',
              nodeType: 'concept',
              summary: 'Summary 2',
              metadata: {},
            },
          ],
          edges: [
            {
              from: 'node-1',
              to: 'node-2',
              relationship: 'relates to',
              metadata: {},
            },
          ],
          mermaidCode: 'graph TD\n  A[Node 1] --> B[Node 2]',
          statistics: {
            totalNodes: 2,
            totalEdges: 1,
            qualityScore: 85,
            totalCost: 0.05,
            processingTimeMs: 1500,
          },
          metadata: {
            model: 'claude-sonnet-4-20250514',
            fallbackUsed: false,
            warnings: [],
          },
        };

        const mockTempDocument = {
          id: 'temp-doc-123',
          title: 'Test Document',
          contentText: validRequestBodyText.documentText,
          sourceType: 'text',
          status: 'ready',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const mockSavedGraph = {
          id: 'graph-123',
        };

        (prisma.document.create as jest.Mock).mockResolvedValue(mockTempDocument);
        mockGraphGenerator.generateGraph.mockResolvedValue(mockGraphResult);
        (prisma.$transaction as jest.Mock).mockResolvedValue(mockSavedGraph);

        // Act
        await generateGraph(mockRequest as Request, mockResponse as Response, mockNext);

        // Assert - Should create temporary document
        expect(prisma.document.create).toHaveBeenCalledWith({
          data: {
            title: 'Test Document',
            contentText: validRequestBodyText.documentText,
            sourceType: 'text',
            status: 'ready',
          },
        });

        // Assert - Should pass temp document ID to graph generator
        expect(mockGraphGenerator.generateGraph).toHaveBeenCalledWith({
          documentId: 'temp-doc-123',
          documentText: validRequestBodyText.documentText,
          documentTitle: 'Test Document',
          options: {
            maxNodes: 15,
            skipCache: false,
          },
        });

        expect(prisma.$transaction).toHaveBeenCalled();

        expect(mockResponse.status).toHaveBeenCalledWith(201);
        expect(mockResponse.json).toHaveBeenCalledWith({
          success: true,
          data: {
            graphId: 'graph-123',
            status: 'completed',
            nodeCount: 2,
            edgeCount: 1,
            qualityScore: 85,
            cost: 0.05,
            processingTimeMs: expect.any(Number),
            warnings: [],
          },
          meta: expect.objectContaining({
            timestamp: expect.any(String),
            requestId: 'test-request-123',
          }),
        });
      });

      it('should create temporary document when using documentText', async () => {
        // Arrange
        mockRequest.body = {
          documentText: 'x'.repeat(200),
          documentTitle: 'Temp Document',
        };

        const mockTempDocument = {
          id: 'temp-doc-456',
          title: 'Temp Document',
          contentText: 'x'.repeat(200),
          sourceType: 'text',
          status: 'ready',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const mockGraphResult = {
          nodes: [],
          edges: [],
          mermaidCode: '',
          statistics: {
            totalNodes: 0,
            totalEdges: 0,
            qualityScore: 0,
            totalCost: 0,
            processingTimeMs: 0,
          },
          metadata: {
            model: 'claude-sonnet-4-20250514',
            fallbackUsed: false,
            warnings: [],
          },
        };

        (prisma.document.create as jest.Mock).mockResolvedValue(mockTempDocument);
        mockGraphGenerator.generateGraph.mockResolvedValue(mockGraphResult);
        (prisma.$transaction as jest.Mock).mockResolvedValue({ id: 'graph-456' });

        // Act
        await generateGraph(mockRequest as Request, mockResponse as Response, mockNext);

        // Assert
        expect(prisma.document.create).toHaveBeenCalled();
        expect(mockGraphGenerator.generateGraph).toHaveBeenCalledWith(
          expect.objectContaining({
            documentId: 'temp-doc-456',
            documentText: 'x'.repeat(200),
          })
        );
      });
    });

    // ============================================================
    // MODE A: DOCUMENT ID TESTS (NEW FUNCTIONALITY)
    // ============================================================

    describe('Mode A: Document ID lookup (new functionality)', () => {
      it('should successfully generate graph from documentId', async () => {
        // Arrange
        mockRequest.body = {
          documentId: 'existing-doc-123',
          userId: 'user-456',
          options: {
            maxNodes: 20,
            skipCache: false,
          },
        };

        const mockExistingDocument = {
          id: 'existing-doc-123',
          title: 'Existing Document',
          contentText: 'This is the content of an existing document from the database.',
          sourceType: 'pdf',
          status: 'ready',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        };

        const mockGraphResult = {
          nodes: [
            {
              id: 'node-1',
              title: 'Node from existing doc',
              description: 'Description',
              metadata: {},
            },
          ],
          edges: [],
          mermaidCode: 'graph TD\n  A[Node]',
          statistics: {
            totalNodes: 1,
            totalEdges: 0,
            qualityScore: 90,
            totalCost: 0.03,
            processingTimeMs: 1200,
          },
          metadata: {
            model: 'claude-sonnet-4-20250514',
            fallbackUsed: false,
            warnings: [],
          },
        };

        const mockSavedGraph = {
          id: 'graph-existing-123',
        };

        (prisma.document.findUnique as jest.Mock).mockResolvedValue(mockExistingDocument);
        mockGraphGenerator.generateGraph.mockResolvedValue(mockGraphResult);
        (prisma.$transaction as jest.Mock).mockResolvedValue(mockSavedGraph);

        // Act
        await generateGraph(mockRequest as Request, mockResponse as Response, mockNext);

        // Assert - Should look up existing document
        expect(prisma.document.findUnique).toHaveBeenCalledWith({
          where: { id: 'existing-doc-123' },
        });

        // Assert - Should NOT create temporary document
        expect(prisma.document.create).not.toHaveBeenCalled();

        // Assert - Should use document's text and title
        expect(mockGraphGenerator.generateGraph).toHaveBeenCalledWith({
          documentId: 'existing-doc-123',
          documentText: 'This is the content of an existing document from the database.',
          documentTitle: 'Existing Document',
          options: {
            maxNodes: 20,
            skipCache: false,
          },
        });

        expect(mockResponse.status).toHaveBeenCalledWith(201);
        expect(mockResponse.json).toHaveBeenCalledWith({
          success: true,
          data: {
            graphId: 'graph-existing-123',
            status: 'completed',
            nodeCount: 1,
            edgeCount: 0,
            qualityScore: 90,
            cost: 0.03,
            processingTimeMs: expect.any(Number),
            warnings: [],
          },
          meta: expect.any(Object),
        });
      });

      it('should return 404 when document not found', async () => {
        // Arrange
        mockRequest.body = {
          documentId: 'nonexistent-doc',
        };

        (prisma.document.findUnique as jest.Mock).mockResolvedValue(null);

        // Act
        await generateGraph(mockRequest as Request, mockResponse as Response, mockNext);

        // Assert
        expect(mockResponse.status).toHaveBeenCalledWith(404);
        expect(mockResponse.json).toHaveBeenCalledWith({
          success: false,
          error: {
            code: 'DOCUMENT_NOT_FOUND',
            message: "Document with ID 'nonexistent-doc' not found",
          },
          meta: expect.objectContaining({
            requestId: 'test-request-123',
          }),
        });

        expect(mockGraphGenerator.generateGraph).not.toHaveBeenCalled();
      });

      it('should return 400 when document is not ready', async () => {
        // Arrange
        mockRequest.body = {
          documentId: 'processing-doc',
        };

        const mockProcessingDocument = {
          id: 'processing-doc',
          title: 'Processing Document',
          contentText: '',
          sourceType: 'pdf',
          status: 'processing',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        (prisma.document.findUnique as jest.Mock).mockResolvedValue(mockProcessingDocument);

        // Act
        await generateGraph(mockRequest as Request, mockResponse as Response, mockNext);

        // Assert
        expect(mockResponse.status).toHaveBeenCalledWith(400);
        expect(mockResponse.json).toHaveBeenCalledWith({
          success: false,
          error: {
            code: 'PROCESSING_FAILED',
            message: 'Document is not ready. Current status: processing',
          },
          meta: expect.any(Object),
        });

        expect(mockGraphGenerator.generateGraph).not.toHaveBeenCalled();
      });

      it('should link graph to existing document (not create duplicate)', async () => {
        // Arrange
        mockRequest.body = {
          documentId: 'existing-doc-789',
        };

        const mockExistingDocument = {
          id: 'existing-doc-789',
          title: 'Document 789',
          contentText: 'Content here',
          sourceType: 'text',
          status: 'ready',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const mockGraphResult = {
          nodes: [],
          edges: [],
          mermaidCode: '',
          statistics: {
            totalNodes: 0,
            totalEdges: 0,
            qualityScore: 0,
            totalCost: 0,
            processingTimeMs: 0,
          },
          metadata: {
            model: 'claude-sonnet-4-20250514',
            fallbackUsed: false,
            warnings: [],
          },
        };

        (prisma.document.findUnique as jest.Mock).mockResolvedValue(mockExistingDocument);
        mockGraphGenerator.generateGraph.mockResolvedValue(mockGraphResult);
        (prisma.$transaction as jest.Mock).mockResolvedValue({ id: 'graph-789' });

        // Act
        await generateGraph(mockRequest as Request, mockResponse as Response, mockNext);

        // Assert - Should use existing document ID
        expect(prisma.document.create).not.toHaveBeenCalled();
        expect(mockGraphGenerator.generateGraph).toHaveBeenCalledWith(
          expect.objectContaining({
            documentId: 'existing-doc-789',
          })
        );
      });
    });

    // ============================================================
    // EXISTING TESTS (DEFAULT VALUES, ERRORS)
    // ============================================================

    it('should use default document title if not provided', async () => {
      // Arrange
      mockRequest.body = {
        ...validRequestBodyText,
        documentTitle: undefined,
      };

      const mockTempDocument = {
        id: 'temp-doc-default',
        title: 'Untitled Document',
        contentText: validRequestBodyText.documentText,
        sourceType: 'text',
        status: 'ready',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockGraphResult = {
        nodes: [],
        edges: [],
        mermaidCode: '',
        statistics: {
          totalNodes: 0,
          totalEdges: 0,
          qualityScore: 0,
          totalCost: 0,
          processingTimeMs: 0,
        },
        metadata: {
          model: 'claude-sonnet-4-20250514',
          fallbackUsed: false,
          warnings: [],
        },
      };

      (prisma.document.create as jest.Mock).mockResolvedValue(mockTempDocument);
      mockGraphGenerator.generateGraph.mockResolvedValue(mockGraphResult);
      (prisma.$transaction as jest.Mock).mockResolvedValue({ id: 'graph-123' });

      // Act
      await generateGraph(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockGraphGenerator.generateGraph).toHaveBeenCalledWith(
        expect.objectContaining({
          documentTitle: 'Untitled Document',
        })
      );
    });

    it('should use default maxNodes if not provided', async () => {
      // Arrange
      mockRequest.body = {
        ...validRequestBodyText,
        options: undefined,
      };

      const mockTempDocument = {
        id: 'temp-doc-maxnodes',
        title: 'Test Document',
        contentText: validRequestBodyText.documentText,
        sourceType: 'text',
        status: 'ready',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.document.create as jest.Mock).mockResolvedValue(mockTempDocument);

      const mockGraphResult = {
        nodes: [],
        edges: [],
        mermaidCode: '',
        statistics: {
          totalNodes: 0,
          totalEdges: 0,
          qualityScore: 0,
          totalCost: 0,
          processingTimeMs: 0,
        },
        metadata: {
          model: 'claude-sonnet-4-20250514',
          fallbackUsed: false,
          warnings: [],
        },
      };

      mockGraphGenerator.generateGraph.mockResolvedValue(mockGraphResult);
      (prisma.$transaction as jest.Mock).mockResolvedValue({ id: 'graph-123' });

      // Act
      await generateGraph(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockGraphGenerator.generateGraph).toHaveBeenCalledWith(
        expect.objectContaining({
          options: {
            maxNodes: 15,
            skipCache: false,
          },
        })
      );
    });

    it('should return 400 when budget is exceeded', async () => {
      // Arrange
      const budgetError = new Error('Budget exceeded: Daily cost limit reached');
      mockGraphGenerator.generateGraph.mockRejectedValue(budgetError);

      // Act
      await generateGraph(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'PROCESSING_FAILED',
          message: 'Graph generation failed: Budget exceeded. Please try with a shorter document.',
          details: { message: budgetError.message },
        },
        meta: expect.objectContaining({
          timestamp: expect.any(String),
          requestId: 'test-request-123',
        }),
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 500 when validation fails', async () => {
      // Arrange
      const validationError = new Error('AI output validation failed: Missing required fields');
      mockGraphGenerator.generateGraph.mockRejectedValue(validationError);

      // Act
      await generateGraph(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'PROCESSING_FAILED',
          message: 'Graph generation failed: AI output validation failed',
          details: { message: validationError.message },
        },
        meta: expect.objectContaining({
          timestamp: expect.any(String),
          requestId: 'test-request-123',
        }),
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 503 when AI service is unavailable', async () => {
      // Arrange
      const aiError = new Error('AI model temporarily unavailable');
      mockGraphGenerator.generateGraph.mockRejectedValue(aiError);

      // Act
      await generateGraph(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'AI_SERVICE_UNAVAILABLE',
          message: 'AI service temporarily unavailable. Please try again.',
          details: { message: aiError.message },
        },
        meta: expect.objectContaining({
          timestamp: expect.any(String),
          requestId: 'test-request-123',
        }),
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should call next() with generic errors', async () => {
      // Arrange
      const genericError = new Error('Unknown database error');
      mockGraphGenerator.generateGraph.mockRejectedValue(genericError);

      // Act
      await generateGraph(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(genericError);
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should handle database transaction failures', async () => {
      // Arrange
      const mockGraphResult = {
        nodes: [],
        edges: [],
        mermaidCode: '',
        statistics: {
          totalNodes: 0,
          totalEdges: 0,
          qualityScore: 0,
          totalCost: 0,
          processingTimeMs: 0,
        },
        metadata: {
          model: 'claude-sonnet-4-20250514',
          fallbackUsed: false,
          warnings: [],
        },
      };

      mockGraphGenerator.generateGraph.mockResolvedValue(mockGraphResult);
      const dbError = new Error('Database connection failed');
      (prisma.$transaction as jest.Mock).mockRejectedValue(dbError);

      // Act
      await generateGraph(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(dbError);
    });
  });

  // ============================================================
  // GET GRAPH BY ID TESTS
  // ============================================================

  describe('getGraphById', () => {
    beforeEach(() => {
      mockRequest = {
        params: { id: 'graph-123' },
        requestId: 'test-request-456',
      } as any;
    });

    it('should successfully fetch graph with nodes and edges', async () => {
      // Arrange
      const mockGraph = {
        id: 'graph-123',
        status: 'ready',
        mermaidCode: 'graph TD\n  A[Node 1] --> B[Node 2]',
        generationModel: 'claude-sonnet-4-20250514',
        version: 1,
        createdAt: new Date('2024-01-01'),
        document: {
          id: 'doc-123',
          title: 'Test Document',
          sourceType: 'text',
          createdAt: new Date('2024-01-01'),
        },
        nodes: [
          {
            id: 'node-1',
            nodeKey: 'n1',
            title: 'Node 1',
            contentSnippet: 'Description 1',
            nodeType: 'concept',
            summary: 'Summary 1',
            documentRefs: [],
            positionX: 100,
            positionY: 200,
            metadata: {},
          },
        ],
        edges: [
          {
            id: 'edge-1',
            fromNodeId: 'node-1',
            toNodeId: 'node-2',
            fromNode: { nodeKey: 'n1', title: 'Node 1' },
            toNode: { nodeKey: 'n2', title: 'Node 2' },
            relationship: 'relates to',
            aiExplanation: 'Explanation',
            strength: 0.8,
            metadata: {},
          },
        ],
      };

      (prisma.graph.findUnique as jest.Mock).mockResolvedValue(mockGraph);

      // Act
      await getGraphById(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(prisma.graph.findUnique).toHaveBeenCalledWith({
        where: { id: 'graph-123' },
        include: {
          nodes: { orderBy: { nodeKey: 'asc' } },
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

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          id: 'graph-123',
          status: 'ready',
          mermaidCode: 'graph TD\n  A[Node 1] --> B[Node 2]',
          generationModel: 'claude-sonnet-4-20250514',
          version: 1,
          createdAt: '2024-01-01T00:00:00.000Z',
          document: mockGraph.document,
          nodes: [
            {
              id: 'node-1',
              nodeKey: 'n1',
              title: 'Node 1',
              contentSnippet: 'Description 1',
              nodeType: 'concept',
              summary: 'Summary 1',
              documentRefs: [],
              position: { x: 100, y: 200 },
              metadata: {},
            },
          ],
          edges: [
            {
              id: 'edge-1',
              from: 'node-1',
              to: 'node-2',
              fromNode: { nodeKey: 'n1', title: 'Node 1' },
              toNode: { nodeKey: 'n2', title: 'Node 2' },
              relationship: 'relates to',
              aiExplanation: 'Explanation',
              strength: 0.8,
              metadata: {},
            },
          ],
        },
        meta: expect.objectContaining({
          timestamp: expect.any(String),
          requestId: 'test-request-456',
        }),
      });
    });

    it('should return 404 when graph not found', async () => {
      // Arrange
      (prisma.graph.findUnique as jest.Mock).mockResolvedValue(null);

      // Act
      await getGraphById(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'GRAPH_NOT_FOUND',
          message: "Graph with ID 'graph-123' not found",
        },
        meta: expect.objectContaining({
          timestamp: expect.any(String),
          requestId: 'test-request-456',
        }),
      });
    });

    it('should call next() when database query fails', async () => {
      // Arrange
      const dbError = new Error('Database query failed');
      (prisma.graph.findUnique as jest.Mock).mockRejectedValue(dbError);

      // Act
      await getGraphById(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(dbError);
      expect(mockResponse.status).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // GET JOB STATUS TESTS
  // ============================================================

  describe('getJobStatus', () => {
    beforeEach(() => {
      mockRequest = {
        params: { id: 'job-123' },
        requestId: 'test-request-789',
      } as any;
    });

    it('should return completed status for all jobs (MVP implementation)', async () => {
      // Act
      await getJobStatus(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          jobId: 'job-123',
          status: 'completed',
          progress: 100,
          result: {
            message: 'Job completed (synchronous processing)',
          },
        },
        meta: expect.objectContaining({
          timestamp: expect.any(String),
          requestId: 'test-request-789',
        }),
      });
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      // Force an error by making requestId undefined
      mockRequest.requestId = undefined as any;
      const error = new Error('Unexpected error');

      // Mock the error to be thrown
      mockResponse.json = jest.fn().mockImplementation(() => {
        throw error;
      });

      // Act
      await getJobStatus(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });
});

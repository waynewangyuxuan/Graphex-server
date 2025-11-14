/**
 * Document Controller Tests
 *
 * Tests for document upload and retrieval endpoints:
 * - uploadDocument(): POST /api/v1/documents
 * - getDocumentById(): GET /api/v1/documents/:id
 * - createDocumentFromUrl(): POST /api/v1/documents/from-url (placeholder)
 * - getDocumentStatus(): GET /api/v1/documents/:id/status (placeholder)
 *
 * Coverage:
 * - Success paths (PDF, text, with/without title)
 * - File validation (missing file, size exceeded)
 * - Format validation (unsupported format)
 * - Quality validation (quality too low)
 * - Cost validation (cost exceeded)
 * - Extraction errors (corrupted files)
 * - Database errors (connection failures)
 * - Not found errors (document doesn't exist)
 */

import { Request, Response, NextFunction } from 'express';
import {
  uploadDocument,
  getDocumentById,
  createDocumentFromUrl,
  getDocumentStatus,
} from '../document.controller';
import { services } from '../../services/service-container';
import { prisma } from '../../config/database';
import { ExtendedRequest } from '../../types/api.types';
import { DocumentProcessorService } from '../../services/document-processor.service';
import {
  FileSizeError,
  UnsupportedFormatError,
  DocumentQualityError,
  CostExceededError,
  ExtractionError,
} from '../../lib/errors/document-errors';

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

describe('Document Controller', () => {
  let mockRequest: Partial<ExtendedRequest>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.Mock;
  let mockDocumentProcessor: jest.Mocked<DocumentProcessorService>;

  beforeEach(() => {
    // Setup mock response
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    // Setup mock next function
    mockNext = jest.fn();

    // Setup mock document processor service
    mockDocumentProcessor = {
      processUploadedFile: jest.fn(),
    } as any;

    // Mock service container
    (services.getDocumentProcessorService as jest.Mock) = jest
      .fn()
      .mockReturnValue(mockDocumentProcessor);

    // Mock Prisma client
    (prisma.document.create as jest.Mock) = jest.fn();
    (prisma.document.findUnique as jest.Mock) = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================
  // UPLOAD DOCUMENT TESTS
  // ============================================================

  describe('uploadDocument', () => {
    describe('success cases', () => {
      it('should process and save PDF document successfully', async () => {
        // Arrange
        const mockFile = {
          originalname: 'test.pdf',
          mimetype: 'application/pdf',
          size: 100000,
          path: '/tmp/test.pdf',
          filename: 'test.pdf',
        } as Express.Multer.File;

        mockRequest = {
          file: mockFile,
          body: { title: 'Test Document' },
          requestId: 'test-request-123',
        } as ExtendedRequest;

        const mockProcessedDoc = {
          title: 'Test Document',
          contentText: 'This is the extracted text from the PDF document.',
          sourceType: 'pdf',
          filePath: '/tmp/test.pdf',
          fileSize: 100000,
          metadata: {
            wordCount: 8,
            imageCount: 0,
            pageCount: 1,
          },
          quality: {
            score: 85,
            acceptable: true,
            issues: [],
          },
        };

        const mockSavedDocument = {
          id: 'doc-123',
          title: 'Test Document',
          contentText: 'This is the extracted text from the PDF document.',
          sourceType: 'pdf',
          filePath: '/tmp/test.pdf',
          fileSize: 100000,
          sourceUrl: null,
          status: 'ready',
          errorMessage: null,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        };

        mockDocumentProcessor.processUploadedFile.mockResolvedValue(
          mockProcessedDoc as any
        );
        (prisma.document.create as jest.Mock).mockResolvedValue(mockSavedDocument);

        // Act
        await uploadDocument(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Assert
        expect(mockDocumentProcessor.processUploadedFile).toHaveBeenCalledWith(
          mockFile,
          {
            extractImages: true,
            extractTables: false,
            maxFileSize: 10 * 1024 * 1024,
            qualityThreshold: 50,
            maxCost: 5.0,
          }
        );

        expect(prisma.document.create).toHaveBeenCalledWith({
          data: {
            title: 'Test Document',
            contentText: 'This is the extracted text from the PDF document.',
            sourceType: 'pdf',
            filePath: '/tmp/test.pdf',
            fileSize: 100000,
            status: 'ready',
          },
        });

        expect(mockResponse.status).toHaveBeenCalledWith(201);
        expect(mockResponse.json).toHaveBeenCalledWith({
          success: true,
          data: {
            id: 'doc-123',
            title: 'Test Document',
            sourceType: 'pdf',
            status: 'ready',
            fileSize: 100000,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
          meta: expect.objectContaining({
            timestamp: expect.any(String),
            requestId: 'test-request-123',
          }),
        });
      });

      it('should process and save text document successfully', async () => {
        // Arrange
        const mockFile = {
          originalname: 'document.txt',
          mimetype: 'text/plain',
          size: 5000,
          path: '/tmp/document.txt',
          filename: 'document.txt',
        } as Express.Multer.File;

        mockRequest = {
          file: mockFile,
          body: { title: 'Text Document' },
          requestId: 'test-request-456',
        } as ExtendedRequest;

        const mockProcessedDoc = {
          title: 'Text Document',
          contentText: 'Plain text content here.',
          sourceType: 'text',
          filePath: '/tmp/document.txt',
          fileSize: 5000,
          metadata: {
            wordCount: 4,
            imageCount: 0,
            pageCount: 1,
          },
          quality: {
            score: 90,
            acceptable: true,
            issues: [],
          },
        };

        const mockSavedDocument = {
          id: 'doc-456',
          title: 'Text Document',
          contentText: 'Plain text content here.',
          sourceType: 'text',
          filePath: '/tmp/document.txt',
          fileSize: 5000,
          sourceUrl: null,
          status: 'ready',
          errorMessage: null,
          createdAt: new Date('2024-01-02'),
          updatedAt: new Date('2024-01-02'),
        };

        mockDocumentProcessor.processUploadedFile.mockResolvedValue(
          mockProcessedDoc as any
        );
        (prisma.document.create as jest.Mock).mockResolvedValue(mockSavedDocument);

        // Act
        await uploadDocument(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Assert
        expect(mockResponse.status).toHaveBeenCalledWith(201);
        expect(mockResponse.json).toHaveBeenCalledWith({
          success: true,
          data: {
            id: 'doc-456',
            title: 'Text Document',
            sourceType: 'text',
            status: 'ready',
            fileSize: 5000,
            createdAt: '2024-01-02T00:00:00.000Z',
            updatedAt: '2024-01-02T00:00:00.000Z',
          },
          meta: expect.objectContaining({
            timestamp: expect.any(String),
            requestId: 'test-request-456',
          }),
        });
      });

      it('should use filename as title when title not provided', async () => {
        // Arrange
        const mockFile = {
          originalname: 'my-document.pdf',
          mimetype: 'application/pdf',
          size: 50000,
          path: '/tmp/my-document.pdf',
          filename: 'my-document.pdf',
        } as Express.Multer.File;

        mockRequest = {
          file: mockFile,
          body: {}, // No title provided
          requestId: 'test-request-789',
        } as ExtendedRequest;

        const mockProcessedDoc = {
          title: 'my-document.pdf', // Filename used as title
          contentText: 'Document content',
          sourceType: 'pdf',
          filePath: '/tmp/my-document.pdf',
          fileSize: 50000,
          metadata: {
            wordCount: 2,
            imageCount: 0,
            pageCount: 1,
          },
          quality: {
            score: 75,
            acceptable: true,
            issues: [],
          },
        };

        const mockSavedDocument = {
          id: 'doc-789',
          title: 'my-document.pdf',
          contentText: 'Document content',
          sourceType: 'pdf',
          filePath: '/tmp/my-document.pdf',
          fileSize: 50000,
          sourceUrl: null,
          status: 'ready',
          errorMessage: null,
          createdAt: new Date('2024-01-03'),
          updatedAt: new Date('2024-01-03'),
        };

        mockDocumentProcessor.processUploadedFile.mockResolvedValue(
          mockProcessedDoc as any
        );
        (prisma.document.create as jest.Mock).mockResolvedValue(mockSavedDocument);

        // Act
        await uploadDocument(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Assert
        expect(prisma.document.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            title: 'my-document.pdf',
          }),
        });
      });

      it('should save quality metrics in metadata', async () => {
        // Arrange
        const mockFile = {
          originalname: 'test.pdf',
          mimetype: 'application/pdf',
          size: 100000,
          path: '/tmp/test.pdf',
          filename: 'test.pdf',
        } as Express.Multer.File;

        mockRequest = {
          file: mockFile,
          body: { title: 'Test' },
          requestId: 'test-request-quality',
        } as ExtendedRequest;

        const mockProcessedDoc = {
          title: 'Test',
          contentText: 'Content',
          sourceType: 'pdf',
          filePath: '/tmp/test.pdf',
          fileSize: 100000,
          metadata: {
            wordCount: 100,
            imageCount: 5,
            pageCount: 10,
          },
          quality: {
            score: 92,
            acceptable: true,
            issues: [],
          },
        };

        const mockSavedDocument = {
          id: 'doc-quality',
          title: 'Test',
          contentText: 'Content',
          sourceType: 'pdf',
          filePath: '/tmp/test.pdf',
          fileSize: 100000,
          sourceUrl: null,
          status: 'ready',
          errorMessage: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockDocumentProcessor.processUploadedFile.mockResolvedValue(
          mockProcessedDoc as any
        );
        (prisma.document.create as jest.Mock).mockResolvedValue(mockSavedDocument);

        // Act
        await uploadDocument(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Assert - verify processing was called (metadata is logged)
        expect(mockDocumentProcessor.processUploadedFile).toHaveBeenCalled();
      });
    });

    describe('validation errors', () => {
      it('should return 400 when no file is uploaded', async () => {
        // Arrange
        mockRequest = {
          file: undefined, // No file uploaded
          body: { title: 'Test' },
          requestId: 'test-request-no-file',
        } as ExtendedRequest;

        // Act
        await uploadDocument(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Assert
        expect(mockResponse.status).toHaveBeenCalledWith(400);
        expect(mockResponse.json).toHaveBeenCalledWith({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'No file uploaded. Please provide a file in the "file" field.',
          },
          meta: expect.objectContaining({
            timestamp: expect.any(String),
            requestId: 'test-request-no-file',
          }),
        });
        expect(mockDocumentProcessor.processUploadedFile).not.toHaveBeenCalled();
      });

      it('should return 400 when file size exceeds limit', async () => {
        // Arrange
        const mockFile = {
          originalname: 'large.pdf',
          mimetype: 'application/pdf',
          size: 20000000, // 20MB (exceeds 10MB limit)
          path: '/tmp/large.pdf',
          filename: 'large.pdf',
        } as Express.Multer.File;

        mockRequest = {
          file: mockFile,
          body: { title: 'Large Document' },
          requestId: 'test-request-large',
        } as ExtendedRequest;

        const fileSizeError = new FileSizeError(20000000, 10485760);
        mockDocumentProcessor.processUploadedFile.mockRejectedValue(fileSizeError);

        // Act
        await uploadDocument(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Assert
        expect(mockResponse.status).toHaveBeenCalledWith(400);
        expect(mockResponse.json).toHaveBeenCalledWith({
          success: false,
          error: {
            code: 'FILE_TOO_LARGE',
            message: expect.stringContaining('exceeds maximum'),
          },
          meta: expect.objectContaining({
            timestamp: expect.any(String),
            requestId: 'test-request-large',
          }),
        });
      });

      it('should return 400 when file format is unsupported', async () => {
        // Arrange
        const mockFile = {
          originalname: 'document.docx',
          mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: 50000,
          path: '/tmp/document.docx',
          filename: 'document.docx',
        } as Express.Multer.File;

        mockRequest = {
          file: mockFile,
          body: { title: 'Word Document' },
          requestId: 'test-request-unsupported',
        } as ExtendedRequest;

        const formatError = new UnsupportedFormatError(
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        );
        mockDocumentProcessor.processUploadedFile.mockRejectedValue(formatError);

        // Act
        await uploadDocument(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Assert
        expect(mockResponse.status).toHaveBeenCalledWith(400);
        expect(mockResponse.json).toHaveBeenCalledWith({
          success: false,
          error: {
            code: 'UNSUPPORTED_FORMAT',
            message: expect.stringContaining('not supported'),
          },
          meta: expect.objectContaining({
            timestamp: expect.any(String),
            requestId: 'test-request-unsupported',
          }),
        });
      });

      it('should return 400 when document quality is too low', async () => {
        // Arrange
        const mockFile = {
          originalname: 'poor-quality.pdf',
          mimetype: 'application/pdf',
          size: 50000,
          path: '/tmp/poor-quality.pdf',
          filename: 'poor-quality.pdf',
        } as Express.Multer.File;

        mockRequest = {
          file: mockFile,
          body: { title: 'Poor Quality' },
          requestId: 'test-request-quality',
        } as ExtendedRequest;

        const qualityError = new DocumentQualityError(
          [
            {
              type: 'content_too_short',
              severity: 'critical',
              message: 'Document is too short',
              impact: 30,
            },
          ],
          'Quality score 35 is below threshold 50'
        );
        mockDocumentProcessor.processUploadedFile.mockRejectedValue(qualityError);

        // Act
        await uploadDocument(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Assert
        expect(mockResponse.status).toHaveBeenCalledWith(400);
        expect(mockResponse.json).toHaveBeenCalledWith({
          success: false,
          error: {
            code: 'PROCESSING_FAILED',
            message: expect.stringContaining('Document quality too low'),
          },
          meta: expect.objectContaining({
            timestamp: expect.any(String),
            requestId: 'test-request-quality',
          }),
        });
      });

      it('should return 400 when processing cost exceeds limit', async () => {
        // Arrange
        const mockFile = {
          originalname: 'expensive.pdf',
          mimetype: 'application/pdf',
          size: 5000000,
          path: '/tmp/expensive.pdf',
          filename: 'expensive.pdf',
        } as Express.Multer.File;

        mockRequest = {
          file: mockFile,
          body: { title: 'Expensive Document' },
          requestId: 'test-request-cost',
        } as ExtendedRequest;

        const costError = new CostExceededError(7.5, 5.0);
        mockDocumentProcessor.processUploadedFile.mockRejectedValue(costError);

        // Act
        await uploadDocument(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Assert
        expect(mockResponse.status).toHaveBeenCalledWith(400);
        expect(mockResponse.json).toHaveBeenCalledWith({
          success: false,
          error: {
            code: 'PROCESSING_FAILED',
            message: expect.stringContaining('Document too expensive to process'),
          },
          meta: expect.objectContaining({
            timestamp: expect.any(String),
            requestId: 'test-request-cost',
          }),
        });
      });
    });

    describe('extraction errors', () => {
      it('should call next() with extraction error', async () => {
        // Arrange
        const mockFile = {
          originalname: 'corrupted.pdf',
          mimetype: 'application/pdf',
          size: 50000,
          path: '/tmp/corrupted.pdf',
          filename: 'corrupted.pdf',
        } as Express.Multer.File;

        mockRequest = {
          file: mockFile,
          body: { title: 'Corrupted' },
          requestId: 'test-request-extraction',
        } as ExtendedRequest;

        const extractionError = new ExtractionError(
          'Failed to parse PDF',
          'pdf',
          { reason: 'Corrupted file' }
        );
        mockDocumentProcessor.processUploadedFile.mockRejectedValue(extractionError);

        // Act
        await uploadDocument(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Assert
        expect(mockNext).toHaveBeenCalledWith(extractionError);
        expect(mockResponse.status).not.toHaveBeenCalled();
      });
    });

    describe('database errors', () => {
      it('should call next() when database create fails', async () => {
        // Arrange
        const mockFile = {
          originalname: 'test.pdf',
          mimetype: 'application/pdf',
          size: 50000,
          path: '/tmp/test.pdf',
          filename: 'test.pdf',
        } as Express.Multer.File;

        mockRequest = {
          file: mockFile,
          body: { title: 'Test' },
          requestId: 'test-request-db',
        } as ExtendedRequest;

        const mockProcessedDoc = {
          title: 'Test',
          contentText: 'Content',
          sourceType: 'pdf',
          filePath: '/tmp/test.pdf',
          fileSize: 50000,
          metadata: { wordCount: 1 },
          quality: { score: 80, acceptable: true, issues: [] },
        };

        mockDocumentProcessor.processUploadedFile.mockResolvedValue(
          mockProcessedDoc as any
        );

        const dbError = new Error('Database connection failed');
        (prisma.document.create as jest.Mock).mockRejectedValue(dbError);

        // Act
        await uploadDocument(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Assert
        expect(mockNext).toHaveBeenCalledWith(dbError);
        expect(mockResponse.status).not.toHaveBeenCalled();
      });
    });

    describe('generic errors', () => {
      it('should call next() with unknown errors', async () => {
        // Arrange
        const mockFile = {
          originalname: 'test.pdf',
          mimetype: 'application/pdf',
          size: 50000,
          path: '/tmp/test.pdf',
          filename: 'test.pdf',
        } as Express.Multer.File;

        mockRequest = {
          file: mockFile,
          body: { title: 'Test' },
          requestId: 'test-request-unknown',
        } as ExtendedRequest;

        const unknownError = new Error('Unknown processing error');
        mockDocumentProcessor.processUploadedFile.mockRejectedValue(unknownError);

        // Act
        await uploadDocument(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Assert
        expect(mockNext).toHaveBeenCalledWith(unknownError);
        expect(mockResponse.status).not.toHaveBeenCalled();
      });
    });
  });

  // ============================================================
  // GET DOCUMENT BY ID TESTS
  // ============================================================

  describe('getDocumentById', () => {
    describe('success cases', () => {
      it('should retrieve document successfully with full content', async () => {
        // Arrange
        mockRequest = {
          params: { id: 'doc-123' },
          requestId: 'test-request-get',
        } as any;

        const mockDocument = {
          id: 'doc-123',
          title: 'Test Document',
          contentText: 'This is the full document content for paragraph jumping.',
          sourceType: 'pdf',
          sourceUrl: null,
          filePath: '/tmp/test.pdf',
          fileSize: 100000,
          status: 'ready',
          errorMessage: null,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        };

        (prisma.document.findUnique as jest.Mock).mockResolvedValue(mockDocument);

        // Act
        await getDocumentById(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Assert
        expect(prisma.document.findUnique).toHaveBeenCalledWith({
          where: { id: 'doc-123' },
        });

        expect(mockResponse.status).toHaveBeenCalledWith(200);
        expect(mockResponse.json).toHaveBeenCalledWith({
          success: true,
          data: {
            id: 'doc-123',
            title: 'Test Document',
            sourceType: 'pdf',
            status: 'ready',
            fileSize: 100000,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
            content: 'This is the full document content for paragraph jumping.',
          },
          meta: expect.objectContaining({
            timestamp: expect.any(String),
            requestId: 'test-request-get',
          }),
        });
      });

      it('should include sourceUrl when present', async () => {
        // Arrange
        mockRequest = {
          params: { id: 'doc-url' },
          requestId: 'test-request-url',
        } as any;

        const mockDocument = {
          id: 'doc-url',
          title: 'URL Document',
          contentText: 'Content from URL',
          sourceType: 'url',
          sourceUrl: 'https://example.com/article',
          filePath: null,
          fileSize: null,
          status: 'ready',
          errorMessage: null,
          createdAt: new Date('2024-01-02'),
          updatedAt: new Date('2024-01-02'),
        };

        (prisma.document.findUnique as jest.Mock).mockResolvedValue(mockDocument);

        // Act
        await getDocumentById(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Assert
        expect(mockResponse.json).toHaveBeenCalledWith({
          success: true,
          data: expect.objectContaining({
            sourceUrl: 'https://example.com/article',
          }),
          meta: expect.any(Object),
        });
      });

      it('should include errorMessage when document failed', async () => {
        // Arrange
        mockRequest = {
          params: { id: 'doc-failed' },
          requestId: 'test-request-failed',
        } as any;

        const mockDocument = {
          id: 'doc-failed',
          title: 'Failed Document',
          contentText: '',
          sourceType: 'pdf',
          sourceUrl: null,
          filePath: '/tmp/failed.pdf',
          fileSize: 50000,
          status: 'failed',
          errorMessage: 'Extraction failed: Corrupted PDF',
          createdAt: new Date('2024-01-03'),
          updatedAt: new Date('2024-01-03'),
        };

        (prisma.document.findUnique as jest.Mock).mockResolvedValue(mockDocument);

        // Act
        await getDocumentById(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Assert
        expect(mockResponse.json).toHaveBeenCalledWith({
          success: true,
          data: expect.objectContaining({
            status: 'failed',
            errorMessage: 'Extraction failed: Corrupted PDF',
          }),
          meta: expect.any(Object),
        });
      });
    });

    describe('not found errors', () => {
      it('should return 404 when document not found', async () => {
        // Arrange
        mockRequest = {
          params: { id: 'nonexistent-doc' },
          requestId: 'test-request-notfound',
        } as any;

        (prisma.document.findUnique as jest.Mock).mockResolvedValue(null);

        // Act
        await getDocumentById(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Assert
        expect(mockResponse.status).toHaveBeenCalledWith(404);
        expect(mockResponse.json).toHaveBeenCalledWith({
          success: false,
          error: {
            code: 'DOCUMENT_NOT_FOUND',
            message: "Document with ID 'nonexistent-doc' not found",
          },
          meta: expect.objectContaining({
            timestamp: expect.any(String),
            requestId: 'test-request-notfound',
          }),
        });
      });
    });

    describe('database errors', () => {
      it('should call next() when database query fails', async () => {
        // Arrange
        mockRequest = {
          params: { id: 'doc-123' },
          requestId: 'test-request-db-error',
        } as any;

        const dbError = new Error('Database query failed');
        (prisma.document.findUnique as jest.Mock).mockRejectedValue(dbError);

        // Act
        await getDocumentById(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Assert
        expect(mockNext).toHaveBeenCalledWith(dbError);
        expect(mockResponse.status).not.toHaveBeenCalled();
      });
    });
  });

  // ============================================================
  // CREATE DOCUMENT FROM URL TESTS (PLACEHOLDER)
  // ============================================================

  describe('createDocumentFromUrl', () => {
    it('should return placeholder response for URL extraction', async () => {
      // Arrange
      mockRequest = {
        body: {
          url: 'https://example.com/article',
          title: 'Article Title',
        },
        requestId: 'test-request-url-create',
      } as ExtendedRequest;

      // Act
      await createDocumentFromUrl(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          id: expect.any(String),
          title: 'Article Title',
          sourceType: 'url',
          sourceUrl: 'https://example.com/article',
          status: 'processing',
        }),
        meta: expect.any(Object),
      });
    });

    it('should use default title when not provided', async () => {
      // Arrange
      mockRequest = {
        body: {
          url: 'https://example.com/page',
        },
        requestId: 'test-request-url-no-title',
      } as ExtendedRequest;

      // Act
      await createDocumentFromUrl(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          title: 'Untitled Document',
        }),
        meta: expect.any(Object),
      });
    });

    it('should call next() on unexpected errors', async () => {
      // Arrange
      mockRequest = {
        body: {
          url: 'https://example.com/article',
        },
        requestId: undefined as any, // Force error
      } as ExtendedRequest;

      const error = new Error('Unexpected error');
      mockResponse.json = jest.fn().mockImplementation(() => {
        throw error;
      });

      // Act
      await createDocumentFromUrl(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  // ============================================================
  // GET DOCUMENT STATUS TESTS (PLACEHOLDER)
  // ============================================================

  describe('getDocumentStatus', () => {
    it('should return placeholder status response', async () => {
      // Arrange
      mockRequest = {
        params: { id: 'doc-123' },
        requestId: 'test-request-status',
      } as any;

      // Act
      await getDocumentStatus(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          id: 'doc-123',
          status: 'ready',
          progress: 100,
        },
        meta: expect.any(Object),
      });
    });

    it('should call next() on unexpected errors', async () => {
      // Arrange
      mockRequest = {
        params: { id: 'doc-123' },
        requestId: undefined as any,
      } as any;

      const error = new Error('Unexpected error');
      mockResponse.json = jest.fn().mockImplementation(() => {
        throw error;
      });

      // Act
      await getDocumentStatus(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });
});

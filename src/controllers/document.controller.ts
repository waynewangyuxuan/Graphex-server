/**
 * Document Controller
 * Handles document upload, URL extraction, and document retrieval
 *
 * WHY: Separates HTTP handling from business logic, processes uploaded files,
 * and manages database operations for documents.
 *
 * Architecture: Controller → DocumentProcessorService → Database
 */

import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendError } from '../utils/response.util';
import { ExtendedRequest, ErrorCode } from '../types/api.types';
import { DocumentResponse, DocumentStatus, DocumentSourceType } from '../types/document.types';
import { services } from '../services/service-container';
import { prisma } from '../config/database';
import { logger } from '../utils/logger.util';

/**
 * Upload document file
 * POST /api/v1/documents
 *
 * Flow:
 * 1. Validate file upload (Multer middleware)
 * 2. Process file with DocumentProcessorService (extract text, images)
 * 3. Save to database with extracted content
 * 4. Return document ID and status
 *
 * WHY: Real implementation replaces placeholder with actual file processing
 */
export const uploadDocument = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const extReq = req as ExtendedRequest;
  const startTime = Date.now();

  try {
    // Check if file was uploaded
    if (!req.file) {
      return sendError(
        res,
        ErrorCode.INVALID_REQUEST,
        'No file uploaded. Please provide a file in the "file" field.',
        400,
        extReq.requestId
      );
    }

    logger.info('Processing uploaded document', {
      requestId: extReq.requestId,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
    });

    // Get DocumentProcessorService
    const documentProcessor = services.getDocumentProcessorService();

    // Process uploaded file (extract text, images, assess quality)
    const processedDoc = await documentProcessor.processUploadedFile(req.file, {
      extractImages: true,
      extractTables: false,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      qualityThreshold: 50,
      maxCost: 5.0, // $5 max
    });

    // Save to database
    const document = await prisma.document.create({
      data: {
        title: req.body.title || processedDoc.title,
        contentText: processedDoc.contentText,
        sourceType: processedDoc.sourceType as 'pdf' | 'text' | 'markdown' | 'url',
        filePath: processedDoc.filePath,
        fileSize: processedDoc.fileSize,
        status: 'ready',
      },
    });

    logger.info('Document uploaded and processed successfully', {
      requestId: extReq.requestId,
      documentId: document.id,
      title: document.title,
      wordCount: processedDoc.metadata.wordCount,
      imageCount: processedDoc.metadata.imageCount,
      qualityScore: processedDoc.quality.score,
      processingTimeMs: Date.now() - startTime,
    });

    // Return response
    const response: DocumentResponse = {
      id: document.id,
      title: document.title,
      sourceType: mapSourceType(document.sourceType),
      status: mapDocumentStatus(document.status),
      fileSize: document.fileSize || undefined,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
    };

    sendSuccess(res, response, 201, extReq.requestId);
  } catch (error) {
    logger.error('Document upload failed', {
      requestId: extReq.requestId,
      filename: req.file?.originalname,
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs: Date.now() - startTime,
    });

    // Handle specific error types
    if (error instanceof Error) {
      if (error.name === 'FileSizeError') {
        return sendError(
          res,
          ErrorCode.FILE_TOO_LARGE,
          error.message,
          400,
          extReq.requestId
        );
      }

      if (error.name === 'UnsupportedFormatError') {
        return sendError(
          res,
          ErrorCode.UNSUPPORTED_FORMAT,
          error.message,
          400,
          extReq.requestId
        );
      }

      if (error.name === 'DocumentQualityError') {
        return sendError(
          res,
          ErrorCode.PROCESSING_FAILED,
          `Document quality too low: ${error.message}`,
          400,
          extReq.requestId
        );
      }

      if (error.name === 'CostExceededError') {
        return sendError(
          res,
          ErrorCode.PROCESSING_FAILED,
          `Document too expensive to process: ${error.message}`,
          400,
          extReq.requestId
        );
      }
    }

    // Generic error
    next(error);
  }
};

/**
 * Create document from URL
 * POST /api/v1/documents/from-url
 */
export const createDocumentFromUrl = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const extReq = req as ExtendedRequest;
    const { url, title } = req.body;

    // Placeholder response
    const mockResponse: DocumentResponse = {
      id: 'doc-456',
      title: title || 'Untitled Document',
      sourceType: DocumentSourceType.URL,
      sourceUrl: url,
      status: DocumentStatus.PROCESSING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    sendSuccess(res, mockResponse, 201, extReq.requestId);
  } catch (error) {
    next(error);
  }
};

/**
 * Get document by ID
 * GET /api/v1/documents/:id
 *
 * Flow:
 * 1. Validate document ID (Zod middleware)
 * 2. Fetch from database using Prisma
 * 3. Return full document with content for paragraph jumping
 *
 * WHY: Frontend needs document content to highlight paragraphs when user clicks nodes
 */
export const getDocumentById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const extReq = req as ExtendedRequest;

  try {
    const { id } = req.params;

    logger.info('Fetching document', {
      requestId: extReq.requestId,
      documentId: id,
    });

    // Fetch document from database
    const document = await prisma.document.findUnique({
      where: { id },
    });

    if (!document) {
      return sendError(
        res,
        ErrorCode.DOCUMENT_NOT_FOUND,
        `Document with ID '${id}' not found`,
        404,
        extReq.requestId
      );
    }

    // Format response with full content
    const response: DocumentResponse & { content?: string } = {
      id: document.id,
      title: document.title,
      sourceType: mapSourceType(document.sourceType),
      sourceUrl: document.sourceUrl || undefined,
      status: mapDocumentStatus(document.status),
      fileSize: document.fileSize || undefined,
      errorMessage: document.errorMessage || undefined,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
      content: document.contentText, // Include full text for paragraph jumping
    };

    sendSuccess(res, response, 200, extReq.requestId);
  } catch (error) {
    logger.error('Failed to fetch document', {
      requestId: extReq.requestId,
      documentId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });

    next(error);
  }
};

/**
 * Get document processing status
 * GET /api/v1/documents/:id/status
 */
export const getDocumentStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const extReq = req as ExtendedRequest;
    const { id } = req.params;

    // Placeholder response
    const mockResponse = {
      id,
      status: DocumentStatus.READY,
      progress: 100,
    };

    sendSuccess(res, mockResponse, 200, extReq.requestId);
  } catch (error) {
    next(error);
  }
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Map database SourceType to DocumentSourceType enum
 *
 * WHY: Database uses string union, API uses enum for type safety
 */
function mapSourceType(sourceType: string): DocumentSourceType {
  switch (sourceType) {
    case 'pdf':
      return DocumentSourceType.PDF;
    case 'text':
      return DocumentSourceType.TEXT;
    case 'markdown':
      return DocumentSourceType.MARKDOWN;
    case 'url':
      return DocumentSourceType.URL;
    default:
      return DocumentSourceType.TEXT;
  }
}

/**
 * Map database DocumentStatus to DocumentStatus enum
 *
 * WHY: Database uses string union, API uses enum for type safety
 */
function mapDocumentStatus(status: string): DocumentStatus {
  switch (status) {
    case 'processing':
      return DocumentStatus.PROCESSING;
    case 'ready':
      return DocumentStatus.READY;
    case 'failed':
      return DocumentStatus.FAILED;
    default:
      return DocumentStatus.READY;
  }
}

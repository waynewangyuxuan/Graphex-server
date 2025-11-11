/**
 * Document Controller
 * Handles document upload, URL extraction, and document retrieval
 */

import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../utils/response.util';
import { ExtendedRequest } from '../types/api.types';
import { DocumentResponse, DocumentStatus, DocumentSourceType } from '../types/document.types';

/**
 * Upload document file
 * POST /api/v1/documents
 */
export const uploadDocument = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const extReq = req as ExtendedRequest;

    // Placeholder response
    const mockResponse: DocumentResponse = {
      id: 'doc-123',
      title: req.body.title || 'Untitled Document',
      sourceType: DocumentSourceType.PDF,
      status: DocumentStatus.PROCESSING,
      fileSize: req.file?.size,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    sendSuccess(res, mockResponse, 201, extReq.requestId);
  } catch (error) {
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
 */
export const getDocumentById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const extReq = req as ExtendedRequest;
    const { id } = req.params;

    // Placeholder response
    const mockResponse: DocumentResponse = {
      id: id || 'unknown',
      title: 'Sample Document',
      sourceType: DocumentSourceType.PDF,
      status: DocumentStatus.READY,
      fileSize: 1024000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    sendSuccess(res, mockResponse, 200, extReq.requestId);
  } catch (error) {
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

/**
 * Graph Controller
 * Handles graph generation and retrieval
 */

import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../utils/response.util';
import { ExtendedRequest } from '../types/api.types';
import { GraphResponse, GraphStatus, JobStatusResponse } from '../types/graph.types';

/**
 * Generate knowledge graph
 * POST /api/v1/graphs/generate
 */
export const generateGraph = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const extReq = req as ExtendedRequest;
    const { documentId } = req.body;

    // Placeholder response - returns job ID
    const mockResponse = {
      jobId: 'job-789',
      documentId,
      status: 'waiting' as const,
    };

    sendSuccess(res, mockResponse, 202, extReq.requestId);
  } catch (error) {
    next(error);
  }
};

/**
 * Get graph by ID
 * GET /api/v1/graphs/:id
 */
export const getGraphById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const extReq = req as ExtendedRequest;
    const { id } = req.params;

    // Placeholder response
    const mockResponse: GraphResponse = {
      id: id || 'unknown',
      documentId: 'doc-123',
      mermaidCode: 'graph TD\n  A[Concept A] --> B[Concept B]',
      status: GraphStatus.READY,
      version: 1,
      createdAt: new Date().toISOString(),
    };

    sendSuccess(res, mockResponse, 200, extReq.requestId);
  } catch (error) {
    next(error);
  }
};

/**
 * Get job status
 * GET /api/v1/jobs/:id
 */
export const getJobStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const extReq = req as ExtendedRequest;
    const { id } = req.params;

    // Placeholder response
    const mockResponse: JobStatusResponse = {
      jobId: id || 'unknown',
      status: 'completed',
      progress: 100,
      result: {
        graphId: 'graph-123',
      },
    };

    sendSuccess(res, mockResponse, 200, extReq.requestId);
  } catch (error) {
    next(error);
  }
};

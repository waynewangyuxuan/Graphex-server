/**
 * Connection Controller
 * Handles connection explanation requests
 */

import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../utils/response.util';
import { ExtendedRequest } from '../types/api.types';
import { ConnectionExplainResponse } from '../types/graph.types';

/**
 * Explain connection between nodes
 * POST /api/v1/connections/explain
 */
export const explainConnection = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const extReq = req as ExtendedRequest;
    const { fromNodeId, toNodeId } = req.body;

    // Placeholder response
    const mockResponse: ConnectionExplainResponse = {
      fromNode: fromNodeId,
      toNode: toNodeId,
      relationship: 'leads to',
      explanation: 'This is a placeholder explanation of the connection between these concepts.',
      sourceReferences: [
        {
          start: 0,
          end: 100,
          text: 'Sample text reference from the document...',
        },
      ],
    };

    sendSuccess(res, mockResponse, 200, extReq.requestId);
  } catch (error) {
    next(error);
  }
};

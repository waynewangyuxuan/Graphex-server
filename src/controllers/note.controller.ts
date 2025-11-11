/**
 * Note Controller
 * Handles note CRUD operations
 */

import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../utils/response.util';
import { ExtendedRequest } from '../types/api.types';
import { NoteResponse } from '../types/note.types';

/**
 * Create note
 * POST /api/v1/notes
 */
export const createNote = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const extReq = req as ExtendedRequest;
    const { graphId, nodeId, edgeId, content } = req.body;

    // Placeholder response
    const mockResponse: NoteResponse = {
      id: 'note-123',
      graphId,
      nodeId,
      edgeId,
      content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    sendSuccess(res, mockResponse, 201, extReq.requestId);
  } catch (error) {
    next(error);
  }
};

/**
 * Get notes by graph ID
 * GET /api/v1/notes?graphId=:id
 */
export const getNotesByGraphId = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const extReq = req as ExtendedRequest;
    const { graphId } = req.query;

    // Placeholder response
    const mockResponse: NoteResponse[] = [
      {
        id: 'note-123',
        graphId: graphId as string,
        nodeId: 'node-1',
        content: 'Sample note content',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    sendSuccess(res, mockResponse, 200, extReq.requestId);
  } catch (error) {
    next(error);
  }
};

/**
 * Update note
 * PUT /api/v1/notes/:id
 */
export const updateNote = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const extReq = req as ExtendedRequest;
    const { id } = req.params;
    const { content } = req.body;

    // Placeholder response
    const mockResponse: NoteResponse = {
      id: id || 'unknown',
      graphId: 'graph-123',
      nodeId: 'node-1',
      content,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
    };

    sendSuccess(res, mockResponse, 200, extReq.requestId);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete note
 * DELETE /api/v1/notes/:id
 */
export const deleteNote = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const extReq = req as ExtendedRequest;
    const { id } = req.params;

    sendSuccess(res, { deleted: true, id }, 200, extReq.requestId);
  } catch (error) {
    next(error);
  }
};

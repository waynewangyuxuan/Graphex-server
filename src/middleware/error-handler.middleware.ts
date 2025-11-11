/**
 * Error Handling Middleware
 * Centralized error handling for the application
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../utils/response.util';
import { ErrorCode } from '../types/api.types';
import { logger } from '../utils/logger.util';
import { ExtendedRequest } from '../types/api.types';
import { APP_CONFIG } from '../config/constants';

/**
 * Global error handler
 */
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const extReq = req as ExtendedRequest;
  const requestId = extReq.requestId || 'unknown';

  // Log error
  logger.error('Error occurred', {
    requestId,
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: ErrorCode.INVALID_REQUEST,
        message: 'Request validation failed',
        details: err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
      },
    });
    return;
  }

  // Handle custom API errors
  if (err instanceof ApiError) {
    const errorObj: { code: string; message: string; details?: unknown } = {
      code: err.code,
      message: err.message,
    };

    if (err.details) {
      errorObj.details = err.details;
    }

    res.status(err.statusCode).json({
      success: false,
      error: errorObj,
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
      },
    });
    return;
  }

  // Handle Multer file upload errors
  if (err.name === 'MulterError') {
    res.status(400).json({
      success: false,
      error: {
        code: ErrorCode.INVALID_REQUEST,
        message: 'File upload error',
        details: err.message,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
      },
    });
    return;
  }

  // Handle unexpected errors
  const unexpectedError: {
    code: string;
    message: string;
    details?: string;
    stack?: string;
  } = {
    code: ErrorCode.INTERNAL_ERROR,
    message: 'An unexpected error occurred',
  };

  if (APP_CONFIG.NODE_ENV === 'development') {
    unexpectedError.details = err.message;
    unexpectedError.stack = err.stack;
  }

  res.status(500).json({
    success: false,
    error: unexpectedError,
    meta: {
      timestamp: new Date().toISOString(),
      requestId,
    },
  });
};

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  const extReq = req as ExtendedRequest;
  const requestId = extReq.requestId || 'unknown';

  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId,
    },
  });
};

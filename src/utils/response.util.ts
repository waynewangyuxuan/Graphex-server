/**
 * Response Utility Functions
 * Standardized API response formatting
 */

import { Response } from 'express';
import { ApiSuccessResponse, ApiErrorResponse, ErrorCode } from '../types/api.types';

/**
 * Send standardized success response
 */
export const sendSuccess = <T>(
  res: Response,
  data: T,
  statusCode: number = 200,
  requestId: string
): void => {
  const response: ApiSuccessResponse<T> = {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      requestId,
    },
  };

  res.status(statusCode).json(response);
};

/**
 * Send standardized error response
 */
export const sendError = (
  res: Response,
  code: ErrorCode | string,
  message: string,
  statusCode: number = 500,
  requestId: string,
  details?: unknown
): void => {
  const errorObj: { code: string; message: string; details?: unknown } = {
    code,
    message,
  };

  if (details) {
    errorObj.details = details;
  }

  const response: ApiErrorResponse = {
    success: false,
    error: errorObj,
    meta: {
      timestamp: new Date().toISOString(),
      requestId,
    },
  };

  res.status(statusCode).json(response);
};

/**
 * Custom API Error class
 */
export class ApiError extends Error {
  constructor(
    public code: ErrorCode | string,
    message: string,
    public statusCode: number = 500,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
    Error.captureStackTrace(this, this.constructor);
  }
}

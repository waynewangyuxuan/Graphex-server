/**
 * API Type Definitions
 * Defines standardized API request/response types
 */

import { Request } from 'express';

/**
 * Standard success response format
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta: {
    timestamp: string;
    requestId: string;
  };
}

/**
 * Standard error response format
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: {
    timestamp: string;
    requestId: string;
  };
}

/**
 * Union type for all API responses
 */
export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Extended Express Request with custom properties
 */
export interface ExtendedRequest extends Request {
  requestId: string;
  startTime: number;
}

/**
 * Error codes used throughout the API
 */
export enum ErrorCode {
  INVALID_REQUEST = 'INVALID_REQUEST',
  DOCUMENT_NOT_FOUND = 'DOCUMENT_NOT_FOUND',
  GRAPH_NOT_FOUND = 'GRAPH_NOT_FOUND',
  UNSUPPORTED_FORMAT = 'UNSUPPORTED_FORMAT',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  PROCESSING_FAILED = 'PROCESSING_FAILED',
  AI_SERVICE_UNAVAILABLE = 'AI_SERVICE_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

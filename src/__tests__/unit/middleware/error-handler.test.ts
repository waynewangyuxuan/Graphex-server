/**
 * Error Handler Middleware Unit Tests
 *
 * Tests error handling for:
 * - Zod validation errors
 * - Custom API errors
 * - Multer file upload errors
 * - Unexpected errors
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError, z } from 'zod';
import { errorHandler, notFoundHandler } from '../../../middleware/error-handler.middleware';
import { ApiError } from '../../../utils/response.util';
import { ErrorCode, ExtendedRequest } from '../../../types/api.types';

describe('Error Handler Middleware Unit Tests', () => {
  let mockRequest: Partial<ExtendedRequest>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnThis();

    mockRequest = {
      requestId: 'test-request-123',
      path: '/api/v1/test',
      method: 'GET',
    };

    mockResponse = {
      status: statusMock,
      json: jsonMock,
    };

    mockNext = jest.fn();
  });

  describe('errorHandler', () => {
    it('should handle Zod validation errors', () => {
      // WHY: Tests proper formatting of Zod validation errors
      const schema = z.object({
        email: z.string().email(),
        age: z.number().min(18),
      });

      let zodError: ZodError;
      try {
        schema.parse({ email: 'invalid', age: 10 });
      } catch (error) {
        zodError = error as ZodError;
      }

      errorHandler(zodError!, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: ErrorCode.INVALID_REQUEST,
            message: 'Request validation failed',
            details: expect.arrayContaining([
              expect.objectContaining({
                path: expect.any(String),
                message: expect.any(String),
              }),
            ]),
          }),
          meta: expect.objectContaining({
            timestamp: expect.any(String),
            requestId: 'test-request-123',
          }),
        })
      );
    });

    it('should handle custom API errors', () => {
      // WHY: Tests proper handling of ApiError class instances
      const apiError = new ApiError(
        ErrorCode.DOCUMENT_NOT_FOUND,
        'Document with ID "test-123" not found',
        404
      );

      errorHandler(apiError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: {
            code: ErrorCode.DOCUMENT_NOT_FOUND,
            message: 'Document with ID "test-123" not found',
          },
          meta: expect.objectContaining({
            timestamp: expect.any(String),
            requestId: 'test-request-123',
          }),
        })
      );
    });

    it('should include error details when provided', () => {
      // WHY: Tests that error details are passed through
      const apiError = new ApiError(
        ErrorCode.INVALID_REQUEST,
        'Validation failed',
        400,
        { field: 'email', reason: 'Invalid format' }
      );

      errorHandler(apiError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            details: { field: 'email', reason: 'Invalid format' },
          }),
        })
      );
    });

    it('should handle Multer errors', () => {
      // WHY: Tests proper handling of file upload errors
      const multerError = new Error('File too large');
      multerError.name = 'MulterError';

      errorHandler(multerError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: ErrorCode.INVALID_REQUEST,
            message: 'File upload error',
            details: 'File too large',
          }),
        })
      );
    });

    it('should handle unexpected errors', () => {
      // WHY: Tests catch-all error handling for unknown errors
      const unexpectedError = new Error('Unexpected error occurred');

      errorHandler(unexpectedError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: ErrorCode.INTERNAL_ERROR,
            message: 'An unexpected error occurred',
          }),
        })
      );
    });

    it('should include stack trace in development mode', () => {
      // WHY: Tests that detailed error info is provided in development
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const unexpectedError = new Error('Test error');

      errorHandler(unexpectedError, mockRequest as Request, mockResponse as Response, mockNext);

      const response = jsonMock.mock.calls[0][0];
      expect(response.error.details).toBeDefined();

      process.env.NODE_ENV = originalEnv;
    });

    it('should not include stack trace in production mode', () => {
      // WHY: Tests that sensitive error info is hidden in production
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const unexpectedError = new Error('Test error');

      errorHandler(unexpectedError, mockRequest as Request, mockResponse as Response, mockNext);

      const response = jsonMock.mock.calls[0][0];
      expect(response.error.stack).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });

    it('should use fallback requestId when not provided', () => {
      // WHY: Tests that handler works even without requestId
      mockRequest.requestId = undefined;

      const error = new Error('Test error');

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      const response = jsonMock.mock.calls[0][0];
      expect(response.meta.requestId).toBe('unknown');
    });
  });

  describe('notFoundHandler', () => {
    it('should return 404 for unmatched routes', () => {
      // WHY: Tests proper handling of non-existent endpoints
      notFoundHandler(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Route GET /api/v1/test not found',
          },
          meta: expect.objectContaining({
            timestamp: expect.any(String),
            requestId: 'test-request-123',
          }),
        })
      );
    });

    it('should include correct HTTP method in error message', () => {
      // WHY: Tests that method is properly reported
      mockRequest.method = 'POST';
      mockRequest.path = '/api/v1/documents';

      notFoundHandler(mockRequest as Request, mockResponse as Response);

      const response = jsonMock.mock.calls[0][0];
      expect(response.error.message).toContain('POST');
      expect(response.error.message).toContain('/api/v1/documents');
    });

    it('should use fallback requestId when not provided', () => {
      // WHY: Tests that handler works without requestId
      mockRequest.requestId = undefined;

      notFoundHandler(mockRequest as Request, mockResponse as Response);

      const response = jsonMock.mock.calls[0][0];
      expect(response.meta.requestId).toBe('unknown');
    });
  });
});

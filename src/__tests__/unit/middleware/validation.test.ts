/**
 * Validation Middleware Unit Tests
 *
 * Tests Zod-based request validation middleware
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../../../middleware/validation.middleware';
import { ErrorCode, ExtendedRequest } from '../../../types/api.types';

describe('Validation Middleware Unit Tests', () => {
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
      body: {},
      query: {},
      params: {},
    };

    mockResponse = {
      status: statusMock,
      json: jsonMock,
    };

    mockNext = jest.fn();
  });

  describe('validate', () => {
    it('should pass validation with valid data', async () => {
      // WHY: Tests that valid requests pass through
      const schema = z.object({
        body: z.object({
          title: z.string(),
          count: z.number(),
        }),
      });

      mockRequest.body = {
        title: 'Test Document',
        count: 5,
      };

      const middleware = validate(schema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
      expect(jsonMock).not.toHaveBeenCalled();
    });

    it('should fail validation with missing required fields', async () => {
      // WHY: Tests that missing required fields are caught
      const schema = z.object({
        body: z.object({
          title: z.string(),
          count: z.number(),
        }),
      });

      mockRequest.body = {
        title: 'Test Document',
        // Missing count
      };

      const middleware = validate(schema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: ErrorCode.INVALID_REQUEST,
            message: 'Request validation failed',
            details: expect.arrayContaining([
              expect.objectContaining({
                path: expect.stringContaining('count'),
                message: expect.any(String),
              }),
            ]),
          }),
        })
      );
    });

    it('should fail validation with incorrect types', async () => {
      // WHY: Tests type validation
      const schema = z.object({
        body: z.object({
          count: z.number(),
          active: z.boolean(),
        }),
      });

      mockRequest.body = {
        count: 'five', // Should be number
        active: 'yes', // Should be boolean
      };

      const middleware = validate(schema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            details: expect.any(Array),
          }),
        })
      );
    });

    it('should validate query parameters', async () => {
      // WHY: Tests query parameter validation
      const schema = z.object({
        query: z.object({
          page: z.string(),
          limit: z.string(),
        }),
      });

      mockRequest.query = {
        page: '1',
        limit: '10',
      };

      const middleware = validate(schema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should validate route parameters', async () => {
      // WHY: Tests path parameter validation
      const schema = z.object({
        params: z.object({
          id: z.string().uuid(),
        }),
      });

      mockRequest.params = {
        id: '123e4567-e89b-12d3-a456-426614174000',
      };

      const middleware = validate(schema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should fail validation for invalid UUID format', async () => {
      // WHY: Tests format validation for UUIDs
      const schema = z.object({
        params: z.object({
          id: z.string().uuid(),
        }),
      });

      mockRequest.params = {
        id: 'invalid-uuid',
      };

      const middleware = validate(schema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('should validate email format', async () => {
      // WHY: Tests email validation
      const schema = z.object({
        body: z.object({
          email: z.string().email(),
        }),
      });

      mockRequest.body = {
        email: 'invalid-email',
      };

      const middleware = validate(schema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('should validate URL format', async () => {
      // WHY: Tests URL validation
      const schema = z.object({
        body: z.object({
          url: z.string().url(),
        }),
      });

      mockRequest.body = {
        url: 'not-a-url',
      };

      const middleware = validate(schema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('should validate minimum/maximum constraints', async () => {
      // WHY: Tests numeric range validation
      const schema = z.object({
        body: z.object({
          age: z.number().min(18).max(120),
        }),
      });

      mockRequest.body = {
        age: 150,
      };

      const middleware = validate(schema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('should handle optional fields', async () => {
      // WHY: Tests that optional fields work correctly
      const schema = z.object({
        body: z.object({
          title: z.string(),
          description: z.string().optional(),
        }),
      });

      mockRequest.body = {
        title: 'Test',
        // description omitted
      };

      const middleware = validate(schema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should validate nested objects', async () => {
      // WHY: Tests validation of complex nested structures
      const schema = z.object({
        body: z.object({
          user: z.object({
            name: z.string(),
            email: z.string().email(),
          }),
        }),
      });

      mockRequest.body = {
        user: {
          name: 'John Doe',
          email: 'john@example.com',
        },
      };

      const middleware = validate(schema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should validate arrays', async () => {
      // WHY: Tests array validation
      const schema = z.object({
        body: z.object({
          tags: z.array(z.string()),
        }),
      });

      mockRequest.body = {
        tags: ['tag1', 'tag2', 'tag3'],
      };

      const middleware = validate(schema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should provide detailed error paths', async () => {
      // WHY: Tests that error paths are clear for debugging
      const schema = z.object({
        body: z.object({
          user: z.object({
            profile: z.object({
              age: z.number(),
            }),
          }),
        }),
      });

      mockRequest.body = {
        user: {
          profile: {
            age: 'invalid',
          },
        },
      };

      const middleware = validate(schema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      const response = jsonMock.mock.calls[0][0];
      expect(response.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining('user'),
          }),
        ])
      );
    });

    it('should pass non-Zod errors to next middleware', async () => {
      // WHY: Tests that unexpected errors are forwarded
      const schema = z.object({
        body: z.object({
          title: z.string(),
        }),
      });

      const parseAsyncSpy = jest.spyOn(schema, 'parseAsync');
      parseAsyncSpy.mockRejectedValue(new Error('Unexpected error'));

      mockRequest.body = { title: 'Test' };

      const middleware = validate(schema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(statusMock).not.toHaveBeenCalled();

      parseAsyncSpy.mockRestore();
    });

    it('should use fallback requestId when not provided', async () => {
      // WHY: Tests that validation works without requestId
      mockRequest.requestId = undefined;

      const schema = z.object({
        body: z.object({
          title: z.string(),
        }),
      });

      mockRequest.body = {}; // Missing title

      const middleware = validate(schema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      const response = jsonMock.mock.calls[0][0];
      expect(response.meta.requestId).toBe('unknown');
    });
  });
});

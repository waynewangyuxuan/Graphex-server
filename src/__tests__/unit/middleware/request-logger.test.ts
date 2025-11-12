/**
 * Request Logger Middleware Unit Tests
 *
 * Tests request ID generation and logging functionality
 */

import { Request, Response, NextFunction } from 'express';
import { requestIdMiddleware, requestLogger } from '../../../middleware/request-logger.middleware';
import { ExtendedRequest } from '../../../types/api.types';
import { logger } from '../../../utils/logger.util';

// Mock logger
jest.mock('../../../utils/logger.util', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-123'),
}));

describe('Request Logger Middleware Unit Tests', () => {
  let mockRequest: Partial<ExtendedRequest>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let setHeaderMock: jest.Mock;
  let onMock: jest.Mock;

  beforeEach(() => {
    setHeaderMock = jest.fn();
    onMock = jest.fn((event, callback) => {
      if (event === 'finish') {
        // Store the callback for manual triggering
        (mockResponse as any).finishCallback = callback;
      }
    });

    mockRequest = {
      method: 'GET',
      path: '/api/v1/test',
      ip: '127.0.0.1',
      get: jest.fn((header: string) => {
        if (header === 'user-agent') return 'Test User Agent';
        return undefined;
      }),
    };

    mockResponse = {
      setHeader: setHeaderMock,
      on: onMock,
      statusCode: 200,
    };

    mockNext = jest.fn();

    jest.clearAllMocks();
  });

  describe('requestIdMiddleware', () => {
    it('should add requestId to request', () => {
      // WHY: Tests that unique request ID is generated
      requestIdMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect((mockRequest as ExtendedRequest).requestId).toBe('test-uuid-123');
    });

    it('should add startTime to request', () => {
      // WHY: Tests that request start time is captured
      const beforeTime = Date.now();
      requestIdMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      const afterTime = Date.now();

      expect((mockRequest as ExtendedRequest).startTime).toBeGreaterThanOrEqual(beforeTime);
      expect((mockRequest as ExtendedRequest).startTime).toBeLessThanOrEqual(afterTime);
    });

    it('should set X-Request-ID header', () => {
      // WHY: Tests that request ID is exposed in response headers
      requestIdMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(setHeaderMock).toHaveBeenCalledWith('X-Request-ID', 'test-uuid-123');
    });

    it('should call next middleware', () => {
      // WHY: Tests that middleware chain continues
      requestIdMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should generate unique IDs for different requests', () => {
      // WHY: Tests that each request gets its own ID
      const { v4 } = require('uuid');
      v4.mockReturnValueOnce('uuid-1')
        .mockReturnValueOnce('uuid-2');

      const req1 = { ...mockRequest } as ExtendedRequest;
      const req2 = { ...mockRequest } as ExtendedRequest;

      requestIdMiddleware(req1 as Request, mockResponse as Response, mockNext);
      requestIdMiddleware(req2 as Request, mockResponse as Response, mockNext);

      expect(req1.requestId).toBe('uuid-1');
      expect(req2.requestId).toBe('uuid-2');
    });
  });

  describe('requestLogger', () => {
    beforeEach(() => {
      (mockRequest as ExtendedRequest).requestId = 'test-request-123';
      (mockRequest as ExtendedRequest).startTime = Date.now();
    });

    it('should log incoming request', () => {
      // WHY: Tests that requests are logged when they arrive
      requestLogger(mockRequest as Request, mockResponse as Response, mockNext);

      expect(logger.info).toHaveBeenCalledWith(
        'Incoming request',
        expect.objectContaining({
          requestId: 'test-request-123',
          method: 'GET',
          path: '/api/v1/test',
          ip: '127.0.0.1',
          userAgent: 'Test User Agent',
        })
      );
    });

    it('should log request completion', () => {
      // WHY: Tests that completed requests are logged with timing
      (mockRequest as ExtendedRequest).startTime = Date.now() - 100;
      mockResponse.statusCode = 200;

      requestLogger(mockRequest as Request, mockResponse as Response, mockNext);

      // Trigger the finish event
      (mockResponse as any).finishCallback();

      expect(logger.info).toHaveBeenCalledWith(
        'Request completed',
        expect.objectContaining({
          requestId: 'test-request-123',
          method: 'GET',
          path: '/api/v1/test',
          statusCode: 200,
          duration: expect.stringMatching(/\d+ms/),
        })
      );
    });

    it('should calculate request duration', () => {
      // WHY: Tests that duration is measured accurately
      (mockRequest as ExtendedRequest).startTime = Date.now() - 150;

      requestLogger(mockRequest as Request, mockResponse as Response, mockNext);
      (mockResponse as any).finishCallback();

      const completionLog = (logger.info as jest.Mock).mock.calls.find(
        call => call[0] === 'Request completed'
      );

      expect(completionLog).toBeDefined();
      const durationStr = completionLog[1].duration;
      const duration = parseInt(durationStr.replace('ms', ''));
      expect(duration).toBeGreaterThanOrEqual(100);
      expect(duration).toBeLessThanOrEqual(200);
    });

    it('should log different HTTP methods', () => {
      // WHY: Tests logging for various HTTP methods
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

      methods.forEach(method => {
        jest.clearAllMocks();
        mockRequest.method = method;

        requestLogger(mockRequest as Request, mockResponse as Response, mockNext);

        expect(logger.info).toHaveBeenCalledWith(
          'Incoming request',
          expect.objectContaining({
            method,
          })
        );
      });
    });

    it('should log different status codes', () => {
      // WHY: Tests that various response codes are logged
      const statusCodes = [200, 201, 400, 404, 500];

      statusCodes.forEach(statusCode => {
        jest.clearAllMocks();
        mockResponse.statusCode = statusCode;

        requestLogger(mockRequest as Request, mockResponse as Response, mockNext);
        (mockResponse as any).finishCallback();

        const completionLog = (logger.info as jest.Mock).mock.calls.find(
          call => call[0] === 'Request completed'
        );

        expect(completionLog[1].statusCode).toBe(statusCode);
      });
    });

    it('should call next middleware', () => {
      // WHY: Tests that middleware chain continues
      requestLogger(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle missing user agent', () => {
      // WHY: Tests graceful handling of missing headers
      (mockRequest.get as jest.Mock).mockReturnValue(undefined);

      requestLogger(mockRequest as Request, mockResponse as Response, mockNext);

      expect(logger.info).toHaveBeenCalledWith(
        'Incoming request',
        expect.objectContaining({
          userAgent: undefined,
        })
      );
    });

    it('should handle very fast requests', () => {
      // WHY: Tests duration calculation for near-instant responses
      (mockRequest as ExtendedRequest).startTime = Date.now();

      requestLogger(mockRequest as Request, mockResponse as Response, mockNext);
      (mockResponse as any).finishCallback();

      const completionLog = (logger.info as jest.Mock).mock.calls.find(
        call => call[0] === 'Request completed'
      );

      expect(completionLog).toBeDefined();
      expect(completionLog[1].duration).toMatch(/\d+ms/);
    });

    it('should handle slow requests', () => {
      // WHY: Tests duration calculation for long-running requests
      (mockRequest as ExtendedRequest).startTime = Date.now() - 5000; // 5 seconds ago

      requestLogger(mockRequest as Request, mockResponse as Response, mockNext);
      (mockResponse as any).finishCallback();

      const completionLog = (logger.info as jest.Mock).mock.calls.find(
        call => call[0] === 'Request completed'
      );

      const durationStr = completionLog[1].duration;
      const duration = parseInt(durationStr.replace('ms', ''));
      expect(duration).toBeGreaterThanOrEqual(4500);
    });
  });

  describe('Combined middleware usage', () => {
    it('should work correctly when used together', () => {
      // WHY: Tests that both middleware work in sequence
      requestIdMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      requestLogger(mockRequest as Request, mockResponse as Response, mockNext);

      expect((mockRequest as ExtendedRequest).requestId).toBeDefined();
      expect(setHeaderMock).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'Incoming request',
        expect.objectContaining({
          requestId: expect.any(String),
        })
      );
      expect(mockNext).toHaveBeenCalledTimes(2);
    });
  });
});

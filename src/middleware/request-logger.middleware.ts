/**
 * Request Logging Middleware
 * Adds request ID and logs HTTP requests
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.util';
import { ExtendedRequest } from '../types/api.types';

/**
 * Add request ID to all requests
 */
export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const extReq = req as ExtendedRequest;
  extReq.requestId = uuidv4();
  extReq.startTime = Date.now();
  res.setHeader('X-Request-ID', extReq.requestId);
  next();
};

/**
 * Log incoming requests
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const extReq = req as ExtendedRequest;

  logger.info('Incoming request', {
    requestId: extReq.requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - extReq.startTime;
    logger.info('Request completed', {
      requestId: extReq.requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    });
  });

  next();
};

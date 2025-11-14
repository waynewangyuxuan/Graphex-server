/**
 * Zod Validation Middleware
 * Provides request validation using Zod schemas
 */

import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { ErrorCode } from '../types/api.types';
import { ExtendedRequest } from '../types/api.types';

/**
 * Validate request against Zod schema
 *
 * WHY: Skip validation for OPTIONS preflight requests to allow CORS
 */
export const validate = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip validation for OPTIONS preflight requests
    if (req.method === 'OPTIONS') {
      return next();
    }

    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const extReq = req as ExtendedRequest;
        const requestId = extReq.requestId || 'unknown';

        res.status(400).json({
          success: false,
          error: {
            code: ErrorCode.INVALID_REQUEST,
            message: 'Request validation failed',
            details: error.errors.map((e) => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId,
          },
        });
      } else {
        next(error);
      }
    }
  };
};

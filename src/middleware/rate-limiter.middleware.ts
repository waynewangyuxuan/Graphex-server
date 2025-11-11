/**
 * Rate Limiting Middleware
 */

import rateLimit from 'express-rate-limit';
import { RATE_LIMITS } from '../config/constants';
import { ErrorCode } from '../types/api.types';

/**
 * General API rate limiter
 */
export const generalLimiter = rateLimit({
  windowMs: RATE_LIMITS.GENERAL.WINDOW_MS,
  max: RATE_LIMITS.GENERAL.MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: 'Too many requests, please try again later',
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: (req as any).requestId || 'unknown',
      },
    });
  },
});

/**
 * AI operations rate limiter (stricter)
 */
export const aiOperationsLimiter = rateLimit({
  windowMs: RATE_LIMITS.AI_OPERATIONS.WINDOW_MS,
  max: RATE_LIMITS.AI_OPERATIONS.MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: 'Too many AI requests, please try again later',
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: (req as any).requestId || 'unknown',
      },
    });
  },
});

/**
 * File upload rate limiter
 */
export const fileUploadLimiter = rateLimit({
  windowMs: RATE_LIMITS.FILE_UPLOADS.WINDOW_MS,
  max: RATE_LIMITS.FILE_UPLOADS.MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: 'Too many file uploads, please try again later',
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: (req as any).requestId || 'unknown',
      },
    });
  },
});

/**
 * URL extraction rate limiter
 */
export const urlExtractionLimiter = rateLimit({
  windowMs: RATE_LIMITS.URL_EXTRACTION.WINDOW_MS,
  max: RATE_LIMITS.URL_EXTRACTION.MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: 'Too many URL extraction requests, please try again later',
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: (req as any).requestId || 'unknown',
      },
    });
  },
});

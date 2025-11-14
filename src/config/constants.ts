/**
 * Application-wide constants
 */

export const APP_CONFIG = {
  PORT: process.env.PORT || 4000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  API_VERSION: 'v1',
} as const;

/**
 * File upload limits
 */
export const FILE_UPLOAD = {
  MAX_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_MIME_TYPES: ['application/pdf', 'text/plain', 'text/markdown'],
  UPLOAD_DIR: process.env.UPLOAD_DIR || './uploads',
} as const;

/**
 * Rate limiting configuration
 */
export const RATE_LIMITS = {
  GENERAL: {
    WINDOW_MS: 60 * 60 * 1000, // 1 hour
    MAX_REQUESTS: 1000,
  },
  AI_OPERATIONS: {
    WINDOW_MS: 60 * 60 * 1000, // 1 hour
    MAX_REQUESTS: 100,
  },
  FILE_UPLOADS: {
    WINDOW_MS: 60 * 60 * 1000, // 1 hour
    MAX_REQUESTS: 10,
  },
  URL_EXTRACTION: {
    WINDOW_MS: 60 * 60 * 1000, // 1 hour
    MAX_REQUESTS: 10,
  },
} as const;

/**
 * Normalize a comma-separated string of origins into a clean array.
 */
const parseOrigins = (value?: string): string[] =>
  value
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

/**
 * Resolve allowed origins, supporting both the documented `CORS_ORIGINS`
 * variable and the previously implemented `ALLOWED_ORIGINS`.
 */
const resolvedAllowedOrigins = (() => {
  const fromAllowed = parseOrigins(process.env.ALLOWED_ORIGINS);
  if (fromAllowed.length > 0) {
    return fromAllowed;
  }

  const fromLegacy = parseOrigins(process.env.CORS_ORIGINS);
  if (fromLegacy.length > 0) {
    return fromLegacy;
  }

  return ['http://localhost:3001'];
})();

/**
 * CORS configuration
 */
export const CORS_CONFIG = {
  ALLOWED_ORIGINS: resolvedAllowedOrigins,
  CREDENTIALS: false,
} as const;

/**
 * Logging configuration
 */
export const LOG_CONFIG = {
  LEVEL: process.env.LOG_LEVEL || 'info',
  FILE_PATH: process.env.LOG_FILE_PATH || './logs',
} as const;

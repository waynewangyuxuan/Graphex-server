/**
 * CORS Middleware Configuration
 */

import cors, { CorsOptions } from 'cors';
import { CORS_CONFIG } from '../config/constants';

/**
 * CORS options
 */
const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }

    if (CORS_CONFIG.ALLOWED_ORIGINS.includes(origin) || CORS_CONFIG.ALLOWED_ORIGINS.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: CORS_CONFIG.CREDENTIALS,
  maxAge: 86400, // 24 hours
};

/**
 * CORS middleware instance
 */
export const corsMiddleware = cors(corsOptions);

/**
 * Express Application Setup
 * Configures Express app with all middleware and routes
 */

import express, { Application } from 'express';
import helmet from 'helmet';
import { corsMiddleware } from './middleware/cors.middleware';
import { generalLimiter } from './middleware/rate-limiter.middleware';
import { requestIdMiddleware, requestLogger } from './middleware/request-logger.middleware';
import { errorHandler, notFoundHandler } from './middleware/error-handler.middleware';
import routes from './routes';
import { APP_CONFIG } from './config/constants';
import { logger } from './utils/logger.util';

/**
 * Create and configure Express application
 */
export const createApp = (): Application => {
  const app = express();

  // Trust proxy (for rate limiting behind reverse proxy)
  app.set('trust proxy', 1);

  // Security middleware
  app.use(helmet());

  // CORS middleware
  app.use(corsMiddleware);

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request ID and logging middleware
  app.use(requestIdMiddleware);
  app.use(requestLogger);

  // Global rate limiting
  app.use(generalLimiter);

  // Mount all routes
  app.use(routes);

  // 404 handler (must be after all routes)
  app.use(notFoundHandler);

  // Global error handler (must be last)
  app.use(errorHandler);

  logger.info('Express application configured', {
    environment: APP_CONFIG.NODE_ENV,
    apiVersion: APP_CONFIG.API_VERSION,
  });

  return app;
};

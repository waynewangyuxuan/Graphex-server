/**
 * Server Entry Point
 * Starts the Express server
 */

// Load environment variables FIRST (before any other imports that use process.env)
import './config/env';

import { createApp } from './app';
import { APP_CONFIG } from './config/constants';
import { logger } from './utils/logger.util';
import { closeRedisConnection } from './config/redis';
import { prisma } from './config/database';

/**
 * Graceful shutdown handler
 * Closes all connections and resources properly
 */
const gracefulShutdown = async (signal: string, server: any) => {
  logger.info(`${signal} signal received: starting graceful shutdown`);

  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      // Close Redis connection
      await closeRedisConnection();

      // Close Prisma connection
      await prisma.$disconnect();
      logger.info('Database connection closed');

      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  });

  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

/**
 * Start the server
 */
const startServer = () => {
  try {
    const app = createApp();
    const port = APP_CONFIG.PORT;

    const server = app.listen(port, () => {
      logger.info(`Server started successfully`, {
        port,
        environment: APP_CONFIG.NODE_ENV,
        apiVersion: APP_CONFIG.API_VERSION,
      });
      logger.info(`Health check available at http://localhost:${port}/health`);
      logger.info(`API documentation: http://localhost:${port}/api/${APP_CONFIG.API_VERSION}`);
    });

    // Graceful shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM', server));
    process.on('SIGINT', () => gracefulShutdown('SIGINT', server));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection at:', { promise, reason });
      process.exit(1);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

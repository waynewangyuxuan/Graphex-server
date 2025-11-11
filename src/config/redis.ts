/**
 * Redis Configuration
 * Sets up Redis connection for caching and job queues
 */

import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger.util';

/**
 * Redis client instance for caching
 * Single responsibility: Provide Redis connection for cache operations
 */
export const redisClient = new Redis(env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    logger.warn(`Redis connection retry attempt ${times}`, { delay });
    return delay;
  },
  reconnectOnError: (err) => {
    logger.error('Redis connection error', { error: err.message });
    return true;
  },
});

/**
 * Redis connection event handlers
 */
redisClient.on('connect', () => {
  logger.info('Redis client connected');
});

redisClient.on('ready', () => {
  logger.info('Redis client ready');
});

redisClient.on('error', (err) => {
  logger.error('Redis client error', { error: err.message });
});

redisClient.on('close', () => {
  logger.warn('Redis client connection closed');
});

/**
 * Graceful shutdown handler
 */
export const closeRedisConnection = async (): Promise<void> => {
  try {
    await redisClient.quit();
    logger.info('Redis connection closed gracefully');
  } catch (error) {
    logger.error('Error closing Redis connection', { error });
  }
};

/**
 * Health check for Redis connection
 */
export const checkRedisHealth = async (): Promise<boolean> => {
  try {
    const pong = await redisClient.ping();
    return pong === 'PONG';
  } catch (error) {
    logger.error('Redis health check failed', { error });
    return false;
  }
};

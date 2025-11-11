/**
 * Route Index
 * Aggregates all API routes
 */

import { Router } from 'express';
import documentRoutes from './documents.route';
import graphRoutes from './graphs.route';
import connectionRoutes from './connections.route';
import quizRoutes from './quizzes.route';
import noteRoutes from './notes.route';
import { APP_CONFIG } from '../config/constants';
import { checkRedisHealth } from '../config/redis';
import { checkDatabaseHealth } from '../config/database';
import { checkAIServicesHealth } from '../config/ai-clients';

const router = Router();

// Mount all route modules
router.use(`/api/${APP_CONFIG.API_VERSION}/documents`, documentRoutes);
router.use(`/api/${APP_CONFIG.API_VERSION}/graphs`, graphRoutes);
router.use(`/api/${APP_CONFIG.API_VERSION}/connections`, connectionRoutes);
router.use(`/api/${APP_CONFIG.API_VERSION}/quizzes`, quizRoutes);
router.use(`/api/${APP_CONFIG.API_VERSION}/notes`, noteRoutes);

/**
 * Basic health check endpoint
 * GET /health
 */
router.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'graphex-api',
    version: APP_CONFIG.API_VERSION,
  });
});

/**
 * Readiness check endpoint
 * GET /health/ready
 * Checks if service is ready to handle requests
 */
router.get('/health/ready', async (_req, res) => {
  try {
    const redisHealth = await checkRedisHealth();
    const dbHealth = await checkDatabaseHealth();

    const isReady = redisHealth && dbHealth;

    res.status(isReady ? 200 : 503).json({
      status: isReady ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbHealth ? 'ok' : 'failed',
        redis: redisHealth ? 'ok' : 'failed',
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    });
  }
});

/**
 * Deep health check endpoint
 * GET /health/deep
 * Checks all external dependencies including AI services
 */
router.get('/health/deep', async (_req, res) => {
  try {
    const redisHealth = await checkRedisHealth();
    const dbHealth = await checkDatabaseHealth();
    const aiHealth = await checkAIServicesHealth();

    const isHealthy = redisHealth && dbHealth;

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbHealth ? 'ok' : 'failed',
        redis: redisHealth ? 'ok' : 'failed',
        aiService: {
          anthropic: aiHealth.anthropic ? 'ok' : 'not_configured',
          openai: aiHealth.openai ? 'ok' : 'not_configured',
        },
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Deep health check failed',
    });
  }
});

export default router;

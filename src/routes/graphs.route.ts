/**
 * Graph Routes
 * Defines graph-related API endpoints
 */

import { Router } from 'express';
import { generateGraph, getGraphById, getJobStatus } from '../controllers/graph.controller';
import { aiOperationsLimiter } from '../middleware/rate-limiter.middleware';

const router = Router();

/**
 * POST /api/v1/graphs/generate
 * Generate knowledge graph from document
 */
router.post('/generate', aiOperationsLimiter, generateGraph);

/**
 * GET /api/v1/graphs/:id
 * Get graph by ID
 */
router.get('/:id', getGraphById);

/**
 * GET /api/v1/jobs/:id
 * Get job status (for async operations)
 */
router.get('/jobs/:id', getJobStatus);

export default router;

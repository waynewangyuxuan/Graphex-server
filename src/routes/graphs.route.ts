/**
 * Graph Routes
 * Defines graph-related API endpoints with validation
 */

import { Router } from 'express';
import { generateGraph, getGraphById, getJobStatus } from '../controllers/graph.controller';
import { aiOperationsLimiter } from '../middleware/rate-limiter.middleware';
import { validate } from '../middleware/validation.middleware';
import {
  GraphGenerationRequestSchema,
  GraphIdParamSchema,
  JobIdParamSchema,
} from '../schemas/graph.schema';

const router = Router();

/**
 * POST /api/v1/graphs/generate
 * Generate knowledge graph from document text
 *
 * Flow: Rate Limit → Validation → Controller → Service → Database
 */
router.post(
  '/generate',
  aiOperationsLimiter,
  validate(GraphGenerationRequestSchema),
  generateGraph
);

/**
 * GET /api/v1/graphs/:id
 * Get graph by ID with all nodes and edges
 *
 * Flow: Validation → Controller → Database
 */
router.get(
  '/:id',
  validate(GraphIdParamSchema),
  getGraphById
);

/**
 * GET /api/v1/jobs/:id
 * Get job status (for async operations)
 *
 * Current: Returns "completed" (synchronous processing)
 * Future: Will integrate with BullMQ for real job tracking
 */
router.get(
  '/jobs/:id',
  validate(JobIdParamSchema),
  getJobStatus
);

export default router;

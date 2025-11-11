/**
 * Connection Routes
 * Defines connection explanation API endpoints
 */

import { Router } from 'express';
import { explainConnection } from '../controllers/connection.controller';
import { aiOperationsLimiter } from '../middleware/rate-limiter.middleware';

const router = Router();

/**
 * POST /api/v1/connections/explain
 * Get AI explanation for connection between nodes
 */
router.post('/explain', aiOperationsLimiter, explainConnection);

export default router;

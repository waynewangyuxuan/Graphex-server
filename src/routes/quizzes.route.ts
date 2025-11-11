/**
 * Quiz Routes
 * Defines quiz-related API endpoints
 */

import { Router } from 'express';
import { generateQuiz, submitQuiz } from '../controllers/quiz.controller';
import { aiOperationsLimiter } from '../middleware/rate-limiter.middleware';

const router = Router();

/**
 * POST /api/v1/quizzes/generate
 * Generate quiz questions from graph
 */
router.post('/generate', aiOperationsLimiter, generateQuiz);

/**
 * POST /api/v1/quizzes/:id/submit
 * Submit quiz answers
 */
router.post('/:id/submit', submitQuiz);

export default router;

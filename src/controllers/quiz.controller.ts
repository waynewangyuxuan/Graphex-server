/**
 * Quiz Controller
 * Handles quiz generation and submission
 */

import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../utils/response.util';
import { ExtendedRequest } from '../types/api.types';
import {
  QuizGenerateResponse,
  QuizSubmitResponse,
  QuizDifficulty,
} from '../types/quiz.types';

/**
 * Generate quiz questions
 * POST /api/v1/quizzes/generate
 */
export const generateQuiz = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const extReq = req as ExtendedRequest;
    const { graphId } = req.body;

    // Placeholder response
    const mockResponse: QuizGenerateResponse = {
      quizId: 'quiz-123',
      graphId,
      questions: [
        {
          id: 'q1',
          questionText: 'What is the relationship between Concept A and Concept B?',
          options: [
            { text: 'Leads to', isCorrect: true },
            { text: 'Contradicts', isCorrect: false },
            { text: 'Supports', isCorrect: false },
            { text: 'Unrelated', isCorrect: false },
          ],
          explanation: 'Concept A leads to Concept B as explained in the source material.',
          difficulty: QuizDifficulty.MEDIUM,
        },
      ],
    };

    sendSuccess(res, mockResponse, 200, extReq.requestId);
  } catch (error) {
    next(error);
  }
};

/**
 * Submit quiz answers
 * POST /api/v1/quizzes/:id/submit
 */
export const submitQuiz = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const extReq = req as ExtendedRequest;

    // Placeholder response
    const mockResponse: QuizSubmitResponse = {
      score: 80,
      totalQuestions: 5,
      results: [
        {
          questionId: 'q1',
          correct: true,
          selectedAnswer: 0,
          correctAnswer: 0,
          explanation: 'Correct! Concept A leads to Concept B.',
        },
      ],
    };

    sendSuccess(res, mockResponse, 200, extReq.requestId);
  } catch (error) {
    next(error);
  }
};

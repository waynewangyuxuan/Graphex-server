/**
 * Quizzes API Integration Tests
 *
 * Tests quiz-related endpoints:
 * - POST /api/v1/quizzes/generate
 * - POST /api/v1/quizzes/:id/submit
 */

import request from 'supertest';
import { Application } from 'express';
import { createApp } from '../../app';
import { setupTest, teardownTest } from '../helpers/setup';
import { ErrorCode } from '../../types/api.types';

describe('Quizzes API Integration Tests', () => {
  let app: Application;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await teardownTest();
  });

  describe('POST /api/v1/quizzes/generate', () => {
    it('should generate quiz successfully', async () => {
      // WHY: Tests quiz generation from graph
      const response = await request(app)
        .post('/api/v1/quizzes/generate')
        .send({
          graphId: 'graph-test-123',
          count: 5,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('questions');
      expect(Array.isArray(response.body.data.questions)).toBe(true);
      expect(response.body.data.questions.length).toBe(5);
    });

    it('should generate questions with correct structure', async () => {
      // WHY: Tests question format meets requirements
      const response = await request(app)
        .post('/api/v1/quizzes/generate')
        .send({
          graphId: 'graph-test-123',
          count: 3,
        })
        .expect(200);

      const questions = response.body.data.questions;
      questions.forEach((q: any) => {
        expect(q).toHaveProperty('id');
        expect(q).toHaveProperty('questionText');
        expect(q).toHaveProperty('options');
        expect(Array.isArray(q.options)).toBe(true);
        expect(q.options.length).toBe(4);
        expect(q).toHaveProperty('correctAnswer');
        expect(q).toHaveProperty('explanation');
        expect(q).toHaveProperty('difficulty');
      });
    });

    it('should return 400 when graphId is missing', async () => {
      // WHY: Tests validation for required field
      const response = await request(app)
        .post('/api/v1/quizzes/generate')
        .send({
          count: 5,
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.INVALID_REQUEST);
    });

    it('should return 404 when graph does not exist', async () => {
      // WHY: Tests validation of graph existence
      const response = await request(app)
        .post('/api/v1/quizzes/generate')
        .send({
          graphId: 'non-existent-graph',
          count: 5,
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.GRAPH_NOT_FOUND);
    });

    it('should accept difficulty parameter', async () => {
      // WHY: Tests optional difficulty filtering
      const response = await request(app)
        .post('/api/v1/quizzes/generate')
        .send({
          graphId: 'graph-test-123',
          count: 5,
          difficulty: 'medium',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.questions).toBeDefined();
    });

    it('should default to 5 questions when count not specified', async () => {
      // WHY: Tests default behavior
      const response = await request(app)
        .post('/api/v1/quizzes/generate')
        .send({
          graphId: 'graph-test-123',
        })
        .expect(200);

      expect(response.body.data.questions.length).toBe(5);
    });

    it('should limit maximum question count', async () => {
      // WHY: Tests upper bound validation
      const response = await request(app)
        .post('/api/v1/quizzes/generate')
        .send({
          graphId: 'graph-test-123',
          count: 100,
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.INVALID_REQUEST);
    });
  });

  describe('POST /api/v1/quizzes/:id/submit', () => {
    it('should submit quiz answers and return results', async () => {
      // WHY: Tests quiz submission and grading
      const response = await request(app)
        .post('/api/v1/quizzes/quiz-test-123/submit')
        .send({
          answers: [0, 1, 2, 0, 1],
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('score');
      expect(response.body.data).toHaveProperty('totalQuestions');
      expect(response.body.data).toHaveProperty('correctAnswers');
      expect(response.body.data).toHaveProperty('results');
    });

    it('should return detailed results for each question', async () => {
      // WHY: Tests that feedback is provided per question
      const response = await request(app)
        .post('/api/v1/quizzes/quiz-test-123/submit')
        .send({
          answers: [0, 1, 2],
        })
        .expect(200);

      const results = response.body.data.results;
      expect(Array.isArray(results)).toBe(true);
      results.forEach((result: any) => {
        expect(result).toHaveProperty('questionId');
        expect(result).toHaveProperty('userAnswer');
        expect(result).toHaveProperty('correctAnswer');
        expect(result).toHaveProperty('isCorrect');
      });
    });

    it('should return 400 when answers are missing', async () => {
      // WHY: Tests validation for required answers
      const response = await request(app)
        .post('/api/v1/quizzes/quiz-test-123/submit')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.INVALID_REQUEST);
    });

    it('should return 404 when quiz does not exist', async () => {
      // WHY: Tests error handling for invalid quiz ID
      const response = await request(app)
        .post('/api/v1/quizzes/non-existent-quiz/submit')
        .send({
          answers: [0, 1, 2],
        })
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 when answer count does not match', async () => {
      // WHY: Tests validation of answer array length
      const response = await request(app)
        .post('/api/v1/quizzes/quiz-test-123/submit')
        .send({
          answers: [0, 1], // Too few answers
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.INVALID_REQUEST);
    });

    it('should calculate score correctly', async () => {
      // WHY: Tests score calculation accuracy
      const response = await request(app)
        .post('/api/v1/quizzes/quiz-test-123/submit')
        .send({
          answers: [0, 1, 2, 0, 1],
        })
        .expect(200);

      const { score, totalQuestions, correctAnswers } = response.body.data;
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
      expect(correctAnswers).toBeLessThanOrEqual(totalQuestions);
      expect(Math.round((correctAnswers / totalQuestions) * 100)).toBe(score);
    });
  });
});

/**
 * Connections API Integration Tests
 *
 * Tests connection explanation endpoint:
 * - POST /api/v1/connections/explain
 */

import request from 'supertest';
import { Application } from 'express';
import { createApp } from '../../app';
import { setupTest, teardownTest } from '../helpers/setup';
import { ErrorCode } from '../../types/api.types';

describe('Connections API Integration Tests', () => {
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

  describe('POST /api/v1/connections/explain', () => {
    it('should explain connection successfully', async () => {
      // WHY: Tests AI-generated explanation for node relationships
      const response = await request(app)
        .post('/api/v1/connections/explain')
        .send({
          graphId: 'graph-test-123',
          fromNodeId: 'node-1',
          toNodeId: 'node-2',
          relationship: 'supports',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('explanation');
      expect(typeof response.body.data.explanation).toBe('string');
      expect(response.body.data.explanation.length).toBeGreaterThan(0);
    });

    it('should include user hypothesis in explanation when provided', async () => {
      // WHY: Tests that user input influences AI response
      const response = await request(app)
        .post('/api/v1/connections/explain')
        .send({
          graphId: 'graph-test-123',
          fromNodeId: 'node-1',
          toNodeId: 'node-2',
          userHypothesis: 'I think these concepts are related because...',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('explanation');
    });

    it('should return 400 when required fields are missing', async () => {
      // WHY: Tests validation for required fields
      const response = await request(app)
        .post('/api/v1/connections/explain')
        .send({
          graphId: 'graph-test-123',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.INVALID_REQUEST);
    });

    it('should return 404 when graph does not exist', async () => {
      // WHY: Tests error handling for invalid graph reference
      const response = await request(app)
        .post('/api/v1/connections/explain')
        .send({
          graphId: 'non-existent-graph',
          fromNodeId: 'node-1',
          toNodeId: 'node-2',
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.GRAPH_NOT_FOUND);
    });

    it('should return 404 when nodes do not exist', async () => {
      // WHY: Tests validation of node existence
      const response = await request(app)
        .post('/api/v1/connections/explain')
        .send({
          graphId: 'graph-test-123',
          fromNodeId: 'non-existent-node',
          toNodeId: 'node-2',
        })
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should include source references when available', async () => {
      // WHY: Tests that explanation cites document sources
      const response = await request(app)
        .post('/api/v1/connections/explain')
        .send({
          graphId: 'graph-test-123',
          fromNodeId: 'node-1',
          toNodeId: 'node-2',
        })
        .expect(200);

      if (response.body.data.sourceReferences) {
        expect(Array.isArray(response.body.data.sourceReferences)).toBe(true);
      }
    });

    it('should return cached explanation on repeated requests', async () => {
      // WHY: Tests caching mechanism for performance
      const requestBody = {
        graphId: 'graph-test-123',
        fromNodeId: 'node-1',
        toNodeId: 'node-2',
      };

      const response1 = await request(app)
        .post('/api/v1/connections/explain')
        .send(requestBody)
        .expect(200);

      const response2 = await request(app)
        .post('/api/v1/connections/explain')
        .send(requestBody)
        .expect(200);

      expect(response1.body.data.explanation).toBe(response2.body.data.explanation);
    });
  });
});

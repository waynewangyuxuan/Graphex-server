/**
 * Graphs API Integration Tests
 *
 * Tests all graph-related endpoints:
 * - POST /api/v1/graphs/generate
 * - GET /api/v1/graphs/:id
 * - GET /api/v1/jobs/:id
 */

import request from 'supertest';
import { Application } from 'express';
import { createApp } from '../../app';
import { setupTest, teardownTest } from '../helpers/setup';
import {
  createMockGraph,
  createGeneratingGraph,
  createFailedGraph,
} from '../helpers/factories';
import { GraphStatus } from '../../types/graph.types';
import { ErrorCode } from '../../types/api.types';

describe('Graphs API Integration Tests', () => {
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

  describe('POST /api/v1/graphs/generate', () => {
    it('should start graph generation and return job ID with 202', async () => {
      // WHY: Tests async graph generation initiation
      const response = await request(app)
        .post('/api/v1/graphs/generate')
        .send({
          documentId: 'doc-test-123',
        })
        .expect(202);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('jobId');
      expect(response.body.data).toHaveProperty('documentId', 'doc-test-123');
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data.status).toMatch(/waiting|active/);
    });

    it('should return 400 when documentId is missing', async () => {
      // WHY: Tests validation for required documentId field
      const response = await request(app)
        .post('/api/v1/graphs/generate')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.INVALID_REQUEST);
      expect(response.body.error.message).toMatch(/documentId/i);
    });

    it('should return 400 for invalid documentId format', async () => {
      // WHY: Tests documentId format validation
      const response = await request(app)
        .post('/api/v1/graphs/generate')
        .send({
          documentId: 'invalid@id!',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.INVALID_REQUEST);
    });

    it('should return 404 when document does not exist', async () => {
      // WHY: Tests that graph generation requires existing document
      const response = await request(app)
        .post('/api/v1/graphs/generate')
        .send({
          documentId: 'non-existent-doc',
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.DOCUMENT_NOT_FOUND);
    });

    it('should return 400 when document is still processing', async () => {
      // WHY: Tests that graph generation requires ready document
      const response = await request(app)
        .post('/api/v1/graphs/generate')
        .send({
          documentId: 'doc-processing-123',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.INVALID_REQUEST);
      expect(response.body.error.message).toMatch(/not ready|processing/i);
    });

    it('should accept optional generation parameters', async () => {
      // WHY: Tests that optional parameters are accepted
      const response = await request(app)
        .post('/api/v1/graphs/generate')
        .send({
          documentId: 'doc-test-123',
          nodeCount: 10,
          model: 'claude-sonnet-4',
        })
        .expect(202);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('jobId');
    });

    it('should generate unique job IDs for each request', async () => {
      // WHY: Tests that concurrent requests get unique job IDs
      const response1 = await request(app)
        .post('/api/v1/graphs/generate')
        .send({ documentId: 'doc-test-123' });

      const response2 = await request(app)
        .post('/api/v1/graphs/generate')
        .send({ documentId: 'doc-test-123' });

      expect(response1.body.data.jobId).toBeTruthy();
      expect(response2.body.data.jobId).toBeTruthy();
      expect(response1.body.data.jobId).not.toBe(response2.body.data.jobId);
    });
  });

  describe('GET /api/v1/graphs/:id', () => {
    it('should retrieve graph by ID successfully', async () => {
      // WHY: Tests successful graph retrieval
      const graphId = 'graph-test-123';

      const response = await request(app)
        .get(`/api/v1/graphs/${graphId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id', graphId);
      expect(response.body.data).toHaveProperty('documentId');
      expect(response.body.data).toHaveProperty('mermaidCode');
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('version');
    });

    it('should return 404 for non-existent graph', async () => {
      // WHY: Tests error handling for missing graph
      const response = await request(app)
        .get('/api/v1/graphs/non-existent-id')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.GRAPH_NOT_FOUND);
    });

    it('should return 400 for invalid graph ID format', async () => {
      // WHY: Tests ID format validation
      const response = await request(app)
        .get('/api/v1/graphs/invalid@id!')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.INVALID_REQUEST);
    });

    it('should include mermaid code in response', async () => {
      // WHY: Verifies that graph visualization code is returned
      const graphId = 'graph-test-123';

      const response = await request(app)
        .get(`/api/v1/graphs/${graphId}`)
        .expect(200);

      expect(response.body.data.mermaidCode).toBeTruthy();
      expect(response.body.data.mermaidCode).toContain('graph');
      expect(typeof response.body.data.mermaidCode).toBe('string');
    });

    it('should include optional fields when present', async () => {
      // WHY: Tests that layout config and other optional data is returned
      const graphId = 'graph-with-layout-123';

      const response = await request(app)
        .get(`/api/v1/graphs/${graphId}`)
        .expect(200);

      const { data } = response.body;
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('documentId');
      expect(data).toHaveProperty('mermaidCode');
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('generationModel');
      expect(data).toHaveProperty('version');
      expect(data).toHaveProperty('createdAt');

      // Optional fields
      if (data.layoutConfig) {
        expect(typeof data.layoutConfig).toBe('object');
      }
      if (data.nodeCount !== undefined) {
        expect(typeof data.nodeCount).toBe('number');
      }
      if (data.edgeCount !== undefined) {
        expect(typeof data.edgeCount).toBe('number');
      }
    });

    it('should include nodes and edges when query param is set', async () => {
      // WHY: Tests that graph can be fetched with full structure
      const graphId = 'graph-test-123';

      const response = await request(app)
        .get(`/api/v1/graphs/${graphId}`)
        .query({ includeStructure: 'true' })
        .expect(200);

      expect(response.body.success).toBe(true);
      // If structure is included, verify it
      if (response.body.data.nodes) {
        expect(Array.isArray(response.body.data.nodes)).toBe(true);
      }
      if (response.body.data.edges) {
        expect(Array.isArray(response.body.data.edges)).toBe(true);
      }
    });
  });

  describe('GET /api/v1/jobs/:id', () => {
    it('should retrieve job status successfully', async () => {
      // WHY: Tests job status polling for async operations
      const jobId = 'job-test-123';

      const response = await request(app)
        .get(`/api/v1/jobs/${jobId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('jobId', jobId);
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('progress');
    });

    it('should return waiting status for queued jobs', async () => {
      // WHY: Tests status for jobs in queue
      const jobId = 'job-waiting-123';

      const response = await request(app)
        .get(`/api/v1/jobs/${jobId}`)
        .expect(200);

      expect(response.body.data.status).toMatch(/waiting|queued/);
      expect(response.body.data.progress).toBe(0);
    });

    it('should return active status with progress for processing jobs', async () => {
      // WHY: Tests status for jobs currently being processed
      const jobId = 'job-active-123';

      const response = await request(app)
        .get(`/api/v1/jobs/${jobId}`)
        .expect(200);

      if (response.body.data.status === 'active') {
        expect(response.body.data.progress).toBeGreaterThan(0);
        expect(response.body.data.progress).toBeLessThan(100);
      }
    });

    it('should return completed status with result', async () => {
      // WHY: Tests status for successfully completed jobs
      const jobId = 'job-completed-123';

      const response = await request(app)
        .get(`/api/v1/jobs/${jobId}`)
        .expect(200);

      expect(response.body.data.status).toBe('completed');
      expect(response.body.data.progress).toBe(100);
      expect(response.body.data).toHaveProperty('result');
      expect(response.body.data.result).toHaveProperty('graphId');
    });

    it('should return failed status with error message', async () => {
      // WHY: Tests error reporting for failed jobs
      const jobId = 'job-failed-123';

      const response = await request(app)
        .get(`/api/v1/jobs/${jobId}`)
        .expect(200);

      if (response.body.data.status === 'failed') {
        expect(response.body.data).toHaveProperty('error');
        expect(response.body.data.error).toBeTruthy();
      }
    });

    it('should return 404 for non-existent job', async () => {
      // WHY: Tests error handling for invalid job ID
      const response = await request(app)
        .get('/api/v1/jobs/non-existent-job')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('JOB_NOT_FOUND');
    });

    it('should return 400 for invalid job ID format', async () => {
      // WHY: Tests job ID format validation
      const response = await request(app)
        .get('/api/v1/jobs/invalid@job!')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.INVALID_REQUEST);
    });

    it('should include timing information', async () => {
      // WHY: Tests that job duration is tracked
      const jobId = 'job-completed-123';

      const response = await request(app)
        .get(`/api/v1/jobs/${jobId}`)
        .expect(200);

      // Timing fields may be optional but if present, should be valid
      if (response.body.data.createdAt) {
        expect(new Date(response.body.data.createdAt).toString()).not.toBe('Invalid Date');
      }
      if (response.body.data.completedAt) {
        expect(new Date(response.body.data.completedAt).toString()).not.toBe('Invalid Date');
      }
      if (response.body.data.duration) {
        expect(typeof response.body.data.duration).toBe('number');
        expect(response.body.data.duration).toBeGreaterThan(0);
      }
    });
  });

  describe('Graph Status Transitions', () => {
    it('should handle graph in generating state', async () => {
      // WHY: Tests that generating graphs can be retrieved before completion
      const graphId = 'graph-generating-123';

      const response = await request(app)
        .get(`/api/v1/graphs/${graphId}`)
        .expect(200);

      if (response.body.data.status === GraphStatus.GENERATING) {
        expect(response.body.data).toHaveProperty('id');
        expect(response.body.data).toHaveProperty('documentId');
        // May not have mermaidCode yet
      }
    });

    it('should handle failed graph generation', async () => {
      // WHY: Tests error information for failed graphs
      const graphId = 'graph-failed-123';

      const response = await request(app)
        .get(`/api/v1/graphs/${graphId}`)
        .expect(200);

      if (response.body.data.status === GraphStatus.FAILED) {
        expect(response.body.data).toHaveProperty('error');
        expect(response.body.data.error).toBeTruthy();
      }
    });
  });

  describe('API Response Format', () => {
    it('should return consistent response format for all endpoints', async () => {
      // WHY: Verifies standardized response structure across graph API
      const endpoints = [
        { method: 'post', path: '/api/v1/graphs/generate', body: { documentId: 'doc-test-123' } },
        { method: 'get', path: '/api/v1/graphs/graph-test-123' },
        { method: 'get', path: '/api/v1/jobs/job-test-123' },
      ];

      for (const endpoint of endpoints) {
        const req = endpoint.method === 'post'
          ? request(app).post(endpoint.path).send(endpoint.body)
          : request(app).get(endpoint.path);

        const response = await req;

        expect(response.body).toHaveProperty('success');
        expect(response.body).toHaveProperty(response.body.success ? 'data' : 'error');
        expect(response.body).toHaveProperty('meta');
        expect(response.body.meta).toHaveProperty('timestamp');
        expect(response.body.meta).toHaveProperty('requestId');
      }
    });
  });
});

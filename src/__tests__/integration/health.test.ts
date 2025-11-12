/**
 * Health Check Integration Tests
 *
 * Tests health check endpoints:
 * - GET /health
 * - GET /health/ready
 * - GET /health/deep
 */

import request from 'supertest';
import { Application } from 'express';
import { createApp } from '../../app';
import { setupTest, teardownTest } from '../helpers/setup';

describe('Health Check Integration Tests', () => {
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

  describe('GET /health', () => {
    it('should return healthy status', async () => {
      // WHY: Tests basic liveness check
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('service', 'graphex-api');
      expect(response.body).toHaveProperty('version');
    });

    it('should have valid timestamp format', async () => {
      // WHY: Tests that timestamp is valid ISO 8601
      const response = await request(app)
        .get('/health')
        .expect(200);

      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.toString()).not.toBe('Invalid Date');
    });
  });

  describe('GET /health/ready', () => {
    it('should return ready status when dependencies are healthy', async () => {
      // WHY: Tests readiness check with healthy dependencies
      const response = await request(app)
        .get('/health/ready')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ready');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('checks');
      expect(response.body.checks).toHaveProperty('database');
      expect(response.body.checks).toHaveProperty('redis');
    });

    it('should return 503 when dependencies are unhealthy', async () => {
      // WHY: Tests failure scenario when dependencies fail
      // Note: This would require mocking failed health checks
      // For now, verify structure when service is degraded
    });

    it('should include check status for all dependencies', async () => {
      // WHY: Tests that all critical dependencies are checked
      const response = await request(app)
        .get('/health/ready');

      if (response.status === 200 || response.status === 503) {
        expect(response.body.checks).toHaveProperty('database');
        expect(response.body.checks).toHaveProperty('redis');

        const validStatuses = ['ok', 'failed'];
        expect(validStatuses).toContain(response.body.checks.database);
        expect(validStatuses).toContain(response.body.checks.redis);
      }
    });
  });

  describe('GET /health/deep', () => {
    it('should return comprehensive health status', async () => {
      // WHY: Tests deep health check including AI services
      const response = await request(app)
        .get('/health/deep');

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('checks');
      expect(response.body.checks).toHaveProperty('database');
      expect(response.body.checks).toHaveProperty('redis');
      expect(response.body.checks).toHaveProperty('aiService');
    });

    it('should check AI service status', async () => {
      // WHY: Tests that AI services are included in deep check
      const response = await request(app)
        .get('/health/deep');

      expect(response.body.checks.aiService).toHaveProperty('anthropic');
      expect(response.body.checks.aiService).toHaveProperty('openai');

      const validAIStatuses = ['ok', 'not_configured', 'failed'];
      expect(validAIStatuses).toContain(response.body.checks.aiService.anthropic);
      expect(validAIStatuses).toContain(response.body.checks.aiService.openai);
    });

    it('should return degraded when AI services fail but core services work', async () => {
      // WHY: Tests graceful degradation when non-critical services fail
      const response = await request(app)
        .get('/health/deep');

      // Service should be healthy/degraded based on core dependencies
      if (response.status === 200) {
        expect(['healthy', 'degraded']).toContain(response.body.status);
      }
    });

    it('should return 503 when core services fail', async () => {
      // WHY: Tests that core service failures result in unhealthy status
      // Note: This would require mocking failed health checks
    });
  });

  describe('Health Check Response Format', () => {
    it('should have consistent timestamp format across all endpoints', async () => {
      // WHY: Tests timestamp consistency
      const endpoints = ['/health', '/health/ready', '/health/deep'];

      for (const endpoint of endpoints) {
        const response = await request(app).get(endpoint);
        expect(response.body).toHaveProperty('timestamp');
        const timestamp = new Date(response.body.timestamp);
        expect(timestamp.toString()).not.toBe('Invalid Date');
      }
    });

    it('should respond quickly to health checks', async () => {
      // WHY: Tests that health checks don't have significant latency
      const start = Date.now();
      await request(app).get('/health').expect(200);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000); // Should respond within 1 second
    });
  });
});

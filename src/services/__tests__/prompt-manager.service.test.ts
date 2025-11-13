/**
 * Tests for Prompt Manager Service
 *
 * Coverage:
 * - Template retrieval (production, staging, experimental)
 * - Context injection with variable substitution
 * - Required context validation
 * - Conditional template processing
 * - Model recommendation logic
 * - Performance tracking and statistics
 * - A/B testing version comparison
 */

import Redis from 'ioredis';
import { Logger } from 'winston';
import { PromptManagerService } from '../prompt-manager.service';
import {
  PromptType,
  PromptVersion,
  PromptContext,
  PromptOutcome,
} from '../../types/prompt.types';
import { getTemplate } from '../../lib/ai/prompt-templates';

// Mock dependencies
jest.mock('ioredis');
jest.mock('winston');

describe('PromptManagerService', () => {
  let service: PromptManagerService;
  let mockRedis: jest.Mocked<Redis>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock Redis
    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      incrbyfloat: jest.fn(),
    } as any;

    // Create mock Logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    // Create service instance
    service = new PromptManagerService(mockRedis, mockLogger);
  });

  // ============================================================
  // TEMPLATE RETRIEVAL TESTS
  // ============================================================

  describe('build() - Template Retrieval', () => {
    it('should build prompt with production version by default', async () => {
      const context: PromptContext = {
        documentText: 'Test document content about machine learning.',
        documentTitle: 'Introduction to ML',
      };

      const result = await service.build('graph-generation', context);

      expect(result.metadata.version).toBe('production');
      expect(result.metadata.templateId).toContain('production');
      expect(result.systemPrompt).toBeTruthy();
      expect(result.userPrompt).toContain('Test document content');
    });

    it('should build prompt with specified version', async () => {
      const context: PromptContext = {
        documentText: 'Test content',
        documentTitle: 'Test',
      };

      const result = await service.build('graph-generation', context, 'experimental');

      expect(result.metadata.version).toBe('experimental');
      expect(result.metadata.templateId).toContain('experimental');
    });

    it('should throw error for non-existent template version', async () => {
      const context: PromptContext = {
        documentText: 'Test',
        documentTitle: 'Test',
      };

      await expect(
        service.build('graph-generation', context, 'invalid' as PromptVersion)
      ).rejects.toThrow('No template found');
    });
  });

  // ============================================================
  // CONTEXT VALIDATION TESTS
  // ============================================================

  describe('build() - Context Validation', () => {
    it('should succeed when all required context is provided', async () => {
      const context: PromptContext = {
        documentText: 'Test content',
        documentTitle: 'Test Title',
      };

      const result = await service.build('graph-generation', context);

      expect(result).toBeDefined();
      expect(result.metadata.contextKeys).toContain('documentText');
      expect(result.metadata.contextKeys).toContain('documentTitle');
    });

    it('should throw error when required context is missing', async () => {
      const context: PromptContext = {
        documentTitle: 'Test Title',
        // Missing documentText
      };

      await expect(service.build('graph-generation', context)).rejects.toThrow(
        'Missing required context fields'
      );
    });

    it('should log warning for missing optional context', async () => {
      const context: PromptContext = {
        nodeA: { title: 'Node A', snippet: 'Description A' },
        nodeB: { title: 'Node B', snippet: 'Description B' },
        relationship: 'enables',
        // Missing optional: userHypothesis
      };

      await service.build('connection-explanation', context);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Optional context fields missing',
        expect.any(Object)
      );
    });
  });

  // ============================================================
  // CONTEXT INJECTION TESTS
  // ============================================================

  describe('build() - Context Injection', () => {
    it('should inject string variables correctly', async () => {
      const context: PromptContext = {
        documentText: 'Machine learning is a subset of AI.',
        documentTitle: 'ML Basics',
      };

      const result = await service.build('graph-generation', context);

      expect(result.userPrompt).toContain('ML Basics');
      expect(result.userPrompt).toContain('Machine learning is a subset of AI.');
    });

    it('should inject object variables as JSON', async () => {
      const graphData = {
        nodes: [
          { key: 'A', title: 'Concept A' },
          { key: 'B', title: 'Concept B' },
        ],
        edges: [{ from: 'A', to: 'B', relationship: 'leads to' }],
      };

      const context: PromptContext = {
        graphData,
      };

      const result = await service.build('quiz-generation', context);

      expect(result.userPrompt).toContain('Concept A');
      expect(result.userPrompt).toContain('Concept B');
      expect(result.userPrompt).toContain('leads to');
    });

    it('should handle nested object properties', async () => {
      const context: PromptContext = {
        nodeA: { title: 'Photosynthesis', snippet: 'Process by which plants...' },
        nodeB: { title: 'Chlorophyll', snippet: 'Green pigment in plants...' },
        relationship: 'requires',
      };

      const result = await service.build('connection-explanation', context);

      expect(result.userPrompt).toContain('Photosynthesis');
      expect(result.userPrompt).toContain('Process by which plants');
      expect(result.userPrompt).toContain('Chlorophyll');
      expect(result.userPrompt).toContain('Green pigment in plants');
      expect(result.userPrompt).toContain('requires');
    });
  });

  // ============================================================
  // CONDITIONAL TEMPLATE TESTS
  // ============================================================

  describe('build() - Conditional Templates', () => {
    it('should include conditional block when condition is true', async () => {
      const context: PromptContext = {
        nodeA: { title: 'Node A', snippet: 'Description A' },
        nodeB: { title: 'Node B', snippet: 'Description B' },
        relationship: 'enables',
        userHypothesis: 'Node A is required for Node B to function',
      };

      const result = await service.build('connection-explanation', context);

      // Should include hypothesis section
      expect(result.userPrompt).toContain("User's Hypothesis");
      expect(result.userPrompt).toContain('Node A is required for Node B to function');
    });

    it('should exclude conditional block when condition is false', async () => {
      const context: PromptContext = {
        nodeA: { title: 'Node A', snippet: 'Description A' },
        nodeB: { title: 'Node B', snippet: 'Description B' },
        relationship: 'enables',
        // No userHypothesis
      };

      const result = await service.build('connection-explanation', context);

      // Should NOT include hypothesis section
      expect(result.userPrompt).not.toContain("User's Hypothesis");
      expect(result.userPrompt).not.toContain('hypothesisAssessment');
    });
  });

  // ============================================================
  // TOKEN ESTIMATION TESTS
  // ============================================================

  describe('build() - Token Estimation', () => {
    it('should estimate tokens for cost prediction', async () => {
      const context: PromptContext = {
        documentText: 'A'.repeat(4000), // ~1000 tokens
        documentTitle: 'Test',
      };

      const result = await service.build('graph-generation', context);

      expect(result.metadata.estimatedTokens).toBeGreaterThan(1000);
      expect(result.metadata.estimatedTokens).toBeLessThan(2000);
    });

    it('should include both system and user prompt in estimation', async () => {
      const context: PromptContext = {
        documentText: 'Short text',
        documentTitle: 'Title',
      };

      const result = await service.build('graph-generation', context);

      // System prompt + user prompt template + context
      expect(result.metadata.estimatedTokens).toBeGreaterThan(100);
    });
  });

  // ============================================================
  // MODEL RECOMMENDATION TESTS
  // ============================================================

  describe('getRecommendedModel()', () => {
    it('should recommend Sonnet 4 for large documents', () => {
      const context: PromptContext = {
        documentText: 'A'.repeat(50000), // Large document
        documentTitle: 'Large Doc',
      };

      const result = service.getRecommendedModel('graph-generation', context);

      expect(result.model).toBe('claude-sonnet-4');
      expect(result.reason).toContain('Large document');
      expect(result.fallbacks).toContain('claude-haiku');
    });

    it('should recommend Haiku for medium documents', () => {
      const context: PromptContext = {
        documentText: 'A'.repeat(20000), // Medium document
        documentTitle: 'Medium Doc',
      };

      const result = service.getRecommendedModel('graph-generation', context);

      expect(result.model).toBe('claude-haiku');
      expect(result.reason).toContain('cost-effective');
      expect(result.fallbacks).toContain('claude-sonnet-4');
    });

    it('should recommend Sonnet 4 for image description', () => {
      const context: PromptContext = {
        imageData: Buffer.from('fake-image-data'),
      };

      const result = service.getRecommendedModel('image-description', context);

      expect(result.model).toBe('claude-sonnet-4');
      expect(result.reason).toContain('vision');
    });

    it('should recommend Haiku for simple tasks', () => {
      const context: PromptContext = {
        nodeA: { title: 'A', snippet: 'Desc A' },
        nodeB: { title: 'B', snippet: 'Desc B' },
        relationship: 'enables',
      };

      const resultExplanation = service.getRecommendedModel('connection-explanation', context);
      expect(resultExplanation.model).toBe('claude-haiku');

      const resultQuiz = service.getRecommendedModel('quiz-generation', { graphData: {} });
      expect(resultQuiz.model).toBe('claude-haiku');
    });

    it('should include cost estimates in recommendations', () => {
      const context: PromptContext = {
        documentText: 'Test content',
        documentTitle: 'Test',
      };

      const result = service.getRecommendedModel('graph-generation', context);

      expect(result.estimatedCost).toBeGreaterThan(0);
      expect(typeof result.estimatedCost).toBe('number');
    });
  });

  // ============================================================
  // PERFORMANCE TRACKING TESTS
  // ============================================================

  describe('recordOutcome()', () => {
    beforeEach(() => {
      mockRedis.get.mockResolvedValue(null); // No existing stats
    });

    it('should record successful outcome', async () => {
      const outcome: PromptOutcome = {
        qualityScore: 85,
        cost: 0.05,
        success: true,
        retries: 1,
        processingTimeMs: 2000,
        model: 'claude-haiku',
      };

      await service.recordOutcome('graph-generation', 'production', outcome);

      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('prompt:stats:graph-generation:production'),
        expect.any(String),
        'EX',
        expect.any(Number)
      );

      // Verify stats structure
      const savedStats = JSON.parse(mockRedis.set.mock.calls[0][1] as string);
      expect(savedStats.totalUses).toBe(1);
      expect(savedStats.successRate).toBe(100);
      expect(savedStats.avgQualityScore).toBe(85);
      expect(savedStats.avgCost).toBe(0.05);
    });

    it('should record failed outcome', async () => {
      const outcome: PromptOutcome = {
        qualityScore: 40,
        cost: 0.03,
        success: false,
        retries: 3,
      };

      await service.recordOutcome('quiz-generation', 'production', outcome);

      const savedStats = JSON.parse(mockRedis.set.mock.calls[0][1] as string);
      expect(savedStats.successRate).toBe(0);
      expect(savedStats.avgQualityScore).toBe(40);
      expect(savedStats.avgRetries).toBe(3);
    });

    it('should calculate running averages correctly', async () => {
      // First outcome
      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          totalUses: 1,
          successRate: 100,
          avgQualityScore: 90,
          avgCost: 0.05,
          avgRetries: 1,
          lastUpdated: new Date(),
        })
      );

      const outcome: PromptOutcome = {
        qualityScore: 70,
        cost: 0.03,
        success: true,
        retries: 2,
      };

      await service.recordOutcome('graph-generation', 'production', outcome);

      const savedStats = JSON.parse(mockRedis.set.mock.calls[0][1] as string);
      expect(savedStats.totalUses).toBe(2);
      expect(savedStats.avgQualityScore).toBe(80); // (90 + 70) / 2
      expect(savedStats.avgCost).toBe(0.04); // (0.05 + 0.03) / 2
      expect(savedStats.avgRetries).toBe(1.5); // (1 + 2) / 2
    });

    it('should not throw if tracking fails', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis error'));

      const outcome: PromptOutcome = {
        qualityScore: 85,
        cost: 0.05,
        success: true,
        retries: 1,
      };

      // Should not throw
      await expect(
        service.recordOutcome('graph-generation', 'production', outcome)
      ).resolves.not.toThrow();

      // Should log warning
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to record prompt outcome',
        expect.any(Object)
      );
    });
  });

  describe('getStats()', () => {
    it('should return stats from Redis', async () => {
      const mockStats = {
        totalUses: 100,
        successRate: 92,
        avgQualityScore: 85,
        avgCost: 0.04,
        avgRetries: 1.2,
        lastUpdated: new Date().toISOString(),
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(mockStats));

      const stats = await service.getStats('graph-generation', 'production');

      expect(stats.totalUses).toBe(100);
      expect(stats.successRate).toBe(92);
      expect(stats.avgQualityScore).toBe(85);
    });

    it('should return default stats for new templates', async () => {
      mockRedis.get.mockResolvedValue(null);

      const stats = await service.getStats('image-description', 'experimental');

      expect(stats.totalUses).toBe(0);
      expect(stats.successRate).toBe(0);
      expect(stats.avgQualityScore).toBe(0);
    });
  });

  // ============================================================
  // A/B TESTING TESTS
  // ============================================================

  describe('compareVersions()', () => {
    beforeEach(() => {
      // Mock stats for different versions
      mockRedis.get.mockImplementation((key: string) => {
        if (key.includes('production')) {
          return Promise.resolve(
            JSON.stringify({
              totalUses: 100,
              successRate: 92,
              avgQualityScore: 85,
              avgCost: 0.04,
              avgRetries: 1.2,
              lastUpdated: new Date(),
            })
          );
        }
        if (key.includes('experimental')) {
          return Promise.resolve(
            JSON.stringify({
              totalUses: 20,
              successRate: 88,
              avgQualityScore: 88,
              avgCost: 0.06,
              avgRetries: 1.5,
              lastUpdated: new Date(),
            })
          );
        }
        return Promise.resolve(null);
      });
    });

    it('should compare all versions of a prompt type', async () => {
      const result = await service.compareVersions('graph-generation');

      expect(result.versions).toHaveLength(2); // production + experimental
      expect(result.versions.some((v) => v.version === 'production')).toBe(true);
      expect(result.versions.some((v) => v.version === 'experimental')).toBe(true);
    });

    it('should recommend best version based on composite score', async () => {
      const result = await service.compareVersions('graph-generation');

      // Production should win (better success rate and more uses)
      expect(result.bestVersion).toBe('production');
    });

    it('should provide action recommendations for each version', async () => {
      const result = await service.compareVersions('graph-generation');

      const productionVersion = result.versions.find((v) => v.version === 'production');
      expect(productionVersion?.recommendation).toBe('use');

      const experimentalVersion = result.versions.find((v) => v.version === 'experimental');
      expect(experimentalVersion?.recommendation).toMatch(/test|use/);
    });
  });

  // ============================================================
  // INTEGRATION TESTS
  // ============================================================

  describe('Integration: Build and Track', () => {
    it('should build prompt and track outcome successfully', async () => {
      mockRedis.get.mockResolvedValue(null);

      // Build prompt
      const context: PromptContext = {
        documentText: 'Machine learning algorithms analyze data.',
        documentTitle: 'ML Introduction',
      };

      const built = await service.build('graph-generation', context);
      expect(built.userPrompt).toContain('Machine learning');

      // Record outcome
      const outcome: PromptOutcome = {
        qualityScore: 90,
        cost: 0.045,
        success: true,
        retries: 1,
      };

      await service.recordOutcome('graph-generation', 'production', outcome);

      // Verify tracking
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should handle complete workflow with model recommendation', async () => {
      const context: PromptContext = {
        documentText: 'A'.repeat(30000),
        documentTitle: 'Large Document',
      };

      // Get recommendation
      const recommendation = service.getRecommendedModel('graph-generation', context);
      expect(recommendation.model).toBe('claude-haiku');

      // Build prompt
      const built = await service.build('graph-generation', context);
      expect(built.metadata.estimatedTokens).toBeGreaterThan(5000);

      // Simulate outcome
      const outcome: PromptOutcome = {
        qualityScore: 85,
        cost: recommendation.estimatedCost,
        success: true,
        retries: 1,
        model: recommendation.model,
      };

      await service.recordOutcome('graph-generation', 'production', outcome);

      expect(mockRedis.set).toHaveBeenCalled();
    });
  });
});

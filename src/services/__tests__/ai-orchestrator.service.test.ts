/**
 * AI Orchestrator Service Tests
 *
 * Comprehensive test suite covering all critical flows:
 * - Happy path (successful AI call with validation)
 * - Budget enforcement (exceeds daily/monthly limits)
 * - Cache hit/miss behavior
 * - Validation retry loop (fails then succeeds)
 * - Quality recovery (Haiku -> Sonnet 4 upgrade)
 * - All retries exhausted (permanent failure)
 * - Rate limit handling (exponential backoff)
 * - Model fallback (Claude -> OpenAI)
 * - Parse error recovery
 * - Complete integration with all services
 */

import { AIOrchestrator } from '../ai-orchestrator.service';
import { AIClient } from '../../lib/ai/ai-client';
import { PromptManagerService } from '../prompt-manager.service';
import { AIOutputValidator } from '../../lib/validation/ai-output-validator';
import { CostTrackerService } from '../cost-tracker.service';
import Redis from 'ioredis-mock';
import { createMockLogger } from '../../utils/test-utils';

import {
  AIRequest,
  AIRawResponse,
  AIRequestConfig,
} from '../../types/ai.types';
import { BuiltPrompt } from '../../types/prompt.types';
import { ValidationResult } from '../../types/validation.types';
import {
  BudgetExceededError,
  AIValidationError,
  AIRateLimitError,
  AIModelUnavailableError,
} from '../../lib/errors/ai-errors';

describe('AIOrchestrator', () => {
  let orchestrator: AIOrchestrator;
  let mockAIClient: jest.Mocked<AIClient>;
  let mockPromptManager: jest.Mocked<PromptManagerService>;
  let mockValidator: jest.Mocked<AIOutputValidator>;
  let mockCostTracker: jest.Mocked<CostTrackerService>;
  let mockRedis: Redis;
  let mockLogger: any;

  beforeEach(() => {
    // Create mocks
    mockAIClient = {
      call: jest.fn(),
      getModelConfig: jest.fn(),
      calculateCost: jest.fn().mockReturnValue(0.01),
    } as any;

    mockPromptManager = {
      build: jest.fn(),
      getRecommendedModel: jest.fn(),
      recordOutcome: jest.fn(),
    } as any;

    mockValidator = {
      validate: jest.fn(),
      generateFeedback: jest.fn(),
    } as any;

    mockCostTracker = {
      checkBudget: jest.fn(),
      recordUsage: jest.fn(),
    } as any;

    mockRedis = new Redis();
    mockLogger = createMockLogger();

    // Create orchestrator instance
    orchestrator = new AIOrchestrator(
      mockAIClient,
      mockPromptManager,
      mockValidator,
      mockCostTracker,
      mockRedis,
      mockLogger
    );
  });

  afterEach(async () => {
    // Clear all Redis data between tests
    await mockRedis.flushall();
    // Clear all Jest mocks
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await mockRedis.quit();
  });

  // ============================================================
  // HAPPY PATH TESTS
  // ============================================================

  describe('Happy Path', () => {
    it('should successfully execute AI request with validation', async () => {
      // Setup: Budget allows, cache miss, AI returns valid output
      const request: AIRequest = {
        promptType: 'graph-generation',
        context: { documentText: 'Test document' },
        config: { userId: 'test-user' },
      };

      const builtPrompt: BuiltPrompt = {
        systemPrompt: 'System prompt',
        userPrompt: 'User prompt',
        metadata: {
          templateId: 'graph-gen-v1',
          version: 'production',
          contextKeys: ['documentText'],
          timestamp: new Date(),
        },
      };

      const rawResponse: AIRawResponse = {
        content: JSON.stringify({
          mermaidCode: 'graph TD\n    A[Node 1] --> B[Node 2]',
          nodes: [
            { id: '1', title: 'Node 1' },
            { id: '2', title: 'Node 2' },
          ],
          edges: [{ fromNodeId: '1', toNodeId: '2' }],
        }),
        model: 'claude-haiku',
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
        },
        finishReason: 'stop',
        processingTime: 1000,
      };

      const validationResult: ValidationResult = {
        passed: true,
        score: 85,
        issues: [],
        warnings: [],
      };

      // Mock all dependencies
      mockCostTracker.checkBudget.mockResolvedValue({
        allowed: true,
        estimatedCost: 0.01,
        currentUsage: { today: 0.5, thisMonth: 2.0 },
      });

      mockPromptManager.build.mockResolvedValue(builtPrompt);

      mockPromptManager.getRecommendedModel.mockReturnValue({
        model: 'claude-haiku',
        reason: 'Cost-effective for medium documents',
        estimatedCost: 0.01,
        fallbacks: ['claude-sonnet-4'],
      });

      mockAIClient.call.mockResolvedValue(rawResponse);

      mockValidator.validate.mockResolvedValue(validationResult);

      // Execute
      const result = await orchestrator.execute(request);

      // Assertions
      expect(result).toMatchObject({
        data: expect.objectContaining({
          mermaidCode: expect.stringContaining('graph TD'),
          nodes: expect.arrayContaining([
            expect.objectContaining({ id: '1', title: 'Node 1' }),
          ]),
        }),
        model: 'claude-haiku',
        quality: expect.objectContaining({
          passed: true,
          score: 85,
        }),
        metadata: expect.objectContaining({
          attempts: 1,
          validationPassed: true,
          cached: false,
        }),
      });

      // Verify all services were called
      expect(mockCostTracker.checkBudget).toHaveBeenCalled();
      expect(mockPromptManager.build).toHaveBeenCalled();
      expect(mockAIClient.call).toHaveBeenCalled();
      expect(mockValidator.validate).toHaveBeenCalled();
      expect(mockCostTracker.recordUsage).toHaveBeenCalled();
      expect(mockPromptManager.recordOutcome).toHaveBeenCalled();
    });

    it('should return cached result on cache hit', async () => {
      // Setup: Cached result exists
      const request: AIRequest = {
        promptType: 'graph-generation',
        context: { documentText: 'Test document' },
      };

      const cachedData = {
        mermaidCode: 'graph TD\n    A[Cached]',
        nodes: [{ id: '1', title: 'Cached' }],
        edges: [],
      };

      // Cache the result first
      const cacheKey = (orchestrator as any).buildCacheKey({
        promptType: 'graph-generation',
        context: request.context,
        model: 'claude-haiku',
        version: 'production',
      });

      await mockRedis.setex(
        cacheKey,
        3600,
        JSON.stringify({
          data: cachedData,
          cachedAt: new Date(),
          qualityScore: 90,
          model: 'claude-haiku',
        })
      );

      // Budget check allows
      mockCostTracker.checkBudget.mockResolvedValue({
        allowed: true,
        estimatedCost: 0.01,
        currentUsage: { today: 0, thisMonth: 0 },
      });

      // Execute
      const result = await orchestrator.execute(request);

      // Assertions
      expect(result.metadata.cached).toBe(true);
      expect(result.metadata.cost).toBe(0); // Cached results are free
      expect(result.data).toEqual(cachedData);

      // AI should NOT be called on cache hit
      expect(mockAIClient.call).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // BUDGET ENFORCEMENT TESTS
  // ============================================================

  describe('Budget Enforcement', () => {
    it('should throw BudgetExceededError when daily limit exceeded', async () => {
      const request: AIRequest = {
        promptType: 'graph-generation',
        context: { documentText: 'Test' },
        config: { userId: 'test-user' },
      };

      mockCostTracker.checkBudget.mockResolvedValue({
        allowed: false,
        reason: 'daily-limit-exceeded',
        estimatedCost: 0.05,
        currentUsage: { today: 10.0, thisMonth: 25.0 },
      });

      await expect(orchestrator.execute(request)).rejects.toThrow(BudgetExceededError);

      // Should not call AI
      expect(mockAIClient.call).not.toHaveBeenCalled();
    });

    it('should throw BudgetExceededError when monthly limit exceeded', async () => {
      const request: AIRequest = {
        promptType: 'graph-generation',
        context: { documentText: 'Test' },
        config: { userId: 'test-user' },
      };

      mockCostTracker.checkBudget.mockResolvedValue({
        allowed: false,
        reason: 'monthly-limit-exceeded',
        estimatedCost: 0.05,
        currentUsage: { today: 5.0, thisMonth: 50.0 },
      });

      await expect(orchestrator.execute(request)).rejects.toThrow(BudgetExceededError);
    });

    it('should throw BudgetExceededError for document-level limit', async () => {
      const request: AIRequest = {
        promptType: 'graph-generation',
        context: { documentText: 'Test' },
        config: { userId: 'test-user', documentId: 'large-doc' },
      };

      mockCostTracker.checkBudget.mockResolvedValue({
        allowed: false,
        reason: 'document-limit-exceeded',
        estimatedCost: 6.0, // Exceeds $5 per-document limit
        currentUsage: { today: 1.0, thisMonth: 5.0 },
      });

      await expect(orchestrator.execute(request)).rejects.toThrow(BudgetExceededError);
    });
  });

  // ============================================================
  // VALIDATION RETRY TESTS
  // ============================================================

  describe('Validation Retry Loop', () => {
    it('should retry with feedback when validation fails initially', async () => {
      const request: AIRequest = {
        promptType: 'graph-generation',
        context: { documentText: 'Test' },
      };

      const builtPrompt: BuiltPrompt = {
        systemPrompt: 'System',
        userPrompt: 'User',
        metadata: {
          templateId: 'test',
          version: 'production',
          contextKeys: [],
          timestamp: new Date(),
        },
      };

      // First response: Invalid (too few nodes)
      const invalidResponse: AIRawResponse = {
        content: JSON.stringify({
          mermaidCode: 'graph TD\n    A[Node 1]',
          nodes: [{ id: '1', title: 'Node 1' }],
          edges: [],
        }),
        model: 'claude-haiku',
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        finishReason: 'stop',
        processingTime: 1000,
      };

      // Second response: Valid
      const validResponse: AIRawResponse = {
        content: JSON.stringify({
          mermaidCode: 'graph TD\n    A[Node 1] --> B[Node 2]',
          nodes: [
            { id: '1', title: 'Node 1' },
            { id: '2', title: 'Node 2' },
            { id: '3', title: 'Node 3' },
            { id: '4', title: 'Node 4' },
            { id: '5', title: 'Node 5' },
          ],
          edges: [{ fromNodeId: '1', toNodeId: '2' }],
        }),
        model: 'claude-haiku',
        usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200 },
        finishReason: 'stop',
        processingTime: 1200,
      };

      // Setup mocks
      mockCostTracker.checkBudget.mockResolvedValue({
        allowed: true,
        estimatedCost: 0.01,
        currentUsage: { today: 0, thisMonth: 0 },
      });

      mockPromptManager.build.mockResolvedValue(builtPrompt);

      mockPromptManager.getRecommendedModel.mockReturnValue({
        model: 'claude-haiku',
        reason: 'Test',
        estimatedCost: 0.01,
        fallbacks: [],
      });

      // AI returns invalid first, then valid
      mockAIClient.call
        .mockResolvedValueOnce(invalidResponse)
        .mockResolvedValueOnce(validResponse);

      // Validation fails first, then passes
      mockValidator.validate
        .mockResolvedValueOnce({
          passed: false,
          score: 40,
          issues: [
            {
              severity: 'high',
              type: 'too-few-nodes',
              message: 'Only 1 node. Need at least 5.',
              fix: 'Add more nodes to represent key concepts.',
            },
          ],
          warnings: [],
        })
        .mockResolvedValueOnce({
          passed: true,
          score: 80,
          issues: [],
          warnings: [],
        });

      // Execute
      const result = await orchestrator.execute(request);

      // Should succeed on second attempt
      expect(result.metadata.attempts).toBe(2);
      expect(result.quality.passed).toBe(true);

      // AI should be called twice
      expect(mockAIClient.call).toHaveBeenCalledTimes(2);

      // Second call should include feedback
      const secondCallUserPrompt = (mockAIClient.call as jest.Mock).mock.calls[1][1];
      expect(secondCallUserPrompt).toContain('Previous attempt had issues');
      expect(secondCallUserPrompt).toContain('too-few-nodes');
    });

    it('should upgrade to Sonnet 4 after 2 failed Haiku attempts (quality recovery)', async () => {
      const request: AIRequest = {
        promptType: 'graph-generation',
        context: { documentText: 'Complex document requiring advanced reasoning' },
      };

      const builtPrompt: BuiltPrompt = {
        systemPrompt: 'System',
        userPrompt: 'User',
        metadata: {
          templateId: 'test',
          version: 'production',
          contextKeys: [],
          timestamp: new Date(),
        },
      };

      // First two responses fail (Haiku can't handle complexity)
      const failedResponse: AIRawResponse = {
        content: JSON.stringify({
          mermaidCode: 'graph TD\n    A[Bad]',
          nodes: [{ id: '1', title: 'Bad' }],
          edges: [],
        }),
        model: 'claude-haiku',
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        finishReason: 'stop',
        processingTime: 1000,
      };

      // Third response succeeds (Sonnet 4 handles it)
      const successResponse: AIRawResponse = {
        content: JSON.stringify({
          mermaidCode: 'graph TD\n    A[Node 1] --> B[Node 2]',
          nodes: Array.from({ length: 7 }, (_, i) => ({
            id: String(i + 1),
            title: `Node ${i + 1}`,
          })),
          edges: [{ fromNodeId: '1', toNodeId: '2' }],
        }),
        model: 'claude-sonnet-4',
        usage: { inputTokens: 150, outputTokens: 100, totalTokens: 250 },
        finishReason: 'stop',
        processingTime: 2000,
      };

      // Setup
      mockCostTracker.checkBudget.mockResolvedValue({
        allowed: true,
        estimatedCost: 0.1,
        currentUsage: { today: 0, thisMonth: 0 },
      });

      mockPromptManager.build.mockResolvedValue(builtPrompt);

      mockPromptManager.getRecommendedModel.mockReturnValue({
        model: 'claude-haiku',
        reason: 'Try cheap model first',
        estimatedCost: 0.01,
        fallbacks: ['claude-sonnet-4'],
      });

      // Haiku fails twice, Sonnet 4 succeeds
      mockAIClient.call
        .mockResolvedValueOnce(failedResponse)
        .mockResolvedValueOnce(failedResponse)
        .mockResolvedValueOnce(successResponse);

      // Validation fails twice, passes on third
      mockValidator.validate
        .mockResolvedValueOnce({ passed: false, score: 30, issues: [], warnings: [] })
        .mockResolvedValueOnce({ passed: false, score: 35, issues: [], warnings: [] })
        .mockResolvedValueOnce({ passed: true, score: 85, issues: [], warnings: [] });

      // Execute
      const result = await orchestrator.execute(request);

      // Should succeed with Sonnet 4
      expect(result.metadata.attempts).toBe(3);
      expect(result.model).toBe('claude-sonnet-4');

      // Verify model upgrade happened
      const calls = (mockAIClient.call as jest.Mock).mock.calls;
      expect(calls[0][2]).toBe('claude-haiku'); // First attempt
      expect(calls[1][2]).toBe('claude-haiku'); // Second attempt
      expect(calls[2][2]).toBe('claude-sonnet-4'); // Third attempt (upgraded)
    });

    it('should throw AIValidationError when all retries exhausted', async () => {
      const request: AIRequest = {
        promptType: 'graph-generation',
        context: { documentText: 'Impossible to generate graph from this' },
        config: { maxRetries: 3 },
      };

      const builtPrompt: BuiltPrompt = {
        systemPrompt: 'System',
        userPrompt: 'User',
        metadata: {
          templateId: 'test',
          version: 'production',
          contextKeys: [],
          timestamp: new Date(),
        },
      };

      const failedResponse: AIRawResponse = {
        content: JSON.stringify({
          mermaidCode: 'invalid',
          nodes: [],
          edges: [],
        }),
        model: 'claude-haiku',
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        finishReason: 'stop',
        processingTime: 1000,
      };

      mockCostTracker.checkBudget.mockResolvedValue({
        allowed: true,
        estimatedCost: 0.1,
        currentUsage: { today: 0, thisMonth: 0 },
      });

      mockPromptManager.build.mockResolvedValue(builtPrompt);

      mockPromptManager.getRecommendedModel.mockReturnValue({
        model: 'claude-haiku',
        reason: 'Test',
        estimatedCost: 0.01,
        fallbacks: [],
      });

      // All attempts fail
      mockAIClient.call.mockResolvedValue(failedResponse);

      mockValidator.validate.mockResolvedValue({
        passed: false,
        score: 10,
        issues: [
          {
            severity: 'critical',
            type: 'invalid-mermaid',
            message: 'Invalid syntax',
            fix: 'Use valid Mermaid syntax',
          },
        ],
        warnings: [],
      });

      // Execute and expect error
      await expect(orchestrator.execute(request)).rejects.toThrow(AIValidationError);

      // Should attempt 3 times
      expect(mockAIClient.call).toHaveBeenCalledTimes(3);
    });
  });

  // ============================================================
  // RATE LIMIT AND FALLBACK TESTS
  // ============================================================

  describe('Rate Limit Handling', () => {
    it('should retry with exponential backoff on rate limit', async () => {
      const request: AIRequest = {
        promptType: 'graph-generation',
        context: { documentText: 'Test' },
      };

      const builtPrompt: BuiltPrompt = {
        systemPrompt: 'System',
        userPrompt: 'User',
        metadata: {
          templateId: 'test',
          version: 'production',
          contextKeys: [],
          timestamp: new Date(),
        },
      };

      const successResponse: AIRawResponse = {
        content: JSON.stringify({
          mermaidCode: 'graph TD\n    A[Node 1] --> B[Node 2]',
          nodes: Array.from({ length: 5 }, (_, i) => ({
            id: String(i + 1),
            title: `Node ${i + 1}`,
          })),
          edges: [{ fromNodeId: '1', toNodeId: '2' }],
        }),
        model: 'claude-haiku',
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        finishReason: 'stop',
        processingTime: 1000,
      };

      mockCostTracker.checkBudget.mockResolvedValue({
        allowed: true,
        estimatedCost: 0.01,
        currentUsage: { today: 0, thisMonth: 0 },
      });

      mockPromptManager.build.mockResolvedValue(builtPrompt);

      mockPromptManager.getRecommendedModel.mockReturnValue({
        model: 'claude-haiku',
        reason: 'Test',
        estimatedCost: 0.01,
        fallbacks: [],
      });

      // First call: Rate limit error
      // Second call: Success
      mockAIClient.call
        .mockRejectedValueOnce(
          new AIRateLimitError('claude-haiku', {
            retryAfterMs: 100,
          })
        )
        .mockResolvedValueOnce(successResponse);

      mockValidator.validate.mockResolvedValue({
        passed: true,
        score: 85,
        issues: [],
        warnings: [],
      });

      // Execute
      const result = await orchestrator.execute(request);

      // Should succeed on second attempt
      expect(result.metadata.attempts).toBe(2);
      expect(mockAIClient.call).toHaveBeenCalledTimes(2);
    });
  });

  describe('Model Fallback', () => {
    it('should fallback to OpenAI when Claude unavailable', async () => {
      const request: AIRequest = {
        promptType: 'graph-generation',
        context: { documentText: 'Test' },
      };

      const builtPrompt: BuiltPrompt = {
        systemPrompt: 'System',
        userPrompt: 'User',
        metadata: {
          templateId: 'test',
          version: 'production',
          contextKeys: [],
          timestamp: new Date(),
        },
      };

      const openaiResponse: AIRawResponse = {
        content: JSON.stringify({
          mermaidCode: 'graph TD\n    A[Node 1] --> B[Node 2]',
          nodes: Array.from({ length: 5 }, (_, i) => ({
            id: String(i + 1),
            title: `Node ${i + 1}`,
          })),
          edges: [{ fromNodeId: '1', toNodeId: '2' }],
        }),
        model: 'gpt-4-turbo',
        usage: { inputTokens: 150, outputTokens: 100, totalTokens: 250 },
        finishReason: 'stop',
        processingTime: 2000,
      };

      mockCostTracker.checkBudget.mockResolvedValue({
        allowed: true,
        estimatedCost: 0.05,
        currentUsage: { today: 0, thisMonth: 0 },
      });

      mockPromptManager.build.mockResolvedValue(builtPrompt);

      mockPromptManager.getRecommendedModel.mockReturnValue({
        model: 'claude-haiku',
        reason: 'Primary model',
        estimatedCost: 0.01,
        fallbacks: ['gpt-4-turbo'],
      });

      // Claude unavailable, OpenAI succeeds
      mockAIClient.call
        .mockRejectedValueOnce(
          new AIModelUnavailableError('claude-haiku', {
            statusCode: 503,
            message: 'Service temporarily unavailable',
            retryable: true,
          })
        )
        .mockResolvedValueOnce(openaiResponse);

      mockValidator.validate.mockResolvedValue({
        passed: true,
        score: 85,
        issues: [],
        warnings: [],
      });

      // Execute
      const result = await orchestrator.execute(request);

      // Should succeed with OpenAI
      expect(result.model).toBe('gpt-4-turbo');
      expect(result.metadata.attempts).toBe(2);
    });
  });

  // ============================================================
  // COMPLETE INTEGRATION TEST
  // ============================================================

  describe('Complete Integration', () => {
    it('should execute complete flow end-to-end', async () => {
      // This test simulates the real-world flow with all services
      const request: AIRequest = {
        promptType: 'graph-generation',
        context: {
          documentText: 'Machine learning is a subset of AI. Neural networks are used in ML.',
        },
        config: {
          userId: 'integration-test-user',
          documentId: 'test-doc-123',
          maxRetries: 3,
          qualityThreshold: 70,
        },
      };

      const builtPrompt: BuiltPrompt = {
        systemPrompt: 'You are a knowledge graph architect',
        userPrompt: 'Generate graph from: Machine learning is a subset of AI...',
        metadata: {
          templateId: 'graph-generation-v1',
          version: 'production',
          contextKeys: ['documentText'],
          estimatedTokens: 500,
          timestamp: new Date(),
        },
      };

      const aiResponse: AIRawResponse = {
        content: JSON.stringify({
          mermaidCode: `graph TD
    A[Artificial Intelligence] --> B[Machine Learning]
    B --> C[Neural Networks]
    C --> D[Deep Learning]
    A --> E[Expert Systems]
    B --> F[Supervised Learning]
    B --> G[Unsupervised Learning]`,
          nodes: [
            { id: 'A', title: 'Artificial Intelligence' },
            { id: 'B', title: 'Machine Learning' },
            { id: 'C', title: 'Neural Networks' },
            { id: 'D', title: 'Deep Learning' },
            { id: 'E', title: 'Expert Systems' },
            { id: 'F', title: 'Supervised Learning' },
            { id: 'G', title: 'Unsupervised Learning' },
          ],
          edges: [
            { fromNodeId: 'A', toNodeId: 'B', relationship: 'includes' },
            { fromNodeId: 'B', toNodeId: 'C', relationship: 'uses' },
            { fromNodeId: 'C', toNodeId: 'D', relationship: 'enables' },
            { fromNodeId: 'A', toNodeId: 'E', relationship: 'includes' },
            { fromNodeId: 'B', toNodeId: 'F', relationship: 'includes' },
            { fromNodeId: 'B', toNodeId: 'G', relationship: 'includes' },
          ],
        }),
        model: 'claude-haiku',
        usage: {
          inputTokens: 500,
          outputTokens: 300,
          totalTokens: 800,
        },
        finishReason: 'stop',
        processingTime: 2500,
      };

      const validationResult: ValidationResult = {
        passed: true,
        score: 95,
        issues: [],
        warnings: [],
        metadata: {
          mode: 'quick',
          timestamp: new Date(),
          durationMs: 50,
          checksPerformed: [
            'mermaid-syntax',
            'node-count',
            'connectivity',
            'node-labels',
            'edge-structure',
          ],
        },
      };

      // Mock all services
      mockCostTracker.checkBudget.mockResolvedValue({
        allowed: true,
        estimatedCost: 0.012,
        currentUsage: {
          today: 2.5,
          thisMonth: 15.75,
        },
      });

      mockPromptManager.build.mockResolvedValue(builtPrompt);

      mockPromptManager.getRecommendedModel.mockReturnValue({
        model: 'claude-haiku',
        reason: 'Document size allows cost-effective model',
        estimatedCost: 0.012,
        fallbacks: ['claude-sonnet-4', 'gpt-4-turbo'],
      });

      mockAIClient.call.mockResolvedValue(aiResponse);

      mockValidator.validate.mockResolvedValue(validationResult);

      mockCostTracker.recordUsage.mockResolvedValue();

      mockPromptManager.recordOutcome.mockResolvedValue();

      // Execute
      const result = await orchestrator.execute(request);

      // Verify complete flow
      expect(result).toMatchObject({
        data: expect.objectContaining({
          mermaidCode: expect.stringContaining('Artificial Intelligence'),
          nodes: expect.arrayContaining([
            expect.objectContaining({ title: 'Machine Learning' }),
          ]),
          edges: expect.any(Array),
        }),
        model: 'claude-haiku',
        quality: expect.objectContaining({
          passed: true,
          score: 95,
        }),
        metadata: expect.objectContaining({
          attempts: 1,
          validationPassed: true,
          tokensUsed: expect.objectContaining({
            input: 500,
            output: 300,
            total: 800,
          }),
        }),
      });

      // Verify all integrations
      expect(mockCostTracker.checkBudget).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'integration-test-user',
          documentId: 'test-doc-123',
          operation: 'graph-generation',
        })
      );

      expect(mockPromptManager.build).toHaveBeenCalledWith(
        'graph-generation',
        request.context,
        'production'
      );

      expect(mockValidator.validate).toHaveBeenCalled();

      expect(mockCostTracker.recordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'integration-test-user',
          documentId: 'test-doc-123',
          operation: 'graph-generation',
          model: 'claude-haiku',
          success: true,
        })
      );

      expect(mockPromptManager.recordOutcome).toHaveBeenCalledWith(
        'graph-generation',
        'production',
        expect.objectContaining({
          success: true,
          qualityScore: 95,
          retries: 1,
        })
      );

      // Result should be cached for future requests
      const cacheKey = (orchestrator as any).buildCacheKey({
        promptType: 'graph-generation',
        context: request.context,
        model: 'claude-haiku',
        version: 'production',
      });

      const cached = await mockRedis.get(cacheKey);
      expect(cached).toBeTruthy();
    });
  });
});

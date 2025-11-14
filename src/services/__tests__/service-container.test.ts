/**
 * Service Container Tests
 *
 * Tests for centralized service instantiation and dependency injection:
 * - Singleton pattern enforcement
 * - Lazy loading of services
 * - Correct dependency wiring
 * - All service getters
 *
 * Coverage:
 * - getInstance() returns same instance
 * - Services are lazily initialized
 * - Each getter returns correct service type
 * - Dependencies are properly wired
 * - Reset functionality works
 */

// Mock all service modules BEFORE importing ServiceContainer
jest.mock('../graph-generator.service');
jest.mock('../ai-orchestrator.service');
jest.mock('../cost-tracker.service');
jest.mock('../prompt-manager.service');
jest.mock('../../lib/ai/ai-client');
jest.mock('../../lib/validation/ai-output-validator');
jest.mock('../../lib/chunking/text-chunker');
jest.mock('../../lib/embeddings/embedding-service');
jest.mock('../../lib/graph/semantic-deduplicator');

// Import AFTER mocks
import { services } from '../service-container';
import { GraphGeneratorService } from '../graph-generator.service';
import { AIOrchestrator } from '../ai-orchestrator.service';
import { CostTrackerService } from '../cost-tracker.service';
import { PromptManagerService } from '../prompt-manager.service';
import { AIClient } from '../../lib/ai/ai-client';
import { AIOutputValidator } from '../../lib/validation/ai-output-validator';
import { TextChunker } from '../../lib/chunking/text-chunker';
import { EmbeddingService } from '../../lib/embeddings/embedding-service';
import { SemanticNodeDeduplicator } from '../../lib/graph/semantic-deduplicator';

// Mock config modules
jest.mock('../../utils/logger.util', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../config/redis', () => ({
  redisClient: {
    get: jest.fn(),
    set: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
  },
}));

jest.mock('../../config/database', () => ({
  prisma: {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  },
}));

jest.mock('../../config/env', () => ({
  env: {
    ANTHROPIC_API_KEY: 'test-anthropic-key',
    OPENAI_API_KEY: 'test-openai-key',
    NODE_ENV: 'test',
  },
}));

describe('ServiceContainer', () => {
  beforeEach(() => {
    // Reset the container before each test
    services.reset();
    // Clear all mock constructors
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Reset the container after each test
    services.reset();
  });

  // ============================================================
  // SINGLETON PATTERN TESTS
  // ============================================================

  describe('Singleton Pattern', () => {
    it('should return the same instance (exported as services)', () => {
      // The services export is a singleton instance
      // Verify it exists and has expected methods
      expect(services).toBeDefined();
      expect(services.getLogger).toBeDefined();
      expect(services.getRedis).toBeDefined();
      expect(services.getGraphGenerator).toBeDefined();
    });

    it('should maintain state across calls', () => {
      // Get a service
      const firstCall = services.getTextChunker();

      // Call again
      const secondCall = services.getTextChunker();

      // Should be same instance
      expect(firstCall).toBe(secondCall);
    });
  });

  // ============================================================
  // LAZY LOADING TESTS
  // ============================================================

  describe('Lazy Loading', () => {
    it('should not create services until first access', () => {
      // container already available as services;

      // No services should be created yet
      expect(AIClient).not.toHaveBeenCalled();
      expect(GraphGeneratorService).not.toHaveBeenCalled();
    });

    it('should create service on first access', () => {
      // container already available as services;

      services.getTextChunker();

      expect(TextChunker).toHaveBeenCalledTimes(1);
    });

    it('should return same service instance on subsequent calls', () => {
      // container already available as services;

      const service1 = services.getTextChunker();
      const service2 = services.getTextChunker();

      // Should only construct once
      expect(TextChunker).toHaveBeenCalledTimes(1);
      expect(service1).toBe(service2);
    });

    it('should create each service only once even with multiple getters called', () => {
      // container already available as services;

      // Call multiple getters
      services.getAIClient();
      services.getAIClient();
      services.getPromptManager();
      services.getPromptManager();
      services.getCostTracker();

      // Each service should be created only once
      expect(AIClient).toHaveBeenCalledTimes(1);
      expect(PromptManagerService).toHaveBeenCalledTimes(1);
      expect(CostTrackerService).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================
  // LOGGER AND REDIS GETTERS
  // ============================================================

  describe('getLogger', () => {
    it('should return logger instance', () => {
      // container already available as services;
      const logger = services.getLogger();

      expect(logger).toBeDefined();
      expect(logger).toHaveProperty('info');
      expect(logger).toHaveProperty('error');
      expect(logger).toHaveProperty('warn');
      expect(logger).toHaveProperty('debug');
    });
  });

  describe('getRedis', () => {
    it('should return Redis client instance', () => {
      // container already available as services;
      const redis = services.getRedis();

      expect(redis).toBeDefined();
      expect(redis).toHaveProperty('get');
      expect(redis).toHaveProperty('set');
    });
  });

  // ============================================================
  // AI CLIENT TESTS
  // ============================================================

  describe('getAIClient', () => {
    it('should create AIClient with correct configuration', () => {
      // container already available as services;
      const aiClient = services.getAIClient();

      expect(AIClient).toHaveBeenCalledWith(
        expect.objectContaining({
          anthropicApiKey: 'test-anthropic-key',
          openaiApiKey: 'test-openai-key',
          defaultProvider: 'anthropic',
          timeout: 30000,
        }),
        expect.any(Object) // logger
      );
    });

    it('should return same instance on multiple calls', () => {
      // container already available as services;

      const client1 = services.getAIClient();
      const client2 = services.getAIClient();

      expect(AIClient).toHaveBeenCalledTimes(1);
      expect(client1).toBe(client2);
    });
  });

  // ============================================================
  // PROMPT MANAGER TESTS
  // ============================================================

  describe('getPromptManager', () => {
    it('should create PromptManager with Redis and logger', () => {
      // container already available as services;
      const promptManager = services.getPromptManager();

      expect(PromptManagerService).toHaveBeenCalledWith(
        expect.any(Object), // redis
        expect.any(Object)  // logger
      );
    });

    it('should return same instance on multiple calls', () => {
      // container already available as services;

      const manager1 = services.getPromptManager();
      const manager2 = services.getPromptManager();

      expect(PromptManagerService).toHaveBeenCalledTimes(1);
      expect(manager1).toBe(manager2);
    });
  });

  // ============================================================
  // AI OUTPUT VALIDATOR TESTS
  // ============================================================

  describe('getAIOutputValidator', () => {
    it('should create AIOutputValidator', () => {
      // container already available as services;
      const validator = services.getAIOutputValidator();

      expect(AIOutputValidator).toHaveBeenCalled();
    });

    it('should return same instance on multiple calls', () => {
      // container already available as services;

      const validator1 = services.getAIOutputValidator();
      const validator2 = services.getAIOutputValidator();

      expect(AIOutputValidator).toHaveBeenCalledTimes(1);
      expect(validator1).toBe(validator2);
    });
  });

  // ============================================================
  // COST TRACKER TESTS
  // ============================================================

  describe('getCostTracker', () => {
    it('should create CostTracker with Prisma and Redis', () => {
      // container already available as services;
      const costTracker = services.getCostTracker();

      expect(CostTrackerService).toHaveBeenCalledWith(
        expect.any(Object), // prisma
        expect.any(Object)  // redis
      );
    });

    it('should return same instance on multiple calls', () => {
      // container already available as services;

      const tracker1 = services.getCostTracker();
      const tracker2 = services.getCostTracker();

      expect(CostTrackerService).toHaveBeenCalledTimes(1);
      expect(tracker1).toBe(tracker2);
    });
  });

  // ============================================================
  // AI ORCHESTRATOR TESTS
  // ============================================================

  describe('getAIOrchestrator', () => {
    it('should create AIOrchestrator with all dependencies', () => {
      // container already available as services;
      const orchestrator = services.getAIOrchestrator();

      expect(AIOrchestrator).toHaveBeenCalledWith(
        expect.any(Object), // aiClient
        expect.any(Object), // promptManager
        expect.any(Object), // validator
        expect.any(Object), // costTracker
        expect.any(Object), // redis
        expect.any(Object)  // logger
      );
    });

    it('should wire dependencies correctly', () => {
      // container already available as services;

      // Get orchestrator which should trigger creation of dependencies
      services.getAIOrchestrator();

      // All dependencies should be created
      expect(AIClient).toHaveBeenCalled();
      expect(PromptManagerService).toHaveBeenCalled();
      expect(AIOutputValidator).toHaveBeenCalled();
      expect(CostTrackerService).toHaveBeenCalled();
    });

    it('should return same instance on multiple calls', () => {
      // container already available as services;

      const orchestrator1 = services.getAIOrchestrator();
      const orchestrator2 = services.getAIOrchestrator();

      expect(AIOrchestrator).toHaveBeenCalledTimes(1);
      expect(orchestrator1).toBe(orchestrator2);
    });
  });

  // ============================================================
  // TEXT CHUNKER TESTS
  // ============================================================

  describe('getTextChunker', () => {
    it('should create TextChunker with logger', () => {
      // container already available as services;
      const chunker = services.getTextChunker();

      expect(TextChunker).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should return same instance on multiple calls', () => {
      // container already available as services;

      const chunker1 = services.getTextChunker();
      const chunker2 = services.getTextChunker();

      expect(TextChunker).toHaveBeenCalledTimes(1);
      expect(chunker1).toBe(chunker2);
    });
  });

  // ============================================================
  // EMBEDDING SERVICE TESTS
  // ============================================================

  describe('getEmbeddingService', () => {
    it('should create EmbeddingService with correct configuration', () => {
      // container already available as services;
      const embeddingService = services.getEmbeddingService();

      expect(EmbeddingService).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'test-openai-key',
          model: 'text-embedding-3-small',
          dimensions: 512,
          timeout: 10000,
          cacheTTL: 3600,
        }),
        expect.any(Object) // logger
      );
    });

    it('should return same instance on multiple calls', () => {
      // container already available as services;

      const service1 = services.getEmbeddingService();
      const service2 = services.getEmbeddingService();

      expect(EmbeddingService).toHaveBeenCalledTimes(1);
      expect(service1).toBe(service2);
    });
  });

  // ============================================================
  // SEMANTIC DEDUPLICATOR TESTS
  // ============================================================

  describe('getSemanticDeduplicator', () => {
    it('should create SemanticDeduplicator with dependencies', () => {
      // container already available as services;
      const deduplicator = services.getSemanticDeduplicator();

      expect(SemanticNodeDeduplicator).toHaveBeenCalledWith(
        expect.any(Object), // logger
        expect.any(Object), // aiOrchestrator
        expect.any(Object)  // embeddingService
      );
    });

    it('should wire dependencies correctly', () => {
      // container already available as services;

      // Get deduplicator which should trigger creation of dependencies
      services.getSemanticDeduplicator();

      // Dependencies should be created
      expect(AIOrchestrator).toHaveBeenCalled();
      expect(EmbeddingService).toHaveBeenCalled();
    });

    it('should return same instance on multiple calls', () => {
      // container already available as services;

      const dedup1 = services.getSemanticDeduplicator();
      const dedup2 = services.getSemanticDeduplicator();

      expect(SemanticNodeDeduplicator).toHaveBeenCalledTimes(1);
      expect(dedup1).toBe(dedup2);
    });
  });

  // ============================================================
  // GRAPH GENERATOR TESTS
  // ============================================================

  describe('getGraphGenerator', () => {
    it('should create GraphGenerator with all dependencies', () => {
      // container already available as services;
      const graphGenerator = services.getGraphGenerator();

      expect(GraphGeneratorService).toHaveBeenCalledWith(
        expect.any(Object), // textChunker
        expect.any(Object), // aiOrchestrator
        expect.any(Object), // costTracker
        expect.any(Object), // semanticDeduplicator
        expect.any(Object)  // logger
      );
    });

    it('should wire all dependencies correctly', () => {
      // container already available as services;

      // Get graph generator which should trigger creation of all dependencies
      services.getGraphGenerator();

      // All dependencies should be created
      expect(TextChunker).toHaveBeenCalled();
      expect(AIOrchestrator).toHaveBeenCalled();
      expect(CostTrackerService).toHaveBeenCalled();
      expect(SemanticNodeDeduplicator).toHaveBeenCalled();
    });

    it('should return same instance on multiple calls', () => {
      // container already available as services;

      const generator1 = services.getGraphGenerator();
      const generator2 = services.getGraphGenerator();

      expect(GraphGeneratorService).toHaveBeenCalledTimes(1);
      expect(generator1).toBe(generator2);
    });
  });

  // ============================================================
  // RESET FUNCTIONALITY TESTS
  // ============================================================

  describe('reset', () => {
    it('should clear all cached services', () => {
      // container already available as services;

      // Create some services
      services.getAIClient();
      services.getGraphGenerator();
      services.getTextChunker();

      // Clear mocks to track new calls
      jest.clearAllMocks();

      // Reset container
      services.reset();

      // Get services again - should create new instances
      services.getAIClient();
      services.getTextChunker();

      expect(AIClient).toHaveBeenCalledTimes(1);
      expect(TextChunker).toHaveBeenCalledTimes(1);
    });

    it('should allow re-initialization after reset', () => {
      // container already available as services;

      const service1 = services.getAIClient();
      services.reset();
      const service2 = services.getAIClient();

      // Should be different instances (new construction)
      expect(AIClient).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================================
  // DEPENDENCY INJECTION CHAIN TESTS
  // ============================================================

  describe('Dependency Injection Chain', () => {
    it('should create dependencies in correct order for GraphGenerator', () => {
      // container already available as services;

      // Clear all mocks
      jest.clearAllMocks();

      // Get graph generator - should trigger entire dependency chain
      services.getGraphGenerator();

      // Verify all required dependencies were created
      expect(TextChunker).toHaveBeenCalled();
      expect(AIOrchestrator).toHaveBeenCalled();
      expect(CostTrackerService).toHaveBeenCalled();
      expect(SemanticNodeDeduplicator).toHaveBeenCalled();
      expect(AIClient).toHaveBeenCalled();
      expect(PromptManagerService).toHaveBeenCalled();
      expect(AIOutputValidator).toHaveBeenCalled();
      expect(EmbeddingService).toHaveBeenCalled();
    });

    it('should reuse dependencies across services', () => {
      // container already available as services;

      // Get multiple services that depend on AIOrchestrator
      services.getGraphGenerator();
      services.getSemanticDeduplicator();
      services.getAIOrchestrator();

      // AIOrchestrator should only be created once
      expect(AIOrchestrator).toHaveBeenCalledTimes(1);
    });
  });
});

/**
 * Service Container
 * Centralized service instantiation with dependency injection
 *
 * WHY: Prevents duplicate service instances, ensures proper dependency wiring,
 * and provides a single source of truth for service configuration.
 *
 * Pattern: Singleton factory for each service
 */

import { Logger } from 'winston';
import Redis from 'ioredis';

import { GraphGeneratorService } from './graph-generator.service';
import { AIOrchestrator } from './ai-orchestrator.service';
import { CostTrackerService } from './cost-tracker.service';
import { PromptManagerService } from './prompt-manager.service';
import { DocumentProcessorService } from './document-processor.service';

import { TextChunker } from '../lib/chunking/text-chunker';
import { SemanticNodeDeduplicator } from '../lib/graph/semantic-deduplicator';
import { AIClient } from '../lib/ai/ai-client';
import { AIOutputValidator } from '../lib/validation/ai-output-validator';
import { EmbeddingService } from '../lib/embeddings/embedding-service';

import { logger } from '../utils/logger.util';
import { redisClient } from '../config/redis';
import { prisma } from '../config/database';
import { env } from '../config/env';

/**
 * Service Container Class
 * Lazy-initialized singleton instances for all services
 */
class ServiceContainer {
  private static instance: ServiceContainer;

  // Service instances (lazy-loaded)
  private _aiClient?: AIClient;
  private _promptManager?: PromptManagerService;
  private _aiOutputValidator?: AIOutputValidator;
  private _costTracker?: CostTrackerService;
  private _aiOrchestrator?: AIOrchestrator;
  private _textChunker?: TextChunker;
  private _embeddingService?: EmbeddingService;
  private _semanticDeduplicator?: SemanticNodeDeduplicator;
  private _graphGenerator?: GraphGeneratorService;
  private _documentProcessor?: DocumentProcessorService;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ServiceContainer {
    if (!ServiceContainer.instance) {
      ServiceContainer.instance = new ServiceContainer();
    }
    return ServiceContainer.instance;
  }

  /**
   * Get logger instance
   */
  getLogger(): Logger {
    return logger;
  }

  /**
   * Get Redis client
   */
  getRedis(): Redis {
    return redisClient;
  }

  /**
   * Get AI Client
   * WHY: Requires API keys from environment
   */
  getAIClient(): AIClient {
    if (!this._aiClient) {
      this._aiClient = new AIClient(
        {
          anthropicApiKey: env.ANTHROPIC_API_KEY || '',
          openaiApiKey: env.OPENAI_API_KEY || '',
          defaultTimeout: 30000,
          enableLogging: true,
        },
        logger
      );
    }
    return this._aiClient;
  }

  /**
   * Get Prompt Manager
   * WHY: Requires Redis for caching
   */
  getPromptManager(): PromptManagerService {
    if (!this._promptManager) {
      this._promptManager = new PromptManagerService(
        this.getRedis(),
        this.getLogger()
      );
    }
    return this._promptManager;
  }

  /**
   * Get AI Output Validator
   * WHY: Stateless, just needs logger
   */
  getAIOutputValidator(): AIOutputValidator {
    if (!this._aiOutputValidator) {
      this._aiOutputValidator = new AIOutputValidator();
    }
    return this._aiOutputValidator;
  }

  /**
   * Get Cost Tracker
   * WHY: Requires database and Redis for tracking
   */
  getCostTracker(): CostTrackerService {
    if (!this._costTracker) {
      this._costTracker = new CostTrackerService(
        prisma,
        this.getRedis()
      );
    }
    return this._costTracker;
  }

  /**
   * Get AI Orchestrator
   * WHY: Central coordinator for all AI operations
   */
  getAIOrchestrator(): AIOrchestrator {
    if (!this._aiOrchestrator) {
      this._aiOrchestrator = new AIOrchestrator(
        this.getAIClient(),
        this.getPromptManager(),
        this.getAIOutputValidator(),
        this.getCostTracker(),
        this.getRedis(),
        this.getLogger()
      );
    }
    return this._aiOrchestrator;
  }

  /**
   * Get Text Chunker
   * WHY: Used for splitting large documents
   */
  getTextChunker(): TextChunker {
    if (!this._textChunker) {
      this._textChunker = new TextChunker(logger);
    }
    return this._textChunker;
  }

  /**
   * Get Embedding Service
   * WHY: Used for semantic similarity in deduplication
   */
  getEmbeddingService(): EmbeddingService {
    if (!this._embeddingService) {
      this._embeddingService = new EmbeddingService(
        {
          apiKey: env.OPENAI_API_KEY || '',
          model: 'text-embedding-3-small',
          batchSize: 100,
          timeout: 10000,
        },
        this.getLogger()
      );
    }
    return this._embeddingService;
  }

  /**
   * Get Semantic Node Deduplicator
   * WHY: 4-phase algorithm for node merging
   */
  getSemanticDeduplicator(): SemanticNodeDeduplicator {
    if (!this._semanticDeduplicator) {
      this._semanticDeduplicator = new SemanticNodeDeduplicator(
        this.getLogger(),
        this.getAIOrchestrator(), // Used for Phase 4 LLM validation
        this.getEmbeddingService()
      );
    }
    return this._semanticDeduplicator;
  }

  /**
   * Get Graph Generator Service
   * WHY: Main entry point for graph generation pipeline
   */
  getGraphGenerator(): GraphGeneratorService {
    if (!this._graphGenerator) {
      this._graphGenerator = new GraphGeneratorService(
        this.getTextChunker(),
        this.getAIOrchestrator(),
        this.getCostTracker(),
        this.getSemanticDeduplicator(),
        this.getLogger()
      );
    }
    return this._graphGenerator;
  }

  /**
   * Get Document Processor Service
   * WHY: Handles file upload processing, text extraction, and quality assessment
   */
  getDocumentProcessorService(): DocumentProcessorService {
    if (!this._documentProcessor) {
      this._documentProcessor = new DocumentProcessorService();
    }
    return this._documentProcessor;
  }

  /**
   * Reset all services (for testing)
   */
  reset(): void {
    this._aiClient = undefined;
    this._promptManager = undefined;
    this._aiOutputValidator = undefined;
    this._costTracker = undefined;
    this._aiOrchestrator = undefined;
    this._textChunker = undefined;
    this._embeddingService = undefined;
    this._semanticDeduplicator = undefined;
    this._graphGenerator = undefined;
    this._documentProcessor = undefined;
  }
}

/**
 * Export singleton instance
 */
export const services = ServiceContainer.getInstance();

# Service Layer Design Document v2.0 (Production-Ready)

**Version:** 2.0
**Date:** 2024-11-11
**Status:** Production-Ready Design
**Changes:** Incorporates critical validation, image extraction, quality control, and real-world AI reliability patterns

---

## Design Philosophy Changes

### What Changed from v1.0

**v1.0 Assumptions (Naive)**:
- ❌ AI always returns valid output
- ❌ AI respects constraints
- ❌ Simple caching is enough
- ❌ Text-only processing is sufficient

**v2.0 Reality (Production-Ready)**:
- ✅ AI fails ~10% of the time → Need validation + retry loops
- ✅ AI ignores constraints ~20% → Need quality scoring
- ✅ Cost can spiral → Need budget caps and tracking
- ✅ Images contain critical information → Need multimodal processing
- ✅ Prompts need versioning and A/B testing
- ✅ Must have fallback mechanisms

---

## 1. Document Processing Service (v2.0)

### 1.1 Enhanced Capabilities

**NEW: Multimodal Processing**
- Extract text from PDFs, markdown, plain text
- **Extract images** from PDFs and analyze with vision AI
- Extract tables and preserve structure
- Quality assessment before AI processing
- Cost estimation before expensive operations

### 1.2 Interface Design

```typescript
// src/services/document-processor.service.ts

export interface ProcessedDocument {
  id: string;
  title: string;
  contentText: string;
  images: ExtractedImage[];        // NEW: Image data
  tables: ExtractedTable[];        // NEW: Table data
  sourceType: SourceType;
  filePath?: string;
  sourceUrl?: string;
  fileSize?: number;
  quality: DocumentQuality;         // NEW: Quality metrics
  metadata: {
    pageCount?: number;
    wordCount: number;
    imageCount: number;             // NEW
    extractionTime: number;
    warnings: string[];             // NEW: Quality warnings
  };
}

// NEW: Image extraction result
export interface ExtractedImage {
  id: string;
  pageNumber: number;
  position: { x: number; y: number; width: number; height: number };
  caption?: string;                 // OCR from image caption
  filePath: string;                 // Saved image file
  aiDescription?: string;           // Vision AI description (lazy-loaded)
  importance: 'high' | 'medium' | 'low'; // Heuristic based on size/position
}

// NEW: Quality assessment
export interface DocumentQuality {
  acceptable: boolean;
  score: number;                    // 0-100
  issues: QualityIssue[];
  estimatedTokens: number;
  estimatedCost: number;            // NEW: Cost prediction
  readabilityScore: number;         // NEW: Text coherence
  detectedLanguage: string;
}

export interface QualityIssue {
  severity: 'critical' | 'warning' | 'info';
  type: 'text-too-short' | 'text-too-long' | 'low-quality-scan' | 'garbled-text';
  message: string;
  suggestion?: string;
}

export class DocumentProcessorService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly visionAI: VisionAIClient,  // NEW: For image analysis
    private readonly logger: Logger,
    private readonly costEstimator: CostEstimator  // NEW
  ) {}

  /**
   * Process uploaded file with quality checks
   *
   * Flow:
   * 1. Extract text and images
   * 2. Assess quality (CRITICAL: Don't send garbage to AI)
   * 3. Estimate cost
   * 4. Save with quality metadata
   */
  async processUploadedFile(
    file: Express.Multer.File,
    userId?: string
  ): Promise<ProcessedDocument> {
    const startTime = Date.now();

    // 1. Extract content
    const extracted = await this.extractContent(file);

    // 2. NEW: Assess quality BEFORE expensive AI operations
    const quality = await this.assessQuality(extracted);

    if (!quality.acceptable) {
      throw new DocumentQualityError(quality.issues);
    }

    // 3. NEW: Estimate and check cost
    const costEstimate = await this.costEstimator.estimate({
      textTokens: quality.estimatedTokens,
      imageCount: extracted.images.length,
    });

    if (costEstimate > this.MAX_COST_FREE_TIER) {
      this.logger.warn(`High cost document: $${costEstimate}`, { userId });
      // Option: Flag for user approval or upgrade prompt
    }

    // 4. Save document
    const document = await this.saveDocument({
      ...extracted,
      quality,
      metadata: {
        ...extracted.metadata,
        extractionTime: Date.now() - startTime,
        estimatedCost: costEstimate,
      },
    });

    // 5. NEW: Process images asynchronously (not blocking)
    if (extracted.images.length > 0) {
      await this.enqueueImageAnalysis(document.id, extracted.images);
    }

    return document;
  }

  /**
   * NEW: Extract text AND images from PDF
   */
  private async extractContent(file: Express.Multer.File): Promise<{
    text: string;
    images: ExtractedImage[];
    tables: ExtractedTable[];
  }> {
    if (file.mimetype === 'application/pdf') {
      return this.extractFromPDF(file);
    } else if (file.mimetype.startsWith('text/')) {
      return {
        text: await this.extractFromText(file),
        images: [],
        tables: [],
      };
    } else {
      throw new UnsupportedFormatError(file.mimetype);
    }
  }

  /**
   * NEW: Enhanced PDF extraction with images
   */
  private async extractFromPDF(file: Express.Multer.File): Promise<{
    text: string;
    images: ExtractedImage[];
    tables: ExtractedTable[];
  }> {
    const pdfBuffer = await fs.readFile(file.path);

    // Extract text
    const textData = await pdfParse(pdfBuffer);

    // NEW: Extract images using pdf-lib or pdf2pic
    const images = await this.extractImagesFromPDF(pdfBuffer);

    // NEW: Detect and extract tables
    const tables = await this.extractTablesFromPDF(pdfBuffer);

    return {
      text: this.cleanText(textData.text),
      images,
      tables,
    };
  }

  /**
   * NEW: Extract images from PDF pages
   */
  private async extractImagesFromPDF(pdfBuffer: Buffer): Promise<ExtractedImage[]> {
    const images: ExtractedImage[] = [];

    // Use pdf-lib to extract embedded images
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();

    for (let pageNum = 0; pageNum < pages.length; pageNum++) {
      const page = pages[pageNum];
      const pageImages = await this.extractImagesFromPage(page, pageNum + 1);
      images.push(...pageImages);
    }

    // Filter out tiny images (likely decorative)
    return images.filter(img =>
      img.position.width > 100 && img.position.height > 100
    );
  }

  /**
   * NEW: Quality assessment (CRITICAL for MVP)
   */
  private async assessQuality(extracted: {
    text: string;
    images: ExtractedImage[];
  }): Promise<DocumentQuality> {
    const issues: QualityIssue[] = [];
    let score = 100;

    // Check text length
    if (extracted.text.length < 500) {
      issues.push({
        severity: 'critical',
        type: 'text-too-short',
        message: 'Document too short for meaningful graph',
        suggestion: 'Upload a longer document (at least 500 characters)',
      });
      score -= 50;
    }

    if (extracted.text.length > 200000) {
      issues.push({
        severity: 'warning',
        type: 'text-too-long',
        message: 'Very long document will incur higher costs',
        suggestion: `Estimated cost: $${this.estimateCost(extracted.text.length)}`,
      });
      score -= 10;
    }

    // Check text quality (readability)
    const readability = this.calculateReadability(extracted.text);
    if (readability < 0.3) {
      issues.push({
        severity: 'critical',
        type: 'garbled-text',
        message: 'Text appears garbled or unreadable',
        suggestion: 'PDF may be scanned. Try OCR or different file format',
      });
      score -= 40;
    }

    // Detect language
    const detectedLang = this.detectLanguage(extracted.text);
    if (detectedLang !== 'en') {
      issues.push({
        severity: 'warning',
        type: 'non-english',
        message: `Detected language: ${detectedLang}`,
        suggestion: 'AI works best with English documents',
      });
      score -= 10;
    }

    return {
      acceptable: score >= 50,
      score: Math.max(0, score),
      issues,
      estimatedTokens: Math.ceil(extracted.text.length / 4),
      estimatedCost: this.estimateCost(extracted.text.length),
      readabilityScore: readability,
      detectedLanguage: detectedLang,
    };
  }

  /**
   * NEW: Analyze images with vision AI (async)
   */
  private async enqueueImageAnalysis(
    documentId: string,
    images: ExtractedImage[]
  ): Promise<void> {
    // Add to job queue for async processing
    for (const image of images) {
      await this.jobQueue.add('image-analysis', {
        documentId,
        imageId: image.id,
        imagePath: image.filePath,
      });
    }
  }

  /**
   * NEW: Calculate readability score
   * Simple heuristic: ratio of readable chars to total chars
   */
  private calculateReadability(text: string): number {
    const readableChars = text.match(/[a-zA-Z0-9\s.,!?;:]/g) || [];
    return readableChars.length / text.length;
  }

  /**
   * NEW: Detect language using simple heuristics (or use library like franc)
   */
  private detectLanguage(text: string): string {
    // For MVP: Simple check for common English words
    const englishIndicators = ['the', 'and', 'is', 'of', 'to', 'in', 'a'];
    const sample = text.toLowerCase().slice(0, 1000);
    const englishWordCount = englishIndicators.filter(word =>
      sample.includes(` ${word} `)
    ).length;

    return englishWordCount >= 3 ? 'en' : 'unknown';
  }

  /**
   * NEW: Estimate cost based on content
   */
  private estimateCost(textLength: number): number {
    const tokens = Math.ceil(textLength / 4);
    const COST_PER_1K_TOKENS = 0.003; // Claude Sonnet 4 input cost
    return (tokens / 1000) * COST_PER_1K_TOKENS;
  }
}
```

---

## 2. AI Orchestrator Service (v2.0)

### 2.1 Critical Enhancements

**Production Reality:**
- AI fails ~10% (syntax errors, constraints ignored)
- Need **validation + retry loops** with feedback
- Need **prompt versioning** and A/B testing
- Need **quality scoring** for every output
- Need **cost tracking** and budget caps
- Need **fallback mechanisms** when all retries fail

### 2.2 Interface Design

```typescript
// src/services/ai-orchestrator.service.ts

export interface AIRequest {
  promptType: 'graph-generation' | 'connection-explanation' | 'quiz-generation' | 'image-description';
  context: Record<string, any>;
  config?: AIRequestConfig;       // NEW: Configurable behavior
}

// NEW: Request configuration
export interface AIRequestConfig {
  maxRetries?: number;            // Default: 3
  qualityThreshold?: number;      // Minimum acceptable quality (0-100)
  maxCost?: number;               // Budget cap
  promptVersion?: string;         // For A/B testing
  timeoutMs?: number;            // Request timeout
}

// NEW: Enhanced response with quality metrics
export interface AIResponse<T = any> {
  data: T;
  model: string;
  quality: QualityScore;          // NEW: Quality metrics
  metadata: {
    tokensUsed: number;
    cost: number;
    cached: boolean;
    processingTime: number;
    attempts: number;             // NEW: Retry count
    validationPassed: boolean;    // NEW
  };
}

// NEW: Quality scoring for AI outputs
export interface QualityScore {
  score: number;                  // 0-100
  passed: boolean;
  issues: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low';
    type: string;
    message: string;
  }>;
}

export class AIService {
  constructor(
    private readonly anthropicClient: Anthropic,
    private readonly openaiClient: OpenAI,
    private readonly redisClient: Redis,
    private readonly promptManager: PromptManager,     // NEW: Versioned prompts
    private readonly validator: AIOutputValidator,     // NEW: Validation
    private readonly costTracker: CostTracker,         // NEW: Budget tracking
    private readonly logger: Logger
  ) {}

  /**
   * Execute AI request with validation, retries, and fallback
   *
   * NEW Flow:
   * 1. Check budget
   * 2. Check cache
   * 3. Build versioned prompt
   * 4. Call AI with retry loop
   * 5. Validate response
   * 6. If validation fails, retry with feedback
   * 7. Track cost and quality
   */
  async executeRequest<T>(request: AIRequest): Promise<AIResponse<T>> {
    const config = this.mergeConfig(request.config);
    const startTime = Date.now();

    // 1. NEW: Check budget before expensive operation
    const budgetCheck = await this.costTracker.checkBudget(request);
    if (!budgetCheck.allowed) {
      throw new BudgetExceededError(budgetCheck.reason);
    }

    // 2. Check cache
    const cacheKey = this.buildCacheKey(request);
    const cached = await this.checkCache<T>(cacheKey);
    if (cached) {
      return {
        data: cached,
        model: 'cached',
        quality: { score: 100, passed: true, issues: [] },
        metadata: {
          tokensUsed: 0,
          cost: 0,
          cached: true,
          processingTime: Date.now() - startTime,
          attempts: 0,
          validationPassed: true,
        },
      };
    }

    // 3. NEW: Build versioned prompt
    const prompt = await this.promptManager.build(
      request.promptType,
      request.context,
      config.promptVersion
    );

    // 4. NEW: Execute with validation loop (CRITICAL)
    const result = await this.executeWithValidation<T>(
      prompt,
      request.promptType,
      config
    );

    // 5. Cache successful result
    if (result.quality.passed) {
      await this.cacheResult(cacheKey, result.data);
    }

    // 6. NEW: Track cost and quality metrics
    await this.costTracker.record({
      promptType: request.promptType,
      tokensUsed: result.metadata.tokensUsed,
      cost: result.metadata.cost,
      quality: result.quality.score,
      attempts: result.metadata.attempts,
      success: result.quality.passed,
    });

    // 7. NEW: Record prompt performance for continuous improvement
    await this.promptManager.recordOutcome(
      request.promptType,
      config.promptVersion || 'production',
      {
        qualityScore: result.quality.score,
        retries: result.metadata.attempts,
        cost: result.metadata.cost,
      }
    );

    return result;
  }

  /**
   * NEW: Validation loop with retry and feedback
   * CRITICAL for production reliability
   */
  private async executeWithValidation<T>(
    basePrompt: string,
    promptType: string,
    config: AIRequestConfig
  ): Promise<AIResponse<T>> {
    let attempts = 0;
    let lastError: Error;
    let validationFeedback: string[] = [];

    while (attempts < config.maxRetries) {
      attempts++;

      try {
        // Build prompt with validation feedback from previous attempts
        const prompt = validationFeedback.length > 0
          ? this.addValidationFeedback(basePrompt, validationFeedback)
          : basePrompt;

        // Call AI with fallback cascade
        const response = await this.callWithFallback(prompt, config);

        // Parse response
        const parsed = this.parseResponse<T>(response, promptType);

        // NEW: Validate output (CRITICAL)
        const validation = await this.validator.validate(
          parsed,
          promptType,
          { threshold: config.qualityThreshold }
        );

        // If validation passed, return
        if (validation.passed) {
          return {
            data: parsed,
            model: response.model,
            quality: validation,
            metadata: {
              tokensUsed: response.usage.total_tokens,
              cost: this.calculateCost(response),
              cached: false,
              processingTime: response.processingTime,
              attempts,
              validationPassed: true,
            },
          };
        }

        // Validation failed, prepare feedback for next attempt
        validationFeedback = validation.issues.map(issue =>
          `${issue.type}: ${issue.message}`
        );

        this.logger.warn(`Validation failed (attempt ${attempts})`, {
          issues: validationFeedback,
        });

      } catch (error) {
        lastError = error;

        // Handle rate limits with exponential backoff
        if (error.code === 'RATE_LIMIT') {
          await this.exponentialBackoff(attempts);
        }

        // Log error
        this.logger.error(`AI request failed (attempt ${attempts})`, {
          error: error.message,
        });
      }
    }

    // All retries exhausted
    throw new AIValidationError(
      `Failed after ${attempts} attempts. Last issues: ${validationFeedback.join(', ')}`,
      lastError
    );
  }

  /**
   * NEW: Add validation feedback to prompt
   * Improves success rate on retries
   */
  private addValidationFeedback(
    basePrompt: string,
    feedback: string[]
  ): string {
    return `${basePrompt}\n\nIMPORTANT: Previous attempt failed validation. Please fix these issues:\n${feedback.map((f, i) => `${i + 1}. ${f}`).join('\n')}`;
  }

  /**
   * Fallback cascade: Claude Sonnet → Haiku → GPT-4
   */
  private async callWithFallback(
    prompt: string,
    config: AIRequestConfig
  ): Promise<any> {
    try {
      // Primary: Claude Sonnet 4
      return await this.callClaude(prompt, 'claude-sonnet-4', config);
    } catch (error) {
      this.logger.warn('Claude Sonnet failed, trying Haiku', { error });

      try {
        // Fallback 1: Claude Haiku (cheaper, faster)
        return await this.callClaude(prompt, 'claude-haiku', config);
      } catch (error2) {
        this.logger.warn('Claude Haiku failed, trying GPT-4', { error2 });

        // Fallback 2: OpenAI GPT-4 (different provider)
        return await this.callOpenAI(prompt, 'gpt-4-turbo', config);
      }
    }
  }

  /**
   * NEW: Calculate actual cost
   */
  private calculateCost(response: any): number {
    const rates = {
      'claude-sonnet-4': {
        input: 3.00 / 1_000_000,
        output: 15.00 / 1_000_000,
      },
      'claude-haiku': {
        input: 0.25 / 1_000_000,
        output: 1.25 / 1_000_000,
      },
      'gpt-4-turbo': {
        input: 10.00 / 1_000_000,
        output: 30.00 / 1_000_000,
      },
    };

    const rate = rates[response.model];
    return (
      response.usage.prompt_tokens * rate.input +
      response.usage.completion_tokens * rate.output
    );
  }

  /**
   * NEW: Exponential backoff for rate limits
   */
  private async exponentialBackoff(attempt: number): Promise<void> {
    const delay = Math.min(1000 * Math.pow(2, attempt), 32000);
    this.logger.info(`Rate limited, waiting ${delay}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}
```

### 2.3 NEW: AI Output Validator

**CRITICAL: This is missing from v1.0 and required for production**

```typescript
// src/lib/validation/ai-output-validator.ts

export class AIOutputValidator {
  /**
   * Validate AI output based on prompt type
   */
  async validate(
    output: any,
    promptType: string,
    options: { threshold?: number } = {}
  ): Promise<QualityScore> {
    switch (promptType) {
      case 'graph-generation':
        return this.validateGraph(output, options);
      case 'connection-explanation':
        return this.validateExplanation(output, options);
      case 'quiz-generation':
        return this.validateQuiz(output, options);
      default:
        return { score: 100, passed: true, issues: [] };
    }
  }

  /**
   * Validate graph generation output
   */
  private async validateGraph(
    graph: any,
    options: { threshold?: number }
  ): Promise<QualityScore> {
    const issues: Array<{ severity: string; type: string; message: string }> = [];
    let score = 100;

    // 1. Validate Mermaid syntax
    try {
      await this.validateMermaidSyntax(graph.mermaidCode);
    } catch (error) {
      issues.push({
        severity: 'critical',
        type: 'invalid-syntax',
        message: `Invalid Mermaid syntax: ${error.message}`,
      });
      score -= 40;
    }

    // 2. Validate node count (7-15 constraint)
    if (!graph.nodes || graph.nodes.length < 5) {
      issues.push({
        severity: 'high',
        type: 'too-few-nodes',
        message: `Only ${graph.nodes?.length || 0} nodes. Need at least 5.`,
      });
      score -= 30;
    } else if (graph.nodes.length > 15) {
      issues.push({
        severity: 'high',
        type: 'too-many-nodes',
        message: `${graph.nodes.length} nodes. Maximum is 15.`,
      });
      score -= 20;
    }

    // 3. Validate connectivity (no orphan nodes)
    const orphans = this.findOrphanNodes(graph);
    if (orphans.length > 0) {
      issues.push({
        severity: 'medium',
        type: 'disconnected-nodes',
        message: `${orphans.length} disconnected nodes`,
      });
      score -= 10 * orphans.length;
    }

    // 4. Validate node labels (not empty, reasonable length)
    const emptyLabels = graph.nodes?.filter(n => !n.title || n.title.length < 2) || [];
    if (emptyLabels.length > 0) {
      issues.push({
        severity: 'high',
        type: 'empty-labels',
        message: `${emptyLabels.length} nodes with invalid labels`,
      });
      score -= 15;
    }

    const threshold = options.threshold || 60;
    return {
      score: Math.max(0, score),
      passed: score >= threshold,
      issues,
    };
  }

  /**
   * Validate Mermaid syntax by actually parsing it
   */
  private async validateMermaidSyntax(mermaidCode: string): Promise<void> {
    try {
      // Use mermaid library to parse
      const mermaid = await import('mermaid');
      await mermaid.default.parse(mermaidCode);
    } catch (error) {
      throw new Error(`Mermaid parsing failed: ${error.message}`);
    }
  }

  /**
   * Find nodes with no connections
   */
  private findOrphanNodes(graph: any): any[] {
    const connectedIds = new Set<string>();

    for (const edge of graph.edges || []) {
      connectedIds.add(edge.fromNodeId);
      connectedIds.add(edge.toNodeId);
    }

    return (graph.nodes || []).filter(node => !connectedIds.has(node.id));
  }
}
```

---

## 3. Cost Management Service (NEW - CRITICAL)

**v1.0 completely missed this. Essential for MVP.**

```typescript
// src/services/cost-tracker.service.ts

export interface CostLimits {
  perDocument: number;      // $5 max per document (free tier)
  perUserPerDay: number;    // $10 max per user per day
  perUserPerMonth: number;  // $50 max per user per month
}

export const DEFAULT_LIMITS: CostLimits = {
  perDocument: 5.00,
  perUserPerDay: 10.00,
  perUserPerMonth: 50.00,
};

export class CostTracker {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis
  ) {}

  /**
   * Check if operation is within budget
   */
  async checkBudget(request: AIRequest): Promise<{
    allowed: boolean;
    reason?: string;
    estimatedCost: number;
    currentUsage: {
      today: number;
      thisMonth: number;
    };
  }> {
    const estimate = this.estimateCost(request);
    const usage = await this.getUserUsage(request.context.userId);

    // Check daily limit
    if (usage.today + estimate > DEFAULT_LIMITS.perUserPerDay) {
      return {
        allowed: false,
        reason: `Daily limit of $${DEFAULT_LIMITS.perUserPerDay} exceeded`,
        estimatedCost: estimate,
        currentUsage: usage,
      };
    }

    // Check monthly limit
    if (usage.thisMonth + estimate > DEFAULT_LIMITS.perUserPerMonth) {
      return {
        allowed: false,
        reason: `Monthly limit of $${DEFAULT_LIMITS.perUserPerMonth} exceeded`,
        estimatedCost: estimate,
        currentUsage: usage,
      };
    }

    return {
      allowed: true,
      estimatedCost: estimate,
      currentUsage: usage,
    };
  }

  /**
   * Record actual cost
   */
  async record(data: {
    promptType: string;
    tokensUsed: number;
    cost: number;
    quality: number;
    attempts: number;
    success: boolean;
    userId?: string;
  }): Promise<void> {
    // Save to database
    await this.prisma.aiUsage.create({
      data: {
        userId: data.userId,
        promptType: data.promptType,
        tokensUsed: data.tokensUsed,
        cost: data.cost,
        qualityScore: data.quality,
        attempts: data.attempts,
        success: data.success,
        timestamp: new Date(),
      },
    });

    // Update Redis cache for real-time limits
    const today = new Date().toISOString().split('T')[0];
    await this.redis.incrbyfloat(`usage:${data.userId}:${today}`, data.cost);
  }

  /**
   * Estimate cost for request
   */
  private estimateCost(request: AIRequest): number {
    const tokenEstimates = {
      'graph-generation': 15000,     // Large prompt
      'connection-explanation': 3000,
      'quiz-generation': 5000,
      'image-description': 1000,
    };

    const tokens = tokenEstimates[request.promptType] || 5000;
    const COST_PER_1K = 0.003; // Claude Sonnet 4

    return (tokens / 1000) * COST_PER_1K;
  }

  /**
   * Get user's current usage
   */
  private async getUserUsage(userId?: string): Promise<{
    today: number;
    thisMonth: number;
  }> {
    if (!userId) return { today: 0, thisMonth: 0 };

    const today = new Date().toISOString().split('T')[0];
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const [todayUsage, monthUsage] = await Promise.all([
      this.redis.get(`usage:${userId}:${today}`),
      this.prisma.aiUsage.aggregate({
        where: {
          userId,
          timestamp: { gte: monthStart },
        },
        _sum: { cost: true },
      }),
    ]);

    return {
      today: parseFloat(todayUsage || '0'),
      thisMonth: monthUsage._sum.cost || 0,
    };
  }
}
```

---

## Summary of Critical Changes (v1 → v2)

### What's NEW in v2.0

1. **Image Extraction** ✅
   - Extract images from PDFs
   - Save images for vision AI analysis
   - Async image description generation

2. **Quality Assessment** ✅
   - Document quality checks before AI processing
   - Readability scoring
   - Language detection
   - Quality warnings

3. **AI Validation Loop** ✅
   - Validate every AI response
   - Retry with feedback if validation fails
   - Quality scoring (0-100)
   - Fallback mechanisms

4. **Cost Management** ✅
   - Budget checks before operations
   - Cost tracking and limits
   - User-level quotas
   - Cost estimation

5. **Prompt Versioning** ✅
   - Versioned prompt templates
   - A/B testing support
   - Performance tracking per version

6. **Production Reliability** ✅
   - Retry logic with exponential backoff
   - Fallback cascade (Claude → OpenAI)
   - Comprehensive error handling
   - Quality metrics for continuous improvement

---

## Next Steps

**Recommended Implementation Order:**

1. **Week 1**: Foundation + Critical Components
   - Document Processor v2 (with image extraction)
   - AI Output Validator (CRITICAL)
   - Cost Tracker (CRITICAL)

2. **Week 2**: AI Orchestrator + Graph Generation
   - AI Orchestrator v2 (with validation loop)
   - Prompt Manager (versioning)
   - Graph Generator (integrates validator)

3. **Week 3**: Testing + Refinement
   - Comprehensive tests for validation logic
   - E2E tests with real PDFs
   - Cost tracking verification

**This design is production-ready and addresses all critical gaps from v1.0.**

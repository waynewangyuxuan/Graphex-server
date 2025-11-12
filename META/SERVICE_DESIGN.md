# Service Layer Design Document

**Version:** 1.0
**Date:** 2024-11-11
**Status:** Design Phase

This document provides detailed design specifications for all service layer components following TECHNICAL.md architecture and REGULATION.md principles.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Document Processing Service](#2-document-processing-service)
3. [AI Orchestrator Service](#3-ai-orchestrator-service)
4. [Text Chunking Library](#4-text-chunking-library)
5. [Graph Generation Service](#5-graph-generation-service)
6. [Connection Explanation Service](#6-connection-explanation-service)
7. [Quiz Generation Service](#7-quiz-generation-service)
8. [Note Service](#8-note-service)
9. [Background Job System](#9-background-job-system)
10. [Service Dependencies](#10-service-dependencies)

---

## 1. Architecture Overview

### 1.1 Service Layer Pattern

```
Controllers (HTTP)
      ↓
Services (Business Logic)
      ↓
Data Access (Prisma)
```

**Principles:**
- **Single Responsibility**: Each service handles one domain
- **Dependency Injection**: Services receive dependencies via constructor
- **Testability**: All external dependencies are injectable/mockable
- **Error Handling**: Services throw typed errors, controllers handle HTTP responses
- **Async-First**: All service methods return Promises

### 1.2 Service File Structure

```
src/services/
├── document-processor.service.ts    # Document extraction & validation
├── ai-orchestrator.service.ts       # AI API integration & caching
├── graph-generator.service.ts       # Graph generation pipeline
├── connection.service.ts            # Edge explanation
├── quiz.service.ts                  # Quiz generation
└── note.service.ts                  # Note CRUD operations

src/lib/
├── chunking/
│   └── text-chunker.ts             # Text splitting algorithm
├── graph/
│   ├── graph-merger.ts             # Merge mini-graphs
│   ├── node-deduplicator.ts        # Detect duplicate nodes
│   └── graph-validator.ts          # Validate Mermaid syntax
└── ai/
    └── prompt-templates.ts         # AI prompt management
```

---

## 2. Document Processing Service

### 2.1 Purpose

Extract and normalize text content from various document sources (PDF, text, markdown, URLs).

### 2.2 Responsibilities

- File upload validation (MIME type, size)
- Text extraction from PDFs (using pdf-parse)
- Text extraction from markdown (strip formatting, preserve structure)
- Web content scraping (using Puppeteer + Cheerio)
- Content cleaning and normalization
- Document metadata storage

### 2.3 Interface Design

```typescript
// src/services/document-processor.service.ts

export interface ProcessedDocument {
  id: string;
  title: string;
  contentText: string;
  sourceType: SourceType;
  filePath?: string;
  sourceUrl?: string;
  fileSize?: number;
  metadata: {
    pageCount?: number;
    wordCount: number;
    extractionTime: number;
  };
}

export class DocumentProcessorService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: Logger
  ) {}

  /**
   * Process uploaded file (PDF, text, markdown)
   *
   * @param file - Multer file object
   * @param userId - Optional user ID for multi-tenant
   * @returns Processed document with extracted text
   * @throws ValidationError if file invalid
   * @throws ExtractionError if parsing fails
   */
  async processUploadedFile(
    file: Express.Multer.File,
    userId?: string
  ): Promise<ProcessedDocument>;

  /**
   * Extract content from URL
   *
   * @param url - Target URL to scrape
   * @param userId - Optional user ID
   * @returns Processed document from web content
   * @throws ValidationError if URL invalid
   * @throws ScrapingError if fetch fails
   */
  async processUrl(url: string, userId?: string): Promise<ProcessedDocument>;

  /**
   * Get document by ID
   */
  async getDocumentById(documentId: string): Promise<Document>;

  /**
   * Update document status
   */
  async updateDocumentStatus(
    documentId: string,
    status: DocumentStatus,
    errorMessage?: string
  ): Promise<void>;
}
```

### 2.4 Implementation Details

**PDF Extraction Flow:**
```
1. Validate file (MIME type, size < 10MB)
2. Save to local storage (/uploads) or S3
3. Use pdf-parse library to extract text
4. Clean text (remove excessive whitespace, normalize line breaks)
5. Extract metadata (page count, file size)
6. Create database record with status: 'ready'
7. Return ProcessedDocument
```

**URL Scraping Flow:**
```
1. Validate URL format
2. Launch Puppeteer browser (headless)
3. Navigate to URL with 30s timeout
4. Extract main content using Cheerio selectors:
   - Try <article> tag
   - Try .content, .main, #content selectors
   - Fall back to <body>
5. Remove scripts, styles, ads, navigation
6. Convert to clean text
7. Extract metadata (title, word count)
8. Create database record
9. Return ProcessedDocument
```

**Error Handling:**
- `ValidationError`: Invalid file type, size exceeded, malformed URL
- `ExtractionError`: PDF parsing failed, text encoding issues
- `ScrapingError`: Network timeout, blocked by robots.txt, 404/500 errors

### 2.5 Dependencies

- **pdf-parse**: PDF text extraction
- **cheerio**: HTML parsing
- **puppeteer**: Headless browser for dynamic content
- **prisma**: Database operations
- **fs/promises**: File system operations

### 2.6 Testing Strategy

- **Unit Tests**: Mock file uploads, test validation logic
- **Integration Tests**: Test actual PDF parsing with sample files
- **E2E Tests**: Full upload → extraction → database flow

---

## 3. AI Orchestrator Service

### 3.1 Purpose

Centralized AI API integration with caching, retry logic, and fallback cascade.

### 3.2 Responsibilities

- Manage AI API clients (Anthropic Claude, OpenAI)
- Build prompts from templates
- Execute AI calls with retry logic
- Parse and validate AI responses
- Cache responses in Redis (cost optimization)
- Implement fallback cascade (Claude → OpenAI)
- Track token usage and costs

### 3.3 Interface Design

```typescript
// src/services/ai-orchestrator.service.ts

export interface AIRequest {
  promptType: 'graph-generation' | 'connection-explanation' | 'quiz-generation';
  context: Record<string, any>;
  cacheKey?: string;
  preferredModel?: 'claude-sonnet-4' | 'claude-haiku' | 'gpt-4-turbo';
}

export interface AIResponse<T = any> {
  data: T;
  model: string;
  tokensUsed: number;
  cached: boolean;
  processingTime: number;
}

export class AIService {
  constructor(
    private readonly anthropicClient: Anthropic,
    private readonly openaiClient: OpenAI,
    private readonly redisClient: Redis,
    private readonly logger: Logger
  ) {}

  /**
   * Execute AI request with caching and fallback
   *
   * @param request - AI request configuration
   * @returns AI response with metadata
   * @throws AIServiceError if all providers fail
   */
  async executeRequest<T>(request: AIRequest): Promise<AIResponse<T>>;

  /**
   * Generate knowledge graph from document chunks
   *
   * @param chunks - Array of text chunks
   * @param documentTitle - Document title for context
   * @returns Array of mini-graphs (Mermaid syntax)
   */
  async generateGraph(
    chunks: string[],
    documentTitle: string
  ): Promise<string[]>;

  /**
   * Generate explanation for connection between nodes
   *
   * @param fromNode - Source node data
   * @param toNode - Target node data
   * @param relationship - Relationship type
   * @param sourceText - Relevant document text
   * @param userHypothesis - Optional user explanation attempt
   * @returns AI explanation with citations
   */
  async explainConnection(
    fromNode: Node,
    toNode: Node,
    relationship: string,
    sourceText: string,
    userHypothesis?: string
  ): Promise<string>;

  /**
   * Generate quiz questions from graph
   *
   * @param graph - Graph with nodes and edges
   * @param questionCount - Number of questions (default 5)
   * @returns Array of quiz questions
   */
  async generateQuiz(
    graph: Graph & { nodes: Node[]; edges: Edge[] },
    questionCount?: number
  ): Promise<QuizQuestion[]>;

  /**
   * Clear cache for specific document
   */
  async clearCache(documentId: string): Promise<void>;
}
```

### 3.4 Implementation Details

**Caching Strategy:**
```typescript
// Cache key format: ai:{promptType}:{hash(context)}
// TTL: 1 hour for graph generation, 24 hours for explanations

async executeRequest<T>(request: AIRequest): Promise<AIResponse<T>> {
  const startTime = Date.now();

  // 1. Check cache
  if (request.cacheKey) {
    const cached = await this.redisClient.get(request.cacheKey);
    if (cached) {
      return {
        data: JSON.parse(cached),
        model: 'cached',
        tokensUsed: 0,
        cached: true,
        processingTime: Date.now() - startTime,
      };
    }
  }

  // 2. Build prompt
  const prompt = this.buildPrompt(request.promptType, request.context);

  // 3. Execute with fallback cascade
  try {
    const response = await this.callClaude(prompt, request.preferredModel);
    const parsed = this.parseResponse(response, request.promptType);

    // 4. Cache result
    if (request.cacheKey) {
      await this.redisClient.setex(
        request.cacheKey,
        3600, // 1 hour
        JSON.stringify(parsed)
      );
    }

    return {
      data: parsed,
      model: 'claude-sonnet-4',
      tokensUsed: response.usage.total_tokens,
      cached: false,
      processingTime: Date.now() - startTime,
    };
  } catch (error) {
    // Fallback to OpenAI
    return this.fallbackToOpenAI(prompt, request);
  }
}
```

**Prompt Templates:**
```typescript
// src/lib/ai/prompt-templates.ts

export const GRAPH_GENERATION_PROMPT = `You are a knowledge graph architect. Your task is to analyze the following text and create a conceptual knowledge graph.

Guidelines:
- Create 7-15 nodes representing key concepts
- Use clear, concise node labels (2-5 words)
- Create directed edges showing relationships
- Label edges with relationship types (supports, leads_to, defines, contradicts, etc.)
- Output valid Mermaid syntax

Text to analyze:
{{documentChunk}}

Output the graph in Mermaid format:
graph TD
    A[Concept 1] --> B[Concept 2]
    B --> C[Concept 3]
`;

export const CONNECTION_EXPLANATION_PROMPT = `Explain the relationship between two concepts based on the source text.

Concept A: {{nodeATitle}}
Concept B: {{nodeBTitle}}
Relationship: {{relationship}}

Source Text:
{{sourceText}}

{{#if userHypothesis}}
User's hypothesis: {{userHypothesis}}
{{/if}}

Provide:
1. A clear explanation of how these concepts are connected
2. Direct quotes from the source text supporting this connection
3. {{#if userHypothesis}}Comparison with user's hypothesis{{/if}}
`;

export const QUIZ_GENERATION_PROMPT = `Generate multiple-choice quiz questions based on this knowledge graph.

Graph Structure:
{{graphSummary}}

Generate {{questionCount}} questions with:
- 2 definition questions (test concept understanding)
- 2 relationship questions (test connections between concepts)
- 1 application question (test practical understanding)

For each question provide:
- Question text
- 4 answer options (1 correct, 3 plausible distractors)
- Index of correct answer
- Brief explanation of correct answer
- Difficulty level (easy, medium, hard)

Output as JSON array.
`;
```

**Fallback Cascade:**
```
1. Claude Sonnet 4 (primary)
   └─ Retry 3x with exponential backoff (1s, 2s, 4s)
   └─ If 429 (rate limit): Wait and retry
   └─ If 5xx: Fallback to step 2

2. Claude Haiku (faster, cheaper)
   └─ Same retry logic
   └─ If fails: Fallback to step 3

3. OpenAI GPT-4 Turbo (different provider)
   └─ Same retry logic
   └─ If fails: Throw AIServiceError
```

### 3.5 Dependencies

- **@anthropic-ai/sdk**: Claude API client
- **openai**: OpenAI API client
- **ioredis**: Redis caching
- **handlebars**: Prompt template rendering

### 3.6 Cost Tracking

```typescript
// Track AI costs per request
interface CostMetrics {
  timestamp: Date;
  model: string;
  tokensUsed: number;
  estimatedCost: number;
  cacheHit: boolean;
  promptType: string;
}

// Store in Redis sorted set for analytics
await redisClient.zadd(
  'ai:costs',
  Date.now(),
  JSON.stringify(metrics)
);
```

---

## 4. Text Chunking Library

### 4.1 Purpose

Split large documents into manageable chunks for parallel AI processing while maintaining semantic coherence.

### 4.2 Responsibilities

- Split text by semantic boundaries (sections, paragraphs)
- Maintain context overlap between chunks
- Respect token limits (max 10,000 tokens per chunk)
- Extract table of contents if available
- Preserve document structure

### 4.3 Interface Design

```typescript
// src/lib/chunking/text-chunker.ts

export interface ChunkOptions {
  maxChunkTokens: number;        // Default: 10000
  overlapTokens: number;          // Default: 200
  splitBySections: boolean;       // Default: true
  preserveHeaders: boolean;       // Default: true
}

export interface TextChunk {
  content: string;
  startIndex: number;
  endIndex: number;
  tokenCount: number;
  sectionTitle?: string;
  metadata: {
    chunkIndex: number;
    totalChunks: number;
    hasOverlapBefore: boolean;
    hasOverlapAfter: boolean;
  };
}

export class TextChunker {
  /**
   * Split text into semantic chunks
   *
   * @param text - Full document text
   * @param options - Chunking configuration
   * @returns Array of text chunks with metadata
   */
  static chunk(text: string, options?: Partial<ChunkOptions>): TextChunk[];

  /**
   * Estimate token count for text
   * Uses tiktoken for accurate counting
   */
  static countTokens(text: string): number;

  /**
   * Extract table of contents from document
   * Looks for markdown headers or numbered sections
   */
  static extractTOC(text: string): Array<{ level: number; title: string; index: number }>;
}
```

### 4.4 Chunking Algorithm

```
1. Detect document structure:
   - Check for markdown headers (# ## ###)
   - Check for numbered sections (1. 1.1 1.1.1)
   - Check for blank line patterns (paragraph breaks)

2. If TOC detected:
   - Split by top-level sections
   - Keep section headers with content
   - Respect max token limit per section

3. If no TOC:
   - Split by paragraphs
   - Combine small paragraphs until near max tokens
   - Break large paragraphs at sentence boundaries

4. Add overlap:
   - Last 200 tokens of chunk N
   - Become first 200 tokens of chunk N+1
   - Maintains context continuity

5. Return chunks with metadata:
   - Chunk index, total chunks
   - Start/end positions in original text
   - Section title if available
```

**Example:**
```typescript
const text = "... 50,000 tokens of ML paper ...";

const chunks = TextChunker.chunk(text, {
  maxChunkTokens: 10000,
  overlapTokens: 200,
  splitBySections: true,
});

// Result: 5 chunks
// Chunk 0: tokens 0-10000 (Introduction + Background)
// Chunk 1: tokens 9800-19800 (Methods) - 200 token overlap
// Chunk 2: tokens 19600-29600 (Results)
// Chunk 3: tokens 29400-39400 (Discussion)
// Chunk 4: tokens 39200-50000 (Conclusion)
```

### 4.5 Dependencies

- **tiktoken**: Accurate token counting (OpenAI's library)
- **compromise**: NLP for sentence detection

---

## 5. Graph Generation Service

### 5.1 Purpose

Orchestrate the complete graph generation pipeline: chunking → parallel AI processing → merging → validation.

### 5.2 Responsibilities

- Coordinate document chunking
- Dispatch chunks to AI service
- Merge mini-graphs into unified graph
- Deduplicate nodes
- Validate Mermaid syntax
- Store final graph in database
- Update job progress

### 5.3 Interface Design

```typescript
// src/services/graph-generator.service.ts

export interface GraphGenerationOptions {
  nodeTargetCount?: number;      // Default: 7-15
  enableParallelProcessing?: boolean; // Default: true
  maxConcurrency?: number;        // Default: 3
}

export interface GraphGenerationProgress {
  stage: 'chunking' | 'ai-processing' | 'merging' | 'validation' | 'complete';
  percentComplete: number;
  chunksProcessed: number;
  totalChunks: number;
  currentStage: string;
}

export class GraphGeneratorService {
  constructor(
    private readonly aiService: AIService,
    private readonly prisma: PrismaClient,
    private readonly logger: Logger
  ) {}

  /**
   * Generate knowledge graph from document
   *
   * Main pipeline:
   * 1. Chunk document text
   * 2. Generate mini-graphs in parallel
   * 3. Merge graphs and deduplicate nodes
   * 4. Validate Mermaid syntax
   * 5. Save to database
   *
   * @param documentId - Document to process
   * @param options - Generation configuration
   * @returns Generated graph with nodes and edges
   */
  async generateGraph(
    documentId: string,
    options?: GraphGenerationOptions
  ): Promise<Graph>;

  /**
   * Get generation progress for job
   */
  async getProgress(jobId: string): Promise<GraphGenerationProgress>;
}
```

### 5.4 Generation Pipeline

```
┌─────────────────────────────────────────┐
│  1. CHUNKING PHASE                      │
├─────────────────────────────────────────┤
│  • Fetch document from database         │
│  • Split into 10K token chunks          │
│  • 200 token overlap between chunks     │
│  Result: 5 chunks for 50K token doc     │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  2. PARALLEL AI PROCESSING              │
├─────────────────────────────────────────┤
│  Worker 1: Chunk 1 → Mini-graph A       │
│    Nodes: A1[ML], A2[Supervised], A3    │
│    Edges: A1→A2, A1→A3                  │
│                                          │
│  Worker 2: Chunk 2 → Mini-graph B       │
│    Nodes: B1[Supervised], B2, B3        │
│    Edges: B1→B2, B2→B3                  │
│                                          │
│  Worker 3: Chunk 3 → Mini-graph C       │
│    Nodes: C1, C2, C3                    │
│    Edges: C1→C2, C2→C3                  │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  3. NODE DEDUPLICATION                  │
├─────────────────────────────────────────┤
│  • Compare node titles with similarity  │
│  • "Supervised Learning" ≈ "Supervised" │
│  • Merge A2 and B1 (same concept)       │
│  • Combine document references          │
│  Result: 8 unique nodes instead of 9    │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  4. GRAPH MERGING                       │
├─────────────────────────────────────────┤
│  • Combine all nodes and edges          │
│  • Resolve conflicting edges            │
│    (A→B "supports" + A→B "leads_to"     │
│     → keep strongest relationship)      │
│  • Prune weak connections (< 0.3)       │
│  Result: Unified graph structure        │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  5. MERMAID GENERATION                  │
├─────────────────────────────────────────┤
│  • Convert graph structure to Mermaid   │
│  • Assign node IDs (A, B, C...)         │
│  • Format edge syntax                   │
│  Output: graph TD                       │
│          A[ML] --> B[Supervised]        │
│          B --> C[Feature Engineering]   │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  6. DATABASE STORAGE                    │
├─────────────────────────────────────────┤
│  • Create Graph record                  │
│  • Create Node records (bulk insert)    │
│  • Create Edge records (bulk insert)    │
│  • Update document status → ready       │
└─────────────────────────────────────────┘
```

### 5.5 Node Deduplication Algorithm

```typescript
// src/lib/graph/node-deduplicator.ts

export class NodeDeduplicator {
  /**
   * Find and merge duplicate nodes across mini-graphs
   *
   * Uses:
   * 1. Exact title match (case-insensitive)
   * 2. Semantic similarity (cosine similarity > 0.85)
   * 3. Substring match (one title contains other)
   */
  static deduplicate(nodes: Node[]): Node[] {
    const uniqueNodes: Node[] = [];
    const mergeMap = new Map<string, string>(); // duplicateId → uniqueId

    for (const node of nodes) {
      const duplicate = this.findDuplicate(node, uniqueNodes);

      if (duplicate) {
        // Merge: combine document refs, keep better snippet
        duplicate.documentRefs = [
          ...duplicate.documentRefs,
          ...node.documentRefs,
        ];
        mergeMap.set(node.id, duplicate.id);
      } else {
        uniqueNodes.push(node);
      }
    }

    return { uniqueNodes, mergeMap };
  }

  private static findDuplicate(node: Node, existing: Node[]): Node | null {
    for (const existingNode of existing) {
      // Exact match
      if (node.title.toLowerCase() === existingNode.title.toLowerCase()) {
        return existingNode;
      }

      // Semantic similarity (would use embeddings in production)
      const similarity = this.calculateSimilarity(node.title, existingNode.title);
      if (similarity > 0.85) {
        return existingNode;
      }

      // Substring match
      if (node.title.includes(existingNode.title) ||
          existingNode.title.includes(node.title)) {
        return existingNode;
      }
    }

    return null;
  }
}
```

### 5.6 Dependencies

- **ai-orchestrator.service**: AI API calls
- **text-chunker**: Document splitting
- **node-deduplicator**: Merge duplicate concepts
- **graph-merger**: Combine mini-graphs
- **graph-validator**: Validate Mermaid syntax

---

## 6. Connection Explanation Service

### 6.1 Purpose

Generate AI explanations for edges between nodes, optionally comparing with user hypotheses.

### 6.2 Interface Design

```typescript
// src/services/connection.service.ts

export interface ConnectionExplanationRequest {
  edgeId: string;
  userHypothesis?: string;  // User's explanation attempt
}

export interface ConnectionExplanation {
  explanation: string;
  sourceQuotes: Array<{ text: string; nodeRef: string }>;
  userComparison?: {
    userHypothesis: string;
    similarity: 'accurate' | 'partially_correct' | 'incorrect';
    feedback: string;
  };
}

export class ConnectionService {
  constructor(
    private readonly aiService: AIService,
    private readonly prisma: PrismaClient
  ) {}

  /**
   * Generate explanation for connection between nodes
   *
   * Flow:
   * 1. Fetch edge with from/to nodes
   * 2. Extract relevant source text from document refs
   * 3. Call AI with context + optional user hypothesis
   * 4. Cache result in edge.aiExplanation
   *
   * @param request - Edge ID and optional user hypothesis
   * @returns Explanation with source citations
   */
  async explainConnection(
    request: ConnectionExplanationRequest
  ): Promise<ConnectionExplanation>;
}
```

---

## 7. Quiz Generation Service

### 7.1 Purpose

Generate comprehension questions based on graph structure and content.

### 7.2 Interface Design

```typescript
// src/services/quiz.service.ts

export interface QuizGenerationOptions {
  questionCount: number;      // Default: 5
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed'; // Default: mixed
  focusNodes?: string[];      // Generate questions about specific nodes
}

export class QuizService {
  constructor(
    private readonly aiService: AIService,
    private readonly prisma: PrismaClient
  ) {}

  /**
   * Generate quiz questions from graph
   *
   * Distribution:
   * - 40% Definition questions (What is X?)
   * - 40% Relationship questions (How does A relate to B?)
   * - 20% Application questions (When would you use X?)
   */
  async generateQuiz(
    graphId: string,
    options?: Partial<QuizGenerationOptions>
  ): Promise<QuizQuestion[]>;

  /**
   * Validate quiz submission
   */
  async submitQuiz(
    questionIds: string[],
    answers: number[]
  ): Promise<QuizResult>;
}
```

---

## 8. Note Service

### 8.1 Purpose

Simple CRUD operations for user notes on nodes, edges, and graphs.

### 8.2 Interface Design

```typescript
// src/services/note.service.ts

export class NoteService {
  constructor(private readonly prisma: PrismaClient) {}

  async createNote(data: {
    content: string;
    graphId: string;
    nodeId?: string;
    edgeId?: string;
  }): Promise<Note>;

  async updateNote(noteId: string, content: string): Promise<Note>;

  async deleteNote(noteId: string): Promise<void>;

  async getNotesByGraph(graphId: string): Promise<Note[]>;
}
```

---

## 9. Background Job System

### 9.1 Purpose

Handle long-running async tasks (document processing, graph generation) using BullMQ.

### 9.2 Queue Configuration

```typescript
// src/workers/queues.ts

export const QUEUES = {
  DOCUMENT_PROCESSING: {
    name: 'document-processing',
    concurrency: 3,
    timeout: 60000, // 1 minute
    retries: 3,
    backoff: { type: 'exponential', delay: 1000 },
  },
  GRAPH_GENERATION: {
    name: 'graph-generation',
    concurrency: 2,
    timeout: 300000, // 5 minutes
    retries: 3,
    backoff: { type: 'exponential', delay: 2000 },
  },
  QUIZ_GENERATION: {
    name: 'quiz-generation',
    concurrency: 2,
    timeout: 30000, // 30 seconds
    retries: 2,
  },
};
```

### 9.3 Worker Implementation

```typescript
// src/workers/graph-generation.worker.ts

import { Worker, Job } from 'bullmq';

interface GraphGenerationJobData {
  documentId: string;
  options?: GraphGenerationOptions;
}

const worker = new Worker(
  QUEUES.GRAPH_GENERATION.name,
  async (job: Job<GraphGenerationJobData>) => {
    const { documentId, options } = job.data;

    // Update progress: chunking
    await job.updateProgress({ stage: 'chunking', percentComplete: 0 });

    // Execute generation
    const graph = await graphGeneratorService.generateGraph(documentId, options);

    // Update progress: complete
    await job.updateProgress({ stage: 'complete', percentComplete: 100 });

    return { graphId: graph.id };
  },
  {
    connection: redisConnection,
    concurrency: QUEUES.GRAPH_GENERATION.concurrency,
    autorun: true,
  }
);

worker.on('completed', (job) => {
  logger.info(`Graph generation completed for job ${job.id}`);
});

worker.on('failed', (job, err) => {
  logger.error(`Graph generation failed for job ${job?.id}: ${err.message}`);
});
```

---

## 10. Service Dependencies

### 10.1 Dependency Graph

```
Controllers
    ↓
┌───────────────────────────────────────────┐
│  Services                                  │
├───────────────────────────────────────────┤
│  document-processor.service.ts            │
│    ├─ prisma                              │
│    ├─ logger                              │
│    └─ pdf-parse, cheerio, puppeteer       │
│                                            │
│  ai-orchestrator.service.ts               │
│    ├─ anthropic, openai                   │
│    ├─ redis (caching)                     │
│    ├─ logger                              │
│    └─ prompt-templates                    │
│                                            │
│  graph-generator.service.ts               │
│    ├─ ai-orchestrator.service             │
│    ├─ text-chunker                        │
│    ├─ node-deduplicator                   │
│    ├─ graph-merger                        │
│    ├─ graph-validator                     │
│    └─ prisma                              │
│                                            │
│  connection.service.ts                    │
│    ├─ ai-orchestrator.service             │
│    └─ prisma                              │
│                                            │
│  quiz.service.ts                          │
│    ├─ ai-orchestrator.service             │
│    └─ prisma                              │
│                                            │
│  note.service.ts                          │
│    └─ prisma                              │
└───────────────────────────────────────────┘
    ↓
┌───────────────────────────────────────────┐
│  Libraries                                 │
├───────────────────────────────────────────┤
│  text-chunker.ts (lib/chunking/)          │
│  node-deduplicator.ts (lib/graph/)        │
│  graph-merger.ts (lib/graph/)             │
│  graph-validator.ts (lib/graph/)          │
│  prompt-templates.ts (lib/ai/)            │
└───────────────────────────────────────────┘
```

### 10.2 Implementation Order

**Phase 1: Foundation** (Parallel)
1. `document-processor.service.ts` + `ai-orchestrator.service.ts`
2. `text-chunker.ts` + `prompt-templates.ts`

**Phase 2: Core Pipeline** (Sequential)
3. `node-deduplicator.ts` + `graph-merger.ts` + `graph-validator.ts`
4. `graph-generator.service.ts` (integrates all above)

**Phase 3: Workers** (Parallel)
5. BullMQ queue setup + workers for document processing & graph generation

**Phase 4: Secondary Features** (Parallel)
6. `connection.service.ts` + `quiz.service.ts` + `note.service.ts`

---

## Next Steps

1. Review this design document with stakeholders
2. Create tasks in TODO.md for each service
3. Begin implementation with Phase 1 (foundation services)
4. Use specialized agents per CLAUDE.md workflow:
   - `document-extraction-processor` for document service
   - `ai-integration-specialist` for AI orchestrator
   - `bullmq-job-processor` for workers
   - `comprehensive-test-writer` for test coverage

**Estimated Timeline:**
- Phase 1: 2 days
- Phase 2: 3 days
- Phase 3: 2 days
- Phase 4: 2 days
- Testing: 2 days
- **Total: ~11 days** (Week 1 + Week 2 of MVP)

# Server-Side Technical Design Document

## Graphex - Knowledge Graph Learning Platform Backend

**Version:** 1.0  
**Last Updated:** November 11, 2025  
**Status:** Living Document

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Technology Stack](#3-technology-stack)
4. [API Design](#4-api-design)
5. [Database Design](#5-database-design)
6. [AI System Architecture](#6-ai-system-architecture)
7. [Document Processing Pipeline](#7-document-processing-pipeline)
8. [Web Content Extraction](#8-web-content-extraction)
9. [File Structure](#9-file-structure)
10. [Background Job System](#10-background-job-system)
11. [Caching Strategy](#11-caching-strategy)
12. [Error Handling & Resilience](#12-error-handling--resilience)
13. [Security Considerations](#13-security-considerations)
14. [Deployment & Infrastructure](#14-deployment--infrastructure)
15. [Performance Targets](#15-performance-targets)
16. [Monitoring & Observability](#16-monitoring--observability)

---

## 1. System Overview

### 1.1 Purpose

The backend system powers an AI-assisted learning platform that transforms documents into interactive knowledge graphs, enabling structured, active learning through graph visualization, note-taking, and comprehension verification.

### 1.2 Core Responsibilities

- **Document Ingestion**: Accept PDFs, text files, markdown, and web URLs
- **Content Extraction**: Parse and extract text from various document formats
- **Graph Generation**: Use AI to create knowledge graphs from document content
- **Knowledge Management**: Store and serve graphs, nodes, edges, and user notes
- **Quiz Generation**: Create comprehension questions based on graph content
- **Connection Explanation**: Generate AI explanations for relationships between concepts

### 1.3 Key Challenges

- **Large Documents**: Handle PDFs with 100+ pages (50,000+ tokens)
- **AI Cost Optimization**: Minimize API calls while maintaining quality
- **Async Processing**: Long-running tasks (graph generation takes 30s-5min)
- **Web Scraping**: Extract clean content from arbitrary URLs
- **Scalability**: Support multiple concurrent document processing jobs

---

## 2. Architecture

### 2.1 High-Level Architecture

```
┌──────────────┐
│   Clients    │ (Web, iOS, Mac)
└──────┬───────┘
       │ HTTPS/REST
       ▼
┌─────────────────────────────────┐
│      API Layer (Express.js)      │
│  • Request validation            │
│  • Route handling                │
│  • Response formatting           │
└──────┬─────────────┬────────────┘
       │             │
       ▼             ▼
┌─────────────┐  ┌──────────────┐
│  Services   │  │  Background  │
│  Layer      │  │  Workers     │
│             │  │  (BullMQ)    │
└──────┬──────┘  └──────┬───────┘
       │                │
       ▼                ▼
┌─────────────────────────────────┐
│       Data Layer                 │
│  • PostgreSQL (primary data)     │
│  • Redis (cache + job queue)    │
│  • S3 (document storage)         │
└─────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│    External Services             │
│  • Anthropic Claude API          │
│  • OpenAI API (fallback)         │
└─────────────────────────────────┘
```

### 2.2 Architecture Patterns

- **Layered Architecture**: API → Services → Data Access
- **Async Job Processing**: Long-running tasks offloaded to background workers
- **Stateless API**: Enables horizontal scaling, session data in database/Redis
- **Service-Oriented**: Each major feature (documents, graphs, AI) is a separate service
- **Fail-Safe Design**: Graceful degradation when external services unavailable

### 2.3 Design Principles

1. **Separation of Concerns**: Clear boundaries between API, business logic, and data
2. **Async-First**: All AI and document processing operations are asynchronous
3. **Idempotent Operations**: Safe to retry failed operations
4. **Type Safety**: End-to-end TypeScript with shared type definitions
5. **Observable**: Structured logging and metrics throughout

---

## 3. Technology Stack

### 3.1 Core Technologies

| Component | Technology | Version | Rationale |
|-----------|-----------|---------|-----------|
| Runtime | Node.js | 20 LTS | Stable, excellent async support, large ecosystem |
| Language | TypeScript | 5+ | Type safety, better developer experience |
| Framework | Express.js | 4.x | Simple, flexible, well-understood for MVP |
| Database | PostgreSQL | 15+ | JSONB support for flexible graph storage, reliable, mature |
| ORM | Prisma | 5+ | Auto-generated types, excellent DX, migration management |
| Cache & Queue | Redis | 7+ | In-memory speed, pub/sub, job queue foundation |
| Job Queue | BullMQ | 5+ | Built on Redis, automatic retries, monitoring dashboard |

### 3.2 AI & Processing

| Service | Technology | Purpose |
|---------|-----------|---------|
| Primary LLM | Anthropic Claude Sonnet 4 | Graph generation, explanations, quiz questions |
| Fallback LLM | OpenAI GPT-4 Turbo | Redundancy when Claude unavailable |
| PDF Processing | pdf-parse + pdfjs-dist | Text extraction from PDFs |
| Web Scraping | Puppeteer + Cheerio | Dynamic and static content extraction |
| HTML Parsing | Readability.js | Article content extraction (reader mode) |
| File Storage | AWS S3 (or local for MVP) | Document file persistence |

### 3.3 Key Dependencies

- **Validation**: Zod (type-safe schema validation)
- **Logging**: Winston (structured JSON logs)
- **HTTP Client**: Axios (external API calls)
- **File Upload**: Multer (multipart/form-data)
- **Rate Limiting**: express-rate-limit + Redis store
- **Security**: Helmet.js, CORS middleware

---

## 4. API Design

### 4.1 RESTful API Principles

- **Resource-Based URLs**: `/documents`, `/graphs`, `/notes`
- **HTTP Methods**: GET (read), POST (create), PUT (update), DELETE (remove)
- **Versioning**: `/api/v1/` prefix for future compatibility
- **Consistent Response Format**: All responses follow standard structure
- **Status Codes**: Proper HTTP status codes (200, 201, 400, 404, 500, 503)

### 4.2 Core Endpoints (MVP)

```
Document Management
├── POST   /api/v1/documents                    # Upload file
├── POST   /api/v1/documents/from-url           # Create from URL
├── GET    /api/v1/documents/:id                # Get document details
└── GET    /api/v1/documents/:id/status         # Check processing status

Graph Operations
├── POST   /api/v1/graphs/generate              # Start graph generation (returns jobId)
├── GET    /api/v1/graphs/:id                   # Get graph data
└── GET    /api/v1/jobs/:id                     # Check job status

Connection Explanations
└── POST   /api/v1/connections/explain          # Get AI explanation for edge

Quiz System
├── POST   /api/v1/quizzes/generate             # Generate quiz questions
└── POST   /api/v1/quizzes/:id/submit           # Submit quiz answers

Notes (Optional for MVP - can use local storage)
├── POST   /api/v1/notes                        # Create note
├── GET    /api/v1/notes?graphId=:id            # Get all notes for graph
├── PUT    /api/v1/notes/:id                    # Update note
└── DELETE /api/v1/notes/:id                    # Delete note
```

### 4.3 Response Format Standard

**Success Response:**
```json
{
  "success": true,
  "data": {
    // Response payload
  },
  "meta": {
    "timestamp": "2025-11-11T10:00:00Z",
    "requestId": "uuid-v4"
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "DOCUMENT_PROCESSING_FAILED",
    "message": "Human-readable error message",
    "details": {
      // Additional context (optional)
    }
  },
  "meta": {
    "timestamp": "2025-11-11T10:00:00Z",
    "requestId": "uuid-v4"
  }
}
```

### 4.4 Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_REQUEST` | 400 | Malformed request or validation error |
| `DOCUMENT_NOT_FOUND` | 404 | Document ID does not exist |
| `GRAPH_NOT_FOUND` | 404 | Graph ID does not exist |
| `UNSUPPORTED_FORMAT` | 400 | File format not supported |
| `FILE_TOO_LARGE` | 400 | File exceeds size limit |
| `PROCESSING_FAILED` | 500 | Document/graph processing failed |
| `AI_SERVICE_UNAVAILABLE` | 503 | AI API temporarily unavailable |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |

### 4.5 Rate Limiting

- **General API**: 1000 requests/hour per IP
- **AI Operations**: 100 requests/hour per IP (graph generation, explanations)
- **File Uploads**: 10 uploads/hour per IP
- **URL Extraction**: 10 URLs/hour per IP

---

## 5. Database Design

### 5.1 Schema Overview

**Core Entities:**
- `documents`: Uploaded/extracted documents
- `graphs`: Generated knowledge graphs
- `nodes`: Individual concepts in graphs
- `edges`: Connections between nodes
- `notes`: User annotations (optional for MVP)
- `quiz_questions`: Generated comprehension questions

### 5.2 Entity Schemas

#### Documents Table
```
documents
├── id (UUID, PK)
├── title (String)
├── content_text (Text)              # Full extracted text
├── file_path (String)               # S3 key or local path
├── source_url (String, nullable)    # If created from URL
├── source_type (Enum)               # pdf | text | markdown | url
├── file_size (Integer)              # In bytes
├── status (Enum)                    # processing | ready | failed
├── error_message (Text, nullable)
├── created_at (DateTime)
└── updated_at (DateTime)
```

#### Graphs Table
```
graphs
├── id (UUID, PK)
├── document_id (UUID, FK → documents)
├── mermaid_code (Text)              # Generated Mermaid syntax
├── layout_config (JSONB)            # Node positions, styling preferences
├── generation_model (String)        # claude-sonnet-4, etc.
├── status (Enum)                    # generating | ready | failed
├── version (Integer)                # For future graph updates
└── created_at (DateTime)
```

#### Nodes Table
```
nodes
├── id (UUID, PK)
├── graph_id (UUID, FK → graphs)
├── node_key (String)                # e.g., "A", "concept1"
├── title (String)                   # Node display label
├── content_snippet (Text)           # Brief description
├── document_refs (JSONB)            # [{start, end, text}] - references to source
├── position_x (Float, nullable)     # For future drag-drop
├── position_y (Float, nullable)
└── metadata (JSONB)                 # Color, importance, etc.
```

#### Edges Table
```
edges
├── id (UUID, PK)
├── graph_id (UUID, FK → graphs)
├── from_node_id (UUID, FK → nodes)
├── to_node_id (UUID, FK → nodes)
├── relationship (String)            # supports | leads_to | contradicts
├── ai_explanation (Text, nullable)  # Cached explanation
├── strength (Float, nullable)       # Confidence score (0-1)
└── metadata (JSONB)                 # Additional properties
```

#### Notes Table (Optional - MVP can use client local storage)
```
notes
├── id (UUID, PK)
├── node_id (UUID, FK → nodes, nullable)
├── edge_id (UUID, FK → edges, nullable)
├── graph_id (UUID, FK → graphs)
├── content (Text)
├── created_at (DateTime)
└── updated_at (DateTime)
```

#### Quiz Questions Table
```
quiz_questions
├── id (UUID, PK)
├── graph_id (UUID, FK → graphs)
├── question_text (Text)
├── options (JSONB)                  # Array of answer options
├── correct_answer (Integer)         # Index of correct option
├── explanation (Text)
├── difficulty (Enum)                # easy | medium | hard
└── node_refs (JSONB)                # Which nodes this question tests
```

### 5.3 Indexes

**Critical Indexes:**
```sql
CREATE INDEX idx_graphs_document_id ON graphs(document_id);
CREATE INDEX idx_nodes_graph_id ON nodes(graph_id);
CREATE INDEX idx_edges_graph_id ON edges(graph_id);
CREATE INDEX idx_edges_from_to ON edges(from_node_id, to_node_id);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_graphs_status ON graphs(status);
```

### 5.4 Data Relationships

```
documents (1) ─────→ (many) graphs
graphs (1) ─────→ (many) nodes
graphs (1) ─────→ (many) edges
nodes (1) ─────→ (many) edges (from_node)
nodes (1) ─────→ (many) edges (to_node)
graphs (1) ─────→ (many) quiz_questions
```

---

## 6. AI System Architecture

### 6.1 Challenge: Processing Large Documents

**Problem Statement:**
- Single PDF can be 100+ pages = 50,000+ tokens
- AI models have context limits (Claude: 200K, but cost increases)
- Single API call would be slow and expensive
- Need to maintain coherence across document

**Solution: Chunked Processing with Graph Merging**

### 6.2 Document Processing Strategy

```
Document Upload (100 pages)
        ↓
Extract Full Text
        ↓
Intelligent Chunking
├── Split by sections/chapters (if TOC available)
├── Maintain context overlap (200 tokens between chunks)
├── Max chunk size: 10,000 tokens
└── Result: 10 chunks
        ↓
Parallel Processing (BullMQ)
├── Worker 1: Chunk 1 → Mini-graph A (nodes: A1, A2, A3)
├── Worker 2: Chunk 2 → Mini-graph B (nodes: B1, B2, B3)
└── Worker 3: Chunk 3 → Mini-graph C (nodes: C1, C2, C3)
        ↓
Graph Merging Algorithm
├── Detect duplicate concepts (A3 ≈ B1 → merge)
├── Reconcile conflicting edges
└── Build unified graph structure
        ↓
Final Graph (7-15 nodes total)
```

### 6.3 AI Service Architecture

**Primary Flow:**
```
Client Request
     ↓
API Endpoint
     ↓
Enqueue Job (BullMQ)
     ↓
Return Job ID (immediate response)
     ↓
Worker Picks Up Job
     ↓
AI Orchestrator Service
├── 1. Check cache (Redis)
├── 2. Build prompt (from templates)
├── 3. Call Claude API
├── 4. Parse response
├── 5. Validate output
├── 6. Cache result
└── 7. Handle errors/retries
     ↓
Save to Database
     ↓
Client polls /jobs/:id for status
```

### 6.4 AI Prompt Strategy

**Key Prompts (High-Level):**

1. **Graph Generation Prompt**
   - System role: Knowledge graph architect
   - Constraints: 7-15 nodes, clear labels, directed edges
   - Output format: Valid Mermaid syntax
   - Include: 1-2 few-shot examples

2. **Connection Explanation Prompt**
   - Context: Node A, Node B, relationship type
   - Task: Explain connection based on source text
   - Include: User hypothesis (if provided)
   - Output: Explanation + source citations

3. **Quiz Generation Prompt**
   - Input: Graph structure + node descriptions
   - Task: Create 5 multiple-choice questions
   - Distribution: 2 definitions, 2 relationships, 1 application
   - Output: JSON array with questions/answers/explanations

### 6.5 AI Cost Optimization

**Strategies:**

1. **Caching**: Store AI responses in Redis (1-hour TTL)
   - Graph for same document: Cache hit
   - Same connection explanation: Cache hit
   - Estimated savings: ~60% on repeat requests

2. **Model Selection**:
   - Claude Sonnet 4: Complex tasks (graph generation)
   - Claude Haiku: Simple tasks (quiz questions)
   - Cost reduction: ~50%

3. **Chunking Strategy**:
   - Parallel processing: Faster overall time
   - Reusable chunks: Similar documents share chunks
   - Smart merging: Fewer total nodes = cheaper

4. **Batching**:
   - Queue multiple graph generations
   - Process during off-peak hours
   - Better rate limit management

### 6.6 Fallback Cascade

**AI Service Failure Handling:**

```
1. Try: Claude Sonnet 4 (best quality)
   ↓ (if fails)
2. Try: Claude Haiku (faster, cheaper)
   ↓ (if fails)
3. Try: OpenAI GPT-4 Turbo (different provider)
   ↓ (if fails)
4. Fallback: Simple outline-based graph
   - Extract headers/sections from document
   - Create basic hierarchical graph
   - No AI explanations, just structure
```

**Rate Limit Handling:**
- Exponential backoff: 1s, 2s, 4s, 8s
- Re-queue job with delay
- User notification: "High demand, estimated wait: 5 minutes"

---

## 7. Document Processing Pipeline

### 7.1 Processing Flow

```
File Upload
     ↓
Validation (format, size)
     ↓
Store File (S3 or local)
     ↓
Create Document Record (status: processing)
     ↓
Enqueue Processing Job
     ↓
Return Document ID
     ↓
Worker: Text Extraction
├── PDF → pdf-parse
├── Text → read file
└── Markdown → read file
     ↓
Worker: Text Cleaning
├── Remove headers/footers
├── Fix encoding issues
└── Normalize whitespace
     ↓
Store Extracted Text
     ↓
Update Document Status → ready
```

### 7.2 File Format Support

| Format | Library | Notes |
|--------|---------|-------|
| PDF | pdf-parse + pdfjs-dist | Text-based PDFs only (no OCR for MVP) |
| TXT | Node.js fs | Direct read |
| MD | Node.js fs + marked | Parse markdown structure |

**Limitations (MVP):**
- No OCR for scanned PDFs
- No image extraction
- No table parsing
- Max file size: 10MB

### 7.3 Error Handling

**Common Failures:**
- Encrypted/password-protected PDF → Error: "Encrypted PDFs not supported"
- Scanned PDF (no text) → Error: "No text found in PDF"
- Corrupted file → Error: "Unable to parse file"
- Timeout (>60s) → Error: "Processing timeout"

All errors stored in `documents.error_message` field

---

## 8. Web Content Extraction

### 8.1 URL Processing Flow

```
User submits URL
     ↓
Validate URL (format, domain whitelist)
     ↓
Create Document Record (source_type: url)
     ↓
Enqueue Scraping Job
     ↓
Worker: Fetch Content
├── Check if static or dynamic
├── Static → Cheerio (fast)
└── Dynamic → Puppeteer (JS execution)
     ↓
Worker: Extract Article Content
├── Apply Readability.js
├── Extract main content
└── Filter ads, navigation, etc.
     ↓
Worker: Convert to Markdown
└── Clean HTML → Markdown
     ↓
Store Content
     ↓
Continue with normal document processing
```

### 8.2 Scraping Strategy

**Two-Tier Approach:**

1. **Fast Path (Static Sites)**: Cheerio
   - No browser overhead
   - 10x faster
   - Suitable for: Wikipedia, ArXiv, most blogs

2. **Slow Path (Dynamic Sites)**: Puppeteer
   - Full browser rendering
   - Wait for JavaScript execution
   - Suitable for: SPAs, React sites, dynamic content

**Decision Logic:**
```typescript
if (isKnownStaticSite(url)) {
  return cheerioExtract(url);
} else {
  return puppeteerExtract(url);
}
```

### 8.3 Reader Mode Implementation

**Using Mozilla's Readability.js:**
```
Load HTML in Puppeteer/Cheerio
     ↓
Parse with Readability.js
     ↓
Extract:
├── Title
├── Author (if available)
├── Published date
├── Main content (article text)
└── Estimated reading time
     ↓
Convert HTML to clean Markdown
```

### 8.4 Safety & Limits

**Constraints:**
- Timeout: 30 seconds per URL
- Whitelist: Start with trusted domains (Wikipedia, ArXiv, Medium, etc.)
- Respect robots.txt
- User-Agent: Identify as educational bot
- Max 10 URL extractions per user per hour

**Sandboxing:**
- Run Puppeteer in containerized environment
- No access to internal network
- Kill process if exceeds memory limit

---

## 9. File Structure

```
server/
├── src/
│   ├── config/                      # Configuration & setup
│   │   ├── database.ts              # Prisma client
│   │   ├── redis.ts                 # Redis connection
│   │   ├── ai-clients.ts            # Claude/OpenAI clients
│   │   └── constants.ts             # App-wide constants
│   │
│   ├── routes/                      # API route definitions
│   │   ├── index.ts                 # Route aggregator
│   │   ├── documents.route.ts
│   │   ├── graphs.route.ts
│   │   ├── connections.route.ts
│   │   ├── quizzes.route.ts
│   │   └── notes.route.ts
│   │
│   ├── controllers/                 # HTTP request handlers
│   │   ├── document.controller.ts
│   │   ├── graph.controller.ts
│   │   ├── connection.controller.ts
│   │   └── quiz.controller.ts
│   │
│   ├── services/                    # Business logic
│   │   ├── document-processor.service.ts
│   │   ├── graph-generator.service.ts
│   │   ├── ai-orchestrator.service.ts
│   │   ├── web-scraper.service.ts
│   │   └── cache.service.ts
│   │
│   ├── lib/                         # Core algorithms & logic
│   │   ├── chunking/
│   │   │   ├── text-chunker.ts
│   │   │   └── semantic-chunker.ts
│   │   ├── graph/
│   │   │   ├── graph-merger.ts
│   │   │   ├── node-deduplicator.ts
│   │   │   └── graph-validator.ts
│   │   ├── ai/
│   │   │   ├── prompt-templates.ts
│   │   │   ├── prompt-builder.ts
│   │   │   └── response-parser.ts
│   │   └── scraping/
│   │       ├── reader-extractor.ts
│   │       └── content-cleaner.ts
│   │
│   ├── workers/                     # Background job handlers
│   │   ├── graph-generation.worker.ts
│   │   ├── document-processing.worker.ts
│   │   └── quiz-generation.worker.ts
│   │
│   ├── utils/                       # Helper functions
│   │   ├── string.util.ts
│   │   ├── validators.util.ts
│   │   ├── logger.util.ts
│   │   └── response.util.ts
│   │
│   ├── middleware/                  # Express middleware
│   │   ├── error-handler.ts
│   │   ├── rate-limiter.ts
│   │   ├── request-logger.ts
│   │   └── cors.ts
│   │
│   ├── types/                       # TypeScript definitions
│   │   ├── api.types.ts
│   │   ├── graph.types.ts
│   │   └── document.types.ts
│   │
│   ├── app.ts                       # Express app setup
│   └── server.ts                    # Entry point
│
├── prisma/
│   ├── schema.prisma                # Database schema
│   └── migrations/                  # Database migrations
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── scripts/
│   ├── seed-database.ts
│   └── run-migrations.ts
│
├── .env.example
├── .env.development
├── .env.production
├── package.json
├── tsconfig.json
├── Dockerfile
└── docker-compose.yml
```

---

## 10. Background Job System

### 10.1 Job Queue Architecture (BullMQ)

**Why BullMQ:**
- Built on Redis (already in stack)
- Automatic retries with exponential backoff
- Job prioritization
- Rate limiting
- Monitoring dashboard (Bull Board)
- Prevents blocking API requests during expensive operations

### 10.2 Job Types

| Job Type | Priority | Timeout | Retries | Purpose |
|----------|----------|---------|---------|---------|
| `document-processing` | High | 60s | 3 | Extract text from files |
| `graph-generation` | Medium | 5min | 2 | Generate knowledge graph |
| `quiz-generation` | Low | 30s | 2 | Create quiz questions |
| `connection-explanation` | High | 10s | 3 | Explain edge relationship |

### 10.3 Job Flow

```
API receives request
     ↓
Validate input
     ↓
Add job to queue with priority
     ↓
Return job ID to client
     ↓
Worker pool picks up job
     ↓
Execute job (call services)
     ↓
Update job status (completed/failed)
     ↓
Store result in database
     ↓
Client polls /jobs/:id for updates
```

### 10.4 Worker Configuration

**Concurrency:**
- Document processing workers: 2-3 concurrent
- Graph generation workers: 1-2 concurrent (AI rate limits)
- Quiz generation workers: 2 concurrent

**Retry Strategy:**
```
Attempt 1: Immediate
Attempt 2: After 5 seconds
Attempt 3: After 30 seconds
Failed: Move to failed queue, log error
```

---

## 11. Caching Strategy

### 11.1 Redis Caching Layers

**What to Cache:**

1. **AI Responses** (1-hour TTL)
   - Generated graphs (by document hash)
   - Connection explanations (by edge ID)
   - Quiz questions (by graph ID)

2. **Processed Documents** (24-hour TTL)
   - Extracted text (by document ID)
   - Chunk mappings (by document ID)

3. **Frequently Accessed Data** (10-minute TTL)
   - Graph data (by graph ID)
   - Node/edge data (by graph ID)

### 11.2 Cache Invalidation

**Rules:**
- Document updated → Invalidate all related graphs
- Graph regenerated → Invalidate old graph cache
- Note added → Don't invalidate graph (notes separate)

**Pattern:**
```
Cache key format: {entity}:{id}:{version}
Example: graph:abc123:v1
```

### 11.3 Cache-Aside Pattern

```
Request data
     ↓
Check cache
     ├─ Hit: Return cached data
     │
     └─ Miss:
         ↓
         Query database
         ↓
         Store in cache
         ↓
         Return data
```

---

## 12. Error Handling & Resilience

### 12.1 Error Categories

**Client Errors (4xx):**
- Invalid input validation
- Unsupported file format
- Resource not found
- Rate limit exceeded

**Server Errors (5xx):**
- Database connection failure
- AI API unavailable
- Processing timeout
- Unexpected exceptions

### 12.2 Error Response Strategy

**All errors return consistent format:**
```json
{
  "success": false,
  "error": {
    "code": "SPECIFIC_ERROR_CODE",
    "message": "User-friendly message",
    "details": { /* context */ }
  }
}
```

### 12.3 Resilience Patterns

**Circuit Breaker (AI APIs):**
```
Monitor AI API failures
     ↓
If 5 failures in 1 minute
     ↓
Open circuit (stop calling API)
     ↓
Wait 30 seconds
     ↓
Try half-open (1 test request)
     ↓
If success: Close circuit
If failure: Stay open, wait longer
```

**Graceful Degradation:**
- AI unavailable → Return simple structure-based graph
- Database unavailable → Return cached data (stale OK)
- Redis unavailable → Skip caching, direct database queries

**Timeout Handling:**
- All external API calls: 30-second timeout
- All database queries: 10-second timeout
- Background jobs: Job-specific timeouts

---

## 13. Security Considerations

### 13.1 Input Validation

**File Uploads:**
- Whitelist allowed MIME types: `application/pdf`, `text/plain`, `text/markdown`
- Max file size: 10MB (configurable)
- Scan file signatures (magic bytes), not just extensions
- Reject executable files, scripts

**URL Inputs:**
- Validate URL format (regex)
- Block localhost, internal IPs (127.0.0.1, 192.168.x.x, 10.x.x.x)
- Whitelist trusted domains (optional strictness)
- Sanitize before storage

**User-Generated Content:**
- Notes, hypotheses: Sanitize HTML (prevent XSS)
- SQL injection: Prisma ORM prevents (parameterized queries)
- NoSQL injection: Validate all JSONB inputs

### 13.2 API Security

**Rate Limiting:**
- Per-IP limits (see section 4.5)
- Distributed rate limiting (Redis-backed)
- Stricter limits for expensive operations

**CORS:**
- Whitelist known origins
- Credentials: `false` (no cookies for MVP)

**Headers (Helmet.js):**
- Content-Security-Policy
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy

### 13.3 Data Security

**At Rest:**
- Database: Encryption enabled on production
- S3: Server-side encryption (SSE-S3)
- Secrets: Environment variables, never hardcoded

**In Transit:**
- HTTPS only (TLS 1.2+)
- API keys in headers, never query params

**Access Control (Post-MVP):**
- JWT tokens (short-lived, 24h)
- Refresh tokens (long-lived, 7 days)
- Row-level security in database

### 13.4 Secrets Management

**Environment Variables:**
```
DATABASE_URL
REDIS_URL
ANTHROPIC_API_KEY
OPENAI_API_KEY
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
JWT_SECRET (post-MVP)
```

**Storage:**
- Development: `.env.local`
- Production: Cloud provider secrets manager (Railway/Render secrets)
- Never commit secrets to git (`.env` in `.gitignore`)

---

## 14. Deployment & Infrastructure

### 14.1 Environments

| Environment | Purpose | Database | Deployment |
|-------------|---------|----------|------------|
| Development | Local work | Local Postgres | docker-compose |
| Staging | Testing | Managed Postgres | Auto-deploy from `main` |
| Production | Live users | Managed Postgres | Manual promotion |

### 14.2 Containerization (Docker)

**Dockerfile Strategy:**
```
Multi-stage build:
1. Builder stage: Install deps, compile TypeScript
2. Production stage: Copy built files, minimal image
Result: ~200MB final image
```

**docker-compose.yml (Development):**
```yaml
services:
  - api (Node.js app)
  - postgres (PostgreSQL 15)
  - redis (Redis 7)
  - worker (Background jobs)
```

### 14.3 Deployment Platform Options

**Recommended: Railway or Render**

**Why:**
- Easy Node.js deployment
- Managed Postgres + Redis
- Auto-scaling
- Preview environments
- Reasonable pricing

**Alternative: AWS (Future Scale)**
- ECS (container orchestration)
- RDS (managed Postgres)
- ElastiCache (managed Redis)
- S3 (file storage)
- More control, higher complexity

### 14.4 CI/CD Pipeline (GitHub Actions)

**Stages:**

1. **Lint & Type Check** (2 min)
   - ESLint, TypeScript compiler, Prettier

2. **Test** (5 min)
   - Unit tests
   - Integration tests
   - Coverage threshold: 70%

3. **Build** (3 min)
   - TypeScript → JavaScript
   - Create Docker image

4. **Deploy Staging** (auto on `main` push)
   - Push image to registry
   - Run database migrations
   - Deploy to staging
   - Run smoke tests

5. **Deploy Production** (manual trigger)
   - Promote staging image to production
   - Blue-green deployment
   - Health checks
   - Rollback capability

### 14.5 Database Migrations

**Strategy:**
- Forward-only migrations (no rollbacks)
- Run migrations before deploying new code
- Test migrations on staging first
- Keep migrations small, incremental

**Process:**
```bash
# Development
prisma migrate dev --name add_quiz_table

# Production
prisma migrate deploy
```

---

## 15. Performance Targets

### 15.1 Response Time Targets

| Operation | Target | Measurement |
|-----------|--------|-------------|
| Document upload (API response) | < 500ms | Time to return job ID |
| Graph retrieval | < 200ms | Database query + cache |
| Connection explanation | < 3s | AI API call + response |
| Quiz generation | < 5s | Generate 5 questions |
| Small document (10 pages) processing | < 60s | End-to-end including graph |
| Large document (100 pages) processing | < 5 min | Chunked processing |

### 15.2 Throughput Targets

- **Concurrent Users**: 100 simultaneous users (MVP)
- **Requests/Second**: 50 req/s (API layer)
- **Document Processing**: 10 concurrent jobs
- **Graph Generation**: 5 concurrent jobs

### 15.3 Resource Limits

**Server (MVP):**
- CPU: 2 vCPU
- Memory: 4GB RAM
- Storage: 20GB SSD

**Database:**
- PostgreSQL: 1GB RAM, 10GB storage
- Redis: 512MB RAM

**Scaling Plan:**
- Horizontal: Add more API servers
- Vertical: Upgrade database/Redis instances
- Queue: Add more worker processes

---

## 16. Monitoring & Observability

### 16.1 Logging

**Structured Logging (Winston):**
```json
{
  "timestamp": "2025-11-11T10:00:00Z",
  "level": "info",
  "message": "Graph generation completed",
  "requestId": "abc-123",
  "documentId": "doc-456",
  "duration": 45000,
  "nodeCount": 12
}
```

**Log Levels:**
- `ERROR`: Failures requiring attention
- `WARN`: Potential issues (rate limit approaching, slow queries)
- `INFO`: Important events (document uploaded, graph generated)
- `DEBUG`: Detailed execution flow (development only)

### 16.2 Metrics

**Key Metrics to Track:**

**Performance:**
- API response times (p50, p95, p99)
- Database query times
- AI API latency
- Job processing times

**Usage:**
- Requests per minute
- Active jobs in queue
- Documents processed per day
- Graphs generated per day

**Errors:**
- Error rate by endpoint
- AI API failures
- Database connection errors
- Job failures

**Costs:**
- AI API usage (tokens, cost)
- Storage usage (S3)
- Database size

### 16.3 Alerting

**Critical Alerts (PagerDuty/Slack):**
- Error rate > 5%
- Database connection failures
- AI API down > 5 minutes
- Job queue backlog > 50 jobs

**Warning Alerts (Email):**
- Response time p95 > 2s
- Cache hit rate < 50%
- Disk space > 80%

### 16.4 Health Checks

**Endpoints:**
```
GET /health              # Basic liveness check
GET /health/ready        # Readiness check (DB, Redis connected)
GET /health/deep         # Full system check (AI APIs, S3)
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-11T10:00:00Z",
  "checks": {
    "database": "ok",
    "redis": "ok",
    "aiService": "ok"
  }
}
```

---

## Appendix A: Technology Decision Matrix

| Technology | Alternatives Considered | Decision Rationale |
|------------|-------------------------|-------------------|
| Express.js | Fastify, NestJS, Hono | Simplicity for MVP, team familiarity |
| PostgreSQL | MongoDB, MySQL | JSONB for flexibility, ACID compliance |
| Prisma | TypeORM, Drizzle | Best TypeScript integration, auto-generated types |
| BullMQ | Agenda, Bee-Queue | Redis-based, feature-rich, monitoring |
| Claude | GPT-4 only | Better structured output, longer context |
| pdf-parse | pdf.js, Apache Tika | JavaScript-native, good enough for MVP |

---

## Appendix B: Scaling Considerations (Post-MVP)

### Bottlenecks to Address:

1. **AI API Rate Limits**
   - Solution: Implement request queuing, multiple API keys, batch processing

2. **Database Write Contention**
   - Solution: Read replicas, connection pooling, query optimization

3. **Job Queue Depth**
   - Solution: More worker processes, distributed workers across machines

4. **Storage Costs**
   - Solution: S3 lifecycle policies (archive old documents), compression

### Horizontal Scaling Strategy:

```
Load Balancer
      ↓
┌─────┴─────┬─────────┬─────────┐
│  API 1    │  API 2  │  API 3  │ (Stateless servers)
└─────┬─────┴─────────┴─────────┘
      ↓
PostgreSQL Primary + Read Replicas
Redis Cluster
```

---

## Document Status

- **Version**: 1.0
- **Next Review**: After MVP deployment
- **Maintainer**: Backend Team
- **Questions/Feedback**: [Contact Information]

---

**End of Technical Design Document**
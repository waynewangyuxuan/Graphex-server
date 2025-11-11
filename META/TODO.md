# TODO TRACKER
This tracker serves as a log of what we need to do in the next iteration of development. sections are separated by time(date granularity). APPEND ONLY.

---

## 2024-11-11

### Phase 1: Foundation (Completed)
- [x] Set up Express.js API structure with middleware
- [x] Configure Prisma database schema
- [x] Create folder META.md documentation (REGULATION.md compliance)
- [x] Set up TypeScript configuration
- [x] Configure Redis client
- [x] Configure AI clients (Anthropic + OpenAI)

### Phase 2: Database Setup (Next)
- [ ] Run Prisma migrations to create database tables
- [ ] Test database connection with Docker PostgreSQL
- [ ] Run seed script to populate sample data
- [ ] Verify schema with Prisma Studio

### Phase 3: Service Layer Implementation
Following CLAUDE.md "Full-Stack Feature (Coordinated)" workflow:

#### 3.1 Document Processing Service
- [ ] Implement `document-processor.service.ts`
  - File validation and storage
  - Text extraction from PDFs (pdf-parse)
  - Text extraction from markdown
  - URL content scraping (Puppeteer + Cheerio)
  - Content cleaning and normalization

#### 3.2 AI Orchestrator Service
- [ ] Implement `ai-orchestrator.service.ts`
  - Prompt template management (from `lib/ai/prompt-templates.ts`)
  - Claude API integration with retry logic
  - OpenAI fallback cascade
  - Response parsing and validation
  - Caching layer (Redis) for AI responses

#### 3.3 Text Chunking Library
- [ ] Implement `lib/chunking/text-chunker.ts`
  - Split documents by sections/chapters
  - Maintain context overlap (200 tokens)
  - Max chunk size: 10,000 tokens
  - Handle edge cases (very small/large documents)

#### 3.4 Graph Generation Service
- [ ] Implement `graph-generator.service.ts`
  - Chunk-based graph generation
  - Parallel processing for multiple chunks
  - Graph merging algorithm (`lib/graph/graph-merger.ts`)
  - Node deduplication (`lib/graph/node-deduplicator.ts`)
  - Mermaid syntax generation
  - Graph validation (`lib/graph/graph-validator.ts`)

#### 3.5 Background Job System (BullMQ)
- [ ] Set up BullMQ queues
  - `document-processing` queue (priority: high, timeout: 60s)
  - `graph-generation` queue (priority: medium, timeout: 5min)
  - `quiz-generation` queue (priority: low, timeout: 30s)
  - `connection-explanation` queue (priority: high, timeout: 10s)

- [ ] Implement workers
  - `workers/document-processing.worker.ts`
  - `workers/graph-generation.worker.ts`
  - `workers/quiz-generation.worker.ts`

- [ ] Configure job retry strategies
  - Exponential backoff (1s, 2s, 4s, 8s)
  - Max 3 retries
  - Failed job logging

#### 3.6 Quiz Generation Service
- [ ] Implement `quiz.service.ts`
  - Generate questions from graph structure
  - Question types: definitions, relationships, applications
  - Difficulty levels (easy, medium, hard)
  - Answer validation logic

#### 3.7 Connection Explanation Service
- [ ] Implement `connection.service.ts`
  - Fetch node content and relationship
  - Generate AI explanation with source citations
  - Compare with user hypothesis (optional)
  - Cache explanations in Redis

#### 3.8 Note Service
- [ ] Implement `note.service.ts`
  - CRUD operations for notes
  - Attach notes to graphs/nodes/edges
  - Query notes by graph ID

### Phase 4: Controller Implementation
- [ ] Replace placeholder controllers with real implementations
  - `document.controller.ts` - integrate with document-processor service
  - `graph.controller.ts` - integrate with graph-generator service
  - `connection.controller.ts` - integrate with connection service
  - `quiz.controller.ts` - integrate with quiz service
  - `note.controller.ts` - integrate with note service

### Phase 5: Input Validation
- [ ] Create Zod validation schemas
  - `schemas/document.schema.ts` - File upload, URL extraction
  - `schemas/graph.schema.ts` - Graph generation parameters
  - `schemas/connection.schema.ts` - Connection explanation request
  - `schemas/quiz.schema.ts` - Quiz generation and submission
  - `schemas/note.schema.ts` - Note CRUD operations

- [ ] Apply validation middleware to all routes

### Phase 6: Testing (70% Coverage Target)
Following CLAUDE.md workflow, delegate to comprehensive-test-writer agent:

#### 6.1 Unit Tests
- [ ] Service layer tests (document-processor, graph-generator, ai-orchestrator)
- [ ] Utility function tests (validators, response formatters)
- [ ] Library tests (text-chunker, graph-merger, node-deduplicator)

#### 6.2 Integration Tests
- [ ] API endpoint tests (all routes)
- [ ] Database integration tests (Prisma queries)
- [ ] Redis integration tests (caching, job queue)
- [ ] AI service mocking tests

#### 6.3 E2E Tests
- [ ] Complete document upload → graph generation flow
- [ ] Connection explanation flow
- [ ] Quiz generation and submission flow
- [ ] Note CRUD operations

### Phase 7: Infrastructure & Deployment
Following CLAUDE.md workflow, delegate to infra-deploy-specialist agent:

- [ ] Create Dockerfile (multi-stage build)
- [ ] Create docker-compose.yml (app + postgres + redis)
- [ ] Set up CI/CD pipeline (GitHub Actions)
  - Lint & type check
  - Run tests
  - Build Docker image
  - Deploy to staging (auto on main push)
  - Deploy to production (manual trigger)

- [ ] Configure deployment platform (Railway or Render)
  - Environment variables setup
  - Database provisioning
  - Redis provisioning
  - Health check endpoints

- [ ] Set up monitoring
  - Winston logging to file/console
  - Error tracking (optional: Sentry)
  - Performance metrics (optional: Datadog)

### Phase 8: MVP Features Completion (from MVP.md)

#### Must Have Features (Week 1)
- [ ] **Feature 1: Basic Graph Generation & Display** (Days 1-4)
  - Upload document (PDF, text, markdown)
  - AI generates Mermaid graph (7-15 nodes)
  - Directed edges with simple relationship labels
  - Graph visualization (frontend)

- [ ] **Feature 2: Integrated Reading Interface** (Days 5-6)
  - Side panel shows source document
  - Click node → jump to relevant section
  - Highlight corresponding passage

- [ ] **Feature 3: Node Notes** (Day 7)
  - Click node → open note modal
  - Text field for user notes
  - Save notes (backend API)
  - Show indicator when node has notes

#### Should Have Features (Week 2)
- [ ] **Feature 4: Pre-Explanation Retrieval** (Days 8-9)
  - Click edge between nodes
  - User types hypothesis (min 15 words)
  - Show AI explanation + source text

- [ ] **Feature 5: Basic Comprehension Check** (Days 10-11)
  - Trigger quiz after 5+ nodes engaged
  - 3-5 multiple choice questions
  - Show score and correct answers

### Phase 9: Documentation Updates
- [ ] Update META/PROGRESS.md with implementation details
- [ ] Update META/Core/TECHNICAL.md with any architecture changes
- [ ] Create service-level META.md files for complex features
  - `src/services/META.md`
  - `src/lib/META.md`
  - `src/workers/META.md`

### Phase 10: Performance Optimization
- [ ] Implement caching strategy (Redis)
  - AI responses (1-hour TTL)
  - Graph data (10-minute TTL)
  - Document content (24-hour TTL)

- [ ] Database query optimization
  - Add missing indexes
  - Optimize N+1 queries
  - Connection pooling tuning

- [ ] AI cost optimization
  - Aggressive caching (60% savings)
  - Model selection (Sonnet 4 vs Haiku)
  - Chunking strategy optimization

### Future Enhancements (Post-MVP)
- [ ] User authentication (JWT)
- [ ] Multi-user support (user_id in all tables)
- [ ] Spaced repetition system
- [ ] Multi-document synthesis
- [ ] Graph customization (drag-drop nodes)
- [ ] Export features (markdown, PDF)
- [ ] Collaborative features

---

## Current Priority Order (Following CLAUDE.md)

**Next steps** (in order):
1. Run Prisma migrations and verify database setup
2. Implement service layer (parallel: document-processor + ai-orchestrator)
3. Implement BullMQ job system
4. Implement graph generation pipeline
5. Replace controller placeholders
6. Add validation schemas
7. Write comprehensive tests
8. Set up Docker and deployment

**Specialized agents to use** (from CLAUDE.md):
- ✅ prisma-database-architect (completed)
- ✅ express-api-builder (completed)
- Next: bullmq-job-processor
- Next: ai-integration-specialist
- Next: document-extraction-processor
- Later: comprehensive-test-writer
- Later: infra-deploy-specialist
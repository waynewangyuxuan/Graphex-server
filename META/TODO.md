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

**Completed** (as of 2024-11-12):
1. ✅ Run Prisma migrations and verify database setup
2. ✅ Implement service layer - Phase 3.1 & 3.2:
   - ✅ Document Processor Service v2 (with image extraction)
   - ✅ AI Output Validator (CRITICAL)
   - ✅ Cost Tracker Service (CRITICAL)
   - ✅ Prompt Manager Service (centralized templates, versioning, A/B testing)
   - ✅ AI Orchestrator Service v2 (validation loops, retry, budget control)
3. ✅ Write comprehensive tests (187 passing, 95 skipped integration)
4. ✅ Fix test infrastructure (100% unit test pass rate)

**Next steps** (in order):
1. Implement BullMQ job system for async processing
2. Implement graph generation pipeline (text chunking, node deduplication)
3. Replace controller placeholders with real implementations
4. Add Zod validation schemas for API routes
5. Set up Docker and deployment (Railway/Render)
6. Enable integration tests (test database setup)

**Specialized agents to use** (from CLAUDE.md):
- ✅ prisma-database-architect (completed - database schema, migrations)
- ✅ express-api-builder (completed - API foundation)
- ✅ document-extraction-processor (completed - Phase 3.1)
- ✅ ai-integration-specialist (completed - Phase 3.2)
- ✅ comprehensive-test-writer (completed - test infrastructure)
- Next: bullmq-job-processor (async job system)
- Later: infra-deploy-specialist (Docker, CI/CD)
---

## 2024-11-12

### Phase 3.3 Text Chunking - COMPLETED
- [x] Implement `lib/chunking/text-chunker.ts` (text-chunker.ts:62-104)
  - Smart boundary detection with priority (chapters > sections > paragraphs > sentences)
  - Greedy chunking algorithm with look-ahead (O(n) complexity)
  - Overlap injection for context continuity (1k chars between chunks)
  - Quality scoring system (0-100) with warnings
  - Handle edge cases (tiny/huge documents, hard splits)
- [x] Create chunking types (`src/types/chunking.types.ts`)
  - Updated parameters: maxChunkSize: 30k chars (~7.5k tokens), overlapSize: 1k chars
  - TextChunk with metadata (overlap tracking, quality indicators, position)
  - ChunkingResult with statistics and document metadata
- [x] Fix TypeScript errors (2 defensive programming fixes)

### Phase 3.3 Remaining Components - IN PROGRESS

Following critical review findings (8 issues identified), implement with CORRECTED merge order:

#### Priority 1: Node Deduplicator (Enhanced Algorithm)
- [ ] Implement multi-phase deduplication (~2 hours)
  - Phase 1: Exact match (lowercase, trim)
  - Phase 2: Acronym detection ("ML" = "Machine Learning")
  - Phase 3: Fuzzy matching with word overlap (Levenshtein + Jaccard)
  - Use Union-Find for node merging
  - Preserve best description when merging

#### Priority 2: Graph Validator (Auto-Fix Capability)
- [ ] Implement validation with auto-fix (~1 hour)
  - Check: Valid Mermaid syntax
  - Check: All edges reference valid nodes
  - Check: No duplicate edges
  - Check: No isolated nodes (except intentional)
  - Auto-fix: Remove orphaned edges, deduplicate
  - Return validation report with warnings

#### Priority 3: Graph Generator Service (CORRECT Merge Order)
- [ ] Implement graph generation pipeline (~3 hours)
  - **CRITICAL FIX**: Correct merge order
    1. Dedupe nodes FIRST (node-deduplicator)
    2. Remap edges to merged node IDs
    3. Dedupe edges (check source+target+relationship)
    4. Validate result (graph-validator with auto-fix)
  - Cost estimation BEFORE AI processing
  - Rate limiting: Batch process 2 chunks at a time
  - Structure-based fallback when AI fails
  - Generate Mermaid code with proper syntax

#### Priority 4: BullMQ Job System
- [ ] Set up graph-generation queue (~2 hours)
  - Priority: medium, timeout: 5min
  - Worker: `workers/graph-generation.worker.ts`
  - Retry strategy: exponential backoff (1s, 2s, 4s, 8s), max 3 attempts
  - Progress tracking: chunk-by-chunk updates
  - Failed job logging with error details

#### Priority 5: Comprehensive Testing
- [ ] Write tests for Phase 3.3 components
  - Text Chunker: unit tests (boundary cases, overlap, quality scoring)
  - Node Deduplicator: unit tests (exact, acronym, fuzzy matching)
  - Graph Validator: unit tests (syntax, orphaned edges, auto-fix)
  - Graph Generator: integration tests (end-to-end chunking → graph)
  - BullMQ: integration tests (job processing, retry logic)

### Critical Issues from Review (Incorporated Above)
1. ✅ Merge order bug → CORRECTED in Priority 3
2. ✅ Missing cost estimation → Added in Priority 3
3. ✅ Rate limiting → Batch processing in Priority 3
4. ✅ Edge deduplication → Part of correct merge order
5. ✅ Fallback mechanism → Structure-based fallback in Priority 3
6. ✅ Basic node deduplication → Enhanced algorithm in Priority 1
7. ✅ No validation retry → Auto-fix capability in Priority 2
8. ✅ Chunking params → Adjusted to 30k/1k in completed Text Chunking


---

## 2024-11-14

### CRITICAL Bug Fix Session - COMPLETED

- [x] **Diagnosed catastrophic over-merge bug** (22→2 nodes)
  - Root cause: Prompt-code interface mismatch (id/fromNodeId fields)
  - Detection: CRITICAL DEBUG logging revealed `id: undefined` pattern
  
- [x] **Fixed prompt template structure**
  - Changed `"key"` → `"id"`, `"from"` → `"fromNodeId"`, `"to"` → `"toNodeId"`
  - Wrapped fields in proper `metadata` structure
  - Added "Return ONLY JSON" instruction to prevent parse errors
  
- [x] **Integrated semantic deduplication**
  - Replaced naive string matching with 4-phase semantic algorithm
  - Using OpenAI embeddings for similarity detection
  - Prevents false positives with dual thresholds
  
- [x] **Added relationship type taxonomy**
  - 21 specific relationship types across 5 categories
  - Hierarchical, Functional, Technical, Process, Comparative
  - Prohibits vague relationships (relates to, involves)
  
- [x] **Created comprehensive documentation**
  - Session summary with root cause analysis
  - Quality improvement analysis
  - Few-shot examples proposal (domain-agnostic)
  - 7 documentation files totaling ~4,500 lines

### Test Results After Fixes

- **Deduplication**: 22 → 15 nodes (appropriate 32% vs catastrophic 91%)
- **Quality score**: 90/100 (good structure with minor issues)
- **Relationship quality**: Expected improvement with taxonomy (pending full test)

### Immediate Next Steps

- [ ] **Test improved prompt on diverse documents**
  - Try biology paper, economics paper, physics paper
  - Verify domain-agnostic capability
  - Confirm relationship taxonomy improves specificity
  
- [ ] **Validate quality improvements**
  - Expected quality score: 95-98/100
  - Verify no domain examples in nodes
  - Verify specific relationships (not vague)
  
- [ ] **Consider validation layer**
  - Add runtime checks that prompt output matches TypeScript interface
  - Prevent future prompt-code contract mismatches
  - Could use Zod schema validation on AI responses

### Short-term Improvements (Optional)

- [ ] **Implement LLM validation for semantic deduplication**
  - Phase 4.4 of semantic algorithm
  - For borderline cases (0.65-0.95 similarity)
  - Batch validation (10 pairs per call)
  - Cost: ~$0.002 per validation batch
  
- [ ] **Add few-shot examples if needed**
  - Use FEW_SHOT_EXAMPLES_PROPOSAL.md as reference
  - Domain-diverse examples (CS, Biology, Economics, Physics, Literature)
  - Only if quality issues persist with current taxonomy
  
- [ ] **Create ground truth labels**
  - Label 5-10 test documents manually
  - Measure precision/recall of concept extraction
  - Use for continuous quality monitoring

### Phase 3.4 - BullMQ Job System (Ready to Begin)

Following previous TODO plan with graph generation pipeline now fully operational:

- [ ] Set up graph-generation queue
  - Priority: medium, timeout: 5min
  - Worker: `workers/graph-generation.worker.ts`
  - Retry strategy: exponential backoff (1s, 2s, 4s, 8s), max 3 attempts
  
- [ ] Implement progress tracking
  - Chunk-by-chunk updates (0% → 100%)
  - Real-time status for frontend
  - Failed job logging with error details
  
- [ ] Integrate with Graph Generator Service
  - Use semantic deduplication
  - Use relationship taxonomy
  - Proper error handling and recovery

### Lessons Learned (For Future Reference)

**1. Prompt-Code Contracts**:
- Silent failures when mismatched
- Add validation layer (Zod schemas on AI output)
- Test with real examples early

**2. User Feedback**:
- Iterate based on actual usage, not assumptions
- Start minimal, add complexity on demand
- Quality is subjective - align with user expectations

**3. Debug Logging**:
- CRITICAL DEBUG logs save hours of debugging
- Log input/output samples, especially IDs
- Invest in comprehensive logging upfront

**4. Simplicity**:
- User rejected over-engineering (wanted clean version)
- Add features incrementally based on need
- Avoid premature optimization

---

**Current Status**: ✅ All critical bugs fixed, system operational

**Quality**: 90/100 (expected 95-98/100 with taxonomy validation)

**Ready for**: Production testing with diverse documents, BullMQ integration


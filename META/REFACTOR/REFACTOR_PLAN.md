# Architecture Refactoring Plan

**Created**: 2024-11-25
**Updated**: 2024-11-25 (added strategic alternatives from follow-up review)
**Status**: Planned
**Triggered by**: External code review identifying structural inconsistencies

---

## Executive Summary

The codebase has "paper architecture" - documented patterns that don't match implementation reality. Three core issues identified:

| Issue | Severity | Blocking? | Effort |
|-------|----------|-----------|--------|
| Lib → Services coupling | High | Yes (algorithm reuse) | 2-3 hours |
| Unused queue scaffolding | Low | No | 1-2 hours |
| Controllers own persistence | Medium | No | 4-6 hours |

**Recommended approach**: Fix during feature work, not as dedicated refactor sprint.

---

## Strategic Decision: Simplify vs. Complete

Before addressing individual issues, make a fundamental architectural choice:

### Option A: Complete the Layering (Proper Architecture)

Keep the current structure but make it honest:
- Move all Prisma/database logic into services
- Controllers delegate to `graphService`, `documentService`, etc.
- Services become the single source of business logic + data access
- `lib/` stays pure (no framework dependencies)

**Pros**: Clean separation, testable, scalable
**Cons**: More indirection, ~8-10 hours of refactoring
**When**: Planning to scale team or complexity significantly

### Option B: Collapse Unused Layers (MVP Pragmatism)

Fold the service layer since it's not providing value:
- Delete `services/service-container.ts`
- Controllers call helper modules directly (`graphGenerator.generateGraph()`)
- Rename "services" that are actually orchestrators (keep `ai-orchestrator`, `graph-generator`)
- Remove pretense of layering that doesn't exist

**Pros**: Simpler, matches reality, faster to navigate
**Cons**: Less structured for future growth
**When**: MVP with small team, limited complexity

### Option C: Module-Centric Layout (Domain Grouping)

Replace technical layers with domain modules:

```
src/modules/
├── graph/
│   ├── graph.controller.ts
│   ├── graph.service.ts      # Orchestration + DB
│   ├── graph.routes.ts
│   └── graph.types.ts
├── document/
│   ├── document.controller.ts
│   ├── document.processor.ts
│   └── document.routes.ts
└── quiz/
    └── ...

src/shared/
├── logger.ts
├── response.util.ts
├── prisma.ts
└── ai-client.ts
```

**Pros**: Co-located related logic, easier to find things, reduces META file duplication
**Cons**: Major restructure, breaks existing imports
**When**: Clear domain boundaries, team prefers vertical slices

### Recommendation

For current MVP stage: **Option B** (collapse) or keep current structure with targeted fixes.

Option C (modules) is appealing but a significant rewrite - defer until post-MVP if team grows.

---

## Issue 1: Lib Layer Dependency Inversion

### Problem

`src/lib/` is documented as framework-agnostic ([src/META.md:74](../src/META.md)):
> "No direct HTTP or framework dependencies"

But `semantic-deduplicator.ts` directly imports from services:

```typescript
// src/lib/graph/semantic-deduplicator.ts:20
import { AIOrchestrator } from '../../services/ai-orchestrator.service';
```

This forces every consumer of the deduplicator to pull in:
- AIOrchestrator → Redis client → AI clients → entire service container

### Impact

- Cannot unit test deduplicator in isolation
- Cannot reuse algorithm in CLI tools, scripts, or other contexts
- Circular dependency risk as codebase grows

### Solution Options

#### Option A: Inject Interface (Recommended)

Create slim interface that lib depends on, services implement:

```typescript
// src/lib/graph/types.ts
export interface EmbeddingProvider {
  generateEmbeddings(texts: string[]): Promise<number[][]>;
}

export interface LLMProvider {
  validateMerge(pairs: NodePair[]): Promise<MergeDecision[]>;
}

// src/lib/graph/semantic-deduplicator.ts
export class SemanticNodeDeduplicator {
  constructor(
    private readonly logger: Logger,
    private readonly embeddingProvider: EmbeddingProvider,  // Interface, not concrete
    private readonly llmProvider?: LLMProvider,
    config?: Partial<SemanticDeduplicationConfig>,
  ) {}
}

// src/services/service-container.ts (wire up)
const deduplicator = new SemanticNodeDeduplicator(
  logger,
  new AIOrchestrator(...),  // Implements EmbeddingProvider
  new AIOrchestrator(...),  // Implements LLMProvider
);
```

**Pros**: Clean separation, testable, reusable
**Cons**: More boilerplate

#### Option B: Move to Services

Move `semantic-deduplicator.ts` from `lib/` to `services/`:

```
src/services/semantic-deduplicator.service.ts
```

Update `lib/graph/` to only contain pure algorithms (no AI dependencies).

**Pros**: Simple, matches current reality
**Cons**: Gives up on reusable lib layer

#### Option C: Adapter Pattern

Keep deduplicator in lib, create adapter in services:

```typescript
// src/services/adapters/ai-embedding-adapter.ts
import { AIOrchestrator } from '../ai-orchestrator.service';
import { EmbeddingProvider } from '../../lib/graph/types';

export class AIEmbeddingAdapter implements EmbeddingProvider {
  constructor(private orchestrator: AIOrchestrator) {}

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    return this.orchestrator.generateEmbeddings(texts);
  }
}
```

**Pros**: Cleanest separation
**Cons**: Most boilerplate

### Recommended: Option A

Inject interfaces. Minimal change, maximum benefit.

### Files to Modify

1. `src/lib/graph/types.ts` - Add EmbeddingProvider, LLMProvider interfaces
2. `src/lib/graph/semantic-deduplicator.ts` - Accept interfaces instead of concrete
3. `src/services/service-container.ts` - Wire up concrete implementations
4. `src/services/ai-orchestrator.service.ts` - Implement interfaces (likely already compatible)

### Estimated Effort: 2-3 hours

---

## Issue 2: Unused Queue/Worker Scaffolding

### Problem

The repository advertises async queue architecture:
- `src/queues/QUEUE_INTEGRATION_GUIDE.md` describes BullMQ pipeline
- `src/workers/` directory exists with worker stubs
- `src/services/queue.service.ts` exists

But runtime is synchronous:
- `generateGraph` saves results immediately, returns final counts
- `getJobStatus` returns hardcoded `{ status: 'completed', progress: 100 }`
- QueueService never imported outside its own test

### Impact

- Misleading directory structure
- Documentation describes non-existent functionality
- New developers confused about actual architecture

### Solution Options

#### Option A: Complete BullMQ Integration (Recommended if async needed)

Wire up the existing scaffolding:

```typescript
// src/controllers/graph.controller.ts
export const generateGraph = async (req, res) => {
  // Enqueue job instead of processing synchronously
  const job = await queueService.addJob('graph-generation', {
    documentId,
    documentText,
    options,
  });

  return sendSuccess(res, {
    jobId: job.id,
    status: 'queued',
    estimatedTime: calculateEstimate(documentText.length),
  }, 202);
};

export const getJobStatus = async (req, res) => {
  const job = await queueService.getJob(req.params.id);
  return sendSuccess(res, {
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    result: job.result,
  });
};
```

**Effort**: 4-6 hours
**Pros**: Scalable, handles long documents, better UX
**Cons**: More complexity, requires Redis

#### Option B: Remove Scaffolding (Recommended if sync is fine)

Delete unused code:

```bash
rm -rf src/queues/
rm -rf src/workers/
rm src/services/queue.service.ts
rm src/services/__tests__/queue.service.test.ts
```

Update documentation to reflect synchronous architecture.

**Effort**: 1 hour
**Cons**: Loses future-proofing

#### Option C: Document Current State (Minimal)

Add clear documentation that queue system is planned but not implemented:

```typescript
// src/controllers/graph.controller.ts:320
/**
 * Get job status
 *
 * CURRENT: MVP uses synchronous processing, always returns 'completed'
 * FUTURE: Will integrate with BullMQ for real job tracking
 *
 * @see META/TODO.md - Phase 3.4 BullMQ Job System
 */
```

**Effort**: 30 minutes
**Cons**: Doesn't fix the issue, just documents it

### Recommended: Decide Based on Scale

- **< 10 concurrent users**: Option B (remove scaffolding, keep simple)
- **> 10 concurrent users**: Option A (complete integration)

### Files Affected

**If removing**:
- Delete: `src/queues/`, `src/workers/`, `src/services/queue.service.ts`
- Update: `src/META.md`, `QUEUE_INTEGRATION_GUIDE.md`

**If completing**:
- Modify: `src/controllers/graph.controller.ts`
- Implement: `src/workers/graph-generation.worker.ts`
- Wire: `src/services/service-container.ts`

---

## Issue 3: Controllers Own Persistence

### Problem

Documented architecture ([src/META.md:52](../src/META.md), [src/controllers/META.md:9](../src/controllers/META.md)):
> Routes → Controllers → Services → Database

Actual implementation in `graph.controller.ts`:
- Line 57: `prisma.document.findUnique()` - direct DB call
- Line 95: `prisma.document.create()` - direct DB call
- Line 137: `saveGraphToDatabase()` - 70-line helper doing transactions
- Line 232: `prisma.graph.findUnique()` with complex includes

Controllers are doing repository work.

### Impact

- Services can't be reused (they don't exist for these operations)
- Controllers are fat (400+ lines)
- Testing requires full database setup
- Violates Single Responsibility Principle

### Solution

Extract database operations to services:

```typescript
// src/services/document.service.ts
export class DocumentService {
  async findById(id: string): Promise<Document | null> {
    return prisma.document.findUnique({ where: { id } });
  }

  async createFromText(title: string, content: string): Promise<Document> {
    return prisma.document.create({
      data: { title, contentText: content, sourceType: 'text', status: 'ready' }
    });
  }
}

// src/services/graph.service.ts
export class GraphService {
  async findByIdWithRelations(id: string): Promise<GraphWithRelations | null> {
    return prisma.graph.findUnique({
      where: { id },
      include: { nodes: true, edges: true, document: true }
    });
  }

  async saveGraph(result: GraphResult, documentId: string): Promise<Graph> {
    // Move saveGraphToDatabase() logic here
    return prisma.$transaction(async (tx) => { ... });
  }
}

// src/controllers/graph.controller.ts (after refactor)
export const generateGraph = async (req, res, next) => {
  const documentService = services.getDocumentService();
  const graphService = services.getGraphService();

  // Delegate to services
  const document = documentId
    ? await documentService.findById(documentId)
    : await documentService.createFromText(title, text);

  const result = await graphGenerator.generateGraph({ ... });
  const savedGraph = await graphService.saveGraph(result, document.id);

  sendSuccess(res, { graphId: savedGraph.id, ... });
};
```

### Files to Create/Modify

**Create**:
- `src/services/document.service.ts` - Document CRUD operations
- `src/services/graph.service.ts` - Graph CRUD operations

**Modify**:
- `src/controllers/graph.controller.ts` - Remove Prisma imports, use services
- `src/controllers/document.controller.ts` - Same treatment
- `src/services/service-container.ts` - Register new services

**Delete** (move to services):
- `saveGraphToDatabase()` helper function from controller

### Estimated Effort: 4-6 hours

---

## Implementation Strategy

### Approach: Incremental During Feature Work

Don't do a dedicated "refactor sprint". Instead:

1. **When touching `lib/graph/`**: Fix dependency inversion (Issue 1)
2. **When implementing async features**: Decide on queues (Issue 2)
3. **When adding new endpoints**: Extract services (Issue 3)

### Phase 1: Lib Decoupling (Next lib/ change)

```
Trigger: Any modification to src/lib/graph/
Action: Implement Option A (inject interfaces)
Effort: 2-3 hours
Test: Unit test deduplicator without service container
```

### Phase 2: Queue Decision (Before production)

```
Trigger: Planning for production deployment
Action: Choose Option A or B based on scale requirements
Effort: 1-6 hours depending on choice
Test: If completing, verify job tracking works end-to-end
```

### Phase 3: Service Extraction (During next feature)

```
Trigger: Adding new graph or document endpoints
Action: Extract relevant Prisma calls to services
Effort: Incremental (1-2 hours per controller touched)
Test: Verify existing integration tests still pass
```

---

## Success Criteria

### Issue 1 (Lib Decoupling)
- [ ] `SemanticNodeDeduplicator` accepts interface, not `AIOrchestrator`
- [ ] Can instantiate deduplicator without Redis/AI clients
- [ ] Unit tests run without service container

### Issue 2 (Queue Decision)
- [ ] Either: BullMQ fully wired with real job tracking
- [ ] Or: Queue scaffolding removed, docs updated

### Issue 3 (Service Extraction)
- [ ] Controllers import no Prisma directly
- [ ] `DocumentService` and `GraphService` exist
- [ ] Controller files < 200 lines each

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing functionality | Medium | High | Comprehensive test coverage before refactor |
| Scope creep during refactor | High | Medium | Strict incremental approach, no big bang |
| Test suite gaps | Medium | High | Run full test suite after each change |

---

## Additional Consideration: Lightweight Dependency Injection

### Current State

`ServiceContainer` instantiates everything lazily via a singleton registry:

```typescript
// src/services/service-container.ts
class ServiceContainer {
  private graphGenerator?: GraphGeneratorService;

  getGraphGenerator(): GraphGeneratorService {
    if (!this.graphGenerator) {
      this.graphGenerator = new GraphGeneratorService(...);
    }
    return this.graphGenerator;
  }
}

export const services = new ServiceContainer();
```

### Problem

- Forces cross-layer coupling (everything imports `services`)
- Hides dependencies (can't tell what a module needs from its imports)
- Overkill for single-process application
- Makes testing harder (must mock entire container)

### Alternative: Factory Functions

Replace container with explicit factory functions:

```typescript
// src/services/graph-generator.factory.ts
import { TextChunker } from '../lib/chunking/text-chunker';
import { AIOrchestrator } from './ai-orchestrator.service';

export function createGraphGenerator(
  chunker: TextChunker,
  aiOrchestrator: AIOrchestrator,
): GraphGeneratorService {
  return new GraphGeneratorService(chunker, aiOrchestrator);
}

// src/app.ts (wire at startup)
const chunker = new TextChunker();
const aiOrchestrator = new AIOrchestrator(anthropicClient, openaiClient);
const graphGenerator = createGraphGenerator(chunker, aiOrchestrator);

// Pass to controllers via closure or request context
```

### Benefits

- Dependencies are explicit in function signatures
- Easy to test (just pass mocks directly)
- No hidden global state
- Removes `service-container.ts` entirely

### Effort: 2-3 hours

This can be combined with Option B (collapse layers) for maximum simplification.

---

## Summary: Recommended Path Forward

Given MVP stage and single-developer context:

### Immediate (Before Next Feature)

1. **Define interfaces in `types/`** for AI/embedding providers
2. **Update `SemanticNodeDeduplicator`** to accept interfaces
3. Keep everything else as-is

### Before Production

1. **Decide on async**: Wire BullMQ or delete scaffolding
2. **Clean up docs**: Update META files to match actual architecture

### Post-MVP (If Team Grows)

1. Consider module-centric layout
2. Extract proper service layer
3. Replace ServiceContainer with factories

### What NOT to Do

- Don't do a "big bang" refactor
- Don't add more abstraction layers
- Don't refactor without test coverage
- Don't let perfect be enemy of shipped

---

## Related Documentation

- [TODO.md](../TODO.md) - Task tracking
- [src/META.md](../../src/META.md) - Source structure documentation
- [TECHNICAL.md](../Core/TECHNICAL.md) - Architecture decisions
- [REGULATION.md](../Core/REGULATION.md) - Development principles

---

## Review Acknowledgments

This plan incorporates feedback from two external code reviews:

**Review 1** - Identified core issues:
- Controllers owning persistence
- Lib → Services coupling
- Unused queue scaffolding

**Review 2** - Provided strategic alternatives:
- Option to collapse unused service layer (faster for MVP)
- Module-centric layout suggestion
- Lightweight DI via factory functions
- Emphasis on "keeping lib/ honest"

---

**Next Action**: Make strategic decision (complete layering vs. collapse), then proceed with targeted fixes during feature work.

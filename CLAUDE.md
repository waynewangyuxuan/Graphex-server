# Claude Code Agent Workflow

**Core Rule**: Always consult [META/](META/) first, follow [REGULATION.md](META/Core/REGULATION.md) principles, delegate to specialized agents early, document progress after milestones.

---

## META Directory (Single Source of Truth)

```
META/
├── Core/
│   ├── META.md          # Project overview & navigation
│   ├── PRODUCT.md       # Feature specs & research
│   ├── TECHNICAL.md     # Architecture & tech stack
│   ├── REGULATION.md    # Development principles
│   ├── MVP.md           # Sprint priorities
│   └── UIUX.md          # Design system
├── PROGRESS.md          # Append-only accomplishment log
└── TODO.md              # Append-only task queue
```

**Read before**: Any new task ([META.md](META/Core/META.md)), features ([MVP.md](META/Core/MVP.md)), backend work ([TECHNICAL.md](META/Core/TECHNICAL.md)), design ([UIUX.md](META/Core/UIUX.md)), coding ([REGULATION.md](META/Core/REGULATION.md))

**Write after**: Milestones ([PROGRESS.md](META/PROGRESS.md)), discovering tasks ([TODO.md](META/TODO.md)), architecture decisions ([TECHNICAL.md](META/Core/TECHNICAL.md))

---

## Subagent Quick Reference

| Agent | Purpose | Use For |
|-------|---------|---------|
| **express-api-builder** | REST APIs | Routes, controllers, middleware, Zod validation, `/api/v1/` endpoints |
| **prisma-database-architect** | Database | Schema, migrations, queries, JSONB fields, indexes, seeding |
| **bullmq-job-processor** | Background jobs | Queues, workers, retry logic, progress tracking |
| **ai-integration-specialist** | AI services | Claude/GPT API, prompts, caching, cost optimization |
| **document-extraction-processor** | Document processing | PDF/text extraction, chunking, content parsing |
| **comprehensive-test-writer** | Testing | Unit/integration/E2E tests, mocks, 70% coverage goal |
| **infra-deploy-specialist** | Infrastructure | Docker, CI/CD, Railway/Render, health checks |
| **Explore** | Code investigation | Find files, understand structure, analyze codebase |

---

## Standard Workflows

### Feature Implementation (Sequential)
```
1. Read META/Core/TECHNICAL.md + MVP.md + REGULATION.md
2. prisma-database-architect → Schema + migration
3. express-api-builder → API endpoints + validation
4. bullmq-job-processor → Async processing [if needed]
5. ai-integration-specialist → AI calls + prompts [if needed]
6. comprehensive-test-writer → Tests
7. Append to META/PROGRESS.md
```

### Bug Investigation (Parallel)
```
Launch concurrently:
├─ Explore → Find relevant code
├─ prisma-database-architect → Check DB schema
└─ express-api-builder → Review API logic
Then fix + add regression tests
```

### Full-Stack Feature (Coordinated)
```
1. Read META/Core/PRODUCT.md + TECHNICAL.md + REGULATION.md + MVP.md
2. Parallel: prisma-database-architect + bullmq-job-processor
3. Sequential: ai-integration-specialist → express-api-builder → document-extraction-processor
4. comprehensive-test-writer → Complete test suite
5. infra-deploy-specialist → Deployment updates [if needed]
6. Update META/PROGRESS.md + META/Core/TECHNICAL.md
```

---

## Decision Tree

```
Database operation? → prisma-database-architect
API endpoint? → express-api-builder
Async processing? → bullmq-job-processor
AI calls? → ai-integration-specialist
Document processing? → document-extraction-processor
Testing? → comprehensive-test-writer
Infrastructure? → infra-deploy-specialist
Code exploration? → Explore
```

---

## Best Practices

### Context Loading
- Before implementing: Read [TECHNICAL.md](META/Core/TECHNICAL.md) + [REGULATION.md](META/Core/REGULATION.md) + [MVP.md](META/Core/MVP.md)
- Before UI work: Read [UIUX.md](META/Core/UIUX.md)
- Daily planning: Read [TODO.md](META/TODO.md) + [PROGRESS.md](META/PROGRESS.md)

### Agent Invocation
**Always include context**: "Follow architecture in META/Core/TECHNICAL.md and principles in META/Core/REGULATION.md, use Claude Sonnet 4, implement /api/v1/ pattern"

### Documentation Format
**PROGRESS.md** (after milestones):
```markdown
## YYYY-MM-DD
### Implemented [Feature]
- Database: [tables/fields] via migration `YYYYMMDD_name`
- API: [endpoints created]
- Jobs: [queue setup with retry logic]
- Tests: [X% coverage]
- Notes: [decisions/trade-offs]
```

**TODO.md** (when discovering tasks):
```markdown
## YYYY-MM-DD
### Discovered During [Work]
- [ ] Task description
- [ ] Another task
```

### Parallel Execution
Launch independent agents in single message when possible:
```
Concurrent: prisma-database-architect + express-api-builder + ai-integration-specialist
Then integrate results
```

---

## Common Daily Workflows

**Start of day**: Read [TODO.md](META/TODO.md) → [PROGRESS.md](META/PROGRESS.md) → [MVP.md](META/Core/MVP.md) → Select task → Choose agent(s)

**Bug fix**: Explore → Specialized agent analysis → Fix → comprehensive-test-writer for regression tests

**New feature**: Read [PRODUCT.md](META/Core/PRODUCT.md) + [TECHNICAL.md](META/Core/TECHNICAL.md) + [REGULATION.md](META/Core/REGULATION.md) → Follow Full-Stack workflow → Document in [PROGRESS.md](META/PROGRESS.md)

**Architecture change**: Read [TECHNICAL.md](META/Core/TECHNICAL.md) → Discuss → Update [TECHNICAL.md](META/Core/TECHNICAL.md) → Implement → Update [PROGRESS.md](META/PROGRESS.md)

---

## Example: Document Upload Feature

```
# Read context
META/Core/MVP.md → Confirms MUST HAVE
META/Core/TECHNICAL.md → Architecture patterns
META/Core/REGULATION.md → Coding principles

# Execute (sequential, following REGULATION.md principles)
1. prisma-database-architect: documents table + metadata JSONB + migration
2. express-api-builder: POST /api/v1/documents + Multer + validation
3. document-extraction-processor: PDF extraction + chunking
4. bullmq-job-processor: Processing job + worker + retry
5. comprehensive-test-writer: Test upload flow

# Document
META/PROGRESS.md:
"## 2024-11-11
### Implemented Document Upload
- Database: documents table (user_id, title, content, metadata JSONB)
- API: POST /api/v1/documents (multipart/form-data)
- Processing: Async PDF extraction queue
- Tests: 85% coverage"
```

---

**Version**: 1.0 | **Updated**: 2024-11-11 | **Remember**: META is truth → Read first, document after

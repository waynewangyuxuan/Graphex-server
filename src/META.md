# Source Code Directory (`src/`)

Main application source code for the Graphex Knowledge Graph Learning Platform backend.

---

## Directory Structure

```
src/
├── app.ts                    # Express application setup
├── server.ts                 # Server entry point with graceful shutdown
├── config/                   # Application configuration
├── controllers/              # HTTP request handlers
├── middleware/               # Express middleware
├── routes/                   # API route definitions
├── services/                 # Business logic (to be implemented)
├── lib/                      # Core algorithms (to be implemented)
├── workers/                  # Background job handlers (to be implemented)
├── utils/                    # Helper functions
└── types/                    # TypeScript type definitions
```

---

## Key Files

### `app.ts`
Express application configuration with middleware stack:
- CORS (cross-origin resource sharing)
- Helmet.js (security headers)
- Rate limiting (Redis-backed)
- Request logging (Winston)
- Body parsing (JSON, URL-encoded)
- Error handling
- API route mounting

**Why separate from server.ts**: Allows testing the Express app without starting the HTTP server.

### `server.ts`
HTTP server startup and lifecycle management:
- Starts Express app on configured port
- Implements graceful shutdown (SIGTERM, SIGINT)
- Closes database and Redis connections on shutdown
- Handles uncaught exceptions and unhandled rejections
- 10-second forced shutdown timeout

**Why separate from app.ts**: Clean separation between app logic and server lifecycle.

---

## Architecture Layers

### Layer 1: Routes (`routes/`)
- Define HTTP endpoints (`POST /api/v1/documents`, etc.)
- Apply route-specific middleware (validation, rate limiting)
- Delegate to controllers
- **Principle**: Routes only define what endpoints exist, not how they work

### Layer 2: Controllers (`controllers/`)
- Handle HTTP request/response
- Validate input (via middleware)
- Call service layer for business logic
- Format responses using standardized utilities
- **Principle**: Thin controllers - orchestrate, don't implement

### Layer 3: Services (`services/` - to be implemented)
- Business logic implementation
- Database operations via Prisma
- External API calls (AI, document processing)
- Complex algorithms
- **Principle**: Reusable, testable, framework-agnostic

### Layer 4: Data Access (`lib/` - to be implemented)
- Core algorithms (graph merging, text chunking)
- Reusable logic components
- No direct HTTP or framework dependencies
- **Principle**: Pure functions where possible

---

## Configuration Strategy

All configuration lives in `config/`:
- **Database**: Prisma client singleton
- **Redis**: Connection with health checks
- **AI Clients**: Anthropic + OpenAI setup
- **Environment**: Validated env vars (Zod schemas)
- **Constants**: Application-wide settings (rate limits, file sizes)

**Why centralized**: Single source of truth, easy to mock in tests, clear dependencies.

---

## Middleware Pipeline

Request flows through middleware in this order:
1. **Request Logger**: Generates request ID, logs incoming request
2. **CORS**: Validates origin
3. **Helmet**: Sets security headers
4. **Body Parser**: Parses JSON/URL-encoded bodies
5. **Rate Limiter**: Checks request limits (Redis-backed)
6. **Routes**: Matches endpoint
7. **Validation**: Validates request schema (Zod)
8. **Controller**: Handles business logic
9. **Error Handler**: Catches all errors, formats response

**Why this order**: Security first (CORS, Helmet), then parsing, then business logic.

---

## Error Handling Strategy

All errors flow through centralized handler (`middleware/error-handler.middleware.ts`):
- **Zod errors**: 400 with validation details
- **API errors**: Custom status code with error code
- **Multer errors**: 400 with file upload message
- **Unexpected errors**: 500 with sanitized message

**Response format** (from `TECHNICAL.md` section 4.3):
```json
{
  "success": false,
  "error": {
    "code": "DOCUMENT_NOT_FOUND",
    "message": "Human-readable message",
    "details": {}
  },
  "meta": {
    "timestamp": "2025-11-11T10:00:00Z",
    "requestId": "uuid"
  }
}
```

---

## Type Safety

All TypeScript definitions in `types/`:
- **api.types.ts**: Request/response interfaces, error codes
- **document.types.ts**: Document entities
- **graph.types.ts**: Graph, node, edge types
- **quiz.types.ts**: Quiz questions
- **note.types.ts**: Note entities

**Why separate**: Shared across layers, easy to import, prevents circular dependencies.

---

## Development Workflow

### Adding a New Endpoint

1. **Define types** in `types/`
2. **Create route** in `routes/` (with validation middleware)
3. **Create controller** in `controllers/`
4. **Implement service** in `services/`
5. **Add tests** in `tests/`

### Running Locally

```bash
# Start dependencies
docker-compose up -d  # Postgres + Redis

# Run migrations
npm run prisma:migrate

# Start dev server (with hot reload)
npm run dev

# Check logs
tail -f logs/combined.log
```

---

## Next Implementation Steps

Following `CLAUDE.md` workflow:

1. **BullMQ Setup**: Async job processing for graph generation
2. **Service Layer**: Document processor, graph generator, AI orchestrator
3. **Worker Layer**: Background job handlers
4. **Lib Layer**: Graph merging, text chunking algorithms
5. **Tests**: Comprehensive test suite (70% coverage target)

---

## Compliance with REGULATION.md

- ✅ **Atomic File Structure**: Each file has one purpose
- ✅ **Atomic Code**: Functions do one thing well
- ✅ **Comments Explain WHY**: Code is self-documenting, comments add context
- ✅ **Google TypeScript Style**: Consistent formatting
- ✅ **Proper File Structure**: Balanced tree, organized folders
- ✅ **Co-located Documentation**: This META.md + folder-level docs

---

**Version**: 1.0 | **Updated**: 2024-11-11

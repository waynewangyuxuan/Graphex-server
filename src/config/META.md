# Configuration Directory (`src/config/`)

Application configuration and external service connections.

---

## Files Overview

### `database.ts`
**Purpose**: Prisma Client singleton for PostgreSQL connections

**Key Features**:
- Singleton pattern prevents connection pool exhaustion
- Global instance in development for HMR (hot module reload)
- Graceful shutdown handlers (SIGINT, SIGTERM)
- Health check function for monitoring
- Database statistics query

**Why singleton**: Prisma Client manages connection pooling internally. Multiple instances would create excessive connections.

**Usage**:
```typescript
import { prisma } from '@/config/database';

const documents = await prisma.document.findMany();
```

---

### `redis.ts`
**Purpose**: Redis client for caching and job queues (BullMQ)

**Key Features**:
- Connection with retry strategy (10 attempts, exponential backoff)
- Health check function
- Graceful disconnect on shutdown
- Error event handling
- Connection event logging

**Why Redis**:
- Caching layer for AI responses (60% cost savings)
- BullMQ job queue backend
- Rate limiting store

**Usage**:
```typescript
import { redisClient } from '@/config/redis';

await redisClient.set('key', 'value', 'EX', 3600); // 1 hour TTL
```

---

### `ai-clients.ts`
**Purpose**: AI service clients (Anthropic Claude + OpenAI)

**Key Features**:
- Anthropic client (Claude Sonnet 4) - primary
- OpenAI client (GPT-4 Turbo) - fallback
- Health check functions for both services
- API key validation
- Error handling

**Why two providers**: Redundancy. If Anthropic is down or rate-limited, fall back to OpenAI.

**Model selection** (from `TECHNICAL.md` section 6.5):
- Claude Sonnet 4: Complex tasks (graph generation)
- Claude Haiku: Simple tasks (quiz questions) - 50% cost reduction
- GPT-4: Fallback when Claude unavailable

**Usage**:
```typescript
import { anthropicClient, openaiClient } from '@/config/ai-clients';

const response = await anthropicClient.messages.create({
  model: 'claude-sonnet-4-20250514',
  messages: [{ role: 'user', content: 'Generate graph...' }],
});
```

---

### `env.ts`
**Purpose**: Environment variable validation using Zod

**Key Features**:
- Required variables validated at startup
- Type-safe environment access
- Clear error messages for missing variables
- Default values for optional settings

**Why validate**: Fail fast. Better to crash on startup than discover missing config in production.

**Variables validated**:
- `NODE_ENV`: development | production | test
- `PORT`: Server port (default 3000)
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `ANTHROPIC_API_KEY`: Claude API key
- `OPENAI_API_KEY`: GPT-4 API key (optional, fallback)
- `ALLOWED_ORIGINS`: CORS whitelist (comma-separated)

**Usage**:
```typescript
import { env } from '@/config/env';

console.log(env.PORT); // Type-safe, validated
```

---

### `constants.ts`
**Purpose**: Application-wide constants

**Key Features**:
- `APP_CONFIG`: Environment, port, API version
- `RATE_LIMITS`: Request limits per tier (from `TECHNICAL.md` section 4.5)
- `FILE_UPLOAD_CONFIG`: Max file size, allowed MIME types
- `CORS_CONFIG`: Allowed origins, methods, headers
- `AI_CONFIG`: Models, timeout settings

**Why centralized**: Single source of truth, easy to adjust, no magic numbers in code.

**Constants defined**:
```typescript
RATE_LIMITS = {
  GENERAL: { windowMs: 3600000, max: 1000 },      // 1000 req/hour
  AI_OPERATIONS: { windowMs: 3600000, max: 100 }, // 100 req/hour
  FILE_UPLOADS: { windowMs: 3600000, max: 10 },   // 10 uploads/hour
  URL_EXTRACTION: { windowMs: 3600000, max: 10 }, // 10 URLs/hour
}

FILE_UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_MIME_TYPES: ['application/pdf', 'text/plain', 'text/markdown'],
}
```

---

## Design Decisions

### Why Separate Configuration Files?

**Atomic File Structure** (REGULATION.md Principle 1): Each configuration concern gets its own file.

- Database config shouldn't know about Redis
- AI client setup is independent of server config
- Easy to mock individual dependencies in tests

### Why Health Checks?

**Observability** (TECHNICAL.md section 16): Application exposes health endpoints (`/health/deep`) that check all external dependencies.

Health check functions in each config file enable this:
```typescript
// In health route
const dbOk = await checkDatabaseHealth();
const redisOk = await checkRedisHealth();
const aiOk = await checkAnthropicHealth();
```

### Why Graceful Shutdown?

**Resilience** (TECHNICAL.md section 12): When deploying updates, we don't want to:
- Drop in-flight requests
- Leave database connections open
- Lose data in Redis

Graceful shutdown (in `server.ts`):
1. Stop accepting new requests
2. Wait for in-flight requests to complete
3. Close database connections
4. Close Redis connections
5. Exit after timeout (10s max)

---

## Configuration Loading Order

Application startup follows this sequence:

1. **Load environment** (`env.ts`): Validates all required variables
2. **Initialize database** (`database.ts`): Create Prisma client, test connection
3. **Initialize Redis** (`redis.ts`): Connect to Redis, verify connectivity
4. **Initialize AI clients** (`ai-clients.ts`): Validate API keys
5. **Start Express app** (`app.ts`): Mount middleware and routes
6. **Start HTTP server** (`server.ts`): Listen on port

**Why this order**: Fail fast. If database is unreachable, don't start the server.

---

## Future Enhancements

### Secrets Management
Currently using environment variables. For production:
- Use cloud provider secrets (Railway/Render secrets, AWS Secrets Manager)
- Rotate API keys regularly
- Encrypt sensitive values at rest

### Feature Flags
Add feature flag system (`config/features.ts`):
- Enable/disable features without code changes
- A/B testing different AI prompts
- Gradual rollout of new features

### Multiple Environments
Extend configuration for:
- `development.ts`: Local dev settings (verbose logging)
- `staging.ts`: Pre-production config
- `production.ts`: Production optimizations

---

## Compliance with REGULATION.md

- ✅ **Atomic File Structure**: Each file configures one external service
- ✅ **Comments Explain WHY**: Explains singleton pattern, health checks, graceful shutdown
- ✅ **No Magic Numbers**: All constants in `constants.ts`
- ✅ **Type Safety**: Zod validation, TypeScript everywhere

---

**Version**: 1.0 | **Updated**: 2024-11-11

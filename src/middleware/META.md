# Middleware Directory (`src/middleware/`)

Express middleware for request processing, security, and error handling.

---

## Middleware Pipeline

Requests flow through middleware in this order:

```
Incoming Request
    ↓
1. request-logger.middleware.ts    (Generate request ID, log request)
    ↓
2. cors.middleware.ts              (Validate origin)
    ↓
3. helmet.js                       (Set security headers - in app.ts)
    ↓
4. express.json()                  (Parse JSON body - in app.ts)
    ↓
5. rate-limiter.middleware.ts      (Check request limits)
    ↓
6. Routes                          (Match endpoint)
    ↓
7. validation.middleware.ts        (Validate request schema)
    ↓
8. Controller                      (Business logic)
    ↓
9. error-handler.middleware.ts     (Catch errors, format response)
    ↓
Response Sent
```

**Why this order**: Security first (CORS, Helmet), then parsing, then rate limiting, then business logic.

---

## Files Overview

### `request-logger.middleware.ts`
**Purpose**: Request ID generation and structured logging

**What it does**:
- Generates UUID v4 for each request
- Attaches `requestId` to `req` object
- Logs incoming request (method, path, IP)
- Logs response (status code, duration)

**Why request IDs**: Essential for distributed tracing. When debugging errors, you can search logs by request ID to see full request lifecycle.

**Usage**:
```typescript
// Automatic in all requests
app.use(requestIdMiddleware);
app.use(requestLogger);

// In controllers
const requestId = (req as ExtendedRequest).requestId;
sendSuccess(res, data, 200, requestId);
```

**Log format** (JSON, from `TECHNICAL.md` section 16.1):
```json
{
  "level": "info",
  "message": "Incoming request",
  "requestId": "abc-123-def-456",
  "method": "POST",
  "path": "/api/v1/documents",
  "ip": "127.0.0.1",
  "timestamp": "2025-11-11T10:00:00Z"
}
```

---

### `cors.middleware.ts`
**Purpose**: Cross-Origin Resource Sharing (CORS) configuration

**What it does**:
- Validates request origin against whitelist
- Sets CORS headers (Access-Control-Allow-Origin, etc.)
- Handles preflight requests (OPTIONS)

**Why needed**: Frontend (React/Next.js) runs on different origin than API. Browser blocks cross-origin requests unless CORS is configured.

**Configuration**:
- **Allowed origins**: From `ALLOWED_ORIGINS` env var (comma-separated)
- **Allowed methods**: GET, POST, PUT, DELETE
- **Allowed headers**: Content-Type, Authorization
- **Credentials**: Not allowed (no cookies for MVP)

**Security consideration**: Only whitelist known origins in production. Never use `*` (allow all).

---

### `rate-limiter.middleware.ts`
**Purpose**: Rate limiting to prevent abuse

**What it does**:
- Tracks requests per IP address
- Uses Redis as storage (distributed rate limiting)
- Four tiers with different limits (from `TECHNICAL.md` section 4.5)

**Rate limit tiers**:
1. **General API**: 1000 requests/hour per IP
2. **AI Operations**: 100 requests/hour (expensive operations)
3. **File Uploads**: 10 uploads/hour (resource-intensive)
4. **URL Extraction**: 10 URLs/hour (prevent scraping abuse)

**Why Redis-backed**:
- In-memory speed for quick checks
- Distributed: Works across multiple server instances
- Persistent: Survives server restarts

**Response when exceeded** (HTTP 429):
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests"
  }
}
```

**Usage**:
```typescript
// Apply tier to specific routes
router.post('/documents', fileUploadLimiter, uploadDocument);
router.post('/graphs/generate', aiOperationsLimiter, generateGraph);
```

---

### `error-handler.middleware.ts`
**Purpose**: Centralized error handling and response formatting

**What it does**:
- Catches all errors thrown in routes/controllers
- Formats errors into standardized response (from `TECHNICAL.md` section 4.3)
- Logs errors with Winston
- Sanitizes error details in production

**Error types handled**:
1. **Zod validation errors**: 400 Bad Request with field-level details
2. **Custom API errors**: Custom status code with error code
3. **Multer file upload errors**: 400 with upload-specific message
4. **Unexpected errors**: 500 Internal Server Error (sanitized)

**Why centralized**:
- Consistent error format across all endpoints
- Single place to add error logging, monitoring
- No need to wrap every controller in try-catch

**Error response format**:
```json
{
  "success": false,
  "error": {
    "code": "DOCUMENT_NOT_FOUND",
    "message": "Document with ID abc-123 not found",
    "details": { /* optional */ }
  },
  "meta": {
    "timestamp": "2025-11-11T10:00:00Z",
    "requestId": "uuid"
  }
}
```

**404 Handler**: Separate middleware for unmatched routes (returns NOT_FOUND error).

---

### `validation.middleware.ts`
**Purpose**: Request validation using Zod schemas

**What it does**:
- Validates request body, query params, or route params
- Uses Zod schemas for type-safe validation
- Throws `ZodError` on validation failure (caught by error handler)

**Why Zod**:
- Type-safe: Infer TypeScript types from schemas
- Composable: Build complex schemas from simple ones
- Great error messages: Field-level validation details

**Usage**:
```typescript
// Define schema
const uploadSchema = z.object({
  title: z.string().min(1).max(200),
  sourceType: z.enum(['pdf', 'text', 'markdown', 'url']),
});

// Apply to route
router.post('/documents',
  validate(uploadSchema),
  uploadDocument
);
```

**Validation failure** (400 response):
```json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Request validation failed",
    "details": [
      {
        "path": "title",
        "message": "String must contain at least 1 character(s)"
      }
    ]
  }
}
```

---

## Design Decisions

### Why Separate Middleware Files?

**Atomic File Structure** (REGULATION.md Principle 1): Each middleware has ONE responsibility.

- Request logging shouldn't know about rate limiting
- CORS logic is independent of error handling
- Easy to test each middleware in isolation

### Why This Middleware Order?

**Security First**: CORS and Helmet run before any business logic. Reject unauthorized requests early.

**Parse Before Validate**: Body must be parsed (JSON) before we can validate its schema.

**Rate Limit Early**: Check limits before expensive operations (database queries, AI calls).

**Error Handler Last**: Catches all errors from upstream middleware/controllers.

### Why Winston for Logging?

**Structured Logging** (TECHNICAL.md section 16.1): JSON format enables:
- Easy parsing by log aggregators (Datadog, CloudWatch)
- Searchable by request ID
- Filterable by level (error, warn, info, debug)

Alternative considered: `pino` (faster), but Winston has better transport ecosystem.

---

## Error Handling Strategy

### 1. Throw Errors in Controllers
Controllers don't handle errors - they throw:
```typescript
if (!document) {
  throw new ApiError(ErrorCode.DOCUMENT_NOT_FOUND, 'Document not found', 404);
}
```

### 2. Error Handler Catches All
Centralized handler formats and responds:
```typescript
app.use(errorHandler); // Catches everything
```

### 3. Request ID Propagation
Every error response includes request ID for debugging:
```json
{
  "error": { /* ... */ },
  "meta": { "requestId": "abc-123" }
}
```

**Why this works**: Clean separation. Controllers focus on business logic, middleware handles cross-cutting concerns.

---

## Performance Considerations

### Rate Limiter
- **Redis lookup**: ~1-2ms per request
- **Alternative**: In-memory (faster but not distributed)
- **Trade-off**: Slight latency increase for multi-server support

### Request Logger
- **JSON serialization**: ~0.5ms per log
- **File I/O**: Async writes, doesn't block request
- **Production**: Use log aggregator (CloudWatch) instead of file writes

### Validation
- **Zod parsing**: ~1-3ms for typical request
- **Alternative**: Manual validation (error-prone)
- **Trade-off**: Worth it for type safety and consistency

---

## Testing Strategy

Each middleware should have unit tests:

```typescript
// Example: rate-limiter.test.ts
describe('Rate Limiter', () => {
  it('should allow requests under limit', async () => {
    // Make 10 requests
    // All should succeed
  });

  it('should block requests over limit', async () => {
    // Make 1001 requests
    // 1001st should return 429
  });

  it('should reset after window expires', async () => {
    // Make 1000 requests, wait 1 hour, make 1 more
    // Should succeed
  });
});
```

---

## Future Enhancements

### Authentication Middleware
Add JWT verification (post-MVP):
```typescript
// auth.middleware.ts
export const requireAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) throw new ApiError(ErrorCode.UNAUTHORIZED, 'Token required', 401);
  // Verify JWT
};
```

### Request Size Limiting
Prevent large payloads:
```typescript
app.use(express.json({ limit: '1mb' }));
```

### Request Timeout
Kill slow requests:
```typescript
app.use(timeout('30s'));
```

---

## Compliance with REGULATION.md

- ✅ **Atomic File Structure**: Each middleware has one responsibility
- ✅ **Atomic Code**: Functions are small and focused
- ✅ **Comments Explain WHY**: Explains middleware order, design decisions
- ✅ **Proper File Structure**: All middleware in one directory
- ✅ **Co-located Documentation**: This META.md

---

**Version**: 1.0 | **Updated**: 2024-11-11

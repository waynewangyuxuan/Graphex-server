# Controllers Directory (`src/controllers/`)

HTTP request handlers that orchestrate business logic.

---

## Overview

Controllers sit between routes and services in the layered architecture:

```
Routes → Controllers → Services → Database/External APIs
```

**Controller responsibilities**:
- Receive HTTP requests
- Validate input (via middleware)
- Call service layer for business logic
- Format responses using standardized utilities
- Handle errors (throw, let middleware catch)

**Controllers should NOT**:
- Contain business logic (belongs in services)
- Directly access database (use services)
- Handle complex algorithms (belongs in lib)
- Format responses manually (use utils/response.util.ts)

---

## Files Overview

### `document.controller.ts`
**Endpoints**:
- `POST /api/v1/documents` - Upload file
- `POST /api/v1/documents/from-url` - Extract content from URL
- `GET /api/v1/documents/:id` - Get document details
- `GET /api/v1/documents/:id/status` - Check processing status

**Current status**: Placeholder implementations returning mock data

**Future implementation**:
```typescript
export const uploadDocument = async (req, res, next) => {
  try {
    const file = req.file; // Multer
    const { title } = req.body;

    // Delegate to service
    const document = await documentService.processUpload(file, title);

    // Enqueue processing job
    const jobId = await documentService.enqueueProcessing(document.id);

    sendSuccess(res, { document, jobId }, 201, req.requestId);
  } catch (error) {
    next(error); // Let error handler deal with it
  }
};
```

---

### `graph.controller.ts`
**Endpoints**:
- `POST /api/v1/graphs/generate` - Start graph generation (returns job ID)
- `GET /api/v1/graphs/:id` - Get graph data
- `GET /api/v1/jobs/:id` - Check job status

**Why async generation**: Graph generation can take 30s-5min for large documents (from `TECHNICAL.md` section 6).

**Current status**: Placeholder implementations

**Future implementation**:
```typescript
export const generateGraph = async (req, res, next) => {
  try {
    const { documentId } = req.body;

    // Enqueue background job
    const job = await graphService.enqueueGeneration(documentId);

    sendSuccess(res, {
      jobId: job.id,
      status: 'queued',
      estimatedTime: '1-3 minutes'
    }, 202, req.requestId);
  } catch (error) {
    next(error);
  }
};
```

---

### `connection.controller.ts`
**Endpoints**:
- `POST /api/v1/connections/explain` - Get AI explanation for edge

**Why this endpoint**: Feature 4 from `MVP.md` - Pre-explanation retrieval. User generates hypothesis, then sees AI's explanation.

**Current status**: Placeholder implementation

**Future implementation**:
```typescript
export const explainConnection = async (req, res, next) => {
  try {
    const { fromNodeId, toNodeId, userHypothesis } = req.body;

    // Check cache first (60% cost savings)
    const cached = await cacheService.getExplanation(fromNodeId, toNodeId);
    if (cached) return sendSuccess(res, cached, 200, req.requestId);

    // Generate explanation via AI
    const explanation = await aiService.explainConnection(
      fromNodeId,
      toNodeId,
      userHypothesis // For comparison
    );

    // Cache for future requests
    await cacheService.setExplanation(fromNodeId, toNodeId, explanation);

    sendSuccess(res, explanation, 200, req.requestId);
  } catch (error) {
    next(error);
  }
};
```

---

### `quiz.controller.ts`
**Endpoints**:
- `POST /api/v1/quizzes/generate` - Generate quiz questions
- `POST /api/v1/quizzes/:id/submit` - Submit quiz answers

**Why needed**: Feature 5 from `MVP.md` - Comprehension verification. Testing effect is one of strongest cognitive interventions.

**Current status**: Placeholder implementations

**Future implementation**:
```typescript
export const generateQuiz = async (req, res, next) => {
  try {
    const { graphId, difficulty, count } = req.body;

    // Check cache
    const cacheKey = `quiz:${graphId}:${difficulty}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) return sendSuccess(res, cached, 200, req.requestId);

    // Generate via AI
    const questions = await quizService.generateQuestions(
      graphId,
      difficulty,
      count || 5
    );

    // Cache for 1 hour
    await cacheService.set(cacheKey, questions, 3600);

    sendSuccess(res, { questions }, 200, req.requestId);
  } catch (error) {
    next(error);
  }
};
```

---

### `note.controller.ts`
**Endpoints**:
- `POST /api/v1/notes` - Create note
- `GET /api/v1/notes?graphId=:id` - Get all notes for graph
- `PUT /api/v1/notes/:id` - Update note
- `DELETE /api/v1/notes/:id` - Delete note

**Why needed**: Feature 3 from `MVP.md` - Node notes. Active processing is critical.

**Current status**: Placeholder implementations

**Future implementation**:
```typescript
export const createNote = async (req, res, next) => {
  try {
    const { graphId, nodeId, edgeId, content } = req.body;

    // Validation: Note must be attached to node OR edge OR just graph
    if (!nodeId && !edgeId && !graphId) {
      throw new ApiError(
        ErrorCode.INVALID_REQUEST,
        'Note must be attached to graph, node, or edge',
        400
      );
    }

    const note = await noteService.create({
      graphId,
      nodeId,
      edgeId,
      content,
    });

    sendSuccess(res, note, 201, req.requestId);
  } catch (error) {
    next(error);
  }
};
```

---

## Design Patterns

### 1. Thin Controllers
Controllers orchestrate, don't implement:

```typescript
// ❌ BAD: Business logic in controller
export const uploadDocument = async (req, res) => {
  const file = req.file;
  const text = await pdfParse(file.buffer); // Business logic here
  const chunks = chunkText(text, 10000); // Business logic here
  // ... more logic
};

// ✅ GOOD: Delegate to service
export const uploadDocument = async (req, res) => {
  const file = req.file;
  const document = await documentService.processUpload(file);
  sendSuccess(res, document, 201, req.requestId);
};
```

**Why**:
- Services are testable without HTTP mocks
- Services can be reused in workers, scripts
- Controllers stay simple and focused

### 2. Error Delegation
Controllers throw errors, middleware catches:

```typescript
// ❌ BAD: Manual error handling
export const getDocument = async (req, res) => {
  try {
    const doc = await documentService.getById(req.params.id);
    if (!doc) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json(doc);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ✅ GOOD: Throw errors, let middleware handle
export const getDocument = async (req, res, next) => {
  try {
    const doc = await documentService.getById(req.params.id);
    if (!doc) {
      throw new ApiError(ErrorCode.DOCUMENT_NOT_FOUND, 'Document not found', 404);
    }
    sendSuccess(res, doc, 200, req.requestId);
  } catch (error) {
    next(error); // Middleware formats response
  }
};
```

### 3. Standardized Responses
Use utility functions for consistent format:

```typescript
// ❌ BAD: Manual response formatting
res.status(200).json({
  success: true,
  data: { /* ... */ },
  timestamp: new Date().toISOString()
});

// ✅ GOOD: Use utility
sendSuccess(res, data, 200, req.requestId);
```

**Why**: Ensures all responses match format from `TECHNICAL.md` section 4.3.

---

## Request Flow Example

Complete flow for document upload:

```
1. Client sends POST /api/v1/documents with file
    ↓
2. Request hits middleware stack
   - Request logger: Generates request ID
   - CORS: Validates origin
   - Rate limiter: Checks upload limit (10/hour)
   - Multer: Parses multipart/form-data
    ↓
3. Route matches: POST /documents
    ↓
4. Validation middleware: Validates request body
    ↓
5. Controller: uploadDocument()
   - Calls documentService.processUpload()
   - Calls documentService.enqueueProcessing()
   - Formats response with sendSuccess()
    ↓
6. Response sent to client
    ↓
7. Background worker picks up processing job
```

---

## Testing Strategy

Controllers should have integration tests (not unit tests):

```typescript
// document.controller.test.ts
describe('Document Controller', () => {
  it('should upload document and return job ID', async () => {
    const response = await request(app)
      .post('/api/v1/documents')
      .attach('file', 'test.pdf')
      .field('title', 'Test Document');

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.jobId).toBeDefined();
  });

  it('should return 400 for invalid file type', async () => {
    const response = await request(app)
      .post('/api/v1/documents')
      .attach('file', 'test.exe');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('UNSUPPORTED_FORMAT');
  });
});
```

**Why integration tests**: Controllers are thin - testing them in isolation doesn't provide much value. Integration tests verify the full request flow.

---

## Next Implementation Steps

Following `CLAUDE.md` workflow:

1. **Implement service layer** (`src/services/`)
   - `document-processor.service.ts`
   - `graph-generator.service.ts`
   - `ai-orchestrator.service.ts`
   - `quiz.service.ts`
   - `note.service.ts`

2. **Replace placeholder controllers** with real implementations

3. **Add validation schemas** (Zod) for each endpoint

4. **Write integration tests** for all endpoints

---

## Compliance with REGULATION.md

- ✅ **Atomic File Structure**: Each controller handles one resource
- ✅ **Atomic Code**: Controller functions are small and focused
- ✅ **Comments Explain WHY**: Explains delegation to services, error handling
- ✅ **Thin Controllers**: No business logic, just orchestration
- ✅ **Co-located Documentation**: This META.md

---

**Version**: 1.0 | **Updated**: 2024-11-11

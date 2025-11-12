# Graphex API Reference

API documentation for frontend development and testing.

**Base URL**: `http://localhost:4000/api/v1`

**Note**: All endpoints currently return placeholder data. Real implementations require service layer completion.

---

## Response Format

All API responses follow this standardized format:

### Success Response
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

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {}  // Optional
  },
  "meta": {
    "timestamp": "2025-11-11T10:00:00Z",
    "requestId": "uuid-v4"
  }
}
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_REQUEST` | 400 | Malformed request or validation error |
| `DOCUMENT_NOT_FOUND` | 404 | Document ID does not exist |
| `GRAPH_NOT_FOUND` | 404 | Graph ID does not exist |
| `UNSUPPORTED_FORMAT` | 400 | File format not supported |
| `FILE_TOO_LARGE` | 400 | File exceeds 10MB limit |
| `PROCESSING_FAILED` | 500 | Document/graph processing failed |
| `AI_SERVICE_UNAVAILABLE` | 503 | AI API temporarily unavailable |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |

---

## Endpoints

### Health Checks

#### `GET /health`
Basic liveness check.

**Response**:
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2025-11-11T10:00:00Z"
  }
}
```

#### `GET /health/ready`
Readiness check (checks database and Redis).

**Response**:
```json
{
  "success": true,
  "data": {
    "status": "ready",
    "checks": {
      "database": "ok",
      "redis": "ok"
    }
  }
}
```

#### `GET /health/deep`
Deep health check (checks all external services).

**Response**:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "checks": {
      "database": "ok",
      "redis": "ok",
      "anthropic": "ok",
      "openai": "ok"
    }
  }
}
```

---

### Documents

#### `POST /api/v1/documents`
Upload a document file (PDF, text, markdown).

**Request**:
- Method: POST
- Content-Type: multipart/form-data
- Body:
  - `file` (file): Document file
  - `title` (string, optional): Document title

**Response** (202 Accepted):
```json
{
  "success": true,
  "data": {
    "document": {
      "id": "doc_abc123",
      "title": "My Document",
      "sourceType": "pdf",
      "status": "processing",
      "createdAt": "2025-11-11T10:00:00Z"
    },
    "jobId": "job_xyz789"
  }
}
```

#### `POST /api/v1/documents/from-url`
Extract content from a URL.

**Request**:
```json
{
  "url": "https://example.com/article",
  "title": "Article Title"  // optional
}
```

**Response** (202 Accepted):
```json
{
  "success": true,
  "data": {
    "document": {
      "id": "doc_abc123",
      "title": "Article Title",
      "sourceType": "url",
      "sourceUrl": "https://example.com/article",
      "status": "processing",
      "createdAt": "2025-11-11T10:00:00Z"
    },
    "jobId": "job_xyz789"
  }
}
```

#### `GET /api/v1/documents/:id`
Get document details.

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "doc_abc123",
    "title": "My Document",
    "contentText": "Full extracted text...",
    "sourceType": "pdf",
    "fileSize": 1048576,
    "status": "ready",
    "createdAt": "2025-11-11T10:00:00Z",
    "updatedAt": "2025-11-11T10:05:00Z"
  }
}
```

#### `GET /api/v1/documents/:id/status`
Check document processing status.

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "doc_abc123",
    "status": "ready",  // processing | ready | failed
    "progress": 100,    // 0-100
    "errorMessage": null
  }
}
```

---

### Graphs

#### `POST /api/v1/graphs/generate`
Start graph generation from a document (async).

**Request**:
```json
{
  "documentId": "doc_abc123"
}
```

**Response** (202 Accepted):
```json
{
  "success": true,
  "data": {
    "jobId": "job_graph_123",
    "status": "queued",
    "estimatedTime": "1-3 minutes"
  }
}
```

#### `GET /api/v1/graphs/:id`
Get generated graph data.

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "graph_abc123",
    "documentId": "doc_abc123",
    "mermaidCode": "graph TD\n  A[Concept A] --> B[Concept B]\n  B --> C[Concept C]",
    "status": "ready",
    "generationModel": "claude-sonnet-4",
    "nodes": [
      {
        "id": "node_1",
        "nodeKey": "A",
        "title": "Concept A",
        "contentSnippet": "Brief description of concept A",
        "documentRefs": [
          {
            "start": 0,
            "end": 100,
            "text": "Relevant text from document..."
          }
        ]
      }
    ],
    "edges": [
      {
        "id": "edge_1",
        "fromNodeId": "node_1",
        "toNodeId": "node_2",
        "relationship": "leads to",
        "aiExplanation": null
      }
    ],
    "createdAt": "2025-11-11T10:00:00Z"
  }
}
```

#### `GET /api/v1/jobs/:id`
Check job status (for async operations).

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "job_graph_123",
    "type": "graph-generation",
    "status": "completed",  // queued | processing | completed | failed
    "progress": 100,         // 0-100
    "result": {
      "graphId": "graph_abc123"
    },
    "error": null,
    "createdAt": "2025-11-11T10:00:00Z",
    "completedAt": "2025-11-11T10:02:30Z"
  }
}
```

---

### Connections

#### `POST /api/v1/connections/explain`
Get AI explanation for a connection between nodes.

**Request**:
```json
{
  "fromNodeId": "node_1",
  "toNodeId": "node_2",
  "userHypothesis": "User's explanation of why they think these are connected"  // optional
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "fromNode": "node_1",
    "toNode": "node_2",
    "relationship": "leads to",
    "explanation": "AI-generated explanation of the connection with source citations",
    "sourceReferences": [
      {
        "start": 100,
        "end": 250,
        "text": "Relevant text from document supporting this connection..."
      }
    ],
    "userHypothesisEvaluation": {  // only if userHypothesis provided
      "match": "partial",  // full | partial | incorrect
      "feedback": "You correctly identified X, but also consider Y..."
    }
  }
}
```

---

### Quizzes

#### `POST /api/v1/quizzes/generate`
Generate quiz questions from a graph.

**Request**:
```json
{
  "graphId": "graph_abc123",
  "difficulty": "medium",  // easy | medium | hard
  "count": 5               // number of questions
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "quizId": "quiz_abc123",
    "questions": [
      {
        "id": "q1",
        "questionText": "Which concept leads to Concept B?",
        "options": [
          { "id": 0, "text": "Concept A" },
          { "id": 1, "text": "Concept C" },
          { "id": 2, "text": "Concept D" },
          { "id": 3, "text": "Concept E" }
        ],
        "correctAnswer": 0,
        "explanation": "Concept A leads to Concept B because...",
        "difficulty": "medium",
        "nodeRefs": ["node_1", "node_2"]
      }
    ]
  }
}
```

#### `POST /api/v1/quizzes/:id/submit`
Submit quiz answers.

**Request**:
```json
{
  "answers": [
    { "questionId": "q1", "selectedAnswer": 0 },
    { "questionId": "q2", "selectedAnswer": 2 }
  ]
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "score": 80,  // percentage
    "correct": 4,
    "total": 5,
    "results": [
      {
        "questionId": "q1",
        "correct": true,
        "selectedAnswer": 0,
        "correctAnswer": 0,
        "explanation": "..."
      }
    ]
  }
}
```

---

### Notes

#### `POST /api/v1/notes`
Create a note.

**Request**:
```json
{
  "graphId": "graph_abc123",
  "nodeId": "node_1",     // optional (can be attached to node, edge, or just graph)
  "edgeId": null,         // optional
  "content": "My note about this concept"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": "note_abc123",
    "graphId": "graph_abc123",
    "nodeId": "node_1",
    "edgeId": null,
    "content": "My note about this concept",
    "createdAt": "2025-11-11T10:00:00Z",
    "updatedAt": "2025-11-11T10:00:00Z"
  }
}
```

#### `GET /api/v1/notes?graphId=:graphId`
Get all notes for a graph.

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "note_abc123",
      "graphId": "graph_abc123",
      "nodeId": "node_1",
      "edgeId": null,
      "content": "My note",
      "createdAt": "2025-11-11T10:00:00Z"
    }
  ]
}
```

#### `PUT /api/v1/notes/:id`
Update a note.

**Request**:
```json
{
  "content": "Updated note content"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "note_abc123",
    "content": "Updated note content",
    "updatedAt": "2025-11-11T10:05:00Z"
  }
}
```

#### `DELETE /api/v1/notes/:id`
Delete a note.

**Response** (204 No Content):
```
(empty body)
```

---

## Rate Limiting

Rate limits are enforced per IP address:

| Tier | Endpoints | Limit |
|------|-----------|-------|
| General | All API endpoints | 1000 requests/hour |
| AI Operations | `/graphs/generate`, `/connections/explain` | 100 requests/hour |
| File Uploads | `/documents` (file upload) | 10 uploads/hour |
| URL Extraction | `/documents/from-url` | 10 URLs/hour |

**Rate Limit Headers**:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1699876543
```

**Rate Limit Exceeded Response** (429):
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later.",
    "details": {
      "retryAfter": 3600  // seconds
    }
  }
}
```

---

## Testing

### Using cURL

```bash
# Health check
curl http://localhost:4000/health

# Upload document
curl -X POST http://localhost:4000/api/v1/documents \
  -F "file=@document.pdf" \
  -F "title=My Document"

# Get document
curl http://localhost:4000/api/v1/documents/doc_abc123

# Generate graph
curl -X POST http://localhost:4000/api/v1/graphs/generate \
  -H "Content-Type: application/json" \
  -d '{"documentId": "doc_abc123"}'
```

### Using Fetch (JavaScript)

```javascript
// Upload document
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('title', 'My Document');

const response = await fetch('http://localhost:4000/api/v1/documents', {
  method: 'POST',
  body: formData
});

const data = await response.json();
console.log(data);
```

---

## CORS

Allowed origins (configured in `.env.development`):
- `http://localhost:4000`
- `http://localhost:5173` (Vite default)

Add your frontend origin to `CORS_ORIGINS` in `.env.development`.

---

## Current Status

### Implemented
- ✅ All route definitions
- ✅ Standardized response format
- ✅ Error handling middleware
- ✅ Rate limiting
- ✅ CORS configuration
- ✅ Request logging

### In Progress
- 🚧 Database migrations
- 🚧 Service layer implementation
- 🚧 BullMQ job processing
- 🚧 Real AI integration

### Returning Placeholder Data
All endpoints currently return mock data. Real implementations coming soon!

---

**Version**: 1.0
**Last Updated**: 2025-11-11
**Server Status**: Foundation complete, awaiting service implementation

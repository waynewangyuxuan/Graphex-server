# Frontend Integration Guide

## Server Status: ✅ READY FOR FRONTEND

Your backend is fully functional and ready to be wired to your frontend. Here's what you need to know:

---

## 📡 Available Endpoints

### Base URL
```
http://localhost:4000
```

### CORS Configuration
- ✅ Configured for: `http://localhost:3000`, `http://localhost:3001`, `http://localhost:5173`
- ✅ Credentials: `false`
- ✅ Allowed headers: `Content-Type`, `Authorization`, `X-Request-ID`
- ✅ Allowed methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`

---

## 🚀 API Workflow

### 1. Upload Document
**Endpoint:** `POST /api/v1/documents`
**Content-Type:** `multipart/form-data`

**Request:**
```javascript
const formData = new FormData();
formData.append('file', pdfFile); // File object from input
formData.append('title', 'My Research Paper'); // Optional

const response = await fetch('http://localhost:4000/api/v1/documents', {
  method: 'POST',
  body: formData,
  // Don't set Content-Type header - browser will set it with boundary
});

const result = await response.json();
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "documentId": "cmhzr7gsq0000bhcga0r68scf",
    "title": "SUNSet- Synergistic Understanding...",
    "wordCount": 8709,
    "imageCount": 0,
    "qualityScore": 100,
    "estimatedCost": 0.076,
    "processingTimeMs": 253,
    "status": "ready"
  },
  "meta": {
    "timestamp": "2025-11-14T19:55:23.123Z",
    "requestId": "b8ef3fcd-6b8e-4088-bd5c-fdff39446b2f"
  }
}
```

---

### 2. Generate Knowledge Graph
**Endpoint:** `POST /api/v1/graphs/generate`
**Content-Type:** `application/json`

**Request:**
```javascript
const response = await fetch('http://localhost:4000/api/v1/graphs/generate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    documentId: 'cmhzr7gsq0000bhcga0r68scf', // From step 1
    options: {
      maxNodes: 15, // Optional: 5-25, default 15
      skipCache: false // Optional: default false
    }
  })
});

const result = await response.json();
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "graphId": "cmhzsdvg90005bhcgi8lyl9fh",
    "status": "completed",
    "nodeCount": 14,
    "edgeCount": 14,
    "qualityScore": 100,
    "cost": 0.0,
    "processingTimeMs": 28736,
    "warnings": []
  },
  "meta": {
    "timestamp": "2025-11-15T04:28:22.560Z",
    "requestId": "5dccb3cb-cdf0-45bf-852b-d95be690d7a0"
  }
}
```

**⏱️ Timing:** Graph generation takes ~20-30 seconds for a typical academic paper

---

### 3. Retrieve Generated Graph
**Endpoint:** `GET /api/v1/graphs/:graphId`

**Request:**
```javascript
const response = await fetch('http://localhost:4000/api/v1/graphs/cmhzsdvg90005bhcgi8lyl9fh');
const result = await response.json();
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "cmhzsdvg90005bhcgi8lyl9fh",
    "status": "ready",
    "mermaidCode": "graph TD\n  0_A[\"SUnSET Framework\"]...",
    "generationModel": "claude-sonnet-4",
    "version": 1,
    "createdAt": "2025-11-15T04:27:53.823Z",
    "document": {
      "id": "cmhzr7gsq0000bhcga0r68scf",
      "title": "SUNSet- Synergistic Understanding...",
      "sourceType": "file",
      "createdAt": "2025-11-14T19:55:23.096Z"
    },
    "nodes": [
      {
        "id": "cmhzsdvgg0007bhcg0bbmh7j7",
        "nodeKey": "0_A",
        "title": "SUnSET Framework",
        "contentSnippet": "A framework for generating summarized timelines...",
        "nodeType": "method",
        "summary": "SUnSET is a novel approach for Timeline Summarization...",
        "documentRefs": null,
        "position": { "x": null, "y": null },
        "metadata": null
      }
      // ... more nodes
    ],
    "edges": [
      {
        "id": "cmhzsdvgq000dbhcgc7vq71z5",
        "from": "cmhzsdvgg0007bhcg0bbmh7j7",
        "to": "cmhzsdvgl0009bhcg5gfyjta2",
        "fromNode": {
          "nodeKey": "0_A",
          "title": "SUnSET Framework"
        },
        "toNode": {
          "nodeKey": "0_B",
          "title": "SET Generation"
        },
        "relationship": "uses",
        "aiExplanation": null,
        "strength": null,
        "metadata": null
      }
      // ... more edges
    ]
  }
}
```

---

## 🔍 Additional Endpoints

### Get Connection Explanation
**Endpoint:** `POST /api/v1/connections/explain`

```javascript
const response = await fetch('http://localhost:4000/api/v1/connections/explain', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    graphId: 'cmhzsdvg90005bhcgi8lyl9fh',
    edgeId: 'cmhzsdvgq000dbhcgc7vq71z5'
  })
});
```

### Generate Quiz
**Endpoint:** `POST /api/v1/quizzes/generate`

```javascript
const response = await fetch('http://localhost:4000/api/v1/quizzes/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    graphId: 'cmhzsdvg90005bhcgi8lyl9fh',
    questionCount: 5,
    difficulty: 'medium'
  })
});
```

---

## ⚠️ Important Notes

### 1. Document Upload ≠ Graph Generation
- Uploading a document **ONLY** extracts and stores the text
- You **MUST** make a separate call to `/graphs/generate` to create the graph
- This is intentional: allows users to review document before expensive graph generation

### 2. Graph Generation is Synchronous (for now)
- The `/graphs/generate` endpoint is currently **synchronous**
- It will block for 20-30 seconds while generating the graph
- ⏳ **Frontend should show loading state**
- Future: Will be migrated to async BullMQ jobs

### 3. Rate Limits
- General API: 1000 requests/hour
- AI Operations (graphs, quizzes, connections): 100 requests/hour
- File Uploads: 10 uploads/hour
- URL Extraction: 10 requests/hour

---

## 🧪 Testing with cURL

### Upload + Generate Flow
```bash
# 1. Upload document
curl -X POST http://localhost:4000/api/v1/documents \
  -F "file=@paper.pdf" \
  -F "title=My Paper"

# Response: { "data": { "documentId": "abc123", ... } }

# 2. Generate graph (takes ~30 seconds)
curl -X POST http://localhost:4000/api/v1/graphs/generate \
  -H "Content-Type: application/json" \
  -d '{"documentId": "abc123"}'

# Response: { "data": { "graphId": "xyz789", ... } }

# 3. Retrieve graph
curl http://localhost:4000/api/v1/graphs/xyz789
```

---

## 🐛 Error Handling

All errors follow this format:
```json
{
  "success": false,
  "error": {
    "code": "DOCUMENT_NOT_FOUND",
    "message": "Document with ID 'xyz' not found",
    "statusCode": 404,
    "details": {}
  },
  "meta": {
    "timestamp": "2025-11-15T04:28:22.560Z",
    "requestId": "5dccb3cb-cdf0-45bf-852b-d95be690d7a0"
  }
}
```

Common error codes:
- `DOCUMENT_NOT_FOUND` (404)
- `VALIDATION_ERROR` (400)
- `PROCESSING_FAILED` (400/500)
- `AI_SERVICE_UNAVAILABLE` (503)
- `RATE_LIMIT_EXCEEDED` (429)

---

## ✅ Checklist for Frontend Integration

- [ ] Configure API base URL: `http://localhost:4000`
- [ ] Add loading states for graph generation (20-30s wait)
- [ ] Handle CORS (already configured on backend)
- [ ] Implement error handling for failed generations
- [ ] Show upload progress for large PDFs
- [ ] Display graph statistics (nodeCount, edgeCount, cost)
- [ ] Parse and render Mermaid diagrams from `mermaidCode` field
- [ ] Implement rate limit retry logic (check `RateLimit-*` headers)

---

## 🎯 Recommended Frontend Flow

```
User uploads PDF
  ↓
POST /documents → Get documentId
  ↓
Show "Processing..." (extraction happens instantly)
  ↓
User clicks "Generate Graph"
  ↓
POST /graphs/generate with documentId
  ↓
Show loading state (20-30s)
  ↓
Receive graphId
  ↓
GET /graphs/:graphId → Display graph
```

---

**Status:** ✅ Backend is production-ready for frontend integration
**Last Updated:** 2025-11-15
**Server:** Running on `http://localhost:4000`

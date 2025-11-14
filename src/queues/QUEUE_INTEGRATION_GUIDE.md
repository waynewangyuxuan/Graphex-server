# BullMQ Queue Integration Guide

Complete guide for integrating the BullMQ job system with your API controllers.

---

## Overview

The BullMQ job system enables asynchronous processing of long-running tasks like graph generation. This guide shows how to integrate it with your Express API.

**Architecture:**
```
Client Request → API Endpoint → Queue Service → Redis Queue → Worker → Database
      ↓                                                              ↑
   Job ID (immediate)                                              |
      ↓                                                              |
   Poll /jobs/:id/status -------------------------------------------|
```

---

## Quick Start

### 1. Start Required Services

```bash
# Start Redis (required for queue)
npm run up

# Start API server (in one terminal)
npm run dev

# Start worker process (in another terminal)
npm run worker:dev

# Or start both at once
npm run dev:all
```

### 2. Basic Controller Integration

Here's how to modify a controller to use async processing:

**BEFORE (Synchronous - blocks API):**
```typescript
// src/controllers/graph.controller.ts
export async function generateGraph(req: Request, res: Response) {
  const { documentId, documentText, documentTitle } = req.body;

  // This blocks for 30s-5min!
  const result = await graphGeneratorService.generateGraph({
    documentId,
    documentText,
    documentTitle,
  });

  res.json({ success: true, data: result });
}
```

**AFTER (Asynchronous - returns immediately):**
```typescript
// src/controllers/graph.controller.ts
import { queueService } from '../services/queue.service';

export async function generateGraph(req: Request, res: Response) {
  const { documentId, documentText, documentTitle, maxNodes } = req.body;

  // Add job to queue (returns immediately)
  const jobId = await queueService.addGraphGenerationJob({
    documentId,
    documentText,
    documentTitle,
    maxNodes,
  });

  // Return job ID for polling
  res.status(202).json({
    success: true,
    data: {
      jobId,
      status: 'processing',
      message: 'Graph generation started',
      statusUrl: `/api/v1/graphs/jobs/${jobId}/status`,
    },
  });
}
```

### 3. Add Status Endpoint

```typescript
// src/controllers/graph.controller.ts
import { queueService } from '../services/queue.service';

export async function getJobStatus(req: Request, res: Response) {
  const { jobId } = req.params;

  try {
    const status = await queueService.getJobStatus(jobId);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      error: {
        code: 'JOB_NOT_FOUND',
        message: error instanceof Error ? error.message : 'Job not found',
      },
    });
  }
}
```

### 4. Add Routes

```typescript
// src/routes/graphs.route.ts
import express from 'express';
import * as graphController from '../controllers/graph.controller';

const router = express.Router();

// Create graph (async)
router.post('/generate', graphController.generateGraph);

// Get job status
router.get('/jobs/:jobId/status', graphController.getJobStatus);

// Get completed graph
router.get('/:graphId', graphController.getGraph);

export default router;
```

---

## API Response Flow

### Step 1: Client Creates Job

**Request:**
```http
POST /api/v1/graphs/generate
Content-Type: application/json

{
  "documentId": "doc_123",
  "documentText": "Long document text...",
  "documentTitle": "Machine Learning Basics",
  "maxNodes": 15
}
```

**Response (202 Accepted):**
```json
{
  "success": true,
  "data": {
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "processing",
    "message": "Graph generation started",
    "statusUrl": "/api/v1/graphs/jobs/550e8400-e29b-41d4-a716-446655440000/status"
  }
}
```

### Step 2: Client Polls Status

**Request:**
```http
GET /api/v1/graphs/jobs/550e8400-e29b-41d4-a716-446655440000/status
```

**Response (Processing):**
```json
{
  "success": true,
  "data": {
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "state": "active",
    "progress": {
      "stage": "generating",
      "percentage": 45,
      "message": "Generated 2/5 mini-graphs",
      "chunksProcessed": 2,
      "totalChunks": 5
    },
    "attempts": 1,
    "maxAttempts": 3,
    "createdAt": 1699891200000,
    "updatedAt": 1699891245000,
    "estimatedCompletionTime": 1699891290000
  }
}
```

**Response (Completed):**
```json
{
  "success": true,
  "data": {
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "state": "completed",
    "result": {
      "graphId": "graph_abc123",
      "nodeCount": 12,
      "edgeCount": 18,
      "mergedNodes": 5,
      "qualityScore": 85,
      "fallbackUsed": false,
      "model": "claude-haiku",
      "warnings": [],
      "cost": 0.15,
      "processingTimeMs": 32450,
      "completedAt": 1699891280000
    },
    "attempts": 1,
    "maxAttempts": 3,
    "createdAt": 1699891200000,
    "updatedAt": 1699891280000
  }
}
```

**Response (Failed):**
```json
{
  "success": true,
  "data": {
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "state": "failed",
    "error": {
      "message": "Budget exceeded: $10.00 daily limit reached",
      "code": "BUDGET_EXCEEDED"
    },
    "attempts": 1,
    "maxAttempts": 3,
    "createdAt": 1699891200000,
    "updatedAt": 1699891210000
  }
}
```

---

## Frontend Integration Examples

### React Hook for Polling

```typescript
// useJobStatus.ts
import { useState, useEffect } from 'react';

interface JobStatus {
  jobId: string;
  state: 'waiting' | 'active' | 'completed' | 'failed';
  progress?: { percentage: number; message: string };
  result?: any;
  error?: { message: string };
}

export function useJobStatus(jobId: string | null) {
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/v1/graphs/jobs/${jobId}/status`);
        const data = await response.json();

        setStatus(data.data);

        // Stop polling when completed or failed
        if (data.data.state === 'completed' || data.data.state === 'failed') {
          clearInterval(pollInterval);
        }
      } catch (err) {
        setError(err as Error);
        clearInterval(pollInterval);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [jobId]);

  return { status, error };
}

// Usage in component:
function GraphGenerationView() {
  const [jobId, setJobId] = useState<string | null>(null);
  const { status, error } = useJobStatus(jobId);

  const handleGenerate = async () => {
    const response = await fetch('/api/v1/graphs/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentText: '...', documentTitle: '...' }),
    });
    const data = await response.json();
    setJobId(data.data.jobId);
  };

  return (
    <div>
      <button onClick={handleGenerate}>Generate Graph</button>
      {status && (
        <div>
          <p>Status: {status.state}</p>
          {status.progress && <p>Progress: {status.progress.percentage}%</p>}
          {status.result && <p>Graph ID: {status.result.graphId}</p>}
        </div>
      )}
    </div>
  );
}
```

### iOS/Swift Example

```swift
class GraphGenerationService {
    func generateGraph(documentText: String, documentTitle: String) async throws -> String {
        // 1. Start generation job
        let startResponse = try await apiClient.post("/api/v1/graphs/generate", body: [
            "documentText": documentText,
            "documentTitle": documentTitle
        ])

        let jobId = startResponse.data.jobId

        // 2. Poll for completion
        while true {
            try await Task.sleep(nanoseconds: 2_000_000_000) // 2 seconds

            let statusResponse = try await apiClient.get("/api/v1/graphs/jobs/\(jobId)/status")
            let status = statusResponse.data

            switch status.state {
            case "completed":
                return status.result.graphId
            case "failed":
                throw GraphGenerationError(message: status.error.message)
            case "active":
                // Update progress UI
                updateProgress(status.progress.percentage)
            default:
                continue
            }
        }
    }
}
```

---

## Advanced Usage

### Custom Priority

```typescript
// High priority for user-initiated requests
const jobId = await queueService.addGraphGenerationJob(
  { documentId, documentText, documentTitle },
  { priority: 100 } // Higher priority (1 = highest)
);
```

### Delayed Jobs

```typescript
// Process after 5 minutes
const jobId = await queueService.addGraphGenerationJob(
  { documentId, documentText, documentTitle },
  { delay: 300000 } // 5 minutes in ms
);
```

### Bulk Operations

```typescript
// Add multiple jobs at once
const jobIds = await queueService.addGraphGenerationJobsBulk([
  { documentId: 'doc1', documentText: '...', documentTitle: 'Doc 1' },
  { documentId: 'doc2', documentText: '...', documentTitle: 'Doc 2' },
  { documentId: 'doc3', documentText: '...', documentTitle: 'Doc 3' },
]);
```

### Job Cancellation

```typescript
// Cancel a waiting job
const cancelled = await queueService.cancelJob(jobId);
if (cancelled) {
  res.json({ success: true, message: 'Job cancelled' });
} else {
  res.json({ success: false, message: 'Cannot cancel job (already processing)' });
}
```

### Manual Retry

```typescript
// Retry a failed job
const newJobId = await queueService.retryJob(jobId);
res.json({ success: true, data: { jobId: newJobId } });
```

---

## Monitoring and Debugging

### Queue Metrics Endpoint

```typescript
// src/controllers/admin.controller.ts
export async function getQueueMetrics(req: Request, res: Response) {
  const metrics = await queueService.getQueueMetrics();

  res.json({
    success: true,
    data: {
      waiting: metrics.waiting,
      active: metrics.active,
      completed: metrics.completed,
      failed: metrics.failed,
      delayed: metrics.delayed,
    },
  });
}
```

### Health Check

```typescript
// src/routes/health.route.ts
router.get('/health/deep', async (req, res) => {
  const metrics = await queueService.getQueueMetrics();

  res.json({
    status: 'healthy',
    checks: {
      queue: {
        status: metrics.active < 100 ? 'ok' : 'warning',
        waiting: metrics.waiting,
        active: metrics.active,
      },
    },
  });
});
```

### Logging

All queue operations are automatically logged with structured data:

```typescript
// Worker logs (automatically generated)
logger.info('Job started processing', {
  jobId: '550e8400-e29b-41d4-a716-446655440000',
  documentId: 'doc_123',
});

logger.info('Job completed', {
  jobId: '550e8400-e29b-41d4-a716-446655440000',
  graphId: 'graph_abc123',
  nodeCount: 12,
  processingTimeMs: 32450,
  cost: 0.15,
});

logger.error('Job failed', {
  jobId: '550e8400-e29b-41d4-a716-446655440000',
  error: 'Budget exceeded',
  attempts: 1,
});
```

---

## Error Handling

### Automatic Retry Logic

Jobs automatically retry on transient errors:

- **Transient errors (RETRY):**
  - Network failures
  - Database connection errors
  - AI API timeouts
  - Rate limits (with exponential backoff)

- **Permanent errors (NO RETRY):**
  - Budget exceeded
  - Invalid input data
  - Validation failures

### Error Classification

```typescript
// Errors are automatically classified in worker
import { classifyJobError, shouldRetryError } from '../types/job.types';

try {
  await processJob();
} catch (error) {
  const errorType = classifyJobError(error);
  const shouldRetry = shouldRetryError(errorType);

  if (!shouldRetry) {
    // Mark as failed immediately
    await markJobAsFailed(jobId, error.message);
  }

  throw error; // BullMQ handles retry
}
```

---

## Production Deployment

### Environment Variables

```bash
# .env.production
NODE_ENV=production
REDIS_URL=redis://production-redis:6379
DATABASE_URL=postgresql://...
ANTHROPIC_API_KEY=sk-...
```

### Process Management (PM2)

```json
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'graphex-api',
      script: 'dist/server.js',
      instances: 2,
      exec_mode: 'cluster',
    },
    {
      name: 'graphex-worker',
      script: 'dist/workers/index.js',
      instances: 1, // Scale based on CPU
      exec_mode: 'fork',
    },
  ],
};
```

### Docker Compose

```yaml
# docker-compose.yml
services:
  api:
    build: .
    command: npm run start
    ports:
      - "4000:4000"
    environment:
      - NODE_ENV=production
    depends_on:
      - redis
      - postgres

  worker:
    build: .
    command: npm run worker
    environment:
      - NODE_ENV=production
    depends_on:
      - redis
      - postgres

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: graphex
      POSTGRES_USER: graphex
      POSTGRES_PASSWORD: secret
```

---

## Testing

### Unit Tests

```typescript
// queue.service.test.ts
import { queueService } from '../services/queue.service';

describe('QueueService', () => {
  it('should add job to queue', async () => {
    const jobId = await queueService.addGraphGenerationJob({
      documentId: 'test',
      documentText: 'Test document',
      documentTitle: 'Test',
    });

    expect(jobId).toBeDefined();
  });

  it('should get job status', async () => {
    const jobId = await queueService.addGraphGenerationJob({...});
    const status = await queueService.getJobStatus(jobId);

    expect(status.state).toMatch(/waiting|active/);
  });
});
```

### Integration Tests

```typescript
// graph-generation.integration.test.ts
describe('Graph Generation Flow', () => {
  it('should complete full generation', async () => {
    // 1. Add job
    const jobId = await queueService.addGraphGenerationJob({...});

    // 2. Wait for completion
    await waitForJobCompletion(jobId, 60000); // 60s timeout

    // 3. Verify result
    const result = await queueService.getJobResult(jobId);
    expect(result.graphId).toBeDefined();
    expect(result.nodeCount).toBeGreaterThan(0);
  });
});
```

---

## Troubleshooting

### Queue Not Processing Jobs

1. **Check worker is running:**
   ```bash
   ps aux | grep worker
   ```

2. **Check Redis connection:**
   ```bash
   redis-cli ping
   ```

3. **Check queue metrics:**
   ```typescript
   const metrics = await queueService.getQueueMetrics();
   console.log(metrics); // Check if jobs are stuck
   ```

### Jobs Taking Too Long

1. **Increase timeout:**
   ```typescript
   // In queue.ts
   export const GRAPH_GENERATION_JOB_CONFIG = {
     timeout: 600000, // 10 minutes instead of 5
   };
   ```

2. **Add more workers:**
   ```typescript
   // In worker.ts
   const WORKER_CONCURRENCY = 4; // Increase from 2
   ```

### High Memory Usage

1. **Clean old jobs regularly:**
   ```typescript
   // Run daily via cron
   await queueService.cleanOldJobs(3600000, 1000); // 1 hour, 1000 jobs
   ```

2. **Enable job removal on completion:**
   ```typescript
   // Already configured in queue.ts
   removeOnComplete: { age: 3600, count: 100 }
   ```

---

## Summary

**Key Files:**
- `src/types/job.types.ts` - Type definitions
- `src/queues/graph-generation.queue.ts` - Queue setup
- `src/workers/graph-generation.worker.ts` - Job processor
- `src/services/queue.service.ts` - Service API
- `src/workers/index.ts` - Worker entry point

**Key Commands:**
- `npm run worker:dev` - Start worker in development
- `npm run dev:all` - Start API + worker together

**Next Steps:**
1. Update graph controller to use queue service
2. Add status endpoint to routes
3. Update frontend to poll for results
4. Test with real documents
5. Monitor queue metrics in production

For questions or issues, check logs or refer to BullMQ documentation: https://docs.bullmq.io/

# Cost Tracker Service Documentation

**Version:** 1.0
**Status:** Production-Ready
**Last Updated:** November 11, 2025
**Criticality:** CRITICAL - Financial Safety System

---

## Table of Contents

1. [Overview](#overview)
2. [Why This Service is Critical](#why-this-service-is-critical)
3. [Architecture](#architecture)
4. [Core Functionality](#core-functionality)
5. [Budget Limits](#budget-limits)
6. [Cost Calculation](#cost-calculation)
7. [Storage Strategy](#storage-strategy)
8. [Integration Guide](#integration-guide)
9. [Testing](#testing)
10. [Monitoring & Alerts](#monitoring--alerts)
11. [Troubleshooting](#troubleshooting)
12. [Future Enhancements](#future-enhancements)

---

## Overview

The Cost Tracker Service is the primary defense mechanism against uncontrolled AI costs. It tracks, limits, and analyzes all AI API usage to prevent financial disaster.

**Key Responsibilities:**
- Budget checks BEFORE expensive operations
- Usage tracking AFTER operations complete
- User-level daily/monthly limits
- Real-time cost monitoring via Redis
- Historical analytics via PostgreSQL
- Automated budget warnings

---

## Why This Service is Critical

### The Problem

Without cost control, AI API usage could bankrupt the project:
- Single large document: $5-10
- Uncontrolled retry loops: $100s in minutes
- Malicious users: unlimited spending
- Forgotten background jobs: continuous drain

### The Solution

This service provides multiple layers of protection:

1. **Proactive Prevention**: Budget checks BEFORE operations
2. **Real-time Tracking**: Redis cache for instant limit checks
3. **Persistent Analytics**: Database for auditing and trends
4. **User-level Limits**: Per-user daily/monthly caps
5. **Document-level Limits**: Single document can't consume entire budget
6. **Automated Alerts**: Warnings at 80% and 90% thresholds

### What Could Go Wrong Without It

**Scenario 1: The Infinite Retry Loop**
```typescript
// WITHOUT cost tracking:
while (!success && attempts < 10) {
  await generateGraph(); // $5 per attempt = $50 wasted
}

// WITH cost tracking:
const check = await costTracker.checkBudget(...);
if (!check.allowed) throw new BudgetExceededError(...);
// Stops after daily limit, saves $40
```

**Scenario 2: The Weekend Bug**
```
Friday 5pm: Deploy bug that retries failed operations infinitely
Weekend: Bug runs unmonitored
Monday 9am: $10,000 AI bill

With Cost Tracker: Stops at $50/month limit, saves $9,950
```

**Scenario 3: The Viral Document**
```
Popular document shared on social media
1000 users process same document
Without limits: 1000 × $5 = $5,000
With limits: 1000 × $0.10 (cached) = $100
```

---

## Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────┐
│                 CLIENT REQUEST                       │
│          "Generate knowledge graph"                  │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│           COST TRACKER SERVICE                       │
│         checkBudget(operation)                       │
└──────────────┬────────────────────────────┬─────────┘
               │                            │
               ▼                            ▼
        ┌─────────────┐           ┌──────────────┐
        │   REDIS     │           │  POSTGRES    │
        │  (Cache)    │           │ (Analytics)  │
        └──────┬──────┘           └──────┬───────┘
               │                         │
               ▼                         ▼
        Get today's usage         Get historical usage
        Get month's usage         Calculate trends
               │                         │
               ▼                         ▼
        [Fast: ~5ms]              [Slower: ~50ms]
               │                         │
               └────────┬────────────────┘
                        │
                        ▼
             ┌──────────────────────┐
             │  BUDGET DECISION      │
             │  allowed: true/false  │
             └──────────┬────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               │               ▼
   ALLOWED         NOT ALLOWED     THRESHOLD
   Continue        Block           Warning
   Operation       Operation       Alert User
        │               │               │
        ▼               ▼               ▼
┌──────────────┐  ┌──────────┐  ┌────────────┐
│ AI Operation │  │  Error   │  │ Send Alert │
│  Executes    │  │ Response │  │ (Optional) │
└──────┬───────┘  └──────────┘  └────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│         COST TRACKER SERVICE                         │
│         recordUsage(actual cost)                     │
└──────────────┬────────────────────────────┬─────────┘
               │                            │
               ▼                            ▼
        ┌─────────────┐           ┌──────────────┐
        │   REDIS     │           │  POSTGRES    │
        │  Update     │           │   Insert     │
        │   Cache     │           │   Record     │
        └─────────────┘           └──────────────┘
```

### Data Flow

1. **Budget Check (before operation)**
   - Check Redis cache for today's/month's usage
   - If cache miss, query database
   - Calculate estimated cost for operation
   - Compare usage + estimate vs. limits
   - Return decision: allow/deny

2. **Usage Recording (after operation)**
   - Calculate actual cost from tokens used
   - Insert record to PostgreSQL
   - Update Redis cache (increment counters)
   - Check if approaching thresholds
   - Send alerts if needed

---

## Core Functionality

### 1. Budget Checking

**When to use:** ALWAYS before expensive AI operations

```typescript
import { costTrackerService } from './services/cost-tracker.service';
import { BudgetExceededError } from './lib/errors/budget-errors';

async function generateGraph(documentId: string, userId: string) {
  // CRITICAL: Check budget FIRST
  const budgetCheck = await costTrackerService.checkBudget({
    userId,
    operation: 'graph-generation',
    documentId,
  });

  if (!budgetCheck.allowed) {
    throw new BudgetExceededError(
      budgetCheck.reason!,
      budgetCheck.currentUsage,
      budgetCheck.estimatedCost,
      10.0, // Daily limit
      budgetCheck.resetAt
    );
  }

  // Budget approved - proceed with AI operation
  const graph = await aiService.generateGraph(documentId);

  // Record actual usage (see below)
  await recordGraphGeneration(graph);
}
```

**Response when allowed:**
```json
{
  "allowed": true,
  "estimatedCost": 0.58,
  "currentUsage": {
    "today": 3.42,
    "thisMonth": 18.20
  }
}
```

**Response when denied:**
```json
{
  "allowed": false,
  "reason": "daily-limit-exceeded",
  "estimatedCost": 0.58,
  "currentUsage": {
    "today": 9.50,
    "thisMonth": 45.30
  },
  "resetAt": "2025-11-12T00:00:00.000Z",
  "upgradeOption": "premium-tier"
}
```

### 2. Usage Recording

**When to use:** ALWAYS after AI operations complete (success or failure)

```typescript
import { costTrackerService } from './services/cost-tracker.service';

async function recordGraphGeneration(result: {
  tokensUsed: { input: number; output: number };
  success: boolean;
  attempts: number;
  quality?: number;
  documentId: string;
  graphId?: string;
}) {
  const cost = costTrackerService.calculateCost(
    result.tokensUsed,
    'claude-sonnet-4'
  );

  await costTrackerService.recordUsage({
    userId: currentUser.id,
    operation: 'graph-generation',
    model: 'claude-sonnet-4',
    tokensUsed: result.tokensUsed,
    cost,
    quality: result.quality,
    attempts: result.attempts,
    success: result.success,
    documentId: result.documentId,
    graphId: result.graphId,
  });
}
```

### 3. Usage Analytics

**Get user summary:**
```typescript
// Daily summary
const dailySummary = await costTrackerService.getUserSummary(userId, 'day');
console.log(`Today's cost: $${dailySummary.totalCost.toFixed(2)}`);
console.log(`Operations: ${dailySummary.operationCount}`);
console.log(`Average: $${dailySummary.averageCostPerOperation.toFixed(3)}`);

// Monthly summary
const monthlySummary = await costTrackerService.getUserSummary(userId, 'month');
```

**Get cost breakdown:**
```typescript
const breakdown = await costTrackerService.getCostBreakdown(userId, 'month');

breakdown.forEach(item => {
  console.log(`${item.operation}: $${item.totalCost.toFixed(2)} (${item.percentage.toFixed(1)}%)`);
});

// Example output:
// graph-generation: $15.40 (65.2%)
// connection-explanation: $5.20 (22.0%)
// quiz-generation: $3.00 (12.7%)
```

---

## Budget Limits

### Free Tier (Default)

```typescript
{
  perDocument: 5.0,      // Max $5 per single document
  perUserPerDay: 10.0,   // Max $10 per user per day
  perUserPerMonth: 50.0, // Max $50 per user per month
}
```

**Rationale:**

- **$5 per document**: Prevents single large document from consuming daily budget
  - Typical document: $0.50-$2.00
  - Large document (100 pages): $3-5
  - Blocks extremely large documents

- **$10 per day**: Allows 2-3 medium documents or 10-20 smaller operations
  - Prevents abuse while allowing normal usage
  - Resets daily at midnight UTC

- **$50 per month**: ~100-150 operations per month
  - Suitable for personal use
  - Encourages upgrade for heavy users

### Warning Thresholds

```typescript
{
  daily: 0.8,   // Warn at 80% ($8 of $10)
  monthly: 0.9, // Warn at 90% ($45 of $50)
}
```

**Why these thresholds:**
- Daily (80%): User still has buffer to complete current work
- Monthly (90%): Advance warning before hitting limit
- Gives users time to upgrade before blocking

### Custom Limits (Pro Tier)

```typescript
const proService = createCostTrackerService(prisma, redis, {
  limits: {
    perDocument: 20.0,
    perUserPerDay: 100.0,
    perUserPerMonth: 500.0,
  },
});
```

---

## Cost Calculation

### Pricing Table

Based on November 2024 pricing:

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|------------------------|
| claude-sonnet-4 | $3.00 | $15.00 |
| claude-haiku | $0.25 | $1.25 |
| gpt-4-turbo | $10.00 | $30.00 |
| gpt-4-vision | $10.00 | $30.00 |

### Example Calculations

**Small operation (connection explanation):**
```
Input:  2,400 tokens × $3.00/1M  = $0.0072
Output:   600 tokens × $15.00/1M = $0.009
Total: $0.0162 (~$0.02)
```

**Medium operation (quiz generation):**
```
Input:  4,000 tokens × $3.00/1M  = $0.012
Output: 1,000 tokens × $15.00/1M = $0.015
Total: $0.027 (~$0.03)
```

**Large operation (graph generation):**
```
Input:  12,000 tokens × $3.00/1M  = $0.036
Output:  3,000 tokens × $15.00/1M = $0.045
Total: $0.081 (~$0.08)
```

**Very large document (100 pages):**
```
Input:  150,000 tokens × $3.00/1M  = $0.45
Output:   5,000 tokens × $15.00/1M = $0.075
Total: $0.525 (~$0.53)
```

### Estimation vs. Actual

- **Before operation**: Estimate based on typical token usage
- **After operation**: Calculate from actual tokens consumed
- **Variance**: ±20% typical (conservative estimates)

---

## Storage Strategy

### Dual Storage Architecture

**Why both Redis and PostgreSQL?**

1. **Redis (Cache Layer)**
   - Purpose: Real-time budget checks
   - Speed: ~5ms per check
   - Data: Current day/month usage totals
   - TTL: 1 hour (balance freshness vs. load)
   - Failure mode: Fall back to database

2. **PostgreSQL (Persistent Layer)**
   - Purpose: Analytics, auditing, compliance
   - Speed: ~50ms per query
   - Data: Every operation with full details
   - Retention: Indefinite (or per policy)
   - Failure mode: Operations continue (fail open)

### Cache Keys

```typescript
// Daily usage
`usage:${userId}:${YYYY-MM-DD}`
Example: "usage:user123:2025-11-11"

// Monthly usage
`usage:${userId}:${YYYY-MM}`
Example: "usage:user123:2025-11"
```

### Cache Updates

**Increment pattern (atomic operations):**
```typescript
// After recording usage
await redis.incrbyfloat(`usage:${userId}:${today}`, actualCost);
await redis.incrbyfloat(`usage:${userId}:${month}`, actualCost);
```

**Why INCRBYFLOAT:**
- Atomic operation (no race conditions)
- Handles concurrent requests safely
- Precise decimal arithmetic for currency

### Database Schema

```sql
CREATE TABLE ai_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  operation TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  cost DOUBLE PRECISION NOT NULL,
  quality_score INTEGER,
  attempts INTEGER DEFAULT 1,
  success BOOLEAN DEFAULT true,
  document_id TEXT,
  graph_id TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_user_timestamp (user_id, timestamp),
  INDEX idx_operation (operation),
  INDEX idx_timestamp (timestamp)
);
```

**Index rationale:**
- `user_id + timestamp`: Fast daily/monthly aggregations
- `operation`: Cost breakdown queries
- `timestamp`: Trend analysis, cleanup queries

---

## Integration Guide

### Step 1: Initialize Service

```typescript
// src/config/cost-tracking.ts
import { prisma } from './database';
import { redisClient } from './redis';
import { createCostTrackerService } from '../services/cost-tracker.service';

export const costTrackerService = createCostTrackerService(
  prisma,
  redisClient
);
```

### Step 2: Integrate into AI Orchestrator

```typescript
// src/services/ai-orchestrator.service.ts
import { costTrackerService } from '../config/cost-tracking';

export class AIOrchestrator {
  async generateGraph(documentId: string, userId: string) {
    // 1. CHECK BUDGET FIRST
    const budgetCheck = await costTrackerService.checkBudget({
      userId,
      operation: 'graph-generation',
      documentId,
    });

    if (!budgetCheck.allowed) {
      throw new BudgetExceededError(/* ... */);
    }

    // 2. PERFORM OPERATION
    let tokensUsed = { input: 0, output: 0 };
    let success = false;
    let attempts = 1;

    try {
      const result = await this.callClaudeAPI(/* ... */);
      tokensUsed = result.usage;
      success = true;
      return result.graph;
    } catch (error) {
      attempts = this.retryCount;
      throw error;
    } finally {
      // 3. RECORD USAGE (always, even on failure)
      const cost = costTrackerService.calculateCost(
        tokensUsed,
        'claude-sonnet-4'
      );

      await costTrackerService.recordUsage({
        userId,
        operation: 'graph-generation',
        model: 'claude-sonnet-4',
        tokensUsed,
        cost,
        attempts,
        success,
        documentId,
      });
    }
  }
}
```

### Step 3: Handle Budget Errors in API

```typescript
// src/middleware/error-handler.ts
import { BudgetExceededError } from '../lib/errors/budget-errors';

export function errorHandler(err, req, res, next) {
  if (err instanceof BudgetExceededError) {
    return res.status(429).json({
      success: false,
      error: {
        code: 'BUDGET_EXCEEDED',
        message: err.message,
        details: {
          reason: err.reason,
          currentUsage: err.currentUsage,
          estimatedCost: err.estimatedCost,
          limit: err.limit,
          resetAt: err.resetAt,
        },
      },
    });
  }

  // Handle other errors...
}
```

### Step 4: Add Usage Dashboard Endpoint

```typescript
// src/routes/usage.route.ts
import { Router } from 'express';
import { costTrackerService } from '../config/cost-tracking';

const router = Router();

router.get('/usage/summary', async (req, res) => {
  const userId = req.user.id;
  const period = req.query.period || 'month';

  const summary = await costTrackerService.getUserSummary(
    userId,
    period as 'day' | 'month'
  );

  res.json({ success: true, data: summary });
});

router.get('/usage/breakdown', async (req, res) => {
  const userId = req.user.id;
  const breakdown = await costTrackerService.getCostBreakdown(userId, 'month');

  res.json({ success: true, data: breakdown });
});

export default router;
```

---

## Testing

### Test Coverage Goals

- **Budget checks**: 90%+ coverage (CRITICAL path)
- **Usage recording**: 85%+ coverage
- **Analytics**: 80%+ coverage
- **Error handling**: 95%+ coverage

### Running Tests

```bash
# Run all cost tracking tests
npm test -- cost-tracker.service.test.ts

# Run with coverage
npm test -- --coverage cost-tracker.service.test.ts

# Run specific test suite
npm test -- -t "Budget Checks"
```

### Key Test Scenarios

1. **Budget enforcement works**
   - ✅ Allows operations within budget
   - ✅ Blocks daily limit exceeded
   - ✅ Blocks monthly limit exceeded
   - ✅ Blocks document limit exceeded

2. **Usage recording accurate**
   - ✅ Records to database
   - ✅ Updates Redis cache
   - ✅ Calculates cost correctly
   - ✅ Handles failed operations

3. **Edge cases handled**
   - ✅ New users (no history)
   - ✅ Anonymous users (MVP)
   - ✅ Invalid data rejected
   - ✅ Unknown models rejected

4. **Integration flows**
   - ✅ Complete operation lifecycle
   - ✅ Multi-user isolation
   - ✅ Concurrent operations safe

---

## Monitoring & Alerts

### Key Metrics to Track

**Cost Metrics:**
```typescript
// Total cost per day
sum(ai_usage.cost WHERE timestamp >= today)

// Cost per operation type
sum(ai_usage.cost) GROUP BY operation

// Average cost per user
avg(daily_user_cost)

// Cost trend (daily)
sum(cost) GROUP BY date(timestamp)
```

**Usage Metrics:**
```typescript
// Operations per day
count(ai_usage) WHERE timestamp >= today

// Success rate
(count WHERE success = true) / count(*) * 100

// Average attempts per operation
avg(attempts)

// Token efficiency
avg(total_tokens) / avg(cost)
```

**User Metrics:**
```typescript
// Users hitting limits
count(DISTINCT user_id WHERE cost >= limit)

// Power users (top 10%)
SELECT user_id, sum(cost) ORDER BY sum(cost) DESC LIMIT 10%

// New vs. returning users
count(DISTINCT user_id WHERE first_operation = today)
```

### Alert Conditions

**CRITICAL Alerts (PagerDuty):**
- Budget enforcement failed (user exceeded limit)
- Cost spike: >2x daily average
- Redis connection lost (can't check budgets)
- Database write failures (can't record usage)

**WARNING Alerts (Slack):**
- User approaching monthly limit (>90%)
- Unusual cost pattern detected
- Cache hit rate < 50%
- Average operation cost > expected

**INFO Logs:**
- Budget check denied (normal operation)
- User threshold warning sent
- Cache miss (query fallback)

### Dashboard Queries

```sql
-- Today's total cost
SELECT SUM(cost) as total_cost
FROM ai_usage
WHERE timestamp >= CURRENT_DATE;

-- Cost by operation (last 30 days)
SELECT
  operation,
  COUNT(*) as count,
  SUM(cost) as total_cost,
  AVG(cost) as avg_cost,
  SUM(cost) / (SELECT SUM(cost) FROM ai_usage WHERE timestamp >= CURRENT_DATE - INTERVAL '30 days') * 100 as percentage
FROM ai_usage
WHERE timestamp >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY operation
ORDER BY total_cost DESC;

-- Top 10 expensive documents
SELECT
  document_id,
  COUNT(*) as operations,
  SUM(cost) as total_cost
FROM ai_usage
WHERE document_id IS NOT NULL
GROUP BY document_id
ORDER BY total_cost DESC
LIMIT 10;

-- Users near limits
SELECT
  user_id,
  SUM(CASE WHEN timestamp >= CURRENT_DATE THEN cost ELSE 0 END) as today_cost,
  SUM(cost) as month_cost,
  10.0 - SUM(CASE WHEN timestamp >= CURRENT_DATE THEN cost ELSE 0 END) as daily_remaining
FROM ai_usage
WHERE timestamp >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY user_id
HAVING SUM(CASE WHEN timestamp >= CURRENT_DATE THEN cost ELSE 0 END) > 8.0
ORDER BY today_cost DESC;
```

---

## Troubleshooting

### Issue: Budget checks failing with "Cost Tracking Error"

**Symptoms:**
- Budget checks throw CostTrackingError
- Users unable to perform operations

**Possible causes:**
1. Redis connection lost
2. Database connection lost
3. Network timeout

**Diagnosis:**
```typescript
// Check Redis health
await redis.ping(); // Should return 'PONG'

// Check database health
await prisma.$queryRaw`SELECT 1`;

// Check service logs
grep "Cost tracking failed" logs/app.log
```

**Solution:**
- Verify Redis/DB connections
- Check network connectivity
- Review connection pool settings
- Consider implementing circuit breaker

### Issue: Cache hit rate low

**Symptoms:**
- Slow budget checks (>50ms)
- High database load
- Cache hit rate < 50%

**Diagnosis:**
```bash
# Check Redis stats
redis-cli INFO stats | grep keyspace

# Check TTL settings
redis-cli TTL "usage:user123:2025-11-11"

# Monitor cache hits/misses
redis-cli MONITOR | grep usage:
```

**Solution:**
- Increase cache TTL (default: 1 hour)
- Warm cache for active users
- Pre-fetch usage on login
- Check Redis memory limits

### Issue: Users hitting limits unexpectedly

**Symptoms:**
- Users complain about hitting limits
- Limits don't match expectations
- Costs higher than expected

**Diagnosis:**
```sql
-- Check user's recent usage
SELECT
  operation,
  model,
  cost,
  timestamp,
  success,
  attempts
FROM ai_usage
WHERE user_id = 'user123'
  AND timestamp >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY timestamp DESC
LIMIT 50;

-- Check for retry loops
SELECT
  operation,
  AVG(attempts) as avg_attempts,
  MAX(attempts) as max_attempts,
  COUNT(*) as count
FROM ai_usage
WHERE user_id = 'user123'
GROUP BY operation;
```

**Solution:**
- Review retry logic (may be too aggressive)
- Check for failed operations being re-attempted
- Verify cost estimates are accurate
- Consider adjusting limits for specific users

### Issue: Cost calculations incorrect

**Symptoms:**
- Recorded costs don't match AI API bills
- Variance > 20%

**Diagnosis:**
```sql
-- Compare estimated vs. actual
SELECT
  operation,
  model,
  AVG(cost) as avg_cost,
  AVG(total_tokens) as avg_tokens,
  AVG(cost / total_tokens * 1000000) as cost_per_million
FROM ai_usage
GROUP BY operation, model;

-- Check for pricing mismatches
SELECT DISTINCT model FROM ai_usage;
```

**Solution:**
- Update pricing table if rates changed
- Verify token counts are accurate
- Check for model name mismatches
- Review cost calculation logic

---

## Future Enhancements

### Phase 2: Advanced Features

1. **Predictive Budgeting**
   - Predict when user will hit monthly limit
   - Suggest optimal document distribution
   - Recommend upgrade timing

2. **Cost Optimization Suggestions**
   - Identify inefficient operations
   - Suggest cheaper models for simple tasks
   - Recommend batch processing

3. **Tier Management**
   - Automatic tier upgrades
   - Trial period tracking
   - Custom limits per organization

4. **Advanced Analytics**
   - Cost forecasting
   - Anomaly detection
   - ROI per document type

### Phase 3: Enterprise Features

1. **Multi-tenant Support**
   - Organization-level limits
   - Team budgets
   - Cost allocation

2. **Billing Integration**
   - Stripe integration
   - Invoice generation
   - Usage-based pricing

3. **Compliance & Auditing**
   - Detailed audit logs
   - Cost attribution
   - Regulatory reporting

4. **Performance Optimization**
   - Distributed Redis cluster
   - Read replicas for analytics
   - Archive old usage data

---

## Quick Reference

### Essential Code Snippets

**Before AI operation:**
```typescript
const check = await costTrackerService.checkBudget({
  userId,
  operation: 'graph-generation',
  documentId,
});

if (!check.allowed) {
  throw new BudgetExceededError(/* ... */);
}
```

**After AI operation:**
```typescript
const cost = costTrackerService.calculateCost(tokensUsed, model);
await costTrackerService.recordUsage({
  userId,
  operation,
  model,
  tokensUsed,
  cost,
  attempts,
  success,
});
```

**Get usage summary:**
```typescript
const summary = await costTrackerService.getUserSummary(userId, 'month');
console.log(`Cost: $${summary.totalCost.toFixed(2)}`);
```

### Important Constants

- Daily limit: $10
- Monthly limit: $50
- Document limit: $5
- Daily warning: 80% ($8)
- Monthly warning: 90% ($45)
- Cache TTL: 3600 seconds (1 hour)

### Related Files

- Service: `src/services/cost-tracker.service.ts`
- Types: `src/types/cost-tracking.types.ts`
- Errors: `src/lib/errors/budget-errors.ts`
- Schema: `prisma/schema.prisma` (AIUsage model)
- Tests: `src/services/__tests__/cost-tracker.service.test.ts`
- Migration: `prisma/migrations/*/add_ai_usage_tracking`

---

**Last Updated:** November 11, 2025
**Maintained By:** Backend Team
**Questions:** See TECHNICAL.md or contact maintainers

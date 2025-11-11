# Graphex Prisma Database Setup - Complete Guide

This document provides step-by-step instructions for setting up and using the Prisma database for the Graphex Knowledge Graph Learning Platform.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Initial Setup](#initial-setup)
4. [Database Schema](#database-schema)
5. [Running Migrations](#running-migrations)
6. [Seeding the Database](#seeding-the-database)
7. [Using Prisma Client](#using-prisma-client)
8. [Common Operations](#common-operations)
9. [Troubleshooting](#troubleshooting)

---

## Overview

The Graphex database is built with:
- **PostgreSQL 15+**: Primary database
- **Prisma 5+**: Modern TypeScript ORM
- **Database Design**: Follows specifications in `META/Core/TECHNICAL.md`

### Architecture
```
Documents → Graphs → Nodes + Edges
                  ↓
            Quiz Questions
                  ↓
              Notes (optional)
```

---

## Prerequisites

Before starting, ensure you have:

1. **Node.js 20+** installed
   ```bash
   node --version  # Should be 20.0.0 or higher
   ```

2. **PostgreSQL 15+** installed and running
   - Option A: Local installation
   - Option B: Docker container (recommended for development)

3. **npm or yarn** package manager

---

## Initial Setup

### Step 1: Install Dependencies

```bash
# Install all dependencies including Prisma
npm install
```

This installs:
- `@prisma/client`: Prisma Client for database queries
- `prisma`: Prisma CLI for migrations and development

### Step 2: Start PostgreSQL

**Option A: Using Docker (Recommended)**

```bash
# Start PostgreSQL container
docker run --name graphex-postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=graphex_dev \
  -p 5432:5432 \
  -d postgres:15

# Verify it's running
docker ps | grep graphex-postgres
```

**Option B: Local PostgreSQL**

Ensure PostgreSQL service is running:
```bash
# macOS
brew services start postgresql@15

# Linux
sudo systemctl start postgresql

# Windows
# Start PostgreSQL service from Services app
```

### Step 3: Configure Environment Variables

Create `.env.development` from the example:

```bash
cp .env.example .env.development
```

Edit `.env.development` with your database connection:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/graphex_dev?schema=public"
```

**Connection String Format:**
```
postgresql://[user]:[password]@[host]:[port]/[database]?schema=[schema]
```

### Step 4: Generate Prisma Client

```bash
npm run prisma:generate
```

This command:
- Reads `prisma/schema.prisma`
- Generates TypeScript types
- Creates Prisma Client in `node_modules/@prisma/client`

### Step 5: Run Initial Migration

```bash
npm run prisma:migrate
```

When prompted for a migration name, use: `init`

This will:
- Create all database tables
- Apply indexes and constraints
- Generate migration files in `prisma/migrations/`

### Step 6: Seed the Database

```bash
npm run prisma:seed
```

This populates your database with realistic sample data:
- 6 documents (various types and statuses)
- 4 knowledge graphs
- 28 nodes across graphs
- Multiple edges with relationships
- Sample notes and quiz questions

**Seed Summary:**
```
✅ 6 documents created
✅ 4 graphs generated
✅ 28 nodes defined
✅ Multiple edges connected
✅ 5 notes added
✅ 15+ quiz questions created
```

---

## Database Schema

### Core Tables

#### 1. Documents
Stores uploaded documents and extracted content.

**Key Fields:**
- `id` (UUID): Primary key
- `title`: Document title
- `contentText`: Full extracted text
- `sourceType`: pdf | text | markdown | url
- `status`: processing | ready | failed
- `filePath`: S3 key or local path
- `sourceUrl`: Original URL (for web documents)

**Indexes:**
- `status` - for filtering by processing state
- `createdAt` - for chronological queries

#### 2. Graphs
Knowledge graphs generated from documents.

**Key Fields:**
- `id` (UUID): Primary key
- `documentId` (FK): References document
- `mermaidCode`: Generated Mermaid syntax
- `layoutConfig` (JSONB): Node positions and styling
- `generationModel`: AI model used (e.g., "claude-sonnet-4")
- `status`: generating | ready | failed

**Indexes:**
- `documentId` - for document → graphs queries
- `status` - for filtering by generation state

#### 3. Nodes
Individual concepts in knowledge graphs.

**Key Fields:**
- `id` (UUID): Primary key
- `graphId` (FK): References graph
- `nodeKey`: Unique identifier within graph (e.g., "A", "B")
- `title`: Display label
- `contentSnippet`: Brief description
- `documentRefs` (JSONB): References to source text
- `positionX`, `positionY`: Layout coordinates
- `metadata` (JSONB): Color, importance, tags

**Indexes:**
- `graphId` - for graph → nodes queries
- `[graphId, nodeKey]` - unique constraint

#### 4. Edges
Connections between nodes.

**Key Fields:**
- `id` (UUID): Primary key
- `graphId` (FK): References graph
- `fromNodeId` (FK): Source node
- `toNodeId` (FK): Target node
- `relationship`: Type of connection (e.g., "supports", "leads_to")
- `aiExplanation`: Cached AI-generated explanation
- `strength`: Confidence score (0-1)
- `metadata` (JSONB): Additional properties

**Indexes:**
- `graphId` - for graph → edges queries
- `[fromNodeId, toNodeId]` - for relationship lookups
- `[graphId, fromNodeId, toNodeId]` - unique constraint

#### 5. Notes (Optional for MVP)
User annotations on graphs, nodes, or edges.

**Key Fields:**
- `id` (UUID): Primary key
- `graphId` (FK): Always present
- `nodeId` (FK): Optional - if note on node
- `edgeId` (FK): Optional - if note on edge
- `content`: Note text

#### 6. Quiz Questions
AI-generated comprehension questions.

**Key Fields:**
- `id` (UUID): Primary key
- `graphId` (FK): References graph
- `questionText`: The question
- `options` (JSONB): Array of answer choices
- `correctAnswer`: Index of correct option (0-based)
- `explanation`: Explanation of answer
- `difficulty`: easy | medium | hard
- `nodeRefs` (JSONB): Which nodes are tested

---

## Running Migrations

### Creating New Migrations

When you modify `prisma/schema.prisma`:

```bash
# Generate and apply migration
npm run prisma:migrate

# You'll be prompted for a name
# Use descriptive names like: add_user_authentication
```

### Migration Best Practices

**Good Migration Names:**
```
add_quiz_difficulty_field
create_user_auth_tables
add_graph_version_index
remove_deprecated_status
```

**Avoid:**
```
update        # Too vague
fix           # Not descriptive
changes       # Unclear
migration_1   # Use semantic names
```

### Reviewing Migrations

Always check generated SQL before applying:

```bash
# Migrations are in: prisma/migrations/[timestamp]_[name]/migration.sql
cat prisma/migrations/20251111_add_quiz_difficulty/migration.sql
```

### Production Deployment

```bash
# Apply migrations without interactive prompts
npm run prisma:deploy
```

---

## Seeding the Database

### Running the Seed Script

```bash
npm run prisma:seed
```

### What Gets Seeded

The seed script creates:

1. **6 Sample Documents:**
   - Machine Learning PDF (ready)
   - Climate Change text file (ready)
   - Database Design markdown (ready)
   - Quantum Computing URL (ready)
   - Large research paper (processing)
   - Encrypted PDF (failed)

2. **4 Knowledge Graphs:**
   - ML graph (7 nodes, ready)
   - Climate graph (9 nodes, ready)
   - Database graph (12 nodes, ready)
   - Quantum graph (generating)

3. **28 Nodes** with realistic content and metadata

4. **Multiple Edges** with relationships and AI explanations

5. **5 Notes** on various nodes and edges

6. **15+ Quiz Questions** across different difficulties

### Customizing Seed Data

Edit `prisma/seed.ts` to modify seed data:

```typescript
// Add your own documents
const customDoc = await prisma.document.create({
  data: {
    title: 'Your Document Title',
    contentText: 'Your content here...',
    sourceType: SourceType.pdf,
    status: DocumentStatus.ready,
  },
});
```

### Resetting the Database

To completely reset and re-seed:

```bash
# WARNING: This deletes ALL data
npx prisma migrate reset

# Confirm when prompted
# Database will be reset and re-seeded automatically
```

---

## Using Prisma Client

### Basic Setup

The Prisma Client is configured as a singleton in `src/config/database.ts`:

```typescript
import { prisma } from '@/config/database';

// Now use prisma throughout your application
const documents = await prisma.document.findMany();
```

### Common Query Patterns

#### Create Operations

```typescript
// Create a single document
const document = await prisma.document.create({
  data: {
    title: 'New Document',
    contentText: 'Content here...',
    sourceType: 'pdf',
    status: 'processing',
  },
});

// Create with relations
const graph = await prisma.graph.create({
  data: {
    documentId: document.id,
    mermaidCode: 'graph TD\n  A --> B',
    generationModel: 'claude-sonnet-4',
    status: 'ready',
  },
});

// Create many (batch insert)
await prisma.node.createMany({
  data: [
    { graphId: graph.id, nodeKey: 'A', title: 'Concept 1' },
    { graphId: graph.id, nodeKey: 'B', title: 'Concept 2' },
  ],
});
```

#### Read Operations

```typescript
// Find by ID
const document = await prisma.document.findUnique({
  where: { id: documentId },
});

// Find with filters
const readyDocuments = await prisma.document.findMany({
  where: { status: 'ready' },
  orderBy: { createdAt: 'desc' },
  take: 10,
});

// Find with relations (eager loading)
const graph = await prisma.graph.findUnique({
  where: { id: graphId },
  include: {
    nodes: true,
    edges: {
      include: {
        fromNode: true,
        toNode: true,
      },
    },
  },
});

// Select specific fields only
const graphs = await prisma.graph.findMany({
  select: {
    id: true,
    mermaidCode: true,
    document: {
      select: { id: true, title: true },
    },
  },
});
```

#### Update Operations

```typescript
// Update single record
await prisma.document.update({
  where: { id: documentId },
  data: {
    status: 'ready',
    contentText: extractedText,
  },
});

// Update many
await prisma.document.updateMany({
  where: { status: 'processing' },
  data: { status: 'failed' },
});

// Upsert (create or update)
await prisma.document.upsert({
  where: { id: documentId },
  create: { /* create data */ },
  update: { /* update data */ },
});
```

#### Delete Operations

```typescript
// Delete single
await prisma.document.delete({
  where: { id: documentId },
});

// Delete many
await prisma.document.deleteMany({
  where: { status: 'failed' },
});

// Cascade deletes are automatic
// Deleting a graph deletes all its nodes, edges, notes, and quiz questions
```

#### Transactions

```typescript
// Sequential transaction
await prisma.$transaction([
  prisma.document.create({ data: docData }),
  prisma.graph.create({ data: graphData }),
]);

// Interactive transaction
await prisma.$transaction(async (tx) => {
  const doc = await tx.document.create({ data: docData });
  const graph = await tx.graph.create({
    data: { ...graphData, documentId: doc.id },
  });
  return { doc, graph };
});
```

### Working with JSONB Fields

#### Node Document References

```typescript
const node = await prisma.node.create({
  data: {
    graphId: graphId,
    nodeKey: 'A',
    title: 'Machine Learning',
    documentRefs: [
      {
        start: 0,
        end: 150,
        text: 'Machine Learning is a subset of AI...',
      },
    ],
  },
});
```

#### Graph Layout Config

```typescript
await prisma.graph.update({
  where: { id: graphId },
  data: {
    layoutConfig: {
      layout: 'dagre',
      direction: 'TB',
      nodeSpacing: 100,
      rankSpacing: 150,
    },
  },
});
```

#### Querying JSONB

```typescript
// Filter by JSONB field
const nodes = await prisma.node.findMany({
  where: {
    metadata: {
      path: ['importance'],
      equals: 'high',
    },
  },
});
```

---

## Common Operations

### Health Check

Test database connectivity:

```typescript
import { testDatabaseConnection } from '@/config/database';

const isConnected = await testDatabaseConnection();
console.log('Database connected:', isConnected);
```

### Prisma Studio

Visual database browser:

```bash
npm run prisma:studio
```

Opens at `http://localhost:5555`

### Database Stats

```typescript
import { getDatabaseStats } from '@/config/database';

const stats = await getDatabaseStats();
console.log('Database metrics:', stats);
```

### Schema Validation

Ensure schema matches database:

```bash
npx prisma validate
```

### Format Schema

Auto-format `schema.prisma`:

```bash
npx prisma format
```

---

## Troubleshooting

### Issue: "Migration failed with error"

**Solution:**
```bash
# Mark migration as applied if it actually succeeded
npx prisma migrate resolve --applied <migration_name>

# Or mark as rolled back
npx prisma migrate resolve --rolled-back <migration_name>
```

### Issue: "Prisma Client out of sync"

**Solution:**
```bash
npm run prisma:generate
```

### Issue: "Can't reach database server"

**Check:**
1. PostgreSQL is running: `docker ps` or `pg_isready`
2. Connection string is correct in `.env.development`
3. Port 5432 is not blocked

**Solution:**
```bash
# Restart PostgreSQL
docker restart graphex-postgres

# Or restart local service
brew services restart postgresql@15
```

### Issue: "Too many clients already"

**Cause:** Connection pool exhausted

**Solution:**
- Ensure you're using the singleton Prisma Client from `src/config/database.ts`
- Don't create new `PrismaClient()` instances
- Add connection limit to DATABASE_URL:
  ```
  postgresql://...?connection_limit=10
  ```

### Issue: Seed script fails

**Solution:**
```bash
# Reset database completely
npx prisma migrate reset

# Re-run seed
npm run prisma:seed
```

### Issue: Type errors after schema changes

**Solution:**
```bash
# Regenerate Prisma Client
npm run prisma:generate

# Restart TypeScript server in your IDE
```

---

## Performance Tips

### Query Optimization

```typescript
// ❌ Bad: N+1 query problem
const graphs = await prisma.graph.findMany();
for (const graph of graphs) {
  const nodes = await prisma.node.findMany({ where: { graphId: graph.id } });
}

// ✅ Good: Eager loading
const graphs = await prisma.graph.findMany({
  include: { nodes: true },
});

// ✅ Better: Select only needed fields
const graphs = await prisma.graph.findMany({
  select: {
    id: true,
    mermaidCode: true,
    nodes: { select: { id: true, title: true } },
  },
});
```

### Batch Operations

```typescript
// ❌ Bad: Multiple individual inserts
for (const nodeData of nodesArray) {
  await prisma.node.create({ data: nodeData });
}

// ✅ Good: Batch insert
await prisma.node.createMany({ data: nodesArray });
```

### Indexes

The schema includes strategic indexes. Add more if needed:

```prisma
model Document {
  // ...fields
  @@index([sourceType, status]) // Composite index
}
```

---

## Additional Resources

- **Prisma Documentation**: https://www.prisma.io/docs
- **PostgreSQL Docs**: https://www.postgresql.org/docs/
- **Project Technical Design**: `META/Core/TECHNICAL.md`
- **Development Principles**: `META/Core/REGULATION.md`
- **Prisma Directory README**: `prisma/README.md`

---

## Quick Reference Commands

```bash
# Setup
npm install                    # Install dependencies
npm run prisma:generate        # Generate Prisma Client
npm run prisma:migrate         # Create and apply migration
npm run prisma:seed            # Seed database

# Development
npm run prisma:studio          # Open visual database browser
npx prisma format              # Format schema
npx prisma validate            # Validate schema

# Production
npm run prisma:deploy          # Apply migrations

# Maintenance
npx prisma migrate reset       # Reset database (WARNING: deletes data)
npx prisma db push             # Push schema without migration (dev only)
```

---

**Version:** 1.0
**Last Updated:** November 11, 2025
**Maintainer:** Graphex Team

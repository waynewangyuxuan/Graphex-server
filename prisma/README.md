# Prisma Database Documentation

This directory contains all database-related files for the Graphex Knowledge Graph Learning Platform.

## Contents

- **schema.prisma**: The complete database schema definition
- **seed.ts**: Database seeding script with sample data
- **migrations/**: Database migration history (auto-generated)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Copy `.env.example` to `.env.development` and configure your database URL:

```bash
cp .env.example .env.development
```

Edit `.env.development`:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/graphex_dev?schema=public"
```

### 3. Start PostgreSQL

Using Docker:
```bash
docker run --name graphex-postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=graphex_dev \
  -p 5432:5432 \
  -d postgres:15
```

Or use your local PostgreSQL installation.

### 4. Create Initial Migration

```bash
npm run prisma:migrate
```

This will:
- Create the database tables
- Generate Prisma Client
- Apply the schema to your database

### 5. Seed the Database

```bash
npm run prisma:seed
```

This populates your database with:
- 6 sample documents (various statuses and types)
- 4 knowledge graphs (different sizes and states)
- 28 nodes across all graphs
- Multiple edges connecting the nodes
- Sample user notes
- 15+ quiz questions

### 6. Explore the Database

Use Prisma Studio to visually explore your data:

```bash
npm run prisma:studio
```

This opens a browser interface at `http://localhost:5555`

## Common Commands

### Development Workflow

```bash
# Generate Prisma Client after schema changes
npm run prisma:generate

# Create a new migration
npm run prisma:migrate

# Apply migrations (production)
npm run prisma:deploy

# Reset database (WARNING: deletes all data)
npx prisma migrate reset

# Format schema.prisma file
npx prisma format
```

### Database Inspection

```bash
# Open Prisma Studio
npm run prisma:studio

# Pull schema from existing database
npx prisma db pull

# Push schema changes without migration (development only)
npx prisma db push
```

## Schema Overview

### Core Entities

**Documents** → **Graphs** → **Nodes** + **Edges**
                 ↓
            **Quiz Questions**
                 ↓
              **Notes** (optional)

### Entity Relationships

```
Document (1) ──→ (many) Graph
Graph (1) ──→ (many) Node
Graph (1) ──→ (many) Edge
Graph (1) ──→ (many) QuizQuestion
Graph (1) ──→ (many) Note

Node (1) ──→ (many) Edge (as fromNode)
Node (1) ──→ (many) Edge (as toNode)
Node (1) ──→ (many) Note

Edge (1) ──→ (many) Note
```

### Key Features

- **UUID Primary Keys**: Using `cuid()` for globally unique identifiers
- **JSONB Fields**: Flexible storage for metadata, layout configs, document refs
- **Enums**: Type-safe status, difficulty, and source type fields
- **Cascade Deletes**: Automatic cleanup when parent entities are deleted
- **Strategic Indexes**: Performance optimization for common queries
- **Timestamps**: Automatic created_at and updated_at tracking

## JSONB Field Structures

### Graph.layoutConfig
```json
{
  "layout": "dagre",
  "direction": "TB",
  "nodeSpacing": 100,
  "rankSpacing": 150
}
```

### Node.documentRefs
```json
[
  {
    "start": 0,
    "end": 150,
    "text": "Excerpt from source document..."
  }
]
```

### Node.metadata
```json
{
  "color": "#4A90E2",
  "importance": "high",
  "tags": ["core", "fundamental"]
}
```

### Edge.metadata
```json
{
  "style": "solid",
  "weight": "high",
  "confidence": 0.95
}
```

### QuizQuestion.options
```json
[
  { "id": 0, "text": "Correct answer" },
  { "id": 1, "text": "Wrong answer 1" },
  { "id": 2, "text": "Wrong answer 2" },
  { "id": 3, "text": "Wrong answer 3" }
]
```

### QuizQuestion.nodeRefs
```json
[
  { "nodeKey": "A", "title": "Machine Learning" },
  { "nodeKey": "B", "title": "Supervised Learning" }
]
```

## Migration Best Practices

### Creating Migrations

1. **Modify schema.prisma**: Make your changes to the schema
2. **Generate migration**: Run `npm run prisma:migrate`
3. **Name descriptively**: Use clear names like `add_user_authentication`
4. **Review SQL**: Check the generated migration file
5. **Test locally**: Ensure migration works before deploying

### Migration Naming Convention

```bash
# Good examples
add_quiz_difficulty_field
create_user_auth_tables
add_graph_version_index
remove_deprecated_status_field

# Avoid vague names
update_schema
fix_database
changes
```

### Handling Production Migrations

```bash
# Always test migrations in staging first
npm run prisma:deploy # Apply migrations

# If migration fails, investigate before retrying
npx prisma migrate resolve --applied <migration_name> # Mark as applied
npx prisma migrate resolve --rolled-back <migration_name> # Mark as rolled back
```

## Performance Optimization

### Existing Indexes

The schema includes strategic indexes on:
- Foreign key columns (documentId, graphId, fromNodeId, toNodeId)
- Status columns for filtering
- Composite indexes for common query patterns
- Timestamp columns for sorting

### Query Optimization Tips

```typescript
// Good: Use selective field projection
const graphs = await prisma.graph.findMany({
  select: {
    id: true,
    mermaidCode: true,
    nodes: { select: { id: true, title: true } }
  }
});

// Avoid: Selecting unnecessary data
const graphs = await prisma.graph.findMany({
  include: { nodes: true, edges: true, quizQuestions: true, notes: true }
});

// Good: Use where clauses with indexed fields
const readyGraphs = await prisma.graph.findMany({
  where: { status: 'ready', documentId: docId }
});

// Good: Batch operations
await prisma.node.createMany({ data: nodesArray });
```

## Troubleshooting

### Common Issues

**Issue**: Migration fails with "relation already exists"
**Solution**:
```bash
npx prisma migrate resolve --applied <migration_name>
npx prisma generate
```

**Issue**: Prisma Client out of sync
**Solution**:
```bash
npm run prisma:generate
```

**Issue**: Connection pool exhausted
**Solution**: Ensure you're using the singleton Prisma Client from `src/config/database.ts`

**Issue**: Seed script fails
**Solution**: Reset database and try again:
```bash
npx prisma migrate reset
npm run prisma:seed
```

## Environment-Specific Configuration

### Development
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/graphex_dev?schema=public"
```

### Staging
```env
DATABASE_URL="postgresql://user:pass@staging-host:5432/graphex_staging?schema=public"
```

### Production
```env
DATABASE_URL="postgresql://user:pass@prod-host:5432/graphex?schema=public&connection_limit=20"
```

## Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [Prisma Best Practices](https://www.prisma.io/docs/guides/performance-and-optimization)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Project Technical Design](../META/Core/TECHNICAL.md)

## Support

For questions or issues related to the database schema or Prisma setup, please refer to:
- Technical Design Document: `META/Core/TECHNICAL.md`
- Development Principles: `META/Core/REGULATION.md`
- Project Overview: `META/Core/META.md`

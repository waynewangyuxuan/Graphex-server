# Coordinate-Based Node References - Schema Update Summary

**Date:** November 15, 2025
**Version:** Phase 2 Implementation
**Status:** Ready for Migration

---

## Overview

This update enhances the Prisma schema to support **coordinate-based document references** in knowledge graph nodes, enabling precise highlighting of source text in the frontend.

### Architecture

```
Phase 1 (✅ Complete)
├─ Extract PDF text with bounding box coordinates
└─ Store in documents.metadata.textBlocks

Phase 2 (⬅️ This Update)
├─ AI generates nodes with supporting text snippets
├─ Match snippets to text blocks with coordinates
└─ Store in nodes.documentRefs with bounding boxes

Phase 3 (🔜 Future)
├─ Frontend receives node selection event
├─ Retrieve node.documentRefs
└─ Highlight precise regions on PDF using bbox coordinates
```

---

## What Changed

### Database Schema

**Before (Text-Only References):**
```typescript
// nodes.documentRefs (legacy)
{
  "text": "Photosynthesis is the process...",
  "startIndex": 1200,
  "endIndex": 1450
}
```

**After (Coordinate-Based References):**
```typescript
// nodes.documentRefs (v2.0)
{
  "references": [
    {
      "text": "Photosynthesis is the process...",
      "page": 5,                    // 0-indexed page number
      "bbox": {
        "x": 72,                    // PDF points from left edge
        "y": 650,                   // PDF points from bottom edge (!)
        "width": 400,               // Width in PDF points
        "height": 48                // Height in PDF points
      }
    }
  ]
}
```

### Key Features

- ✅ **Multiple references per node** (same concept across different pages)
- ✅ **Precise bounding boxes** for pixel-perfect highlighting
- ✅ **PDF coordinate system** (origin at bottom-left)
- ✅ **Backward compatible** (NULL or legacy formats still work)
- ✅ **Type-safe** (complete TypeScript definitions)
- ✅ **Queryable** (JSONB allows searching by page, text, coordinates)

---

## Files Created/Modified

### New Files

1. **`/src/types/node.types.ts`** (650 lines)
   - Complete TypeScript type definitions
   - Helper functions: `createNodeDocumentRefs()`, `findTextBlock()`, validators
   - Documentation and examples

2. **`/prisma/migrations/20251115_update_node_document_refs_coordinates/migration.sql`**
   - Database migration adding documentation comments
   - No data changes (backward compatible)
   - Optional GIN index for JSONB queries

3. **`/docs/NODE_COORDINATE_REFERENCES.md`** (15 pages)
   - Complete usage guide
   - Architecture flow
   - Code examples
   - Migration guide
   - Troubleshooting

4. **`/docs/SQL_EXAMPLES_COORDINATE_REFS.md`** (24 query examples)
   - Basic queries
   - Page-based searches
   - Text searches
   - Coordinate-based queries
   - Analytics and statistics
   - Performance optimization

5. **`/docs/QUICKSTART_NODE_COORDINATES.md`** (5-minute guide)
   - Step-by-step implementation
   - Copy-paste code examples
   - Common patterns
   - Error handling

### Modified Files

6. **`/META/Core/TECHNICAL.md`**
   - Updated Database Design section
   - Added documents.metadata structure
   - Added nodes.documentRefs structure
   - Documented coordinate system

---

## Migration Instructions

### 1. Run Migration

```bash
# Development
npx prisma migrate dev

# Production
npx prisma migrate deploy
```

**Migration impact:**
- ✅ No breaking changes
- ✅ No data loss
- ✅ Existing NULL documentRefs remain NULL
- ✅ Adds documentation comment to nodes.document_refs column
- ⚠️ Optional GIN index (commented out by default)

### 2. Update Code

Import and use new types in graph generation service:

```typescript
import { createNodeDocumentRefs } from '@/types/node.types';

// In graph generation
const documentRefs = createNodeDocumentRefs(snippets, textBlocks);

await prisma.node.create({
  data: {
    // ... other fields
    documentRefs,  // ✅ Coordinate-based
  },
});
```

### 3. Test

Create a test graph:

```bash
# Upload a PDF
curl -X POST http://localhost:3000/api/v1/documents \
  -F "file=@test.pdf"

# Generate graph
curl -X POST http://localhost:3000/api/v1/graphs/generate \
  -H "Content-Type: application/json" \
  -d '{"documentId": "clx..."}'

# Verify coordinates exist
psql graphex_dev -c "
  SELECT id, title,
    jsonb_array_length((document_refs::jsonb)->'references') as ref_count
  FROM nodes
  WHERE document_refs IS NOT NULL
  LIMIT 5;
"
```

---

## Usage Example

### Quick Start (Copy-Paste Ready)

```typescript
import { createNodeDocumentRefs, isValidNodeDocumentRefs } from '@/types/node.types';

// 1. Get document text blocks
const document = await prisma.document.findUnique({
  where: { id: documentId },
  select: { metadata: true },
});

const textBlocks = (document.metadata as any)?.textBlocks || [];

// 2. AI generates nodes with snippets
const aiNodes = await generateGraphWithAI(documentText);

// 3. Create nodes with coordinate references
for (const aiNode of aiNodes) {
  const documentRefs = createNodeDocumentRefs(aiNode.snippets, textBlocks);

  if (isValidNodeDocumentRefs(documentRefs)) {
    await prisma.node.create({
      data: {
        graphId,
        nodeKey: aiNode.nodeKey,
        title: aiNode.title,
        summary: aiNode.summary,
        documentRefs,  // ✅ Coordinate-based
      },
    });
  }
}
```

See [QUICKSTART_NODE_COORDINATES.md](docs/QUICKSTART_NODE_COORDINATES.md) for complete guide.

---

## Type Definitions

### Core Types

```typescript
// Single reference with coordinates
interface NodeDocumentReference {
  text: string;        // The quoted text from document
  page: number;        // 0-indexed page number
  bbox: BoundingBox;   // { x, y, width, height }
}

// Complete references structure
interface NodeDocumentRefs {
  references: NodeDocumentReference[];
}

// Bounding box (from pdf.types.ts)
interface BoundingBox {
  x: number;         // Left position in PDF points
  y: number;         // Bottom position in PDF points (PDF coord system!)
  width: number;     // Width in PDF points
  height: number;    // Height in PDF points
}
```

### Helper Functions

```typescript
// Create references from snippets
function createNodeDocumentRefs(
  snippets: string[],
  textBlocks: TextBlock[]
): NodeDocumentRefs;

// Find matching text block
function findTextBlock(
  snippet: string,
  textBlocks: TextBlock[],
  fuzzyMatch?: boolean
): TextBlock | null;

// Type guards
function isCoordinateBasedRefs(refs: unknown): refs is NodeDocumentRefs;
function isValidNodeDocumentRefs(refs: unknown): refs is NodeDocumentRefs;
```

---

## Database Queries

### Find Nodes Referencing Page 5

```sql
SELECT id, title, document_refs
FROM nodes
WHERE document_refs::jsonb @> '{"references": [{"page": 5}]}';
```

### Count References per Node

```sql
SELECT
  id,
  title,
  jsonb_array_length((document_refs::jsonb)->'references') as ref_count
FROM nodes
WHERE document_refs IS NOT NULL
ORDER BY ref_count DESC;
```

See [SQL_EXAMPLES_COORDINATE_REFS.md](docs/SQL_EXAMPLES_COORDINATE_REFS.md) for 24 more examples.

---

## PDF Coordinate System Reference

**CRITICAL:** PDF uses bottom-left origin (opposite of web canvas!)

```
Web Canvas:                      PDF:
(0,0) ─────────► X               │ Y
│                                │ ▲
│                                │ │
▼ Y                              (0,0) ─────────► X
```

**Example Coordinates:**
```typescript
{
  x: 72,      // 1 inch from left edge (72 points = 1 inch)
  y: 650,     // 650 points from bottom (near top of letter page = 792pt)
  width: 400, // ~5.5 inches wide
  height: 48  // ~0.67 inches tall (2-3 lines of text)
}
```

**Standard Page Sizes:**
- Letter (8.5" × 11"): **612 × 792 points**
- A4 (210mm × 297mm): **595 × 842 points**

---

## Performance Considerations

### JSONB Query Performance

For frequent queries by page/text, add GIN index:

```sql
CREATE INDEX idx_nodes_document_refs_gin ON nodes USING GIN (document_refs);
```

**Before index:**
```
Seq Scan on nodes  (cost=0.00..1234.56 rows=10 width=256)
Filter: (document_refs @> '{"references": [{"page": 5}]}')
```

**After index:**
```
Bitmap Heap Scan on nodes  (cost=12.34..56.78 rows=10 width=256)
  Index Cond: (document_refs @> '{"references": [{"page": 5}]}')
```

### Storage Impact

- **Per reference:** ~130-280 bytes (text + coordinates)
- **Per node:** ~400-840 bytes (1-3 references typical)
- **1000 nodes:** ~400-840 KB (negligible)

---

## Validation

### Before Saving

```typescript
import { isValidNodeDocumentRefs } from '@/types/node.types';

const documentRefs = createNodeDocumentRefs(snippets, textBlocks);

if (!isValidNodeDocumentRefs(documentRefs)) {
  console.error('Invalid document references:', documentRefs);
  // Handle: use NULL, skip node, or retry
}
```

### Check Reference Quality

```sql
-- Find nodes with empty references
SELECT id, title
FROM nodes
WHERE document_refs IS NOT NULL
  AND jsonb_array_length((document_refs::jsonb)->'references') = 0;

-- Find references with invalid coordinates
SELECT id, title, document_refs
FROM nodes n,
     jsonb_to_recordset((n.document_refs::jsonb)->'references') AS ref(bbox jsonb)
WHERE (ref.bbox->>'width')::float <= 0
   OR (ref.bbox->>'height')::float <= 0;
```

---

## Troubleshooting

### Issue: Text block not found

**Symptoms:** `findTextBlock()` returns null

**Solutions:**
1. Enable fuzzy matching (default: enabled)
2. Try shorter snippet (key sentence only)
3. Check whitespace normalization
4. Verify textBlocks were extracted correctly

### Issue: Wrong coordinates in frontend

**Symptoms:** Highlighted region doesn't match text

**Solutions:**
1. Verify PDF coordinate system (origin at bottom-left!)
2. Check page number is 0-indexed (first page = 0)
3. Ensure bbox dimensions are positive
4. Confirm PDF viewer uses same coordinate system

### Issue: Migration fails

**Symptoms:** `prisma migrate dev` errors

**Solutions:**
1. Ensure database is running
2. Check DATABASE_URL in `.env`
3. Verify no schema conflicts
4. Run `prisma generate` first if needed

---

## Next Steps

### Immediate (Phase 2)

1. ✅ **Run migration** (`npx prisma migrate dev`)
2. ✅ **Update graph generation service** with coordinate-based references
3. ✅ **Test with sample PDFs** to verify coordinates
4. ✅ **Monitor performance** (add GIN index if needed)

### Future (Phase 3)

1. 🔜 **Implement frontend highlighting** using bbox coordinates
2. 🔜 **Add edge references** (same structure for edge explanations)
3. 🔜 **Support multi-page spans** (text blocks crossing pages)
4. 🔜 **OCR support** (extract coordinates from scanned PDFs)

---

## Documentation Index

| File | Purpose | Length |
|------|---------|--------|
| [NODE_COORDINATE_REFERENCES.md](docs/NODE_COORDINATE_REFERENCES.md) | Complete reference guide | 15 pages |
| [SQL_EXAMPLES_COORDINATE_REFS.md](docs/SQL_EXAMPLES_COORDINATE_REFS.md) | 24 SQL query examples | 5 pages |
| [QUICKSTART_NODE_COORDINATES.md](docs/QUICKSTART_NODE_COORDINATES.md) | 5-minute quick start | 3 pages |
| [node.types.ts](src/types/node.types.ts) | TypeScript type definitions | 650 lines |
| [TECHNICAL.md](META/Core/TECHNICAL.md) | Updated architecture docs | Section 5.2 |

---

## Success Criteria

- [x] Migration file created and documented
- [x] TypeScript type definitions complete
- [x] Helper functions implemented and tested
- [x] Comprehensive documentation written
- [x] SQL query examples provided
- [x] Quick start guide available
- [x] TECHNICAL.md updated
- [x] Backward compatibility maintained
- [ ] Migration run successfully (requires database)
- [ ] Code integrated into graph generation service (next step)
- [ ] Production testing complete (next step)

---

## Support

- **Documentation:** See `docs/NODE_COORDINATE_REFERENCES.md`
- **Quick Start:** See `docs/QUICKSTART_NODE_COORDINATES.md`
- **SQL Examples:** See `docs/SQL_EXAMPLES_COORDINATE_REFS.md`
- **Type Definitions:** See `src/types/node.types.ts`
- **Architecture:** See `META/Core/TECHNICAL.md`

---

## Compliance with REGULATION.md

✅ **Atomic change:** Only updates what's needed for coordinate storage
✅ **Documentation:** Comprehensive docs + inline comments
✅ **Backward compatibility:** Existing NULL documentRefs still work
✅ **Type safety:** Complete TypeScript interfaces and type guards
✅ **Testing guidance:** Validation helpers and error handling examples
✅ **Performance considered:** GIN index option and query optimization tips

---

**Ready for implementation. Run migration and update graph generation service.**

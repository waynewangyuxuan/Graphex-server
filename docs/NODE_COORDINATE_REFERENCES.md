# Node Coordinate-Based Document References

**Version:** 2.0
**Last Updated:** November 15, 2025
**Status:** Phase 2 Implementation

---

## Overview

This document explains how to use coordinate-based document references in knowledge graph nodes. This enables precise highlighting of source text in the frontend by providing bounding box coordinates for each reference.

## Architecture Flow

```
Phase 1: PDF Extraction (✅ Complete)
│
├─ Extract text with coordinates
├─ Store in documents.metadata.textBlocks
└─ Result: Array of {text, page, bbox}
    ↓
Phase 2: Graph Generation (⬅️ Current Phase)
│
├─ AI identifies supporting text snippets
├─ Match snippets to textBlocks
├─ Store in nodes.documentRefs with coordinates
└─ Result: {references: [{text, page, bbox}]}
    ↓
Phase 3: Frontend Highlighting (Future)
│
├─ User selects node
├─ Retrieve node.documentRefs
├─ Draw highlight rectangles using bbox coordinates
└─ Result: Precise visual highlighting on PDF
```

---

## Database Schema

### documents.metadata (JSONB)

Stores extracted text blocks with coordinates:

```typescript
{
  "textBlocks": [
    {
      "text": "Photosynthesis is the process by which plants...",
      "page": 0,
      "bbox": {
        "x": 72,
        "y": 650,
        "width": 400,
        "height": 48
      }
    },
    // ... more text blocks
  ],
  "pageCount": 10,
  "wordCount": 5432,
  // ... other metadata
}
```

### nodes.documentRefs (JSONB)

Stores coordinate-based references:

```typescript
{
  "references": [
    {
      "text": "Photosynthesis is the process by which plants...",
      "page": 0,
      "bbox": {
        "x": 72,
        "y": 650,
        "width": 400,
        "height": 48
      }
    },
    {
      "text": "Chlorophyll absorbs light energy...",
      "page": 1,
      "bbox": {
        "x": 72,
        "y": 500,
        "width": 350,
        "height": 36
      }
    }
  ]
}
```

**Key Points:**
- A node can have **MULTIPLE references** (same concept across different pages)
- Each reference includes the text snippet, page number, and bounding box
- Coordinates use PDF coordinate system (origin at bottom-left)
- Backward compatible: NULL or legacy formats still work

---

## TypeScript Types

### Import Types

```typescript
import {
  NodeDocumentReference,
  NodeDocumentRefs,
  createNodeDocumentRefs,
  findTextBlock,
  isCoordinateBasedRefs,
  isValidNodeDocumentRefs,
} from '@/types/node.types';

import type { TextBlock } from '@/types/pdf.types';
```

### Core Types

```typescript
/**
 * Single document reference with coordinates
 */
interface NodeDocumentReference {
  text: string;        // The quoted text from document
  page: number;        // 0-indexed page number
  bbox: {
    x: number;         // Left position in PDF points
    y: number;         // Bottom position in PDF points (PDF coord system!)
    width: number;     // Width in PDF points
    height: number;    // Height in PDF points
  };
}

/**
 * Complete document references for a node
 */
interface NodeDocumentRefs {
  references: NodeDocumentReference[];
}
```

---

## Usage Examples

### 1. During Graph Generation (AI Service)

When AI generates nodes, match text snippets to coordinates:

```typescript
import { createNodeDocumentRefs } from '@/types/node.types';

// AI identified these supporting text snippets
const snippets = [
  "Photosynthesis is the process by which plants convert light energy...",
  "Chlorophyll is the green pigment that absorbs light energy..."
];

// Retrieve text blocks from document
const document = await prisma.document.findUnique({
  where: { id: documentId },
  select: { metadata: true }
});

const textBlocks = (document.metadata as any)?.textBlocks || [];

// Create coordinate-based references
const documentRefs = createNodeDocumentRefs(snippets, textBlocks);

// Store in node
await prisma.node.create({
  data: {
    graphId,
    nodeKey: "A",
    title: "Photosynthesis",
    summary: "The process by which plants convert light into chemical energy...",
    documentRefs: documentRefs, // ✅ Coordinate-based
    // ... other fields
  }
});
```

### 2. Manual Reference Creation

For more control, create references manually:

```typescript
import { findTextBlock } from '@/types/node.types';
import type { NodeDocumentRefs } from '@/types/node.types';

const snippet = "Photosynthesis is the process...";
const textBlocks = document.metadata.textBlocks;

// Find matching text block
const block = findTextBlock(snippet, textBlocks);

if (block) {
  const documentRefs: NodeDocumentRefs = {
    references: [
      {
        text: snippet,
        page: block.page,
        bbox: block.bbox
      }
    ]
  };

  // Store in node
  await prisma.node.update({
    where: { id: nodeId },
    data: { documentRefs }
  });
}
```

### 3. Reading References from Database

Retrieve and validate coordinate-based references:

```typescript
import { isCoordinateBasedRefs, isValidNodeDocumentRefs } from '@/types/node.types';

const node = await prisma.node.findUnique({
  where: { id: nodeId },
  select: { documentRefs: true }
});

// Type-safe access
if (isCoordinateBasedRefs(node.documentRefs)) {
  // TypeScript knows this is NodeDocumentRefs
  const refs = node.documentRefs;

  refs.references.forEach(ref => {
    console.log(`Page ${ref.page}: "${ref.text}"`);
    console.log(`Position: (${ref.bbox.x}, ${ref.bbox.y})`);
  });
}

// Validate references
if (isValidNodeDocumentRefs(node.documentRefs)) {
  // All references have valid coordinates
  console.log('✅ Valid coordinate-based references');
} else {
  // NULL, legacy format, or invalid
  console.log('⚠️ Invalid or missing references');
}
```

### 4. Querying Nodes by Page

Find all nodes referencing a specific page:

```sql
-- Find nodes referencing page 5
SELECT id, title, document_refs
FROM nodes
WHERE document_refs::jsonb @> '{"references": [{"page": 5}]}';
```

Or with Prisma raw query:

```typescript
const nodesOnPage5 = await prisma.$queryRaw`
  SELECT id, title, document_refs
  FROM nodes
  WHERE document_refs::jsonb @> '{"references": [{"page": 5}]}'::jsonb
`;
```

### 5. Searching by Text Content

Find nodes referencing specific text:

```typescript
const searchTerm = "photosynthesis";

const nodes = await prisma.$queryRaw`
  SELECT id, title, document_refs
  FROM nodes
  WHERE document_refs::jsonb::text ILIKE ${'%' + searchTerm + '%'}
`;
```

---

## Frontend Integration (Phase 3)

### Expected Frontend Flow

```typescript
// 1. User selects node in graph visualization
const selectedNode = graphData.nodes.find(n => n.id === selectedNodeId);

// 2. Fetch full node data with references
const nodeData = await fetch(`/api/v1/nodes/${selectedNode.id}`);
const { documentRefs } = nodeData;

// 3. Highlight references in PDF viewer
if (documentRefs?.references) {
  documentRefs.references.forEach(ref => {
    pdfViewer.highlightRegion({
      page: ref.page,
      x: ref.bbox.x,
      y: ref.bbox.y,
      width: ref.bbox.width,
      height: ref.bbox.height,
      color: 'yellow',
      opacity: 0.3
    });
  });
}
```

---

## PDF Coordinate System Reference

**IMPORTANT:** PDF uses a different coordinate system than typical web rendering:

```
Web (Canvas):                    PDF:
(0,0) ─────────► X               │ Y
│                                │ ▲
│                                │ │
▼ Y                              (0,0) ─────────► X
```

**PDF Coordinate System:**
- **Origin:** Bottom-left corner of page
- **X-axis:** Increases left → right
- **Y-axis:** Increases bottom → top (⚠️ OPPOSITE of web!)
- **Units:** PDF points (1 point = 1/72 inch)

**Example Coordinates:**
```typescript
{
  x: 72,      // 1 inch from left edge
  y: 650,     // 650 points from bottom (near top for 8.5×11 page = 792pt)
  width: 400, // About 5.5 inches wide
  height: 48  // About 0.67 inches tall (2-3 lines of text)
}
```

**Standard Page Dimensions:**
- Letter (8.5" × 11"): 612 × 792 points
- A4 (210mm × 297mm): 595 × 842 points

---

## Migration Guide

### Step 1: Run Migration

```bash
# Development
npx prisma migrate dev

# Production
npx prisma migrate deploy
```

The migration adds documentation comments but doesn't modify existing data.

### Step 2: Update Graph Generation Code

Modify your graph generation service to use coordinate-based references:

```typescript
// Before (text-only)
const documentRefs = {
  text: snippet,
  startIndex: 1200,
  endIndex: 1450
};

// After (coordinate-based)
import { createNodeDocumentRefs } from '@/types/node.types';

const documentRefs = createNodeDocumentRefs(
  [snippet],
  document.metadata.textBlocks
);
```

### Step 3: Regenerate Existing Graphs (Optional)

Existing graphs with NULL or legacy documentRefs will continue to work, but won't have highlighting. To add coordinates:

```typescript
// Script to regenerate documentRefs for existing nodes
async function migrateExistingNodes() {
  const nodes = await prisma.node.findMany({
    where: {
      OR: [
        { documentRefs: null },
        { NOT: { documentRefs: { path: ['references'], equals: [] } } }
      ]
    },
    include: {
      graph: {
        include: { document: true }
      }
    }
  });

  for (const node of nodes) {
    const textBlocks = node.graph.document.metadata?.textBlocks || [];

    // Extract text snippets from node content
    const snippets = extractSnippetsFromSummary(node.summary);

    // Create coordinate-based references
    const documentRefs = createNodeDocumentRefs(snippets, textBlocks);

    // Update node
    await prisma.node.update({
      where: { id: node.id },
      data: { documentRefs }
    });
  }
}
```

---

## Validation and Error Handling

### Validate References Before Saving

```typescript
import { isValidNodeDocumentRefs } from '@/types/node.types';

const documentRefs = createNodeDocumentRefs(snippets, textBlocks);

if (!isValidNodeDocumentRefs(documentRefs)) {
  console.error('Invalid document references:', documentRefs);
  throw new Error('Failed to create valid coordinate-based references');
}

// Safe to save
await prisma.node.create({
  data: {
    // ... other fields
    documentRefs
  }
});
```

### Handle Missing Text Blocks

```typescript
import { findTextBlock } from '@/types/node.types';

const snippet = "Important concept from document...";
const block = findTextBlock(snippet, textBlocks);

if (!block) {
  console.warn(`Text block not found for snippet: "${snippet.substring(0, 50)}..."`);
  // Options:
  // 1. Skip this reference (don't add to array)
  // 2. Add with null coordinates (but validation will fail)
  // 3. Use approximate coordinates (not recommended)
}
```

---

## Performance Considerations

### Indexing for Queries

If you frequently query nodes by page or text content, add a GIN index:

```sql
CREATE INDEX idx_nodes_document_refs_gin ON nodes USING GIN (document_refs);
```

This enables fast queries like:

```sql
-- Find nodes on page 5 (fast with GIN index)
SELECT * FROM nodes
WHERE document_refs @> '{"references": [{"page": 5}]}';
```

### Storage Size

Each reference consumes approximately:
- Text snippet: 50-200 bytes (varies by length)
- Coordinates: ~80 bytes (fixed)
- Total: ~130-280 bytes per reference

Typical node: 1-3 references = ~400-840 bytes

This is minimal compared to node content and acceptable for JSONB storage.

---

## Troubleshooting

### Issue: Text block not found

**Problem:** `findTextBlock()` returns null for a snippet

**Solutions:**
1. Check whitespace normalization (snippet may have extra spaces)
2. Enable fuzzy matching (default: enabled)
3. Verify textBlocks were extracted correctly from PDF
4. Try shorter snippet (use key sentence instead of full paragraph)

### Issue: Incorrect coordinates in frontend

**Problem:** Highlighted region doesn't match text

**Solutions:**
1. Verify PDF coordinate system (origin at bottom-left!)
2. Check page number is 0-indexed
3. Ensure PDF viewer uses same coordinate system
4. Verify bbox dimensions are positive

### Issue: Query performance slow

**Problem:** Querying nodes by page/text is slow

**Solutions:**
1. Add GIN index on document_refs column
2. Use parameterized queries (avoid JSON parsing in app)
3. Consider denormalizing frequently-queried fields

---

## Best Practices

1. **Always validate references** before saving to database
2. **Handle missing text blocks gracefully** (log warnings, don't fail)
3. **Use fuzzy matching** when finding text blocks (default enabled)
4. **Keep snippets meaningful** (full sentences, not fragments)
5. **Limit references per node** (1-3 is ideal, more clutters UI)
6. **Test coordinate system** in frontend early (PDF coords are tricky!)
7. **Document edge cases** when text blocks span pages

---

## Related Documentation

- [TECHNICAL.md](../META/Core/TECHNICAL.md) - Overall architecture
- [PDF Extraction Types](../src/types/pdf.types.ts) - TextBlock and BoundingBox types
- [Node Types](../src/types/node.types.ts) - Complete type definitions
- [Graph Generation Service](../src/services/graph-generator.service.ts) - Implementation

---

## Future Enhancements

1. **Edge References:** Apply same structure to edge explanations
2. **Multi-page Spans:** Support text blocks spanning multiple pages
3. **Nested Highlights:** Highlight multiple overlapping references
4. **Smart Merging:** Combine adjacent text blocks into single highlight
5. **OCR Support:** Extract coordinates from scanned PDFs (Phase 4)

---

**End of Document**

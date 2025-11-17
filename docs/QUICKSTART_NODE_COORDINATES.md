# Quick Start: Node Coordinate References

**5-minute guide to using coordinate-based references in graph generation**

---

## Step 1: Import Types

```typescript
import {
  NodeDocumentRefs,
  createNodeDocumentRefs,
  findTextBlock,
  isValidNodeDocumentRefs,
} from '@/types/node.types';
import type { TextBlock } from '@/types/pdf.types';
```

---

## Step 2: Retrieve Document Text Blocks

```typescript
// During graph generation, get the document with text blocks
const document = await prisma.document.findUnique({
  where: { id: documentId },
  select: {
    id: true,
    contentText: true,
    metadata: true,
  },
});

// Extract text blocks from metadata
const textBlocks: TextBlock[] = (document.metadata as any)?.textBlocks || [];

if (textBlocks.length === 0) {
  console.warn(`No text blocks found for document ${documentId}`);
  // Fallback: Continue without coordinates
}
```

---

## Step 3: AI Generates Nodes with Text Snippets

```typescript
// Your AI service returns nodes with supporting text snippets
const aiResponse = await claudeAPI.generateGraph(documentText);

// Example AI response (simplified)
const aiNodes = [
  {
    nodeKey: "A",
    title: "Photosynthesis",
    summary: "The process by which plants convert light energy into chemical energy...",
    snippets: [
      "Photosynthesis is the process by which plants, algae, and some bacteria convert light energy into chemical energy.",
      "Chlorophyll, the green pigment in plants, plays a crucial role in capturing light energy."
    ]
  },
  {
    nodeKey: "B",
    title: "Chlorophyll",
    summary: "Green pigment responsible for light absorption...",
    snippets: [
      "Chlorophyll absorbs light most efficiently in the blue and red wavelengths."
    ]
  }
];
```

---

## Step 4: Create Coordinate-Based References (Easy Method)

```typescript
// Simple approach: Use helper function
for (const aiNode of aiNodes) {
  // Create coordinate-based references from snippets
  const documentRefs = createNodeDocumentRefs(aiNode.snippets, textBlocks);

  // Validate before saving
  if (!isValidNodeDocumentRefs(documentRefs)) {
    console.error(`Invalid references for node ${aiNode.nodeKey}`);
    // Decide: Skip node, use NULL refs, or retry
  }

  // Save node with coordinate references
  await prisma.node.create({
    data: {
      graphId: graphId,
      nodeKey: aiNode.nodeKey,
      title: aiNode.title,
      summary: aiNode.summary,
      nodeType: 'concept', // Based on your classification
      documentRefs: documentRefs, // ✅ Coordinate-based references
    },
  });
}
```

---

## Step 5: Manual Control (Advanced Method)

For more control, create references manually:

```typescript
import { findTextBlock } from '@/types/node.types';

const snippet = "Photosynthesis is the process by which plants...";

// Find matching text block
const block = findTextBlock(snippet, textBlocks);

if (block) {
  const documentRefs: NodeDocumentRefs = {
    references: [
      {
        text: snippet,
        page: block.page,
        bbox: block.bbox,
      },
    ],
  };

  // Save node
  await prisma.node.create({
    data: {
      // ... other fields
      documentRefs,
    },
  });
} else {
  console.warn(`Text block not found for: "${snippet.substring(0, 50)}..."`);
  // Decide how to handle: use NULL, skip, or use approximate match
}
```

---

## Step 6: Handle Multiple References per Node

```typescript
// Node with multiple supporting snippets
const snippets = [
  "Photosynthesis occurs in chloroplasts...",  // Page 3
  "The light-dependent reactions...",          // Page 4
  "The Calvin cycle uses ATP and NADPH...",    // Page 5
];

// Create references
const references: NodeDocumentReference[] = [];

for (const snippet of snippets) {
  const block = findTextBlock(snippet, textBlocks);
  if (block) {
    references.push({
      text: snippet,
      page: block.page,
      bbox: block.bbox,
    });
  }
}

const documentRefs: NodeDocumentRefs = { references };

// Save node with multiple references
await prisma.node.create({
  data: {
    // ... other fields
    documentRefs,
  },
});
```

---

## Step 7: Error Handling

```typescript
import { createNodeDocumentRefs, isValidNodeDocumentRefs } from '@/types/node.types';

try {
  const documentRefs = createNodeDocumentRefs(snippets, textBlocks);

  // Validate
  if (!isValidNodeDocumentRefs(documentRefs)) {
    throw new Error('Invalid document references structure');
  }

  // Check if any references were found
  if (documentRefs.references.length === 0) {
    console.warn(`No matching text blocks found for node ${nodeKey}`);
    // Option 1: Use NULL references
    // documentRefs = null;

    // Option 2: Use empty references array
    // documentRefs = { references: [] };

    // Option 3: Skip this node (don't create)
    // continue;
  }

  // Save node
  await prisma.node.create({
    data: {
      // ... fields
      documentRefs,
    },
  });
} catch (error) {
  console.error(`Failed to create node with coordinates:`, error);
  // Handle error appropriately
}
```

---

## Step 8: Read References Back

```typescript
import { isCoordinateBasedRefs } from '@/types/node.types';

// Retrieve node
const node = await prisma.node.findUnique({
  where: { id: nodeId },
  select: {
    id: true,
    title: true,
    documentRefs: true,
  },
});

// Type-safe access
if (isCoordinateBasedRefs(node.documentRefs)) {
  const refs = node.documentRefs;

  console.log(`Node "${node.title}" has ${refs.references.length} references:`);

  refs.references.forEach((ref, index) => {
    console.log(`  ${index + 1}. Page ${ref.page}:`);
    console.log(`     "${ref.text.substring(0, 50)}..."`);
    console.log(`     Position: (${ref.bbox.x}, ${ref.bbox.y})`);
    console.log(`     Size: ${ref.bbox.width} × ${ref.bbox.height}`);
  });
} else {
  console.log(`Node "${node.title}" has no coordinate-based references`);
}
```

---

## Complete Example

```typescript
import { PrismaClient } from '@prisma/client';
import { createNodeDocumentRefs, isValidNodeDocumentRefs } from '@/types/node.types';
import type { TextBlock } from '@/types/pdf.types';

const prisma = new PrismaClient();

async function generateGraphWithCoordinates(documentId: string) {
  // 1. Get document with text blocks
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      contentText: true,
      metadata: true,
    },
  });

  if (!document) {
    throw new Error(`Document ${documentId} not found`);
  }

  const textBlocks: TextBlock[] = (document.metadata as any)?.textBlocks || [];

  // 2. Call AI to generate graph
  const aiResponse = await callClaudeAPI(document.contentText);

  // 3. Create graph
  const graph = await prisma.graph.create({
    data: {
      documentId: document.id,
      mermaidCode: aiResponse.mermaidCode,
      generationModel: 'claude-sonnet-4',
      status: 'generating',
    },
  });

  // 4. Create nodes with coordinate references
  for (const aiNode of aiResponse.nodes) {
    // Create coordinate-based references
    const documentRefs = createNodeDocumentRefs(aiNode.snippets, textBlocks);

    // Validate
    if (!isValidNodeDocumentRefs(documentRefs)) {
      console.warn(`Invalid references for node ${aiNode.nodeKey}, using NULL`);
      documentRefs = null;
    }

    // Save node
    await prisma.node.create({
      data: {
        graphId: graph.id,
        nodeKey: aiNode.nodeKey,
        title: aiNode.title,
        summary: aiNode.summary,
        nodeType: aiNode.nodeType || 'concept',
        documentRefs: documentRefs,
      },
    });
  }

  // 5. Update graph status
  await prisma.graph.update({
    where: { id: graph.id },
    data: { status: 'ready' },
  });

  return graph;
}
```

---

## Common Patterns

### Pattern 1: Fallback to NULL References

```typescript
const documentRefs = createNodeDocumentRefs(snippets, textBlocks);

await prisma.node.create({
  data: {
    // ... fields
    documentRefs: documentRefs.references.length > 0 ? documentRefs : null,
  },
});
```

### Pattern 2: Filter Out Nodes Without References

```typescript
const nodesWithRefs = aiNodes.filter(node => {
  const refs = createNodeDocumentRefs(node.snippets, textBlocks);
  return refs.references.length > 0;
});

// Only create nodes that have valid references
for (const node of nodesWithRefs) {
  // ... create node
}
```

### Pattern 3: Retry with Fuzzy Matching

```typescript
let block = findTextBlock(snippet, textBlocks, false); // Exact match

if (!block) {
  console.warn('Exact match failed, trying fuzzy match...');
  block = findTextBlock(snippet, textBlocks, true); // Fuzzy match
}

if (!block) {
  console.error('No match found for snippet');
  // Handle appropriately
}
```

---

## Performance Tips

1. **Batch text block lookups**: Extract textBlocks once, reuse for all nodes
2. **Validate early**: Check if textBlocks exist before processing
3. **Use transactions**: Create graph + nodes in single transaction
4. **Cache document metadata**: Don't re-fetch for each node

```typescript
// Good: Single fetch, reuse textBlocks
const textBlocks = (document.metadata as any)?.textBlocks || [];
for (const node of aiNodes) {
  const refs = createNodeDocumentRefs(node.snippets, textBlocks);
  // ... create node
}

// Bad: Fetch for each node (slow!)
for (const node of aiNodes) {
  const doc = await prisma.document.findUnique({ where: { id: docId } });
  const refs = createNodeDocumentRefs(node.snippets, doc.metadata.textBlocks);
  // ...
}
```

---

## Troubleshooting

**Problem:** `findTextBlock()` returns null
- Check whitespace normalization (trim snippets)
- Enable fuzzy matching
- Verify textBlocks were extracted correctly
- Try shorter snippet (just key sentence)

**Problem:** References have wrong coordinates
- Verify PDF coordinate system (origin at bottom-left!)
- Check page number is 0-indexed
- Ensure bbox dimensions are positive

**Problem:** Validation fails
- Check bbox has all required fields (x, y, width, height)
- Ensure page number is non-negative integer
- Verify text is non-empty string

---

## Next Steps

1. ✅ Run migration: `npx prisma migrate dev`
2. ✅ Update graph generation service with code above
3. ✅ Test with sample PDF
4. ✅ Verify coordinates in database
5. 🔜 Implement frontend highlighting (Phase 3)

---

**See also:**
- [Complete Documentation](./NODE_COORDINATE_REFERENCES.md)
- [SQL Examples](./SQL_EXAMPLES_COORDINATE_REFS.md)
- [Type Definitions](../src/types/node.types.ts)

# SQL Query Examples for Coordinate-Based References

Quick reference guide for querying nodes with coordinate-based document references.

---

## Basic Queries

### 1. Find All Nodes with Coordinate References

```sql
SELECT id, title, document_refs
FROM nodes
WHERE document_refs IS NOT NULL
  AND document_refs::jsonb ? 'references';
```

### 2. Count Nodes by Reference Type

```sql
SELECT
  COUNT(*) FILTER (WHERE document_refs IS NULL) as no_refs,
  COUNT(*) FILTER (WHERE document_refs IS NOT NULL AND document_refs::jsonb ? 'references') as coordinate_refs,
  COUNT(*) FILTER (WHERE document_refs IS NOT NULL AND NOT document_refs::jsonb ? 'references') as legacy_refs
FROM nodes;
```

---

## Querying by Page Number

### 3. Find Nodes Referencing Specific Page

```sql
-- Find all nodes referencing page 5 (0-indexed)
SELECT id, title, document_refs
FROM nodes
WHERE document_refs::jsonb @> '{"references": [{"page": 5}]}';
```

### 4. Find Nodes Referencing Page Range

```sql
-- Find nodes referencing pages 0-9
SELECT n.id, n.title, ref.page
FROM nodes n,
     jsonb_to_recordset((n.document_refs::jsonb)->'references') AS ref(page int, text text, bbox jsonb)
WHERE ref.page BETWEEN 0 AND 9;
```

### 5. Count References per Page

```sql
-- Count how many references exist for each page
SELECT ref.page, COUNT(*) as reference_count
FROM nodes n,
     jsonb_to_recordset((n.document_refs::jsonb)->'references') AS ref(page int)
WHERE n.document_refs IS NOT NULL
GROUP BY ref.page
ORDER BY ref.page;
```

---

## Text Search Queries

### 6. Find Nodes by Reference Text

```sql
-- Case-insensitive search in reference text
SELECT id, title, document_refs
FROM nodes
WHERE document_refs::jsonb::text ILIKE '%photosynthesis%';
```

### 7. Full-Text Search in References

```sql
-- Using PostgreSQL full-text search
SELECT n.id, n.title, ref.text
FROM nodes n,
     jsonb_to_recordset((n.document_refs::jsonb)->'references') AS ref(text text)
WHERE to_tsvector('english', ref.text) @@ to_tsquery('english', 'photosynthesis & chlorophyll');
```

---

## Coordinate-Based Queries

### 8. Find Nodes by Coordinate Range

```sql
-- Find nodes with references in specific region of page
-- (e.g., left column: x < 300)
SELECT n.id, n.title, ref.page, ref.bbox
FROM nodes n,
     jsonb_to_recordset((n.document_refs::jsonb)->'references') AS ref(
       page int,
       text text,
       bbox jsonb
     )
WHERE (ref.bbox->>'x')::float < 300;
```

### 9. Find Overlapping References

```sql
-- Find nodes with references in same region
-- (bounding boxes that might overlap)
WITH target_bbox AS (
  SELECT 72 as x, 650 as y, 400 as width, 48 as height
)
SELECT n.id, n.title, ref.page,
       ref.bbox->>'x' as x,
       ref.bbox->>'y' as y
FROM nodes n,
     jsonb_to_recordset((n.document_refs::jsonb)->'references') AS ref(
       page int,
       bbox jsonb
     ),
     target_bbox t
WHERE ref.page = 0
  AND (ref.bbox->>'x')::float BETWEEN t.x - 50 AND t.x + t.width + 50
  AND (ref.bbox->>'y')::float BETWEEN t.y - 50 AND t.y + t.height + 50;
```

---

## Reference Statistics

### 10. Node Reference Distribution

```sql
-- Count how many references each node has
SELECT
  n.id,
  n.title,
  jsonb_array_length((n.document_refs::jsonb)->'references') as ref_count
FROM nodes n
WHERE n.document_refs IS NOT NULL
  AND n.document_refs::jsonb ? 'references'
ORDER BY ref_count DESC;
```

### 11. Average References per Node

```sql
-- Calculate average number of references
SELECT
  AVG(jsonb_array_length((document_refs::jsonb)->'references')) as avg_refs_per_node,
  MAX(jsonb_array_length((document_refs::jsonb)->'references')) as max_refs,
  MIN(jsonb_array_length((document_refs::jsonb)->'references')) as min_refs
FROM nodes
WHERE document_refs IS NOT NULL
  AND document_refs::jsonb ? 'references';
```

---

## Graph-Level Queries

### 12. Get All References for a Graph

```sql
-- Extract all document references for a specific graph
SELECT
  n.id as node_id,
  n.title as node_title,
  ref.page,
  ref.text,
  ref.bbox
FROM nodes n,
     jsonb_to_recordset((n.document_refs::jsonb)->'references') AS ref(
       page int,
       text text,
       bbox jsonb
     )
WHERE n.graph_id = 'clx1234567890'
ORDER BY ref.page, (ref.bbox->>'y')::float DESC;  -- Order by page, then top-to-bottom
```

### 13. Find Graphs with Most References

```sql
-- Rank graphs by total number of document references
SELECT
  g.id,
  g.document_id,
  COUNT(ref.*) as total_references
FROM graphs g
JOIN nodes n ON n.graph_id = g.id
CROSS JOIN LATERAL jsonb_to_recordset((n.document_refs::jsonb)->'references') AS ref(page int, text text, bbox jsonb)
WHERE n.document_refs IS NOT NULL
GROUP BY g.id, g.document_id
ORDER BY total_references DESC;
```

---

## Data Quality Queries

### 14. Find Nodes with Invalid References

```sql
-- Find nodes where references lack required fields
SELECT n.id, n.title, n.document_refs
FROM nodes n
WHERE n.document_refs IS NOT NULL
  AND (
    -- Missing 'references' array
    NOT n.document_refs::jsonb ? 'references'
    -- OR empty references array
    OR jsonb_array_length((n.document_refs::jsonb)->'references') = 0
  );
```

### 15. Validate Bounding Box Coordinates

```sql
-- Find references with potentially invalid coordinates
-- (negative dimensions, zero dimensions, etc.)
SELECT
  n.id,
  n.title,
  ref.page,
  ref.bbox
FROM nodes n,
     jsonb_to_recordset((n.document_refs::jsonb)->'references') AS ref(
       page int,
       bbox jsonb
     )
WHERE n.document_refs IS NOT NULL
  AND (
    (ref.bbox->>'width')::float <= 0
    OR (ref.bbox->>'height')::float <= 0
    OR (ref.bbox->>'x')::float < 0
    OR (ref.bbox->>'y')::float < 0
  );
```

---

## Update Queries

### 16. Add Reference to Existing Node

```sql
-- Add a new reference to a node's documentRefs
UPDATE nodes
SET document_refs = jsonb_set(
  COALESCE(document_refs, '{"references": []}'),
  '{references, 999}',  -- Append to end (use large index)
  '{
    "text": "New reference text...",
    "page": 3,
    "bbox": {"x": 72, "y": 500, "width": 300, "height": 36}
  }'
)
WHERE id = 'clx1234567890';
```

### 17. Remove References for Specific Page

```sql
-- Remove all references to page 5 from a node
UPDATE nodes
SET document_refs = jsonb_set(
  document_refs,
  '{references}',
  (
    SELECT jsonb_agg(elem)
    FROM jsonb_array_elements((document_refs::jsonb)->'references') elem
    WHERE (elem->>'page')::int != 5
  )
)
WHERE id = 'clx1234567890'
  AND document_refs IS NOT NULL;
```

---

## Performance Optimization

### 18. Create GIN Index for JSONB Queries

```sql
-- Create GIN index to speed up JSONB queries
CREATE INDEX idx_nodes_document_refs_gin ON nodes USING GIN (document_refs);
```

### 19. Create Partial Index for Non-Null References

```sql
-- Create partial index only for nodes with references
CREATE INDEX idx_nodes_with_refs ON nodes (graph_id)
WHERE document_refs IS NOT NULL;
```

### 20. Analyze Query Performance

```sql
-- Use EXPLAIN ANALYZE to check query performance
EXPLAIN ANALYZE
SELECT id, title
FROM nodes
WHERE document_refs::jsonb @> '{"references": [{"page": 5}]}';
```

---

## Complex Analytical Queries

### 21. Reference Coverage by Document

```sql
-- Calculate what percentage of pages have references
WITH page_refs AS (
  SELECT
    g.document_id,
    d.metadata::jsonb->>'pageCount' as total_pages,
    COUNT(DISTINCT ref.page) as referenced_pages
  FROM graphs g
  JOIN documents d ON d.id = g.document_id
  JOIN nodes n ON n.graph_id = g.id
  CROSS JOIN LATERAL jsonb_to_recordset((n.document_refs::jsonb)->'references') AS ref(page int)
  WHERE n.document_refs IS NOT NULL
    AND d.metadata::jsonb ? 'pageCount'
  GROUP BY g.document_id, d.metadata::jsonb->>'pageCount'
)
SELECT
  document_id,
  total_pages::int,
  referenced_pages,
  ROUND(100.0 * referenced_pages / total_pages::int, 2) as coverage_percentage
FROM page_refs
ORDER BY coverage_percentage DESC;
```

### 22. Find Densely Referenced Pages

```sql
-- Find pages with the most references (hotspots)
SELECT
  ref.page,
  COUNT(*) as reference_count,
  COUNT(DISTINCT n.id) as unique_nodes,
  ARRAY_AGG(DISTINCT n.title) as node_titles
FROM nodes n,
     jsonb_to_recordset((n.document_refs::jsonb)->'references') AS ref(page int)
WHERE n.document_refs IS NOT NULL
GROUP BY ref.page
HAVING COUNT(*) > 5  -- Pages with more than 5 references
ORDER BY reference_count DESC;
```

---

## Migration Helpers

### 23. Check Legacy vs. Coordinate References

```sql
-- Identify nodes that need migration
SELECT
  'Coordinate-based' as type,
  COUNT(*) as count
FROM nodes
WHERE document_refs IS NOT NULL
  AND document_refs::jsonb ? 'references'

UNION ALL

SELECT
  'Legacy format' as type,
  COUNT(*) as count
FROM nodes
WHERE document_refs IS NOT NULL
  AND NOT document_refs::jsonb ? 'references'

UNION ALL

SELECT
  'No references' as type,
  COUNT(*) as count
FROM nodes
WHERE document_refs IS NULL;
```

### 24. Export References for Analysis

```sql
-- Export all references to CSV-like format
COPY (
  SELECT
    n.id as node_id,
    n.title as node_title,
    n.graph_id,
    ref.page,
    ref.text,
    ref.bbox->>'x' as bbox_x,
    ref.bbox->>'y' as bbox_y,
    ref.bbox->>'width' as bbox_width,
    ref.bbox->>'height' as bbox_height
  FROM nodes n,
       jsonb_to_recordset((n.document_refs::jsonb)->'references') AS ref(
         page int,
         text text,
         bbox jsonb
       )
  WHERE n.document_refs IS NOT NULL
) TO '/tmp/node_references.csv' WITH CSV HEADER;
```

---

## Notes

- **0-indexed pages:** Remember that page numbers are 0-indexed (first page = 0)
- **PDF coordinates:** Y-axis increases from bottom to top (origin at bottom-left)
- **JSONB operators:**
  - `?` checks for key existence
  - `@>` checks for containment
  - `->` returns JSONB
  - `->>` returns text
- **Performance:** Always use GIN index for frequent JSONB queries
- **NULL handling:** Always check for NULL documentRefs before querying

---

## Prisma Equivalents

### Query nodes by page (Prisma)

```typescript
// Using raw query
const nodesOnPage5 = await prisma.$queryRaw`
  SELECT id, title, document_refs
  FROM nodes
  WHERE document_refs::jsonb @> '{"references": [{"page": 5}]}'::jsonb
`;
```

### Count references (Prisma)

```typescript
// Using aggregation
const stats = await prisma.node.groupBy({
  by: ['graphId'],
  _count: {
    documentRefs: true,
  },
  where: {
    documentRefs: {
      not: null,
    },
  },
});
```

---

**End of SQL Examples**

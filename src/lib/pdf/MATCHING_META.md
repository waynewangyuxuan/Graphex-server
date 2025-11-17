# Quote-to-Coordinate Matching Algorithm

**Version**: 1.0
**Last Updated**: November 15, 2025
**Authors**: Graphex Backend Team

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Page Marker Formatting](#page-marker-formatting)
4. [Quote Matching Algorithm](#quote-matching-algorithm)
5. [Integration Flow](#integration-flow)
6. [Quality Metrics](#quality-metrics)
7. [Error Handling](#error-handling)
8. [Testing](#testing)
9. [Future Improvements](#future-improvements)

---

## Overview

### Purpose

Enable precise PDF highlighting in the frontend by matching AI-generated text quotes to exact coordinate-based bounding boxes.

### User Requirement

**"Be careful, we want the highlight to be precise (looks regularized, do not touch unrelated text)"**

This requirement drives our design decisions:
- Prefer exact matches over fuzzy matches
- Return tightest possible bounding boxes
- Avoid partial word matches
- Handle sentence boundaries correctly
- Gracefully degrade when matching fails

### Three-Phase Architecture

```
Phase 1: PDF Extraction with Coordinates
└─> Extract text + bounding boxes → Store in documents.metadata.textBlocks

Phase 2: AI Graph Generation with Quote Matching (THIS MODULE)
├─> Format text with PAGE markers
├─> AI generates nodes with pageReferences + keyQuotes
└─> Match keyQuotes to textBlocks → Store in nodes.documentRefs

Phase 3: Frontend Highlighting
└─> Use nodes.documentRefs coordinates to highlight precise regions
```

---

## Architecture

### Components

```
src/lib/pdf/
├── page-marker-formatter.ts    # Formats text with PAGE 0:, PAGE 1:, etc.
├── quote-matcher.ts             # Multi-tier matching algorithm
└── MATCHING_META.md            # This documentation
```

### Data Flow

```
Document Upload
     ↓
PDF Extraction (pdfjs-dist)
├─> fullText: string
└─> textBlocks: Array<{text, page, bbox}>
     ↓
Store in Database
└─> documents.metadata.textBlocks
     ↓
Graph Generation Request
├─> Fetch document + textBlocks
├─> Format text with page markers
├─> Send to AI with enhanced prompt
└─> AI returns nodes with pageReferences + keyQuotes
     ↓
Quote-to-Coordinate Matching
├─> For each node.keyQuote:
├─> Match to textBlocks using multi-tier algorithm
└─> Store matched coordinates in node.documentRefs
     ↓
Frontend Rendering
└─> Highlight precise regions using bbox coordinates
```

---

## Page Marker Formatting

### Purpose

Insert `PAGE X:` markers into document text so AI knows which page each concept comes from.

### Algorithm

```typescript
function formatTextWithPageMarkers(fullText, textBlocks):
  1. Group textBlocks by page number
  2. Sort pages in ascending order (0, 1, 2, ...)
  3. For each page:
     a. Insert "PAGE {pageNum}:" marker
     b. Concatenate all text blocks from that page
     c. Preserve paragraph breaks between blocks
  4. Join pages with double newline separator
  5. Return formatted text
```

### Example Input/Output

**Input textBlocks:**
```json
[
  { "text": "Introduction to Photosynthesis...", "page": 0, "bbox": {...} },
  { "text": "Plants convert light energy...", "page": 0, "bbox": {...} },
  { "text": "The Role of Chlorophyll...", "page": 1, "bbox": {...} }
]
```

**Output formatted text:**
```
PAGE 0:
Introduction to Photosynthesis
Plants convert light energy into chemical energy through photosynthesis.

PAGE 1:
The Role of Chlorophyll
Chlorophyll is the green pigment that absorbs light.
```

### Configuration

```typescript
{
  includeMarkers: true,           // Enable/disable markers
  pageSeparator: '\n\n',          // Separator between pages
  minPageLength: 10               // Min chars to include page
}
```

---

## Quote Matching Algorithm

### Multi-Tier Strategy

We use **4 matching strategies** in order of preference, stopping at the first match:

```
1. Exact Match       (fastest, most precise)
   ↓ (if fails)
2. Normalized Match  (lowercase + whitespace normalization)
   ↓ (if fails)
3. Token-Based Match (word-level Jaccard similarity)
   ↓ (if fails)
4. Fuzzy Match       (Levenshtein distance with strict threshold)
   ↓ (if all fail)
5. No Match          (graceful degradation)
```

### Why Fuzzy Matching is Needed

AI may paraphrase slightly due to:
- Acronyms: "ML" vs "Machine Learning"
- Punctuation: "AI." vs "AI"
- Line breaks: "Neural\nNetworks" vs "Neural Networks"
- Slight rewording while preserving meaning

**BUT** we must avoid false positives:
- ❌ "Neural Networks" should NOT match "Social Networks"
- ❌ "Deep Learning" should NOT match "Deep Sea Diving"

### Strategy 1: Exact Match

```typescript
function findExactMatches(quote, textBlocks):
  for each block in textBlocks:
    if block.text === quote:
      return [block]
  return []
```

**Confidence**: 1.0
**Use Case**: AI returns verbatim quote
**Example**: `"Photosynthesis is the process"` matches `"Photosynthesis is the process"`

### Strategy 2: Normalized Match

```typescript
function findNormalizedMatches(quote, textBlocks):
  normalizedQuote = normalize(quote)  // Lowercase + trim whitespace + remove punctuation
  for each block in textBlocks:
    if normalize(block.text) === normalizedQuote:
      return [block]
  return []
```

**Confidence**: 0.95
**Use Case**: Punctuation or case differences
**Example**: `"AI systems"` matches `"AI systems."`

### Strategy 3: Token-Based Match (Jaccard Similarity)

```typescript
function findTokenBasedMatches(quote, textBlocks, threshold=0.8):
  quoteTokens = tokenize(quote)  // Split into words
  for each block in textBlocks:
    blockTokens = tokenize(block.text)
    jaccard = intersection(quoteTokens, blockTokens).size / union(quoteTokens, blockTokens).size
    if jaccard >= threshold:
      matches.push(block)
  return matches
```

**Confidence**: 0.85
**Threshold**: 80% word overlap
**Use Case**: AI uses same key terms but slight rewording
**Example**:
- Quote: `"Machine Learning algorithms"`
- Block: `"Machine Learning and AI algorithms"`
- Jaccard: 3/4 = 0.75 (FAIL - below 0.8 threshold)

**Safeguard**: High threshold prevents false positives
- `"Neural Networks"` vs `"Social Networks"`: Jaccard = 1/3 = 0.33 (FAIL ✓)

### Strategy 4: Fuzzy Match (Levenshtein Distance)

```typescript
function findFuzzyMatches(quote, textBlocks, threshold=0.15):
  normalizedQuote = normalize(quote)
  for each block in textBlocks:
    normalizedBlock = normalize(block.text)
    distance = levenshteinDistance(normalizedQuote, normalizedBlock)
    ratio = distance / max(normalizedQuote.length, normalizedBlock.length)
    if ratio <= threshold:
      matches.push(block)
  return matches
```

**Confidence**: 0.7
**Threshold**: Max 15% character difference
**Use Case**: Minor typos or AI paraphrasing
**Example**:
- Quote: `"Photosynthesis converts light"`
- Block: `"Photosynthesis converts lite"`
- Distance: 1, Ratio: 1/28 = 0.036 (MATCH ✓)

**Caution**: Only used as last resort due to lower precision

### Levenshtein Distance Implementation

Standard dynamic programming algorithm:

```typescript
function levenshteinDistance(str1, str2):
  Create DP table: dp[m+1][n+1]
  Initialize first row and column (0, 1, 2, ...)

  for i = 1 to m:
    for j = 1 to n:
      cost = (str1[i-1] === str2[j-1]) ? 0 : 1
      dp[i][j] = min(
        dp[i-1][j] + 1,      // Deletion
        dp[i][j-1] + 1,      // Insertion
        dp[i-1][j-1] + cost  // Substitution
      )

  return dp[m][n]
```

**Complexity**: O(m × n) where m, n are string lengths
**Optimization**: Could use Wagner-Fischer or Ukkonen for very long strings

---

## Integration Flow

### Graph Generator Service Integration

```typescript
// In GraphGeneratorService.generateGraph()

// Step 1: Format text with page markers
const formatResult = formatTextWithPageMarkers(
  documentText,
  textBlocks,
  { includeMarkers: true }
);

// Step 2: Send formatted text to AI
const aiResponse = await aiOrchestrator.execute({
  promptType: 'graph-generation',
  context: {
    documentText: formatResult.formattedText,  // Contains PAGE markers
    documentTitle,
  },
});

// Step 3: AI returns nodes with pageReferences + keyQuotes
const nodes = aiResponse.data.nodes;  // Each has keyQuote field

// Step 4: Match quotes to coordinates
const matchingResult = matchQuotesToCoordinates(nodes, textBlocks);

// Step 5: Store nodes with documentRefs in database
for (const node of matchingResult.nodes) {
  await prisma.node.create({
    data: {
      ...node,
      documentRefs: node.documentRefs,  // JSONB with {references: [{text, page, bbox}]}
    },
  });
}
```

### Database Storage

**nodes.documentRefs JSONB structure:**
```json
{
  "references": [
    {
      "text": "Photosynthesis is the process by which plants convert light energy",
      "page": 5,
      "bbox": {
        "x": 72,      // PDF points from left edge
        "y": 650,     // PDF points from bottom edge (NOT top!)
        "width": 400,
        "height": 48
      }
    }
  ]
}
```

### Frontend Usage

```typescript
// When user clicks on a node in the graph
const node = selectedNode;
const refs = node.documentRefs.references;

for (const ref of refs) {
  // Highlight region on PDF viewer
  pdfViewer.highlightRegion({
    page: ref.page,
    x: ref.bbox.x,
    y: ref.bbox.y,
    width: ref.bbox.width,
    height: ref.bbox.height,
  });
}
```

**Important**: PDF coordinate system has origin at **bottom-left**, not top-left!

---

## Quality Metrics

### Tracking Match Quality

```typescript
interface MatchingMetrics {
  totalQuotes: number;
  exactMatchRate: number;       // Percentage (target: >60%)
  normalizedMatchRate: number;
  tokenBasedMatchRate: number;
  fuzzyMatchRate: number;       // Percentage (target: <30%)
  failedMatchRate: number;      // Percentage (target: <10%)
  averageConfidence: number;    // 0-1 scale
  averageBlocksPerQuote: number; // Target: 1-3
}
```

### Success Criteria

| Metric | Target | Rationale |
|--------|--------|-----------|
| Exact match rate | >60% | Most quotes should be verbatim |
| Fuzzy match rate | <30% | Minimize low-confidence matches |
| Failed match rate | <10% | Most quotes should match |
| Average confidence | >0.85 | High overall quality |
| Blocks per quote | 1-3 | Precise, not too fragmented |

### Monitoring

```typescript
// Log metrics after each graph generation
logger.info('Quote matching metrics', {
  totalQuotes: metrics.totalQuotes,
  exactMatchRate: metrics.exactMatchRate.toFixed(1),
  failedMatchRate: metrics.failedMatchRate.toFixed(1),
  averageConfidence: metrics.averageConfidence.toFixed(2),
});
```

### Red Flags

- **Exact match rate <40%**: AI is paraphrasing too much → Improve prompt
- **Failed match rate >20%**: TextBlocks extraction may be faulty
- **Average blocks per quote >5**: Quotes are too long or fragmented

---

## Error Handling

### Graceful Degradation Strategy

**Principle**: Never fail graph generation due to matching failures. Always provide usable output.

```typescript
if (matchResult.references.length > 0) {
  // Success: Store with coordinates
  node.documentRefs = { references: matchResult.references };
} else {
  // Failure: Store without coordinates (graceful degradation)
  node.documentRefs = { references: [] };
  logger.warn(`No match for node ${node.id}: "${node.keyQuote}"`);
}
```

**Result**:
- User can still see the node in the graph
- User can still read the keyQuote text
- User just can't click to highlight (feature unavailable)
- Better than completely failing graph generation

### Common Failure Modes

| Issue | Cause | Solution |
|-------|-------|----------|
| No textBlocks provided | Document not a PDF | Skip matching, return nodes without coordinates |
| Empty keyQuote | AI didn't follow prompt | Warn and skip node |
| No matching blocks | Quote not verbatim | Log warning, store empty references |
| Multiple page references | Quote spans pages | Return first match only (limitation) |

### Warnings vs Errors

**Warnings** (log but continue):
- Individual quote match failed
- Fuzzy match used (lower confidence)
- Multiple blocks matched (may indicate ambiguity)

**Errors** (throw exception):
- textBlocks array is malformed
- Database write failure
- Out of memory (very rare)

---

## Testing

### Unit Test Coverage

**Page Marker Formatter:**
```typescript
describe('formatTextWithPageMarkers', () => {
  it('should format text with page markers');
  it('should handle empty textBlocks');
  it('should handle single page');
  it('should handle missing page numbers');
  it('should preserve paragraph breaks');
});
```

**Quote Matcher:**
```typescript
describe('matchQuoteToCoordinates', () => {
  // Exact match
  it('should find exact matches');

  // Normalized match
  it('should find normalized matches (case-insensitive)');
  it('should handle punctuation differences');

  // Token-based match
  it('should find token-based matches');
  it('should NOT match different concepts (e.g., Neural vs Social Networks)');

  // Fuzzy match
  it('should find fuzzy matches within threshold');
  it('should reject matches beyond threshold');

  // Edge cases
  it('should handle empty quote');
  it('should handle no textBlocks');
  it('should handle multi-block matches');
});
```

### Integration Testing

```typescript
describe('Graph Generation with Quote Matching', () => {
  it('should generate graph with coordinate references');
  it('should handle documents without textBlocks');
  it('should track matching metrics');
  it('should gracefully degrade on match failures');
});
```

### Test Data

**Sample textBlocks:**
```typescript
const testTextBlocks: TextBlock[] = [
  {
    text: "Photosynthesis is the process by which plants convert light energy into chemical energy.",
    page: 0,
    bbox: { x: 72, y: 650, width: 400, height: 48 },
  },
  {
    text: "Chlorophyll absorbs light primarily in the blue and red wavelengths.",
    page: 1,
    bbox: { x: 72, y: 600, width: 380, height: 36 },
  },
];
```

**Sample AI output:**
```typescript
const aiNodes = [
  {
    id: "A",
    title: "Photosynthesis",
    keyQuote: "Photosynthesis is the process by which plants convert light energy",
    pageReferences: [0],
  },
];
```

**Expected result:**
```typescript
{
  references: [
    {
      text: "Photosynthesis is the process by which plants convert light energy into chemical energy.",
      page: 0,
      bbox: { x: 72, y: 650, width: 400, height: 48 },
    },
  ],
}
```

---

## Future Improvements

### Phase 3 Enhancements

1. **Multi-Page Quote Handling**
   - Detect quotes that span multiple pages
   - Combine bounding boxes across pages
   - Return array of references for multi-page quotes

2. **Semantic Similarity Matching**
   - Use embeddings (e.g., sentence-transformers) for semantic matching
   - Handle AI paraphrasing more robustly
   - Still prefer exact matches when available

3. **Context-Aware Matching**
   - Consider surrounding text when matching
   - Use page numbers from AI as hint
   - Penalize matches on wrong pages

4. **Adaptive Thresholds**
   - Learn optimal thresholds from feedback
   - Adjust based on document type (academic paper vs textbook)
   - Track user corrections to improve matching

5. **Highlighting Optimization**
   - Merge adjacent blocks for smoother highlights
   - Handle line breaks within quotes
   - Support highlight colors based on confidence

### Performance Optimizations

1. **Caching**
   - Cache normalized text for reuse
   - Cache tokenization results
   - Use memoization for repeated quotes

2. **Parallel Processing**
   - Match multiple quotes in parallel
   - Use worker threads for large documents

3. **Index Structures**
   - Build inverted index of textBlocks by words
   - Use n-gram indexes for fuzzy matching
   - Optimize Levenshtein for common patterns

---

## References

### Internal Documentation

- [TECHNICAL.md](../../META/Core/TECHNICAL.md) - Overall system architecture
- [NODE_COORDINATE_REFERENCES.md](../../docs/NODE_COORDINATE_REFERENCES.md) - Database schema
- [REGULATION.md](../../META/Core/REGULATION.md) - Development principles

### External Resources

- [PDF.js Documentation](https://mozilla.github.io/pdf.js/) - PDF extraction
- [Levenshtein Distance Algorithm](https://en.wikipedia.org/wiki/Levenshtein_distance)
- [Jaccard Similarity](https://en.wikipedia.org/wiki/Jaccard_index)

### Code Files

```
src/lib/pdf/
├── page-marker-formatter.ts     # Page marker formatting
├── quote-matcher.ts              # Quote matching algorithm
└── MATCHING_META.md             # This file

src/services/
└── graph-generator.service.ts   # Integration point

src/types/
├── pdf.types.ts                  # TextBlock, BoundingBox
├── node.types.ts                 # NodeDocumentReference
└── validation.types.ts           # AIGraphOutput
```

---

## Change Log

### Version 1.0 (2025-11-15)
- Initial implementation
- Multi-tier matching strategy (exact → normalized → token-based → fuzzy)
- Page marker formatting
- Quality metrics tracking
- Graceful degradation on failures

---

**Maintainer**: Backend Team
**Questions/Feedback**: See [TECHNICAL.md](../../META/Core/TECHNICAL.md)

---

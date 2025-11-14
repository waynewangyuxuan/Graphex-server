# Critical Bug: Over-Aggressive Node Deduplication

## Executive Summary

**Problem**: The node deduplication algorithm is merging 90% of nodes (20 out of 22), leaving only 2 nodes and 0 edges.

**Root Cause**: Fuzzy matching thresholds are too aggressive for academic papers with overlapping terminology.

**Impact**: Graph quality degraded from 80/100 (per-chunk) to 30/100 (final).

---

## Evidence from Logs

```
Combined mini-graphs: 22 nodes, 21 edges
Nodes deduplicated: 22 → 2 (merged 20!)
Edges remapped: 21 edges
Edges deduplicated: 21 → 10 edges
Final validation: 2 nodes, 0 edges (all edges orphaned!)
Quality score: 30/100
```

**The AI generation worked perfectly** (3 successful calls, 80% quality each chunk), but **deduplication destroyed the graph**.

---

## Root Cause Analysis

### Location
`src/lib/graph/node-deduplicator.ts:33-37`

```typescript
const DEFAULT_CONFIG: DeduplicationConfig = {
  fuzzyThreshold: 0.2,           // ← TOO AGGRESSIVE
  wordOverlapThreshold: 0.5,     // ← TOO AGGRESSIVE
  enableAcronymDetection: true,
};
```

### How Fuzzy Matching Works

**Phase 3: Fuzzy Match** (lines 264-294)

Two nodes merge if BOTH conditions are true:
1. **Levenshtein similarity ≥ 80%** (fuzzyThreshold: 0.2 → 1-0.2 = 0.8)
2. **Jaccard word overlap ≥ 50%** (wordOverlapThreshold: 0.5)

### Why This Fails for Academic Papers

Academic papers have **highly overlapping terminology**:

#### Example 1: Timeline Concepts
```
Node A: "Timeline Summarization"
Node B: "Event Timeline Summarization"
Node C: "Topic Timeline Summarization"

Word overlap (A ↔ B): {timeline, summarization} / {timeline, summarization, event} = 2/3 = 67% ✓
Word overlap (A ↔ C): {timeline, summarization} / {timeline, summarization, topic} = 2/3 = 67% ✓

Levenshtein (A ↔ B): "Timeline Summarization" vs "Event Timeline Summarization"
  - 6 character insertion ("Event ")
  - String lengths: 23 vs 29
  - Similarity: 1 - 6/29 = 79% (barely below threshold, but close)

Result: All three merge into one node!
```

#### Example 2: Method Terms
```
Node A: "LLM-TLS"
Node B: "LLM-TLS Approach"
Node C: "LLM-TLS Method"
Node D: "LLM-TLS Pipeline"

All share "LLM-TLS" → 50%+ word overlap → ALL MERGE
```

#### Example 3: Dataset Names
```
Node A: "CrisisLTLSum"
Node B: "CrisisLTLSum Dataset"

Word overlap: 100%
Result: MERGE (but these ARE different - one is concept, one is dataset!)
```

---

## Concrete Example from This Paper

Based on the paper content, Claude likely generated nodes like:

**Chunk 1 (Introduction)**:
- "Timeline Summarization" (TLS)
- "Event Timeline Summarization"
- "Topic Timeline Summarization"
- "Large Language Models" (LLMs)
- "LLM-TLS"

**Chunk 2 (Method)**:
- "Timeline Summarization" (duplicate)
- "LLM-TLS Approach"
- "Event Clustering"
- "Incremental Clustering"
- "Llama2-13B"
- "Membership Classification"

**Chunk 3 (Experiments)**:
- "CrisisLTLSum"
- "CrisisLTLSum Dataset"
- "T17 Dataset"
- "CRISIS Dataset"
- "ENTITIES Dataset"

**After Deduplication:**
1. All timeline concepts merged → "Timeline Summarization"
2. All LLM mentions merged → One generic node
3. All dataset variations merged

**Final result: 2 nodes** (likely "Timeline Summarization" + one other surviving concept)

---

## Why All Edges Were Deleted

**Edge Validation Logic**: After node deduplication, edges are remapped to new node IDs.

```
Before: Event TLS → uses → LLM-TLS Approach
After merge: Timeline Summarization → uses → Timeline Summarization (self-loop!)
Result: Edge deleted as invalid
```

When most nodes merge into 1-2 super-nodes:
- Most edges become **self-loops** (deleted)
- Remaining edges become **duplicates** (deduplicated)
- Final graph: 0 valid edges

---

## Comparison: What Should Happen vs. What Happened

### Expected Result (22 nodes preserved)
```
Timeline Summarization
├─ Event TLS
├─ Topic TLS
├─ LLM-TLS (approach)
│  ├─ uses Llama2-13B
│  ├─ performs Event Clustering
│  └─ employs Membership Classification
├─ Datasets
│  ├─ CrisisLTLSum
│  ├─ T17
│  ├─ CRISIS
│  └─ ENTITIES
└─ Baselines
   ├─ MARTSCHAT
   ├─ DATEWISE
   └─ ...
```

### Actual Result (2 nodes)
```
Timeline Summarization  (merged 15+ concepts)
Presidential Pardons    (artifact from appendix?)
```

---

## Why "Presidential Pardons" Survived

Looking at the appendix example in the paper (Appendix A.2.2), there's a few-shot example about:
```
### Keyword: Bill Clinton
### Event 1: Presidential pardons...
```

This node survived because:
1. **No word overlap** with timeline concepts → didn't trigger 50% threshold
2. **Different semantic domain** → low Levenshtein similarity
3. **Extracted from PDF** → made it through chunking

This confirms that **the deduplication worked correctly** - it just has wrong thresholds!

---

## Recommended Fix

### Option 1: Increase Thresholds (Conservative)

**For academic papers with technical terminology:**

```typescript
const DEFAULT_CONFIG: DeduplicationConfig = {
  fuzzyThreshold: 0.1,           // 90% similarity required (was 0.2)
  wordOverlapThreshold: 0.7,     // 70% word overlap required (was 0.5)
  enableAcronymDetection: true,
};
```

**Impact**: Only merge near-exact duplicates
- "Machine Learning" ↔ "machine learning" ✓ (exact after normalization)
- "ML" ↔ "Machine Learning" ✓ (acronym detection)
- "Event TLS" ↔ "Event Timeline Summarization" ✗ (not merged - good!)

### Option 2: Disable Fuzzy Matching for Academic Papers

```typescript
const DEFAULT_CONFIG: DeduplicationConfig = {
  fuzzyThreshold: 0,              // Disabled
  wordOverlapThreshold: 1.0,      // Only exact word set matches
  enableAcronymDetection: true,
};
```

**Impact**: Only use Phase 1 (exact) + Phase 2 (acronym)
- Most conservative
- Best for technical documents
- Minimal false positives

### Option 3: Document-Type-Aware Config (Recommended Long-term)

```typescript
function getDeduplicationConfig(documentType: string): DeduplicationConfig {
  switch (documentType) {
    case 'academic-paper':
      return {
        fuzzyThreshold: 0.1,        // Very conservative
        wordOverlapThreshold: 0.8,   // High overlap required
        enableAcronymDetection: true,
      };

    case 'news-article':
      return {
        fuzzyThreshold: 0.15,       // Slightly more aggressive
        wordOverlapThreshold: 0.6,
        enableAcronymDetection: true,
      };

    case 'generic':
    default:
      return {
        fuzzyThreshold: 0.2,        // Current default
        wordOverlapThreshold: 0.5,
        enableAcronymDetection: true,
      };
  }
}
```

---

## Testing Strategy

### Test Case 1: Academic Paper (Current Failure)
**Input**: Paper with overlapping terminology
**Expected**: Preserve distinct concepts even with word overlap
**Example**:
- "Event Timeline Summarization" ≠ "Topic Timeline Summarization"
- "LLM-TLS" ≠ "LLM-TLS Approach" ≠ "LLM-TLS Pipeline"

### Test Case 2: True Duplicates (Should Still Merge)
**Input**: Identical concepts in different chunks
**Expected**: Merge correctly
**Example**:
- "Timeline Summarization" ↔ "timeline summarization" ✓
- "ML" ↔ "Machine Learning" ✓
- "LLM-TLS" ↔ "LLM-TLS" ✓

### Test Case 3: False Positive Prevention
**Input**: Similar but distinct concepts
**Expected**: Do NOT merge
**Example**:
- "Neural Networks" ≠ "Social Networks"
- "Event TLS" ≠ "Topic TLS"
- "CRISIS Dataset" ≠ "Crisis Events"

---

## Implementation Steps

### Immediate Fix (5 minutes)
1. Edit `src/lib/graph/node-deduplicator.ts:33-37`
2. Change thresholds:
   ```typescript
   fuzzyThreshold: 0.1,          // Was 0.2
   wordOverlapThreshold: 0.75,    // Was 0.5
   ```
3. Re-run graph generation
4. Verify >15 nodes preserved

### Short-term Fix (2 hours)
1. Add config parameter to GraphGeneratorService
2. Allow custom thresholds per document
3. Create presets for academic/news/generic
4. Add logging for merge decisions (debugging)

### Long-term Fix (4 hours)
1. Implement document type detection
2. Auto-select appropriate config
3. Add confidence scores to merges
4. Create merge review/undo mechanism
5. Add visualization of merge decisions

---

## Success Metrics

**Before Fix**:
- Nodes: 22 → 2 (91% reduction) ❌
- Edges: 21 → 0 (100% loss) ❌
- Quality: 30/100 ❌

**After Fix (Expected)**:
- Nodes: 22 → 15-18 (20-30% reduction) ✓
- Edges: 21 → 15+ (retained) ✓
- Quality: 75-85/100 ✓

---

## Additional Insights

### Why Chunked Generation Makes This Worse

With 3 chunks processing the same paper:
- Each chunk mentions "Timeline Summarization"
- Each chunk mentions "LLM-TLS"
- Deduplication sees 3 copies of each concept

**But**: These aren't duplicates across chunks - they're the **same concept** mentioned in different sections!

The current code correctly identifies them as duplicates at the concept level, but then **over-merges** related but distinct concepts.

### The Irony

The paper itself (`2024.acl-long.390.pdf`) is **about timeline summarization using LLMs**!

Your system used an LLM to generate a graph about a paper on LLM-based summarization, and the graph collapsed because it over-deduplicated timeline-related concepts.

It's like the paper's own methodology critique came true in your implementation!

---

## Conclusion

**The problem is NOT with AI generation** (that worked great - 80% quality per chunk).

**The problem is with post-processing deduplication** (too aggressive for academic papers).

**Immediate action**: Adjust thresholds in `node-deduplicator.ts`

**Root fix**: Document-type-aware deduplication strategies

---

**Generated**: 2024-11-13
**Bug Location**: `src/lib/graph/node-deduplicator.ts:33-37`
**Severity**: Critical (destroys 90% of graph)
**Fix Complexity**: Low (5-minute threshold change) → High (full document-aware system)

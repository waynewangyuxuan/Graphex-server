# Few-Shot Examples Proposal for Graph Generation

## Purpose
Provide diverse, domain-agnostic few-shot examples to improve graph extraction quality across all document types (not just AI/ML papers).

## Design Principles

1. **Domain Diversity**: Cover 5+ different domains
2. **Abstraction Levels**: Show both high-level and detailed concepts
3. **Relationship Variety**: Demonstrate different relationship types
4. **Quality Over Quantity**: 3-5 excellent examples > 10 mediocre ones

---

## Proposed Examples

### Example 1: Computer Science (Distributed Systems)

**Document Topic**: "Consensus Algorithms in Distributed Databases"

**Good Graph** (9 nodes):
```json
{
  "nodes": [
    {"id": "A", "title": "Distributed Consensus"},
    {"id": "B", "title": "Paxos Algorithm"},
    {"id": "C", "title": "Raft Algorithm"},
    {"id": "D", "title": "Leader Election"},
    {"id": "E", "title": "Log Replication"},
    {"id": "F", "title": "State Machine"},
    {"id": "G", "title": "Byzantine Fault Tolerance"},
    {"id": "H", "title": "Two-Phase Commit"},
    {"id": "I", "title": "Network Partitions"}
  ],
  "edges": [
    {"fromNodeId": "A", "toNodeId": "B", "relationship": "implemented-by"},
    {"fromNodeId": "A", "toNodeId": "C", "relationship": "implemented-by"},
    {"fromNodeId": "B", "toNodeId": "D", "relationship": "requires"},
    {"fromNodeId": "C", "toNodeId": "D", "relationship": "requires"},
    {"fromNodeId": "D", "toNodeId": "E", "relationship": "enables"},
    {"fromNodeId": "E", "toNodeId": "F", "relationship": "updates"},
    {"fromNodeId": "G", "toNodeId": "A", "relationship": "strengthens"},
    {"fromNodeId": "I", "toNodeId": "A", "relationship": "challenges"}
  ]
}
```

**What to avoid** (domain-specific examples):
- ❌ "Google Spanner" (specific product)
- ❌ "etcd cluster" (implementation detail)
- ❌ "Kubernetes StatefulSet" (application example)

---

### Example 2: Biology (Cell Biology)

**Document Topic**: "Signal Transduction Pathways in Apoptosis"

**Good Graph** (11 nodes):
```json
{
  "nodes": [
    {"id": "A", "title": "Apoptosis"},
    {"id": "B", "title": "Signal Transduction"},
    {"id": "C", "title": "Receptor Activation"},
    {"id": "D", "title": "Caspase Cascade"},
    {"id": "E", "title": "Mitochondrial Pathway"},
    {"id": "F", "title": "Death Receptor Pathway"},
    {"id": "G", "title": "Cytochrome C"},
    {"id": "H", "title": "DNA Fragmentation"},
    {"id": "I", "title": "Cell Membrane Blebbing"},
    {"id": "J", "title": "Bcl-2 Proteins"},
    {"id": "K", "title": "Extrinsic Pathway"}
  ],
  "edges": [
    {"fromNodeId": "A", "toNodeId": "B", "relationship": "initiated-by"},
    {"fromNodeId": "B", "toNodeId": "C", "relationship": "begins-with"},
    {"fromNodeId": "C", "toNodeId": "D", "relationship": "activates"},
    {"fromNodeId": "D", "toNodeId": "H", "relationship": "causes"},
    {"fromNodeId": "E", "toNodeId": "G", "relationship": "releases"},
    {"fromNodeId": "G", "toNodeId": "D", "relationship": "triggers"},
    {"fromNodeId": "J", "toNodeId": "E", "relationship": "regulates"},
    {"fromNodeId": "F", "toNodeId": "D", "relationship": "activates"},
    {"fromNodeId": "K", "toNodeId": "F", "relationship": "is-type-of"}
  ]
}
```

**What to avoid**:
- ❌ "Tumor Necrosis Factor" (specific protein, unless central to paper)
- ❌ "HeLa cells" (experimental model)
- ❌ "Cancer treatment" (application context)

---

### Example 3: Economics (Monetary Policy)

**Document Topic**: "Central Bank Interest Rate Policy and Inflation Control"

**Good Graph** (10 nodes):
```json
{
  "nodes": [
    {"id": "A", "title": "Monetary Policy"},
    {"id": "B", "title": "Interest Rates"},
    {"id": "C", "title": "Inflation Control"},
    {"id": "D", "title": "Money Supply"},
    {"id": "E", "title": "Open Market Operations"},
    {"id": "F", "title": "Reserve Requirements"},
    {"id": "G", "title": "Discount Rate"},
    {"id": "H", "title": "Price Stability"},
    {"id": "I", "title": "Economic Growth"},
    {"id": "J", "title": "Transmission Mechanism"}
  ],
  "edges": [
    {"fromNodeId": "A", "toNodeId": "B", "relationship": "adjusts"},
    {"fromNodeId": "B", "toNodeId": "C", "relationship": "controls"},
    {"fromNodeId": "A", "toNodeId": "D", "relationship": "manages"},
    {"fromNodeId": "E", "toNodeId": "D", "relationship": "modifies"},
    {"fromNodeId": "F", "toNodeId": "D", "relationship": "constrains"},
    {"fromNodeId": "G", "toNodeId": "B", "relationship": "influences"},
    {"fromNodeId": "C", "toNodeId": "H", "relationship": "achieves"},
    {"fromNodeId": "B", "toNodeId": "I", "relationship": "affects"},
    {"fromNodeId": "J", "toNodeId": "B", "relationship": "propagates"}
  ]
}
```

**What to avoid**:
- ❌ "Federal Reserve" (specific institution)
- ❌ "2008 Financial Crisis" (historical event)
- ❌ "Quantitative Easing during COVID" (specific policy)

---

### Example 4: Physics (Quantum Mechanics)

**Document Topic**: "Quantum Entanglement and Bell's Inequality"

**Good Graph** (8 nodes):
```json
{
  "nodes": [
    {"id": "A", "title": "Quantum Entanglement"},
    {"id": "B", "title": "Bell's Inequality"},
    {"id": "C", "title": "Local Realism"},
    {"id": "D", "title": "Measurement"},
    {"id": "E", "title": "Superposition"},
    {"id": "F", "title": "Wave Function Collapse"},
    {"id": "G", "title": "Non-locality"},
    {"id": "H", "title": "EPR Paradox"}
  ],
  "edges": [
    {"fromNodeId": "A", "toNodeId": "B", "relationship": "violates"},
    {"fromNodeId": "B", "toNodeId": "C", "relationship": "tests"},
    {"fromNodeId": "C", "toNodeId": "A", "relationship": "contradicted-by"},
    {"fromNodeId": "D", "toNodeId": "F", "relationship": "causes"},
    {"fromNodeId": "E", "toNodeId": "F", "relationship": "precedes"},
    {"fromNodeId": "A", "toNodeId": "G", "relationship": "demonstrates"},
    {"fromNodeId": "H", "toNodeId": "A", "relationship": "describes"}
  ]
}
```

**What to avoid**:
- ❌ "Photon pair experiment" (experimental setup)
- ❌ "CHSH inequality" (specific variant)
- ❌ "Aspect's experiment 1982" (historical test)

---

### Example 5: Literature/Humanities (Narrative Theory)

**Document Topic**: "Focalization and Narrative Perspective in Modern Fiction"

**Good Graph** (9 nodes):
```json
{
  "nodes": [
    {"id": "A", "title": "Narrative Perspective"},
    {"id": "B", "title": "Focalization"},
    {"id": "C", "title": "Internal Focalization"},
    {"id": "D", "title": "External Focalization"},
    {"id": "E", "title": "Narrative Voice"},
    {"id": "F", "title": "Point of View"},
    {"id": "G", "title": "Reader Engagement"},
    {"id": "H", "title": "Unreliable Narrator"},
    {"id": "I", "title": "Free Indirect Discourse"}
  ],
  "edges": [
    {"fromNodeId": "A", "toNodeId": "B", "relationship": "comprises"},
    {"fromNodeId": "B", "toNodeId": "C", "relationship": "has-type"},
    {"fromNodeId": "B", "toNodeId": "D", "relationship": "has-type"},
    {"fromNodeId": "A", "toNodeId": "E", "relationship": "includes"},
    {"fromNodeId": "F", "toNodeId": "B", "relationship": "relates-to"},
    {"fromNodeId": "C", "toNodeId": "G", "relationship": "enhances"},
    {"fromNodeId": "H", "toNodeId": "C", "relationship": "is-variant-of"},
    {"fromNodeId": "I", "toNodeId": "C", "relationship": "technique-for"}
  ]
}
```

**What to avoid**:
- ❌ "Virginia Woolf's Mrs. Dalloway" (specific work)
- ❌ "Stream of consciousness in Ulysses" (literary example)
- ❌ "Modernist fiction" (historical period, unless core focus)

---

## How to Use These Examples

### Option 1: Inline in Prompt (Lightweight)
Add a single diverse example after constraints section:

```markdown
## Example (for reference only)

For a paper on "Distributed Consensus Algorithms":
✅ GOOD nodes: "Paxos Algorithm", "Leader Election", "Log Replication"
❌ AVOID: "Google Spanner", "etcd cluster", "Kubernetes"

Focus on the **concepts and techniques**, not the **products or applications**.
```

### Option 2: Full Few-Shot (Comprehensive)
Add 2-3 complete examples from different domains:

```markdown
## Examples

### Example 1: Biology Paper
[Full graph structure as shown above]

### Example 2: Economics Paper
[Full graph structure as shown above]

These examples span different domains to show the generality of the approach.
```

### Option 3: Negative Examples Only (Minimalist)
Just show what NOT to include:

```markdown
## Common Mistakes to Avoid

Regardless of domain, EXCLUDE:
- ❌ Specific products/brands (e.g., "Google Spanner" in CS, "Federal Reserve" in economics)
- ❌ Historical events (e.g., "2008 Financial Crisis", "COVID-19 pandemic")
- ❌ Experimental setups (e.g., "HeLa cells", "photon pair experiment")
- ❌ Proper names (e.g., "Virginia Woolf", "Einstein")

Focus on the CONCEPTUAL framework, not the examples used to illustrate it.
```

---

## Recommendation

Start with **Option 3 (Negative Examples Only)** because:
1. ✅ Minimal token overhead
2. ✅ Clear, actionable guidance
3. ✅ Domain-agnostic by nature
4. ✅ Addresses the "Presidential Pardons" issue directly

If quality doesn't improve, upgrade to **Option 1** (single diverse example).

Only use **Option 2** if we see consistent domain-specific bias across multiple test cases.

---

## Testing Plan

1. **Before**: Test on 5 papers from different domains
   - AI/ML (current test case)
   - Biology/medicine
   - Economics/social science
   - Physics/mathematics
   - Humanities/literature

2. **After**: Add chosen option, test same 5 papers

3. **Metric**: Count domain-specific examples that slip through

**Success Criteria**: <10% of nodes are domain examples (vs. current ~7% = 1/15)

---

## Alternative: Zero-Shot Instruction

Instead of examples, strengthen the instruction itself:

```markdown
**CRITICAL DISTINCTION**:
- The document is ABOUT something (the domain/application)
- The document CONTRIBUTES something (the concepts/techniques)

**Extract the CONTRIBUTION, not the APPLICATION**.

Examples across domains:
- AI paper about presidential pardons → Extract LLM techniques, NOT pardons
- Biology paper using rat models → Extract cellular mechanisms, NOT rats
- Economics paper analyzing 2008 crisis → Extract policy tools, NOT the crisis
```

This may be more effective than examples because it teaches the **meta-principle**.

---

## Conclusion

**Immediate action**: Add Option 3 (Negative Examples) or Alternative (Meta-Principle) to current prompt.

**If needed**: Upgrade to Option 1 or Option 2 based on test results.

**Key insight**: The problem isn't lack of examples—it's lack of clear distinction between "domain context" and "conceptual contribution".

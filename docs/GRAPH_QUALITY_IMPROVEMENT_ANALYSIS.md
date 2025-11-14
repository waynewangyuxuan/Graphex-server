# Graph Quality Improvement Analysis

**Date**: 2024-11-14
**Based on**: Academic paper test case (2024.acl-long.390.pdf)
**Current Quality**: 90/100 (good structure, needs refinement)

---

## Executive Summary

The semantic deduplication system is now working correctly (22→15 nodes, not 22→2). However, user feedback reveals opportunities to improve **concept selection** and **relationship modeling** through prompt engineering.

**Key Insight**: The system correctly identifies a *knowledge graph* (concepts + relationships) rather than a *process flowchart* (steps + sequence). This is the right approach. We need to refine *which* concepts to extract and *how* to model their relationships.

---

## Current Output Analysis

### ✅ What Works Well

1. **True Semantic Graph**: Creates concept relationships, not procedural steps
2. **Descriptive Edges**: Uses verbs like "leverages", "enables", "requires" (not generic "relates to")
3. **Appropriate Abstraction**: Focuses on high-level concepts, not implementation details
4. **Good Interconnectedness**: Shows dependency web (16 edges for 15 nodes = 1.07 density)
5. **Correct Node Count**: 15 nodes (within 7-15 target range)

### 🔧 Issues Identified

#### 1. **Irrelevant Concept Inclusion** (Critical)
- **"Presidential Pardons"** (Node 2): This is a *domain example* used in paper prompts, not a *system concept*
- **Pattern**: Confusing content domain with system architecture
- **Impact**: Dilutes graph with noise, confuses learners

#### 2. **Missing Critical Concepts** (High Priority)
The paper describes key technical components not captured:
- **LoRA Fine-tuning** (critical training technique)
- **GTE Embeddings** (embedding model used)
- **Vector Database** (retrieval infrastructure)
- **CrisisLTLSum Dataset** (training data)
- **Membership vs Pairwise Classification** (two distinct LLM approaches)

**Pattern**: System favors high-frequency terms over architecturally critical components

#### 3. **Insufficient Differentiation** (Medium Priority)
- Event TLS vs Topic TLS are treated uniformly
- The paper describes distinct pipelines, but graph doesn't show this divergence
- **Pattern**: Over-generalization loses important distinctions

#### 4. **Missing Hierarchical Structure** (Medium Priority)
No grouping of related concepts:
- **Core Tech**: LLMs, Embeddings, Clustering
- **Processes**: Event Extraction, Timeline Generation
- **Outputs**: Event Timeline, Topic Timeline

**Pattern**: Flat structure loses conceptual layers

#### 5. **Vague Relationships** (Low Priority)
Some edges could be more specific:
- "Timeline Summarization → generates → Topic Timeline"
  - Better: "LLM-TLS Pipeline → produces via → Milestone Event Selection → Topic Timeline"

---

## Root Cause Analysis

### Why Does This Happen?

1. **Frequency Bias**: LLMs naturally weight frequently-mentioned concepts higher
2. **Surface-Level Extraction**: System extracts what's *explicitly stated* vs. what's *architecturally fundamental*
3. **No Domain Context**: Prompt doesn't distinguish between:
   - System architecture concepts (what to keep)
   - Domain examples (what to filter)
   - Implementation details (what to abstract)

4. **No Relationship Taxonomy**: Prompt doesn't guide relationship types:
   - Hierarchical: "is-a", "part-of"
   - Functional: "enables", "requires", "produces"
   - Temporal: "precedes", "triggers"

---

## Generalized Improvement Principles

### Principle 1: Domain vs. Architecture Separation
**Problem**: Mixing content domain with system concepts
**Solution**: Explicit filtering instruction

```
When extracting concepts:
- INCLUDE: System components, algorithms, techniques, data structures
- EXCLUDE: Domain-specific examples, use cases, sample data
- Example: In a paper about "LLM-TLS for Presidential Pardons"
  - ✅ Include: "LLM-TLS System", "Event Clustering"
  - ❌ Exclude: "Presidential Pardons" (domain example)
```

### Principle 2: Architectural Importance Over Frequency
**Problem**: High-frequency terms dominate, critical components missed
**Solution**: Importance-based selection criteria

```
Prioritize concepts that are:
1. **Enabling technologies** (without them, system doesn't work)
   - Example: "LoRA Fine-tuning", "GTE Embeddings"
2. **Novel contributions** (what makes this paper unique)
   - Example: "Pseudo-Oracle Classification", "Incremental Clustering"
3. **Core processes** (main pipeline stages)
   - Example: "Event Extraction", "Milestone Selection"

De-prioritize:
- Generic terms mentioned frequently but not central to innovation
- Domain-specific examples
- Low-level implementation details
```

### Principle 3: Relationship Type Taxonomy
**Problem**: Relationships are vague ("involves", "relates to")
**Solution**: Structured relationship vocabulary

```
Use specific relationship types:

**Hierarchical**:
- "is-a" (inheritance)
- "part-of" (composition)
- "instance-of" (specialization)

**Functional**:
- "enables" (makes possible)
- "requires" (dependency)
- "produces" (output)
- "consumes" (input)
- "leverages" (uses capability)

**Temporal**:
- "precedes" (sequence)
- "triggers" (causation)

**Transformational**:
- "trained-via" (learning)
- "fine-tuned-with" (specialization)
- "embedded-by" (representation)

Avoid:
- "relates to" (too vague)
- "connects to" (meaningless)
- "involves" (unclear direction)
```

### Principle 4: Hierarchical Grouping
**Problem**: Flat structure loses conceptual layers
**Solution**: Layer-based extraction

```
Extract concepts in layers:

**Layer 1: System/Pipeline Level** (1-3 nodes)
- Top-level system name
- Major subsystems

**Layer 2: Core Technologies** (3-5 nodes)
- Key algorithms
- Enabling techniques
- Data structures

**Layer 3: Processes** (4-6 nodes)
- Pipeline stages
- Core operations

**Layer 4: Outputs** (2-3 nodes)
- Final products
- Intermediate artifacts

Then connect layers with typed relationships.
```

### Principle 5: Distinguish Variants/Modes
**Problem**: Event TLS vs Topic TLS treated identically
**Solution**: Explicit variant modeling

```
When paper describes multiple modes/variants:
1. Create parent concept ("Timeline Summarization")
2. Create variant nodes ("Event TLS", "Topic TLS")
3. Show distinctions:
   - "Timeline Summarization" --[has-mode]--> "Event TLS"
   - "Timeline Summarization" --[has-mode]--> "Topic TLS"
   - "Event TLS" --[uses]--> "Incremental Clustering"
   - "Topic TLS" --[uses]--> "Event Graph Modeling"
```

---

## Proposed Prompt Improvements

### Addition 1: Concept Selection Guidelines

```markdown
### Concept Selection Strategy (CRITICAL)

**What to INCLUDE**:
1. **System Components**
   - Core algorithms (e.g., "Incremental Clustering", "Pseudo-Oracle Classification")
   - Key technologies (e.g., "Large Language Models", "LoRA Fine-tuning")
   - Data structures (e.g., "Event Graph", "Vector Database")

2. **Novel Contributions**
   - What makes this paper unique vs. prior work
   - New techniques or approaches introduced

3. **Architectural Elements**
   - Major subsystems or pipelines
   - Critical dependencies (without X, system doesn't work)

**What to EXCLUDE**:
1. **Domain Examples**
   - Specific use cases mentioned (e.g., "Presidential Pardons", "COVID-19 tweets")
   - Sample data or datasets used for evaluation only
   - Real-world application scenarios

2. **Low-Level Details**
   - Hyperparameters (unless architecturally significant)
   - Specific model versions (unless comparing them is the point)
   - Implementation minutiae

3. **Generic Terms**
   - Overly broad concepts that apply to many systems
   - Common ML terms without paper-specific meaning

**Test**: Ask "If I removed this concept, would the paper's core contribution be unclear?"
- Yes → Include it
- No → Probably exclude it
```

### Addition 2: Relationship Type Guidelines

```markdown
### Relationship Modeling (CRITICAL)

**Use SPECIFIC relationship types**:

**Architecture relationships**:
- `has-component`: System has major parts (e.g., "LLM-TLS" --[has-component]--> "Event TLS")
- `has-mode`: System operates in variants (e.g., "TLS" --[has-mode]--> "Event TLS")
- `implements`: Concrete realization (e.g., "LLM-TLS" --[implements]--> "Timeline Summarization")

**Functional relationships**:
- `enables`: Makes something possible (e.g., "LLMs" --[enables]--> "Pseudo-Oracle")
- `requires`: Dependency (e.g., "Incremental Clustering" --[requires]--> "Similarity Retrieval")
- `produces`: Output (e.g., "Event TLS" --[produces]--> "Event Timeline")
- `consumes`: Input (e.g., "Event Extraction" --[consumes]--> "Tweet Stream")
- `leverages`: Uses capability (e.g., "TLS" --[leverages]--> "LLMs")

**Technical relationships**:
- `trained-via`: Learning method (e.g., "Pseudo-Oracle" --[trained-via]--> "LoRA Fine-tuning")
- `embedded-by`: Representation (e.g., "Tweets" --[embedded-by]--> "GTE Embeddings")
- `retrieved-from`: Data source (e.g., "Similar Tweets" --[retrieved-from]--> "Vector Database")

**Process relationships**:
- `precedes`: Temporal order (e.g., "Event Extraction" --[precedes]--> "Clustering")
- `triggers`: Causation (e.g., "New Event" --[triggers]--> "Incremental Update")

**AVOID generic relationships**:
- ❌ "relates to"
- ❌ "connects to"
- ❌ "associated with"
- ❌ "involves"

These are too vague to be useful.
```

### Addition 3: Hierarchical Structure Instruction

```markdown
### Hierarchical Grouping

Organize concepts in **3-4 layers**:

**Layer 1: System Level** (1-2 nodes)
- The overall system/approach (e.g., "LLM-TLS System")
- Major subsystems if distinct (e.g., "Event TLS", "Topic TLS")

**Layer 2: Core Technologies** (3-5 nodes)
- Key algorithms (e.g., "Incremental Clustering", "Pseudo-Oracle")
- Enabling techniques (e.g., "LoRA Fine-tuning", "GTE Embeddings")
- Infrastructure (e.g., "Vector Database")

**Layer 3: Processes** (4-6 nodes)
- Pipeline stages (e.g., "Event Extraction", "Milestone Selection")
- Core operations (e.g., "Similarity Retrieval", "Clustering")

**Layer 4: Outputs** (2-3 nodes)
- Final products (e.g., "Event Timeline", "Topic Timeline")
- Intermediate artifacts (e.g., "Event Graph")

**Connect layers** with typed relationships to show information flow.
```

---

## Expected Impact

### Before (Current)
```
Nodes: 15
Issues:
- 1 irrelevant concept ("Presidential Pardons")
- 5 missing critical concepts
- Vague relationships
- Flat structure

Quality: 90/100
```

### After (With Improvements)
```
Nodes: 15-18
Expected:
- 0 irrelevant concepts (domain filtering)
- All critical concepts included
- Specific relationship types
- Clear hierarchical structure

Estimated Quality: 95-98/100
```

### Metrics to Track
1. **Precision**: % of nodes that are architecturally relevant
2. **Recall**: % of critical concepts captured (human-labeled ground truth)
3. **Relationship Specificity**: % of edges with typed relationships (not "relates to")
4. **Hierarchical Coherence**: Graph has clear layers (measurable via graph metrics)

---

## Implementation Plan

### Phase 1: Prompt Enhancement (Immediate)
- [ ] Add concept selection guidelines to prompt template
- [ ] Add relationship type taxonomy to prompt template
- [ ] Add hierarchical structure instruction
- [ ] Add domain vs. architecture filtering examples

### Phase 2: Validation Updates (Follow-up)
- [ ] Update validator to penalize domain examples in nodes
- [ ] Update validator to reward specific relationship types
- [ ] Update validator to measure hierarchical structure

### Phase 3: Quality Metrics (Future)
- [ ] Define ground truth for test papers
- [ ] Measure precision/recall of concept extraction
- [ ] A/B test prompt versions

---

## Test Case: Expected Improved Output

### Improved Node List (18 nodes)
```
Layer 1: System
1. LLM-TLS System
2. Event TLS (mode)
3. Topic TLS (mode)

Layer 2: Core Technologies
4. Large Language Models (Llama2-13B)
5. LoRA Fine-tuning
6. Pseudo-Oracle Classification
7. GTE Embeddings
8. Vector Database
9. Incremental Clustering

Layer 3: Processes
10. Event Extraction
11. Membership Classification (Event TLS)
12. Pairwise Classification (Topic TLS)
13. Similarity Retrieval
14. Event Graph Construction
15. Milestone Event Selection

Layer 4: Outputs
16. Event Timeline
17. Topic Timeline
18. Event Graph
```

### Improved Relationships (typed)
```
1. LLM-TLS --[has-mode]--> Event TLS
2. LLM-TLS --[has-mode]--> Topic TLS
3. LLM-TLS --[leverages]--> Large Language Models
4. Large Language Models --[trained-via]--> LoRA Fine-tuning
5. Large Language Models --[enables]--> Pseudo-Oracle Classification
6. Event TLS --[uses]--> Incremental Clustering
7. Topic TLS --[uses]--> Incremental Clustering
8. Incremental Clustering --[requires]--> Similarity Retrieval
9. Similarity Retrieval --[uses]--> GTE Embeddings
10. Similarity Retrieval --[queries]--> Vector Database
11. Event TLS --[performs]--> Event Extraction
12. Event TLS --[applies]--> Membership Classification
13. Topic TLS --[applies]--> Pairwise Classification
14. Topic TLS --[constructs]--> Event Graph Construction
15. Event Graph Construction --[enables]--> Milestone Event Selection
16. Event TLS --[produces]--> Event Timeline
17. Topic TLS --[produces]--> Topic Timeline
18. Event Graph Construction --[produces]--> Event Graph
```

---

## Generalization to Other Domains

These principles apply to **any academic/technical document**:

1. **Distinguish domain from system** (works for medical, finance, robotics papers)
2. **Prioritize architectural importance** (works for any system description)
3. **Use typed relationships** (works for any knowledge graph)
4. **Create hierarchical layers** (works for any complex system)

**Key Insight**: The prompt should teach the LLM to think like a **systems architect**, not a **keyword extractor**.

---

## Conclusion

The graph generation system is **structurally sound** (correct graph type, good deduplication). The next improvement is **prompt engineering** to guide better concept selection and relationship modeling.

**Next Steps**:
1. Update prompt template with new guidelines
2. Test on same paper
3. Compare before/after quality
4. Iterate based on results

**Success Metric**: User feedback shifts from "good structure, wrong concepts" to "exactly what I needed".

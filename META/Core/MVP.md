# MVP Feature Prioritization (2-Week Sprint)

## Core Philosophy for MVP
Focus on the **unique learning cycle** that differentiates this from existing tools: Graph → Read → Generate → Test. Cut everything that doesn't directly support this core loop.

---

## MUST HAVE (Week 1 - Days 1-7)

### Feature 1: Basic Graph Generation & Display
**Scope**: 
- Upload single document (PDF, text, markdown)
- AI generates Mermaid graph with 7-15 nodes
- **Full graph only** for MVP (skip skeleton option - adds complexity)
- Directed edges only (skip bidirectional for now)
- Simple relationship labels ("relates to", "leads to", "supports")

**Why Essential**: This IS the product. Without graph, there's nothing.

**Technical Estimate**: 3-4 days
- Document parsing: 1 day
- AI prompt engineering for graph generation: 1 day  
- Mermaid rendering: 1 day
- Basic UI: 1 day

---

### Feature 2: Integrated Reading Interface (Simplified)
**Scope**:
- Side panel shows source document
- Click node → jump to relevant section in side panel
- Highlight the corresponding passage (even just the paragraph)
- **No fancy breadcrumbs or animations yet**

**Why Essential**: Without this, users can't actually DO the reading. This is what prevents learned helplessness.

**Technical Estimate**: 2 days
- Click handler and scroll-to-section: 1 day
- Layout (graph + side panel): 1 day

---

### Feature 3: Node Notes (Basic)
**Scope**:
- Click node → open note modal
- Text field for users to write notes
- Save notes (local storage is fine for MVP)
- Show indicator when node has notes

**Why Essential**: Active processing is critical. Note-taking forces engagement.

**Technical Estimate**: 1 day

---

## SHOULD HAVE (Week 1 - Day 7 to Week 2 - Day 10)

### Feature 4: Pre-Explanation Retrieval (CRITICAL)
**Scope**:
- Click edge/connection between nodes
- Prompt: "Why do you think these are connected?"
- User types explanation (minimum 15 words)
- Show AI's explanation + relevant source text
- **Skip the "AI evaluates your answer" part for MVP**

**Why High Priority**: This single feature prevents fluency illusion and provides 30% retention boost. Highest ROI for development time.

**Technical Estimate**: 2 days
- UI flow: 1 day
- AI prompt for connection explanation: 1 day

---

### Feature 5: Basic Comprehension Check
**Scope**:
- After user engages with 5+ nodes, trigger quiz
- 3-5 multiple choice questions about the content
- Questions like:
  - "Which concept leads to X?"
  - "What's the relationship between A and B?"
  - "Which node represents [definition]?"
- Show score and correct answers
- **No adaptive difficulty or mastery tracking yet**

**Why High Priority**: Testing effect is one of strongest cognitive interventions. Must include for product to deliver on learning promise.

**Technical Estimate**: 2 days
- Question generation (AI): 1 day
- Quiz UI: 1 day

---

## NICE TO HAVE (Week 2 - Days 11-14, if time permits)

### Feature 6: Connection Notes
**Scope**: Same as node notes, but for edges
**Estimate**: 0.5 days

### Feature 7: Basic Note Export
**Scope**: Download all notes as markdown
**Estimate**: 0.5 days

### Feature 8: Multiple Graph Options
**Scope**: AI generates 2-3 different graph layouts, user picks one
**Why Useful**: Acknowledges different mental models, adds perceived value
**Estimate**: 1 day

---

## EXPLICITLY CUT FROM MVP

**Do NOT build these (save for v2)**:
- ❌ Spaced repetition system (requires user accounts, scheduling infrastructure)
- ❌ Multi-document synthesis (doubles complexity)
- ❌ Skeleton graphs (adds option complexity)
- ❌ Graph customization/rearrangement (significant UI work)
- ❌ Bidirectional relationships (can use directed for now)
- ❌ Typed relationship labels (use generic for MVP)
- ❌ Metacognitive scaffolding (confidence ratings, etc.)
- ❌ Prior knowledge activation
- ❌ Collaborative features
- ❌ Progressive disclosure / sub-graphs
- ❌ Note organization/tagging/search
- ❌ AI evaluation of user's explanations

---

## Recommended 2-Week Timeline

**Week 1: Core Loop**
- Days 1-4: Graph generation + display
- Days 5-6: Integrated reading interface  
- Day 7: Basic node notes

**Week 2: Active Learning**
- Days 8-9: Pre-explanation retrieval
- Days 10-11: Comprehension checks
- Days 12-14: Polish, bug fixes, stretch features if time

---

## MVP Success Criteria

After 2 weeks, users should be able to:
1. ✅ Upload a document
2. ✅ See it visualized as a knowledge graph
3. ✅ Click nodes to read corresponding sections
4. ✅ Add notes to nodes
5. ✅ Generate their own explanations before seeing AI's
6. ✅ Test their understanding via quiz

This demonstrates the **core insight**: learning through structured, active engagement with knowledge graphs.

---

## Key Technical Decisions for Speed

**Use existing tools**:
- Mermaid.js for graph rendering (don't build from scratch)
- OpenAI API or Anthropic API for AI features
- Simple React or Next.js frontend
- Local storage for MVP (no backend needed initially)
- PDF.js or similar for document parsing

**Simplify scope**:
- Single document only
- No user accounts (stateless, or browser storage only)
- No responsive design perfection (desktop-first)
- Hardcode some prompts (don't build prompt management system)

**What to prototype quickly**:
- AI prompts (most iteration needed here - quality of graph and explanations determines value)
- Core UX flow (graph → read → note → test)

---

## Post-MVP Roadmap Teaser

After validating the MVP, prioritize in this order:
1. **Week 3-4**: Spaced repetition (high cognitive impact)
2. **Week 5-6**: Multi-document synthesis (key differentiator)
3. **Week 7-8**: Skeleton graphs + customization (engagement boost)
4. **Week 9+**: Metacognitive features, collaboration

---

**Bottom Line**: Build Features 1-5 in that exact order. These five features create a complete learning loop grounded in cognitive science. Everything else is enhancement. If you only ship these five, you have a viable product that delivers real learning benefits.

Want me to help you spec out the AI prompts for graph generation and connection explanations? That's likely where you'll spend the most iteration time.
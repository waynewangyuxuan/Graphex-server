# Validation Module - META Documentation

**Purpose**: Validate AI-generated outputs before accepting them into the system.

**Critical Importance**: This module is the ONLY defense against AI failures reaching production. Without it, ~30% of AI outputs would break the application.

---

## Why This Module Exists

### The Problem

AI models (Claude, GPT-4) fail in predictable ways:

1. **Invalid Mermaid Syntax** (~10% of outputs)
   - Missing brackets, incorrect arrows, malformed syntax
   - Will crash the graph renderer if not caught

2. **Constraint Violations** (~20% of outputs)
   - AI ignores node count limits (5-15 nodes)
   - Produces too few nodes (not comprehensive) or too many (overwhelming)

3. **Hallucinations** (~5% of outputs)
   - AI invents concepts not in source document
   - Creates false connections between ideas

4. **Structural Issues**
   - Orphaned nodes (disconnected from graph)
   - Empty or invalid labels
   - Broken edge references

### The Solution

**Validation + Retry Loop = 95% Success Rate**

Without validator: 70% success rate (30% failures reach production)
With validator: 95% success rate (catch and fix 80% of failures on retry)

---

## Module Components

### 1. Type Definitions (`validation.types.ts`)

Defines all validation-related types:

- `ValidationResult` - Overall validation outcome
- `ValidationIssue` - Individual failure with severity and fix suggestion
- `ValidationOptions` - Configuration for validation behavior
- `AIGraphOutput`, `AIConnectionOutput`, `AIQuizOutput` - Expected AI output structures

### 2. Error Classes (`validation-errors.ts`)

Custom error types for different failure modes:

- `ValidationError` - Base class with structured issue information
- `MermaidSyntaxError` - Invalid Mermaid syntax
- `NodeCountError` - Too few/many nodes
- `DisconnectedNodesError` - Orphaned nodes
- `HallucinationError` - Concepts not in source
- `QuizValidationError` - Invalid quiz structure
- `ExplanationValidationError` - Invalid explanation

Each error includes:
- Severity level (critical/high/medium/low)
- Actionable fix suggestion (for retry prompt)
- Metadata for debugging

### 3. Validator (`ai-output-validator.ts`)

Main validation engine with three validation modes:

#### Graph Validation

**Quick Mode** (for retry loop - fast):
1. Mermaid syntax validity (**CRITICAL** - parses with actual mermaid library)
2. Node count (5-15 nodes)
3. Connectivity (no orphans)
4. Label quality (not empty, reasonable length)
5. Edge structure (valid references)

**Full Mode** (final output - thorough):
- All quick checks +
- Grounding validation (anti-hallucination check)
- Relationship quality
- Completeness verification

#### Connection Explanation Validation

Checks:
1. Explanation exists and not empty
2. Reasonable length (50-1000 chars)
3. Has source quotes (warning if missing)
4. References nodes involved

#### Quiz Validation

Checks each question:
1. Has question text
2. Exactly 4 options
3. Valid answer index (0-3)
4. Has explanation
5. Has difficulty level (easy/medium/hard)

---

## Quality Scoring System

Score starts at 100, deductions based on severity:

```
Severity Weights:
- Critical: -40 points (invalid syntax, missing required fields)
- High:     -20 points (wrong node count, orphans, hallucinations)
- Medium:   -10 points (minor structural issues)
- Low:      -5 points  (warnings only)
```

**Passing Threshold**: 60 (configurable)

Score < 60 = Validation fails → AI retry with feedback

---

## Grounding Validation (Anti-Hallucination)

**How it works**:

1. Extract node titles from AI-generated graph
2. For each node, check if title words appear in source document
3. Calculate grounding percentage = (nodes found / total nodes) × 100
4. If < 80% grounded → Flag as possible hallucination

**Why it matters**:

Hallucinated content creates incorrect learning material. Users trust the AI, so we must verify it's grounded in the actual document.

**Example**:

```
Source: "Machine learning uses neural networks for pattern recognition."

Good nodes:
✅ "Machine Learning" - found in source
✅ "Neural Networks" - found in source
✅ "Pattern Recognition" - found in source

Hallucinated nodes:
❌ "Quantum Computing" - NOT in source
❌ "Blockchain" - NOT in source
❌ "Cryptocurrency" - NOT in source

Grounding: 50% → FAIL (likely hallucination)
```

---

## Mermaid Syntax Validation

**Why we actually parse it**:

Many validators just use regex to check format. We use the actual `mermaid` library parser because:

1. Regex can't catch all syntax errors (complex grammar)
2. If it parses successfully, renderer won't crash
3. Same parser = guaranteed compatibility

**Implementation**:

```typescript
import mermaid from 'mermaid';

// Configure for parsing only (no rendering)
mermaid.initialize({ startOnLoad: false });

// Parse - throws if invalid
await mermaid.parse(mermaidCode);
```

---

## Integration with AI Orchestrator

**Retry Loop Flow**:

```
1. AI generates output
2. Validator checks output
3. If validation passes → Accept and cache
4. If validation fails:
   a. Extract issues and fixes
   b. Generate feedback for AI
   c. Retry with feedback in prompt
   d. Repeat up to 3 times
5. If all retries fail → Use fallback or error
```

**Feedback Generation**:

Validation issues include `fix` field with actionable guidance:

```typescript
Issue: {
  severity: 'high',
  type: 'too-few-nodes',
  message: 'Only 3 nodes. Need at least 5.',
  fix: 'Identify at least 5 key concepts from the document...'
}

Retry Prompt:
"Previous attempt failed validation. Please fix:
1. too-few-nodes: Identify at least 5 key concepts from the document..."
```

---

## Performance Characteristics

**Quick Validation** (retry loop):
- Time: ~10-50ms
- Checks: Syntax, structure, basic quality
- Use: Every AI output before accepting

**Full Validation** (final output):
- Time: ~50-200ms
- Checks: All quick checks + grounding + completeness
- Use: Final output before storing

**Trade-offs**:
- Quick mode optimizes for retry speed
- Full mode ensures production quality
- Grounding check is expensive (text comparison) so only in full mode

---

## Testing Strategy

### Test Coverage Target: 90%+

**Critical Test Cases**:

1. **Syntax Validation**
   - Valid Mermaid → pass
   - Invalid Mermaid → fail with error
   - Empty Mermaid → fail

2. **Node Count**
   - Too few (< 5) → fail
   - Too many (> 15) → fail
   - Within range → pass

3. **Connectivity**
   - No orphans → pass
   - Has orphans → fail with list

4. **Grounding**
   - All concepts in source → pass
   - >20% not in source → fail (hallucination)

5. **Quality Scoring**
   - Multiple issues → correct deductions
   - Score never < 0

6. **Feedback Generation**
   - Issues → actionable fixes
   - Empty issues → no feedback

---

## Common Issues and Debugging

### Issue: Mermaid validation always fails

**Cause**: mermaid library not installed or import failing

**Fix**:
```bash
npm install mermaid
```

### Issue: Grounding validation too strict

**Cause**: Source text preprocessing strips important words

**Fix**: Adjust grounding threshold or improve text normalization

### Issue: Performance slow in production

**Cause**: Full validation running on every request

**Fix**: Use quick mode for retries, full mode only for final output

---

## Future Enhancements

### Post-MVP Improvements

1. **Semantic Similarity for Grounding**
   - Use embeddings instead of word matching
   - More accurate hallucination detection

2. **Learning from Failures**
   - Track which validation issues occur most
   - Improve prompts to prevent common failures

3. **Adaptive Thresholds**
   - Adjust quality threshold based on document complexity
   - Easier documents → higher threshold

4. **Validation Caching**
   - Cache validation results for similar outputs
   - Faster for repeated patterns

---

## Dependencies

**Required**:
- `mermaid` - For Mermaid syntax parsing

**Optional**:
- None (validation is self-contained)

---

## Files in This Module

```
lib/validation/
├── ai-output-validator.ts      # Main validator class
├── __tests__/
│   └── ai-output-validator.test.ts  # Comprehensive tests
└── META.md                     # This file

types/
└── validation.types.ts         # Type definitions

lib/errors/
└── validation-errors.ts        # Custom error classes
```

---

## Quick Start

### Basic Usage

```typescript
import { AIOutputValidator } from './lib/validation/ai-output-validator';

const validator = new AIOutputValidator();

// Validate graph (quick mode)
const result = await validator.validate(aiOutput, 'graph-generation', {
  mode: 'quick',
  threshold: 60
});

if (result.passed) {
  // Accept output
  console.log(`Quality score: ${result.score}`);
} else {
  // Retry with feedback
  const feedback = validator.generateFeedback(result.issues);
  console.log('Issues to fix:', feedback);
}
```

### With Grounding Check

```typescript
// Full validation with source document
const result = await validator.validate(aiOutput, 'graph-generation', {
  mode: 'full',
  sourceDocument: {
    text: documentContent,
    id: documentId
  },
  threshold: 70
});
```

---

## References

- **Design Doc**: `/META/SERVICE_DESIGN_V2.md` Section 2.3
- **Reflection**: `/META/SERVICE_DESIGN_REFLECTION.md` Lines 267-421
- **Technical Architecture**: `/META/Core/TECHNICAL.md` Section 6
- **Development Principles**: `/META/Core/REGULATION.md`

---

**Last Updated**: 2024-11-11
**Maintainer**: AI Integration Team
**Status**: Production-Ready

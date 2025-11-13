# Prompt Manager Service - Technical Documentation

**Version:** 1.0
**Created:** 2024-11-11
**Purpose:** Centralized AI prompt template management with versioning, performance tracking, and A/B testing support

---

## Overview

The Prompt Manager is the single source of truth for all AI prompts in the Graphex system. It provides:

1. **Centralized Template Management** - All prompts in one location (`lib/ai/prompt-templates.ts`)
2. **Version Control** - Support for production, staging, and experimental prompt versions
3. **Dynamic Context Injection** - Type-safe variable substitution with validation
4. **Performance Tracking** - Record quality scores, costs, and success rates for each prompt version
5. **Model Recommendations** - Intelligent model selection based on task complexity
6. **A/B Testing** - Compare different prompt versions to optimize quality and cost

---

## Architecture

### Design Philosophy

**WHY separate prompt management from AI orchestration?**

1. **Data-Driven Optimization**: By tracking performance metrics for each prompt version, we can scientifically determine which prompts produce the best results.
2. **Rapid Iteration**: Change prompts without modifying code. Deploy new versions to staging first, then promote to production.
3. **Cost Control**: Track per-prompt costs and optimize expensive operations.
4. **A/B Testing**: Run experiments comparing different prompt formulations to improve quality.
5. **Decoupling**: Prompt design is a distinct skill from API integration. Separating concerns allows specialists to focus.

### Core Components

```
Prompt Manager System
├── Types (src/types/prompt.types.ts)
│   ├── PromptTemplate: Template definition with metadata
│   ├── PromptContext: Dynamic data for variable substitution
│   ├── BuiltPrompt: Final prompt ready for AI API
│   ├── PromptOutcome: Performance tracking data
│   └── ModelRecommendation: Suggested model for task
│
├── Templates (src/lib/ai/prompt-templates.ts)
│   ├── Graph Generation (production + experimental)
│   ├── Connection Explanation (production)
│   ├── Quiz Generation (production)
│   └── Image Description (production)
│
└── Service (src/services/prompt-manager.service.ts)
    ├── build(): Construct prompts from templates
    ├── recordOutcome(): Track performance metrics
    ├── getStats(): Retrieve statistics
    ├── getRecommendedModel(): Model selection logic
    └── compareVersions(): A/B testing support
```

---

## Prompt Template Structure

### Template Anatomy

```typescript
{
  id: 'graph-generation-v1-production',
  type: 'graph-generation',
  version: 'production',

  // System prompt sets AI behavior/context
  systemPrompt: `You are an expert knowledge graph architect...`,

  // Main prompt template with {{variable}} placeholders
  template: `
    # Task: Extract Knowledge Graph

    Document: {{documentTitle}}
    Content: {{documentText}}

    ## Requirements
    - Extract 7-15 key concepts
    - Ground each concept in source text
    ...
  `,

  // Metadata for validation and documentation
  metadata: {
    author: 'Graphex Team',
    created: new Date('2024-11-11'),
    description: 'Production graph generation prompt',
    requiredContext: ['documentText', 'documentTitle'],
    optionalContext: ['validationFeedback'],
    constraints: {
      nodeCount: { min: 7, max: 15 }
    }
  },

  // Performance stats (populated over time)
  stats: {
    totalUses: 1243,
    successRate: 92.5,
    avgQualityScore: 85.3,
    avgCost: 0.045,
    avgRetries: 1.2
  }
}
```

### Template Variables

**Simple Variables:**
```
{{documentTitle}} → "Machine Learning Basics"
{{documentText}} → "Machine learning is..."
```

**Nested Properties:**
```
{{nodeA.title}} → "Photosynthesis"
{{nodeA.snippet}} → "Process by which plants..."
{{imageContext.pageNumber}} → 12
```

**Conditionals:**
```handlebars
{{#if userHypothesis}}
  User thinks: {{userHypothesis}}
{{/if}}
```

---

## Usage Examples

### Basic Usage: Build Prompt

```typescript
import { PromptManagerService } from './services/prompt-manager.service';
import { redisClient } from './config/redis';
import { logger } from './utils/logger';

const promptManager = new PromptManagerService(redisClient, logger);

// Build graph generation prompt
const context = {
  documentText: 'Machine learning is a subset of AI that...',
  documentTitle: 'Introduction to ML'
};

const built = await promptManager.build('graph-generation', context);

console.log(built.systemPrompt);  // System instructions for AI
console.log(built.userPrompt);    // Document-specific prompt
console.log(built.metadata.estimatedTokens);  // ~3500 tokens
```

### Model Recommendation

```typescript
// Get recommended model for task
const recommendation = promptManager.getRecommendedModel(
  'graph-generation',
  context
);

console.log(recommendation);
// {
//   model: 'claude-haiku',
//   reason: 'Document size allows cost-effective model...',
//   estimatedCost: 0.012,
//   fallbacks: ['claude-sonnet-4', 'gpt-4-turbo']
// }
```

### Performance Tracking

```typescript
// After AI call completes, record outcome
const outcome = {
  qualityScore: 85,      // From AI output validator (0-100)
  cost: 0.045,           // Actual API cost
  success: true,         // Passed validation
  retries: 1,            // Number of attempts needed
  processingTimeMs: 2500,
  model: 'claude-haiku'
};

await promptManager.recordOutcome(
  'graph-generation',
  'production',
  outcome
);
```

### A/B Testing

```typescript
// Compare all versions of a prompt type
const comparison = await promptManager.compareVersions('graph-generation');

console.log(comparison);
// {
//   versions: [
//     {
//       version: 'production',
//       stats: { successRate: 92, avgQualityScore: 85, ... },
//       recommendation: 'use'
//     },
//     {
//       version: 'experimental',
//       stats: { successRate: 88, avgQualityScore: 88, ... },
//       recommendation: 'test'
//     }
//   ],
//   bestVersion: 'production'  // Based on composite score
// }
```

---

## Prompt Design Guidelines

### 1. Clear Instructions

**Good:**
```
Extract 7-15 key concepts from the document.
Each concept must be explicitly mentioned in the source text.
```

**Bad:**
```
Find important stuff from the document.
```

### 2. Explicit Output Format

**Good:**
```json
Return JSON:
{
  "mermaidCode": "flowchart TD\\n  A[Concept] --> B[Concept]",
  "nodes": [
    {
      "key": "A",
      "title": "Concept Name",
      "snippet": "Description",
      "documentRefs": [...]
    }
  ]
}
```

**Bad:**
```
Return a graph structure.
```

### 3. Anti-Hallucination Constraints

**Critical Rules:**
```
- ONLY extract concepts explicitly discussed in the document
- Do NOT add your own knowledge beyond what's stated
- All snippets must be verbatim from source text
- If uncertain, prefer fewer high-quality nodes over many low-quality ones
```

### 4. Recovery Instructions

```
If document is too short or lacks coherent concepts:
- Return minimal graph with explanation
- Set confidence score low
- Provide feedback on why full graph couldn't be generated
```

### 5. Constraints

```
## Constraints
- Minimum 7 nodes, maximum 15 nodes
- Each node MUST have at least one documentRef
- Mermaid syntax must be valid
- Relationship types must be specific verbs
```

---

## Model Selection Strategy

The Prompt Manager implements intelligent model selection based on task complexity and cost:

### Decision Tree

```
Graph Generation:
├─ Document > 40k chars → Claude Sonnet 4 (complex reasoning needed)
└─ Document ≤ 40k chars → Claude Haiku (cost-effective, with Sonnet fallback)

Image Description:
└─ Always → Claude Sonnet 4 (requires vision capabilities)

Connection Explanation:
└─ Always → Claude Haiku (simple task, fast and cheap)

Quiz Generation:
└─ Always → Claude Haiku (straightforward generation)
```

### Cost Considerations

| Model | Input (per 1M) | Output (per 1M) | Use Case |
|-------|----------------|-----------------|----------|
| Claude Haiku | $0.25 | $1.25 | Simple tasks, small docs |
| Claude Sonnet 4 | $3.00 | $15.00 | Complex reasoning, large docs |
| GPT-4 Turbo | $10.00 | $30.00 | Fallback when Claude unavailable |

**Example Costs:**
- Small doc (5k tokens) with Haiku: ~$0.002
- Large doc (40k tokens) with Sonnet: ~$0.12
- Graph generation (avg): $0.03-0.08

---

## Performance Tracking

### Metrics Tracked

1. **Success Rate** (0-100%): Percentage of requests that passed validation
2. **Quality Score** (0-100): Average score from AI output validator
3. **Average Cost** (USD): Mean cost per request
4. **Average Retries** (1.0+): Mean number of attempts needed (1.0 = no retries)
5. **Total Uses**: Number of times prompt was used

### Composite Scoring

To compare prompt versions, we calculate a weighted composite score:

```typescript
score =
  (successRate × 0.4) +      // 40% weight - most important
  (qualityScore × 0.3) +     // 30% weight
  (costEfficiency × 0.2) +   // 20% weight (inverse - lower is better)
  (reliability × 0.1)        // 10% weight (fewer retries is better)
```

**Example:**
```
Production version:
- Success rate: 92% → 36.8 points
- Quality: 85 → 25.5 points
- Cost efficiency: 90 → 18 points
- Reliability: 85 → 8.5 points
Total: 88.8 points

Experimental version:
- Success rate: 88% → 35.2 points
- Quality: 88 → 26.4 points
- Cost efficiency: 75 → 15 points
- Reliability: 70 → 7 points
Total: 83.6 points

→ Keep production version
```

### Recommendations

- **Use**: Success ≥ 85%, Quality ≥ 75%, Total uses ≥ 10
- **Test**: Mediocre performance or < 10 uses
- **Retire**: Success < 70% or Quality < 60%

---

## Integration with AI Orchestrator

The Prompt Manager is designed to be used by the AI Orchestrator service:

```typescript
// AI Orchestrator workflow
class AIOrchestrator {
  async executeRequest(request: AIRequest) {
    // 1. Build prompt using Prompt Manager
    const prompt = await this.promptManager.build(
      request.type,
      request.context,
      request.config?.promptVersion
    );

    // 2. Get model recommendation
    const modelRec = this.promptManager.getRecommendedModel(
      request.type,
      request.context
    );

    // 3. Call AI API with fallback cascade
    const response = await this.callAI(prompt, modelRec);

    // 4. Validate response
    const validation = await this.validator.validate(response);

    // 5. Record outcome for continuous improvement
    await this.promptManager.recordOutcome(
      request.type,
      prompt.metadata.version,
      {
        qualityScore: validation.score,
        cost: this.calculateCost(response),
        success: validation.passed,
        retries: attemptCount
      }
    );

    return response;
  }
}
```

---

## Testing Strategy

### Test Coverage

1. **Template Retrieval**
   - Production/staging/experimental versions
   - Error handling for non-existent templates

2. **Context Validation**
   - Required fields present/missing
   - Optional fields handling

3. **Context Injection**
   - Simple variables (strings, numbers)
   - Nested properties (object.property)
   - Complex objects (JSON serialization)
   - Conditionals (if/else blocks)

4. **Model Recommendations**
   - Document size thresholds
   - Task-specific logic
   - Cost estimates

5. **Performance Tracking**
   - Outcome recording
   - Running average calculations
   - Stats retrieval

6. **A/B Testing**
   - Version comparison
   - Composite scoring
   - Recommendations

### Running Tests

```bash
npm test -- src/services/__tests__/prompt-manager.service.test.ts
```

**Expected Results:**
- 29 tests passing
- Coverage: >95%

---

## Future Enhancements

### Phase 2 Features

1. **Advanced Templating**
   - Use Handlebars/Mustache for more sophisticated logic
   - Support for loops, filters, helpers

2. **Prompt Chaining**
   - Multi-step prompts (analyze → extract → validate)
   - Pass output from one prompt as input to next

3. **User-Specific Prompts**
   - Personalize based on user learning level
   - Adapt to user preferences

4. **Automatic Optimization**
   - ML-based prompt tuning
   - Genetic algorithms for prompt evolution
   - Reinforcement learning from user feedback

5. **Prompt Marketplace**
   - Community-contributed prompts
   - Ratings and reviews
   - Version forking

---

## Troubleshooting

### Common Issues

**Issue: Missing context variable error**
```
Error: Missing required context fields for graph-generation-v1-production: documentText
```

**Solution:** Ensure all required context fields are provided:
```typescript
const context = {
  documentText: '...',  // Required
  documentTitle: '...'  // Required
};
```

---

**Issue: Template not found**
```
Error: No template found for type=graph-generation, version=staging
```

**Solution:** Check that template version exists in `prompt-templates.ts`:
```typescript
import { getTemplateVersions } from './lib/ai/prompt-templates';
console.log(getTemplateVersions('graph-generation'));
```

---

**Issue: Poor success rates**
```
Stats show 65% success rate for experimental version
```

**Solution:**
1. Review validation failures in logs
2. Adjust prompt constraints or instructions
3. Consider different model (Sonnet vs Haiku)
4. Add more examples or clarifications

---

## References

- **Service Implementation**: `src/services/prompt-manager.service.ts`
- **Type Definitions**: `src/types/prompt.types.ts`
- **Template Library**: `src/lib/ai/prompt-templates.ts`
- **Tests**: `src/services/__tests__/prompt-manager.service.test.ts`
- **Service Design**: `META/SERVICE_DESIGN_V2.md`
- **Architecture**: `META/Core/TECHNICAL.md`

---

**Maintained by:** Graphex Team
**Last Updated:** 2024-11-11
**Version:** 1.0

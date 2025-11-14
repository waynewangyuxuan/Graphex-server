/**
 * Centralized AI Prompt Templates
 *
 * Single source of truth for all AI prompts with versioning support.
 * Each prompt is carefully crafted with:
 * - Clear instructions for AI
 * - Explicit output format specification
 * - Anti-hallucination constraints
 * - Recovery instructions for edge cases
 *
 * WHY: Centralized templates enable A/B testing, version control,
 * and data-driven prompt improvement based on quality metrics.
 */

import { PromptTemplate, PromptType, PromptVersion } from '../../types/prompt.types';

/**
 * All prompt templates organized by type and version
 */
const PROMPT_TEMPLATES: PromptTemplate[] = [
  // ============================================================
  // GRAPH GENERATION PROMPTS
  // ============================================================
  {
    id: 'graph-generation-v1-production',
    type: 'graph-generation',
    version: 'production',
    systemPrompt: `You are an expert knowledge graph architect specializing in educational content analysis. Your role is to extract key concepts and their relationships from documents to create clear, learner-friendly knowledge graphs.

Your outputs are used by students to understand complex topics, so prioritize clarity, accuracy, and pedagogical value.`,
    template: `# Task: Extract Knowledge Graph from Document

Analyze the following document and extract 7-15 key concepts and their relationships to create a knowledge graph.

## Document
Title: {{documentTitle}}

Content:
{{documentText}}

## Requirements

### Concept Selection (7-15 nodes)
- Extract the MOST IMPORTANT concepts from the document
- Each concept must be explicitly mentioned in the source text
- Prefer fundamental concepts that form the backbone of understanding
- Avoid overly granular details (too specific) or overly broad concepts (too vague)
- Each concept should be understandable to the target learning audience

### Relationships (Edges)
Use SPECIFIC relationship types from this taxonomy:

**Hierarchical relationships:**
- "is-a" (inheritance/classification)
- "part-of" (composition)
- "has-component" (system contains parts)
- "instance-of" (specialization)
- "has-mode" (variant or operating mode)

**Functional relationships:**
- "enables" (makes possible)
- "requires" (dependency)
- "produces" (output/result)
- "consumes" (input)
- "leverages" (uses capability)
- "supports" (aids or assists)

**Technical relationships:**
- "trained-via" (learning method)
- "embedded-by" (representation method)
- "retrieved-from" (data source)
- "implements" (concrete realization)

**Process relationships:**
- "precedes" (temporal sequence)
- "triggers" (causation)
- "leads to" (consequence)

**Comparative relationships:**
- "contradicts" (opposition)
- "strengthens" (reinforcement)
- "challenges" (questions or tests)

**AVOID vague relationships:**
- ❌ "relates to"
- ❌ "connects to"
- ❌ "associated with"
- ❌ "involves"

Each relationship should help learners understand how concepts interact

### Source Grounding (CRITICAL)
- ONLY extract concepts that are explicitly discussed in the document
- For each node, provide direct quotes from the source text
- Include character positions (start, end) for each reference
- If uncertain about a concept, prefer omitting it over hallucinating

### Output Format
Return a JSON object with this EXACT structure:

{
  "mermaidCode": "flowchart TD\\n  A[Concept 1] --> B[Concept 2]\\n  B --> C[Concept 3]",
  "nodes": [
    {
      "id": "A",
      "title": "Concept Name",
      "description": "Brief 1-2 sentence description from the document",
      "metadata": {
        "documentRefs": [
          {
            "start": 150,
            "end": 320,
            "text": "exact quote from document mentioning this concept"
          }
        ]
      }
    }
  ],
  "edges": [
    {
      "fromNodeId": "A",
      "toNodeId": "B",
      "relationship": "enables",
      "metadata": {
        "strength": 0.9
      }
    }
  ]
}

## Constraints
- Minimum 7 nodes, maximum 15 nodes
- Each node MUST have unique id (A, B, C, etc.)
- Each node MUST have at least one documentRef in metadata
- Mermaid syntax must be valid (test it mentally)
- All node IDs referenced in edges must exist in nodes array
- Use fromNodeId and toNodeId fields for edges (not "from" and "to")
- Relationship types must be specific verbs/phrases
- If document is too short or lacks coherent concepts, return minimal graph with explanation

## Anti-Hallucination Rules
- Do NOT invent concepts not in the document
- Do NOT add your own knowledge or common sense beyond what's stated
- If unsure, prefer fewer high-quality nodes over many low-quality ones
- All snippets and documentRefs must be verbatim from source text

IMPORTANT: Return ONLY the JSON object, no explanations or commentary.

Begin:`,
    metadata: {
      author: 'Graphex Team',
      created: new Date('2024-11-11'),
      description: 'Production prompt for graph generation with strict grounding requirements',
      requiredContext: ['documentText', 'documentTitle'],
      optionalContext: ['validationFeedback'],
      constraints: {
        nodeCount: { min: 7, max: 15 },
        maxTokens: 16000,
      },
    },
  },

  // ============================================================
  // CONNECTION EXPLANATION PROMPTS
  // ============================================================
  {
    id: 'connection-explanation-v1-production',
    type: 'connection-explanation',
    version: 'production',
    systemPrompt: `You are an expert educator who explains relationships between concepts in clear, accessible language. You help learners understand WHY and HOW concepts are connected.`,
    template: `# Task: Explain Connection Between Two Concepts

Explain the relationship between these two concepts from a knowledge graph.

## Concept A
Title: {{nodeA.title}}
Description: {{nodeA.snippet}}

## Concept B
Title: {{nodeB.title}}
Description: {{nodeB.snippet}}

## Stated Relationship
"{{nodeA.title}}" {{relationship}} "{{nodeB.title}}"

{{#if userHypothesis}}
## User's Hypothesis
The learner thinks: "{{userHypothesis}}"
{{/if}}

## Instructions
Provide a clear, concise explanation (2-4 sentences) that:
1. Explains WHY this relationship exists
2. Cites specific evidence from the original document
3. Uses accessible language suitable for learners
{{#if userHypothesis}}
4. Validates or corrects the user's hypothesis respectfully
{{/if}}

## Output Format
Return a JSON object:
{
  "explanation": "Your 2-4 sentence explanation here",
  "sourceQuote": "Relevant quote from original document supporting this relationship",
  {{#if userHypothesis}}
  "hypothesisAssessment": {
    "correct": true/false,
    "feedback": "Brief feedback on user's thinking"
  },
  {{/if}}
  "confidence": 0.9  // 0-1 scale
}

Begin:`,
    metadata: {
      author: 'Graphex Team',
      created: new Date('2024-11-11'),
      description: 'Explains relationships between graph nodes with optional hypothesis validation',
      requiredContext: ['nodeA', 'nodeB', 'relationship'],
      optionalContext: ['userHypothesis', 'documentText'],
    },
  },

  // ============================================================
  // QUIZ GENERATION PROMPTS
  // ============================================================
  {
    id: 'quiz-generation-v1-production',
    type: 'quiz-generation',
    version: 'production',
    systemPrompt: `You are an expert assessment designer who creates effective multiple-choice questions to test understanding of knowledge graphs. Your questions test conceptual understanding, not just memorization.`,
    template: `# Task: Generate Quiz Questions from Knowledge Graph

Create 3-5 multiple-choice questions that test understanding of this knowledge graph.

## Graph Structure
{{graphData}}

## Instructions

### Question Distribution
- 2 questions: Test understanding of individual concepts (definitions, properties)
- 2 questions: Test understanding of relationships between concepts
- 1 question: Test application or synthesis (if graph complexity allows)

### Quality Requirements
- Each question should have 4 answer options
- Exactly ONE correct answer
- Distractors should be plausible but clearly wrong to someone who understands
- Avoid trick questions or ambiguous wording
- Questions should progressively increase in difficulty

### Output Format
Return a JSON array:
[
  {
    "questionText": "What is the primary function of X?",
    "options": [
      "Option A",
      "Option B (correct)",
      "Option C",
      "Option D"
    ],
    "correctIndex": 1,
    "explanation": "Brief explanation of why B is correct and others are wrong",
    "difficulty": "easy" | "medium" | "hard",
    "conceptsTested": ["NodeKey1", "NodeKey2"]
  }
]

## Constraints
- Minimum 3 questions, maximum 5 questions
- All options must be distinct and plausible
- Explanations should reference the graph structure
- Difficulty should progress: start easy, end hard

Begin:`,
    metadata: {
      author: 'Graphex Team',
      created: new Date('2024-11-11'),
      description: 'Generates comprehension quiz questions from knowledge graphs',
      requiredContext: ['graphData'],
      constraints: {
        questionCount: { min: 3, max: 5 },
        maxTokens: 8000,
      },
    },
  },

  // ============================================================
  // IMAGE DESCRIPTION PROMPTS
  // ============================================================
  {
    id: 'image-description-v1-production',
    type: 'image-description',
    version: 'production',
    systemPrompt: `You are a vision AI specialist who describes images for integration into knowledge graphs. Focus on extracting educational content and concepts, not decorative elements.`,
    template: `# Task: Describe Image for Knowledge Graph Integration

Analyze this image and extract relevant concepts for a knowledge graph.

{{#if imageContext.caption}}
## Image Caption
{{imageContext.caption}}
{{/if}}

{{#if imageContext.pageNumber}}
## Context
This image appears on page {{imageContext.pageNumber}} of the document.
{{/if}}

## Instructions

### What to Extract
- Key concepts illustrated in the image (diagrams, charts, etc.)
- Relationships shown visually (arrows, connections, hierarchies)
- Labels, annotations, or text in the image
- Educational value (what does this teach?)

### What to Ignore
- Decorative elements
- Background details
- Aesthetic qualities
- Low-value metadata

### Output Format
Return a JSON object:
{
  "description": "Clear 2-3 sentence description of educational content",
  "concepts": [
    {
      "name": "Concept Name",
      "description": "What the image shows about this concept"
    }
  ],
  "relationships": [
    {
      "from": "Concept A",
      "to": "Concept B",
      "type": "relationship type shown in image"
    }
  ],
  "educationalValue": "high" | "medium" | "low",
  "integrationSuggestion": "How to integrate this into the knowledge graph"
}

## Anti-Hallucination
- Only describe what you can clearly see
- If image quality is poor or content unclear, say so
- Don't infer concepts not visually present

Begin:`,
    metadata: {
      author: 'Graphex Team',
      created: new Date('2024-11-11'),
      description: 'Extracts concepts and relationships from document images for graph integration',
      requiredContext: ['imageData'],
      optionalContext: ['imageContext'],
    },
  },

  // ============================================================
  // EXPERIMENTAL/STAGING VERSIONS
  // ============================================================
  {
    id: 'graph-generation-v2-experimental',
    type: 'graph-generation',
    version: 'experimental',
    systemPrompt: `You are an expert knowledge graph architect specializing in educational content analysis. Your role is to extract key concepts and their relationships from documents to create clear, learner-friendly knowledge graphs.

Your outputs are used by students to understand complex topics, so prioritize clarity, accuracy, and pedagogical value.`,
    template: `# Task: Extract Knowledge Graph from Document

[EXPERIMENTAL: This version tests chain-of-thought reasoning before graph generation]

## Step 1: Analyze Document Structure
First, read through the document and identify:
- Main themes
- Key arguments or concepts
- Logical flow of ideas

## Step 2: Select Core Concepts (7-15)
From your analysis, select the most important concepts that:
- Form the backbone of understanding
- Are explicitly discussed in the text
- Connect to form a coherent narrative

## Step 3: Map Relationships
For each pair of related concepts, identify:
- The type of relationship
- The strength of connection
- Supporting evidence from text

## Step 4: Generate Graph

Document:
Title: {{documentTitle}}
Content: {{documentText}}

[Rest of prompt similar to v1...]`,
    metadata: {
      author: 'Graphex Team',
      created: new Date('2024-11-11'),
      description: 'EXPERIMENTAL: Chain-of-thought version testing improved reasoning',
      requiredContext: ['documentText', 'documentTitle'],
      constraints: {
        nodeCount: { min: 7, max: 15 },
        maxTokens: 20000,
      },
    },
  },
];

/**
 * Get all templates for a specific type and version
 */
export function getTemplate(
  type: PromptType,
  version: PromptVersion = 'production'
): PromptTemplate {
  const template = PROMPT_TEMPLATES.find(
    (t) => t.type === type && t.version === version
  );

  if (!template) {
    throw new Error(`No template found for type=${type}, version=${version}`);
  }

  return template;
}

/**
 * Get all versions of a prompt type for A/B testing
 */
export function getTemplateVersions(type: PromptType): PromptTemplate[] {
  return PROMPT_TEMPLATES.filter((t) => t.type === type);
}

/**
 * Get all templates (for admin/debugging)
 */
export function getAllTemplates(): PromptTemplate[] {
  return [...PROMPT_TEMPLATES];
}

/**
 * Export for external use
 */
export { PROMPT_TEMPLATES };

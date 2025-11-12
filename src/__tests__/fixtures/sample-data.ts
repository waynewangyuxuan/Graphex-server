/**
 * Sample Test Data Fixtures
 *
 * WHY: Provides static, realistic test data for consistent testing
 */

/**
 * Sample document content
 */
export const sampleDocumentText = `
# Introduction to Knowledge Graphs

Knowledge graphs are structured representations of information that capture entities and their relationships. They provide a powerful way to organize, discover, and reason about complex information.

## Core Concepts

A knowledge graph consists of nodes (entities) and edges (relationships). Nodes represent concepts, objects, or entities, while edges describe how these entities are connected.

### Benefits

- Enhanced information discovery
- Better context understanding
- Improved reasoning capabilities
- Semantic search support

## Applications

Knowledge graphs are used in various domains including search engines, recommendation systems, and natural language processing.
`;

/**
 * Sample Mermaid graph code
 */
export const sampleMermaidCode = `
graph TD
  A[Knowledge Graph] --> B[Nodes]
  A --> C[Edges]
  B --> D[Entities]
  B --> E[Concepts]
  C --> F[Relationships]
  D --> F
  E --> F
  A --> G[Applications]
  G --> H[Search Engines]
  G --> I[Recommendations]
  G --> J[NLP]
`;

/**
 * Sample graph data structure
 */
export const sampleGraphData = {
  nodes: [
    {
      id: 'node-1',
      nodeKey: 'A',
      title: 'Knowledge Graph',
      contentSnippet: 'Structured representations of information capturing entities and relationships',
      documentRefs: [{ start: 0, end: 150, text: 'Knowledge graphs are structured...' }],
    },
    {
      id: 'node-2',
      nodeKey: 'B',
      title: 'Nodes',
      contentSnippet: 'Represent concepts, objects, or entities in the graph',
      documentRefs: [{ start: 200, end: 280, text: 'Nodes represent concepts...' }],
    },
    {
      id: 'node-3',
      nodeKey: 'C',
      title: 'Edges',
      contentSnippet: 'Describe connections and relationships between nodes',
      documentRefs: [{ start: 280, end: 350, text: 'edges describe how entities are connected' }],
    },
  ],
  edges: [
    {
      id: 'edge-1',
      fromNodeId: 'node-1',
      toNodeId: 'node-2',
      relationship: 'consists_of',
      aiExplanation: 'Knowledge graphs consist of nodes as fundamental building blocks',
      strength: 0.95,
    },
    {
      id: 'edge-2',
      fromNodeId: 'node-1',
      toNodeId: 'node-3',
      relationship: 'consists_of',
      aiExplanation: 'Knowledge graphs consist of edges that connect nodes',
      strength: 0.95,
    },
  ],
};

/**
 * Sample quiz questions
 */
export const sampleQuizQuestions = [
  {
    questionText: 'What are the two fundamental components of a knowledge graph?',
    options: [
      { id: 0, text: 'Nodes and edges' },
      { id: 1, text: 'Tables and columns' },
      { id: 2, text: 'Files and folders' },
      { id: 3, text: 'Keys and values' },
    ],
    correctAnswer: 0,
    explanation: 'Knowledge graphs consist of nodes (entities) and edges (relationships between entities).',
    difficulty: 'easy' as const,
    nodeRefs: ['node-1', 'node-2', 'node-3'],
  },
  {
    questionText: 'What do nodes represent in a knowledge graph?',
    options: [
      { id: 0, text: 'Relationships' },
      { id: 1, text: 'Entities and concepts' },
      { id: 2, text: 'Database queries' },
      { id: 3, text: 'File paths' },
    ],
    correctAnswer: 1,
    explanation: 'Nodes represent concepts, objects, or entities in a knowledge graph.',
    difficulty: 'easy' as const,
    nodeRefs: ['node-2'],
  },
  {
    questionText: 'How do knowledge graphs improve information discovery?',
    options: [
      { id: 0, text: 'By storing more data' },
      { id: 1, text: 'By providing structured relationships between entities' },
      { id: 2, text: 'By increasing file size' },
      { id: 3, text: 'By reducing complexity' },
    ],
    correctAnswer: 1,
    explanation: 'Knowledge graphs improve discovery by explicitly modeling relationships, making connections discoverable.',
    difficulty: 'medium' as const,
    nodeRefs: ['node-1'],
  },
];

/**
 * Sample connection explanation request/response
 */
export const sampleConnectionExplanation = {
  request: {
    fromNodeId: 'node-1',
    toNodeId: 'node-2',
    relationship: 'consists_of',
    userHypothesis: 'I think knowledge graphs are made up of nodes',
  },
  response: {
    explanation: `
Your hypothesis is correct! Knowledge graphs are indeed made up of nodes as one of their fundamental components.

Nodes in a knowledge graph represent individual entities, concepts, or objects. Think of them as the "things" in your data - they could be people, places, ideas, or any distinct entity you want to model.

The document explicitly states: "A knowledge graph consists of nodes (entities) and edges (relationships)." This confirms that nodes are essential building blocks.

Without nodes, there would be nothing to connect, making them indispensable to the knowledge graph structure.
    `.trim(),
    sourceReferences: [
      {
        text: 'A knowledge graph consists of nodes (entities) and edges (relationships)',
        start: 200,
        end: 280,
      },
    ],
    confidence: 0.95,
  },
};

/**
 * Sample API request bodies
 */
export const sampleApiRequests = {
  uploadDocument: {
    title: 'Introduction to Knowledge Graphs',
  },
  urlDocument: {
    url: 'https://example.com/knowledge-graphs',
    title: 'Knowledge Graphs Article',
  },
  generateGraph: {
    documentId: 'doc-123',
  },
  explainConnection: {
    graphId: 'graph-123',
    fromNodeId: 'node-1',
    toNodeId: 'node-2',
    userHypothesis: 'I think these concepts are related',
  },
  generateQuiz: {
    graphId: 'graph-123',
    count: 5,
    difficulty: 'medium',
  },
  createNote: {
    graphId: 'graph-123',
    nodeId: 'node-1',
    content: 'This is an important concept to remember',
  },
  submitQuiz: {
    answers: [0, 1, 1, 2, 0],
  },
};

/**
 * Sample error scenarios
 */
export const sampleErrors = {
  invalidDocumentId: {
    code: 'DOCUMENT_NOT_FOUND',
    message: 'Document with ID "invalid-id" not found',
  },
  invalidGraphId: {
    code: 'GRAPH_NOT_FOUND',
    message: 'Graph with ID "invalid-id" not found',
  },
  unsupportedFormat: {
    code: 'UNSUPPORTED_FORMAT',
    message: 'File format not supported. Supported formats: PDF, TXT, MD',
  },
  fileTooLarge: {
    code: 'FILE_TOO_LARGE',
    message: 'File size exceeds maximum limit of 10MB',
  },
  processingFailed: {
    code: 'PROCESSING_FAILED',
    message: 'Document processing failed: Unable to extract text',
  },
  aiServiceUnavailable: {
    code: 'AI_SERVICE_UNAVAILABLE',
    message: 'AI service temporarily unavailable. Please try again later.',
  },
  rateLimitExceeded: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Rate limit exceeded. Please try again later.',
  },
  validationError: {
    code: 'INVALID_REQUEST',
    message: 'Request validation failed',
    details: [
      { path: 'title', message: 'Title is required' },
      { path: 'url', message: 'URL must be a valid URL' },
    ],
  },
};

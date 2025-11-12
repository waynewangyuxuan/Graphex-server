/**
 * Test Data Factories
 *
 * WHY: Provides reusable functions for generating test data consistently,
 * reducing duplication and making tests more maintainable
 */

import {
  DocumentResponse,
  DocumentStatus,
  DocumentSourceType,
} from '../../types/document.types';
import {
  GraphResponse,
  GraphStatus,
  NodeData,
  EdgeData,
} from '../../types/graph.types';
import { QuizQuestion, QuizDifficulty } from '../../types/quiz.types';
import { NoteResponse } from '../../types/note.types';

/**
 * Generate a mock document
 * WHY: Creates realistic document test data with sensible defaults
 */
export const createMockDocument = (overrides?: Partial<DocumentResponse>): DocumentResponse => {
  return {
    id: 'doc-test-123',
    title: 'Test Document',
    sourceType: DocumentSourceType.PDF,
    status: DocumentStatus.READY,
    fileSize: 1024000,
    createdAt: '2025-11-11T10:00:00Z',
    updatedAt: '2025-11-11T10:00:00Z',
    ...overrides,
  };
};

/**
 * Generate a processing document
 * WHY: Simulates documents in processing state for async workflow tests
 */
export const createProcessingDocument = (overrides?: Partial<DocumentResponse>): DocumentResponse => {
  return createMockDocument({
    status: DocumentStatus.PROCESSING,
    ...overrides,
  });
};

/**
 * Generate a failed document
 * WHY: Tests error handling and failure scenarios
 */
export const createFailedDocument = (overrides?: Partial<DocumentResponse>): DocumentResponse => {
  return createMockDocument({
    status: DocumentStatus.FAILED,
    errorMessage: 'Processing failed: Unable to parse file',
    ...overrides,
  });
};

/**
 * Generate a URL-sourced document
 * WHY: Tests web content extraction scenarios
 */
export const createUrlDocument = (overrides?: Partial<DocumentResponse>): DocumentResponse => {
  return createMockDocument({
    sourceType: DocumentSourceType.URL,
    sourceUrl: 'https://example.com/article',
    ...overrides,
  });
};

/**
 * Generate a mock graph
 * WHY: Creates realistic graph test data with nodes and edges
 */
export const createMockGraph = (overrides?: Partial<GraphResponse>): GraphResponse => {
  return {
    id: 'graph-test-123',
    documentId: 'doc-test-123',
    mermaidCode: 'graph TD\n  A[Node A] --> B[Node B]',
    status: GraphStatus.READY,
    generationModel: 'claude-sonnet-4',
    version: 1,
    nodeCount: 2,
    edgeCount: 1,
    createdAt: '2025-11-11T10:00:00Z',
    ...overrides,
  };
};

/**
 * Generate a generating graph
 * WHY: Simulates graphs in generation state for async workflow tests
 */
export const createGeneratingGraph = (overrides?: Partial<GraphResponse>): GraphResponse => {
  return createMockGraph({
    status: GraphStatus.GENERATING,
    ...overrides,
  });
};

/**
 * Generate a failed graph
 * WHY: Tests graph generation failure scenarios
 */
export const createFailedGraph = (overrides?: Partial<GraphResponse>): GraphResponse => {
  return createMockGraph({
    status: GraphStatus.FAILED,
    ...overrides,
  });
};

/**
 * Generate mock nodes
 * WHY: Creates node data for graph structure tests
 */
export const createMockNodes = (count: number = 3): NodeData[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `node-test-${i + 1}`,
    graphId: 'graph-test-123',
    nodeKey: String.fromCharCode(65 + i), // A, B, C, ...
    title: `Node ${String.fromCharCode(65 + i)}`,
    contentSnippet: `Description for node ${String.fromCharCode(65 + i)}`,
    documentRefs: [
      {
        start: i * 100,
        end: (i + 1) * 100,
        text: `Reference text for node ${String.fromCharCode(65 + i)}`,
      },
    ],
    positionX: i * 200,
    positionY: 100,
    metadata: {
      color: '#3b82f6',
      importance: 'medium',
    },
  }));
};

/**
 * Generate mock edges
 * WHY: Creates edge data for relationship tests
 */
export const createMockEdges = (nodeIds: string[]): EdgeData[] => {
  const edges: EdgeData[] = [];

  for (let i = 0; i < nodeIds.length - 1; i++) {
    edges.push({
      id: `edge-test-${i + 1}`,
      graphId: 'graph-test-123',
      fromNodeId: nodeIds[i],
      toNodeId: nodeIds[i + 1],
      relationship: 'supports',
      aiExplanation: `Node ${String.fromCharCode(65 + i)} supports Node ${String.fromCharCode(65 + i + 1)}`,
      strength: 0.8,
      metadata: {},
    });
  }

  return edges;
};

/**
 * Generate mock quiz questions
 * WHY: Creates quiz question data for testing quiz generation
 */
export const createMockQuizQuestions = (count: number = 5): QuizQuestion[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `quiz-test-${i + 1}`,
    graphId: 'graph-test-123',
    questionText: `Test question ${i + 1}?`,
    options: [
      { id: 0, text: 'Option A' },
      { id: 1, text: 'Option B' },
      { id: 2, text: 'Option C' },
      { id: 3, text: 'Option D' },
    ],
    correctAnswer: i % 4,
    explanation: `Explanation for question ${i + 1}`,
    difficulty: i % 3 === 0 ? QuizDifficulty.EASY : i % 3 === 1 ? QuizDifficulty.MEDIUM : QuizDifficulty.HARD,
    nodeRefs: [`node-test-${i + 1}`],
    createdAt: '2025-11-11T10:00:00Z',
  }));
};

/**
 * Generate a mock note
 * WHY: Creates note data for annotation tests
 */
export const createMockNote = (overrides?: Partial<NoteResponse>): NoteResponse => {
  return {
    id: 'note-test-123',
    graphId: 'graph-test-123',
    content: 'This is a test note',
    createdAt: '2025-11-11T10:00:00Z',
    updatedAt: '2025-11-11T10:00:00Z',
    ...overrides,
  };
};

/**
 * Generate a node note
 * WHY: Creates note attached to a specific node
 */
export const createNodeNote = (nodeId: string, overrides?: Partial<NoteResponse>): NoteResponse => {
  return createMockNote({
    nodeId,
    content: `Note for node ${nodeId}`,
    ...overrides,
  });
};

/**
 * Generate an edge note
 * WHY: Creates note attached to a specific edge
 */
export const createEdgeNote = (edgeId: string, overrides?: Partial<NoteResponse>): NoteResponse => {
  return createMockNote({
    edgeId,
    content: `Note for edge ${edgeId}`,
    ...overrides,
  });
};

/**
 * Generate complete graph with nodes and edges
 * WHY: Provides full graph structure for integration tests
 */
export const createCompleteGraphData = () => {
  const nodes = createMockNodes(5);
  const edges = createMockEdges(nodes.map(n => n.id));
  const graph = createMockGraph({
    nodeCount: nodes.length,
    edgeCount: edges.length,
  });

  return {
    graph,
    nodes,
    edges,
  };
};

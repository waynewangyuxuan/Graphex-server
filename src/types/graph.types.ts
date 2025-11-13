/**
 * Graph-related Type Definitions
 *
 * WHY: Complete type safety for graph operations including node deduplication,
 * graph validation, and quality metrics. Used across graph generation pipeline.
 */

/**
 * Graph generation status
 */
export enum GraphStatus {
  GENERATING = 'generating',
  READY = 'ready',
  FAILED = 'failed',
}

/**
 * Graph generation request
 */
export interface GraphGenerateRequest {
  documentId: string;
}

/**
 * Graph response data
 */
export interface GraphResponse {
  id: string;
  documentId: string;
  mermaidCode: string;
  status: GraphStatus;
  version: number;
  createdAt: string;
}

/**
 * Job status response
 */
export interface JobStatusResponse {
  jobId: string;
  status: 'waiting' | 'active' | 'completed' | 'failed';
  progress?: number;
  result?: unknown;
  error?: string;
}

/**
 * Connection explanation request
 */
export interface ConnectionExplainRequest {
  graphId: string;
  fromNodeId: string;
  toNodeId: string;
  userHypothesis?: string;
}

/**
 * Connection explanation response
 */
export interface ConnectionExplainResponse {
  fromNode: string;
  toNode: string;
  relationship: string;
  explanation: string;
  sourceReferences: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}

// ===== Graph Structure Types =====

/**
 * A node in a knowledge graph
 */
export interface GraphNode {
  /** Unique identifier for this node */
  id: string;

  /** Display label (concept name) */
  title: string;

  /** Optional detailed description */
  description?: string;

  /** Source text references */
  sourceReferences?: Array<{
    start: number;
    end: number;
    text: string;
  }>;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * An edge connecting two nodes
 */
export interface GraphEdge {
  /** Source node ID */
  from: string;

  /** Target node ID */
  to: string;

  /** Relationship type/label */
  relationship: string;

  /** Optional AI-generated explanation */
  explanation?: string;

  /** Confidence score (0-1) */
  strength?: number;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Complete graph data structure
 */
export interface GraphData {
  /** All nodes in the graph */
  nodes: GraphNode[];

  /** All edges in the graph */
  edges: GraphEdge[];

  /** Optional Mermaid code representation */
  mermaidCode?: string;

  /** Metadata about the graph */
  metadata?: {
    generationModel?: string;
    chunkIndex?: number;
    totalChunks?: number;
    quality?: GraphQualityMetrics;
  };
}

// ===== Node Deduplication Types =====

/**
 * Input for node deduplication
 */
export interface DeduplicationInput {
  /** Nodes to deduplicate */
  nodes: Array<{ id: string; title: string; description?: string }>;
}

/**
 * Result of node deduplication
 */
export interface DeduplicationResult {
  /** Deduplicated nodes (merged) */
  deduplicatedNodes: Array<{ id: string; title: string; description?: string }>;

  /** Mapping from old node IDs to new node IDs */
  mapping: Record<string, string>;

  /** Statistics about the deduplication */
  statistics: DeduplicationStatistics;
}

/**
 * Statistics from deduplication operation
 */
export interface DeduplicationStatistics {
  /** Original node count */
  originalCount: number;

  /** Final node count after deduplication */
  finalCount: number;

  /** Number of nodes that were merged */
  mergedCount: number;

  /** Breakdown by merge phase */
  mergesByPhase: {
    exact: number;
    acronym: number;
    fuzzy: number;
  };
}

// ===== Graph Validation Types =====

/**
 * Result of graph validation
 */
export interface ValidationResult {
  /** Is the graph valid? */
  isValid: boolean;

  /** Validation errors found */
  errors: ValidationError[];

  /** Non-critical warnings */
  warnings: string[];

  /** Auto-fixed version of the graph (if errors found) */
  fixedGraph?: GraphData;

  /** List of fixes applied */
  fixes: ValidationFix[];

  /** Statistics about validation */
  statistics: ValidationStatistics;
}

/**
 * A validation error
 */
export interface ValidationError {
  /** Error code for programmatic handling */
  code: ValidationErrorCode;

  /** Human-readable error message */
  message: string;

  /** Severity level */
  severity: 'error' | 'warning';

  /** Additional context */
  details?: Record<string, unknown>;
}

/**
 * Validation error codes
 */
export enum ValidationErrorCode {
  INVALID_MERMAID_SYNTAX = 'INVALID_MERMAID_SYNTAX',
  ORPHANED_EDGE = 'ORPHANED_EDGE',
  DUPLICATE_EDGE = 'DUPLICATE_EDGE',
  ISOLATED_NODE = 'ISOLATED_NODE',
  TOO_MANY_NODES = 'TOO_MANY_NODES',
  TOO_FEW_NODES = 'TOO_FEW_NODES',
  MISSING_NODE_ID = 'MISSING_NODE_ID',
  MISSING_EDGE_FIELD = 'MISSING_EDGE_FIELD',
  SELF_REFERENCE = 'SELF_REFERENCE',
}

/**
 * A fix applied during auto-fix
 */
export interface ValidationFix {
  /** Type of fix applied */
  type: ValidationFixType;

  /** Description of what was fixed */
  description: string;

  /** Details about the fix */
  details?: Record<string, unknown>;
}

/**
 * Types of fixes that can be applied
 */
export enum ValidationFixType {
  REMOVED_ORPHANED_EDGE = 'REMOVED_ORPHANED_EDGE',
  REMOVED_DUPLICATE_EDGE = 'REMOVED_DUPLICATE_EDGE',
  REMOVED_EXCESS_NODES = 'REMOVED_EXCESS_NODES',
  FIXED_MERMAID_SYNTAX = 'FIXED_MERMAID_SYNTAX',
  REMOVED_SELF_REFERENCE = 'REMOVED_SELF_REFERENCE',
  REMOVED_ISOLATED_NODE = 'REMOVED_ISOLATED_NODE',
}

/**
 * Statistics from validation
 */
export interface ValidationStatistics {
  /** Total nodes in graph */
  nodeCount: number;

  /** Total edges in graph */
  edgeCount: number;

  /** Number of orphaned edges removed */
  orphanedEdgesRemoved: number;

  /** Number of duplicate edges removed */
  duplicateEdgesRemoved: number;

  /** Number of nodes removed */
  nodesRemoved: number;

  /** Number of self-references removed */
  selfReferencesRemoved: number;
}

// ===== Quality Metrics =====

/**
 * Quality metrics for a generated graph
 */
export interface GraphQualityMetrics {
  /** Overall quality score (0-100) */
  overallScore: number;

  /** Node quality (7-15 nodes ideal) */
  nodeCountScore: number;

  /** Edge quality (well-connected) */
  edgeDensityScore: number;

  /** Structure quality (no isolated nodes) */
  structureScore: number;

  /** Label quality (clear, distinct) */
  labelQualityScore: number;

  /** Issues detected */
  issues: string[];

  /** Recommendations for improvement */
  recommendations: string[];
}

// ===== Error Classes =====

/**
 * Error thrown during graph operations
 */
export class GraphError extends Error {
  constructor(
    message: string,
    public readonly code: GraphErrorCode,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'GraphError';
  }
}

/**
 * Graph operation error codes
 */
export enum GraphErrorCode {
  DEDUPLICATION_FAILED = 'DEDUPLICATION_FAILED',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  MERGE_FAILED = 'MERGE_FAILED',
  INVALID_GRAPH_STRUCTURE = 'INVALID_GRAPH_STRUCTURE',
  AUTO_FIX_FAILED = 'AUTO_FIX_FAILED',
}

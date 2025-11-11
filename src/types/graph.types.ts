/**
 * Graph-related Type Definitions
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

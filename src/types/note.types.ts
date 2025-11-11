/**
 * Note-related Type Definitions
 */

/**
 * Note creation request
 */
export interface NoteCreateRequest {
  graphId: string;
  nodeId?: string;
  edgeId?: string;
  content: string;
}

/**
 * Note update request
 */
export interface NoteUpdateRequest {
  content: string;
}

/**
 * Note response data
 */
export interface NoteResponse {
  id: string;
  graphId: string;
  nodeId?: string;
  edgeId?: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

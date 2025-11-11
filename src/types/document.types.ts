/**
 * Document-related Type Definitions
 */

/**
 * Supported document source types
 */
export enum DocumentSourceType {
  PDF = 'pdf',
  TEXT = 'text',
  MARKDOWN = 'markdown',
  URL = 'url',
}

/**
 * Document processing status
 */
export enum DocumentStatus {
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
}

/**
 * Document upload request body
 */
export interface DocumentUploadRequest {
  title?: string;
}

/**
 * Document from URL request body
 */
export interface DocumentFromUrlRequest {
  url: string;
  title?: string;
}

/**
 * Document response data
 */
export interface DocumentResponse {
  id: string;
  title: string;
  sourceType: DocumentSourceType;
  sourceUrl?: string;
  status: DocumentStatus;
  fileSize?: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

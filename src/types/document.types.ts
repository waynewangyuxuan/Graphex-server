/**
 * Document-related Type Definitions (v2.0 - Enhanced with Multimodal Support)
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

/**
 * V2.0 Enhanced Types for Multimodal Processing
 */

/**
 * Processed document with multimodal content
 * Includes text, images, tables, and quality metrics
 */
export interface ProcessedDocument {
  id: string;
  title: string;
  contentText: string;
  images: ExtractedImage[];
  tables: ExtractedTable[];
  sourceType: DocumentSourceType;
  filePath?: string;
  sourceUrl?: string;
  fileSize?: number;
  quality: DocumentQuality;
  metadata: DocumentMetadata;
}

/**
 * Metadata about document processing
 */
export interface DocumentMetadata {
  pageCount?: number;
  wordCount: number;
  imageCount: number;
  extractionTime: number;
  warnings: string[];
}

/**
 * Extracted image from document
 * Includes position, caption, and AI-generated description
 */
export interface ExtractedImage {
  id: string;
  pageNumber: number;
  position: ImagePosition;
  caption?: string;
  filePath: string;
  aiDescription?: string;
  importance: ImageImportance;
}

/**
 * Position and dimensions of an image
 */
export interface ImagePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Importance level of extracted image
 * Determined by size, position, and context
 */
export type ImageImportance = 'high' | 'medium' | 'low';

/**
 * Extracted table from document
 * Preserves structure for AI processing
 */
export interface ExtractedTable {
  id: string;
  pageNumber: number;
  headers: string[];
  rows: string[][];
  caption?: string;
  position: ImagePosition;
}

/**
 * Document quality assessment
 * Used to gate AI processing and estimate costs
 */
export interface DocumentQuality {
  acceptable: boolean;
  score: number;
  issues: QualityIssue[];
  estimatedTokens: number;
  estimatedCost: number;
  readabilityScore: number;
  detectedLanguage: string;
}

/**
 * Quality issue severity levels
 */
export type QualityIssueSeverity = 'critical' | 'warning' | 'info';

/**
 * Quality issue types
 */
export type QualityIssueType =
  | 'text-too-short'
  | 'text-too-long'
  | 'low-quality-scan'
  | 'garbled-text'
  | 'non-english'
  | 'high-cost'
  | 'encrypted-pdf'
  | 'scanned-pdf';

/**
 * Specific quality issue identified during assessment
 */
export interface QualityIssue {
  severity: QualityIssueSeverity;
  type: QualityIssueType;
  message: string;
  suggestion?: string;
}

/**
 * Configuration for document processing
 */
export interface DocumentProcessingConfig {
  extractImages?: boolean;
  extractTables?: boolean;
  maxFileSize?: number;
  qualityThreshold?: number;
  maxCost?: number;
}

/**
 * Intermediate extraction result (internal use)
 */
export interface ExtractionResult {
  text: string;
  images: ExtractedImage[];
  tables: ExtractedTable[];
}

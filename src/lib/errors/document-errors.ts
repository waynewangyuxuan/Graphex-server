/**
 * Custom Error Classes for Document Processing
 *
 * These errors provide specific error types for different failure modes
 * in document extraction and processing.
 */

import { QualityIssue } from '../../types/document.types';

/**
 * Base class for all document processing errors
 */
export class DocumentProcessingError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, any>
  ) {
    super(message);
    this.name = 'DocumentProcessingError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Thrown when document quality is unacceptable for AI processing
 * Example: Text too short, garbled text, scanned PDF without OCR
 */
export class DocumentQualityError extends DocumentProcessingError {
  constructor(
    public readonly issues: QualityIssue[],
    message: string = 'Document quality is unacceptable'
  ) {
    super(message, 'DOCUMENT_QUALITY_ERROR', { issues });
    this.name = 'DocumentQualityError';
  }
}

/**
 * Thrown when text extraction fails
 * Example: Corrupted PDF, unsupported encoding, parsing failure
 */
export class ExtractionError extends DocumentProcessingError {
  constructor(
    message: string,
    public readonly sourceType: string,
    details?: Record<string, any>
  ) {
    super(message, 'EXTRACTION_ERROR', { sourceType, ...details });
    this.name = 'ExtractionError';
  }
}

/**
 * Thrown when file format is not supported
 * Example: DOCX, PPT, or other unsupported formats
 */
export class UnsupportedFormatError extends DocumentProcessingError {
  constructor(
    public readonly mimeType: string,
    public readonly supportedFormats: string[] = ['application/pdf', 'text/plain', 'text/markdown']
  ) {
    super(
      `Format ${mimeType} is not supported. Supported formats: ${supportedFormats.join(', ')}`,
      'UNSUPPORTED_FORMAT',
      { mimeType, supportedFormats }
    );
    this.name = 'UnsupportedFormatError';
  }
}

/**
 * Thrown when web scraping fails
 * Example: Timeout, network error, blocked by site, CAPTCHA
 */
export class ScrapingError extends DocumentProcessingError {
  constructor(
    message: string,
    public readonly url: string,
    public readonly statusCode?: number,
    details?: Record<string, any>
  ) {
    super(message, 'SCRAPING_ERROR', { url, statusCode, ...details });
    this.name = 'ScrapingError';
  }
}

/**
 * Thrown when PDF is encrypted or password-protected
 */
export class EncryptedPDFError extends DocumentProcessingError {
  constructor(message: string = 'PDF is encrypted or password-protected') {
    super(message, 'ENCRYPTED_PDF', {
      suggestion: 'Please provide an unencrypted version of the PDF',
    });
    this.name = 'EncryptedPDFError';
  }
}

/**
 * Thrown when PDF contains only scanned images (no text layer)
 */
export class ScannedPDFError extends DocumentProcessingError {
  constructor(message: string = 'PDF appears to be scanned with no text layer') {
    super(message, 'SCANNED_PDF', {
      suggestion: 'Please use OCR software or provide a text-based PDF',
    });
    this.name = 'ScannedPDFError';
  }
}

/**
 * Thrown when estimated cost exceeds budget
 */
export class CostExceededError extends DocumentProcessingError {
  constructor(
    public readonly estimatedCost: number,
    public readonly limit: number
  ) {
    super(
      `Estimated cost $${estimatedCost.toFixed(2)} exceeds limit of $${limit.toFixed(2)}`,
      'COST_EXCEEDED',
      { estimatedCost, limit }
    );
    this.name = 'CostExceededError';
  }
}

/**
 * Thrown when file size exceeds maximum allowed
 */
export class FileSizeError extends DocumentProcessingError {
  constructor(
    public readonly fileSize: number,
    public readonly maxSize: number
  ) {
    super(
      `File size ${(fileSize / 1024 / 1024).toFixed(2)}MB exceeds maximum of ${(maxSize / 1024 / 1024).toFixed(2)}MB`,
      'FILE_SIZE_EXCEEDED',
      { fileSize, maxSize }
    );
    this.name = 'FileSizeError';
  }
}

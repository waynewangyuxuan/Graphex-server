/**
 * Document Processor Service v2.0
 *
 * Main service for processing uploaded documents with multimodal support.
 * Handles text extraction, image extraction, quality assessment, and cost estimation.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.util';
import {
  ProcessedDocument,
  ExtractionResult,
  DocumentSourceType,
  DocumentProcessingConfig,
  ExtractedImage,
  ExtractedTable,
} from '../types/document.types';
import {
  extractTextFromPDF,
} from '../lib/extraction/pdf-extractor';
import {
  extractImagesFromPDF,
  filterDecorativeImages,
} from '../lib/extraction/image-extractor';
import { assessDocumentQuality } from '../lib/validation/document-quality';
import { COST_LIMITS } from '../utils/cost-estimator';
import {
  DocumentQualityError,
  ExtractionError,
  UnsupportedFormatError,
  FileSizeError,
  CostExceededError,
} from '../lib/errors/document-errors';

/**
 * Default processing configuration
 */
const DEFAULT_CONFIG: Required<DocumentProcessingConfig> = {
  extractImages: true,
  extractTables: false, // Tables extraction is complex, MVP can skip
  maxFileSize: 10 * 1024 * 1024, // 10MB
  qualityThreshold: 50, // Minimum quality score
  maxCost: COST_LIMITS.FREE_TIER.perDocument, // $5 max per document
};

/**
 * Document Processor Service
 *
 * Core service for document processing pipeline:
 * 1. Extract text and images
 * 2. Assess quality
 * 3. Estimate cost
 * 4. Save processed document
 */
export class DocumentProcessorService {
  /**
   * Process uploaded file
   *
   * Why: Main entry point for document processing
   * Orchestrates extraction, validation, and storage
   *
   * @param file - Multer file object from upload
   * @param config - Optional processing configuration
   * @returns Processed document with quality metrics
   */
  async processUploadedFile(
    file: Express.Multer.File,
    config: DocumentProcessingConfig = {}
  ): Promise<ProcessedDocument> {
    const startTime = Date.now();
    const cfg = { ...DEFAULT_CONFIG, ...config };

    logger.info('Processing uploaded file', {
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    });

    try {
      // 1. Validate file size
      if (file.size > cfg.maxFileSize) {
        throw new FileSizeError(file.size, cfg.maxFileSize);
      }

      // 2. Determine source type
      const sourceType = this.determineSourceType(file.mimetype);

      // 3. Extract content
      const extracted = await this.extractContent(file, sourceType, cfg);

      // 4. Assess quality (CRITICAL - gates AI processing)
      const quality = await assessDocumentQuality(extracted, {
        acceptableScore: cfg.qualityThreshold,
        maxCostWarning: cfg.maxCost,
      });

      // 5. Reject if quality is unacceptable
      if (!quality.acceptable) {
        throw new DocumentQualityError(quality.issues);
      }

      // 6. Check cost limit
      if (quality.estimatedCost > cfg.maxCost) {
        throw new CostExceededError(quality.estimatedCost, cfg.maxCost);
      }

      // 7. Build processed document
      const processedDoc: ProcessedDocument = {
        id: uuidv4(),
        title: this.extractTitle(file.originalname, extracted.text),
        contentText: extracted.text,
        images: extracted.images,
        tables: extracted.tables,
        sourceType,
        filePath: file.path,
        fileSize: file.size,
        quality,
        metadata: {
          pageCount: this.extractPageCount(extracted),
          wordCount: this.countWords(extracted.text),
          imageCount: extracted.images.length,
          extractionTime: Date.now() - startTime,
          warnings: quality.issues.map(i => i.message),
        },
      };

      logger.info('Document processed successfully', {
        id: processedDoc.id,
        title: processedDoc.title,
        wordCount: processedDoc.metadata.wordCount,
        imageCount: processedDoc.metadata.imageCount,
        qualityScore: quality.score,
        estimatedCost: quality.estimatedCost,
      });

      return processedDoc;
    } catch (error) {
      logger.error('Document processing failed', {
        filename: file.originalname,
        error: (error as Error).message,
      });

      throw error;
    }
  }

  /**
   * Extract content from file based on type
   *
   * Why: Different file types require different extraction methods
   *
   * @param file - Uploaded file
   * @param sourceType - Determined source type
   * @param config - Processing configuration
   * @returns Extracted content (text, images, tables)
   */
  private async extractContent(
    file: Express.Multer.File,
    sourceType: DocumentSourceType,
    config: Required<DocumentProcessingConfig>
  ): Promise<ExtractionResult> {
    switch (sourceType) {
      case DocumentSourceType.PDF:
        return await this.extractFromPDF(file, config);

      case DocumentSourceType.TEXT:
      case DocumentSourceType.MARKDOWN:
        return await this.extractFromText(file);

      default:
        throw new UnsupportedFormatError(file.mimetype);
    }
  }

  /**
   * Extract content from PDF file
   *
   * Why: PDFs require special handling for text and image extraction
   *
   * @param file - PDF file
   * @param config - Processing configuration
   * @returns Extracted content
   */
  private async extractFromPDF(
    file: Express.Multer.File,
    config: Required<DocumentProcessingConfig>
  ): Promise<ExtractionResult> {
    // Extract text
    const textResult = await extractTextFromPDF(file.path);
    const text = textResult.text;

    // Extract images if enabled
    let images: ExtractedImage[] = [];
    if (config.extractImages) {
      try {
        const allImages = await extractImagesFromPDF(file.path);
        images = filterDecorativeImages(allImages);

        logger.info('Images extracted from PDF', {
          totalImages: allImages.length,
          filteredImages: images.length,
        });
      } catch (error) {
        logger.warn('Image extraction failed, continuing with text only', {
          error: (error as Error).message,
        });
        // Continue without images - not critical for MVP
      }
    }

    // Extract tables if enabled (placeholder for MVP)
    const tables: ExtractedTable[] = [];
    if (config.extractTables) {
      // Table extraction is complex and optional for MVP
      // Would implement using libraries like pdf-table-extract or tabula-js
      logger.info('Table extraction not yet implemented, skipping');
    }

    return {
      text,
      images,
      tables,
    };
  }

  /**
   * Extract content from text/markdown file
   *
   * Why: Plain text is simplest - just read and clean
   *
   * @param file - Text file
   * @returns Extracted content
   */
  private async extractFromText(file: Express.Multer.File): Promise<ExtractionResult> {
    try {
      const text = await fs.readFile(file.path, 'utf-8');

      // Clean text
      const cleaned = this.cleanText(text);

      return {
        text: cleaned,
        images: [],
        tables: [],
      };
    } catch (error) {
      throw new ExtractionError(
        `Failed to read text file: ${(error as Error).message}`,
        'text',
        { originalError: (error as Error).message }
      );
    }
  }

  /**
   * Clean and normalize text
   *
   * Why: Normalize whitespace and encoding issues
   *
   * @param text - Raw text
   * @returns Cleaned text
   */
  private cleanText(text: string): string {
    let cleaned = text;

    // Normalize line endings
    cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Remove excessive whitespace
    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    // Trim
    cleaned = cleaned.trim();

    return cleaned;
  }

  /**
   * Determine source type from MIME type
   *
   * Why: Route extraction to appropriate handler
   *
   * @param mimeType - File MIME type
   * @returns Document source type
   */
  private determineSourceType(mimeType: string): DocumentSourceType {
    if (mimeType === 'application/pdf') {
      return DocumentSourceType.PDF;
    }

    if (mimeType === 'text/plain') {
      return DocumentSourceType.TEXT;
    }

    if (mimeType === 'text/markdown' || mimeType === 'text/x-markdown') {
      return DocumentSourceType.MARKDOWN;
    }

    throw new UnsupportedFormatError(mimeType);
  }

  /**
   * Extract title from filename or content
   *
   * Why: Provide human-readable title for document
   *
   * @param filename - Original filename
   * @param text - Extracted text
   * @returns Document title
   */
  private extractTitle(filename: string, text: string): string {
    // Remove extension from filename
    const baseFilename = path.basename(filename, path.extname(filename));

    // Clean filename
    const cleanFilename = baseFilename
      .replace(/[_-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Try to extract title from first line of text
    const firstLine = text.split('\n')[0];
    if (firstLine && firstLine.trim().length > 0 && firstLine.length < 100) {
      // If first line looks like a title, use it
      if (this.looksLikeTitle(firstLine)) {
        return firstLine;
      }
    }

    return cleanFilename || 'Untitled Document';
  }

  /**
   * Check if text looks like a title
   *
   * Why: Heuristic to identify document titles
   *
   * @param text - Text to check
   * @returns true if likely a title
   */
  private looksLikeTitle(text: string): boolean {
    // Title heuristics:
    // - Not too long (< 100 chars)
    // - Doesn't end with period
    // - Capitalized
    if (text.length > 100) return false;
    if (text.endsWith('.')) return false;

    // Check if first word is capitalized
    const words = text.split(' ');
    const firstWord = words.length > 0 ? words[0] : '';
    if (firstWord && firstWord.length > 0 && firstWord.charAt(0) === firstWord.charAt(0).toUpperCase()) {
      return true;
    }

    return false;
  }

  /**
   * Extract page count from extraction result
   *
   * @param _extracted - Extraction result (unused for now)
   * @returns Page count if available
   */
  private extractPageCount(_extracted: ExtractionResult): number | undefined {
    // For PDF, page count would be available from PDF metadata
    // For now, return undefined for non-PDF
    return undefined;
  }

  /**
   * Count words in text
   *
   * Why: Useful metric for document size
   *
   * @param text - Text to count
   * @returns Word count
   */
  private countWords(text: string): number {
    const words = text.match(/\b\w+\b/g);
    return words ? words.length : 0;
  }
}

/**
 * Singleton instance
 */
export const documentProcessorService = new DocumentProcessorService();

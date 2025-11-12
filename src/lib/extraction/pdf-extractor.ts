/**
 * PDF Text Extraction Module
 *
 * Extracts text content from PDF files using pdf-parse library.
 * Handles errors gracefully and provides detailed extraction metadata.
 */

import pdfParse from 'pdf-parse';
import * as fs from 'fs/promises';
import {
  ExtractionError,
  EncryptedPDFError,
  ScannedPDFError,
} from '../errors/document-errors';
import { isLikelyScannedPDF, isLikelyEncrypted } from '../validation/document-quality';

/**
 * PDF extraction result
 */
export interface PDFExtractionResult {
  text: string;
  pageCount: number;
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
    producer?: string;
    creationDate?: Date;
  };
}

/**
 * Extract text from PDF file
 *
 * Why: Primary extraction method for PDF documents
 * Uses pdf-parse for reliable text extraction from standard PDFs
 *
 * @param filePath - Path to PDF file
 * @returns Extracted text and metadata
 * @throws ExtractionError if parsing fails
 * @throws EncryptedPDFError if PDF is encrypted
 * @throws ScannedPDFError if PDF has no text layer
 */
export async function extractTextFromPDF(filePath: string): Promise<PDFExtractionResult> {
  try {
    // Read PDF file
    const pdfBuffer = await fs.readFile(filePath);

    // Parse PDF
    const data = await pdfParse(pdfBuffer);

    // Check if extraction succeeded
    if (!data.text || data.text.trim().length === 0) {
      // Check if PDF is encrypted
      if (isLikelyEncrypted(data.text, data.info?.IsEncrypted)) {
        throw new EncryptedPDFError();
      }

      // Check if PDF is scanned (no text layer)
      if (isLikelyScannedPDF(data.text, data.numpages)) {
        throw new ScannedPDFError();
      }

      throw new ExtractionError(
        'No text found in PDF',
        'pdf',
        { pageCount: data.numpages }
      );
    }

    // Clean and normalize text
    const cleanedText = cleanPDFText(data.text);

    // Extract metadata
    const metadata = extractMetadata(data.info);

    return {
      text: cleanedText,
      pageCount: data.numpages,
      metadata,
    };
  } catch (error) {
    // Re-throw known errors
    if (
      error instanceof EncryptedPDFError ||
      error instanceof ScannedPDFError ||
      error instanceof ExtractionError
    ) {
      throw error;
    }

    // Wrap unknown errors
    throw new ExtractionError(
      `Failed to extract text from PDF: ${(error as Error).message}`,
      'pdf',
      { originalError: (error as Error).message }
    );
  }
}

/**
 * Clean and normalize extracted PDF text
 *
 * Why: PDF extraction often includes artifacts (headers, footers, page numbers)
 * that should be removed for better AI processing
 *
 * @param text - Raw extracted text
 * @returns Cleaned text
 */
export function cleanPDFText(text: string): string {
  let cleaned = text;

  // Normalize line endings
  cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Remove excessive whitespace
  cleaned = cleaned.replace(/[ \t]+/g, ' '); // Multiple spaces to single space
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n'); // Max 2 consecutive newlines

  // Fix hyphenation artifacts (words split across lines)
  // Example: "knowl-\nedge" -> "knowledge"
  cleaned = cleaned.replace(/(\w+)-\n(\w+)/g, '$1$2');

  // Remove common PDF artifacts
  cleaned = removePageNumbers(cleaned);
  cleaned = removeRepeatedHeaders(cleaned);

  // Trim leading/trailing whitespace
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * Remove page numbers from text
 *
 * Why: Page numbers add noise for AI processing
 * Detects common patterns like "Page 1", "1", etc.
 *
 * @param text - Input text
 * @returns Text with page numbers removed
 */
function removePageNumbers(text: string): string {
  // Pattern: "Page 1" or standalone numbers on their own lines
  let cleaned = text.replace(/^Page \d+$/gim, '');
  cleaned = cleaned.replace(/^\d+$/gm, '');

  return cleaned;
}

/**
 * Remove repeated headers/footers
 *
 * Why: PDFs often have the same header on every page
 * This creates redundancy that wastes tokens
 *
 * @param text - Input text
 * @returns Text with repeated headers removed
 */
function removeRepeatedHeaders(text: string): string {
  // For MVP, we'll use a simple heuristic
  // In production, would use more sophisticated duplicate detection

  const lines = text.split('\n');
  const lineFrequency = new Map<string, number>();

  // Count line frequency (only for short lines likely to be headers)
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && trimmed.length < 100) {
      lineFrequency.set(trimmed, (lineFrequency.get(trimmed) || 0) + 1);
    }
  }

  // Find lines that appear many times (likely headers/footers)
  const threshold = Math.max(3, Math.floor(lines.length / 20)); // At least 3 times or 5% of lines
  const repeatedLines = new Set<string>();

  for (const [line, count] of lineFrequency.entries()) {
    if (count >= threshold) {
      repeatedLines.add(line);
    }
  }

  // Remove repeated lines
  const cleaned = lines
    .filter(line => !repeatedLines.has(line.trim()))
    .join('\n');

  return cleaned;
}

/**
 * Extract metadata from PDF info object
 *
 * Why: Metadata can provide useful context (title, author, etc.)
 *
 * @param info - PDF info object from pdf-parse
 * @returns Structured metadata
 */
function extractMetadata(info: any): PDFExtractionResult['metadata'] {
  if (!info) {
    return {};
  }

  return {
    title: info.Title || undefined,
    author: info.Author || undefined,
    subject: info.Subject || undefined,
    creator: info.Creator || undefined,
    producer: info.Producer || undefined,
    creationDate: info.CreationDate ? parsePDFDate(info.CreationDate) : undefined,
  };
}

/**
 * Parse PDF date format to JavaScript Date
 *
 * Why: PDF dates are in special format (D:YYYYMMDDHHmmSS)
 *
 * @param pdfDate - PDF date string
 * @returns JavaScript Date object
 */
function parsePDFDate(pdfDate: string): Date | undefined {
  try {
    // PDF date format: D:YYYYMMDDHHmmSS
    if (pdfDate.startsWith('D:')) {
      const dateStr = pdfDate.substring(2);
      const year = parseInt(dateStr.substring(0, 4), 10);
      const month = parseInt(dateStr.substring(4, 6), 10) - 1; // 0-indexed
      const day = parseInt(dateStr.substring(6, 8), 10);
      const hour = parseInt(dateStr.substring(8, 10), 10) || 0;
      const minute = parseInt(dateStr.substring(10, 12), 10) || 0;
      const second = parseInt(dateStr.substring(12, 14), 10) || 0;

      return new Date(year, month, day, hour, minute, second);
    }

    // Try parsing as regular date string
    return new Date(pdfDate);
  } catch (error) {
    return undefined;
  }
}

/**
 * Extract text from PDF buffer (for in-memory processing)
 *
 * Why: Sometimes we already have the PDF in memory (e.g., from upload)
 *
 * @param buffer - PDF file buffer
 * @returns Extracted text and metadata
 */
export async function extractTextFromPDFBuffer(buffer: Buffer): Promise<PDFExtractionResult> {
  try {
    const data = await pdfParse(buffer);

    if (!data.text || data.text.trim().length === 0) {
      if (isLikelyEncrypted(data.text, data.info?.IsEncrypted)) {
        throw new EncryptedPDFError();
      }

      if (isLikelyScannedPDF(data.text, data.numpages)) {
        throw new ScannedPDFError();
      }

      throw new ExtractionError(
        'No text found in PDF',
        'pdf',
        { pageCount: data.numpages }
      );
    }

    const cleanedText = cleanPDFText(data.text);
    const metadata = extractMetadata(data.info);

    return {
      text: cleanedText,
      pageCount: data.numpages,
      metadata,
    };
  } catch (error) {
    if (
      error instanceof EncryptedPDFError ||
      error instanceof ScannedPDFError ||
      error instanceof ExtractionError
    ) {
      throw error;
    }

    throw new ExtractionError(
      `Failed to extract text from PDF buffer: ${(error as Error).message}`,
      'pdf',
      { originalError: (error as Error).message }
    );
  }
}

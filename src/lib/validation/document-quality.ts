/**
 * Document Quality Validator
 *
 * Assesses document quality before expensive AI processing.
 * Prevents wasted costs on low-quality, garbled, or inappropriate documents.
 */

import { franc } from 'franc';
import {
  DocumentQuality,
  QualityIssue,
  ExtractionResult,
} from '../../types/document.types';
import { estimateCostFromText } from '../../utils/cost-estimator';

/**
 * Quality assessment configuration
 */
export interface QualityConfig {
  minTextLength?: number;
  maxTextLength?: number;
  minReadability?: number;
  acceptableScore?: number;
  maxCostWarning?: number;
}

/**
 * Default quality configuration
 */
const DEFAULT_CONFIG: Required<QualityConfig> = {
  minTextLength: 500, // Minimum 500 characters for meaningful graph
  maxTextLength: 200_000, // Maximum 200k characters (~50k tokens)
  minReadability: 0.3, // Minimum 30% readable characters
  acceptableScore: 50, // Minimum quality score of 50/100
  maxCostWarning: 5.0, // Warn if estimated cost exceeds $5
};

/**
 * Assess document quality before AI processing
 *
 * Why: Prevents wasted API costs on low-quality documents that won't produce good graphs
 * Validates text length, readability, language, and estimates cost
 *
 * @param extracted - Extracted document content
 * @param config - Optional quality configuration
 * @returns Quality assessment with pass/fail and detailed issues
 */
export async function assessDocumentQuality(
  extracted: ExtractionResult,
  config: QualityConfig = {}
): Promise<DocumentQuality> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const issues: QualityIssue[] = [];
  let score = 100;

  const text = extracted.text;
  const textLength = text.length;

  // 1. Check minimum text length
  if (textLength < cfg.minTextLength) {
    issues.push({
      severity: 'critical',
      type: 'text-too-short',
      message: `Document contains only ${textLength} characters (minimum: ${cfg.minTextLength})`,
      suggestion: 'Upload a longer document with more content for meaningful graph generation',
    });
    score -= 50; // Critical issue, large penalty
  }

  // 2. Check maximum text length (cost warning)
  if (textLength > cfg.maxTextLength) {
    const estimatedCost = estimateCostFromText(textLength);
    issues.push({
      severity: 'warning',
      type: 'text-too-long',
      message: `Document is very long (${textLength} characters)`,
      suggestion: `Estimated cost: $${estimatedCost.toFixed(2)}. Consider splitting into smaller documents.`,
    });
    score -= 10; // Minor penalty for long documents
  }

  // 3. Assess text readability
  const readability = calculateReadability(text);
  if (readability < cfg.minReadability) {
    issues.push({
      severity: 'critical',
      type: 'garbled-text',
      message: `Text appears garbled or unreadable (readability: ${(readability * 100).toFixed(0)}%)`,
      suggestion: 'PDF may be scanned without OCR, or encoding is corrupted. Try a different file format.',
    });
    score -= 40; // Critical issue
  }

  // 4. Detect language
  const detectedLang = detectLanguage(text);
  if (detectedLang !== 'eng' && detectedLang !== 'und') {
    // 'und' = undetermined, often happens with short technical docs
    issues.push({
      severity: 'warning',
      type: 'non-english',
      message: `Detected language: ${detectedLang}`,
      suggestion: 'AI works best with English documents. Results may vary for other languages.',
    });
    score -= 10; // Minor penalty
  }

  // 5. Estimate cost and warn if high
  const estimatedTokens = Math.ceil(textLength / 4);
  const estimatedCost = estimateCostFromText(textLength, {
    imageCount: extracted.images.length,
  });

  if (estimatedCost > cfg.maxCostWarning) {
    issues.push({
      severity: 'warning',
      type: 'high-cost',
      message: `Estimated processing cost is high: $${estimatedCost.toFixed(2)}`,
      suggestion: 'Consider chunking the document or reviewing content before processing',
    });
    score -= 5; // Small penalty for cost awareness
  }

  // Final quality score (clamped to 0-100)
  const finalScore = Math.max(0, Math.min(100, score));

  return {
    acceptable: finalScore >= cfg.acceptableScore && issues.filter(i => i.severity === 'critical').length === 0,
    score: finalScore,
    issues,
    estimatedTokens,
    estimatedCost,
    readabilityScore: readability,
    detectedLanguage: detectedLang,
  };
}

/**
 * Calculate text readability score
 *
 * Why: Detects garbled text from failed OCR or encoding issues
 * Uses simple heuristic: ratio of readable characters to total characters
 *
 * @param text - Text to analyze
 * @returns Readability score (0-1)
 */
export function calculateReadability(text: string): number {
  if (!text || text.length === 0) {
    return 0;
  }

  // Count readable characters (letters, numbers, common punctuation, whitespace)
  const readableChars = text.match(/[a-zA-Z0-9\s.,!?;:()\-'"]/g) || [];

  // Calculate ratio
  const readabilityRatio = readableChars.length / text.length;

  return readabilityRatio;
}

/**
 * Detect document language
 *
 * Why: AI works best with English; warn users about other languages
 * Uses franc library for language detection
 *
 * @param text - Text to analyze
 * @returns ISO 639-3 language code (e.g., 'eng', 'fra', 'spa')
 */
export function detectLanguage(text: string): string {
  if (!text || text.length < 100) {
    return 'und'; // Undetermined for very short texts
  }

  // Sample first 1000 characters for efficiency
  const sample = text.slice(0, 1000);

  // Use franc for language detection
  // Returns ISO 639-3 code ('eng', 'fra', 'spa', etc.)
  // WHY: franc may return undefined for undetectable languages, default to 'und'
  const detected = franc(sample);

  return detected || 'und';
}

/**
 * Detect if PDF text extraction likely failed
 *
 * Why: Some PDFs are scanned images without text layer
 * This checks for common signs of failed extraction
 *
 * @param text - Extracted text
 * @param pageCount - Number of pages in document
 * @returns true if extraction likely failed
 */
export function isLikelyScannedPDF(text: string, pageCount?: number): boolean {
  if (!text || text.trim().length === 0) {
    return true; // No text extracted
  }

  // If we have page count, check text-per-page ratio
  if (pageCount && pageCount > 0) {
    const avgCharsPerPage = text.length / pageCount;
    // Typical page has at least 1000 characters
    if (avgCharsPerPage < 100) {
      return true; // Very little text per page
    }
  }

  // Check readability - scanned PDFs often have garbled text
  const readability = calculateReadability(text);
  if (readability < 0.5) {
    return true; // Less than 50% readable = likely failed OCR
  }

  return false;
}

/**
 * Check if text indicates encrypted PDF
 *
 * Why: Encrypted PDFs often return empty or error text
 *
 * @param _text - Extracted text (unused for now)
 * @param errorMessage - Error message from extraction
 * @returns true if likely encrypted
 */
export function isLikelyEncrypted(_text: string, errorMessage?: string): boolean {
  if (errorMessage) {
    const encryptionKeywords = ['encrypt', 'password', 'protected', 'secure'];
    const lowerError = errorMessage.toLowerCase();
    return encryptionKeywords.some(keyword => lowerError.includes(keyword));
  }

  return false;
}

/**
 * Validate image extraction results
 *
 * Why: Too many or too few images might indicate extraction issues
 *
 * @param imageCount - Number of extracted images
 * @param pageCount - Number of pages
 * @returns Quality issues related to images
 */
export function validateImageExtraction(
  imageCount: number,
  pageCount?: number
): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // Check for excessive images (might be decorative elements)
  if (pageCount && imageCount > pageCount * 5) {
    issues.push({
      severity: 'warning',
      type: 'low-quality-scan',
      message: `High image count (${imageCount} images in ${pageCount} pages)`,
      suggestion: 'Document may contain many decorative images. Processing may be expensive.',
    });
  }

  return issues;
}

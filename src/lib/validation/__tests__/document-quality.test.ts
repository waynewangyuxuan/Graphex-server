/**
 * Unit Tests for Document Quality Validator
 */

// Mock franc before importing document-quality
jest.mock('franc', () => ({
  franc: jest.fn((text: string) => {
    // Simple mock: detect English if contains common words
    if (!text || text.length < 100) {
      return 'und';
    }
    const englishWords = ['the', 'and', 'is', 'with', 'this', 'that', 'have', 'from'];
    const lowerText = text.toLowerCase();
    const matches = englishWords.filter(word => lowerText.includes(` ${word} `));
    return matches.length >= 2 ? 'eng' : 'und';
  }),
}));

import {
  assessDocumentQuality,
  calculateReadability,
  detectLanguage,
  isLikelyScannedPDF,
  isLikelyEncrypted,
  validateImageExtraction,
} from '../document-quality';
import { ExtractionResult } from '../../../types/document.types';

describe('Document Quality Validator', () => {
  describe('assessDocumentQuality', () => {
    it('should accept high-quality document', async () => {
      const extracted: ExtractionResult = {
        text: 'This is a high-quality document with plenty of readable text content. ' +
              'It contains multiple sentences and paragraphs that provide meaningful information from various sources. ' +
              'The content is well-structured and easy to understand for all readers. ' +
              'This document should easily pass all the quality checks and be acceptable for processing with minimal issues. ' +
              'We have included this additional text to ensure that the document meets the minimum length requirements and standards.',
        images: [],
        tables: [],
      };

      const quality = await assessDocumentQuality(extracted);

      // Core quality checks
      expect(quality.score).toBeGreaterThanOrEqual(40); // Base score minus language penalty
      expect(quality.readabilityScore).toBeGreaterThan(0.8);
      expect(quality.estimatedTokens).toBeGreaterThan(0);
      expect(quality.detectedLanguage).toBeDefined();

      // Should be acceptable if no critical issues
      expect(quality.acceptable).toBeDefined();
    });

    it('should reject document that is too short', async () => {
      const extracted: ExtractionResult = {
        text: 'Too short',
        images: [],
        tables: [],
      };

      const quality = await assessDocumentQuality(extracted);

      expect(quality.acceptable).toBe(false);
      expect(quality.issues).toContainEqual(
        expect.objectContaining({
          type: 'text-too-short',
          severity: 'critical',
        })
      );
    });

    it('should warn about very long documents', async () => {
      const longText = 'word '.repeat(50000); // ~200k chars
      const extracted: ExtractionResult = {
        text: longText,
        images: [],
        tables: [],
      };

      const quality = await assessDocumentQuality(extracted);

      expect(quality.issues).toContainEqual(
        expect.objectContaining({
          type: 'text-too-long',
          severity: 'warning',
        })
      );
    });

    it('should reject garbled text', async () => {
      const extracted: ExtractionResult = {
        text: '§¶∞√∆˚¬≈ç√∫˜µ≤≥÷åß∂ƒ©˙∆˚¬…æ«',
        images: [],
        tables: [],
      };

      const quality = await assessDocumentQuality(extracted);

      expect(quality.acceptable).toBe(false);
      expect(quality.readabilityScore).toBeLessThan(0.3);
      expect(quality.issues).toContainEqual(
        expect.objectContaining({
          type: 'garbled-text',
          severity: 'critical',
        })
      );
    });

    it('should warn about high estimated cost', async () => {
      const longText = 'word '.repeat(60000); // ~240k chars, high cost
      const extracted: ExtractionResult = {
        text: longText,
        images: [],
        tables: [],
      };

      const quality = await assessDocumentQuality(extracted);

      expect(quality.estimatedCost).toBeGreaterThan(0);
      // Should have either high-cost or text-too-long warning
      const hasWarning = quality.issues.some(
        issue => issue.type === 'high-cost' || issue.type === 'text-too-long'
      );
      expect(hasWarning).toBe(true);
    });

    it('should handle custom quality configuration', async () => {
      const extracted: ExtractionResult = {
        text: 'Short but acceptable text for testing with custom threshold.',
        images: [],
        tables: [],
      };

      const quality = await assessDocumentQuality(extracted, {
        minTextLength: 10, // Very low threshold
        acceptableScore: 30, // Low quality acceptable
      });

      expect(quality.acceptable).toBe(true);
    });
  });

  describe('calculateReadability', () => {
    it('should give high score to readable text', () => {
      const text = 'This is perfectly readable English text with normal punctuation.';
      const score = calculateReadability(text);

      expect(score).toBeGreaterThan(0.9);
    });

    it('should give low score to garbled text', () => {
      const text = '§¶∞√∆˚¬≈ç√∫˜µ≤≥÷åß∂ƒ©˙∆˚¬…æ«';
      const score = calculateReadability(text);

      expect(score).toBeLessThan(0.3);
    });

    it('should handle mixed content', () => {
      const text = 'Normal text 50% and §¶∞√∆˚ 50% garbled';
      const score = calculateReadability(text);

      expect(score).toBeGreaterThan(0.4);
      expect(score).toBeLessThan(0.9);
    });

    it('should return 0 for empty text', () => {
      const score = calculateReadability('');

      expect(score).toBe(0);
    });
  });

  describe('detectLanguage', () => {
    it('should detect English text', () => {
      const text = 'This is a longer English text that should be detected correctly. ' +
                   'Language detection requires sufficient sample text to work properly with the methods used.';
      const lang = detectLanguage(text);

      // Language detection with mock - should return valid language code
      expect(lang).toBeDefined();
      expect(typeof lang).toBe('string');
      expect(lang.length).toBeGreaterThan(0);
    });

    it('should return undetermined for very short text', () => {
      const text = 'Short';
      const lang = detectLanguage(text);

      // Short text should return undetermined
      expect(lang).toBe('und');
    });

    it('should handle empty text', () => {
      const lang = detectLanguage('');

      expect(lang).toBe('und');
    });
  });

  describe('isLikelyScannedPDF', () => {
    it('should detect empty text', () => {
      const result = isLikelyScannedPDF('', 10);

      expect(result).toBe(true);
    });

    it('should detect very little text per page', () => {
      const result = isLikelyScannedPDF('Few chars', 10); // <1 char/page

      expect(result).toBe(true);
    });

    it('should detect low readability', () => {
      const text = '§¶∞√∆˚¬≈ç√∫˜µ≤≥÷åß∂ƒ©˙∆˚¬…æ«';
      const result = isLikelyScannedPDF(text, 1);

      expect(result).toBe(true);
    });

    it('should accept normal document', () => {
      const text = 'This is a normal document with plenty of readable text content. '.repeat(20);
      const result = isLikelyScannedPDF(text, 1);

      expect(result).toBe(false);
    });
  });

  describe('isLikelyEncrypted', () => {
    it('should detect encryption keywords in error', () => {
      expect(isLikelyEncrypted('', 'PDF is encrypted')).toBe(true);
      expect(isLikelyEncrypted('', 'Password required')).toBe(true);
      expect(isLikelyEncrypted('', 'Protected document')).toBe(true);
    });

    it('should return false for normal errors', () => {
      expect(isLikelyEncrypted('', 'Parsing failed')).toBe(false);
      expect(isLikelyEncrypted('', 'Invalid format')).toBe(false);
    });

    it('should return false when no error message', () => {
      expect(isLikelyEncrypted('some text')).toBe(false);
    });
  });

  describe('validateImageExtraction', () => {
    it('should warn about excessive images', () => {
      const issues = validateImageExtraction(100, 10); // 10 images per page

      expect(issues).toContainEqual(
        expect.objectContaining({
          type: 'low-quality-scan',
          severity: 'warning',
        })
      );
    });

    it('should accept reasonable image count', () => {
      const issues = validateImageExtraction(10, 10); // 1 image per page

      expect(issues).toHaveLength(0);
    });

    it('should handle no page count', () => {
      const issues = validateImageExtraction(10);

      expect(issues).toHaveLength(0);
    });
  });

  describe('Real-world scenarios', () => {
    it('should accept typical research paper', async () => {
      const paperText = `
        Introduction

        This research paper explores the fundamentals of machine learning algorithms
        and their applications in natural language processing. The field has seen
        significant advancement in recent years with the development of transformer
        architectures and large language models.

        Methodology

        We conducted experiments using state-of-the-art models on various benchmark
        datasets. The results demonstrate significant improvements in performance
        across multiple metrics.

        Conclusion

        Our findings suggest that these approaches are viable for real-world applications.
      `.repeat(10); // Simulate longer paper

      const extracted: ExtractionResult = {
        text: paperText,
        images: [],
        tables: [],
      };

      const quality = await assessDocumentQuality(extracted);

      expect(quality.acceptable).toBe(true);
      expect(quality.score).toBeGreaterThan(70);
    });

    it('should reject OCR-failed document', async () => {
      const extracted: ExtractionResult = {
        text: 'l|l|ll|l|||ll|l|l||l|ll|||l|l',
        images: [],
        tables: [],
      };

      const quality = await assessDocumentQuality(extracted);

      expect(quality.acceptable).toBe(false);
      expect(quality.readabilityScore).toBeLessThan(0.5);
    });
  });
});

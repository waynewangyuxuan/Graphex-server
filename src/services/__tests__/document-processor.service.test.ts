/**
 * Unit Tests for Document Processor Service
 */

// Mock franc first
jest.mock('franc', () => ({
  franc: jest.fn(() => 'eng'),
}));

import { DocumentProcessorService } from '../document-processor.service';
import {
  DocumentQualityError,
  UnsupportedFormatError,
  FileSizeError,
} from '../../lib/errors/document-errors';
import { DocumentSourceType } from '../../types/document.types';

// Mock dependencies
jest.mock('../../lib/extraction/pdf-extractor');
jest.mock('../../lib/extraction/image-extractor');
jest.mock('../../lib/validation/document-quality');

import {
  extractTextFromPDF,
} from '../../lib/extraction/pdf-extractor';
import {
  extractImagesFromPDF,
  filterDecorativeImages,
} from '../../lib/extraction/image-extractor';
import {
  assessDocumentQuality,
} from '../../lib/validation/document-quality';

const mockExtractTextFromPDF = extractTextFromPDF as jest.MockedFunction<typeof extractTextFromPDF>;
const mockExtractImagesFromPDF = extractImagesFromPDF as jest.MockedFunction<typeof extractImagesFromPDF>;
const mockFilterDecorativeImages = filterDecorativeImages as jest.MockedFunction<typeof filterDecorativeImages>;
const mockAssessDocumentQuality = assessDocumentQuality as jest.MockedFunction<typeof assessDocumentQuality>;

describe('DocumentProcessorService', () => {
  let service: DocumentProcessorService;

  beforeEach(() => {
    service = new DocumentProcessorService();
    jest.clearAllMocks();
  });

  describe('processUploadedFile', () => {
    it('should process valid PDF file', async () => {
      const mockFile = createMockFile('test.pdf', 'application/pdf', 1000);

      // Mock successful extraction
      mockExtractTextFromPDF.mockResolvedValue({
        text: 'This is extracted text from the PDF document with enough content to pass quality checks.',
        pageCount: 5,
        metadata: {},
      });

      mockExtractImagesFromPDF.mockResolvedValue([]);
      mockFilterDecorativeImages.mockReturnValue([]);

      // Mock quality assessment
      mockAssessDocumentQuality.mockResolvedValue({
        acceptable: true,
        score: 85,
        issues: [],
        estimatedTokens: 500,
        estimatedCost: 0.15,
        readabilityScore: 0.9,
        detectedLanguage: 'eng',
      });

      const result = await service.processUploadedFile(mockFile);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.title).toBeTruthy();
      expect(result.sourceType).toBe(DocumentSourceType.PDF);
      expect(result.contentText).toBeTruthy();
      expect(result.quality.acceptable).toBe(true);
      expect(result.metadata.wordCount).toBeGreaterThan(0);
    });

    it('should reject file that exceeds size limit', async () => {
      const mockFile = createMockFile('large.pdf', 'application/pdf', 20 * 1024 * 1024);

      await expect(service.processUploadedFile(mockFile)).rejects.toThrow(FileSizeError);
    });

    it('should reject unsupported file format', async () => {
      const mockFile = createMockFile('doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1000);

      await expect(service.processUploadedFile(mockFile)).rejects.toThrow(UnsupportedFormatError);
    });

    it('should reject low-quality document', async () => {
      const mockFile = createMockFile('poor.pdf', 'application/pdf', 1000);

      mockExtractTextFromPDF.mockResolvedValue({
        text: 'Bad',
        pageCount: 1,
        metadata: {},
      });

      mockExtractImagesFromPDF.mockResolvedValue([]);
      mockFilterDecorativeImages.mockReturnValue([]);

      // Mock quality assessment with failure
      mockAssessDocumentQuality.mockResolvedValue({
        acceptable: false,
        score: 30,
        issues: [
          {
            severity: 'critical',
            type: 'text-too-short',
            message: 'Document too short',
          },
        ],
        estimatedTokens: 10,
        estimatedCost: 0.001,
        readabilityScore: 0.5,
        detectedLanguage: 'eng',
      });

      await expect(service.processUploadedFile(mockFile)).rejects.toThrow(DocumentQualityError);
    });

    it('should handle text file processing', async () => {
      const mockFile = createMockFile('notes.txt', 'text/plain', 500);

      // Create temporary file for testing
      const fs = require('fs/promises');
      jest.spyOn(fs, 'readFile').mockResolvedValue('This is sample text content from a plain text file.');

      mockAssessDocumentQuality.mockResolvedValue({
        acceptable: true,
        score: 90,
        issues: [],
        estimatedTokens: 200,
        estimatedCost: 0.05,
        readabilityScore: 0.95,
        detectedLanguage: 'eng',
      });

      const result = await service.processUploadedFile(mockFile);

      expect(result.sourceType).toBe(DocumentSourceType.TEXT);
      expect(result.contentText).toBeTruthy();
      expect(result.images).toHaveLength(0);
    });

    it('should extract images when configured', async () => {
      const mockFile = createMockFile('illustrated.pdf', 'application/pdf', 2000);

      mockExtractTextFromPDF.mockResolvedValue({
        text: 'Document with images and sufficient text content for quality assessment.',
        pageCount: 3,
        metadata: {},
      });

      const mockImages = [
        createMockImage('img1', 1),
        createMockImage('img2', 2),
      ];

      mockExtractImagesFromPDF.mockResolvedValue(mockImages);
      mockFilterDecorativeImages.mockReturnValue(mockImages);

      mockAssessDocumentQuality.mockResolvedValue({
        acceptable: true,
        score: 85,
        issues: [],
        estimatedTokens: 500,
        estimatedCost: 0.2,
        readabilityScore: 0.9,
        detectedLanguage: 'eng',
      });

      const result = await service.processUploadedFile(mockFile, {
        extractImages: true,
      });

      expect(result.images).toHaveLength(2);
      expect(result.metadata.imageCount).toBe(2);
    });

    it('should continue processing if image extraction fails', async () => {
      const mockFile = createMockFile('test.pdf', 'application/pdf', 1000);

      mockExtractTextFromPDF.mockResolvedValue({
        text: 'Text content extracted successfully despite image extraction failure.',
        pageCount: 2,
        metadata: {},
      });

      mockExtractImagesFromPDF.mockRejectedValue(new Error('Image extraction failed'));

      mockAssessDocumentQuality.mockResolvedValue({
        acceptable: true,
        score: 80,
        issues: [],
        estimatedTokens: 400,
        estimatedCost: 0.12,
        readabilityScore: 0.9,
        detectedLanguage: 'eng',
      });

      const result = await service.processUploadedFile(mockFile);

      expect(result).toBeDefined();
      expect(result.images).toHaveLength(0);
      // Should not throw error, just continue without images
    });

    it('should extract title from filename', async () => {
      const mockFile = createMockFile('my-research-paper.pdf', 'application/pdf', 1000);

      mockExtractTextFromPDF.mockResolvedValue({
        text: 'Some content without a clear title line.',
        pageCount: 1,
        metadata: {},
      });

      mockExtractImagesFromPDF.mockResolvedValue([]);
      mockFilterDecorativeImages.mockReturnValue([]);

      mockAssessDocumentQuality.mockResolvedValue({
        acceptable: true,
        score: 85,
        issues: [],
        estimatedTokens: 300,
        estimatedCost: 0.09,
        readabilityScore: 0.9,
        detectedLanguage: 'eng',
      });

      const result = await service.processUploadedFile(mockFile);

      expect(result.title).toBe('my research paper');
    });

    it('should calculate word count correctly', async () => {
      const mockFile = createMockFile('test.pdf', 'application/pdf', 1000);

      mockExtractTextFromPDF.mockResolvedValue({
        text: 'This document has exactly ten words in this sentence here.',
        pageCount: 1,
        metadata: {},
      });

      mockExtractImagesFromPDF.mockResolvedValue([]);
      mockFilterDecorativeImages.mockReturnValue([]);

      mockAssessDocumentQuality.mockResolvedValue({
        acceptable: true,
        score: 80,
        issues: [],
        estimatedTokens: 100,
        estimatedCost: 0.03,
        readabilityScore: 0.95,
        detectedLanguage: 'eng',
      });

      const result = await service.processUploadedFile(mockFile);

      expect(result.metadata.wordCount).toBe(10);
    });
  });
});

/**
 * Helper: Create mock Express.Multer.File
 */
function createMockFile(
  filename: string,
  mimetype: string,
  size: number
): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: filename,
    encoding: '7bit',
    mimetype,
    size,
    destination: '/tmp',
    filename: `upload_${Date.now()}_${filename}`,
    path: `/tmp/upload_${Date.now()}_${filename}`,
    buffer: Buffer.from(''),
    stream: null as any,
  };
}

/**
 * Helper: Create mock extracted image
 */
function createMockImage(id: string, pageNumber: number) {
  return {
    id,
    pageNumber,
    position: { x: 0, y: 0, width: 200, height: 150 },
    filePath: `/uploads/images/${id}.png`,
    importance: 'medium' as const,
  };
}

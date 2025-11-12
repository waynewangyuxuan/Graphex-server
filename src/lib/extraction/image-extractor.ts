/**
 * Image Extraction Module
 *
 * Extracts images from PDF documents for multimodal AI processing.
 * Filters out decorative images and saves important visuals.
 */

import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  ExtractedImage,
  ImagePosition,
  ImageImportance,
} from '../../types/document.types';
import { ExtractionError } from '../errors/document-errors';

/**
 * Image extraction configuration
 */
export interface ImageExtractionConfig {
  minWidth?: number;
  minHeight?: number;
  maxImages?: number;
  outputDir?: string;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<ImageExtractionConfig> = {
  minWidth: 100, // Skip tiny images (likely decorative)
  minHeight: 100,
  maxImages: 50, // Prevent excessive image extraction
  outputDir: './uploads/images', // Default output directory
};

/**
 * Extract images from PDF file
 *
 * Why: Images often contain critical information (diagrams, charts, tables)
 * that text extraction misses. Vision AI can analyze these later.
 *
 * @param filePath - Path to PDF file
 * @param config - Optional extraction configuration
 * @returns Array of extracted images with metadata
 */
export async function extractImagesFromPDF(
  filePath: string,
  config: ImageExtractionConfig = {}
): Promise<ExtractedImage[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  try {
    // Read PDF file
    const pdfBuffer = await fs.readFile(filePath);

    // Extract images from buffer
    return await extractImagesFromPDFBuffer(pdfBuffer, cfg);
  } catch (error) {
    throw new ExtractionError(
      `Failed to extract images from PDF: ${(error as Error).message}`,
      'pdf-images',
      { filePath, originalError: (error as Error).message }
    );
  }
}

/**
 * Extract images from PDF buffer
 *
 * Why: Enables in-memory processing without file I/O
 *
 * @param buffer - PDF file buffer
 * @param config - Extraction configuration
 * @returns Array of extracted images
 */
export async function extractImagesFromPDFBuffer(
  buffer: Buffer,
  config: ImageExtractionConfig = {}
): Promise<ExtractedImage[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const images: ExtractedImage[] = [];

  try {
    // Load PDF document
    const pdfDoc = await PDFDocument.load(buffer);
    const pages = pdfDoc.getPages();

    // Ensure output directory exists
    await ensureDirectory(cfg.outputDir);

    // Extract images from each page
    for (let pageNum = 0; pageNum < pages.length; pageNum++) {
      const page = pages[pageNum];
      const pageImages = await extractImagesFromPage(
        page,
        pageNum + 1,
        cfg
      );
      images.push(...pageImages);

      // Stop if we've reached the max images limit
      if (images.length >= cfg.maxImages) {
        break;
      }
    }

    return images.slice(0, cfg.maxImages);
  } catch (error) {
    throw new ExtractionError(
      `Failed to extract images from PDF buffer: ${(error as Error).message}`,
      'pdf-images',
      { originalError: (error as Error).message }
    );
  }
}

/**
 * Extract images from a single PDF page
 *
 * Why: pdf-lib provides page-level access to embedded images
 *
 * @param page - PDF page object
 * @param pageNumber - 1-indexed page number
 * @param config - Extraction configuration
 * @returns Array of extracted images from this page
 */
async function extractImagesFromPage(
  _page: any,
  _pageNumber: number,
  _config: Required<ImageExtractionConfig>
): Promise<ExtractedImage[]> {
  const images: ExtractedImage[] = [];

  // Note: pdf-lib doesn't directly expose embedded images
  // For MVP, we'll use a simplified approach
  // In production, would use pdfjs-dist or pdf2pic for more robust extraction

  // For now, return empty array as placeholder
  // This would be implemented with pdfjs-dist or pdf2pic in production
  // See implementation note below

  return images;
}

/**
 * Save extracted image to disk
 *
 * Why: Persist images for later vision AI processing
 *
 * Note: Currently unused as image extraction is stubbed for MVP.
 * Will be used when full image extraction is implemented with pdfjs-dist.
 */
// @ts-ignore - Unused in MVP, will be used in full implementation
async function saveImageToStorage(
  imageData: Buffer,
  pageNumber: number,
  outputDir: string
): Promise<string> {
  const imageId = uuidv4();
  const filename = `${imageId}_page${pageNumber}.png`;
  const filePath = path.join(outputDir, filename);

  await fs.writeFile(filePath, imageData);

  return filePath;
}

/**
 * Determine image importance based on size and position
 *
 * Why: Prioritize larger, well-positioned images for AI processing
 * Smaller images are often decorative (icons, bullets, etc.)
 *
 * @param position - Image position and dimensions
 * @param pageWidth - Page width
 * @param pageHeight - Page height
 * @returns Importance level
 */
export function determineImageImportance(
  position: ImagePosition,
  pageWidth: number,
  pageHeight: number
): ImageImportance {
  const imageArea = position.width * position.height;
  const pageArea = pageWidth * pageHeight;
  const areaRatio = imageArea / pageArea;

  // Large images (>25% of page) are highly important
  if (areaRatio > 0.25) {
    return 'high';
  }

  // Medium images (10-25% of page) are moderately important
  if (areaRatio > 0.1) {
    return 'medium';
  }

  // Small images (<10% of page) are low importance
  return 'low';
}

/**
 * Filter out decorative images
 *
 * Why: Many PDFs contain logos, bullets, icons that aren't meaningful
 * Filter these out to save processing costs
 *
 * @param images - Array of extracted images
 * @param minWidth - Minimum width
 * @param minHeight - Minimum height
 * @returns Filtered array of meaningful images
 */
export function filterDecorativeImages(
  images: ExtractedImage[],
  minWidth: number = 100,
  minHeight: number = 100
): ExtractedImage[] {
  return images.filter(img => {
    // Filter by size
    if (img.position.width < minWidth || img.position.height < minHeight) {
      return false;
    }

    // Filter out very small images (likely icons)
    const area = img.position.width * img.position.height;
    if (area < 10000) {
      // Less than 100x100 pixels
      return false;
    }

    return true;
  });
}

/**
 * Ensure directory exists, create if needed
 *
 * @param dirPath - Directory path
 */
async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

/**
 * IMPLEMENTATION NOTE:
 *
 * The current implementation is a placeholder because pdf-lib doesn't
 * directly expose embedded images. For production, we would use one of:
 *
 * 1. pdfjs-dist: More robust, used by Firefox PDF viewer
 *    - Can extract all embedded images
 *    - Better metadata about image position
 *
 * 2. pdf2pic: Converts PDF pages to images
 *    - Rasterizes entire pages
 *    - Good for scanned documents
 *    - Higher cost (processes whole pages)
 *
 * 3. Poppler/Ghostscript via child_process
 *    - Most robust, used by many production systems
 *    - Requires external dependencies
 *    - Complex setup for different platforms
 *
 * For MVP, we recommend option 1 (pdfjs-dist) with implementation like:
 *
 * ```typescript
 * import * as pdfjsLib from 'pdfjs-dist';
 *
 * async function extractWithPdfJs(buffer: Buffer) {
 *   const loadingTask = pdfjsLib.getDocument({ data: buffer });
 *   const pdf = await loadingTask.promise;
 *
 *   for (let i = 1; i <= pdf.numPages; i++) {
 *     const page = await pdf.getPage(i);
 *     const ops = await page.getOperatorList();
 *
 *     // Find image operations (OPS.paintImageXObject)
 *     // Extract and save images
 *   }
 * }
 * ```
 *
 * This would be implemented in a future iteration when multimodal
 * processing becomes a priority.
 */

/**
 * Stub implementation for testing
 * Returns mock images for development/testing
 */
export async function extractImagesFromPDFStub(
  _filePath: string
): Promise<ExtractedImage[]> {
  // For MVP testing, return empty array
  // Replace with actual implementation when needed
  return [];
}

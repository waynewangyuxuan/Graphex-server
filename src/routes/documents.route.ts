/**
 * Document Routes
 * Defines document-related API endpoints
 */

import { Router } from 'express';
import multer from 'multer';
import {
  uploadDocument,
  createDocumentFromUrl,
  getDocumentById,
  getDocumentStatus,
} from '../controllers/document.controller';
import { fileUploadLimiter, urlExtractionLimiter } from '../middleware/rate-limiter.middleware';
import { FILE_UPLOAD } from '../config/constants';

const router = Router();

// Configure Multer for file uploads
const upload = multer({
  dest: FILE_UPLOAD.UPLOAD_DIR,
  limits: {
    fileSize: FILE_UPLOAD.MAX_SIZE,
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = FILE_UPLOAD.ALLOWED_MIME_TYPES as readonly string[];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
});

/**
 * POST /api/v1/documents
 * Upload a document file
 */
router.post('/', fileUploadLimiter, upload.single('file'), uploadDocument);

/**
 * POST /api/v1/documents/from-url
 * Create document from URL
 */
router.post('/from-url', urlExtractionLimiter, createDocumentFromUrl);

/**
 * GET /api/v1/documents/:id
 * Get document by ID
 */
router.get('/:id', getDocumentById);

/**
 * GET /api/v1/documents/:id/status
 * Get document processing status
 */
router.get('/:id/status', getDocumentStatus);

export default router;

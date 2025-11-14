/**
 * Document Routes
 * Defines document-related API endpoints with validation
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
import { validate } from '../middleware/validation.middleware';
import {
  DocumentUploadSchema,
  DocumentIdParamSchema,
  DocumentFromUrlSchema,
} from '../schemas/document.schema';
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
 *
 * Flow: Rate Limit → Multer Upload → Validation → Controller
 */
router.post(
  '/',
  fileUploadLimiter,
  upload.single('file'),
  validate(DocumentUploadSchema),
  uploadDocument
);

/**
 * POST /api/v1/documents/from-url
 * Create document from URL
 *
 * Flow: Rate Limit → Validation → Controller
 */
router.post(
  '/from-url',
  urlExtractionLimiter,
  validate(DocumentFromUrlSchema),
  createDocumentFromUrl
);

/**
 * GET /api/v1/documents/:id
 * Get document by ID
 *
 * Flow: Validation → Controller
 */
router.get(
  '/:id',
  validate(DocumentIdParamSchema),
  getDocumentById
);

/**
 * GET /api/v1/documents/:id/status
 * Get document processing status
 *
 * Flow: Validation → Controller
 */
router.get(
  '/:id/status',
  validate(DocumentIdParamSchema),
  getDocumentStatus
);

export default router;

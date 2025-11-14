/**
 * Document Validation Schemas
 * Zod schemas for document upload and retrieval endpoints
 */

import { z } from 'zod';

/**
 * POST /api/v1/documents - File upload body validation
 *
 * WHY: Validate optional title for uploaded documents
 */
export const DocumentUploadSchema = z.object({
  body: z.object({
    title: z
      .string()
      .min(1, 'Title cannot be empty')
      .max(500, 'Title too long (max 500 characters)')
      .optional(),
  }),
});

/**
 * GET /api/v1/documents/:id - Path parameter validation
 *
 * WHY: Ensure document ID is a valid CUID format
 */
export const DocumentIdParamSchema = z.object({
  params: z.object({
    id: z
      .string()
      .min(1, 'Document ID is required'),
  }),
});

/**
 * POST /api/v1/documents/from-url - URL extraction validation
 *
 * WHY: Validate URL format and optional title
 */
export const DocumentFromUrlSchema = z.object({
  body: z.object({
    url: z
      .string()
      .url('Invalid URL format'),
    title: z
      .string()
      .min(1, 'Title cannot be empty')
      .max(500, 'Title too long (max 500 characters)')
      .optional(),
  }),
});

// Export inferred types for TypeScript
export type DocumentUploadRequest = z.infer<typeof DocumentUploadSchema>;
export type DocumentIdParam = z.infer<typeof DocumentIdParamSchema>;
export type DocumentFromUrlRequest = z.infer<typeof DocumentFromUrlSchema>;

/**
 * Graph Validation Schemas
 * Zod schemas for graph generation endpoints
 */

import { z } from 'zod';

/**
 * POST /api/v1/graphs/generate - Request body validation
 *
 * WHY: Validate document text input before expensive AI processing
 */
export const GraphGenerationRequestSchema = z.object({
  body: z.object({
    documentText: z
      .string()
      .min(100, 'Document text must be at least 100 characters')
      .max(500000, 'Document text exceeds maximum length (500,000 characters)'),
    documentTitle: z
      .string()
      .min(1, 'Document title is required')
      .max(500, 'Document title too long')
      .optional()
      .default('Untitled Document'),
    userId: z
      .string()
      .optional(), // MVP: userId is optional (no auth yet)
    options: z.object({
      maxNodes: z
        .number()
        .int()
        .positive()
        .min(5)
        .max(25)
        .optional()
        .default(15),
      skipCache: z
        .boolean()
        .optional()
        .default(false),
    }).optional(),
  }),
});

/**
 * GET /api/v1/graphs/:id - Path parameter validation
 */
export const GraphIdParamSchema = z.object({
  params: z.object({
    id: z
      .string()
      .min(1, 'Graph ID is required'),
  }),
});

/**
 * GET /api/v1/jobs/:id - Path parameter validation
 */
export const JobIdParamSchema = z.object({
  params: z.object({
    id: z
      .string()
      .min(1, 'Job ID is required'),
  }),
});

// Export inferred types for TypeScript
export type GraphGenerationRequest = z.infer<typeof GraphGenerationRequestSchema>;
export type GraphIdParam = z.infer<typeof GraphIdParamSchema>;
export type JobIdParam = z.infer<typeof JobIdParamSchema>;

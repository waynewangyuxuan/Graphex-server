/**
 * Graph Schema Validation Tests
 *
 * Tests for Zod validation schemas:
 * - GraphGenerationRequestSchema
 * - GraphIdParamSchema
 * - JobIdParamSchema
 *
 * Coverage:
 * - Valid inputs (pass validation)
 * - Invalid inputs (fail with specific errors)
 * - Edge cases (boundaries, empty strings, wrong types)
 * - Default values (optional fields)
 */

import {
  GraphGenerationRequestSchema,
  GraphIdParamSchema,
  JobIdParamSchema,
} from '../graph.schema';

describe('Graph Validation Schemas', () => {
  // ============================================================
  // GRAPH GENERATION REQUEST SCHEMA
  // ============================================================

  describe('GraphGenerationRequestSchema', () => {
    describe('documentText validation', () => {
      it('should accept valid document text', () => {
        const validData = {
          body: {
            documentText: 'This is a valid document with sufficient length. '.repeat(5),
            documentTitle: 'Test Document',
          },
        };

        const result = GraphGenerationRequestSchema.safeParse(validData);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.body.documentText).toBe(validData.body.documentText);
        }
      });

      it('should reject document text shorter than 100 characters', () => {
        const invalidData = {
          body: {
            documentText: 'Too short',
            documentTitle: 'Test',
          },
        };

        const result = GraphGenerationRequestSchema.safeParse(invalidData);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('at least 100 characters');
        }
      });

      it('should reject document text longer than 500,000 characters', () => {
        const invalidData = {
          body: {
            documentText: 'x'.repeat(500001),
            documentTitle: 'Test',
          },
        };

        const result = GraphGenerationRequestSchema.safeParse(invalidData);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('exceeds maximum length');
        }
      });

      it('should reject missing document text', () => {
        const invalidData = {
          body: {
            documentTitle: 'Test',
          },
        };

        const result = GraphGenerationRequestSchema.safeParse(invalidData);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].path).toContain('documentText');
        }
      });

      it('should reject non-string document text', () => {
        const invalidData = {
          body: {
            documentText: 12345,
            documentTitle: 'Test',
          },
        };

        const result = GraphGenerationRequestSchema.safeParse(invalidData);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].code).toBe('invalid_type');
        }
      });

      it('should accept document text at minimum boundary (100 chars)', () => {
        const validData = {
          body: {
            documentText: 'x'.repeat(100),
            documentTitle: 'Test',
          },
        };

        const result = GraphGenerationRequestSchema.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should accept document text at maximum boundary (500,000 chars)', () => {
        const validData = {
          body: {
            documentText: 'x'.repeat(500000),
            documentTitle: 'Test',
          },
        };

        const result = GraphGenerationRequestSchema.safeParse(validData);

        expect(result.success).toBe(true);
      });
    });

    describe('documentTitle validation', () => {
      it('should accept valid document title', () => {
        const validData = {
          body: {
            documentText: 'x'.repeat(100),
            documentTitle: 'Valid Document Title',
          },
        };

        const result = GraphGenerationRequestSchema.safeParse(validData);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.body.documentTitle).toBe('Valid Document Title');
        }
      });

      it('should use default title when documentTitle is missing', () => {
        const validData = {
          body: {
            documentText: 'x'.repeat(100),
          },
        };

        const result = GraphGenerationRequestSchema.safeParse(validData);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.body.documentTitle).toBe('Untitled Document');
        }
      });

      it('should reject empty document title', () => {
        const invalidData = {
          body: {
            documentText: 'x'.repeat(100),
            documentTitle: '',
          },
        };

        const result = GraphGenerationRequestSchema.safeParse(invalidData);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('required');
        }
      });

      it('should reject document title longer than 500 characters', () => {
        const invalidData = {
          body: {
            documentText: 'x'.repeat(100),
            documentTitle: 'x'.repeat(501),
          },
        };

        const result = GraphGenerationRequestSchema.safeParse(invalidData);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('too long');
        }
      });

      it('should accept document title at minimum boundary (1 char)', () => {
        const validData = {
          body: {
            documentText: 'x'.repeat(100),
            documentTitle: 'A',
          },
        };

        const result = GraphGenerationRequestSchema.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should accept document title at maximum boundary (500 chars)', () => {
        const validData = {
          body: {
            documentText: 'x'.repeat(100),
            documentTitle: 'x'.repeat(500),
          },
        };

        const result = GraphGenerationRequestSchema.safeParse(validData);

        expect(result.success).toBe(true);
      });
    });

    describe('userId validation', () => {
      it('should accept valid userId', () => {
        const validData = {
          body: {
            documentText: 'x'.repeat(100),
            documentTitle: 'Test',
            userId: 'user-123',
          },
        };

        const result = GraphGenerationRequestSchema.safeParse(validData);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.body.userId).toBe('user-123');
        }
      });

      it('should accept missing userId (optional)', () => {
        const validData = {
          body: {
            documentText: 'x'.repeat(100),
            documentTitle: 'Test',
          },
        };

        const result = GraphGenerationRequestSchema.safeParse(validData);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.body.userId).toBeUndefined();
        }
      });
    });

    describe('options validation', () => {
      it('should accept valid options', () => {
        const validData = {
          body: {
            documentText: 'x'.repeat(100),
            documentTitle: 'Test',
            options: {
              maxNodes: 20,
              skipCache: true,
            },
          },
        };

        const result = GraphGenerationRequestSchema.safeParse(validData);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.body.options).toEqual({
            maxNodes: 20,
            skipCache: true,
          });
        }
      });

      it('should use default options when not provided', () => {
        const validData = {
          body: {
            documentText: 'x'.repeat(100),
            documentTitle: 'Test',
          },
        };

        const result = GraphGenerationRequestSchema.safeParse(validData);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.body.options).toBeUndefined();
        }
      });

      it('should reject maxNodes less than 5', () => {
        const invalidData = {
          body: {
            documentText: 'x'.repeat(100),
            documentTitle: 'Test',
            options: {
              maxNodes: 4,
            },
          },
        };

        const result = GraphGenerationRequestSchema.safeParse(invalidData);

        expect(result.success).toBe(false);
      });

      it('should reject maxNodes greater than 25', () => {
        const invalidData = {
          body: {
            documentText: 'x'.repeat(100),
            documentTitle: 'Test',
            options: {
              maxNodes: 26,
            },
          },
        };

        const result = GraphGenerationRequestSchema.safeParse(invalidData);

        expect(result.success).toBe(false);
      });

      it('should reject negative maxNodes', () => {
        const invalidData = {
          body: {
            documentText: 'x'.repeat(100),
            documentTitle: 'Test',
            options: {
              maxNodes: -5,
            },
          },
        };

        const result = GraphGenerationRequestSchema.safeParse(invalidData);

        expect(result.success).toBe(false);
      });

      it('should reject non-integer maxNodes', () => {
        const invalidData = {
          body: {
            documentText: 'x'.repeat(100),
            documentTitle: 'Test',
            options: {
              maxNodes: 15.5,
            },
          },
        };

        const result = GraphGenerationRequestSchema.safeParse(invalidData);

        expect(result.success).toBe(false);
      });

      it('should accept maxNodes at minimum boundary (5)', () => {
        const validData = {
          body: {
            documentText: 'x'.repeat(100),
            documentTitle: 'Test',
            options: {
              maxNodes: 5,
            },
          },
        };

        const result = GraphGenerationRequestSchema.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should accept maxNodes at maximum boundary (25)', () => {
        const validData = {
          body: {
            documentText: 'x'.repeat(100),
            documentTitle: 'Test',
            options: {
              maxNodes: 25,
            },
          },
        };

        const result = GraphGenerationRequestSchema.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should use default maxNodes (15) when not provided', () => {
        const validData = {
          body: {
            documentText: 'x'.repeat(100),
            documentTitle: 'Test',
            options: {},
          },
        };

        const result = GraphGenerationRequestSchema.safeParse(validData);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.body.options?.maxNodes).toBe(15);
        }
      });

      it('should use default skipCache (false) when not provided', () => {
        const validData = {
          body: {
            documentText: 'x'.repeat(100),
            documentTitle: 'Test',
            options: {},
          },
        };

        const result = GraphGenerationRequestSchema.safeParse(validData);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.body.options?.skipCache).toBe(false);
        }
      });

      it('should reject non-boolean skipCache', () => {
        const invalidData = {
          body: {
            documentText: 'x'.repeat(100),
            documentTitle: 'Test',
            options: {
              skipCache: 'true' as any,
            },
          },
        };

        const result = GraphGenerationRequestSchema.safeParse(invalidData);

        expect(result.success).toBe(false);
      });
    });
  });

  // ============================================================
  // GRAPH ID PARAM SCHEMA
  // ============================================================

  describe('GraphIdParamSchema', () => {
    it('should accept valid graph ID', () => {
      const validData = {
        params: {
          id: 'graph-123-abc-456',
        },
      };

      const result = GraphIdParamSchema.safeParse(validData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.params.id).toBe('graph-123-abc-456');
      }
    });

    it('should accept UUID format graph ID', () => {
      const validData = {
        params: {
          id: '550e8400-e29b-41d4-a716-446655440000',
        },
      };

      const result = GraphIdParamSchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should reject empty graph ID', () => {
      const invalidData = {
        params: {
          id: '',
        },
      };

      const result = GraphIdParamSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('required');
      }
    });

    it('should reject missing graph ID', () => {
      const invalidData = {
        params: {},
      };

      const result = GraphIdParamSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should reject non-string graph ID', () => {
      const invalidData = {
        params: {
          id: 123,
        },
      };

      const result = GraphIdParamSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });

  // ============================================================
  // JOB ID PARAM SCHEMA
  // ============================================================

  describe('JobIdParamSchema', () => {
    it('should accept valid job ID', () => {
      const validData = {
        params: {
          id: 'job-123-abc-456',
        },
      };

      const result = JobIdParamSchema.safeParse(validData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.params.id).toBe('job-123-abc-456');
      }
    });

    it('should accept UUID format job ID', () => {
      const validData = {
        params: {
          id: '550e8400-e29b-41d4-a716-446655440000',
        },
      };

      const result = JobIdParamSchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should reject empty job ID', () => {
      const invalidData = {
        params: {
          id: '',
        },
      };

      const result = JobIdParamSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('required');
      }
    });

    it('should reject missing job ID', () => {
      const invalidData = {
        params: {},
      };

      const result = JobIdParamSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should reject non-string job ID', () => {
      const invalidData = {
        params: {
          id: 456,
        },
      };

      const result = JobIdParamSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });
});

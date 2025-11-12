/**
 * Documents API Integration Tests
 *
 * Tests all document-related endpoints:
 * - POST /api/v1/documents (file upload)
 * - POST /api/v1/documents/url (URL extraction)
 * - GET /api/v1/documents/:id
 * - GET /api/v1/documents/:id/status
 */

import request from 'supertest';
import { Application } from 'express';
import { createApp } from '../../app';
import { setupTest, teardownTest } from '../helpers/setup';
import {
  createMockDocument,
  createProcessingDocument,
  createFailedDocument,
  createUrlDocument,
} from '../helpers/factories';
import { createMockFile } from '../helpers/mocks';
import { DocumentStatus, DocumentSourceType } from '../../types/document.types';
import { ErrorCode } from '../../types/api.types';

describe('Documents API Integration Tests', () => {
  let app: Application;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await teardownTest();
  });

  describe('POST /api/v1/documents', () => {
    it('should upload document successfully and return 201', async () => {
      // WHY: Verifies successful document upload with file
      const response = await request(app)
        .post('/api/v1/documents')
        .field('title', 'Test Document')
        .attach('file', Buffer.from('mock pdf content'), 'test.pdf')
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: expect.any(String),
        title: 'Test Document',
        sourceType: DocumentSourceType.PDF,
        status: DocumentStatus.PROCESSING,
      });
      expect(response.body.meta).toHaveProperty('timestamp');
      expect(response.body.meta).toHaveProperty('requestId');
    });

    it('should return 201 with default title when title not provided', async () => {
      // WHY: Tests default behavior when optional field is missing
      const response = await request(app)
        .post('/api/v1/documents')
        .attach('file', Buffer.from('mock pdf content'), 'test.pdf')
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('Untitled Document');
    });

    it('should return 400 when no file is uploaded', async () => {
      // WHY: Tests validation for required file field
      const response = await request(app)
        .post('/api/v1/documents')
        .field('title', 'Test Document')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.INVALID_REQUEST);
    });

    it('should return 400 for unsupported file format', async () => {
      // WHY: Tests file type validation
      const response = await request(app)
        .post('/api/v1/documents')
        .attach('file', Buffer.from('executable content'), 'test.exe')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.UNSUPPORTED_FORMAT);
    });

    it('should return 400 when file size exceeds limit', async () => {
      // WHY: Tests file size validation (10MB limit)
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB

      const response = await request(app)
        .post('/api/v1/documents')
        .attach('file', largeBuffer, 'large.pdf')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.FILE_TOO_LARGE);
    });

    it('should include file metadata in response', async () => {
      // WHY: Verifies that file size and other metadata are captured
      const response = await request(app)
        .post('/api/v1/documents')
        .field('title', 'Metadata Test')
        .attach('file', Buffer.from('test content'), 'test.pdf')
        .expect(201);

      expect(response.body.data).toHaveProperty('fileSize');
      expect(response.body.data.fileSize).toBeGreaterThan(0);
      expect(response.body.data).toHaveProperty('createdAt');
      expect(response.body.data).toHaveProperty('updatedAt');
    });
  });

  describe('POST /api/v1/documents/url', () => {
    it('should create document from URL successfully', async () => {
      // WHY: Tests URL-based document creation
      const response = await request(app)
        .post('/api/v1/documents/url')
        .send({
          url: 'https://example.com/article',
          title: 'Test Article',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: expect.any(String),
        title: 'Test Article',
        sourceType: DocumentSourceType.URL,
        sourceUrl: 'https://example.com/article',
        status: DocumentStatus.PROCESSING,
      });
    });

    it('should return 201 with default title when title not provided', async () => {
      // WHY: Tests default behavior for optional title field
      const response = await request(app)
        .post('/api/v1/documents/url')
        .send({
          url: 'https://example.com/article',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('Untitled Document');
    });

    it('should return 400 when URL is missing', async () => {
      // WHY: Tests validation for required URL field
      const response = await request(app)
        .post('/api/v1/documents/url')
        .send({
          title: 'Test Article',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.INVALID_REQUEST);
    });

    it('should return 400 for invalid URL format', async () => {
      // WHY: Tests URL format validation
      const response = await request(app)
        .post('/api/v1/documents/url')
        .send({
          url: 'not-a-valid-url',
          title: 'Test Article',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.INVALID_REQUEST);
    });

    it('should return 400 for localhost/internal URLs', async () => {
      // WHY: Tests security validation - prevents SSRF attacks
      const internalUrls = [
        'http://localhost/admin',
        'http://127.0.0.1/internal',
        'http://192.168.1.1/config',
        'http://10.0.0.1/secret',
      ];

      for (const url of internalUrls) {
        const response = await request(app)
          .post('/api/v1/documents/url')
          .send({ url })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe(ErrorCode.INVALID_REQUEST);
      }
    });
  });

  describe('GET /api/v1/documents/:id', () => {
    it('should retrieve document by ID successfully', async () => {
      // WHY: Tests successful document retrieval
      const documentId = 'doc-test-123';

      const response = await request(app)
        .get(`/api/v1/documents/${documentId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id', documentId);
      expect(response.body.data).toHaveProperty('title');
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('sourceType');
    });

    it('should return 404 for non-existent document', async () => {
      // WHY: Tests error handling for missing resources
      const response = await request(app)
        .get('/api/v1/documents/non-existent-id')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.DOCUMENT_NOT_FOUND);
    });

    it('should return 400 for invalid document ID format', async () => {
      // WHY: Tests input validation for ID parameter
      const response = await request(app)
        .get('/api/v1/documents/invalid@id!')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.INVALID_REQUEST);
    });

    it('should include all document fields in response', async () => {
      // WHY: Verifies complete data structure is returned
      const documentId = 'doc-test-123';

      const response = await request(app)
        .get(`/api/v1/documents/${documentId}`)
        .expect(200);

      const { data } = response.body;
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('title');
      expect(data).toHaveProperty('sourceType');
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('createdAt');
      expect(data).toHaveProperty('updatedAt');
    });
  });

  describe('GET /api/v1/documents/:id/status', () => {
    it('should retrieve document processing status', async () => {
      // WHY: Tests status endpoint for polling document processing
      const documentId = 'doc-test-123';

      const response = await request(app)
        .get(`/api/v1/documents/${documentId}/status`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id', documentId);
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('progress');
    });

    it('should return processing status with progress', async () => {
      // WHY: Tests status for document still being processed
      const documentId = 'doc-processing-123';

      const response = await request(app)
        .get(`/api/v1/documents/${documentId}/status`)
        .expect(200);

      expect(response.body.data.status).toBe(DocumentStatus.PROCESSING);
      expect(response.body.data.progress).toBeGreaterThanOrEqual(0);
      expect(response.body.data.progress).toBeLessThanOrEqual(100);
    });

    it('should return ready status with 100% progress', async () => {
      // WHY: Tests status for completed document
      const documentId = 'doc-ready-123';

      const response = await request(app)
        .get(`/api/v1/documents/${documentId}/status`)
        .expect(200);

      expect(response.body.data.status).toBe(DocumentStatus.READY);
      expect(response.body.data.progress).toBe(100);
    });

    it('should return 404 for non-existent document', async () => {
      // WHY: Tests error handling for status of missing document
      const response = await request(app)
        .get('/api/v1/documents/non-existent-id/status')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.DOCUMENT_NOT_FOUND);
    });

    it('should include error message for failed documents', async () => {
      // WHY: Tests that failure reasons are communicated to client
      const documentId = 'doc-failed-123';

      const response = await request(app)
        .get(`/api/v1/documents/${documentId}/status`)
        .expect(200);

      if (response.body.data.status === DocumentStatus.FAILED) {
        expect(response.body.data).toHaveProperty('errorMessage');
        expect(response.body.data.errorMessage).toBeTruthy();
      }
    });
  });

  describe('API Response Format', () => {
    it('should return consistent success response format', async () => {
      // WHY: Verifies all endpoints follow standardized response format
      const response = await request(app)
        .get('/api/v1/documents/doc-test-123')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(response.body.meta).toHaveProperty('timestamp');
      expect(response.body.meta).toHaveProperty('requestId');
    });

    it('should return consistent error response format', async () => {
      // WHY: Verifies error responses follow standardized format
      const response = await request(app)
        .get('/api/v1/documents/non-existent-id')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body).toHaveProperty('meta');
      expect(response.body.meta).toHaveProperty('timestamp');
      expect(response.body.meta).toHaveProperty('requestId');
    });

    it('should include unique requestId for each request', async () => {
      // WHY: Tests that each request gets a unique ID for tracking
      const response1 = await request(app)
        .get('/api/v1/documents/doc-test-123');

      const response2 = await request(app)
        .get('/api/v1/documents/doc-test-123');

      expect(response1.body.meta.requestId).toBeTruthy();
      expect(response2.body.meta.requestId).toBeTruthy();
      expect(response1.body.meta.requestId).not.toBe(response2.body.meta.requestId);
    });
  });
});

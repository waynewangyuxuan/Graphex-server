/**
 * Notes API Integration Tests
 *
 * Tests all note-related endpoints:
 * - POST /api/v1/notes
 * - GET /api/v1/notes/:id
 * - PUT /api/v1/notes/:id
 * - DELETE /api/v1/notes/:id
 */

import request from 'supertest';
import { Application } from 'express';
import { createApp } from '../../app';
import { setupTest, teardownTest } from '../helpers/setup';
import { ErrorCode } from '../../types/api.types';

describe('Notes API Integration Tests', () => {
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

  describe('POST /api/v1/notes', () => {
    it('should create note successfully', async () => {
      // WHY: Tests note creation with valid data
      const response = await request(app)
        .post('/api/v1/notes')
        .send({
          graphId: 'graph-test-123',
          content: 'This is an important concept',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('graphId', 'graph-test-123');
      expect(response.body.data).toHaveProperty('content', 'This is an important concept');
      expect(response.body.data).toHaveProperty('createdAt');
      expect(response.body.data).toHaveProperty('updatedAt');
    });

    it('should create note attached to node', async () => {
      // WHY: Tests note creation linked to specific node
      const response = await request(app)
        .post('/api/v1/notes')
        .send({
          graphId: 'graph-test-123',
          nodeId: 'node-1',
          content: 'Note about this node',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('nodeId', 'node-1');
    });

    it('should create note attached to edge', async () => {
      // WHY: Tests note creation linked to specific edge
      const response = await request(app)
        .post('/api/v1/notes')
        .send({
          graphId: 'graph-test-123',
          edgeId: 'edge-1',
          content: 'Note about this connection',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('edgeId', 'edge-1');
    });

    it('should return 400 when required fields are missing', async () => {
      // WHY: Tests validation for required fields
      const response = await request(app)
        .post('/api/v1/notes')
        .send({
          content: 'Note without graph ID',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.INVALID_REQUEST);
    });

    it('should return 404 when graph does not exist', async () => {
      // WHY: Tests validation of graph existence
      const response = await request(app)
        .post('/api/v1/notes')
        .send({
          graphId: 'non-existent-graph',
          content: 'Test note',
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.GRAPH_NOT_FOUND);
    });
  });

  describe('GET /api/v1/notes/:id', () => {
    it('should retrieve note by ID', async () => {
      // WHY: Tests note retrieval
      const noteId = 'note-test-123';

      const response = await request(app)
        .get(`/api/v1/notes/${noteId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id', noteId);
      expect(response.body.data).toHaveProperty('content');
      expect(response.body.data).toHaveProperty('graphId');
    });

    it('should return 404 for non-existent note', async () => {
      // WHY: Tests error handling for missing note
      const response = await request(app)
        .get('/api/v1/notes/non-existent-note')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/v1/notes/:id', () => {
    it('should update note successfully', async () => {
      // WHY: Tests note content update
      const noteId = 'note-test-123';

      const response = await request(app)
        .put(`/api/v1/notes/${noteId}`)
        .send({
          content: 'Updated note content',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id', noteId);
      expect(response.body.data).toHaveProperty('content', 'Updated note content');
      expect(response.body.data).toHaveProperty('updatedAt');
    });

    it('should return 400 when content is empty', async () => {
      // WHY: Tests validation for required content
      const response = await request(app)
        .put('/api/v1/notes/note-test-123')
        .send({
          content: '',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.INVALID_REQUEST);
    });

    it('should return 404 for non-existent note', async () => {
      // WHY: Tests error handling when updating missing note
      const response = await request(app)
        .put('/api/v1/notes/non-existent-note')
        .send({
          content: 'Updated content',
        })
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should update updatedAt timestamp', async () => {
      // WHY: Tests that modification time is tracked
      const noteId = 'note-test-123';

      const before = new Date();
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay

      const response = await request(app)
        .put(`/api/v1/notes/${noteId}`)
        .send({
          content: 'Updated content',
        })
        .expect(200);

      const updatedAt = new Date(response.body.data.updatedAt);
      expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('DELETE /api/v1/notes/:id', () => {
    it('should delete note successfully', async () => {
      // WHY: Tests note deletion
      const noteId = 'note-test-123';

      const response = await request(app)
        .delete(`/api/v1/notes/${noteId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('message');
    });

    it('should return 404 for non-existent note', async () => {
      // WHY: Tests error handling when deleting missing note
      const response = await request(app)
        .delete('/api/v1/notes/non-existent-note')
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should not find deleted note on subsequent GET', async () => {
      // WHY: Tests that deletion is permanent
      const noteId = 'note-to-delete-123';

      // Delete the note
      await request(app)
        .delete(`/api/v1/notes/${noteId}`)
        .expect(200);

      // Try to get the deleted note
      const response = await request(app)
        .get(`/api/v1/notes/${noteId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Query notes by graph', () => {
    it('should retrieve all notes for a graph', async () => {
      // WHY: Tests filtering notes by graph ID
      const response = await request(app)
        .get('/api/v1/notes')
        .query({ graphId: 'graph-test-123' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter notes by node', async () => {
      // WHY: Tests retrieving notes for specific node
      const response = await request(app)
        .get('/api/v1/notes')
        .query({
          graphId: 'graph-test-123',
          nodeId: 'node-1',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter notes by edge', async () => {
      // WHY: Tests retrieving notes for specific edge
      const response = await request(app)
        .get('/api/v1/notes')
        .query({
          graphId: 'graph-test-123',
          edgeId: 'edge-1',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });
});

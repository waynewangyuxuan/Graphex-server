/**
 * Note Routes
 * Defines note-related API endpoints
 */

import { Router } from 'express';
import { createNote, getNotesByGraphId, updateNote, deleteNote } from '../controllers/note.controller';

const router = Router();

/**
 * POST /api/v1/notes
 * Create a new note
 */
router.post('/', createNote);

/**
 * GET /api/v1/notes?graphId=:id
 * Get all notes for a graph
 */
router.get('/', getNotesByGraphId);

/**
 * PUT /api/v1/notes/:id
 * Update a note
 */
router.put('/:id', updateNote);

/**
 * DELETE /api/v1/notes/:id
 * Delete a note
 */
router.delete('/:id', deleteNote);

export default router;

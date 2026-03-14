import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import database from '../services/database.js';
import { validate, validateUUID, sessionCreateSchema, sessionUpdateSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

// Create new session
router.post('/', validate(sessionCreateSchema), asyncHandler(async (req, res) => {
  const { name, character_name, character_mode, mode, settings_snapshot } = req.body;
  const sessionId = uuidv4();

  // Insert session with validated data
  await database.run(
    `INSERT INTO sessions (id, name, character_name, character_mode, mode, settings_snapshot)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      sessionId,
      name,
      character_name || null,
      character_mode || 'single',
      mode,
      settings_snapshot ? JSON.stringify(settings_snapshot) : null
    ]
  );

  // Get the created session
  const sessions = await database.all(
    'SELECT * FROM sessions WHERE id = ?',
    [sessionId]
  );

  res.json({
    success: true,
    session: sessions[0]
  });
}));

// List sessions
router.get('/', asyncHandler(async (req, res) => {
  const { archived = 'false', limit = '50', offset = '0' } = req.query;

  // Validate and sanitize query parameters
  const parsedLimit = Math.min(parseInt(limit) || 50, 100); // Max 100
  const parsedOffset = Math.max(parseInt(offset) || 0, 0);
  const isArchived = archived === 'true' ? 1 : 0;

  const sessions = await database.all(
    `SELECT * FROM sessions
     WHERE archived = ?
     ORDER BY updated_at DESC
     LIMIT ? OFFSET ?`,
    [isArchived, parsedLimit, parsedOffset]
  );

  const countResult = await database.all(
    'SELECT COUNT(*) as count FROM sessions WHERE archived = ?',
    [isArchived]
  );

  const total = countResult[0]?.count || 0;

  res.json({
    success: true,
    sessions,
    total,
    has_more: parsedOffset + sessions.length < total
  });
}));

// Get session by ID
router.get('/:id', validateUUID('id'), asyncHandler(async (req, res) => {
  const sessions = await database.all(
    'SELECT * FROM sessions WHERE id = ?',
    [req.params.id]
  );

  if (sessions.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Session not found'
    });
  }

  const session = sessions[0];
  if (session.settings_snapshot) {
    try {
      session.settings_snapshot = JSON.parse(session.settings_snapshot);
    } catch (error) {
      console.error('Failed to parse settings snapshot:', error);
      session.settings_snapshot = null;
    }
  }

  res.json({
    success: true,
    session
  });
}));

// Update session - FIXED SQL INJECTION VULNERABILITY
router.put('/:id', validateUUID('id'), validate(sessionUpdateSchema), asyncHandler(async (req, res) => {
  const { name, archived } = req.body;

  // SECURITY FIX: Whitelist allowed fields to prevent SQL injection
  const ALLOWED_FIELDS = {
    name: 'name = ?',
    archived: 'archived = ?'
  };

  const updates = [];
  const params = [];

  // Only process whitelisted fields
  if (name !== undefined && ALLOWED_FIELDS.name) {
    updates.push(ALLOWED_FIELDS.name);
    params.push(name);
  }

  if (archived !== undefined && ALLOWED_FIELDS.archived) {
    updates.push(ALLOWED_FIELDS.archived);
    params.push(archived ? 1 : 0);
  }

  if (updates.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No valid fields to update'
    });
  }

  // Always update timestamp
  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(req.params.id);

  await database.run(
    `UPDATE sessions SET ${updates.join(', ')} WHERE id = ?`,
    params
  );

  const sessions = await database.all(
    'SELECT * FROM sessions WHERE id = ?',
    [req.params.id]
  );

  if (sessions.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Session not found'
    });
  }

  res.json({
    success: true,
    session: sessions[0]
  });
}));

// Delete session
router.delete('/:id', validateUUID('id'), asyncHandler(async (req, res) => {
  await database.run(
    'DELETE FROM sessions WHERE id = ?',
    [req.params.id]
  );

  res.json({ success: true });
}));

// Save message to session
router.post('/:id/messages', validateUUID('id'), asyncHandler(async (req, res) => {
  const { role, content, model, system_prompt_hash, timestamp } = req.body;

  // Validate message fields
  if (!role || !['user', 'assistant', 'system'].includes(role)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid role. Must be user, assistant, or system'
    });
  }

  if (!content || typeof content !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Content is required and must be a string'
    });
  }

  if (content.length > 100000) {
    return res.status(400).json({
      success: false,
      error: 'Content too long (max: 100KB)'
    });
  }

  const messageId = uuidv4();
  const messageTimestamp = timestamp || new Date().toISOString();

  await database.transaction(async () => {
    await database.run(
      `INSERT INTO messages (id, session_id, role, content, model, system_prompt_hash, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [messageId, req.params.id, role, content, model || null, system_prompt_hash || null, messageTimestamp]
    );

    await database.run(
      `UPDATE sessions
       SET message_count = message_count + 1,
           last_message_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [req.params.id]
    );
  });

  res.json({
    success: true,
    message: {
      id: messageId,
      session_id: req.params.id,
      role,
      content,
      timestamp: messageTimestamp
    }
  });
}));

// Get messages for session
router.get('/:id/messages', validateUUID('id'), asyncHandler(async (req, res) => {
  const { limit = '50', offset = '0' } = req.query;

  // Validate and sanitize query parameters
  const parsedLimit = Math.min(parseInt(limit) || 50, 100); // Max 100
  const parsedOffset = Math.max(parseInt(offset) || 0, 0);

  const messages = await database.all(
    `SELECT * FROM messages
     WHERE session_id = ?
     ORDER BY timestamp ASC
     LIMIT ? OFFSET ?`,
    [req.params.id, parsedLimit, parsedOffset]
  );

  const countResult = await database.all(
    'SELECT COUNT(*) as count FROM messages WHERE session_id = ?',
    [req.params.id]
  );

  const total = countResult[0]?.count || 0;

  res.json({
    success: true,
    messages,
    total,
    has_more: parsedOffset + messages.length < total
  });
}));

export default router;

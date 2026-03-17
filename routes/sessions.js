import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import database from '../services/database.js';
import { validate, validateUUID, sessionCreateSchema, sessionUpdateSchema, messagePinSchema, storyNotesSchema, worldStateSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { searchMessages } from '../services/memorySearch.js';
import { createWorldSnapshot, getWorldSnapshot, seedWorldState } from '../services/worldSnapshotService.js';
import { extractWorldState, extractSessionState, diffWorldState } from '../services/worldStateExtractor.js';

const router = express.Router();

// Create new session
router.post('/', validate(sessionCreateSchema), asyncHandler(async (req, res) => {
  const { name, character_name, character_mode, mode, settings_snapshot } = req.body;
  const sessionId = uuidv4();

  // Seed world state from snapshot (both modes, enabled by default)
  let initialWorldState = '{}';
  if (settings_snapshot?.general?.crossSessionMemory !== false) {
    try {
      const templateId = settings_snapshot?.meta?.templateId || 'default';
      const snapshot = await getWorldSnapshot(templateId, character_name || null);
      if (snapshot) {
        initialWorldState = JSON.stringify(seedWorldState(snapshot));
      }
    } catch (err) {
      console.error('World state seeding error:', err);
    }
  }

  // Insert session with validated data
  await database.run(
    `INSERT INTO sessions (id, name, character_name, character_mode, mode, settings_snapshot, world_state)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      sessionId,
      name,
      character_name || null,
      character_mode || 'single',
      mode,
      settings_snapshot ? JSON.stringify(settings_snapshot) : null,
      initialWorldState
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

  // Create world snapshot on archive (background, non-blocking)
  if (archived === true) {
    setImmediate(async () => {
      try {
        const session = await database.get(
          `SELECT world_state, world_state_history, settings_snapshot, mode FROM sessions WHERE id = ?`,
          [req.params.id]
        );
        const worldState = JSON.parse(session?.world_state || '{}');
        if (Object.keys(worldState).length > 0) {
          const worldStateHistory = JSON.parse(session.world_state_history || '[]');
          const settings = session.settings_snapshot ? JSON.parse(session.settings_snapshot) : {};
          await createWorldSnapshot(req.params.id, worldState, worldStateHistory, settings);
        }
      } catch (err) {
        console.error('World snapshot creation error:', err);
      }
    });
  }

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

// Pin/unpin a message
router.patch('/:sessionId/messages/:messageId/pin',
  validateUUID('sessionId'),
  validateUUID('messageId'),
  validate(messagePinSchema),
  asyncHandler(async (req, res) => {
    const { sessionId, messageId } = req.params;
    const { pinned } = req.body;

    const result = await database.run(
      `UPDATE messages SET pinned = ? WHERE id = ? AND session_id = ?`,
      [pinned ? 1 : 0, messageId, sessionId]
    );

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    res.json({ success: true, messageId, pinned });
  })
);

// Get story notes for session
router.get('/:id/notes', validateUUID('id'), asyncHandler(async (req, res) => {
  const session = await database.get(
    'SELECT story_notes FROM sessions WHERE id = ?',
    [req.params.id]
  );

  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }

  res.json({ success: true, notes: session.story_notes || '' });
}));

// Update story notes for session
router.put('/:id/notes', validateUUID('id'), validate(storyNotesSchema), asyncHandler(async (req, res) => {
  const { notes } = req.body;

  const result = await database.run(
    `UPDATE sessions SET story_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [notes, req.params.id]
  );

  if (result.changes === 0) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }

  res.json({ success: true, notes });
}));

// Get world state for session
router.get('/:id/world-state', validateUUID('id'), asyncHandler(async (req, res) => {
  const session = await database.get(
    'SELECT world_state, world_state_history FROM sessions WHERE id = ?',
    [req.params.id]
  );

  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }

  let worldState = {};
  try { worldState = JSON.parse(session.world_state || '{}'); } catch (e) { /* */ }
  let worldStateHistory = [];
  try { worldStateHistory = JSON.parse(session.world_state_history || '[]'); } catch (e) { /* */ }

  res.json({ success: true, worldState, worldStateHistory });
}));

// Update world state for session (manual override)
router.put('/:id/world-state', validateUUID('id'), validate(worldStateSchema), asyncHandler(async (req, res) => {
  const worldState = req.body;

  const result = await database.run(
    `UPDATE sessions SET world_state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [JSON.stringify(worldState), req.params.id]
  );

  if (result.changes === 0) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }

  res.json({ success: true, worldState });
}));

// Re-extract world/session state from all messages
router.post('/:id/reextract-state', validateUUID('id'), asyncHandler(async (req, res) => {
  const session = await database.get(
    'SELECT mode, settings_snapshot FROM sessions WHERE id = ?',
    [req.params.id]
  );

  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }

  const messages = await database.all(
    'SELECT role, content FROM messages WHERE session_id = ? ORDER BY timestamp ASC',
    [req.params.id]
  );

  let settings = {};
  try { settings = JSON.parse(session.settings_snapshot || '{}'); } catch (e) { /* */ }
  const mode = session.mode || settings.mode || 'normal';

  // Replay all message pairs through the extractor
  let state = {};
  const history = [];

  for (let i = 0; i < messages.length - 1; i += 2) {
    const userMsg = messages[i]?.role === 'user' ? messages[i].content : '';
    const assistantMsg = messages[i + 1]?.role === 'assistant' ? messages[i + 1]?.content : '';
    const turn = Math.floor(i / 2) + 1;

    const oldState = { ...state };
    state = mode === 'roleplay'
      ? extractWorldState(userMsg, assistantMsg, state, turn, settings)
      : extractSessionState(userMsg, assistantMsg, state, turn);

    const changes = diffWorldState(oldState, state, turn);
    if (state._resolvedEvents?.length > 0) {
      for (const event of state._resolvedEvents) {
        changes.push({ turn, field: mode === 'roleplay' ? 'ongoingEvents' : 'openQuestions', from: event.text, action: 'resolved' });
      }
    }
    delete state._resolvedEvents;
    history.push(...changes);
  }

  const cappedHistory = history.slice(-50);

  await database.run(
    'UPDATE sessions SET world_state = ?, world_state_history = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [JSON.stringify(state), JSON.stringify(cappedHistory), req.params.id]
  );

  res.json({ success: true, worldState: state, historyEntries: cappedHistory.length });
}));

// Search messages in session
router.get('/:id/search', validateUUID('id'), asyncHandler(async (req, res) => {
  const { q, limit = '5' } = req.query;

  if (!q || q.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'Query parameter "q" is required' });
  }

  const parsedLimit = Math.min(Math.max(parseInt(limit) || 5, 1), 20);
  const results = await searchMessages(req.params.id, q.trim(), { limit: parsedLimit });

  res.json({ success: true, results, total: results.length });
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

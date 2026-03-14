/**
 * Session API Client
 * Handles all session-related API calls
 */

import { apiFetch } from './apiClient';

export async function createSession(name, settings) {
  try {
    const response = await apiFetch('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ name, settings })
    });
    return await response.json();
  } catch (error) {
    console.error('Create session error:', error);
    return { success: false, error: error.message };
  }
}

export async function loadSessions(options = {}) {
  try {
    const { archived = false, limit = 50, offset = 0 } = options;
    const params = new URLSearchParams({
      archived: archived.toString(),
      limit: limit.toString(),
      offset: offset.toString()
    });
    const response = await apiFetch(`/api/sessions?${params}`);
    return await response.json();
  } catch (error) {
    console.error('Load sessions error:', error);
    return { success: false, error: error.message };
  }
}

export async function getSession(sessionId) {
  try {
    const response = await apiFetch(`/api/sessions/${sessionId}`);
    return await response.json();
  } catch (error) {
    console.error('Get session error:', error);
    return { success: false, error: error.message };
  }
}

export async function updateSession(sessionId, updates) {
  try {
    const response = await apiFetch(`/api/sessions/${sessionId}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
    return await response.json();
  } catch (error) {
    console.error('Update session error:', error);
    return { success: false, error: error.message };
  }
}

export async function deleteSession(sessionId) {
  try {
    const response = await apiFetch(`/api/sessions/${sessionId}`, {
      method: 'DELETE'
    });
    return await response.json();
  } catch (error) {
    console.error('Delete session error:', error);
    return { success: false, error: error.message };
  }
}

export async function saveMessage(sessionId, message) {
  try {
    const response = await apiFetch(`/api/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify(message)
    });
    return await response.json();
  } catch (error) {
    console.error('Save message error:', error);
    return { success: false, error: error.message };
  }
}

export async function getMessages(sessionId, options = {}) {
  try {
    const { limit = 50, offset = 0 } = options;
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString()
    });
    const response = await apiFetch(`/api/sessions/${sessionId}/messages?${params}`);
    return await response.json();
  } catch (error) {
    console.error('Get messages error:', error);
    return { success: false, error: error.message };
  }
}

export async function analyzeSession(sessionId, settings) {
  try {
    const response = await apiFetch(`/api/sessions/${sessionId}/analyze`, {
      method: 'POST',
      body: JSON.stringify({ settings })
    });
    return await response.json();
  } catch (error) {
    console.error('Analyze session error:', error);
    return { success: false, error: error.message };
  }
}

export async function applyUpdates(sessionId, updates) {
  try {
    const response = await apiFetch(`/api/sessions/${sessionId}/apply-updates`, {
      method: 'POST',
      body: JSON.stringify({ updates })
    });
    return await response.json();
  } catch (error) {
    console.error('Apply updates error:', error);
    return { success: false, error: error.message };
  }
}

export async function searchMemory(sessionId, query, topK = 5) {
  try {
    const response = await apiFetch('/api/memory/search', {
      method: 'POST',
      body: JSON.stringify({ sessionId, query, topK })
    });
    return await response.json();
  } catch (error) {
    console.error('Search memory error:', error);
    return { success: false, error: error.message };
  }
}

export async function getEmbeddingStatus(sessionId) {
  try {
    const response = await apiFetch(`/api/memory/status/${sessionId}`);
    return await response.json();
  } catch (error) {
    console.error('Get embedding status error:', error);
    return { success: false, error: error.message };
  }
}

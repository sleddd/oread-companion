import { apiFetch } from './apiClient';

// List all worlds/templates (defaults + user). The list endpoint returns only
// { id, name, isUserTemplate, category }; full settings load on demand via getTemplate().
export async function loadTemplates() {
  const response = await apiFetch('/api/templates');
  const data = await response.json();
  if (!data.success) throw new Error(data.error || 'Failed to load templates');
  return data.templates;
}

// Fetch a single world's full JSON (including `.settings`) by id.
// The list endpoint (GET /api/templates) returns only { id, name, isUserTemplate },
// so the full settings must be loaded on demand when a world is applied.
export async function getTemplate(templateId) {
  const response = await apiFetch(`/api/templates/${encodeURIComponent(templateId)}`);
  const data = await response.json();
  if (!data.success) throw new Error(data.error || 'Failed to load template');
  return data.template;
}

export async function saveUserTemplate(name, description, settings) {
  const response = await apiFetch('/api/templates/user', {
    method: 'POST',
    body: JSON.stringify({ name, description, settings })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function deleteUserTemplate(id) {
  const response = await apiFetch(`/api/templates/user/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${response.status}`);
  }
  return response.json();
}

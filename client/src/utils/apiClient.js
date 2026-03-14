/**
 * Central API client with CSRF token management.
 *
 * Usage: import { apiFetch } from './apiClient';
 *   apiFetch('/api/settings', { method: 'POST', body: JSON.stringify(data) })
 *
 * The CSRF token is fetched once on first use and cached for the session.
 */

let csrfToken = null;

async function fetchCsrfToken() {
  const res = await fetch('/api/csrf-token');
  const data = await res.json();
  if (!data.success) throw new Error('Failed to get CSRF token');
  return data.csrfToken;
}

async function getCsrfToken() {
  if (!csrfToken) {
    csrfToken = await fetchCsrfToken();
  }
  return csrfToken;
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

export async function apiFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = { 'Content-Type': 'application/json', ...options.headers };

  if (MUTATING_METHODS.has(method)) {
    headers['X-CSRF-Token'] = await getCsrfToken();
  }

  return fetch(url, { ...options, headers });
}

// Allow manually refreshing the token (e.g. after session expiry)
export function clearCsrfToken() {
  csrfToken = null;
}

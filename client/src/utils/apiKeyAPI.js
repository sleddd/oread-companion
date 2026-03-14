import { apiFetch } from './apiClient';

export async function getConfiguredProviders() {
  const response = await fetch('/api/keys');
  return response.json();
}

export async function saveApiKey(provider, apiKey) {
  const response = await apiFetch(`/api/keys/${provider}`, {
    method: 'PUT',
    body: JSON.stringify({ apiKey })
  });
  return response.json();
}

export async function deleteApiKey(provider) {
  const response = await apiFetch(`/api/keys/${provider}`, {
    method: 'DELETE'
  });
  return response.json();
}

export async function verifyApiKey(provider) {
  const response = await apiFetch(`/api/keys/${provider}/verify`, {
    method: 'POST'
  });
  return response.json();
}

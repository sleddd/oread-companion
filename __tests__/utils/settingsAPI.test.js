import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../client/src/utils/apiClient.js', () => ({
  apiFetch: vi.fn()
}));

import { loadSettings, saveSettings, deleteSettings } from '../../client/src/utils/settingsAPI.js';
import { apiFetch } from '../../client/src/utils/apiClient.js';

function mockResponse(body, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

beforeEach(() => vi.clearAllMocks());

// ─── loadSettings ────────────────────────────────────────────────────────────

describe('loadSettings', () => {
  it('returns success and settings on a valid response', async () => {
    const settings = { mode: 'normal', general: { selectedModel: 'llama3' } };
    apiFetch.mockResolvedValue(mockResponse({ settings }));

    const result = await loadSettings();
    expect(result.success).toBe(true);
    expect(result.settings).toEqual(settings);
    expect(apiFetch).toHaveBeenCalledWith('/api/templates/active');
  });

  it('returns success: false when API returns no settings', async () => {
    apiFetch.mockResolvedValue(mockResponse({ settings: null }));
    const result = await loadSettings();
    expect(result.success).toBe(false);
  });

  it('returns success: false when fetch throws', async () => {
    apiFetch.mockRejectedValue(new Error('Network error'));
    const result = await loadSettings();
    expect(result.success).toBe(false);
  });
});

// ─── saveSettings ────────────────────────────────────────────────────────────

describe('saveSettings', () => {
  it('calls PUT with the settings body and returns success', async () => {
    const settings = { mode: 'roleplay' };
    apiFetch.mockResolvedValue(mockResponse({ settings }));

    const result = await saveSettings(settings);
    expect(result.success).toBe(true);
    expect(apiFetch).toHaveBeenCalledWith('/api/templates/active', {
      method: 'PUT',
      body: JSON.stringify({ settings })
    });
  });

  it('returns success: false when API responds with non-ok status', async () => {
    apiFetch.mockResolvedValue(mockResponse({}, false));
    const result = await saveSettings({});
    expect(result.success).toBe(false);
  });

  it('returns success: false when fetch throws', async () => {
    apiFetch.mockRejectedValue(new Error('Network error'));
    const result = await saveSettings({});
    expect(result.success).toBe(false);
  });
});

// ─── deleteSettings ──────────────────────────────────────────────────────────

describe('deleteSettings', () => {
  it('calls DELETE and returns reset settings', async () => {
    const settings = { mode: 'normal' };
    apiFetch.mockResolvedValue(mockResponse({ settings }));

    const result = await deleteSettings();
    expect(result.success).toBe(true);
    expect(result.settings).toEqual(settings);
    expect(apiFetch).toHaveBeenCalledWith('/api/templates/active', { method: 'DELETE' });
  });

  it('returns success: false when fetch throws', async () => {
    apiFetch.mockRejectedValue(new Error('Network error'));
    const result = await deleteSettings();
    expect(result.success).toBe(false);
  });
});

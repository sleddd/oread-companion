import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadTemplates, getTemplateById, getTemplatesByCategory, getRoleplayTemplates, getUtilityTemplates } from '../../client/src/data/templates.js';

const MOCK_TEMPLATES = [
  { id: 'elara', name: 'Elara', category: 'roleplay' },
  { id: 'expert-tutor', name: 'Expert Tutor', category: 'utility' },
  { id: 'nova', name: 'Nova', category: 'roleplay' }
];

function mockFetch(body, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    json: async () => body
  });
}

beforeEach(() => vi.restoreAllMocks());

// ─── loadTemplates ───────────────────────────────────────────────────────────

describe('loadTemplates', () => {
  it('fetches from /api/templates and returns templates array', async () => {
    vi.stubGlobal('fetch', mockFetch({ success: true, templates: MOCK_TEMPLATES }));

    const templates = await loadTemplates();
    expect(templates).toEqual(MOCK_TEMPLATES);
    expect(fetch).toHaveBeenCalledWith('/api/templates');
  });

  it('throws when API returns success: false', async () => {
    vi.stubGlobal('fetch', mockFetch({ success: false, error: 'Not found' }));
    await expect(loadTemplates()).rejects.toThrow('Not found');
  });

  it('throws with fallback message when error field is missing', async () => {
    vi.stubGlobal('fetch', mockFetch({ success: false }));
    await expect(loadTemplates()).rejects.toThrow('Failed to load templates');
  });
});

// ─── getTemplateById ─────────────────────────────────────────────────────────

describe('getTemplateById', () => {
  it('returns the matching template', () => {
    const result = getTemplateById(MOCK_TEMPLATES, 'expert-tutor');
    expect(result).toEqual({ id: 'expert-tutor', name: 'Expert Tutor', category: 'utility' });
  });

  it('returns null when id does not match', () => {
    expect(getTemplateById(MOCK_TEMPLATES, 'nonexistent')).toBeNull();
  });
});

// ─── getTemplatesByCategory ──────────────────────────────────────────────────

describe('getTemplatesByCategory', () => {
  it('returns only roleplay templates', () => {
    const result = getTemplatesByCategory(MOCK_TEMPLATES, 'roleplay');
    expect(result).toHaveLength(2);
    expect(result.every(t => t.category === 'roleplay')).toBe(true);
  });

  it('returns only utility templates', () => {
    const result = getTemplatesByCategory(MOCK_TEMPLATES, 'utility');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('expert-tutor');
  });

  it('returns empty array for unknown category', () => {
    expect(getTemplatesByCategory(MOCK_TEMPLATES, 'unknown')).toEqual([]);
  });
});

// ─── getRoleplayTemplates / getUtilityTemplates ───────────────────────────────

describe('getRoleplayTemplates', () => {
  it('returns all roleplay templates', () => {
    expect(getRoleplayTemplates(MOCK_TEMPLATES)).toHaveLength(2);
  });
});

describe('getUtilityTemplates', () => {
  it('returns all utility templates', () => {
    expect(getUtilityTemplates(MOCK_TEMPLATES)).toHaveLength(1);
  });
});

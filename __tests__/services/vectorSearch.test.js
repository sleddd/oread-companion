import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database singleton before importing vectorSearch
vi.mock('../../services/database.js', () => ({
  default: {
    all: vi.fn(),
    get: vi.fn(),
    run: vi.fn(),
  },
}));

import vectorSearch from '../../services/vectorSearch.js';
import database from '../../services/database.js';

// ─── cosineSimilarity ────────────────────────────────────────────────────────

describe('cosineSimilarity', () => {
  it('returns 1 for identical non-zero vectors', () => {
    const v = [1, 2, 3];
    expect(vectorSearch.cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(vectorSearch.cosineSimilarity(a, b)).toBeCloseTo(0);
  });

  it('returns -1 for anti-parallel vectors', () => {
    const a = [1, 0];
    const b = [-1, 0];
    expect(vectorSearch.cosineSimilarity(a, b)).toBeCloseTo(-1);
  });

  it('returns 0 for a zero vector — never NaN', () => {
    const zero = [0, 0, 0];
    const nonZero = [1, 2, 3];
    const result = vectorSearch.cosineSimilarity(zero, nonZero);
    expect(result).toBe(0);
    expect(Number.isNaN(result)).toBe(false);
  });

  it('returns 0 when both vectors are zero — never NaN', () => {
    const result = vectorSearch.cosineSimilarity([0, 0], [0, 0]);
    expect(result).toBe(0);
    expect(Number.isNaN(result)).toBe(false);
  });

  it('is symmetric', () => {
    const a = [1, 2, 3, 4];
    const b = [5, 6, 7, 8];
    expect(vectorSearch.cosineSimilarity(a, b)).toBeCloseTo(
      vectorSearch.cosineSimilarity(b, a)
    );
  });
});

// ─── float32ArrayToBlob / blobToFloat32Array roundtrip ───────────────────────

describe('BLOB ↔ Float32Array conversion', () => {
  it('roundtrips without precision loss', () => {
    const original = [0.1, -0.5, 1.0, 3.14, 0.0];
    const blob = vectorSearch.float32ArrayToBlob(original);
    const recovered = vectorSearch.blobToFloat32Array(blob, original.length);

    for (let i = 0; i < original.length; i++) {
      expect(recovered[i]).toBeCloseTo(original[i], 5);
    }
  });

  it('blob byte length equals dimension × 4', () => {
    const arr = [1, 2, 3, 4, 5];
    const blob = vectorSearch.float32ArrayToBlob(arr);
    expect(blob.byteLength).toBe(arr.length * 4);
  });

  it('blobToFloat32Array throws when blob size mismatches declared dimension', () => {
    const arr = [1, 2, 3];
    const blob = vectorSearch.float32ArrayToBlob(arr); // 12 bytes
    expect(() => vectorSearch.blobToFloat32Array(blob, 5)).toThrow(/Invalid vector size/);
  });
});

// ─── calculateChecksum ───────────────────────────────────────────────────────

describe('calculateChecksum', () => {
  it('returns the same hash for the same vector', () => {
    const v = [0.1, 0.2, 0.3];
    expect(vectorSearch.calculateChecksum(v)).toBe(vectorSearch.calculateChecksum(v));
  });

  it('returns different hashes for different vectors', () => {
    expect(vectorSearch.calculateChecksum([1, 0, 0])).not.toBe(
      vectorSearch.calculateChecksum([0, 1, 0])
    );
  });

  it('returns a 16-character hex string', () => {
    const cs = vectorSearch.calculateChecksum([1, 2, 3]);
    expect(cs).toHaveLength(16);
    expect(cs).toMatch(/^[0-9a-f]+$/);
  });
});

// ─── search (with mocked database) ──────────────────────────────────────────

describe('search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty array when no vectors exist in the database', async () => {
    database.all.mockResolvedValueOnce([]);
    const results = await vectorSearch.search('session-1', [0.1, 0.2], 5);
    expect(results).toEqual([]);
  });

  it('returns results sorted by descending similarity score', async () => {
    // Two messages: one similar, one less similar to the query
    const query = [1, 0];
    const similarVec = vectorSearch.float32ArrayToBlob([0.99, 0.14]);
    const differentVec = vectorSearch.float32ArrayToBlob([0, 1]);

    database.all.mockResolvedValueOnce([
      { id: 'vec1', message_id: 'msg1', vector: differentVec, dimension: 2, timestamp: '2024-01-01' },
      { id: 'vec2', message_id: 'msg2', vector: similarVec, dimension: 2, timestamp: '2024-01-02' },
    ]);

    const results = await vectorSearch.search('session-1', query, 5);
    expect(results[0].messageId).toBe('msg2'); // most similar first
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('respects the topK limit', async () => {
    const vecs = Array.from({ length: 10 }, (_, i) => ({
      id: `v${i}`,
      message_id: `m${i}`,
      vector: vectorSearch.float32ArrayToBlob([i, 0]),
      dimension: 2,
      timestamp: `2024-01-0${i + 1}`,
    }));
    database.all.mockResolvedValueOnce(vecs);

    const results = await vectorSearch.search('session-1', [1, 0], 3);
    expect(results).toHaveLength(3);
  });
});

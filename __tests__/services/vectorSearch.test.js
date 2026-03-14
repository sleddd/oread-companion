import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@langchain/community/vectorstores/faiss', () => {
  const mockStore = {
    similaritySearchVectorWithScore: vi.fn(),
    addDocuments: vi.fn(),
    save: vi.fn(),
    index: { ntotal: 3 }
  };
  return {
    FaissStore: {
      load: vi.fn().mockResolvedValue(mockStore),
      fromDocuments: vi.fn().mockResolvedValue(mockStore),
      _mockStore: mockStore
    }
  };
});

vi.mock('@langchain/ollama', () => ({
  OllamaEmbeddings: vi.fn()
}));

vi.mock('@langchain/core/documents', () => ({
  Document: vi.fn()
}));

vi.mock('fs/promises', () => ({
  default: {
    access: vi.fn(),
    mkdir: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('../../config/index.js', () => ({
  CONFIG: { OLLAMA_URL: 'http://localhost:11434', OLLAMA_EMBED_MODEL: 'nomic-embed-text' }
}));

import { FaissStore } from '@langchain/community/vectorstores/faiss';
import fs from 'fs/promises';
import vectorSearch from '../../services/vectorSearch.js';

const mockStore = FaissStore._mockStore;

beforeEach(() => {
  vi.clearAllMocks();
  mockStore.similaritySearchVectorWithScore.mockResolvedValue([]);
  mockStore.addDocuments.mockResolvedValue(undefined);
  mockStore.save.mockResolvedValue(undefined);
  FaissStore.load.mockResolvedValue(mockStore);
  FaissStore.fromDocuments.mockResolvedValue(mockStore);
});

// ─── search ──────────────────────────────────────────────────────────────────

describe('search', () => {
  it('returns [] when no FAISS index exists', async () => {
    fs.access.mockRejectedValue(new Error('ENOENT'));
    const results = await vectorSearch.search('session-1', [0.1, 0.2], 5);
    expect(results).toEqual([]);
  });

  it('returns results mapped from FAISS when index exists', async () => {
    fs.access.mockResolvedValue(undefined);
    mockStore.similaritySearchVectorWithScore.mockResolvedValue([
      [{ pageContent: 'hello', metadata: { messageId: 'msg1', role: 'user', timestamp: '2024-01-01' } }, 0],
      [{ pageContent: 'world', metadata: { messageId: 'msg2', role: 'assistant', timestamp: '2024-01-02' } }, 1]
    ]);

    const results = await vectorSearch.search('session-1', [0.1, 0.2], 5);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ messageId: 'msg1', content: 'hello', role: 'user', score: 1 });
    expect(results[1].score).toBeCloseTo(0.5); // 1 / (1 + 1)
  });

  it('passes topK to FAISS', async () => {
    fs.access.mockResolvedValue(undefined);
    await vectorSearch.search('session-1', [0.1], 3);
    expect(mockStore.similaritySearchVectorWithScore).toHaveBeenCalledWith([0.1], 3);
  });
});

// ─── addDocuments ─────────────────────────────────────────────────────────────

describe('addDocuments', () => {
  it('does nothing for empty message list', async () => {
    await vectorSearch.addDocuments('session-1', []);
    expect(FaissStore.fromDocuments).not.toHaveBeenCalled();
    expect(FaissStore.load).not.toHaveBeenCalled();
  });

  it('creates a new FAISS store when no index exists', async () => {
    fs.access.mockRejectedValue(new Error('ENOENT'));
    const messages = [{ id: 'msg1', content: 'hello', role: 'user', timestamp: '2024-01-01' }];

    await vectorSearch.addDocuments('session-1', messages);

    expect(FaissStore.fromDocuments).toHaveBeenCalledOnce();
    expect(mockStore.save).toHaveBeenCalledOnce();
  });

  it('adds to existing FAISS store when index exists', async () => {
    fs.access.mockResolvedValue(undefined);
    const messages = [{ id: 'msg1', content: 'hello', role: 'user', timestamp: '2024-01-01' }];

    await vectorSearch.addDocuments('session-1', messages);

    expect(FaissStore.load).toHaveBeenCalledOnce();
    expect(mockStore.addDocuments).toHaveBeenCalledOnce();
    expect(mockStore.save).toHaveBeenCalledOnce();
    expect(FaissStore.fromDocuments).not.toHaveBeenCalled();
  });
});

// ─── getDocumentCount ─────────────────────────────────────────────────────────

describe('getDocumentCount', () => {
  it('returns 0 when no index exists', async () => {
    fs.access.mockRejectedValue(new Error('ENOENT'));
    expect(await vectorSearch.getDocumentCount('session-1')).toBe(0);
  });

  it('returns ntotal from the FAISS index', async () => {
    fs.access.mockResolvedValue(undefined);
    mockStore.index.ntotal = 7;
    expect(await vectorSearch.getDocumentCount('session-1')).toBe(7);
  });
});

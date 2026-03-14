import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@langchain/ollama', () => ({
  ChatOllama: vi.fn(),
  OllamaEmbeddings: vi.fn().mockImplementation(function () {
    this.embedQuery = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
  }),
}));

vi.mock('../../services/vectorSearch.js', () => ({
  default: {
    search: vi.fn().mockResolvedValue([]),
    addDocuments: vi.fn().mockResolvedValue(undefined),
    getDocumentCount: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock('../../services/database.js', () => ({
  default: {
    all: vi.fn().mockResolvedValue([]),
    run: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../config/index.js', () => ({
  CONFIG: {
    OLLAMA_URL: 'http://localhost:11434',
    OLLAMA_CHAT_MODEL: 'llama2',
    OLLAMA_EMBED_MODEL: 'nomic-embed-text',
  },
}));

import embeddingService from '../../services/embeddingService.js';
import vectorSearch from '../../services/vectorSearch.js';
import database from '../../services/database.js';

const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';

beforeEach(() => vi.clearAllMocks());

// ── queryWithRAG ──────────────────────────────────────────────────────────────

describe('queryWithRAG', () => {
  const settings = { general: { temperature: 0.8 } };

  it('returns context, recentMessageCount, vectorResultCount', async () => {
    database.all.mockResolvedValueOnce([
      { role: 'user', content: 'hello', timestamp: '2024-01-01' },
    ]);

    const result = await embeddingService.queryWithRAG(SESSION_ID, 'hi', settings);

    expect(result).toMatchObject({
      recentMessageCount: 1,
      vectorResultCount: 0,
    });
    expect(result.context).toContain('--- Recent Conversation ---');
    expect(result.context).toContain('user: hello');
  });

  it('embeds the user message to build the query vector', async () => {
    await embeddingService.queryWithRAG(SESSION_ID, 'test query', settings);
    expect(embeddingService.embeddings.embedQuery).toHaveBeenCalledWith('test query');
  });

  it('passes the query vector to vectorSearch.search', async () => {
    await embeddingService.queryWithRAG(SESSION_ID, 'search me', settings);
    expect(vectorSearch.search).toHaveBeenCalledWith(SESSION_ID, [0.1, 0.2, 0.3], 5);
  });

  it('includes vector results in context when found', async () => {
    vectorSearch.search.mockResolvedValueOnce([
      { content: 'old event', role: 'user', timestamp: '2023-12-01', score: 0.9 },
    ]);

    const result = await embeddingService.queryWithRAG(SESSION_ID, 'what happened?', settings);

    expect(result.vectorResultCount).toBe(1);
    expect(result.context).toContain('--- Relevant Past Context ---');
    expect(result.context).toContain('[1] old event');
  });

  it('continues without vector results when vectorSearch throws', async () => {
    vectorSearch.search.mockRejectedValueOnce(new Error('index missing'));

    const result = await embeddingService.queryWithRAG(SESSION_ID, 'hi', settings);

    expect(result.vectorResultCount).toBe(0);
    expect(result.context).toContain('--- Recent Conversation ---');
  });

  it('reverses recent messages to chronological order', async () => {
    database.all.mockResolvedValueOnce([
      { role: 'assistant', content: 'second', timestamp: '2024-01-02' },
      { role: 'user', content: 'first', timestamp: '2024-01-01' },
    ]);

    const result = await embeddingService.queryWithRAG(SESSION_ID, 'hi', settings);
    const lines = result.context.split('\n');
    const firstIdx = lines.findIndex(l => l.includes('first'));
    const secondIdx = lines.findIndex(l => l.includes('second'));
    expect(firstIdx).toBeLessThan(secondIdx);
  });

  it('throws when the database call fails', async () => {
    database.all.mockRejectedValueOnce(new Error('db down'));
    await expect(embeddingService.queryWithRAG(SESSION_ID, 'hi', settings)).rejects.toThrow('db down');
  });
});

// ── buildContext ──────────────────────────────────────────────────────────────

describe('buildContext', () => {
  it('produces only the recent section when no vector results', () => {
    const ctx = embeddingService.buildContext(
      [{ role: 'user', content: 'hello' }],
      [],
      {}
    );
    expect(ctx).not.toContain('Relevant Past Context');
    expect(ctx).toContain('--- Recent Conversation ---');
    expect(ctx).toContain('user: hello');
  });

  it('prepends relevant past context when vector results are present', () => {
    const ctx = embeddingService.buildContext(
      [{ role: 'user', content: 'recent' }],
      [{ text: 'old memory', score: 0.9 }],
      {}
    );
    const pastIdx = ctx.indexOf('Relevant Past Context');
    const recentIdx = ctx.indexOf('Recent Conversation');
    expect(pastIdx).toBeLessThan(recentIdx);
    expect(ctx).toContain('[1] old memory');
  });

  it('numbers multiple vector results correctly', () => {
    const ctx = embeddingService.buildContext(
      [],
      [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      {}
    );
    expect(ctx).toContain('[1] a');
    expect(ctx).toContain('[2] b');
    expect(ctx).toContain('[3] c');
  });
});

// ── addDocuments ──────────────────────────────────────────────────────────────

describe('addDocuments', () => {
  it('returns { embedded: 0 } when all messages are filtered out', async () => {
    const result = await embeddingService.addDocuments(SESSION_ID, [
      { id: 'm1', role: 'system', content: 'you are an assistant' },
      { id: 'm2', role: 'user', content: 'short' },
    ]);

    expect(result).toEqual({ success: true, embedded: 0 });
    expect(vectorSearch.addDocuments).not.toHaveBeenCalled();
  });

  it('filters out system messages and messages ≤ 20 chars', async () => {
    await embeddingService.addDocuments(SESSION_ID, [
      { id: 'm1', role: 'system', content: 'a long enough system message here' },
      { id: 'm2', role: 'user', content: 'this is a long enough user message' },
    ]);

    const docs = vectorSearch.addDocuments.mock.calls[0][1];
    expect(docs).toHaveLength(1);
    expect(docs[0].id).toBe('m2');
  });

  it('calls vectorSearch.addDocuments with the filtered messages', async () => {
    const messages = [
      { id: 'm1', role: 'user', content: 'this is a sufficiently long message' },
      { id: 'm2', role: 'assistant', content: 'and so is this assistant reply' },
    ];
    await embeddingService.addDocuments(SESSION_ID, messages);

    expect(vectorSearch.addDocuments).toHaveBeenCalledWith(SESSION_ID, messages);
  });

  it('marks each embedded message in the database', async () => {
    await embeddingService.addDocuments(SESSION_ID, [
      { id: 'msg-a', role: 'user', content: 'message long enough to embed here' },
      { id: 'msg-b', role: 'assistant', content: 'another long enough assistant message' },
    ]);

    expect(database.run).toHaveBeenCalledWith(
      'UPDATE messages SET embedded = 1 WHERE id = ?',
      ['msg-a']
    );
    expect(database.run).toHaveBeenCalledWith(
      'UPDATE messages SET embedded = 1 WHERE id = ?',
      ['msg-b']
    );
  });

  it('returns the count of embedded messages', async () => {
    const result = await embeddingService.addDocuments(SESSION_ID, [
      { id: 'm1', role: 'user', content: 'this message is long enough to embed' },
    ]);
    expect(result).toEqual({ success: true, embedded: 1 });
  });

  it('throws when vectorSearch.addDocuments fails', async () => {
    vectorSearch.addDocuments.mockRejectedValueOnce(new Error('faiss error'));
    await expect(
      embeddingService.addDocuments(SESSION_ID, [
        { id: 'm1', role: 'user', content: 'this message is long enough to embed' },
      ])
    ).rejects.toThrow('faiss error');
  });
});

// ── searchVectors ─────────────────────────────────────────────────────────────

describe('searchVectors', () => {
  it('delegates to vectorSearch.search with the given vector and topK', async () => {
    vectorSearch.search.mockResolvedValueOnce([
      { messageId: 'msg1', content: 'result', score: 0.95 },
    ]);

    const result = await embeddingService.searchVectors(SESSION_ID, [0.1, 0.2], 3);

    expect(vectorSearch.search).toHaveBeenCalledWith(SESSION_ID, [0.1, 0.2], 3);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].messageId).toBe('msg1');
  });

  it('defaults topK to 5', async () => {
    await embeddingService.searchVectors(SESSION_ID, [0.1]);
    expect(vectorSearch.search).toHaveBeenCalledWith(SESSION_ID, [0.1], 5);
  });

  it('returns an empty results array when no vectors match', async () => {
    vectorSearch.search.mockResolvedValueOnce([]);
    const result = await embeddingService.searchVectors(SESSION_ID, [0.1, 0.2]);
    expect(result).toEqual({ results: [] });
  });
});

// ── getIndexStats ─────────────────────────────────────────────────────────────

describe('getIndexStats', () => {
  it('returns success with document_count from vectorSearch', async () => {
    vectorSearch.getDocumentCount.mockResolvedValueOnce(42);

    const result = await embeddingService.getIndexStats(SESSION_ID);

    expect(result).toEqual({ success: true, session_id: SESSION_ID, document_count: 42 });
  });

  it('returns success: false and document_count: 0 when vectorSearch throws', async () => {
    vectorSearch.getDocumentCount.mockRejectedValueOnce(new Error('index corrupt'));

    const result = await embeddingService.getIndexStats(SESSION_ID);

    expect(result.success).toBe(false);
    expect(result.document_count).toBe(0);
    expect(result.error).toBe('index corrupt');
  });
});

// ── shouldUseRAG ──────────────────────────────────────────────────────────────

describe('shouldUseRAG', () => {
  it('returns false when memory setting is disabled', async () => {
    const result = await embeddingService.shouldUseRAG(SESSION_ID, { general: { memory: false } });
    expect(result).toBe(false);
    expect(database.all).not.toHaveBeenCalled();
  });

  it('returns false when memory setting is absent', async () => {
    const result = await embeddingService.shouldUseRAG(SESSION_ID, {});
    expect(result).toBe(false);
  });

  it('returns false when message count is ≤ 50', async () => {
    database.all.mockResolvedValueOnce([{ count: 50 }]);
    const result = await embeddingService.shouldUseRAG(SESSION_ID, { general: { memory: true } });
    expect(result).toBe(false);
  });

  it('returns true when message count exceeds 50', async () => {
    database.all.mockResolvedValueOnce([{ count: 51 }]);
    const result = await embeddingService.shouldUseRAG(SESSION_ID, { general: { memory: true } });
    expect(result).toBe(true);
  });

  it('treats a missing count as 0 (returns false)', async () => {
    database.all.mockResolvedValueOnce([{}]);
    const result = await embeddingService.shouldUseRAG(SESSION_ID, { general: { memory: true } });
    expect(result).toBe(false);
  });
});

// ── getRecentMessages ─────────────────────────────────────────────────────────

describe('getRecentMessages', () => {
  it('returns messages in chronological order (reversed from DB)', async () => {
    database.all.mockResolvedValueOnce([
      { role: 'assistant', content: 'later' },
      { role: 'user', content: 'earlier' },
    ]);

    const messages = await embeddingService.getRecentMessages(SESSION_ID);

    expect(messages[0].content).toBe('earlier');
    expect(messages[1].content).toBe('later');
  });

  it('queries with the default limit of 20', async () => {
    database.all.mockResolvedValueOnce([]);
    await embeddingService.getRecentMessages(SESSION_ID);
    expect(database.all).toHaveBeenCalledWith(expect.any(String), [SESSION_ID, 20]);
  });

  it('respects a custom limit', async () => {
    database.all.mockResolvedValueOnce([]);
    await embeddingService.getRecentMessages(SESSION_ID, 5);
    expect(database.all).toHaveBeenCalledWith(expect.any(String), [SESSION_ID, 5]);
  });

  it('returns an empty array when there are no messages', async () => {
    database.all.mockResolvedValueOnce([]);
    const messages = await embeddingService.getRecentMessages(SESSION_ID);
    expect(messages).toEqual([]);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../services/embeddingService.js', () => ({
  default: {
    addDocuments: vi.fn().mockResolvedValue({ embedded: 2 }),
    embeddings: { embedQuery: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]) },
    searchVectors: vi.fn().mockResolvedValue({ results: [] }),
    getIndexStats: vi.fn().mockResolvedValue({ total: 0, embedded: 0 }),
  },
}));

import memoryRouter from '../../routes/memory.js';
import embeddingService from '../../services/embeddingService.js';
import { errorHandler } from '../../middleware/errorHandler.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/', memoryRouter);
  app.use(errorHandler);
  return app;
}

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('POST /embed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 and starts embedding for a valid request', async () => {
    const res = await request(createApp())
      .post('/embed')
      .send({ sessionId: VALID_UUID, messages: [{ role: 'user', content: 'hi' }] })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(1);
  });

  it('returns 400 when sessionId is missing', async () => {
    const res = await request(createApp())
      .post('/embed')
      .send({ messages: [{ role: 'user', content: 'hi' }] })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.details.some(d => d.field === 'sessionId')).toBe(true);
  });

  it('returns 400 when messages is not an array', async () => {
    const res = await request(createApp())
      .post('/embed')
      .send({ sessionId: VALID_UUID, messages: 'not-an-array' })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.details).toBeDefined();
  });

  it('returns 400 when messages array is empty', async () => {
    const res = await request(createApp())
      .post('/embed')
      .send({ sessionId: VALID_UUID, messages: [] })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.details.some(d => d.field === 'messages')).toBe(true);
  });

  it('returns 400 for an invalid (non-UUID) sessionId', async () => {
    const res = await request(createApp())
      .post('/embed')
      .send({ sessionId: 'bad-id', messages: [{ role: 'user', content: 'hi' }] })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.details.some(d => d.field === 'sessionId')).toBe(true);
  });

  it('fires addDocuments in the background and responds immediately', async () => {
    await request(createApp())
      .post('/embed')
      .send({ sessionId: VALID_UUID, messages: [{ role: 'user', content: 'test' }] })
      .expect(200);

    await new Promise(r => setImmediate(r));
    expect(embeddingService.addDocuments).toHaveBeenCalledWith(VALID_UUID, expect.any(Array));
  });
});

describe('POST /search', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with results for a valid query', async () => {
    embeddingService.searchVectors.mockResolvedValueOnce({
      results: [{ messageId: 'msg1', score: 0.9 }],
    });

    const res = await request(createApp())
      .post('/search')
      .send({ sessionId: VALID_UUID, query: 'what happened yesterday?' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.results).toHaveLength(1);
  });

  it('applies the default topK of 5 when not provided', async () => {
    await request(createApp())
      .post('/search')
      .send({ sessionId: VALID_UUID, query: 'hello' })
      .expect(200);

    expect(embeddingService.searchVectors).toHaveBeenCalledWith(VALID_UUID, expect.any(Array), 5);
  });

  it('returns 400 when query is missing', async () => {
    const res = await request(createApp())
      .post('/search')
      .send({ sessionId: VALID_UUID })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.details.some(d => d.field === 'query')).toBe(true);
  });

  it('returns 400 for an invalid sessionId', async () => {
    const res = await request(createApp())
      .post('/search')
      .send({ sessionId: 'not-uuid', query: 'hello' })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.details.some(d => d.field === 'sessionId')).toBe(true);
  });

  it('returns 400 when sessionId is missing', async () => {
    const res = await request(createApp())
      .post('/search')
      .send({ query: 'hello' })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.details.some(d => d.field === 'sessionId')).toBe(true);
  });
});

describe('GET /status/:sessionId', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with stats for a valid UUID', async () => {
    embeddingService.getIndexStats.mockResolvedValueOnce({ total: 10, embedded: 8 });

    const res = await request(createApp())
      .get(`/status/${VALID_UUID}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.sessionId).toBe(VALID_UUID);
  });

  it('returns 400 for an invalid UUID in the path', async () => {
    await request(createApp()).get('/status/not-a-uuid').expect(400);
  });
});

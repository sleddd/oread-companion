import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Use the REAL controller so we exercise the actual filesystem read path —
// this is the code path that causes "templates don't always load" if it throws.
import templatesRouter from '../../routes/templates.js';
import { errorHandler } from '../../middleware/errorHandler.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/', templatesRouter);
  app.use(errorHandler);
  return app;
}

describe('GET / (getAllDefaultTemplates)', () => {
  it('returns 200 with a non-empty templates array', async () => {
    const res = await request(createApp()).get('/').expect(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.templates)).toBe(true);
    expect(res.body.templates.length).toBeGreaterThan(0);
  });

  it('every template has id, name, category, and settings', async () => {
    const res = await request(createApp()).get('/').expect(200);
    for (const t of res.body.templates) {
      expect(t.id, `template missing id`).toBeTruthy();
      expect(t.name, `${t.id} missing name`).toBeTruthy();
      expect(t.category, `${t.id} missing category`).toMatch(/^(roleplay|utility)$/);
      expect(t.settings, `${t.id} missing settings`).toBeTruthy();
    }
  });

  it('returns both roleplay and utility templates', async () => {
    const res = await request(createApp()).get('/').expect(200);
    const categories = new Set(res.body.templates.map(t => t.category));
    expect(categories.has('roleplay')).toBe(true);
    expect(categories.has('utility')).toBe(true);
  });
});

describe('GET /:id (getDefaultTemplate)', () => {
  it('returns 200 and the matching template for a known id', async () => {
    const res = await request(createApp()).get('/expert-tutor').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.template.id).toBe('expert-tutor');
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(createApp()).get('/nonexistent-template').expect(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for an id with special characters', async () => {
    const res = await request(createApp()).get('/evil%21id').expect(400);
    expect(res.body.success).toBe(false);
  });
});

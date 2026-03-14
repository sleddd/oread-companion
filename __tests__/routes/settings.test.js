import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../controllers/templateController.js', () => ({
  getAllDefaultTemplates: vi.fn((req, res) =>
    res.json({ success: true, templates: [] })
  ),
  getDefaultTemplate: vi.fn((req, res) =>
    res.json({ success: true, template: { id: req.params.id } })
  ),
  getActiveTemplate: vi.fn((req, res) =>
    res.json({ success: true, settings: { mode: 'normal' } })
  ),
  saveActiveTemplate: vi.fn((req, res) =>
    res.json({ success: true, settings: req.body.settings })
  ),
  deleteActiveTemplate: vi.fn((req, res) =>
    res.json({ success: true, settings: {} })
  ),
}));

import templatesRouter from '../../routes/templates.js';
import * as controller from '../../controllers/templateController.js';
import { errorHandler } from '../../middleware/errorHandler.js';

function createApp() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));
  app.use('/', templatesRouter);
  app.use(errorHandler);
  return app;
}

describe('GET /active', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 and calls getActiveTemplate', async () => {
    const res = await request(createApp()).get('/active').expect(200);
    expect(res.body.success).toBe(true);
    expect(controller.getActiveTemplate).toHaveBeenCalledOnce();
  });
});

describe('PUT /active (with Joi validation)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 and calls saveActiveTemplate for a valid payload', async () => {
    const res = await request(createApp())
      .put('/active')
      .send({ settings: { mode: 'normal', general: { memory: false } } })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(controller.saveActiveTemplate).toHaveBeenCalledOnce();
  });

  it('returns 400 when the settings field is missing', async () => {
    const res = await request(createApp()).put('/active').send({}).expect(400);
    expect(res.body.success).toBe(false);
    expect(controller.saveActiveTemplate).not.toHaveBeenCalled();
  });

  it('returns 400 when mode is an unrecognised value', async () => {
    const res = await request(createApp())
      .put('/active')
      .send({ settings: { mode: 'wizard' } })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(controller.saveActiveTemplate).not.toHaveBeenCalled();
  });

  it('returns 400 when temperature is out of range', async () => {
    const res = await request(createApp())
      .put('/active')
      .send({ settings: { general: { temperature: 999 } } })
      .expect(400);

    expect(res.body.success).toBe(false);
  });

  it('strips unknown top-level fields before reaching the controller', async () => {
    await request(createApp())
      .put('/active')
      .send({ settings: { mode: 'normal' }, injected: 'evil' })
      .expect(200);

    const callArg = controller.saveActiveTemplate.mock.calls[0][0].body;
    expect(callArg.injected).toBeUndefined();
  });
});

describe('DELETE /active', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 and calls deleteActiveTemplate', async () => {
    const res = await request(createApp()).delete('/active').expect(200);
    expect(res.body.success).toBe(true);
    expect(controller.deleteActiveTemplate).toHaveBeenCalledOnce();
  });
});

describe('GET /', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 and calls getAllDefaultTemplates', async () => {
    const res = await request(createApp()).get('/').expect(200);
    expect(res.body.success).toBe(true);
    expect(controller.getAllDefaultTemplates).toHaveBeenCalledOnce();
  });
});

describe('GET /:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 and calls getDefaultTemplate with the id', async () => {
    const res = await request(createApp()).get('/fantasy-tavern').expect(200);
    expect(res.body.success).toBe(true);
    expect(controller.getDefaultTemplate).toHaveBeenCalledOnce();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../controllers/settingsController.js', () => ({
  getSettings: vi.fn((req, res) =>
    res.json({ success: true, settings: { mode: 'normal' } })
  ),
  saveSettings: vi.fn((req, res) =>
    res.json({ success: true, settings: req.body.settings })
  ),
  deleteSettings: vi.fn((req, res) =>
    res.json({ success: true, settings: {} })
  ),
}));

import settingsRouter from '../../routes/settings.js';
import * as controller from '../../controllers/settingsController.js';
import { errorHandler } from '../../middleware/errorHandler.js';

function createApp() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));
  app.use('/', settingsRouter);
  app.use(errorHandler);
  return app;
}

describe('GET /', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 and calls getSettings', async () => {
    const res = await request(createApp()).get('/').expect(200);
    expect(res.body.success).toBe(true);
    expect(controller.getSettings).toHaveBeenCalledOnce();
  });
});

describe('POST / (with Joi validation)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 and calls saveSettings for a valid payload', async () => {
    const res = await request(createApp())
      .post('/')
      .send({ settings: { mode: 'normal', general: { memory: false } } })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(controller.saveSettings).toHaveBeenCalledOnce();
  });

  it('returns 400 when the settings field is missing', async () => {
    const res = await request(createApp()).post('/').send({}).expect(400);
    expect(res.body.success).toBe(false);
    expect(controller.saveSettings).not.toHaveBeenCalled();
  });

  it('returns 400 when mode is an unrecognised value', async () => {
    const res = await request(createApp())
      .post('/')
      .send({ settings: { mode: 'wizard' } })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(controller.saveSettings).not.toHaveBeenCalled();
  });

  it('returns 400 when temperature is out of range', async () => {
    const res = await request(createApp())
      .post('/')
      .send({ settings: { general: { temperature: 999 } } })
      .expect(400);

    expect(res.body.success).toBe(false);
  });

  it('strips unknown top-level fields before reaching the controller', async () => {
    await request(createApp())
      .post('/')
      .send({ settings: { mode: 'normal' }, injected: 'evil' })
      .expect(200);

    const callArg = controller.saveSettings.mock.calls[0][0].body;
    expect(callArg.injected).toBeUndefined();
  });
});

describe('DELETE /', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 and calls deleteSettings', async () => {
    const res = await request(createApp()).delete('/').expect(200);
    expect(res.body.success).toBe(true);
    expect(controller.deleteSettings).toHaveBeenCalledOnce();
  });
});

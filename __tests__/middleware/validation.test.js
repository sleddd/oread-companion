import { describe, it, expect, vi } from 'vitest';
import {
  validate,
  validateUUID,
  sanitizeForPrompt,
  validateImageUpload,
  chatSchema,
  modelPullSchema,
  sessionCreateSchema,
  sessionUpdateSchema,
  settingsSchema,
} from '../../middleware/validation.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function mockRes() {
  const res = { statusCode: 200 };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = vi.fn((body) => { res.body = body; return res; });
  return res;
}

function mockReq(body = {}, params = {}) {
  return { body, params };
}

// Produce a 1×1 PNG with correct magic bytes, base64-encoded
function fakePNG() {
  // 89 50 4E 47 = PNG magic
  const bytes = Buffer.alloc(20);
  bytes[0] = 0x89; bytes[1] = 0x50; bytes[2] = 0x4e; bytes[3] = 0x47;
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

function fakeJPEG() {
  const bytes = Buffer.alloc(20);
  bytes[0] = 0xff; bytes[1] = 0xd8; bytes[2] = 0xff;
  return `data:image/jpeg;base64,${bytes.toString('base64')}`;
}

// ─── chatSchema ──────────────────────────────────────────────────────────────

describe('chatSchema', () => {
  const valid = {
    model: 'llama2',
    messages: [{ role: 'user', content: 'Hello' }],
  };

  it('accepts a minimal valid request', () => {
    const { error } = chatSchema.validate(valid);
    expect(error).toBeUndefined();
  });

  it('rejects a model name with spaces', () => {
    const { error } = chatSchema.validate({ ...valid, model: 'bad model' });
    expect(error).toBeDefined();
  });

  it('rejects a model name with shell metacharacters', () => {
    const { error } = chatSchema.validate({ ...valid, model: 'rm;-rf' });
    expect(error).toBeDefined();
  });

  it('accepts a HuggingFace-style model name (via pattern)', () => {
    // chatSchema allows alphanumeric + . _ : -  which covers hf.co paths too
    const { error } = chatSchema.validate({ ...valid, model: 'hf.co:bartowski:llama' });
    expect(error).toBeUndefined();
  });

  it('rejects messages array exceeding 100 items', () => {
    const msgs = Array.from({ length: 101 }, (_, i) => ({ role: 'user', content: `msg${i}` }));
    const { error } = chatSchema.validate({ ...valid, messages: msgs });
    expect(error).toBeDefined();
    expect(error.message).toMatch(/100/);
  });

  it('rejects a message role that is not user/assistant/system', () => {
    const { error } = chatSchema.validate({
      ...valid,
      messages: [{ role: 'admin', content: 'hi' }],
    });
    expect(error).toBeDefined();
  });

  it('rejects a sessionId that is not a valid UUID', () => {
    const { error } = chatSchema.validate({ ...valid, sessionId: 'not-a-uuid' });
    expect(error).toBeDefined();
  });

  it('accepts a valid UUID sessionId', () => {
    const { error } = chatSchema.validate({
      ...valid,
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(error).toBeUndefined();
  });

  it('strips unknown top-level fields', () => {
    const { value } = chatSchema.validate(
      { ...valid, injectedField: 'evil' },
      { stripUnknown: true }
    );
    expect(value.injectedField).toBeUndefined();
  });
});

// ─── modelPullSchema ─────────────────────────────────────────────────────────

describe('modelPullSchema', () => {
  it('accepts an Ollama library name', () => {
    const { error } = modelPullSchema.validate({ modelName: 'llama2' });
    expect(error).toBeUndefined();
  });

  it('accepts a HuggingFace GGUF path', () => {
    const { error } = modelPullSchema.validate({
      modelName: 'hf.co/bartowski/Llama-3.2-1B-Instruct-GGUF',
    });
    expect(error).toBeUndefined();
  });

  it('rejects a model name with spaces', () => {
    const { error } = modelPullSchema.validate({ modelName: 'my model' });
    expect(error).toBeDefined();
  });

  it('rejects a model name with semicolons', () => {
    const { error } = modelPullSchema.validate({ modelName: 'llama2;rm -rf' });
    expect(error).toBeDefined();
  });

  it('rejects missing modelName', () => {
    const { error } = modelPullSchema.validate({});
    expect(error).toBeDefined();
    expect(error.message).toMatch(/required/i);
  });
});

// ─── sessionCreateSchema ─────────────────────────────────────────────────────

describe('sessionCreateSchema', () => {
  const valid = { name: 'My Session', mode: 'normal' };

  it('accepts a minimal valid session', () => {
    expect(sessionCreateSchema.validate(valid).error).toBeUndefined();
  });

  it('requires name', () => {
    const { error } = sessionCreateSchema.validate({ mode: 'normal' });
    expect(error).toBeDefined();
  });

  it('requires mode', () => {
    const { error } = sessionCreateSchema.validate({ name: 'x' });
    expect(error).toBeDefined();
  });

  it('rejects mode values outside the enum', () => {
    const { error } = sessionCreateSchema.validate({ name: 'x', mode: 'wizard' });
    expect(error).toBeDefined();
  });
});

// ─── sessionUpdateSchema ─────────────────────────────────────────────────────

describe('sessionUpdateSchema', () => {
  it('rejects an empty update object', () => {
    const { error } = sessionUpdateSchema.validate({});
    expect(error).toBeDefined();
  });

  it('accepts updating just the name', () => {
    expect(sessionUpdateSchema.validate({ name: 'New name' }).error).toBeUndefined();
  });

  it('accepts updating just archived', () => {
    expect(sessionUpdateSchema.validate({ archived: true }).error).toBeUndefined();
  });
});

// ─── validate middleware ─────────────────────────────────────────────────────

describe('validate middleware', () => {
  it('calls next() on valid input and replaces req.body with sanitized value', () => {
    const next = vi.fn();
    const req = mockReq({ model: 'llama3', messages: [{ role: 'user', content: 'hi' }] });
    const res = mockRes();

    validate(chatSchema)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('returns 400 with details on invalid input', () => {
    const next = vi.fn();
    const req = mockReq({ model: 'bad model!' }); // invalid + missing messages
    const res = mockRes();

    validate(chatSchema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.details).toBeInstanceOf(Array);
    expect(res.body.details.length).toBeGreaterThan(0);
  });

  it('strips unknown fields from req.body', () => {
    const next = vi.fn();
    const req = mockReq({
      model: 'llama3',
      messages: [{ role: 'user', content: 'hi' }],
      injectedField: 'evil',
    });
    const res = mockRes();

    validate(chatSchema)(req, res, next);

    expect(req.body.injectedField).toBeUndefined();
  });
});

// ─── validateUUID ────────────────────────────────────────────────────────────

describe('validateUUID', () => {
  it('calls next() for a valid UUID', () => {
    const next = vi.fn();
    const req = { params: { id: '550e8400-e29b-41d4-a716-446655440000' } };
    validateUUID('id')(req, mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 400 for a non-UUID string', () => {
    const next = vi.fn();
    const req = { params: { id: 'not-a-uuid' } };
    const res = mockRes();
    validateUUID('id')(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for a path traversal attempt', () => {
    const next = vi.fn();
    const req = { params: { id: '../../etc/passwd' } };
    const res = mockRes();
    validateUUID('id')(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
  });
});

// ─── sanitizeForPrompt ───────────────────────────────────────────────────────

describe('sanitizeForPrompt', () => {
  it('removes newlines', () => {
    expect(sanitizeForPrompt('line1\nline2\r\nline3')).toBe('line1 line2 line3');
  });

  it('collapses multiple spaces', () => {
    expect(sanitizeForPrompt('a   b')).toBe('a b');
  });

  it('truncates to 10 000 characters', () => {
    const long = 'x'.repeat(15000);
    expect(sanitizeForPrompt(long).length).toBe(10000);
  });

  it('returns empty string for null/undefined', () => {
    expect(sanitizeForPrompt(null)).toBe('');
    expect(sanitizeForPrompt(undefined)).toBe('');
  });

  it('trims leading/trailing whitespace', () => {
    expect(sanitizeForPrompt('  hello  ')).toBe('hello');
  });
});

// ─── validateImageUpload ─────────────────────────────────────────────────────

describe('validateImageUpload', () => {
  it('accepts a valid PNG with correct magic bytes', () => {
    expect(() => validateImageUpload(fakePNG())).not.toThrow();
  });

  it('accepts a valid JPEG with correct magic bytes', () => {
    expect(() => validateImageUpload(fakeJPEG())).not.toThrow();
  });

  it('rejects SVG mime type', () => {
    const svg = `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`;
    expect(() => validateImageUpload(svg)).toThrow(/Invalid image format/i);
  });

  it('rejects a data URL with wrong magic bytes for declared type', () => {
    // Declare PNG but supply bytes that don't match PNG signature
    const fakeData = Buffer.from('NOTPNG').toString('base64');
    expect(() => validateImageUpload(`data:image/png;base64,${fakeData}`)).toThrow(/signature/i);
  });

  it('rejects an image over 2 MB', () => {
    const bigBuffer = Buffer.alloc(3 * 1024 * 1024);
    // Put valid PNG magic bytes so it passes that check first
    bigBuffer[0] = 0x89; bigBuffer[1] = 0x50; bigBuffer[2] = 0x4e; bigBuffer[3] = 0x47;
    expect(() =>
      validateImageUpload(`data:image/png;base64,${bigBuffer.toString('base64')}`)
    ).toThrow(/too large/i);
  });

  it('throws if no image data provided', () => {
    expect(() => validateImageUpload(null)).toThrow();
    expect(() => validateImageUpload('')).toThrow();
  });
});

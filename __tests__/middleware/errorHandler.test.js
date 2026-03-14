import { describe, it, expect, vi } from 'vitest';
import {
  asyncHandler,
  errorHandler,
  notFoundHandler,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
} from '../../middleware/errorHandler.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function mockReqRes(path = '/test') {
  const res = { statusCode: 200 };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = vi.fn((body) => { res.body = body; return res; });

  const req = { method: 'GET', path };
  return { req, res };
}

// ─── Custom error classes ────────────────────────────────────────────────────

describe('Custom error classes', () => {
  it('ValidationError has statusCode 400', () => {
    const err = new ValidationError('bad input');
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('bad input');
    expect(err.name).toBe('ValidationError');
  });

  it('ValidationError stores details', () => {
    const err = new ValidationError('bad', [{ field: 'x' }]);
    expect(err.details).toEqual([{ field: 'x' }]);
  });

  it('AuthenticationError has statusCode 401', () => {
    const err = new AuthenticationError();
    expect(err.statusCode).toBe(401);
  });

  it('AuthorizationError has statusCode 403', () => {
    const err = new AuthorizationError();
    expect(err.statusCode).toBe(403);
  });

  it('NotFoundError has statusCode 404', () => {
    const err = new NotFoundError();
    expect(err.statusCode).toBe(404);
  });

  it('RateLimitError has statusCode 429', () => {
    const err = new RateLimitError();
    expect(err.statusCode).toBe(429);
  });

  it('all errors are instanceof Error', () => {
    expect(new ValidationError('x')).toBeInstanceOf(Error);
    expect(new AuthenticationError()).toBeInstanceOf(Error);
    expect(new NotFoundError()).toBeInstanceOf(Error);
  });
});

// ─── asyncHandler ────────────────────────────────────────────────────────────

describe('asyncHandler', () => {
  it('passes resolved value through without calling next with an error', async () => {
    const next = vi.fn();
    const { req, res } = mockReqRes();

    const handler = asyncHandler(async (req, res) => {
      res.json({ ok: true });
    });

    await handler(req, res, next);

    expect(res.body).toEqual({ ok: true });
    expect(next).not.toHaveBeenCalledWith(expect.any(Error));
  });

  it('passes async errors to next()', async () => {
    const next = vi.fn();
    const { req, res } = mockReqRes();
    const boom = new Error('async boom');

    const handler = asyncHandler(async () => { throw boom; });
    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(boom);
  });

  it('works when the handler resolves without calling next', async () => {
    const next = vi.fn();
    const { req, res } = mockReqRes();

    const handler = asyncHandler(async (_req, _res) => {
      // no-op: resolves cleanly
    });

    await handler(req, res, next);

    // next should not be called with an error
    expect(next).not.toHaveBeenCalledWith(expect.any(Error));
  });
});

// ─── errorHandler middleware ─────────────────────────────────────────────────

describe('errorHandler middleware', () => {
  it('uses the error statusCode when present', () => {
    const { req, res } = mockReqRes();
    const err = new NotFoundError('not here');

    errorHandler(err, req, res, () => {});

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('falls back to 500 when no statusCode on the error', () => {
    const { req, res } = mockReqRes();
    const err = new Error('unknown');

    errorHandler(err, req, res, () => {});

    expect(res.statusCode).toBe(500);
  });

  it('returns success: false in the body', () => {
    const { req, res } = mockReqRes();
    errorHandler(new Error('oops'), req, res, () => {});
    expect(res.body.success).toBe(false);
  });
});

// ─── notFoundHandler ─────────────────────────────────────────────────────────

describe('notFoundHandler', () => {
  it('returns 404 with the request path', () => {
    const { req, res } = mockReqRes('/unknown/route');
    notFoundHandler(req, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.path).toBe('/unknown/route');
    expect(res.body.success).toBe(false);
  });
});

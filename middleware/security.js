import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import crypto from 'crypto';
import { CONFIG } from '../config/index.js';

/**
 * Rate limiting middleware
 */

// General API rate limiter
export const generalLimiter = rateLimit({
  windowMs: CONFIG.RATE_LIMIT.WINDOW_MS, // 15 minutes default
  max: CONFIG.RATE_LIMIT.MAX_REQUESTS, // 100 requests per window default
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later'
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  skip: (req) => {
    // Skip rate limiting for health check in development
    return CONFIG.isDevelopment && req.path === '/api/health';
  }
});

// Strict rate limiter for expensive operations
export const strictLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: CONFIG.RATE_LIMIT.CHAT_MAX, // 10 requests per minute default
  message: {
    success: false,
    error: 'Rate limit exceeded for this operation. Please slow down.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Authentication endpoint limiter (prevent brute force)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Security headers middleware (Helmet)
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for CSS-in-JS
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: [
        "'self'",
        CONFIG.OLLAMA_URL, // Allow connections to Ollama
        ...CONFIG.ALLOWED_ORIGINS
      ],
      fontSrc: [
        "'self'",
        "https://fonts.googleapis.com",
        "https://fonts.gstatic.com"
      ],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: CONFIG.isProduction ? [] : null
    }
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  frameguard: {
    action: 'deny' // Prevent clickjacking
  },
  noSniff: true, // Prevent MIME type sniffing
  xssFilter: true, // Enable XSS protection
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin'
  }
});

/**
 * CORS configuration
 */
export function corsOptions(origin, callback) {
  // Allow requests with no origin (like mobile apps, curl, Postman)
  if (!origin || CONFIG.ALLOWED_ORIGINS.includes(origin)) {
    callback(null, true);
  } else {
    callback(new Error(`Origin ${origin} not allowed by CORS policy`));
  }
}

export const corsConfig = {
  origin: corsOptions,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
  maxAge: 86400 // 24 hours
};

/**
 * Request size monitoring middleware
 */
export function requestSizeMonitor(req, res, next) {
  const size = req.headers['content-length'];

  if (size) {
    const sizeInMB = parseInt(size) / (1024 * 1024);

    // Warn if request is large
    if (sizeInMB > 5) {
      console.warn(`⚠️  Large request detected: ${sizeInMB.toFixed(2)}MB from ${req.ip}`);
    }

    // Reject very large requests
    if (sizeInMB > 10) {
      return res.status(413).json({
        success: false,
        error: 'Request too large (max: 10MB)'
      });
    }
  }

  next();
}

/**
 * Security logging middleware
 */
export function securityLogger(req, res, next) {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;

    // Log security-relevant events
    const shouldLog =
      res.statusCode >= 400 || // All errors
      ['POST', 'PUT', 'DELETE'].includes(req.method) || // State changes
      duration > 5000; // Slow requests

    if (shouldLog) {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        type: 'security',
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip,
        userAgent: req.headers['user-agent']?.substring(0, 100)
      }));
    }

    // Alert on suspicious patterns
    if (res.statusCode === 401 || res.statusCode === 403) {
      console.warn(`🚨 Unauthorized access attempt: ${req.method} ${req.path} from ${req.ip}`);
    }

    if (duration > 10000) {
      console.warn(`⚠️  Slow request: ${req.method} ${req.path} took ${duration}ms`);
    }
  });

  next();
}

/**
 * CSRF Protection — Synchronizer Token Pattern
 *
 * Flow:
 *   1. GET /api/csrf-token  → server issues a token (stored in session + returned as JSON)
 *   2. Frontend sends X-CSRF-Token header on every POST/PUT/DELETE
 *   3. csrfProtect middleware validates header matches session token
 *
 * Exempt: GET/HEAD/OPTIONS (safe methods), /api/health
 */

const CSRF_EXEMPT = new Set(['GET', 'HEAD', 'OPTIONS']);

export function generateCsrfToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  return req.session.csrfToken;
}

export function csrfProtect(req, res, next) {
  // Skip safe methods and health check
  if (CSRF_EXEMPT.has(req.method) || req.path === '/api/health') {
    return next();
  }

  // Skip if auth is disabled and we're in dev (CSRF less meaningful without sessions)
  if (!CONFIG.ENABLE_AUTH && CONFIG.isDevelopment) {
    return next();
  }

  const sessionToken = req.session?.csrfToken;
  const requestToken = req.headers['x-csrf-token'];

  if (!sessionToken || !requestToken) {
    return res.status(403).json({ success: false, error: 'CSRF token missing' });
  }

  // Constant-time comparison to prevent timing attacks
  const sessionBuf = Buffer.from(sessionToken);
  const requestBuf = Buffer.from(requestToken);

  if (sessionBuf.length !== requestBuf.length || !crypto.timingSafeEqual(sessionBuf, requestBuf)) {
    return res.status(403).json({ success: false, error: 'CSRF token invalid' });
  }

  next();
}

/**
 * Input sanitization middleware
 * Removes potentially dangerous characters from request parameters
 */
export function sanitizeInputs(req, res, next) {
  // Sanitize query parameters
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        // Remove null bytes and control characters
        req.query[key] = req.query[key].replace(/\0/g, '').replace(/[\x00-\x1F\x7F]/g, '');
      }
    });
  }

  // Note: Body sanitization is handled by validation middleware
  next();
}

export default {
  generalLimiter,
  strictLimiter,
  authLimiter,
  securityHeaders,
  corsConfig,
  requestSizeMonitor,
  securityLogger,
  sanitizeInputs,
  csrfProtect,
  generateCsrfToken
};

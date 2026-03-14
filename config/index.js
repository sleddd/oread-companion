import dotenv from 'dotenv';
import crypto from 'crypto';

// Load environment variables
dotenv.config();

const isDevelopment = process.env.NODE_ENV !== 'production';
const isProduction = process.env.NODE_ENV === 'production';

// Generate secure session secret if not provided
function getSessionSecret() {
  if (process.env.SESSION_SECRET) {
    return process.env.SESSION_SECRET;
  }

  if (isProduction) {
    throw new Error('SESSION_SECRET environment variable is required in production');
  }

  console.warn('⚠️  Using auto-generated SESSION_SECRET. Set SESSION_SECRET in .env for production.');
  return crypto.randomBytes(32).toString('hex');
}

// Generate encryption passphrase if not provided
function getEncryptionPassphrase() {
  if (process.env.OREAD_ENCRYPTION_PASSPHRASE) {
    return process.env.OREAD_ENCRYPTION_PASSPHRASE;
  }

  if (isProduction) {
    throw new Error('OREAD_ENCRYPTION_PASSPHRASE environment variable is required in production');
  }

  console.warn('⚠️  Using auto-generated OREAD_ENCRYPTION_PASSPHRASE. Set in .env for production.');
  return crypto.randomBytes(32).toString('hex');
}

export const CONFIG = {
  // Environment
  NODE_ENV: process.env.NODE_ENV || 'development',
  isDevelopment,
  isProduction,

  // Server
  PORT: parseInt(process.env.PORT || '3001', 10),

  // Security
  SESSION_SECRET: getSessionSecret(),
  ENCRYPTION_PASSPHRASE: getEncryptionPassphrase(),
  ENABLE_AUTH: process.env.ENABLE_AUTH === 'true',
  ENABLE_CSRF: process.env.ENABLE_CSRF !== 'false', // Enabled by default

  // Ollama
  OLLAMA_URL: process.env.OLLAMA_URL || 'http://localhost:11434',
  OLLAMA_CHAT_MODEL: process.env.OLLAMA_CHAT_MODEL || 'llama2',
  OLLAMA_EMBED_MODEL: process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text',

  // CORS
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
    : ['http://localhost:5173', 'http://localhost:3000'],

  // Upload Limits
  MAX_UPLOAD_SIZE: process.env.MAX_UPLOAD_SIZE || '2mb',

  // Rate Limiting
  RATE_LIMIT: {
    WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    CHAT_MAX: parseInt(process.env.CHAT_RATE_LIMIT_MAX || '10', 10)
  },

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info')
};

// Validate critical configuration on startup
export function validateConfig() {
  const errors = [];

  if (isProduction) {
    if (!process.env.SESSION_SECRET) {
      errors.push('SESSION_SECRET is required in production');
    }

    if (!process.env.OREAD_ENCRYPTION_PASSPHRASE) {
      errors.push('OREAD_ENCRYPTION_PASSPHRASE is required in production');
    }
  }

  if (CONFIG.PORT < 1 || CONFIG.PORT > 65535) {
    errors.push('PORT must be between 1 and 65535');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }

  console.log('✅ Configuration validated successfully');
}

export default CONFIG;

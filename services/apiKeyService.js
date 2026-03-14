import crypto from 'crypto';
import { CONFIG } from '../config/index.js';
import database from './database.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function deriveKey() {
  return crypto.scryptSync(CONFIG.ENCRYPTION_PASSPHRASE, 'oread-api-keys', 32);
}

function encrypt(plaintext) {
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const tag = cipher.getAuthTag();

  // IV + tag + ciphertext → single base64 string
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decrypt(encoded) {
  const key = deriveKey();
  const buf = Buffer.from(encoded, 'base64');

  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString('utf8');
}

class ApiKeyService {
  async saveKey(provider, apiKey) {
    const encrypted = encrypt(apiKey);
    await database.run(
      `INSERT INTO api_keys (provider, encrypted_key, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(provider) DO UPDATE SET encrypted_key = ?, updated_at = CURRENT_TIMESTAMP`,
      [provider, encrypted, encrypted]
    );
  }

  async getKey(provider) {
    // Check env first
    const envKey = this.getEnvKey(provider);
    if (envKey) return envKey;

    // Then check DB
    const row = await database.get(
      'SELECT encrypted_key FROM api_keys WHERE provider = ?',
      [provider]
    );
    if (!row) return null;
    return decrypt(row.encrypted_key);
  }

  async deleteKey(provider) {
    await database.run('DELETE FROM api_keys WHERE provider = ?', [provider]);
  }

  async getConfiguredProviders() {
    const providers = { ollama: true, openai: false, anthropic: false };

    // Check env keys
    if (this.getEnvKey('openai')) providers.openai = true;
    if (this.getEnvKey('anthropic')) providers.anthropic = true;

    // Check DB keys
    const rows = await database.all('SELECT provider FROM api_keys');
    for (const row of rows) {
      providers[row.provider] = true;
    }

    return providers;
  }

  getEnvKey(provider) {
    switch (provider) {
      case 'openai': return process.env.OPENAI_API_KEY || null;
      case 'anthropic': return process.env.ANTHROPIC_API_KEY || null;
      default: return null;
    }
  }
}

export default new ApiKeyService();

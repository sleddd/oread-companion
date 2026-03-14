import { describe, it, expect, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import characterController from '../../controllers/characterController.js';

const { sanitizeCharacterId, verifyPathSafety } = characterController;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolve the actual characters directory used by the controller
const CHARACTERS_DIR = path.resolve(__dirname, '../../data/characters');

// ─── sanitizeCharacterId ─────────────────────────────────────────────────────

describe('sanitizeCharacterId', () => {
  it('accepts a simple alphanumeric ID', () => {
    expect(sanitizeCharacterId('echo')).toBe('echo');
  });

  it('accepts hyphens and underscores', () => {
    expect(sanitizeCharacterId('my-char_01')).toBe('my-char_01');
  });

  it('strips traversal sequences and returns the remaining safe chars', () => {
    // '../etc/passwd' → strip '..' → '/etc/passwd' → strip '/' → 'etcpasswd'
    expect(sanitizeCharacterId('../etc/passwd')).toBe('etcpasswd');
  });

  it('throws when only traversal sequences remain (nothing left after stripping)', () => {
    // '../../' → strip '..' → '//' → strip '/' → '' → falsy → throw
    expect(() => sanitizeCharacterId('../../')).toThrow();
  });

  it('throws when residual chars after stripping fail the whitelist', () => {
    // '../!evil!' → strip '..' → '/!evil!' → strip '/' → '!evil!' → fails [a-zA-Z0-9_-]
    expect(() => sanitizeCharacterId('../!evil!')).toThrow(/invalid character id/i);
  });

  it('rejects IDs with spaces', () => {
    expect(() => sanitizeCharacterId('my character')).toThrow(/invalid character id/i);
  });

  it('rejects IDs with dots', () => {
    expect(() => sanitizeCharacterId('char.json')).toThrow(/invalid character id/i);
  });

  it('rejects IDs with null bytes', () => {
    expect(() => sanitizeCharacterId('char\x00id')).toThrow();
  });

  it('rejects IDs longer than 100 characters', () => {
    const long = 'a'.repeat(101);
    expect(() => sanitizeCharacterId(long)).toThrow(/too long/i);
  });

  it('accepts exactly 100 characters', () => {
    const id = 'a'.repeat(100);
    expect(sanitizeCharacterId(id)).toBe(id);
  });

  it('throws for null/undefined input', () => {
    expect(() => sanitizeCharacterId(null)).toThrow();
    expect(() => sanitizeCharacterId(undefined)).toThrow();
  });

  it('throws for non-string input', () => {
    expect(() => sanitizeCharacterId(123)).toThrow();
  });
});

// ─── verifyPathSafety ────────────────────────────────────────────────────────

describe('verifyPathSafety', () => {
  it('allows a path that is inside the allowed directory', () => {
    const allowed = '/data/characters';
    const safe = '/data/characters/echo.json';
    expect(() => verifyPathSafety(safe, allowed)).not.toThrow();
  });

  it('throws for a path that escapes the allowed directory', () => {
    const allowed = '/data/characters';
    const traversal = '/data/characters/../../etc/passwd';
    expect(() => verifyPathSafety(traversal, allowed)).toThrow(/traversal/i);
  });

  it('throws for a completely unrelated path', () => {
    const allowed = '/data/characters';
    expect(() => verifyPathSafety('/etc/shadow', allowed)).toThrow(/traversal/i);
  });

  it('returns the resolved path on success', () => {
    const allowed = '/data/characters';
    const result = verifyPathSafety('/data/characters/hero.json', allowed);
    expect(result).toBe(path.resolve('/data/characters/hero.json'));
  });
});

// ─── saveCharacter / getCharacter / deleteCharacter (integration) ────────────

const TEST_CHAR_ID = 'vitest-test-character';
const TEST_FILE = path.join(CHARACTERS_DIR, `${TEST_CHAR_ID}.json`);

afterEach(() => {
  if (fs.existsSync(TEST_FILE)) fs.unlinkSync(TEST_FILE);
});

describe('saveCharacter', () => {
  it('writes the character file and returns success', () => {
    const result = characterController.saveCharacter(TEST_CHAR_ID, {
      name: 'Test', personality: 'Friendly'
    });
    expect(result.success).toBe(true);
    expect(result.character.id).toBe(TEST_CHAR_ID);
    expect(fs.existsSync(TEST_FILE)).toBe(true);
  });

  it('returns failure for invalid (non-object) character data', () => {
    const result = characterController.saveCharacter(TEST_CHAR_ID, 'not-an-object');
    expect(result.success).toBe(false);
  });

  it('sanitizes a path traversal ID and saves under the stripped name', () => {
    // '../../../etc/evil' is stripped to 'etcevil' which is valid
    const sanitized = 'etcevil';
    const sanitizedFile = path.join(CHARACTERS_DIR, `${sanitized}.json`);
    try {
      const result = characterController.saveCharacter('../../../etc/evil', { name: 'x' });
      expect(result.success).toBe(true);
      expect(result.character.id).toBe(sanitized);
    } finally {
      if (fs.existsSync(sanitizedFile)) fs.unlinkSync(sanitizedFile);
    }
  });
});

describe('getCharacter', () => {
  it('returns the character after it has been saved', () => {
    characterController.saveCharacter(TEST_CHAR_ID, { name: 'Test' });
    const result = characterController.getCharacter(TEST_CHAR_ID);
    expect(result.success).toBe(true);
    expect(result.character.id).toBe(TEST_CHAR_ID);
  });

  it('returns failure for a non-existent character', () => {
    const result = characterController.getCharacter('does-not-exist-ever');
    expect(result.success).toBe(false);
  });
});

describe('deleteCharacter', () => {
  it('removes the file and returns success', () => {
    characterController.saveCharacter(TEST_CHAR_ID, { name: 'Temp' });
    expect(fs.existsSync(TEST_FILE)).toBe(true);

    const result = characterController.deleteCharacter(TEST_CHAR_ID);
    expect(result.success).toBe(true);
    expect(fs.existsSync(TEST_FILE)).toBe(false);
  });

  it('returns failure when the character does not exist', () => {
    const result = characterController.deleteCharacter('does-not-exist-ever');
    expect(result.success).toBe(false);
  });
});

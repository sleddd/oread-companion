// Character management controller
// Handles loading, saving, and managing user character JSON files
// Default characters are now embedded in templates (data/templates/defaults/)
// SECURITY: Path traversal protection

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHARACTERS_DIR = path.join(__dirname, '..', 'data', 'characters');

// Ensure directory exists
if (!fs.existsSync(CHARACTERS_DIR)) {
  fs.mkdirSync(CHARACTERS_DIR, { recursive: true });
}

/**
 * SECURITY: Sanitize and validate character ID
 */
function sanitizeCharacterId(id) {
  if (!id || typeof id !== 'string') {
    throw new Error('Character ID is required and must be a string');
  }

  const sanitized = id.replace(/\.\./g, '').replace(/[\/\\]/g, '');

  if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) {
    throw new Error(
      'Invalid character ID: must contain only alphanumeric characters, hyphens, and underscores'
    );
  }

  if (sanitized.length > 100) {
    throw new Error('Character ID too long (max: 100 characters)');
  }

  return sanitized;
}

/**
 * SECURITY: Verify path is within allowed directory
 */
function verifyPathSafety(filePath, allowedDir) {
  const resolvedPath = path.resolve(filePath);
  const resolvedBaseDir = path.resolve(allowedDir);

  if (!resolvedPath.startsWith(resolvedBaseDir)) {
    throw new Error('Path traversal detected - access denied');
  }

  return resolvedPath;
}

/**
 * SECURITY: Safe JSON parse with error handling
 */
function safeJSONParse(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);

    if (parsed && typeof parsed === 'object') {
      delete parsed.__proto__;
      delete parsed.constructor;
      delete parsed.prototype;
    }

    return parsed;
  } catch (error) {
    throw new Error(`Invalid JSON: ${error.message}`);
  }
}

/**
 * Get all user character files
 */
export function getAllCharacters() {
  try {
    const files = fs.readdirSync(CHARACTERS_DIR)
      .filter(file => file.endsWith('.json') && !file.startsWith('.'));

    const characters = files.map(file => {
      try {
        const sanitizedId = sanitizeCharacterId(path.basename(file, '.json'));
        const filePath = path.join(CHARACTERS_DIR, `${sanitizedId}.json`);
        verifyPathSafety(filePath, CHARACTERS_DIR);

        const data = safeJSONParse(fs.readFileSync(filePath, 'utf8'));
        return {
          id: sanitizedId,
          ...data
        };
      } catch (error) {
        console.error(`Error loading character ${file}:`, error);
        return null;
      }
    }).filter(Boolean);

    return { success: true, characters };
  } catch (error) {
    console.error('Error loading characters:', error);
    return { success: false, error: 'Failed to load characters', characters: [] };
  }
}

/**
 * Get a specific character by ID (user folder only)
 */
export function getCharacter(characterId) {
  try {
    const sanitizedId = sanitizeCharacterId(characterId);
    const filePath = path.join(CHARACTERS_DIR, `${sanitizedId}.json`);
    verifyPathSafety(filePath, CHARACTERS_DIR);

    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Character not found' };
    }

    const data = safeJSONParse(fs.readFileSync(filePath, 'utf8'));
    return {
      success: true,
      character: {
        id: sanitizedId,
        ...data
      }
    };
  } catch (error) {
    console.error('Error loading character:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Save or update a character (user folder only)
 */
export function saveCharacter(characterId, characterData) {
  try {
    const sanitizedId = sanitizeCharacterId(characterId);
    const filePath = path.join(CHARACTERS_DIR, `${sanitizedId}.json`);
    verifyPathSafety(filePath, CHARACTERS_DIR);

    if (!characterData || typeof characterData !== 'object') {
      return { success: false, error: 'Invalid character data' };
    }

    const dataToSave = {
      version: "2.0",
      type: "character",
      character: characterData
    };

    fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2), 'utf8');

    return {
      success: true,
      character: {
        id: sanitizedId,
        ...dataToSave
      }
    };
  } catch (error) {
    console.error('Error saving character:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a character (user folder only)
 */
export function deleteCharacter(characterId) {
  try {
    const sanitizedId = sanitizeCharacterId(characterId);
    const filePath = path.join(CHARACTERS_DIR, `${sanitizedId}.json`);
    verifyPathSafety(filePath, CHARACTERS_DIR);

    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Character not found' };
    }

    fs.unlinkSync(filePath);
    return { success: true, message: 'Character deleted successfully' };
  } catch (error) {
    console.error('Error deleting character:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Initialize character system
 */
export function initializeCharacters() {
  console.log('✅ Character system initialized');
}

export default {
  getAllCharacters,
  getCharacter,
  saveCharacter,
  deleteCharacter,
  initializeCharacters,
  sanitizeCharacterId,
  verifyPathSafety
};

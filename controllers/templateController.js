// Template management controller
// Handles both default templates (read-only) and the active settings template

import fs from 'fs';
import fsAsync from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATES_DIR = path.join(__dirname, '..', 'data', 'templates');
const DEFAULTS_DIR = path.join(TEMPLATES_DIR, 'defaults');
const ACTIVE_FILE = path.join(TEMPLATES_DIR, 'active.json');

// Ensure directories exist
if (!fs.existsSync(DEFAULTS_DIR)) {
  fs.mkdirSync(DEFAULTS_DIR, { recursive: true });
}

function safeJSONParse(jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error.message}`);
  }
}

const BLANK_SETTINGS = {
  mode: 'roleplay',
  roleplay: {
    world: {
      settingLore: '',
      openingScene: '',
      narratorVoice: 'companion',
      hardRules: []
    },
    characterMode: 'single',
    singleCharacterRef: 'echo',
    multipleCharacterRefs: [],
    character: null
  },
  utility: {
    assistantIdentity: { persona: '', communicationStyle: '' },
    guardrails: { negativeConstraints: '', formattingPreferences: '' }
  },
  userPersona: {
    name: '',
    bio: '',
    skills: '',
    profession: '',
    tastes: { interests: '', hobbies: '', mediaPreferences: '' },
    linguisticFilters: { bannedPhrases: [], bannedWords: [] },
    boundaries: ''
  },
  general: {
    selectedModel: null,
    webSearch: false,
    chatSearch: false,
    memory: true,
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 2048
  },
  meta: {
    templateId: null,
    lastModified: null,
    version: '1.0.0'
  }
};

async function readActiveSettings() {
  try {
    const data = await fsAsync.readFile(ACTIVE_FILE, 'utf8');
    const template = JSON.parse(data);
    return template.settings || null;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    console.error('Error reading active.json:', error);
    return null;
  }
}

async function writeActiveSettings(settings) {
  if (!fs.existsSync(TEMPLATES_DIR)) {
    fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  }
  const template = {
    id: 'active',
    name: 'Active Settings',
    category: settings.mode === 'roleplay' ? 'roleplay' : 'utility',
    settings
  };
  await fsAsync.writeFile(ACTIVE_FILE, JSON.stringify(template, null, 2), 'utf8');
}

// ─── Default Templates ────────────────────────────────────────────────────────

/**
 * GET /api/templates
 * Get all default templates
 */
export function getAllDefaultTemplates(req, res) {
  try {
    const files = fs.readdirSync(DEFAULTS_DIR).filter(f => f.endsWith('.json'));
    const templates = files.map(file => {
      const filePath = path.join(DEFAULTS_DIR, file);
      const content = fs.readFileSync(filePath, 'utf8');
      return safeJSONParse(content);
    });
    res.json({ success: true, templates });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/templates/:id
 * Get a single default template by ID
 */
export function getDefaultTemplate(req, res) {
  try {
    const id = req.params.id;
    const sanitized = id.replace(/\.\./g, '').replace(/[\/\\]/g, '');
    if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) {
      return res.status(400).json({ success: false, error: 'Invalid template ID' });
    }

    const filePath = path.join(DEFAULTS_DIR, `${sanitized}.json`);
    const resolvedPath = path.resolve(filePath);
    const resolvedBase = path.resolve(DEFAULTS_DIR);

    if (!resolvedPath.startsWith(resolvedBase)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    const content = fs.readFileSync(resolvedPath, 'utf8');
    res.json({ success: true, template: safeJSONParse(content) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─── Active Template (Settings) ───────────────────────────────────────────────

/**
 * GET /api/templates/active
 * Get current active settings
 */
export async function getActiveTemplate(req, res) {
  try {
    const settings = await readActiveSettings() || BLANK_SETTINGS;
    res.json({ success: true, settings });
  } catch (error) {
    console.error('Error reading active template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * PUT /api/templates/active
 * Save current active settings
 */
export async function saveActiveTemplate(req, res) {
  try {
    const { settings } = req.body;
    if (!settings) {
      return res.status(400).json({ success: false, error: 'Settings data required' });
    }

    settings.meta = {
      ...settings.meta,
      lastModified: new Date().toISOString(),
      version: '1.0.0'
    };

    await writeActiveSettings(settings);
    res.json({ success: true, settings });
  } catch (error) {
    console.error('Error saving active template:', error);
    res.status(500).json({ success: false, error: 'Failed to save settings' });
  }
}

/**
 * DELETE /api/templates/active
 * Reset active settings to blank
 */
export async function deleteActiveTemplate(req, res) {
  try {
    await fsAsync.unlink(ACTIVE_FILE).catch(err => {
      if (err.code !== 'ENOENT') throw err;
    });
    res.json({ success: true, settings: BLANK_SETTINGS });
  } catch (error) {
    console.error('Error resetting active template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

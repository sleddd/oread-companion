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
const USER_TEMPLATES_DIR = path.join(TEMPLATES_DIR, 'user');
const ACTIVE_FILE = path.join(TEMPLATES_DIR, 'active.json');

// Ensure directories exist
if (!fs.existsSync(DEFAULTS_DIR)) {
  fs.mkdirSync(DEFAULTS_DIR, { recursive: true });
}
if (!fs.existsSync(USER_TEMPLATES_DIR)) {
  fs.mkdirSync(USER_TEMPLATES_DIR, { recursive: true });
}

function sanitizeTemplateId(id) {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function generateTemplateId(name) {
  return sanitizeTemplateId(name);
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
    character: null,
    characters: [],
    activeCharacterIndex: 0
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
    temperature: 0.7,
    topP: 0.9,
    frequencyPenalty: 1.1,
    maxTokens: 2048,
    contextBudget: 4096
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
 * Get all templates (defaults + user)
 */
export function getAllTemplates(req, res) {
  try {
    // Read default templates
    const defaultFiles = fs.readdirSync(DEFAULTS_DIR).filter(f => f.endsWith('.json'));
    const defaults = defaultFiles.map(file => {
      const filePath = path.join(DEFAULTS_DIR, file);
      const content = fs.readFileSync(filePath, 'utf8');
      return { ...safeJSONParse(content), isUserTemplate: false };
    });

    // Read user templates
    let userTemplates = [];
    if (fs.existsSync(USER_TEMPLATES_DIR)) {
      const userFiles = fs.readdirSync(USER_TEMPLATES_DIR).filter(f => f.endsWith('.json'));
      userTemplates = userFiles.map(file => {
        const filePath = path.join(USER_TEMPLATES_DIR, file);
        const content = fs.readFileSync(filePath, 'utf8');
        return { ...safeJSONParse(content), isUserTemplate: true };
      });
    }

    res.json({ success: true, templates: [...defaults, ...userTemplates] });
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
 * Save current active settings.
 * If a user template is applied (meta.templateId + meta.isUserTemplate),
 * also write the settings back to that template file so changes persist
 * across world switches.
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

    // Propagate to the applied user template so settings survive world switches
    const templateId = settings.meta?.templateId;
    const isUserTemplate = settings.meta?.isUserTemplate;
    if (templateId && isUserTemplate) {
      const sanitized = sanitizeTemplateId(templateId);
      if (sanitized) {
        const templatePath = path.join(USER_TEMPLATES_DIR, `${sanitized}.json`);
        const resolvedPath = path.resolve(templatePath);
        const resolvedBase = path.resolve(USER_TEMPLATES_DIR);

        if (resolvedPath.startsWith(resolvedBase) && fs.existsSync(resolvedPath)) {
          try {
            const existing = safeJSONParse(fs.readFileSync(resolvedPath, 'utf8'));
            existing.settings = settings;
            await fsAsync.writeFile(resolvedPath, JSON.stringify(existing, null, 2), 'utf8');
          } catch (err) {
            console.error('Failed to propagate settings to user template:', err);
            // Non-fatal — active.json is already saved
          }
        }
      }
    }

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

// ─── User Templates ──────────────────────────────────────────────────────────

/**
 * POST /api/templates/user
 * Save a new user template
 */
export async function saveUserTemplate(req, res) {
  try {
    const { name, description, settings } = req.body;

    let id = generateTemplateId(name);
    if (!id) {
      return res.status(400).json({ success: false, error: 'Invalid template name' });
    }

    // Handle ID collision by appending -2, -3, etc.
    let finalId = id;
    let counter = 2;
    while (fs.existsSync(path.join(USER_TEMPLATES_DIR, `${finalId}.json`))) {
      finalId = `${id}-${counter}`;
      counter++;
    }

    const template = {
      id: finalId,
      name,
      description: description || '',
      category: settings.mode === 'roleplay' ? 'roleplay' : 'utility',
      isUserTemplate: true,
      createdAt: new Date().toISOString(),
      settings
    };

    const filePath = path.join(USER_TEMPLATES_DIR, `${finalId}.json`);
    await fsAsync.writeFile(filePath, JSON.stringify(template, null, 2), 'utf8');

    res.json({ success: true, template });
  } catch (error) {
    console.error('Error saving user template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * DELETE /api/templates/user/:id
 * Delete a user template
 */
export async function deleteUserTemplate(req, res) {
  try {
    const id = sanitizeTemplateId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: 'Invalid template ID' });
    }

    const filePath = path.join(USER_TEMPLATES_DIR, `${id}.json`);
    const resolvedPath = path.resolve(filePath);
    const resolvedBase = path.resolve(USER_TEMPLATES_DIR);

    if (!resolvedPath.startsWith(resolvedBase)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    await fsAsync.unlink(resolvedPath);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting user template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

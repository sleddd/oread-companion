import {
  fetchDefaultSettings,
  saveSettings as saveSettingsAPI,
  loadSettings as loadSettingsAPI,
  deleteSettings as deleteSettingsAPI
} from '../../utils/settingsAPI';

let saveTimeoutRef = null;

// Canonical defaults live in oread-cli (GET /api/templates/defaults). We fetch
// them once at startup and cache them here as the merge base — the GUI no longer
// ships its own DEFAULT_SETTINGS copy.
let defaultsCache = null;

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

// Deep-merge incoming settings onto the backend defaults so every settings panel
// always sees the full shape (meta.templateId, generation params, etc.), even when
// a world or the active settings omit some sections. Falls back to an empty base
// if defaults haven't loaded yet (loadSettings primes the cache before anything
// that needs it runs).
export function mergeWithDefaults(loaded) {
  const base = defaultsCache ? JSON.parse(JSON.stringify(defaultsCache)) : {};
  const merge = (b, override) => {
    if (!isPlainObject(override)) return b;
    const out = { ...b };
    for (const key of Object.keys(override)) {
      const o = override[key];
      out[key] = isPlainObject(o) && isPlainObject(b[key]) ? merge(b[key], o) : o;
    }
    return out;
  };
  return merge(base, loaded || {});
}

export const createSettingsSlice = (set, get) => ({
  // null until loadSettings() resolves; App.jsx gates rendering on this.
  settings: null,
  isSavingSettings: false,
  lastSaved: null,

  setSettings: (newSettings) => {
    set({ settings: newSettings, isSavingSettings: true });

    try {
      localStorage.setItem('ollama-chat-settings', JSON.stringify(newSettings));
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
    }

    if (saveTimeoutRef) {
      clearTimeout(saveTimeoutRef);
    }

    saveTimeoutRef = setTimeout(async () => {
      try {
        const result = await saveSettingsAPI(newSettings);
        if (result.success) {
          set({ isSavingSettings: false, lastSaved: new Date() });

          const tid = newSettings.meta?.templateId;
          if (tid && newSettings.meta?.isUserTemplate) {
            const templates = get().templates;
            set({
              templates: templates.map(t =>
                t.id === tid ? { ...t, settings: newSettings } : t
              )
            });
          }
        } else {
          console.error('Failed to save settings to backend:', result.error);
          set({ isSavingSettings: false });
        }
      } catch (error) {
        console.error('Failed to save settings to backend:', error);
        set({ isSavingSettings: false });
      }
    }, 1000);
  },

  loadSettings: async () => {
    try {
      // 1. Prime the canonical defaults from oread-cli (single source of truth).
      if (!defaultsCache) {
        try {
          defaultsCache = await fetchDefaultSettings();
        } catch (e) {
          console.error('Failed to fetch default settings from backend:', e);
        }
      }

      // 2. localStorage for instant UI (merged onto defaults for a complete shape).
      const localSettings = localStorage.getItem('ollama-chat-settings');
      set({ settings: mergeWithDefaults(localSettings ? JSON.parse(localSettings) : null) });

      // 3. Backend active settings are authoritative — overwrite once they load.
      const result = await loadSettingsAPI();
      if (result.success && result.settings) {
        const merged = mergeWithDefaults(result.settings);
        set({ settings: merged });
        try {
          localStorage.setItem('ollama-chat-settings', JSON.stringify(merged));
        } catch (_) {}
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      // Last resort so the app can still render.
      if (!get().settings) set({ settings: mergeWithDefaults(null) });
    }
  },

  // Reset to backend defaults: clear the active settings server-side (DELETE
  // /api/templates/active makes oread-cli reload its defaults), drop the local
  // cache, then re-pull from the backend.
  resetSettings: async () => {
    try {
      await deleteSettingsAPI();
      try { localStorage.removeItem('ollama-chat-settings'); } catch (_) {}
      await get().loadSettings();
      return { success: true };
    } catch (error) {
      console.error('Failed to reset settings:', error);
      return { success: false, error: error.message };
    }
  },

});

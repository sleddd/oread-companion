import { loadTemplates, saveUserTemplate as saveUserTemplateAPI, deleteUserTemplate as deleteUserTemplateAPI, getTemplate as getTemplateAPI } from '../../utils/templateAPI';
import { mergeWithDefaults } from './settingsSlice';

export const createTemplateSlice = (set, get) => ({
  templates: [],

  // Apply a world by id. The templates list only carries { id, name, isUserTemplate },
  // so fetch the full world (with `.settings`) before applying. Pass null to clear.
  applyTemplate: async (template) => {
    if (!template) {
      const current = get().settings;
      get().setSettings({
        ...current,
        meta: {
          ...current.meta,
          templateId: null,
          isUserTemplate: false,
          lastModified: new Date().toISOString()
        }
      });
      return { success: true };
    }

    try {
      const full = await getTemplateAPI(template.id);
      const settings = full?.settings;
      if (!settings) throw new Error('Template has no settings');

      // oread-cli worlds carry a minimal shape (e.g. userPersona without
      // tastes/linguisticFilters). Merge onto defaults so every settings panel
      // has the full structure it expects.
      const merged = mergeWithDefaults(settings);

      get().setSettings({
        ...merged,
        meta: {
          ...merged.meta,
          templateId: template.id,
          isUserTemplate: template.isUserTemplate || false,
          lastModified: new Date().toISOString()
        }
      });
      return { success: true };
    } catch (error) {
      console.error('Failed to apply template:', error);
      return { success: false, error: error.message };
    }
  },

  saveAsTemplate: async (name, description) => {
    try {
      const settings = get().settings;
      const result = await saveUserTemplateAPI(name, description, settings);
      await get().fetchTemplates();

      if (result.template?.id) {
        get().setSettings({
          ...get().settings,
          meta: {
            ...get().settings.meta,
            templateId: result.template.id,
            isUserTemplate: true,
            lastModified: new Date().toISOString()
          }
        });
      }

      return { success: true };
    } catch (error) {
      console.error('Failed to save template:', error);
      return { success: false, error: error.message };
    }
  },

  deleteTemplate: async (id) => {
    try {
      await deleteUserTemplateAPI(id);
      await get().fetchTemplates();
      return { success: true };
    } catch (error) {
      console.error('Failed to delete template:', error);
      return { success: false, error: error.message };
    }
  },

  fetchTemplates: async () => {
    try {
      const templates = await loadTemplates();
      set({ templates });
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  },
});

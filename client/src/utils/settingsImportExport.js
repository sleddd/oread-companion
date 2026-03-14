// Settings import/export utility

import { validateSettings, sanitizeSettings } from './settingsValidation.js';

/**
 * Export settings to JSON file
 * @param {Object} settings - Settings object to export
 * @param {String} filename - Filename (default: 'ollama-chat-settings.json')
 */
export function exportSettings(settings, filename = 'ollama-chat-settings.json') {
  try {
    // Add metadata
    const exportData = {
      ...settings,
      meta: {
        ...settings.meta,
        exportedAt: new Date().toISOString(),
        version: '1.0.0'
      }
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return { success: true, message: 'Settings exported successfully' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Import settings from JSON file
 * @param {File} file - File object from input
 * @returns {Promise<Object>} { success: boolean, settings?: Object, error?: string }
 */
export function importSettings(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const jsonString = e.target.result;
        const settings = JSON.parse(jsonString);

        // Validate imported settings
        const validation = validateSettings(settings);
        if (!validation.valid) {
          resolve({
            success: false,
            error: `Invalid settings file: ${validation.errors.join(', ')}`
          });
          return;
        }

        // Sanitize settings
        const sanitized = sanitizeSettings(settings);

        resolve({
          success: true,
          settings: sanitized,
          message: 'Settings imported successfully'
        });
      } catch (error) {
        resolve({
          success: false,
          error: `Failed to parse settings file: ${error.message}`
        });
      }
    };

    reader.onerror = () => {
      resolve({
        success: false,
        error: 'Failed to read file'
      });
    };

    reader.readAsText(file);
  });
}

/**
 * Copy settings to clipboard as JSON
 * @param {Object} settings - Settings to copy
 * @returns {Promise<Object>} { success: boolean, message?: string, error?: string }
 */
export async function copySettingsToClipboard(settings) {
  try {
    const jsonString = JSON.stringify(settings, null, 2);
    await navigator.clipboard.writeText(jsonString);
    return { success: true, message: 'Settings copied to clipboard' };
  } catch (error) {
    return { success: false, error: 'Failed to copy to clipboard' };
  }
}



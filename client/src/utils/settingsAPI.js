// Backend API client for settings persistence

import { apiFetch } from './apiClient';

const API_BASE = '/api/settings';

export async function loadSettingsFromAPI() {
  try {
    const response = await apiFetch(API_BASE);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data.settings;
  } catch (error) {
    console.error('Error loading settings from API:', error);
    return null;
  }
}

export async function saveSettingsToAPI(settings) {
  try {
    const response = await apiFetch(API_BASE, {
      method: 'POST',
      body: JSON.stringify({ settings })
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data.settings;
  } catch (error) {
    console.error('Error saving settings to API:', error);
    throw error;
  }
}

export async function deleteSettingsFromAPI() {
  try {
    const response = await apiFetch(API_BASE, { method: 'DELETE' });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data.settings;
  } catch (error) {
    console.error('Error deleting settings from API:', error);
    throw error;
  }
}

export async function loadSettings() {
  try {
    const settings = await loadSettingsFromAPI();
    return { success: !!settings, settings };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function saveSettings(settings) {
  try {
    await saveSettingsToAPI(settings);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function deleteSettings() {
  try {
    const settings = await deleteSettingsFromAPI();
    return { success: true, settings };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

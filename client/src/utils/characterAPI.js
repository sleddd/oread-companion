// Character API client for loading and saving character files

import { apiFetch } from './apiClient';

export async function getAllCharacters() {
  try {
    const response = await apiFetch('/api/characters');
    const data = await response.json();
    if (data.success) return data.characters;
    console.error('❌ Failed to load characters:', data.error);
    return [];
  } catch (error) {
    console.error('❌ Error loading characters:', error);
    return [];
  }
}

export async function getAllDefaultCharacters() {
  try {
    const response = await apiFetch('/api/characters/defaults/all');
    const data = await response.json();
    if (data.success) return data.characters;
    console.error('❌ Failed to load default characters:', data.error);
    return [];
  } catch (error) {
    console.error('❌ Error loading default characters:', error);
    return [];
  }
}

export async function getCharacter(characterId) {
  try {
    const response = await apiFetch(`/api/characters/${characterId}`);
    const data = await response.json();
    if (data.success) return data.character;
    console.error(`❌ Failed to load character "${characterId}":`, data.error);
    return null;
  } catch (error) {
    console.error(`❌ Error loading character "${characterId}":`, error);
    return null;
  }
}

export async function getDefaultCharacter(characterId) {
  try {
    const response = await apiFetch(`/api/characters/defaults/${characterId}`);
    const data = await response.json();
    if (data.success) return data.character;
    console.error(`❌ Failed to load default character "${characterId}":`, data.error);
    return null;
  } catch (error) {
    console.error(`❌ Error loading default character "${characterId}":`, error);
    return null;
  }
}

export async function copyDefaultCharacterToUser(characterId) {
  try {
    const response = await apiFetch(`/api/characters/copy/${characterId}`, { method: 'POST' });
    const data = await response.json();
    if (data.success) return data.character;
    console.error(`❌ Failed to copy character "${characterId}":`, data.error);
    return null;
  } catch (error) {
    console.error(`❌ Error copying character "${characterId}":`, error);
    return null;
  }
}

export async function resetCharacterToDefault(characterId) {
  try {
    const response = await apiFetch(`/api/characters/reset/${characterId}`, { method: 'POST' });
    const data = await response.json();
    if (data.success) return data.character;
    console.error(`❌ Failed to reset character "${characterId}":`, data.error);
    return null;
  } catch (error) {
    console.error(`❌ Error resetting character "${characterId}":`, error);
    return null;
  }
}

export async function saveCharacter(characterId, characterData) {
  try {
    const response = await apiFetch(`/api/characters/${characterId}`, {
      method: 'POST',
      body: JSON.stringify({ character: characterData })
    });
    const data = await response.json();
    if (data.success) return data.character;
    console.error(`❌ Failed to save character "${characterId}":`, data.error);
    return null;
  } catch (error) {
    console.error(`❌ Error saving character "${characterId}":`, error);
    return null;
  }
}

export async function deleteCharacter(characterId) {
  try {
    const response = await apiFetch(`/api/characters/${characterId}`, { method: 'DELETE' });
    const data = await response.json();
    if (data.success) return true;
    console.error(`❌ Failed to delete character "${characterId}":`, data.error);
    return false;
  } catch (error) {
    console.error(`❌ Error deleting character "${characterId}":`, error);
    return false;
  }
}

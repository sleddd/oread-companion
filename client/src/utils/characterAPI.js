// Character API client for loading and saving user character files

import { apiFetch } from './apiClient';

export async function getAllCharacters() {
  try {
    const response = await apiFetch('/api/characters');
    const data = await response.json();
    if (data.success) return data.characters;
    console.error('Failed to load characters:', data.error);
    return [];
  } catch (error) {
    console.error('Error loading characters:', error);
    return [];
  }
}

export async function getCharacter(characterId) {
  try {
    const response = await apiFetch(`/api/characters/${characterId}`);
    const data = await response.json();
    if (data.success) return data.character;
    console.error(`Failed to load character "${characterId}":`, data.error);
    return null;
  } catch (error) {
    console.error(`Error loading character "${characterId}":`, error);
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
    console.error(`Failed to save character "${characterId}":`, data.error);
    return null;
  } catch (error) {
    console.error(`Error saving character "${characterId}":`, error);
    return null;
  }
}

export async function deleteCharacter(characterId) {
  try {
    const response = await apiFetch(`/api/characters/${characterId}`, { method: 'DELETE' });
    const data = await response.json();
    if (data.success) return true;
    console.error(`Failed to delete character "${characterId}":`, data.error);
    return false;
  } catch (error) {
    console.error(`Error deleting character "${characterId}":`, error);
    return false;
  }
}

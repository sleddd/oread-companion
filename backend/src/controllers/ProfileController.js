/**
 * Profile controller
 * Business logic for profile management
 */
import { getProfileStorage } from '../services/ProfileStorage.js';
import { getProfileCache } from '../services/ProfileCache.js';
import { InputSanitizer } from '../utils/sanitizer.js';

const storage = getProfileStorage();
const cache = getProfileCache();

export class ProfileController {
    /**
     * List all profiles
     */
    static async listProfiles() {
        // Check cache first
        const cached = cache.getProfileList();
        if (cached) {
            return cached;
        }

        const profiles = await storage.listProfiles();
        cache.setProfileList(profiles);
        return profiles;
    }

    /**
     * Get active profile name
     */
    static async getActiveProfile(encryptionKey = null) {
        return await storage.getActiveProfile(encryptionKey);
    }

    /**
     * Set active profile
     */
    static async setActiveProfile(profileName, encryptionKey = null) {
        const sanitizedName = InputSanitizer.sanitizeProfileName(profileName);

        // Verify profile exists
        const exists = await storage.profileExists(sanitizedName);
        if (!exists) {
            throw new Error(`Profile '${sanitizedName}' not found`);
        }

        // Save active profile
        await storage.setActiveProfile(sanitizedName, encryptionKey);

        // Invalidate cache
        cache.invalidateUserSettings();

        // NOTE: Do NOT reload character in all sessions
        // The "active profile" is only the default for NEW sessions
        // Existing sessions should keep their own character selection

        return sanitizedName;
    }

    /**
     * Get profile data
     */
    static async getProfile(profileName, encryptionKey = null) {
        const sanitizedName = InputSanitizer.sanitizeProfileName(profileName);
        return await storage.getProfile(sanitizedName, encryptionKey);
    }

    /**
     * Save profile data
     */
    static async saveProfile(profileName, profileData, encryptionKey = null) {
        const sanitizedName = InputSanitizer.sanitizeProfileName(profileName);
        await storage.saveProfile(sanitizedName, profileData, encryptionKey);

        // Invalidate profile list cache (in case it's a new profile)
        cache.invalidateProfileList();
    }

    /**
     * Delete profile
     */
    static async deleteProfile(profileName) {
        const sanitizedName = InputSanitizer.sanitizeProfileName(profileName);
        await storage.deleteProfile(sanitizedName);

        // Invalidate cache
        cache.invalidateProfileList();
    }

    /**
     * Get user settings
     */
    static async getUserSettings(encryptionKey = null) {
        // Check cache first - but only use cache if we have the same encryption state
        // (Don't return cached unencrypted data when we now have an encryption key)
        const cached = cache.getUserSettings();
        const cachedWithoutKey = cached && cached.userName === 'User'; // Default values indicate no decryption
        const shouldSkipCache = cachedWithoutKey && encryptionKey; // Skip cache if we have a key but cache has defaults

        if (cached && !shouldSkipCache) {
            return cached;
        }

        const data = await storage.getUserSettings(encryptionKey);

        // Transform full data structure to flat format for API consumers
        const settings = {
            userName: data.user?.name || 'User',
            userGender: data.user?.gender || 'non-binary',
            userSpecies: data.user?.species || 'human',
            timezone: data.user?.timezone || 'UTC',
            userBackstory: data.user?.backstory || '',
            communicationBoundaries: data.user?.communicationBoundaries || '',
            userPreferences: data.user?.preferences || { music: [], books: [], movies: [], hobbies: [], other: '' },
            majorLifeEvents: data.user?.majorLifeEvents || [],
            sharedRoleplayEvents: data.sharedMemory?.roleplayEvents || [],
            enableMemory: data.settings?.enableMemory || false,
            enableWebSearch: data.settings?.enableWebSearch || false,
            webSearchApiKey: data.settings?.webSearchApiKey || '',
            defaultActiveCharacter: data.settings?.defaultActiveCharacter || null
        };

        cache.setUserSettings(settings);
        return settings;
    }

    /**
     * Save user settings
     */
    static async saveUserSettings(settings, encryptionKey = null) {
        await storage.saveUserSettings(settings, encryptionKey);

        // Invalidate cache
        cache.invalidateUserSettings();
    }

    /**
     * Get avatar for profile
     */
    static async getAvatar(profileName) {
        const sanitizedName = InputSanitizer.sanitizeProfileName(profileName);
        return await storage.getAvatar(sanitizedName);
    }

    /**
     * Get consent data
     */
    static async getConsent(encryptionKey = null) {
        return await storage.getConsent(encryptionKey);
    }

    /**
     * Save consent data
     */
    static async saveConsent(consentData, encryptionKey = null) {
        await storage.saveConsent(consentData, encryptionKey);
    }

    /**
     * Get favorites for a character
     */
    static async getFavorites(profileName, encryptionKey = null) {
        const sanitizedName = InputSanitizer.sanitizeProfileName(profileName);
        return await storage.getFavorites(sanitizedName, encryptionKey);
    }

    /**
     * Add a favorite to a character
     */
    static async addFavorite(profileName, favorite, encryptionKey = null) {
        const sanitizedName = InputSanitizer.sanitizeProfileName(profileName);
        const result = await storage.addFavorite(sanitizedName, favorite, encryptionKey);

        // Invalidate profile cache
        cache.invalidateProfileList();

        return result;
    }

    /**
     * Remove a favorite from a character
     */
    static async removeFavorite(profileName, favoriteId, encryptionKey = null) {
        const sanitizedName = InputSanitizer.sanitizeProfileName(profileName);
        await storage.removeFavorite(sanitizedName, favoriteId, encryptionKey);

        // Invalidate profile cache
        cache.invalidateProfileList();
    }
}

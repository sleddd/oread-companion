// Default settings structure for the application

export const DEFAULT_SETTINGS = {
  mode: 'roleplay', // 'roleplay' or 'normal'

  roleplay: {
    world: {
      settingLore: '',
      openingScene: '',
      narratorVoice: 'companion',
      hardRules: []
    },
    characterMode: 'single', // 'single' or 'multi'
    singleCharacterRef: 'echo', // Reference to character file ID
    multipleCharacterRefs: [], // Array of character file IDs
    character: null // Inline character data (from template)
  },

  utility: {
    assistantIdentity: {
      persona: '',
      communicationStyle: ''
    },
    guardrails: {
      negativeConstraints: '',
      formattingPreferences: ''
    }
  },

  userPersona: {
    name: '',
    bio: '',
    skills: '',
    profession: '',
    timezone: 'America/Los_Angeles', // Default timezone
    tastes: {
      interests: '',
      hobbies: '',
      mediaPreferences: ''
    },
    linguisticFilters: {
      bannedPhrases: [],
      bannedWords: []
    },
    boundaries: ''
  },

  general: {
    selectedModel: null,
    webSearch: false,
    chatSearch: false,
    memory: true,
    temperature: 0.8,
    topP: 0.9,
    maxTokens: 2048
  },

  meta: {
    templateId: null,
    lastModified: null,
    version: '1.0.0'
  }
};

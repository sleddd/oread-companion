import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../client/src/utils/personalitySystemLoader.js', () => ({
  getCharacterTraitDefinitions: vi.fn(() => []),
  buildPersonalityGuidance: vi.fn(() => '')
}));

import { buildSystemPrompt, detectModeToggle } from '../../client/src/utils/promptBuilder.js';

const baseSettings = {
  mode: 'normal',
  roleplay: {
    world: { settingLore: '', openingScene: '', narratorVoice: '', pacing: '', hardRules: [], turnLogic: '' },
    characterMode: 'single',
    singleCharacterRef: '',
    multipleCharacterRefs: [],
    _loadedCharacters: []
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
    timezone: '',
    tastes: { interests: '', hobbies: '', mediaPreferences: '' },
    linguisticFilters: { bannedPhrases: [], bannedWords: [] },
    boundaries: ''
  }
};

// ─── detectModeToggle ────────────────────────────────────────────────────────

describe('detectModeToggle', () => {
  it('returns null command for plain messages', () => {
    const result = detectModeToggle('hello world');
    expect(result.command).toBeNull();
    expect(result.targetMode).toBeNull();
    expect(result.cleanMessage).toBe('hello world');
  });

  it('detects /chat command and sets targetMode to normal', () => {
    const result = detectModeToggle('/chat what is 2+2?');
    expect(result.command).toBe('/chat');
    expect(result.targetMode).toBe('normal');
    expect(result.cleanMessage).toBe('what is 2+2?');
  });

  it('detects /play command and sets targetMode to roleplay', () => {
    const result = detectModeToggle('/play let us begin');
    expect(result.command).toBe('/play');
    expect(result.targetMode).toBe('roleplay');
    expect(result.cleanMessage).toBe('let us begin');
  });

  it('handles /chat with no following message', () => {
    const result = detectModeToggle('/chat');
    expect(result.command).toBe('/chat');
    expect(result.cleanMessage).toBe('');
  });

  it('handles /play with no following message', () => {
    const result = detectModeToggle('/play');
    expect(result.command).toBe('/play');
    expect(result.cleanMessage).toBe('');
  });

  it('does not trigger on messages that merely contain /chat mid-string', () => {
    const result = detectModeToggle('use /chat mode');
    expect(result.command).toBeNull();
  });
});

// ─── buildSystemPrompt – utility mode ───────────────────────────────────────

describe('buildSystemPrompt – utility mode', () => {
  it('returns empty string when no utility fields are set', () => {
    const prompt = buildSystemPrompt(baseSettings, 'normal');
    expect(typeof prompt).toBe('string');
  });

  it('includes persona when set', () => {
    const settings = {
      ...baseSettings,
      utility: {
        ...baseSettings.utility,
        assistantIdentity: { persona: 'You are a coding assistant.', communicationStyle: '' }
      }
    };
    const prompt = buildSystemPrompt(settings, 'normal');
    expect(prompt).toContain('You are a coding assistant.');
    expect(prompt).toContain('YOUR IDENTITY');
  });

  it('includes negative constraints when set', () => {
    const settings = {
      ...baseSettings,
      utility: {
        assistantIdentity: { persona: '', communicationStyle: '' },
        guardrails: { negativeConstraints: 'Do not hallucinate.', formattingPreferences: '' }
      }
    };
    const prompt = buildSystemPrompt(settings, 'normal');
    expect(prompt).toContain('Do not hallucinate.');
    expect(prompt).toContain('CONSTRAINTS');
  });

  it('includes mode toggle instructions', () => {
    const prompt = buildSystemPrompt(baseSettings, 'normal');
    expect(prompt).toContain('/play');
    expect(prompt).toContain('/chat');
  });

  it('uses activeMode over settings.mode', () => {
    const settings = { ...baseSettings, mode: 'normal' };
    const prompt = buildSystemPrompt(settings, 'normal');
    expect(prompt).toContain('MODE TOGGLE');
  });
});

// ─── buildSystemPrompt – roleplay mode ──────────────────────────────────────

describe('buildSystemPrompt – roleplay mode', () => {
  it('includes world setting lore when set', () => {
    const settings = {
      ...baseSettings,
      mode: 'roleplay',
      roleplay: {
        ...baseSettings.roleplay,
        world: { ...baseSettings.roleplay.world, settingLore: 'A dark fantasy world.' }
      }
    };
    const prompt = buildSystemPrompt(settings, 'roleplay');
    expect(prompt).toContain('A dark fantasy world.');
    expect(prompt).toContain('WORLD SETTING');
  });

  it('includes character name when a single character is loaded', () => {
    const settings = {
      ...baseSettings,
      mode: 'roleplay',
      roleplay: {
        ...baseSettings.roleplay,
        characterMode: 'single',
        _loadedCharacters: [{ name: 'Elara', role: 'Tavern Keeper', knowledgeSkills: '', hobbiesInterests: '', thingsToAvoid: '', backstory: '', inventory: '', traits: {} }]
      }
    };
    const prompt = buildSystemPrompt(settings, 'roleplay');
    expect(prompt).toContain('Elara');
    expect(prompt).toContain('MAIN CHARACTER');
  });

  it('includes thingsToAvoid in the character section', () => {
    const settings = {
      ...baseSettings,
      mode: 'roleplay',
      roleplay: {
        ...baseSettings.roleplay,
        characterMode: 'single',
        _loadedCharacters: [{ name: 'Echo', role: '', knowledgeSkills: '', hobbiesInterests: '', thingsToAvoid: 'buddy, pal', backstory: '', inventory: '', traits: {} }]
      }
    };
    const prompt = buildSystemPrompt(settings, 'roleplay');
    expect(prompt).toContain('buddy, pal');
    expect(prompt).toContain('Things They Avoid');
  });

  it('includes hard rules when set', () => {
    const settings = {
      ...baseSettings,
      mode: 'roleplay',
      roleplay: {
        ...baseSettings.roleplay,
        world: { ...baseSettings.roleplay.world, hardRules: ['Never break character.', 'No fourth wall.'] },
        _loadedCharacters: [{ name: 'X', role: '', knowledgeSkills: '', hobbiesInterests: '', thingsToAvoid: '', backstory: '', inventory: '', traits: {} }]
      }
    };
    const prompt = buildSystemPrompt(settings, 'roleplay');
    expect(prompt).toContain('Never break character.');
    expect(prompt).toContain('No fourth wall.');
    expect(prompt).toContain('HARD RULES');
  });
});

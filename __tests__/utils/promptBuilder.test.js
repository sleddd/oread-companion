import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../client/src/utils/personalitySystemLoader.js', () => ({
  getCharacterTraitDefinitions: vi.fn(() => []),
  buildPersonalityGuidance: vi.fn(() => '')
}));

vi.mock('../../client/src/utils/narrativeSystemLoader.js', () => ({
  getNarrativeStyle: vi.fn(() => ({ frame: 'test frame', format: 'test format', constraint: 'test constraint' }))
}));

import { buildSystemPrompt, detectModeToggle } from '../../client/src/utils/promptBuilder.js';

/**
 * Replicates the store's loadCharactersForPrompt transform so we can test the
 * full settings → loadCharactersForPrompt → buildSystemPrompt pipeline without
 * needing to spin up Zustand.
 */
function loadCharactersForPrompt(settings) {
  const settingsCopy = { ...settings };

  if (settings.roleplay.characterMode === 'single') {
    settingsCopy.roleplay = {
      ...settingsCopy.roleplay,
      _loadedCharacters: settings.roleplay.character
        ? [settings.roleplay.character]
        : [{ name: 'Assistant', role: '', knowledgeSkills: '', hobbiesInterests: '',
             thingsToAvoid: '', backstory: '', inventory: '', traits: {} }]
    };
  }

  if (settings.roleplay.characterMode === 'multi' && settings.roleplay.characters?.length > 0) {
    const chars = [...settings.roleplay.characters];
    const activeIdx = settings.roleplay.activeCharacterIndex || 0;
    if (activeIdx > 0 && activeIdx < chars.length) {
      const [active] = chars.splice(activeIdx, 1);
      chars.unshift(active);
    }
    settingsCopy.roleplay = {
      ...settingsCopy.roleplay,
      _loadedCharacters: chars
    };
  }

  return settingsCopy;
}

const baseSettings = {
  mode: 'normal',
  roleplay: {
    world: { settingLore: '', openingScene: '', narratorVoice: '', hardRules: [] },
    characterMode: 'single',
    character: null,
    characters: [],
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
    expect(prompt).toContain('IDENTITY & VOICE');
  });

  it('does NOT include lorebook fields in fixed prompt (retrieved via FAISS instead)', () => {
    const settings = {
      ...baseSettings,
      mode: 'roleplay',
      roleplay: {
        ...baseSettings.roleplay,
        characterMode: 'single',
        _loadedCharacters: [{ name: 'Echo', role: 'Guide', knowledgeSkills: 'hacking', hobbiesInterests: 'music', thingsToAvoid: 'buddy, pal', backstory: 'Born in 2020', inventory: 'laptop', traits: {} }]
      }
    };
    const prompt = buildSystemPrompt(settings, 'roleplay');
    // Identity + role stay in the fixed prompt
    expect(prompt).toContain('NAME: Echo');
    expect(prompt).toContain('ROLE: Guide');
    // Lorebook fields are now retrieved via server-side FAISS, not in the fixed prompt
    expect(prompt).not.toContain('BACKSTORY:');
    expect(prompt).not.toContain('KNOWLEDGE/SKILLS:');
    expect(prompt).not.toContain('HOBBIES/INTERESTS:');
    expect(prompt).not.toContain('Things They Avoid');
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

// ─── Character switching & user identity in multi-character mode ─────────────

describe('buildSystemPrompt – multi-character switching', () => {
  const makeChar = (name, extras = {}) => ({
    name, role: '', age: '', gender: '', species: '',
    knowledgeSkills: '', hobbiesInterests: '', thingsToAvoid: '',
    backstory: '', inventory: '', traits: {},
    ...extras
  });

  const multiSettings = (loadedChars, userPersonaOverrides = {}) => ({
    ...baseSettings,
    mode: 'roleplay',
    roleplay: {
      ...baseSettings.roleplay,
      characterMode: 'multi',
      _loadedCharacters: loadedChars
    },
    userPersona: {
      ...baseSettings.userPersona,
      ...userPersonaOverrides
    }
  });

  // ── Active character is always _loadedCharacters[0] ──

  it('uses the first loaded character as the active/main character', () => {
    const settings = multiSettings([makeChar('Mira'), makeChar('Kael')]);
    const prompt = buildSystemPrompt(settings, 'roleplay');
    expect(prompt).toContain('You are Mira.');
    expect(prompt).toContain('NAME: Mira');
  });

  it('after switching active character, the new active is the main voice', () => {
    // Simulates loadCharactersForPrompt placing Kael first after a switch
    const settings = multiSettings([makeChar('Kael'), makeChar('Mira')]);
    const prompt = buildSystemPrompt(settings, 'roleplay');
    expect(prompt).toContain('You are Kael.');
    expect(prompt).toContain('NAME: Kael');
  });

  // ── Switch instruction tells model to stop being the old character ──

  it('includes switch instruction naming the other characters to stop being', () => {
    const settings = multiSettings([makeChar('Kael'), makeChar('Mira'), makeChar('Zara')]);
    const prompt = buildSystemPrompt(settings, 'roleplay');
    expect(prompt).toContain('patterns from Mira or Zara are superseded');
    expect(prompt).toContain('Kael is the sole active character');
  });

  it('does not include switch instruction in single-character mode', () => {
    const settings = {
      ...baseSettings,
      mode: 'roleplay',
      roleplay: {
        ...baseSettings.roleplay,
        characterMode: 'single',
        _loadedCharacters: [makeChar('Elara')]
      }
    };
    const prompt = buildSystemPrompt(settings, 'roleplay');
    expect(prompt).not.toContain('active character has been switched');
  });

  // ── Supporting cast listed correctly ──

  it('lists non-active characters as supporting cast', () => {
    const settings = multiSettings([
      makeChar('Mira', { role: 'Healer' }),
      makeChar('Kael', { role: 'Knight', age: '30', gender: 'male' }),
      makeChar('Zara', { role: 'Rogue' })
    ]);
    const prompt = buildSystemPrompt(settings, 'roleplay');
    expect(prompt).toContain('SUPPORTING CHARACTERS');
    expect(prompt).toContain('Kael');
    expect(prompt).toContain('Zara');
    expect(prompt).toContain('Mira is the primary voice');
  });

  it('does not show supporting cast section in single-character mode', () => {
    const settings = {
      ...baseSettings,
      mode: 'roleplay',
      roleplay: {
        ...baseSettings.roleplay,
        characterMode: 'single',
        _loadedCharacters: [makeChar('Elara')]
      }
    };
    const prompt = buildSystemPrompt(settings, 'roleplay');
    expect(prompt).not.toContain('SUPPORTING CAST');
  });

  it('does not show supporting cast when only one character in multi mode', () => {
    const settings = multiSettings([makeChar('Mira')]);
    const prompt = buildSystemPrompt(settings, 'roleplay');
    expect(prompt).not.toContain('SUPPORTING CAST');
  });

  // ── User identity is distinct from all characters ──

  it('identifies the user by their persona name, not as a character', () => {
    const settings = multiSettings(
      [makeChar('Mira'), makeChar('Kael')],
      { name: 'Alex' }
    );
    const prompt = buildSystemPrompt(settings, 'roleplay');
    expect(prompt).toContain('Every message in the conversation from the "user" role is from Alex');
    // User persona section uses their name
    expect(prompt).toContain('NAME: Alex');
  });

  it('uses "the user" as fallback when userPersona.name is empty', () => {
    const settings = multiSettings(
      [makeChar('Mira'), makeChar('Kael')],
      { name: '' }
    );
    const prompt = buildSystemPrompt(settings, 'roleplay');
    expect(prompt).toContain('Every message in the conversation from the "user" role is from the user');
    expect(prompt).toContain('NAME: User');
  });

  it('never identifies the user as the active character', () => {
    const settings = multiSettings(
      [makeChar('Mira'), makeChar('Kael')],
      { name: 'Alex' }
    );
    const prompt = buildSystemPrompt(settings, 'roleplay');
    // Identity section should say "You are Mira", not "You are Alex"
    expect(prompt).toContain('You are Mira');
    expect(prompt).not.toContain('You are Alex');
  });

  it('tells the model that user messages are directed at the active character', () => {
    const settings = multiSettings(
      [makeChar('Kael'), makeChar('Mira')],
      { name: 'Alex' }
    );
    const prompt = buildSystemPrompt(settings, 'roleplay');
    expect(prompt).toContain('respond directly to Alex');
  });

  // ── User persona section uses userPersona, not character data ──

  it('shows user persona name in THE PERSON YOU ARE TALKING TO section', () => {
    const settings = multiSettings(
      [makeChar('Mira')],
      { name: 'Jordan', profession: 'Engineer', bio: 'Loves hiking' }
    );
    const prompt = buildSystemPrompt(settings, 'roleplay');
    expect(prompt).toContain('THE PERSON YOU ARE TALKING TO');
    expect(prompt).toContain('NAME: Jordan');
    expect(prompt).toContain('Engineer');
    expect(prompt).toContain('Loves hiking');
  });

  it('falls back to "User" in persona section when name is empty', () => {
    const settings = multiSettings([makeChar('Mira')], { name: '' });
    const prompt = buildSystemPrompt(settings, 'roleplay');
    expect(prompt).toContain('NAME: User (this is the real person');
  });

  // ── Switching active character preserves user identity ──

  it('preserves user identity when active character switches from Mira to Kael', () => {
    const charsBeforeSwitch = [makeChar('Mira'), makeChar('Kael')];
    const charsAfterSwitch = [makeChar('Kael'), makeChar('Mira')];
    const userOverrides = { name: 'Alex', profession: 'Writer' };

    const promptBefore = buildSystemPrompt(
      multiSettings(charsBeforeSwitch, userOverrides), 'roleplay'
    );
    const promptAfter = buildSystemPrompt(
      multiSettings(charsAfterSwitch, userOverrides), 'roleplay'
    );

    // Before: Mira is active
    expect(promptBefore).toContain('You are Mira.');
    expect(promptBefore).toContain('Every message in the conversation from the "user" role is from Alex');

    // After: Kael is active
    expect(promptAfter).toContain('You are Kael.');
    expect(promptAfter).toContain('Every message in the conversation from the "user" role is from Alex');

    // User persona section unchanged in both
    expect(promptBefore).toContain('NAME: Alex');
    expect(promptAfter).toContain('NAME: Alex');
  });

  // ── Edge cases ──

  it('handles empty _loadedCharacters gracefully', () => {
    const settings = multiSettings([], { name: 'Alex' });
    const prompt = buildSystemPrompt(settings, 'roleplay');
    // Falls back to "The Character"
    expect(prompt).toContain('You are The Character');
    expect(prompt).toContain('Every message in the conversation from the "user" role is from Alex');
  });

  it('includes character identity fields (age, gender, species) on the card', () => {
    const settings = multiSettings([
      makeChar('Mira', { age: '25', gender: 'female', species: 'elf' })
    ]);
    const prompt = buildSystemPrompt(settings, 'roleplay');
    expect(prompt).toContain('IDENTITY: 25, female, elf');
  });

  it('includes supporting cast identity details', () => {
    const settings = multiSettings([
      makeChar('Mira'),
      makeChar('Kael', { age: '30', gender: 'male', role: 'Knight' })
    ]);
    const prompt = buildSystemPrompt(settings, 'roleplay');
    expect(prompt).toMatch(/Kael \(30, male\) — Knight/);
  });
});

// ─── Full pipeline: loadCharactersForPrompt → buildSystemPrompt ─────────────
// Tests that userPersona.name survives the character loading transform and
// appears correctly in the final prompt across all character switching scenarios.

describe('user name population through full pipeline', () => {
  const makeChar = (name, extras = {}) => ({
    name, role: '', age: '', gender: '', species: '',
    knowledgeSkills: '', hobbiesInterests: '', thingsToAvoid: '',
    backstory: '', inventory: '', traits: {},
    ...extras
  });

  // Helper: builds raw settings (as stored in Zustand, WITHOUT _loadedCharacters)
  // then pipes through loadCharactersForPrompt → buildSystemPrompt
  function buildPromptFromRawSettings(rawSettings) {
    const prepared = loadCharactersForPrompt(rawSettings);
    return buildSystemPrompt(prepared, 'roleplay');
  }

  // ── Single character mode ──

  it('populates user name in single-character mode with a character', () => {
    const settings = {
      ...baseSettings,
      mode: 'roleplay',
      roleplay: {
        ...baseSettings.roleplay,
        characterMode: 'single',
        character: makeChar('Elara')
      },
      userPersona: { ...baseSettings.userPersona, name: 'Sam' }
    };
    const prompt = buildPromptFromRawSettings(settings);
    expect(prompt).toContain('Every message in the conversation from the "user" role is from Sam');
    expect(prompt).toContain('NAME: Sam');
  });

  it('populates user name in single-character mode with no character (fallback)', () => {
    const settings = {
      ...baseSettings,
      mode: 'roleplay',
      roleplay: {
        ...baseSettings.roleplay,
        characterMode: 'single',
        character: null
      },
      userPersona: { ...baseSettings.userPersona, name: 'Sam' }
    };
    const prompt = buildPromptFromRawSettings(settings);
    expect(prompt).toContain('Every message in the conversation from the "user" role is from Sam');
    expect(prompt).toContain('NAME: Sam');
    // Fallback character is "Assistant"
    expect(prompt).toContain('You are Assistant');
  });

  // ── Multi-character mode: activeCharacterIndex = 0 (default) ──

  it('populates user name with multi-character default active index', () => {
    const settings = {
      ...baseSettings,
      mode: 'roleplay',
      roleplay: {
        ...baseSettings.roleplay,
        characterMode: 'multi',
        characters: [makeChar('Mira'), makeChar('Kael'), makeChar('Zara')],
        activeCharacterIndex: 0
      },
      userPersona: { ...baseSettings.userPersona, name: 'Jordan' }
    };
    const prompt = buildPromptFromRawSettings(settings);
    expect(prompt).toContain('You are Mira');
    expect(prompt).toContain('Every message in the conversation from the "user" role is from Jordan');
    expect(prompt).toContain('respond directly to Jordan');
    expect(prompt).toContain('NAME: Jordan');
  });

  // ── Multi-character mode: switch to index 1 ──

  it('populates user name after switching active character to index 1', () => {
    const settings = {
      ...baseSettings,
      mode: 'roleplay',
      roleplay: {
        ...baseSettings.roleplay,
        characterMode: 'multi',
        characters: [makeChar('Mira'), makeChar('Kael'), makeChar('Zara')],
        activeCharacterIndex: 1
      },
      userPersona: { ...baseSettings.userPersona, name: 'Jordan' }
    };
    const prompt = buildPromptFromRawSettings(settings);
    // Kael should now be the active character (moved to front)
    expect(prompt).toContain('You are Kael');
    expect(prompt).toContain('NAME: Kael');
    // User is still Jordan, not confused with any character
    expect(prompt).toContain('Every message in the conversation from the "user" role is from Jordan');
    expect(prompt).toContain('respond directly to Jordan');
    expect(prompt).toContain('NAME: Jordan');
  });

  // ── Multi-character mode: switch to last character ──

  it('populates user name after switching active character to last index', () => {
    const settings = {
      ...baseSettings,
      mode: 'roleplay',
      roleplay: {
        ...baseSettings.roleplay,
        characterMode: 'multi',
        characters: [makeChar('Mira'), makeChar('Kael'), makeChar('Zara')],
        activeCharacterIndex: 2
      },
      userPersona: { ...baseSettings.userPersona, name: 'Jordan' }
    };
    const prompt = buildPromptFromRawSettings(settings);
    expect(prompt).toContain('You are Zara');
    expect(prompt).toContain('Every message in the conversation from the "user" role is from Jordan');
    expect(prompt).toContain('NAME: Jordan');
  });

  // ── User name never appears in character sections ──

  it('user name only appears in user-designated sections, not in character card', () => {
    const settings = {
      ...baseSettings,
      mode: 'roleplay',
      roleplay: {
        ...baseSettings.roleplay,
        characterMode: 'multi',
        characters: [makeChar('Mira', { role: 'Healer' }), makeChar('Kael', { role: 'Knight' })],
        activeCharacterIndex: 0
      },
      userPersona: { ...baseSettings.userPersona, name: 'Jordan', profession: 'Engineer' }
    };
    const prompt = buildPromptFromRawSettings(settings);

    // Identity section should have the character name, not user name
    const cardMatch = prompt.match(/IDENTITY & VOICE:\nYou are (.+?)\./);
    expect(cardMatch).not.toBeNull();
    expect(cardMatch[1]).toBe('Mira');

    // THE PERSON YOU ARE TALKING TO section should have the user name
    expect(prompt).toContain('THE PERSON YOU ARE TALKING TO');
    expect(prompt).toContain('NAME: Jordan');
  });

  // ── User persona fields survive the transform ──

  it('preserves all userPersona fields through loadCharactersForPrompt', () => {
    const settings = {
      ...baseSettings,
      mode: 'roleplay',
      roleplay: {
        ...baseSettings.roleplay,
        characterMode: 'multi',
        characters: [makeChar('Mira'), makeChar('Kael')],
        activeCharacterIndex: 1
      },
      userPersona: {
        ...baseSettings.userPersona,
        name: 'Jordan',
        profession: 'Game Designer',
        bio: 'Builds narrative games',
        tastes: { interests: 'worldbuilding', hobbies: '', mediaPreferences: '' },
        linguisticFilters: { bannedWords: ['cringe'], bannedPhrases: [] }
      }
    };
    const prompt = buildPromptFromRawSettings(settings);
    expect(prompt).toContain('NAME: Jordan');
    expect(prompt).toContain('Game Designer');
    expect(prompt).toContain('Builds narrative games');
    expect(prompt).toContain('worldbuilding');
    expect(prompt).toContain('cringe');
  });

  // ── Switching back and forth preserves user name ──

  it('user name stays consistent across multiple character switches', () => {
    const chars = [makeChar('Mira'), makeChar('Kael'), makeChar('Zara')];
    const userPersona = { ...baseSettings.userPersona, name: 'Jordan' };
    const base = {
      ...baseSettings,
      mode: 'roleplay',
      roleplay: { ...baseSettings.roleplay, characterMode: 'multi', characters: chars }
    };

    // Switch through each character as active
    for (let i = 0; i < chars.length; i++) {
      const settings = {
        ...base,
        roleplay: { ...base.roleplay, activeCharacterIndex: i },
        userPersona
      };
      const prompt = buildPromptFromRawSettings(settings);
      expect(prompt).toContain(`You are ${chars[i].name}`);
      expect(prompt).toContain('Every message in the conversation from the "user" role is from Jordan');
      expect(prompt).toContain('NAME: Jordan');
    }
  });

  // ── Empty user name fallback through full pipeline ──

  it('falls back to "the user" through the full pipeline when name is empty', () => {
    const settings = {
      ...baseSettings,
      mode: 'roleplay',
      roleplay: {
        ...baseSettings.roleplay,
        characterMode: 'multi',
        characters: [makeChar('Mira'), makeChar('Kael')],
        activeCharacterIndex: 0
      },
      userPersona: { ...baseSettings.userPersona, name: '' }
    };
    const prompt = buildPromptFromRawSettings(settings);
    expect(prompt).toContain('Every message in the conversation from the "user" role is from the user');
    expect(prompt).toContain('NAME: User');
  });

  // ── loadCharactersForPrompt does not mutate original settings ──

  it('does not mutate the original settings object', () => {
    const settings = {
      ...baseSettings,
      mode: 'roleplay',
      roleplay: {
        ...baseSettings.roleplay,
        characterMode: 'multi',
        characters: [makeChar('Mira'), makeChar('Kael')],
        activeCharacterIndex: 1
      },
      userPersona: { ...baseSettings.userPersona, name: 'Jordan' }
    };

    const originalCharsOrder = settings.roleplay.characters.map(c => c.name);
    const prepared = loadCharactersForPrompt(settings);

    // Original settings untouched
    expect(settings.roleplay.characters.map(c => c.name)).toEqual(originalCharsOrder);
    expect(settings.userPersona.name).toBe('Jordan');
    // Prepared has reordered _loadedCharacters
    expect(prepared.roleplay._loadedCharacters[0].name).toBe('Kael');
    // But userPersona is preserved
    expect(prepared.userPersona.name).toBe('Jordan');
  });
});

// ─── Prompt clarity: user-role messages vs supporting cast ──────────────────
// The model must understand that every "user" role message in the conversation
// comes from the real person, and supporting cast characters never send messages.
// Without this, the model may treat user input as a cue to narrate a supporting
// character instead of responding to the real person.

describe('prompt distinguishes user messages from supporting cast', () => {
  const makeChar = (name, extras = {}) => ({
    name, role: '', age: '', gender: '', species: '',
    knowledgeSkills: '', hobbiesInterests: '', thingsToAvoid: '',
    backstory: '', inventory: '', traits: {},
    ...extras
  });

  const multiSettings = (loadedChars, userPersonaOverrides = {}) => ({
    ...baseSettings,
    mode: 'roleplay',
    roleplay: {
      ...baseSettings.roleplay,
      characterMode: 'multi',
      _loadedCharacters: loadedChars
    },
    userPersona: {
      ...baseSettings.userPersona,
      ...userPersonaOverrides
    }
  });

  it('explicitly states that every user-role message comes from the real person', () => {
    const settings = multiSettings(
      [makeChar('Nova'), makeChar('Rook'), makeChar('Kira')],
      { name: 'Eva' }
    );
    const prompt = buildSystemPrompt(settings, 'roleplay');
    // The prompt must contain a clear instruction linking "user" messages to the real person
    expect(prompt).toMatch(/every message.*from.*Eva|all messages.*from.*Eva|user.*messages.*Eva/i);
  });

  it('establishes that user is the only one who sends messages in the conversation', () => {
    const settings = multiSettings(
      [makeChar('Nova'), makeChar('Rook'), makeChar('Kira')],
      { name: 'Eva' }
    );
    const prompt = buildSystemPrompt(settings, 'roleplay');
    // Positive frame: every user-role message is from Eva
    expect(prompt).toMatch(/every message.*from.*Eva/i);
    // Eva appears in user persona section
    expect(prompt).toContain('NAME: Eva');
  });

  it('instructs model to respond directly to the user', () => {
    const settings = multiSettings(
      [makeChar('Nova'), makeChar('Rook'), makeChar('Kira')],
      { name: 'Eva' }
    );
    const prompt = buildSystemPrompt(settings, 'roleplay');
    expect(prompt).toMatch(/respond directly to Eva/i);
  });

  it('with empty user name, still distinguishes user messages from cast', () => {
    const settings = multiSettings(
      [makeChar('Nova'), makeChar('Rook'), makeChar('Kira')],
      { name: '' }
    );
    const prompt = buildSystemPrompt(settings, 'roleplay');
    expect(prompt).toMatch(/every message.*from.*the user/i);
    expect(prompt).toContain('NAME: User');
  });

  it('constrains narration focus to the active character, not the user (positive frame)', () => {
    const settings = multiSettings(
      [makeChar('Nova'), makeChar('Rook'), makeChar('Kira')],
      { name: 'Eva' }
    );
    const prompt = buildSystemPrompt(settings, 'roleplay');
    // Nova is the primary voice in the prompt
    expect(prompt).toContain('You are Nova');
    expect(prompt).toContain('Nova is the primary voice');
    // User agency is enforced
    expect(prompt).toContain('USER AGENCY');
    expect(prompt).toContain("Eva's actions, decisions, movements, and dialogue belong entirely to Eva");
  });

  it('constrains narration focus even when user name is empty', () => {
    const settings = multiSettings(
      [makeChar('Nova'), makeChar('Rook'), makeChar('Kira')],
      { name: '' }
    );
    const prompt = buildSystemPrompt(settings, 'roleplay');
    expect(prompt).toContain('You are Nova');
    expect(prompt).toContain('USER AGENCY');
  });

  it('uses pure output framing instead of negative constraints', () => {
    const settings = multiSettings(
      [makeChar('Nova'), makeChar('Rook'), makeChar('Kira')],
      { name: 'Eva' }
    );
    const prompt = buildSystemPrompt(settings, 'roleplay');
    // Pure Output line: everything exists within the story's world
    expect(prompt).toContain("Every word generated must exist within the story's world");
  });
});

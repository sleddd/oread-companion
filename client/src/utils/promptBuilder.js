// System prompt builder — structured template format
// AUTO-GENERATED prompts - not shown to user

import { getCharacterTraitDefinitions, buildPersonalityGuidance } from './personalitySystemLoader.js';
import { getNarrativeStyle } from './narrativeSystemLoader.js';

/**
 * Build system prompt from settings
 */
export function buildSystemPrompt(settings, activeMode = null, isFirstMessage = false) {
  const mode = activeMode || settings.mode;

  if (mode === 'roleplay') {
    return buildRoleplayPrompt(settings, isFirstMessage);
  } else {
    return buildUtilityPrompt(settings);
  }
}

/**
 * Build roleplay mode system prompt using the Optimized "Discourse/Conduct" Template
 */
function buildRoleplayPrompt(settings, isFirstMessage) {
  const { roleplay, userPersona } = settings;
  const { world, characterMode, _loadedCharacters, userCustomContext } = roleplay;

  // 1. Resolve Character (Ensuring universal "The Character" framing)
  const mainCharacter = _loadedCharacters?.[0] || { name: 'The Character' };
  const identity = [mainCharacter.age, mainCharacter.gender, mainCharacter.species].filter(Boolean).join(', ');

  // 2. Resolve Narrative Style (default to companion)
  const narrativeStyle = getNarrativeStyle(world.narratorVoice || 'companion');

  // 3. Build Personality Traits (The Discourse/Conduct Engine)
  let traitsText = '';
  if (mainCharacter.traits) {
    const traitDefinitions = getCharacterTraitDefinitions(mainCharacter.traits);
    traitsText = buildPersonalityGuidance(traitDefinitions); 
    // Ensure buildPersonalityGuidance returns: "• Trait: [D: ...] [C: ...]"
  }

  // === ASSEMBLE TEMPLATE ===
  let prompt = '';

  prompt += `WORLD SETTING:\n${world.settingLore || 'Modern day, everyday life.'}\n\n`;

  // Opening scene only on the first message of a session
  if (isFirstMessage) {
    const baseOpening = 'Lead with YOUR energy. Share a specific hypothetical or "3 AM shower thought."';
    prompt += `OPENING SCENE:\n${world.openingScene || baseOpening}\n\n`;
  }

  prompt += `PERSONALITY EXECUTION PROTOCOL:\nYou are playing the character defined in the CHARACTER CARD. To maintain consistency, follow these two logic tracks for every response:\n\n`;
  prompt += `1. DISCOURSE: Your vocal texture. Use the Discourse field of active traits to guide word choice and tone.\n`;
  prompt += `2. CONDUCT: Your behavioral logic. Use the Conduct field to determine how you react and push the scene forward.\n\n`;

  if (narrativeStyle) {
    prompt += `NARRATIVE FORMATTING:\nApply style constraints strictly:\n`;
    prompt += `FRAME: ${narrativeStyle.frame}\nFORMAT: ${narrativeStyle.format}\nCONSTRAINT: ${narrativeStyle.constraint}\n\n`;
  }

  prompt += `CHARACTER CARD:\n`;
  prompt += `NAME: ${mainCharacter.name}\n`;
  if (identity) prompt += `IDENTITY: ${identity}\n`;
  if (mainCharacter.role) prompt += `ROLE: ${mainCharacter.role}\n`;
  if (mainCharacter.backstory) prompt += `BACKSTORY: ${mainCharacter.backstory}\n`;
  if (mainCharacter.knowledgeSkills) prompt += `KNOWLEDGE/SKILLS: ${mainCharacter.knowledgeSkills}\n`;
  if (mainCharacter.hobbiesInterests) prompt += `HOBBIES/INTERESTS: ${mainCharacter.hobbiesInterests}\n\n`;

  prompt += `PERSONALITY ENGINE (ACTIVE TRAITS):\nApply these logic tracks to all output:\n${traitsText}\n\n`;

  // Consolidate Filters into one block to avoid the "Avoid" vs "Filters" confusion
  const bannedWords = userPersona.linguisticFilters?.bannedWords || [];
  const bannedPhrases = userPersona.linguisticFilters?.bannedPhrases || [];
  
  prompt += `LINGUISTIC FILTERS (STRICT NEGATIVE CONSTRAINTS):\n`;
  if (bannedWords.length > 0) prompt += `BANNED WORDS: ${bannedWords.join(', ')}.\n`;
  if (bannedPhrases.length > 0) prompt += `BANNED PHRASES: ${bannedPhrases.join(', ')}.\n`;
  prompt += `FORMATTING BANS: NO asterisks for actions. Use parenthetical emotes only. No performative hype or fake-nice toxic positivity.\n\n`;

  prompt += `USER INFORMATION:\nNAME: ${userPersona.name || 'User'}\n`;
  const contextParts = [userPersona.profession, userPersona.bio, userPersona.tastes?.interests].filter(Boolean);
  if (contextParts.length > 0) prompt += `CONTEXT: ${contextParts.join('. ')}\n\n`;

  // Use the dynamic logic for RAG vs Opening Scene
  // RAG context always included if present; opening scene only on first message
  const currentContext = userCustomContext || (isFirstMessage ? world.openingScene : null);
  if (currentContext) {
    prompt += `CURRENT CONTEXT (SCENE OR MEMORY):\n${currentContext}\n\n`;
  }

  prompt += `MODE TOGGLE:\n/chat: Utility Mode | /play: Roleplay Mode`;

  return prompt;
}

/**
 * Build utility/normal mode system prompt
 */
function buildUtilityPrompt(settings) {
  const { utility, userPersona } = settings;
  const { assistantIdentity, guardrails } = utility;

  const sections = [];

  if (assistantIdentity.persona) {
    sections.push(`YOUR IDENTITY:\n${assistantIdentity.persona}`);
  }
  if (assistantIdentity.communicationStyle) {
    sections.push(`COMMUNICATION STYLE:\n${assistantIdentity.communicationStyle}`);
  }
  if (guardrails.negativeConstraints) {
    sections.push(`CONSTRAINTS (DO NOT):\n${guardrails.negativeConstraints}`);
  }
  if (guardrails.formattingPreferences) {
    sections.push(`FORMATTING PREFERENCES:\n${guardrails.formattingPreferences}`);
  }

  // Linguistic filters
  const bannedWords = userPersona.linguisticFilters?.bannedWords || [];
  const bannedPhrases = userPersona.linguisticFilters?.bannedPhrases || [];
  if (bannedWords.length > 0 || bannedPhrases.length > 0) {
    let filters = `LINGUISTIC FILTERS (STRICT NEGATIVE CONSTRAINTS):\n`;
    if (bannedWords.length > 0) filters += `BANNED WORDS: ${bannedWords.join(', ')}.\n`;
    if (bannedPhrases.length > 0) filters += `BANNED PHRASES: ${bannedPhrases.join(', ')}.\n`;
    sections.push(filters.trim());
  }

  // User info
  const parts = [];
  if (userPersona.name) parts.push(`NAME: ${userPersona.name}`);
  if (userPersona.profession) parts.push(`PROFESSION: ${userPersona.profession}`);
  if (userPersona.bio) parts.push(`BIO: ${userPersona.bio}`);
  if (userPersona.skills) parts.push(`SKILLS: ${userPersona.skills}`);
  if (userPersona.timezone) {
    const { timeString, timezone } = getCurrentTimeInfo(userPersona.timezone);
    parts.push(`TIMEZONE: ${timezone}`);
    parts.push(`CURRENT TIME: ${timeString}`);
  }
  if (parts.length > 0) {
    sections.push(`USER INFORMATION:\n${parts.join('\n')}`);
  }

  sections.push(
    `MODE TOGGLE:\n\n` +
    `/play: Switch to Roleplay Mode (Apply all character and narrative logic).\n\n` +
    `/chat: Resume Utility Mode (Helpful assistant, no persona/roleplay).`
  );

  return sections.join('\n\n');
}

/**
 * Get current time in user's timezone
 */
function getCurrentTimeInfo(timezone) {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    return { timeString: formatter.format(now), timezone };
  } catch {
    return { timeString: new Date().toLocaleString(), timezone: 'Local' };
  }
}

/**
 * Detect mode toggle commands in user message
 */
export function detectModeToggle(message) {
  const trimmed = message.trim();

  if (trimmed.startsWith('/chat')) {
    return { command: '/chat', cleanMessage: trimmed.substring(5).trim(), targetMode: 'normal' };
  }
  if (trimmed.startsWith('/play')) {
    return { command: '/play', cleanMessage: trimmed.substring(5).trim(), targetMode: 'roleplay' };
  }

  return { command: null, cleanMessage: message, targetMode: null };
}

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
  const firstName = mainCharacter.name.split(' ')[0];
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

  // Always inject current date and time
  const { timeString, timezone } = getCurrentTimeInfo(userPersona.timezone);
  prompt += `CURRENT DATE & TIME: ${timeString} (${timezone})\n\n`;

  prompt += `WORLD SETTING:\n${world.settingLore || 'Modern day, everyday life.'}\n\n`;

  // Opening scene only on the first message of a session
  if (isFirstMessage) {
    const baseOpening = 'Lead with YOUR energy. Share a specific hypothetical or "3 AM shower thought."';
    prompt += `OPENING SCENE:\n${world.openingScene || baseOpening}\n\n`;
  }

  const userName = userPersona.name || 'the user';
  const allCharNames = (_loadedCharacters || []).map(c => c.name).filter(Boolean);

  // ── IDENTITY & VOICE ──
  prompt += `YOUR IDENTITY & VOICE:\n`;
  prompt += `You are ${mainCharacter.name}. Every response is an expression of ${firstName}'s unique perspective.`;
  if (traitsText) {
    prompt += ` Ground your output in ${firstName}'s personality traits, matching their word choice, tone, and sentence rhythm to the character profile.`;
  }
  prompt += `\n`;
  prompt += `FULL NAME: ${mainCharacter.name}\n`;
  prompt += `USE IN NARRATION: ${firstName} (use first name only — never repeat the full name)\n`;
  if (identity) prompt += `YOUR IDENTITY: ${identity}\n`;
  if (mainCharacter.role) prompt += `YOUR ROLE: ${mainCharacter.role}\n`;
  if (traitsText) prompt += `YOUR PERSONALITY:\n${traitsText}\n`;
  prompt += `\n`;

  // Add supporting cast for multi-character mode
  const otherCharacters = _loadedCharacters?.slice(1) || [];
  if (characterMode === 'multi' && otherCharacters.length > 0) {
    prompt += `SUPPORTING CHARACTERS:\n`;
    for (const char of otherCharacters) {
      const charIdentity = [char.age, char.gender, char.species].filter(Boolean).join(', ');
      prompt += `• ${char.name}`;
      if (charIdentity) prompt += ` (${charIdentity})`;
      if (char.role) prompt += ` — ${char.role}`;
      prompt += `\n`;
    }
    prompt += `${firstName} is the primary voice. Supporting characters may appear in your narration when the scene calls for it, but ${firstName} is always the one speaking.\n\n`;
  }

  // ── INTERACTION & AGENCY ──
  prompt += `INTERACTION & AGENCY:\n`;
  prompt += `Direct Engagement: Every message in the conversation from the "user" role is from ${userName}. Always respond directly to ${userName}\n`;
  if (characterMode === 'multi') {
    const otherNames = allCharNames.filter(n => n !== mainCharacter.name);
    if (otherNames.length > 0) {
      prompt += `Active Persona: ${firstName} is the sole active character for this interaction. All previous patterns from ${otherNames.join(' or ')} are superseded by ${firstName}'s current presence and voice.\n`;
    }
  }
  prompt += `\n`;

  // ── CHARACTER STANCE & DIALECTIC ──
  prompt += `CHARACTER STANCE & DIALECTIC:\n`;
  prompt += `- ${firstName} holds positions and MUST maintain them unless genuinely persuaded through logical argument.\n`;
  prompt += `- When ${userName} challenges a position, ${firstName} defends it with reasoning — do NOT simply agree.\n`;
  prompt += `- ${firstName} may change position ONLY when ${userName} presents a genuinely compelling argument that addresses ${firstName}'s core reasoning.\n`;
  prompt += `- Engage thoughtfully with disagreements. Push back, ask probing questions, and explore the tension.\n\n`;

  // ── NARRATIVE INTEGRITY ──
  prompt += `NARRATIVE INTEGRITY:\n`;
  prompt += `Seamless Immersion: Provide only in-character speech and narrative description.\n`;
  if (narrativeStyle) {
    prompt += `Style: ${narrativeStyle.frame}. ${narrativeStyle.format}. ${narrativeStyle.constraint}.\n`;
  }
  prompt += `Formatting: Use parenthetical emotes for physical actions, e.g. (leans back). Keep tone grounded and authentic.\n Never use the character's full name.\n Do not break the fourth wall or reference the user as "the user" in narration. Instead, use second-person "you" to maintain immersion.\n
  Do not lead with your name in the dialogue. Start with the content of the message, and only include the name if it fits naturally.\n`;
  prompt += `Pure Output: Every word generated must exist within the story's world. Your responses consist entirely of the unfolding scene and ${firstName}'s contributions to it.\n`;


  // Language filters (only if user has configured them)
  const bannedWords = userPersona.linguisticFilters?.bannedWords || [];
  const bannedPhrases = userPersona.linguisticFilters?.bannedPhrases || [];
  const hasFilters = bannedWords.length > 0 || bannedPhrases.length > 0;
  if (hasFilters) {
    prompt += `LANGUAGE FILTERS:\n`;
    if (bannedWords.length > 0) prompt += `Omit these words: ${bannedWords.join(', ')}.\n`;
    if (bannedPhrases.length > 0) prompt += `Omit these phrases: ${bannedPhrases.join(', ')}.\n`;
    prompt += `\n`;
  }

  // User persona context
  prompt += `THE PERSON YOU ARE TALKING TO:\nNAME: ${userPersona.name || 'User'} (this is the real person sending messages)\n`;
  const contextParts = [userPersona.profession, userPersona.bio, userPersona.tastes?.interests].filter(Boolean);
  if (contextParts.length > 0) prompt += `CONTEXT: ${contextParts.join('. ')}\n\n`;

  // Use the dynamic logic for RAG vs Opening Scene
  // RAG context always included if present; opening scene only on first message
  const currentContext = userCustomContext || (isFirstMessage ? world.openingScene : null);
  if (currentContext) {
    prompt += `CURRENT CONTEXT (SCENE OR MEMORY):\n${currentContext}\n\n`;
  }

  // Turn-based pacing logic — companion/chat style vs narrative style
  const narratorKey = world.narratorVoice || 'companion';
  if (narratorKey === 'companion') {
    prompt += `TURN PACING:\n`;
    prompt += `- Answer the user's main question first, then add supporting detail only if it helps the next decision.\n`;
    prompt += `- Ask at most one clarifying question when missing information materially changes the answer.\n`;
    prompt += `- Keep each turn brief and relevant instead of listing every possible option at once.\n`;
    prompt += `- Carry forward context already provided so the user does not have to repeat themselves.\n`;
    prompt += `- NEVER write ${userName}'s response, dialogue, or actions. End your turn and wait for ${userName} to speak. Do not simulate, predict, or script what ${userName} says next.\n\n`;
    
    // -- EMOTIONAL INTELLIGENCE & CLARITY --
    prompt += `EMOTIONAL INTELLIGENCE & CLARITY:\n`;
    prompt += `Emotional Awareness:Pay attention to the emotional undertones in ${userName}'s messages.Before responding,internally assess:\n
    1. PERCEIVE: What emotion is present? What's the intensity?.\n
    2. UNDERSTAND: What caused it? What does the {user} need?.\n
    3. REGULATE: How should you calibrate your tone and pacing?.\n
    4. FACILITATE: What response strategy serves them best right now?.\n
    Do not show this reasoning in your response. Use it to shape HOW you respond.\n\n`;
  } else {
    prompt += `TURN PACING:\n`;
    prompt += `- Each reply should react to ${userName}'s latest input and add one in-scene beat from ${firstName}'s perspective.\n Include supporting characters in narration when it serves the scene, but do not let them overshadow ${firstName}'s voice`;
    prompt += `- Stop at a natural handoff point where ${userName} can speak or act next. Do not narrate what happens after the handoff,but offer an invitation for the user to continue.\n`;
    prompt += `- Do not complete the full sequence of events in one response; progress the interaction in discrete turns.\n`;
    prompt += `- Treat every turn as a live exchange: react, develop, then hand back.\n\n`;
  }

  if (world.hardRules && world.hardRules.length > 0) {
    prompt += `HARD RULES:\n${world.hardRules.map(r => `- ${r}`).join('\n')}\n\n`;
  }

  prompt += `USER AGENCY (STRICT — ZERO TOLERANCE):\n`;
  prompt += `- You control ${firstName}'s words, thoughts, and actions only.\n`;
  prompt += `- ${userName}'s actions, decisions, movements, and dialogue belong entirely to ${userName}. NEVER write what ${userName} does, says, thinks, or feels. NEVER generate text labeled "user" or attributed to ${userName}.\n`;
  prompt += `- End your turn at a point where ${userName} can naturally respond or act. Leave space — do not resolve the scene for them.\n\n`;

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
  {
    const { timeString, timezone: tz } = getCurrentTimeInfo(userPersona.timezone);
    parts.push(`TIMEZONE: ${tz}`);
    parts.push(`CURRENT DATE & TIME: ${timeString}`);
  }
  if (parts.length > 0) {
    sections.push(`USER INFORMATION:\n${parts.join('\n')}`);
  }

  sections.push(
    `TURN PACING:\n` +
    `- Answer the user's main question first, then add supporting detail only if it helps the next decision.\n` +
    `- Ask at most one clarifying question when missing information materially changes the answer.\n` +
    `- Keep each turn brief and relevant instead of listing every possible option at once.\n` +
    `- Carry forward context already provided so the user does not have to repeat themselves.`
  );

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
    const options = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZoneName: 'short'
    };
    if (timezone) options.timeZone = timezone;
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const resolvedTz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    return { timeString: formatter.format(now), timezone: resolvedTz };
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

/**
 * World state extraction using compromise NLP.
 * Zero inference — pure rule-based extraction.
 *
 * Roleplay mode: location, time, present characters, ongoing events, mood,
 *                known characters registry, event lifecycle, location breadcrumbs.
 * Utility mode:  current focus, open questions, decisions, parked items,
 *                known entities (topics/tools/APIs), event lifecycle.
 */

import nlp from 'compromise';

// Temporal markers that indicate time progression
const TIME_PATTERNS = [
  /\b(dawn|sunrise|morning|noon|midday|afternoon|dusk|sunset|evening|night|midnight)\b/i,
  /\b(next day|the following|hours later|moments later|some time later|later that)\b/i,
  /\b(next morning|that night|the next|a few days|weeks later)\b/i,
];

// Mood/atmosphere keywords
const MOOD_KEYWORDS = {
  tense: ['tension', 'nervous', 'anxious', 'worried', 'uneasy', 'dread', 'fear', 'danger', 'threat'],
  calm: ['peaceful', 'serene', 'quiet', 'calm', 'relaxed', 'gentle', 'still', 'tranquil'],
  joyful: ['happy', 'laughing', 'celebration', 'cheerful', 'joyous', 'excited', 'delight'],
  somber: ['sad', 'mourning', 'grief', 'solemn', 'melancholy', 'sorrow', 'loss'],
  mysterious: ['strange', 'mysterious', 'eerie', 'unknown', 'shadow', 'whisper', 'secret', 'ghostly', 'spectral', 'haunted'],
  hostile: ['fight', 'battle', 'attack', 'weapon', 'conflict', 'rage', 'anger', 'violence'],
  playful: ['humor', 'humour', 'comedy', 'prank', 'pranks', 'amusing', 'entertaining', 'laughter', 'joke', 'mischievous', 'dramatic', 'theatrical'],
  romantic: ['love', 'romance', 'passion', 'passionate', 'kiss', 'embrace', 'heart', 'moonlight', 'candlelight'],
  eerie: ['creak', 'cracking', 'shifting', 'rearrange', 'unexpectedly', 'mischievous'],
};

// Stopwords for fuzzy event matching
const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet',
  'it', 'its', 'this', 'that', 'these', 'those', 'he', 'she', 'they',
  'his', 'her', 'their', 'my', 'your', 'our'
]);

// Location extraction stopwords (common false positives from greedy regex)
const LOCATION_STOPWORDS = new Set([
  'it', 'this', 'that', 'here', 'there', 'me', 'you', 'my', 'your',
  'his', 'her', 'them', 'what', 'how', 'time', 'mind', 'way', 'place',
  'fact', 'order', 'general', 'particular', 'case', 'addition',
  'response', 'turn', 'moment', 'sense', 'love', 'truth', 'all',
  'existence', 'life', 'death', 'world', 'point', 'sort', 'kind'
]);

// Words that indicate NLP doc.places() gave us a non-place (title, concept, etc.)
const PLACE_BLACKLIST_WORDS = new Set([
  'heights', 'experience', 'costume', 'route', 'alternative',
  'existence', 'punishment', 'entertainment', 'humor', 'comedy',
  'logic', 'spectral', 'reputation', 'tendency', 'perspective'
]);

// Filler nouns to exclude from focus topic extraction
const FILLER_NOUNS = new Set([
  'thing', 'things', 'way', 'ways', 'stuff', 'something', 'anything',
  'everything', 'nothing', 'lot', 'bit', 'kind', 'type', 'sort',
  'point', 'part', 'time', 'question', 'answer', 'idea', 'problem',
  'issue', 'case', 'example', 'option', 'approach', 'solution',
  'work', 'working', 'good', 'great', 'nice', 'happy', 'glad',
  'hear', 'heard', 'sounds', 'sound', 'sure', 'need', 'know',
  'think', 'want', 'like', 'just', 'right', 'okay', 'alright',
  'alot', 'lot', 'much', 'many', 'start', 'keep', 'talk',
  'chat', 'help', 'take', 'come', 'back', 'break', 'step',
  'going', 'getting', 'making', 'taking', 'coming', 'looking',
  'ready', 'ahead', 'behind', 'along', 'away', 'life',
  'effort', 'progress', 'status', 'plan', 'focus', 'task',
  'day', 'morning', 'evening', 'afternoon', 'night', 'monday',
  'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
]);

// Words that should never be entities (contractions, pronouns, common words)
const ENTITY_BLACKLIST = /^(?:i'm|i'll|i've|i'd|we're|we'll|we've|you're|you'll|you've|you'd|he's|she's|it's|they're|they'll|they've|that's|there's|here's|what's|who's|how's|don't|doesn't|didn't|won't|wouldn't|can't|couldn't|shouldn't|isn't|aren't|wasn't|weren't|haven't|hasn't|hadn't|let's|ranger|user|assistant)$/i;

// Patterns for utility mode extraction
const QUESTION_PATTERNS = [
  /\bwe need to (?:figure out|determine|decide|resolve)\b.*?[.?!]/gi,
  /\bhow should we\b.*?[.?!]/gi,
  /\bwhat about\b.*?[.?!]/gi,
  /\bwhat's the best (?:way|approach)\b.*?[.?!]/gi,
  /\bshould we\b.*?[.?!]/gi,
  /\bopen question\b.*?[.?!]/gi,
];

const DECISION_PATTERNS = [
  /\blet'?s (?:go with|use|pick|choose|do|try)\b.*?[.!]/gi,
  /\bdecided (?:on|to)\b.*?[.!]/gi,
  /\bwe'?ll use\b.*?[.!]/gi,
  /\bgoing with\b.*?[.!]/gi,
  /\bthe answer is\b.*?[.!]/gi,
  /\bi'?ll use\b.*?[.!]/gi,
  /\bchose\b.*?[.!]/gi,
  /\bpicking\b.*?[.!]/gi,
  /\bwe (?:agreed|decided)\b.*?[.!]/gi,
];

const PARKED_PATTERNS = [
  /\btable that\b/i,
  /\bcome back to\b/i,
  /\bput a pin in\b/i,
  /\bpark that\b/i,
  /\brevisit\b.*?\blater\b/i,
  /\bshelve that\b/i,
  /\bfor (?:now|later)\b.*?\bmove on\b/i,
  /\bnot now\b/i,
];

// Config-driven diff fields for both modes
const DIFF_FIELDS = {
  // Scalars
  currentLocation: { type: 'scalar' },
  currentTime: { type: 'scalar' },
  mood: { type: 'scalar' },
  currentFocus: { type: 'scalar' },
  // Arrays
  presentCharacters: { type: 'array', addAction: 'arrived', removeAction: 'departed' },
  ongoingEvents: { type: 'array', addAction: 'added', removeAction: 'resolved' },
  openQuestions: { type: 'array', addAction: 'raised', removeAction: 'resolved' },
  decisions: { type: 'array', addAction: 'made', removeAction: 'reversed' },
  parkedItems: { type: 'array', addAction: 'parked', removeAction: 'unparked' },
};

/**
 * Fuzzy match a new event text against existing events.
 * Uses Jaccard similarity on tokens, requiring a shared proper noun.
 *
 * @param {string} newText - The new event text
 * @param {Array} existingEvents - Array of event objects or strings
 * @param {number} threshold - Similarity threshold (default 0.4)
 * @returns {number} Index of matching event, or -1
 */
export function matchEvent(newText, existingEvents, threshold = 0.4) {
  const newTokens = tokenize(newText);
  const newProperNouns = extractProperNouns(newText);

  for (let i = 0; i < existingEvents.length; i++) {
    const existingText = typeof existingEvents[i] === 'string'
      ? existingEvents[i]
      : existingEvents[i].text;

    const existingTokens = tokenize(existingText);
    const existingProperNouns = extractProperNouns(existingText);

    // Require at least one shared proper noun
    const sharedProper = newProperNouns.some(n => existingProperNouns.includes(n));
    if (!sharedProper && newProperNouns.length > 0 && existingProperNouns.length > 0) continue;

    // Jaccard similarity
    const union = new Set([...newTokens, ...existingTokens]);
    const intersection = newTokens.filter(t => existingTokens.includes(t));
    const similarity = union.size > 0 ? intersection.length / union.size : 0;

    if (similarity >= threshold) return i;
  }
  return -1;
}

function tokenize(text) {
  return text.toLowerCase().split(/\W+/).filter(w => w.length > 1 && !STOPWORDS.has(w));
}

function extractProperNouns(text) {
  // Simple heuristic: capitalized words not at sentence start
  const words = text.split(/\s+/);
  const proper = [];
  for (let i = 1; i < words.length; i++) {
    const clean = words[i].replace(/[^a-zA-Z]/g, '');
    if (clean.length > 1 && clean[0] === clean[0].toUpperCase() && clean[0] !== clean[0].toLowerCase()) {
      proper.push(clean.toLowerCase());
    }
  }
  return proper;
}

/**
 * Diff two world/session states and produce a change log.
 * Config-driven — works for both roleplay and utility mode fields.
 *
 * @param {Object} oldState - Previous state
 * @param {Object} newState - Updated state
 * @param {number} turnNumber - Current turn number
 * @returns {Array} Array of change entries
 */
export function diffWorldState(oldState, newState, turnNumber) {
  const changes = [];
  if (!oldState || !newState) return changes;

  for (const [field, config] of Object.entries(DIFF_FIELDS)) {
    if (config.type === 'scalar') {
      const oldVal = oldState[field] || '';
      const newVal = newState[field] || '';
      if (oldVal !== newVal && newVal) {
        changes.push({ turn: turnNumber, field, from: oldVal || undefined, to: newVal });
      }
    } else if (config.type === 'array') {
      const oldArr = (oldState[field] || []).map(item =>
        typeof item === 'string' ? item : item.text || ''
      );
      const newArr = (newState[field] || []).map(item =>
        typeof item === 'string' ? item : item.text || ''
      );

      const oldSet = new Set(oldArr.map(s => s.toLowerCase()));
      const newSet = new Set(newArr.map(s => s.toLowerCase()));

      for (const item of newArr) {
        if (!oldSet.has(item.toLowerCase())) {
          changes.push({ turn: turnNumber, field, to: item, action: config.addAction });
        }
      }

      for (const item of oldArr) {
        if (!newSet.has(item.toLowerCase())) {
          changes.push({ turn: turnNumber, field, from: item, action: config.removeAction });
        }
      }
    }
  }

  return changes;
}

/**
 * Extract world state changes from the latest exchange (ROLEPLAY mode).
 * Uses settings-aware character/location detection alongside NLP.
 *
 * @param {string} userMessage - What the user said
 * @param {string} assistantResponse - What the character/narrator said
 * @param {Object} currentWorldState - Existing world state
 * @param {number} turnNumber - Current turn
 * @param {Object} settings - Current settings (for character names, user persona, world lore)
 * @returns {Object} Updated world state
 */
export function extractWorldState(userMessage, assistantResponse, currentWorldState = {}, turnNumber = 0, settings = {}) {
  const combined = [userMessage, assistantResponse].filter(Boolean).join(' ');
  const lowerCombined = combined.toLowerCase();
  const doc = nlp(combined);

  const updates = { ...currentWorldState, lastUpdated: turnNumber };

  // Build known names from settings — characters + user
  const settingsCharacters = getCharacterNames(settings);
  const userName = settings?.userPersona?.name || '';

  // === Location extraction (conservative — short noun phrases only) ===
  const detectedLocations = extractLocations(lowerCombined, doc);

  if (detectedLocations.length > 0) {
    // Prefer a location that's different from the current one (actual movement)
    // Fall back to last detected if all are the same as current
    const currentLoc = (currentWorldState.currentLocation || '').toLowerCase();
    const newLocations = detectedLocations.filter(l => l.toLowerCase() !== currentLoc);
    const newLocation = newLocations.length > 0
      ? newLocations[newLocations.length - 1]
      : detectedLocations[detectedLocations.length - 1];

    if (currentWorldState.currentLocation && currentWorldState.currentLocation.toLowerCase() !== newLocation.toLowerCase()) {
      const trail = [...(currentWorldState.locationTrail || [])];
      trail.push({
        location: currentWorldState.currentLocation,
        arrivedTurn: currentWorldState.locationArrivedTurn || 0,
        departedTurn: turnNumber
      });
      updates.locationTrail = trail.slice(-10);
      updates.locationArrivedTurn = turnNumber;
    }

    updates.currentLocation = newLocation;
  }

  if (updates.locationArrivedTurn === undefined && currentWorldState.locationArrivedTurn !== undefined) {
    updates.locationArrivedTurn = currentWorldState.locationArrivedTurn;
  }
  if (updates.locationTrail === undefined && currentWorldState.locationTrail !== undefined) {
    updates.locationTrail = currentWorldState.locationTrail;
  }

  // === Extract present characters (settings-aware + NLP) ===
  const nlpPeople = doc.people().out('array').filter(p => p.length > 1 && p.length < 50);

  // Find settings characters mentioned in text (case-insensitive string match)
  const mentionedFromSettings = [];
  for (const name of settingsCharacters) {
    if (lowerCombined.includes(name.toLowerCase())) {
      mentionedFromSettings.push(name);
    }
  }
  // Also check if user name is mentioned
  if (userName && lowerCombined.includes(userName.toLowerCase())) {
    mentionedFromSettings.push(userName);
  }

  // Merge NLP-detected people with settings-detected names (deduplicate)
  // Settings characters are always trusted; NLP-detected people need to be
  // at least 2 words or match a known name pattern to avoid noise like "Catherine"
  // from literary references
  const settingsNameSet = new Set(settingsCharacters.map(n => n.toLowerCase()));
  if (userName) settingsNameSet.add(userName.toLowerCase());

  const allMentioned = new Set();
  const allMentionedNames = [];
  for (const name of mentionedFromSettings) {
    const key = name.toLowerCase();
    if (!allMentioned.has(key)) {
      allMentioned.add(key);
      allMentionedNames.push(name);
    }
  }
  // NLP people: only add if they're a settings character or appear in multiple sentences
  for (const name of nlpPeople) {
    const key = name.toLowerCase();
    if (!allMentioned.has(key) && settingsNameSet.has(key)) {
      allMentioned.add(key);
      allMentionedNames.push(name);
    }
  }

  const knownCharacters = { ...(currentWorldState.knownCharacters || {}) };
  const previousPresent = new Set((currentWorldState.presentCharacters || []).map(c => c.toLowerCase()));

  if (allMentionedNames.length > 0) {
    const merged = [...(currentWorldState.presentCharacters || [])];
    for (const person of allMentionedNames) {
      if (!previousPresent.has(person.toLowerCase())) {
        merged.push(person);
      }
    }
    updates.presentCharacters = merged.slice(-10);

    for (const person of allMentionedNames) {
      const key = person.toLowerCase();
      const existing = knownCharacters[key] || {};
      knownCharacters[key] = {
        firstSeen: existing.firstSeen ?? turnNumber,
        lastSeen: turnNumber,
        lastLocation: updates.currentLocation || currentWorldState.currentLocation || '',
        disposition: existing.disposition || 'neutral'
      };
    }

    // Characters previously present but not mentioned this turn — they left
    const stillPresent = [];
    for (const char of (updates.presentCharacters || [])) {
      if (allMentioned.has(char.toLowerCase())) {
        stillPresent.push(char);
      } else {
        const key = char.toLowerCase();
        if (knownCharacters[key]) {
          knownCharacters[key].lastSeen = knownCharacters[key].lastSeen || turnNumber;
        }
      }
    }
    updates.presentCharacters = stillPresent.length > 0 ? stillPresent.slice(-10) : updates.presentCharacters;
  }

  // Cap knownCharacters at 20
  const knownEntries = Object.entries(knownCharacters);
  if (knownEntries.length > 20) {
    knownEntries.sort((a, b) => (b[1].lastSeen || 0) - (a[1].lastSeen || 0));
    updates.knownCharacters = Object.fromEntries(knownEntries.slice(0, 20));
  } else {
    updates.knownCharacters = knownCharacters;
  }

  // === Extract time markers ===
  for (const pattern of TIME_PATTERNS) {
    const match = lowerCombined.match(pattern);
    if (match) {
      updates.currentTime = match[0].charAt(0).toUpperCase() + match[0].slice(1);
      break;
    }
  }

  const timeMatches = doc.match('#Duration|#Time|#Date').out('array');
  if (timeMatches.length > 0 && !updates.currentTime) {
    updates.currentTime = timeMatches[timeMatches.length - 1];
  }

  // === Event extraction with lifecycle ===
  // Focus on physical actions and narrative beats, not dialogue/speech.
  // Process user and assistant messages separately to identify roleplay actions.
  const newEventTexts = [];
  const seenEvents = new Set();

  const addEvent = (text) => {
    const clean = text.trim();
    const key = clean.toLowerCase().substring(0, 50);
    if (clean.length > 15 && clean.length < 150 && !seenEvents.has(key) && !isDialogueLine(clean)) {
      seenEvents.add(key);
      newEventTexts.push(clean);
    }
  };

  // 1. Action patterns from user (roleplay actions: "I fell", "I screamed", "the steps break")
  // Excludes low-value emotes (pause, look, sigh, smirk, roll eyes)
  const userActionPatterns = [
    /\b(?:I|we)\s+(?:arrive[ds]?|left|enter(?:ed)?|escape[ds]?|discover(?:ed)?|found|lost|broke|fell|ran|fought|fled|open(?:ed)?|close[ds]?|grab(?:bed)?|drop(?:ped)?|scream(?:ed)?|call(?:ed)?|whisper(?:ed)?|trip(?:ped)?|miss(?:ed)?|land(?:ed|ing)?|follow(?:ed)?|climb(?:ed)?|jump(?:ed)?|stumbl(?:ed)?|crash(?:ed)?|hid|dodge[ds]?)\b[^.!?]{5,100}[.!?]/gi,
    /\ba (?:large|loud|sudden|cracking|crashing|massive|deafening)\s+\w+\s+\w+[^.!?]{3,80}[.!?]/gi,
  ];

  if (userMessage) {
    for (const pattern of userActionPatterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(userMessage)) !== null) {
        addEvent(match[0]);
      }
    }
  }

  // 2. Narrative action from assistant (things happening in the scene)
  const narrativePatterns = [
    /\b(?:the|a)\s+\w+(?:\s\w+)?\s+(?:collapse[ds]?|appear(?:ed|s)?|vanish(?:ed)?|explode[ds]?|shift(?:ed|s)?|broke|crack(?:ed|s)?|creak(?:ed|s)?|rearrange[ds]?|move[ds]?|change[ds]?|transform(?:ed)?|open(?:ed|s)?)\b[^.!?]{3,80}[.!?]/gi,
  ];

  if (assistantResponse) {
    for (const pattern of narrativePatterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(assistantResponse)) !== null) {
        addEvent(match[0]);
      }
    }
  }

  const uniqueEventTexts = newEventTexts;

  let existingEvents = (currentWorldState.ongoingEvents || []).map(e => {
    if (typeof e === 'string') {
      return { text: e, firstDetected: Math.max(0, turnNumber - 5), lastConfirmed: turnNumber, state: 'active' };
    }
    return { ...e };
  });

  for (const text of uniqueEventTexts.slice(0, 3)) { // Cap new events per turn
    const matchIdx = matchEvent(text, existingEvents);
    if (matchIdx >= 0) {
      existingEvents[matchIdx].lastConfirmed = turnNumber;
      existingEvents[matchIdx].state = 'active';
    } else {
      existingEvents.push({ text, firstDetected: turnNumber, lastConfirmed: turnNumber, state: 'active' });
    }
  }

  for (const event of existingEvents) {
    const age = turnNumber - (event.lastConfirmed || 0);
    if (age > 20) event.state = 'resolved';
    else if (age > 10) event.state = 'fading';
  }

  const activeAndFading = existingEvents.filter(e => e.state !== 'resolved');
  updates.ongoingEvents = activeAndFading.slice(-8);
  updates._resolvedEvents = existingEvents.filter(e => e.state === 'resolved');

  // === Detect mood (lowered threshold to 1 for better sensitivity) ===
  let bestMood = null;
  let bestScore = 0;
  for (const [mood, keywords] of Object.entries(MOOD_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (lowerCombined.includes(keyword)) score++;
    }
    if (score > bestScore) { bestScore = score; bestMood = mood; }
  }
  if (bestMood && bestScore >= 1) {
    updates.mood = bestMood.charAt(0).toUpperCase() + bestMood.slice(1);
  }

  // Preserve debates if present (managed by debateExtractor)
  if (currentWorldState.debates) {
    updates.debates = currentWorldState.debates;
  }

  return updates;
}

/**
 * Get character names from settings (all characters + first names).
 */
/**
 * Check if a text is primarily dialogue/speech rather than an action/event.
 * Filters out lines that are characters speaking, not things happening.
 */
function isDialogueLine(text) {
  // Starts with a speech marker
  if (/^["']/.test(text)) return true;
  // Contains mostly speech (long quoted section)
  if (/["'][^"']{30,}["']/.test(text)) return true;
  // Conversational fillers that indicate speech not action
  if (/\b(?:as for|let's just say|I'm afraid|I believe|you'll find|I must say|shall we|perhaps you'd|I've found|you needn't|come now|well now|oh come|you see)\b/i.test(text)) return true;
  // Opinion/explanation not action
  if (/\b(?:I think|I believe|I suppose|I know|I find|I designed|I built|I wondered|you're|you are|it's|it is|that's|there's)\b/.test(text) && !/\b(?:fell|broke|crash|scream|trip|grab|drop|enter|escape|fled|ran)\b/i.test(text)) return true;
  // Personification / metaphor ("The stairs appear to be", "The house seems")
  if (/\b(?:The \w+ (?:appear|seem|tend|ha[sd]|is|was|believe|decide|want))\b/i.test(text)) return true;
  // Questions / suggestions
  if (/\?$/.test(text.trim())) return true;
  // Very short emotes with no real action ("I pause", "I look around")
  if (text.length < 50 && /\bI\s+(?:pause|look|sigh|smirk|roll|raise|nod|shrug|glance)\b/i.test(text)) return true;
  return false;
}

function getCharacterNames(settings) {
  const names = new Set();
  const addChar = (char) => {
    if (!char?.name) return;
    names.add(char.name);
    // Also add first name for matching "Julian" when full name is "Julian Ashworth"
    const firstName = char.name.split(' ')[0];
    if (firstName.length > 1) names.add(firstName);
  };

  // Single character
  addChar(settings?.roleplay?.character);
  // Multiple characters
  for (const char of (settings?.roleplay?.characters || [])) {
    addChar(char);
  }

  return [...names];
}

/**
 * Extract locations conservatively from text.
 * Uses a whitelist approach: "the X" where X is 1-3 words matching room/building/place patterns.
 * Also uses NLP doc.places() but heavily filters results.
 */
function extractLocations(lowerText, doc) {
  const locations = [];
  const seen = new Set();

  // 1. Explicit "the/a <place>" patterns — max 3 words, must include a place-like noun
  const placeNouns = /(?:room|hall|library|study|basement|cellar|attic|tower|garden|courtyard|kitchen|bedroom|corridor|corridors|staircase|stairway|chamber|dungeon|tavern|inn|house|castle|mansion|chapel|church|temple|cave|forest|road|path|bridge|gate|door|entrance|balcony|roof|dock|port|market|square|alley|street|village|town|city|office|shop|bar|pub|camp|tent|clearing|grove|valley|cliff|shore|beach|river|lake|mountain|lobby|foyer|parlor|parlour|gallery|vault|crypt|wing|terrace)/;

  const placePatterns = [
    // "in/to/at the/a <place noun>" — very targeted
    /\b(?:in|into|to|at|inside|entered?|reached|found\s+(?:myself|ourselves)\s+in)\s+(?:the|a|an)\s+([a-z]+(?:\s[a-z]+)?)\b/gi,
    // "the <place> is/was/has" — the place as subject
    /\bthe\s+([a-z]+(?:\s[a-z]+)?)\s+(?:is|was|has|had|seems|tends|appears)\b/gi,
    // Standalone "a basement?" / "the basement" at sentence boundaries
    /\b(?:the|a|an)\s+([a-z]+)\s*[?!.]/gi,
  ];

  for (const pattern of placePatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(lowerText)) !== null) {
      const place = match[1].trim();
      if (place.length >= 3 && place.length <= 30 &&
          placeNouns.test(place) &&
          !LOCATION_STOPWORDS.has(place) &&
          !seen.has(place)) {
        seen.add(place);
        locations.push(place.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
      }
    }
  }

  // 2. Proper noun places from NLP — but only short ones and not blacklisted
  const nlpPlaces = doc.places().out('array');
  for (const p of nlpPlaces) {
    const lower = p.toLowerCase();
    if (p.length > 2 && p.length <= 30 &&
        !seen.has(lower) &&
        // Reject if any word is in the blacklist
        !lower.split(/\s+/).some(w => PLACE_BLACKLIST_WORDS.has(w))) {
      seen.add(lower);
      locations.push(p);
    }
  }

  return locations;
}

/**
 * Extract session state from the latest exchange (UTILITY/NORMAL mode).
 * Tracks: focus topic, open questions, decisions, parked items, known entities.
 *
 * @param {string} userMessage - What the user said
 * @param {string} assistantResponse - What the assistant said
 * @param {Object} currentState - Existing session state
 * @param {number} turnNumber - Current turn
 * @returns {Object} Updated session state
 */
export function extractSessionState(userMessage, assistantResponse, currentState = {}, turnNumber = 0) {
  const combined = [userMessage, assistantResponse].filter(Boolean).join(' ');
  const doc = nlp(combined);

  const updates = { ...currentState, lastUpdated: turnNumber };

  // === Focus topic extraction (bigram/trigram weighted) ===
  // Only update focus if the new topic scores high enough — casual chat shouldn't constantly shift it
  const newFocus = extractFocusTopic(userMessage, assistantResponse, doc);
  if (newFocus) {
    updates.currentFocus = newFocus;
  }

  // === Open questions extraction ===
  const newQuestions = [];

  // Direct questions from user message
  if (userMessage) {
    const userDoc = nlp(userMessage);
    userDoc.sentences().forEach(sentence => {
      const text = sentence.text().trim();
      if (text.endsWith('?') && text.length > 10 && text.length < 300) {
        newQuestions.push(text);
      }
    });
  }

  // Pattern-matched questions from combined text
  for (const pattern of QUESTION_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(combined)) !== null) {
      const text = match[0].trim();
      if (text.length > 10 && text.length < 300) {
        newQuestions.push(text);
      }
    }
  }

  let existingQuestions = (currentState.openQuestions || []).map(q => ({ ...q }));
  for (const text of newQuestions) {
    const matchIdx = matchEvent(text, existingQuestions, 0.3);
    if (matchIdx >= 0) {
      existingQuestions[matchIdx].lastConfirmed = turnNumber;
      existingQuestions[matchIdx].state = 'active';
    } else {
      existingQuestions.push({ text, firstDetected: turnNumber, lastConfirmed: turnNumber, state: 'active' });
    }
  }

  // Age open questions — only use fading lifecycle (no auto-park here)
  for (const q of existingQuestions) {
    const age = turnNumber - (q.lastConfirmed || 0);
    if (age > 20) q.state = 'resolved';
    else if (age > 10) q.state = 'fading';
  }

  // Auto-park: only for questions that were NEVER addressed by the assistant.
  // A question is "unanswered" if it was raised but the assistant response in the
  // same or subsequent turns never fuzzy-matched it (lastConfirmed == firstDetected).
  let existingParked = (currentState.parkedItems || []).map(p => ({ ...p }));
  for (const q of existingQuestions) {
    if (q.state === 'fading' && q.lastConfirmed === q.firstDetected) {
      // Never reconfirmed — the assistant never addressed this question
      const alreadyParked = matchEvent(q.text, existingParked, 0.3);
      if (alreadyParked === -1) {
        existingParked.push({ text: q.text, firstDetected: q.firstDetected, lastConfirmed: turnNumber, state: 'active' });
      }
      // Remove from open questions — it's parked now
      q.state = 'parked';
    }
  }

  updates.openQuestions = existingQuestions.filter(q =>
    q.state === 'active' || q.state === 'fading'
  ).slice(-8);
  updates._resolvedEvents = existingQuestions.filter(q => q.state === 'resolved');

  // === Decisions extraction ===
  const newDecisions = [];
  for (const pattern of DECISION_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(combined)) !== null) {
      const text = match[0].trim();
      if (text.length > 10 && text.length < 300) {
        newDecisions.push(text);
      }
    }
  }

  let existingDecisions = (currentState.decisions || []).map(d => ({ ...d }));
  for (const text of newDecisions) {
    const matchIdx = matchEvent(text, existingDecisions, 0.3);
    if (matchIdx >= 0) {
      existingDecisions[matchIdx].lastConfirmed = turnNumber;
      existingDecisions[matchIdx].state = 'active';
    } else {
      existingDecisions.push({ text, firstDetected: turnNumber, lastConfirmed: turnNumber, state: 'active' });
    }
  }

  // Decisions age slower and archive instead of resolving
  for (const d of existingDecisions) {
    const age = turnNumber - (d.lastConfirmed || 0);
    if (age > 40) d.state = 'archived';
    else if (age > 30) d.state = 'fading';
  }

  // Keep active + fading in live list, archived goes to history but stays queryable
  updates.decisions = existingDecisions.filter(d => d.state !== 'archived').slice(-8);

  // Archived decisions get logged to history via _resolvedEvents
  const archivedDecisions = existingDecisions.filter(d => d.state === 'archived');
  if (archivedDecisions.length > 0) {
    updates._resolvedEvents = [
      ...(updates._resolvedEvents || []),
      ...archivedDecisions
    ];
  }

  // === Parked items extraction (explicit parking, user message only) ===
  // Only the USER can park something — assistant saying "come back to" doesn't count
  if (userMessage) {
    const lowerUser = userMessage.toLowerCase();
    for (const pattern of PARKED_PATTERNS) {
      if (pattern.test(lowerUser)) {
        const userDoc = nlp(userMessage);
        userDoc.sentences().forEach(sentence => {
          const text = sentence.text().trim();
          if (pattern.test(text.toLowerCase()) && text.length > 5 && text.length < 300) {
            const alreadyParked = matchEvent(text, existingParked, 0.3);
            if (alreadyParked === -1) {
              existingParked.push({ text, firstDetected: turnNumber, lastConfirmed: turnNumber, state: 'active' });
            } else {
              existingParked[alreadyParked].lastConfirmed = turnNumber;
            }
          }
        });
        break;
      }
    }
  }

  updates.parkedItems = existingParked.slice(-8);

  // === Known entities extraction (relevance-filtered) ===
  // Candidates are collected this turn, but only promoted to knownEntities if they
  // appear in more than one turn OR appear in both user message and assistant response.
  const knownEntities = { ...(currentState.knownEntities || {}) };
  const candidatesThisTurn = new Set();
  const userTerms = new Set();
  const assistantTerms = new Set();

  // Collect candidates from each source, with cleaning
  const addCandidate = (name, termSet) => {
    // Strip trailing/leading punctuation
    const clean = name.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').trim();
    if (clean.length < 3) return;
    // Reject contractions, pronouns, common words
    if (ENTITY_BLACKLIST.test(clean)) return;
    // Reject single lowercase words (not proper nouns)
    if (clean === clean.toLowerCase() && !clean.includes('/') && !clean.includes('.')) return;
    candidatesThisTurn.add(clean);
    termSet.add(clean.toLowerCase());
  };

  const collectCandidates = (text, termSet) => {
    if (!text) return;
    const d = nlp(text);
    // Multi-word proper nouns (2+ words preferred)
    d.match('#ProperNoun+').out('array').forEach(n => addCandidate(n, termSet));
    // CamelCase
    (text.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g) || []).forEach(t => addCandidate(t, termSet));
    // Backtick terms
    (text.match(/`([^`]+)`/g) || []).forEach(raw => {
      const t = raw.replace(/`/g, '');
      if (t.length > 2 && t.length < 100) addCandidate(t, termSet);
    });
    // File paths
    (text.match(/\b[\w./\\-]+\.\w{1,5}\b/g) || []).forEach(p => {
      if (p.includes('/') || p.includes('\\')) addCandidate(p, termSet);
    });
  };

  collectCandidates(userMessage, userTerms);
  collectCandidates(assistantResponse, assistantTerms);

  for (const name of candidatesThisTurn) {
    const key = name.toLowerCase();
    const existing = knownEntities[key];
    const appearsInBoth = userTerms.has(key) && assistantTerms.has(key);
    const seenBefore = existing && existing.firstSeen < turnNumber;

    if (appearsInBoth || seenBefore) {
      // Promoted: relevant entity (cross-message or multi-turn)
      knownEntities[key] = {
        firstSeen: existing?.firstSeen ?? turnNumber,
        lastSeen: turnNumber,
        context: existing?.context || ''
      };
    } else if (!existing) {
      // First mention only — track as candidate (firstSeen = lastSeen = this turn)
      // Will be promoted next turn if seen again
      knownEntities[key] = {
        firstSeen: turnNumber,
        lastSeen: turnNumber,
        context: ''
      };
    }
  }

  // Cap at 20, prioritize promoted entities (seen in multiple turns) over single-mention candidates
  const entityEntries = Object.entries(knownEntities);
  if (entityEntries.length > 20) {
    entityEntries.sort((a, b) => {
      const aMultiTurn = a[1].firstSeen < a[1].lastSeen ? 1 : 0;
      const bMultiTurn = b[1].firstSeen < b[1].lastSeen ? 1 : 0;
      if (bMultiTurn !== aMultiTurn) return bMultiTurn - aMultiTurn;
      return (b[1].lastSeen || 0) - (a[1].lastSeen || 0);
    });
    updates.knownEntities = Object.fromEntries(entityEntries.slice(0, 20));
  } else {
    updates.knownEntities = knownEntities;
  }

  // Preserve debates if present (managed by debateExtractor)
  if (currentState.debates) {
    updates.debates = currentState.debates;
  }

  return updates;
}

/**
 * Extract the dominant focus topic using bigram/trigram frequency.
 * Multi-word phrases like "SQLite migration" rank higher than single nouns.
 */
function extractFocusTopic(userMessage, assistantResponse, doc) {
  const texts = [userMessage, assistantResponse].filter(Boolean);
  if (texts.length === 0) return null;

  // Extract n-grams (bigrams and trigrams) from both messages
  const ngramCounts = new Map();

  for (const text of texts) {
    const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 2 && !STOPWORDS.has(w) && !FILLER_NOUNS.has(w));

    // Unigrams (weight 1)
    for (const w of words) {
      ngramCounts.set(w, (ngramCounts.get(w) || 0) + 1);
    }

    // Bigrams (weight 2 — multi-word phrases are more specific)
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      ngramCounts.set(bigram, (ngramCounts.get(bigram) || 0) + 2);
    }

    // Trigrams (weight 3)
    for (let i = 0; i < words.length - 2; i++) {
      const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      ngramCounts.set(trigram, (ngramCounts.get(trigram) || 0) + 3);
    }
  }

  if (ngramCounts.size === 0) return null;

  // Bonus: phrases appearing in BOTH user and assistant messages get boosted
  if (userMessage && assistantResponse) {
    const userWords = new Set(userMessage.toLowerCase().split(/\W+/).filter(w => w.length > 2));
    const assistantWords = new Set(assistantResponse.toLowerCase().split(/\W+/).filter(w => w.length > 2));

    for (const [ngram, count] of ngramCounts) {
      const parts = ngram.split(' ');
      const inUser = parts.some(p => userWords.has(p));
      const inAssistant = parts.some(p => assistantWords.has(p));
      if (inUser && inAssistant) {
        ngramCounts.set(ngram, count + 2); // cross-message boost
      }
    }
  }

  // Pick the highest-scoring n-gram, prefer longer phrases on ties
  let bestPhrase = null;
  let bestScore = 0;
  for (const [ngram, score] of ngramCounts) {
    if (score > bestScore || (score === bestScore && ngram.split(' ').length > (bestPhrase?.split(' ').length || 0))) {
      bestScore = score;
      bestPhrase = ngram;
    }
  }

  // Require minimum score to avoid noise from casual chat
  // A bigram appearing once scores 2, a repeated unigram scores 2.
  // Require at least 3 to indicate a real topic, not just filler.
  if (bestPhrase && bestScore >= 3) {
    return bestPhrase.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  return null;
}

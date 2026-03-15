/**
 * Token-budgeted context window selection.
 * Pure function — no dependencies on Ollama or DB.
 */

/**
 * Estimate token count from text (rough: ~4 chars per token)
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Build a compact context block from story notes and extracted facts.
 */
function buildContextBlock(storyNotes, extractedFacts) {
  const parts = [];

  if (storyNotes && storyNotes.trim()) {
    parts.push(`[Story Notes]\n${storyNotes.trim()}`);
  }

  if (extractedFacts && extractedFacts.length > 0) {
    const people = extractedFacts.filter(f => f.type === 'person');
    const places = extractedFacts.filter(f => f.type === 'place');
    const events = extractedFacts.filter(f => f.type === 'event');
    const facts = extractedFacts.filter(f => f.type === 'fact');

    const lines = [];
    if (people.length > 0) {
      lines.push(`People: ${people.map(f => f.text).join(', ')}`);
    }
    if (places.length > 0) {
      lines.push(`Places: ${places.map(f => f.text).join(', ')}`);
    }
    if (events.length > 0) {
      lines.push(`Events: ${events.map(f => f.text).join(', ')}`);
    }
    if (facts.length > 0) {
      lines.push(`Facts: ${facts.map(f => f.text).join(', ')}`);
    }

    if (lines.length > 0) {
      parts.push(`[Session Memory]\n${lines.join('\n')}`);
    }
  }

  return parts.join('\n\n');
}

/**
 * Select messages that fit within a token budget.
 *
 * @param {Object} params
 * @param {Array} params.messages - All messages [{role, content, pinned}]
 * @param {string} params.systemPrompt - The system prompt text
 * @param {string} params.storyNotes - Free-text story notes
 * @param {Array} params.extractedFacts - Array of {type, text, turn}
 * @param {number} params.contextBudget - Total token budget
 * @returns {{ messages: Array, contextBlock: string }}
 */
export function selectMessages({ messages, systemPrompt, storyNotes, extractedFacts, contextBudget }) {
  if (!messages || messages.length === 0) {
    return { messages: [], contextBlock: '' };
  }

  let budget = contextBudget;

  // Deduct system prompt
  const systemTokens = estimateTokens(systemPrompt);
  budget -= systemTokens;

  // Build context block from story notes + extracted facts
  const contextBlock = buildContextBlock(storyNotes, extractedFacts);
  const contextTokens = estimateTokens(contextBlock);
  budget -= contextTokens;

  // System prompt alone exceeds budget — send last 2 messages only
  if (budget <= 0) {
    console.warn('Context budget exceeded by system prompt + context block. Sending last 2 messages only.');
    const last2 = messages.slice(-2).map((m, i) => ({
      ...m,
      _originalIndex: messages.length - 2 + i
    }));
    return { messages: last2, contextBlock };
  }

  // Identify anchors: first user message + first assistant reply
  const anchors = new Set();
  const firstUserIdx = messages.findIndex(m => m.role === 'user');
  if (firstUserIdx >= 0) {
    anchors.add(firstUserIdx);
    const firstAssistantIdx = messages.findIndex((m, i) => i > firstUserIdx && m.role === 'assistant');
    if (firstAssistantIdx >= 0) {
      anchors.add(firstAssistantIdx);
    }
  }

  // Identify pinned messages (excluding anchors — deduplicate)
  const pinnedIndices = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].pinned && !anchors.has(i)) {
      pinnedIndices.push(i);
    }
  }

  // Deduct anchor token costs
  let anchorTokens = 0;
  for (const idx of anchors) {
    anchorTokens += estimateTokens(messages[idx].content);
  }

  // Always include the latest user message
  const lastMsgIdx = messages.length - 1;
  const lastMsgInAnchorsOrPins = anchors.has(lastMsgIdx) || pinnedIndices.includes(lastMsgIdx);
  const lastMsgTokens = lastMsgInAnchorsOrPins ? 0 : estimateTokens(messages[lastMsgIdx].content);

  budget -= anchorTokens;
  budget -= lastMsgTokens;

  // Deduct pinned token costs (newest first, drop if over budget)
  const includedPinned = [];
  // Sort pinned by index descending (newest first)
  const sortedPinned = [...pinnedIndices].sort((a, b) => b - a);
  for (const idx of sortedPinned) {
    const tokens = estimateTokens(messages[idx].content);
    if (budget - tokens >= 0) {
      budget -= tokens;
      includedPinned.push(idx);
    }
  }

  // Fill remaining budget with recent messages (newest→oldest, skip anchors/pins/last)
  const selectedRecent = [];
  const alreadySelected = new Set([...anchors, ...includedPinned]);
  if (!lastMsgInAnchorsOrPins) alreadySelected.add(lastMsgIdx);

  for (let i = messages.length - 2; i >= 0; i--) {
    if (alreadySelected.has(i)) continue;
    const tokens = estimateTokens(messages[i].content);
    if (budget - tokens >= 0) {
      budget -= tokens;
      selectedRecent.push(i);
    } else {
      break; // Stop filling once we can't fit the next message
    }
  }

  // Merge all selected indices
  const allSelected = new Set([
    ...anchors,
    ...includedPinned,
    ...selectedRecent
  ]);
  if (!lastMsgInAnchorsOrPins) allSelected.add(lastMsgIdx);

  // Sort by original index to preserve conversation order
  const sortedIndices = [...allSelected].sort((a, b) => a - b);

  // Build result with gap markers
  const result = [];
  for (let i = 0; i < sortedIndices.length; i++) {
    const idx = sortedIndices[i];
    const prevIdx = i > 0 ? sortedIndices[i - 1] : idx - 1;

    // Insert gap marker if messages are non-consecutive
    if (i > 0 && idx - prevIdx > 1) {
      result.push({ role: 'system', content: '[...earlier messages omitted...]' });
    }

    result.push({
      role: messages[idx].role,
      content: messages[idx].content
    });
  }

  return { messages: result, contextBlock };
}

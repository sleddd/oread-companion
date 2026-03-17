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
 * Build a compact context block from story notes, rolling summary, and extracted facts.
 */
function buildContextBlock(storyNotes, extractedFacts, rollingSummary, worldState, characterStances, globalContext, mode) {
  const parts = [];

  if (storyNotes && storyNotes.trim()) {
    parts.push(`[Story Notes]\n${storyNotes.trim()}`);
  }

  if (rollingSummary && rollingSummary.trim()) {
    parts.push(`[Conversation Summary]\n${rollingSummary.trim()}`);
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

  if (worldState && Object.keys(worldState).length > 0) {
    if (mode === 'roleplay') {
      // === Roleplay: [World State] ===
      const wsLines = [];
      if (worldState.currentTime) wsLines.push(`Time: ${worldState.currentTime}`);
      if (worldState.currentLocation) wsLines.push(`Location: ${worldState.currentLocation}`);

      if (worldState.locationTrail?.length > 0) {
        const recent = worldState.locationTrail.slice(-3);
        const crumbs = recent.map(loc => {
          const turnsAgo = (worldState.lastUpdated || 0) - (loc.departedTurn || 0);
          return `${loc.location} (left ${turnsAgo} turns ago)`;
        });
        wsLines.push(`Previously: ${crumbs.join(', ')}`);
      }

      if (worldState.presentCharacters?.length) wsLines.push(`Present: ${worldState.presentCharacters.join(', ')}`);

      if (worldState.knownCharacters) {
        const presentSet = new Set((worldState.presentCharacters || []).map(c => c.toLowerCase()));
        const lastSeen = [];
        for (const [key, data] of Object.entries(worldState.knownCharacters)) {
          if (!presentSet.has(key)) {
            const turnsAgo = (worldState.lastUpdated || 0) - (data.lastSeen || 0);
            if (turnsAgo <= 30) {
              const name = key.charAt(0).toUpperCase() + key.slice(1);
              lastSeen.push(`${name} (${turnsAgo} turns ago${data.lastLocation ? ', at ' + data.lastLocation : ''})`);
            }
          }
        }
        if (lastSeen.length > 0) wsLines.push(`Last seen: ${lastSeen.join(', ')}`);
      }

      if (worldState.ongoingEvents?.length) {
        const active = [];
        const fading = [];
        for (const event of worldState.ongoingEvents) {
          if (typeof event === 'string') {
            active.push(event);
          } else if (event.state === 'fading') {
            const age = (worldState.lastUpdated || 0) - (event.firstDetected || 0);
            fading.push(`${event.text} (first noted ${age} turns ago)`);
          } else {
            active.push(event.text);
          }
        }
        if (active.length > 0) wsLines.push(`Ongoing: ${active.join('; ')}`);
        if (fading.length > 0) wsLines.push(`Fading: ${fading.join('; ')}`);
      }

      if (worldState.mood) wsLines.push(`Atmosphere: ${worldState.mood}`);

      if (wsLines.length > 0) {
        parts.push(`[World State]\n${wsLines.join('\n')}`);
      }
    } else {
      // === Utility: [Session State] ===
      const ssLines = [];
      if (worldState.currentFocus) ssLines.push(`Focus: ${worldState.currentFocus}`);

      if (worldState.openQuestions?.length > 0) {
        for (const q of worldState.openQuestions) {
          if (q.state === 'active') ssLines.push(`Open: ${q.text}`);
          else if (q.state === 'fading') ssLines.push(`Fading: ${q.text}`);
        }
      }

      if (worldState.parkedItems?.length > 0) {
        for (const p of worldState.parkedItems) {
          ssLines.push(`Parked: ${typeof p === 'string' ? p : p.text}`);
        }
      }

      if (worldState.decisions?.length > 0) {
        for (const d of worldState.decisions) {
          if (d.state === 'active') ssLines.push(`Decided: ${d.text}`);
          else if (d.state === 'fading') {
            const age = (worldState.lastUpdated || 0) - (d.firstDetected || 0);
            ssLines.push(`Decided (${age} turns ago): ${d.text}`);
          }
        }
      }

      if (worldState.knownEntities) {
        const referenced = [];
        for (const [key, data] of Object.entries(worldState.knownEntities)) {
          const turnsAgo = (worldState.lastUpdated || 0) - (data.lastSeen || 0);
          // Only show promoted entities (seen in multiple turns), not single-mention candidates
          const isPromoted = data.firstSeen < data.lastSeen;
          if (turnsAgo <= 30 && isPromoted) {
            referenced.push(`${key}${data.context ? ' (' + data.context + ')' : ''}`);
          }
        }
        if (referenced.length > 0) ssLines.push(`Referenced: ${referenced.join(', ')}`);
      }

      if (ssLines.length > 0) {
        parts.push(`[Session State]\n${ssLines.join('\n')}`);
      }
    }

    // Active debates (both modes — already uses generic language)
    if (worldState.debates?.length > 0) {
      const activeDebates = worldState.debates
        .filter(d => d.state === 'active' || d.state === 'unresolved')
        .slice(-2);
      if (activeDebates.length > 0) {
        const debateLines = activeDebates.map(d => {
          const positions = d.positions
            ? Object.entries(d.positions).map(([name, stance]) => `${name} believes ${stance}`).join('; ')
            : '';
          const stateLabel = d.state === 'unresolved' ? 'Unresolved' : 'Active';
          return `${stateLabel}: ${d.topic}${positions ? ' — ' + positions : ''}${d.summary ? '. ' + d.summary : ''}`;
        });
        parts.push(`[Active Debates]\n${debateLines.join('\n')}`);
      }
    }

  }

  if (characterStances && Object.keys(characterStances).length > 0) {
    const stanceLines = [];
    for (const [charName, data] of Object.entries(characterStances)) {
      if (data.positions?.length > 0) {
        for (const pos of data.positions) {
          stanceLines.push(`${charName} ${pos.stance || pos.topic}${pos.reasoning ? ` (because: ${pos.reasoning})` : ''}`);
        }
      }
      if (data.dialecticMode) {
        stanceLines.push(`Dialectic approach: ${data.dialecticMode} — defend positions through reasoning, don't simply agree`);
      }
    }
    if (stanceLines.length > 0) {
      parts.push(`[Character Positions]\n${stanceLines.join('\n')}`);
    }
  }

  if (globalContext) {
    if (globalContext.relationship) {
      const rel = globalContext.relationship;
      const relLines = [];
      relLines.push(`You have met ${globalContext.userName || 'this person'} ${rel.interaction_count} times before.`);
      if (rel.relationship_summary) relLines.push(`Relationship: ${rel.relationship_summary}`);
      if (rel.trust_level !== undefined) {
        const level = rel.trust_level > 0.7 ? 'high' : rel.trust_level > 0.4 ? 'moderate' : 'low';
        relLines.push(`Trust level: ${level}`);
      }
      let moments = [];
      try { moments = JSON.parse(rel.key_moments || '[]'); } catch (e) { /* */ }
      if (moments.length > 0) {
        relLines.push(`Key shared moments: ${moments.slice(-3).join('; ')}`);
      }
      parts.push(`[Relationship History]\n${relLines.join('\n')}`);
    }

    if (globalContext.memories?.length > 0) {
      const memLines = globalContext.memories.map(m => `- ${m.content}`);
      parts.push(`[Long-term Memory]\n${memLines.join('\n')}`);
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
export function selectMessages({ messages, systemPrompt, storyNotes, extractedFacts, contextBudget, rollingSummary, worldState, characterStances, recalledMessages, globalContext, mode }) {
  if (!messages || messages.length === 0) {
    return { messages: [], contextBlock: '' };
  }

  let budget = contextBudget;

  // Deduct system prompt
  const systemTokens = estimateTokens(systemPrompt);
  budget -= systemTokens;

  // Build context block from story notes + extracted facts
  const contextBlock = buildContextBlock(storyNotes, extractedFacts, rollingSummary || '', worldState, characterStances, globalContext, mode);
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

  // Append recalled messages to context block if present
  let finalContextBlock = contextBlock;
  if (recalledMessages && recalledMessages.length > 0) {
    const recalledLines = recalledMessages.map(m =>
      `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.substring(0, 300)}${m.content.length > 300 ? '...' : ''}`
    );
    const recalledBlock = `[Recalled from Archive]\n${recalledLines.join('\n')}`;
    const recalledTokens = estimateTokens(recalledBlock);
    // Only include if we have budget remaining
    if (budget - recalledTokens >= 0) {
      finalContextBlock = finalContextBlock
        ? finalContextBlock + '\n\n' + recalledBlock
        : recalledBlock;
    }
  }

  return { messages: result, contextBlock: finalContextBlock };
}

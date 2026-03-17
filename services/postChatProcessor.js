/**
 * Post-chat processing: runs after assistant message is saved.
 * Handles fact extraction, summarization, state extraction, and debate tracking.
 * Extracted from server.js to keep the chat endpoint focused on request handling.
 */

import database from './database.js';
import { extractFacts, deduplicateAndCap } from './factExtractor.js';
import { summarizeMessages, shouldSummarize } from './summarizer.js';
import { extractWorldState, extractSessionState, diffWorldState } from './worldStateExtractor.js';
import { extractStances } from './stanceExtractor.js';
import { shouldExtractDebates, extractDebates } from './debateExtractor.js';
import { promoteToGlobalMemory, updateRelationship } from './globalMemory.js';

/**
 * Run all post-chat processing for a session turn.
 *
 * @param {Object} params
 * @param {string} params.sessionId - The session ID
 * @param {string} params.userContent - The user's message content
 * @param {string} params.assistantResponse - The assistant's response content
 * @param {string} params.model - The model used for this turn
 * @param {Object} params.settings - The current settings
 * @param {boolean} params.isDevelopment - Whether we're in dev mode
 */
export async function processPostChat({ sessionId, userContent, assistantResponse, model, settings, isDevelopment }) {
  const turnNumber = await database.get(
    `SELECT COUNT(*) as count FROM messages WHERE session_id = ?`,
    [sessionId]
  );
  const msgCount = turnNumber?.count || 0;
  const turn = Math.floor(msgCount / 2);
  const mode = settings?.mode || 'normal';

  // 1. Fact extraction (zero-inference, synchronous, both modes)
  try {
    const newFacts = extractFacts(userContent, assistantResponse, turn);
    if (newFacts.length > 0) {
      const factSession = await database.get(
        `SELECT extracted_facts FROM sessions WHERE id = ?`,
        [sessionId]
      );
      const existing = JSON.parse(factSession?.extracted_facts || '[]');
      const merged = deduplicateAndCap(existing, newFacts);
      await database.run(
        `UPDATE sessions SET extracted_facts = ? WHERE id = ?`,
        [JSON.stringify(merged), sessionId]
      );
    }
  } catch (err) {
    console.error('Fact extraction error:', err);
  }

  // 2. Summarization (background, non-blocking, both modes)
  const autoSummarize = settings?.general?.autoSummarize !== false;
  if (autoSummarize) {
    try {
      const sumSession = await database.get(
        `SELECT last_summarized_at, rolling_summary FROM sessions WHERE id = ?`,
        [sessionId]
      );
      const lastSummarizedAt = sumSession?.last_summarized_at || 0;

      if (shouldSummarize(msgCount, lastSummarizedAt)) {
        setImmediate(async () => {
          try {
            const unsummarized = await database.all(
              `SELECT role, content FROM messages WHERE session_id = ? ORDER BY timestamp ASC LIMIT ? OFFSET ?`,
              [sessionId, msgCount - lastSummarizedAt, lastSummarizedAt]
            );
            const newSummary = await summarizeMessages(model, unsummarized, sumSession?.rolling_summary || '');
            await database.run(
              `UPDATE sessions SET rolling_summary = ?, last_summarized_at = ? WHERE id = ?`,
              [newSummary, msgCount, sessionId]
            );
            if (isDevelopment) {
              console.log(`📝 Summarized session ${sessionId} at message ${msgCount}`);
            }
          } catch (err) {
            console.error('Background summarization failed:', err);
          }
        });
      }
    } catch (err) {
      console.error('Summarization check error:', err);
    }
  }

  // 3. State extraction (both modes, zero-inference)
  try {
    const wsSession = await database.get(
      `SELECT world_state, world_state_history FROM sessions WHERE id = ?`,
      [sessionId]
    );
    const currentState = JSON.parse(wsSession?.world_state || '{}');

    // Dispatch to mode-specific extractor
    const updatedState = mode === 'roleplay'
      ? extractWorldState(userContent, assistantResponse, currentState, turn, settings)
      : extractSessionState(userContent, assistantResponse, currentState, turn);

    // Diff and log state history (works for both modes via config-driven fields)
    const changes = diffWorldState(currentState, updatedState, turn);

    // Add resolved events/questions to history
    if (updatedState._resolvedEvents?.length > 0) {
      const resolvedField = mode === 'roleplay' ? 'ongoingEvents' : 'openQuestions';
      for (const event of updatedState._resolvedEvents) {
        changes.push({
          turn,
          field: resolvedField,
          from: event.text,
          action: 'resolved'
        });
      }
    }

    // Clean internal field before saving
    delete updatedState._resolvedEvents;

    if (changes.length > 0) {
      const history = JSON.parse(wsSession?.world_state_history || '[]');
      history.push(...changes);
      const cappedHistory = history.slice(-50);
      await database.run(
        `UPDATE sessions SET world_state = ?, world_state_history = ? WHERE id = ?`,
        [JSON.stringify(updatedState), JSON.stringify(cappedHistory), sessionId]
      );
    } else {
      await database.run(
        `UPDATE sessions SET world_state = ? WHERE id = ?`,
        [JSON.stringify(updatedState), sessionId]
      );
    }
  } catch (err) {
    console.error('State extraction error:', err);
  }

  // 4. Character stance extraction (roleplay mode only, zero-inference)
  if (mode === 'roleplay') {
    try {
      const stSession = await database.get(
        `SELECT character_stances FROM sessions WHERE id = ?`,
        [sessionId]
      );
      const currentStances = JSON.parse(stSession?.character_stances || '{}');
      const charName = settings?.roleplay?.character?.name || 'Character';
      const characterTraits = settings?.roleplay?.character?.traits || {};

      const stancesInput = Object.keys(currentStances).length > 0 ? currentStances : { [charName]: {} };
      const updatedStances = extractStances(assistantResponse, userContent, stancesInput, characterTraits);
      await database.run(
        `UPDATE sessions SET character_stances = ? WHERE id = ?`,
        [JSON.stringify(updatedStances), sessionId]
      );
    } catch (err) {
      console.error('Stance extraction error:', err);
    }
  }

  // 5. Debate extraction (both modes, inference-based, background, non-blocking)
  if (shouldExtractDebates(turn)) {
    setImmediate(async () => {
      try {
        const recentMsgs = await database.all(
          `SELECT role, content FROM messages WHERE session_id = ? ORDER BY timestamp DESC LIMIT 20`,
          [sessionId]
        );
        recentMsgs.reverse();

        const wsDebate = await database.get(
          `SELECT world_state FROM sessions WHERE id = ?`,
          [sessionId]
        );
        const currentWS = JSON.parse(wsDebate?.world_state || '{}');
        const existingDebates = currentWS.debates || [];

        const updatedDebates = await extractDebates(model, recentMsgs, existingDebates, mode);

        for (const debate of updatedDebates) {
          if (!debate.lastRaised) debate.lastRaised = turn;
        }

        currentWS.debates = updatedDebates;
        await database.run(
          `UPDATE sessions SET world_state = ? WHERE id = ?`,
          [JSON.stringify(currentWS), sessionId]
        );

        if (isDevelopment) {
          console.log(`🗣️ Extracted ${updatedDebates.length} debates for session ${sessionId}`);
        }
      } catch (err) {
        console.error('Debate extraction error:', err);
      }
    });
  }

  // 6. Cross-session memory promotion (background, non-blocking)
  const crossSessionEnabled = settings?.general?.crossSessionMemory !== false;
  if (crossSessionEnabled) {
    setImmediate(async () => {
      try {
        const factSession = await database.get(
          `SELECT extracted_facts, rolling_summary FROM sessions WHERE id = ?`,
          [sessionId]
        );
        const facts = JSON.parse(factSession?.extracted_facts || '[]');
        await promoteToGlobalMemory(sessionId, facts, factSession?.rolling_summary || '');

        const charName = settings?.roleplay?.character?.name;
        const userName = settings?.userPersona?.name;
        if (charName && userName) {
          await updateRelationship(charName, userName, sessionId, factSession?.rolling_summary || '');
        }
      } catch (err) {
        console.error('Cross-session memory promotion error:', err);
      }
    });
  }
}

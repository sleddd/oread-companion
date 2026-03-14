import { ChatOllama } from '@langchain/ollama';
import database from './database.js';

class ExtractionAgentService {
  constructor() {
    this.llm = new ChatOllama({
      baseUrl: 'http://localhost:11434',
      model: 'llama2',
      temperature: 0.3  // Low temp for consistent extraction
    });
  }

  /**
   * Analyze conversation for setting updates
   */
  async analyzeConversation(sessionId, settings) {
    try {
      // Get last 10 messages
      const messages = await database.all(
        `SELECT * FROM messages
         WHERE session_id = ?
         ORDER BY timestamp DESC
         LIMIT 10`,
        [sessionId]
      );

      messages.reverse(); // Chronological order

      // Filter to user and assistant messages
      const conversationMessages = messages.filter(m =>
        m.role === 'user' || m.role === 'assistant'
      );

      if (conversationMessages.length === 0) {
        return {
          success: true,
          proposed_updates: [],
          message: 'No messages to analyze'
        };
      }

      // Build conversation text
      const conversationText = conversationMessages
        .map(m => `${m.role}: ${m.content}`)
        .join('\n\n');

      // Get current character settings
      const characterName = settings.roleplay?.singleCharacter?.identity?.name || 'Character';
      const currentPersonality = settings.roleplay?.singleCharacter?.core?.personality || '';
      const currentBackstory = settings.roleplay?.singleCharacter?.core?.backstory || '';

      // Create extraction prompt
      const extractionPrompt = `Analyze the following roleplay conversation and extract any NEW information about the character "${characterName}" that is NOT already documented in their settings.

Current Personality: ${currentPersonality}
Current Backstory: ${currentBackstory}

Conversation:
${conversationText}

Task:
1. Identify any NEW personality traits, preferences, or characteristics revealed
2. Identify any NEW backstory details, experiences, or history mentioned
3. Identify any NEW knowledge, skills, or expertise demonstrated
4. For each finding, provide:
   - Category (personality, backstory, knowledge)
   - New information (concise)
   - Confidence (0.0-1.0)

Only include information that is:
- Clearly stated or strongly implied
- NOT already in the current settings
- Worth preserving for future conversations

Return results as JSON array with format:
[
  {
    "category": "personality",
    "addition": "enjoys classical music",
    "confidence": 0.8,
    "evidence": "Quote from conversation"
  }
]

If no new information found, return empty array: []`;

      // Query LLM
      const response = await this.llm.invoke(extractionPrompt);

      // Parse response
      const proposedUpdates = this.parseExtractionResponse(response.content);

      return {
        success: true,
        proposed_updates: proposedUpdates,
        analyzed_messages: conversationMessages.length
      };
    } catch (error) {
      console.error('Extraction analysis error:', error);
      return {
        success: false,
        error: error.message,
        proposed_updates: []
      };
    }
  }

  /**
   * Parse LLM extraction response
   */
  parseExtractionResponse(responseText) {
    try {
      // Try to extract JSON from response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.warn('No JSON array found in extraction response');
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate and filter
      return parsed.filter(item =>
        item.category &&
        item.addition &&
        typeof item.confidence === 'number' &&
        item.confidence >= 0.5  // Only medium+ confidence
      );
    } catch (error) {
      console.error('Failed to parse extraction response:', error);
      return [];
    }
  }

  /**
   * Apply approved updates to settings
   */
  applyUpdates(settings, updates) {
    const updatedSettings = JSON.parse(JSON.stringify(settings)); // Deep clone

    for (const update of updates) {
      const { category, addition } = update;

      if (!updatedSettings.roleplay?.singleCharacter?.core) {
        continue;
      }

      const core = updatedSettings.roleplay.singleCharacter.core;

      switch (category) {
        case 'personality':
          if (core.personality) {
            core.personality += `; ${addition}`;
          } else {
            core.personality = addition;
          }
          break;

        case 'backstory':
          if (core.backstory) {
            core.backstory += `\n\n${addition}`;
          } else {
            core.backstory = addition;
          }
          break;

        case 'knowledge':
          if (core.knowledge) {
            core.knowledge += `; ${addition}`;
          } else {
            core.knowledge = addition;
          }
          break;
      }
    }

    return updatedSettings;
  }

  /**
   * Check if analysis should run (every 5 messages)
   */
  async shouldRunAnalysis(sessionId) {
    try {
      const result = await database.all(
        'SELECT message_count FROM sessions WHERE id = ?',
        [sessionId]
      );

      const messageCount = result[0]?.message_count || 0;
      return messageCount > 0 && messageCount % 5 === 0;
    } catch (error) {
      console.error('Error checking analysis trigger:', error);
      return false;
    }
  }
}

export default new ExtractionAgentService();

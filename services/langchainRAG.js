import { ChatOllama, OllamaEmbeddings } from '@langchain/ollama';
import mcpClient from './mcpClient.js';
import vectorSearch from './vectorSearch.js';
import database from './database.js';
import crypto from 'crypto';
import { CONFIG } from '../config/index.js';

class LangChainRAGService {
  constructor() {
    // Initialize Ollama LLM
    this.llm = new ChatOllama({
      baseUrl: CONFIG.OLLAMA_URL,
      model: CONFIG.OLLAMA_CHAT_MODEL,
      temperature: 0.7
    });

    // Initialize embeddings model
    this.embeddings = new OllamaEmbeddings({
      baseUrl: CONFIG.OLLAMA_URL,
      model: CONFIG.OLLAMA_EMBED_MODEL
    });
  }

  /**
   * Query with RAG - combines recent messages with semantic search
   */
  async queryWithRAG(sessionId, userMessage, settings, model = CONFIG.OLLAMA_CHAT_MODEL) {
    try {
      // 1. Get recent messages (last 20)
      const recentMessages = await mcpClient.querySQLite(
        `SELECT * FROM messages
         WHERE session_id = ?
         ORDER BY timestamp DESC
         LIMIT 20`,
        [sessionId]
      );

      // Reverse to get chronological order
      recentMessages.reverse();

      // 2. Create embedding for user query
      const queryVector = await this.embeddings.embedQuery(userMessage);

      // 3. Semantic search for relevant context using SQLite vectors
      let vectorResults = [];
      try {
        const searchResults = await vectorSearch.search(
          sessionId,
          queryVector,
          5,
          true,
          CONFIG.OLLAMA_EMBED_MODEL
        );

        // Load message content for each result
        for (const result of searchResults) {
          const message = await database.get(
            'SELECT content, role, timestamp FROM messages WHERE id = ?',
            [result.messageId]
          );
          if (message) {
            vectorResults.push({
              text: message.content,
              role: message.role,
              timestamp: message.timestamp,
              score: result.score
            });
          }
        }
      } catch (error) {
        console.warn('Vector search failed (vectors may not exist yet):', error.message);
      }

      // 4. Build hybrid context
      const context = this.buildContext(recentMessages, vectorResults, settings);

      // 5. Update LLM model if different
      if (this.llm.model !== model) {
        this.llm = new ChatOllama({
          baseUrl: CONFIG.OLLAMA_URL,
          model,
          temperature: settings.general?.temperature || 0.7
        });
      }

      return {
        context,
        recentMessageCount: recentMessages.length,
        vectorResultCount: vectorResults.length
      };
    } catch (error) {
      console.error('RAG query error:', error);
      throw error;
    }
  }

  /**
   * Build hybrid context from recent messages and vector search results
   */
  buildContext(recentMessages, vectorResults, settings) {
    const contextParts = [];

    // Add vector search results as context (if any)
    if (vectorResults.length > 0) {
      contextParts.push('--- Relevant Past Context ---');
      vectorResults.forEach((result, idx) => {
        contextParts.push(`[${idx + 1}] ${result.text}`);
      });
      contextParts.push('');
    }

    // Add recent messages
    contextParts.push('--- Recent Conversation ---');
    recentMessages.forEach(msg => {
      contextParts.push(`${msg.role}: ${msg.content}`);
    });

    return contextParts.join('\n');
  }

  /**
   * Add documents to vector store (background embeddings)
   * Now stores vectors directly in SQLite instead of FAISS
   */
  async addDocuments(sessionId, messages) {
    try {
      // Filter out system messages and very short messages
      const documentsToEmbed = messages.filter(msg =>
        msg.role !== 'system' && msg.content.length > 20
      );

      if (documentsToEmbed.length === 0) {
        return { success: true, embedded: 0 };
      }

      // Create embeddings for messages
      const texts = documentsToEmbed.map(msg => msg.content);
      const vectors = await this.embeddings.embedDocuments(texts);

      // Store vectors directly in SQLite
      for (let i = 0; i < documentsToEmbed.length; i++) {
        const msg = documentsToEmbed[i];
        const vector = vectors[i];

        // Calculate checksum
        const checksum = vectorSearch.calculateChecksum(vector);

        // Insert into message_vectors table
        await database.run(`
          INSERT INTO message_vectors (
            id, message_id, session_id, vector, dimension,
            model, model_version, checksum
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (id) DO NOTHING
        `, [
          crypto.randomUUID(),
          msg.id,
          sessionId,
          vectorSearch.float32ArrayToBlob(vector),
          vector.length,
          CONFIG.OLLAMA_EMBED_MODEL,
          '1.0',
          checksum
        ]);

        // Mark message as embedded
        await database.run(
          'UPDATE messages SET embedded = 1 WHERE id = ?',
          [msg.id]
        );
      }

      return {
        success: true,
        embedded: documentsToEmbed.length
      };
    } catch (error) {
      console.error('Add documents error:', error);
      throw error;
    }
  }

  /**
   * Get index statistics for a session
   * Now queries SQLite instead of FAISS
   */
  async getIndexStats(sessionId) {
    try {
      const result = await database.get(
        'SELECT COUNT(*) as count FROM message_vectors WHERE session_id = ?',
        [sessionId]
      );

      return {
        success: true,
        session_id: sessionId,
        document_count: result?.count || 0
      };
    } catch (error) {
      console.error('Get index stats error:', error);
      return {
        success: false,
        error: error.message,
        session_id: sessionId,
        document_count: 0
      };
    }
  }

  /**
   * Estimate tokens (rough approximation)
   */
  estimateTokens(text) {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if RAG should be used for this session
   */
  async shouldUseRAG(sessionId, settings) {
    if (!settings.general?.memory) {
      return false;
    }

    // Check message count
    const countResult = await mcpClient.querySQLite(
      'SELECT COUNT(*) as count FROM messages WHERE session_id = ?',
      [sessionId]
    );

    const messageCount = countResult[0]?.count || 0;
    return messageCount > 50;
  }

  /**
   * Build message array for chat (without RAG)
   */
  async getRecentMessages(sessionId, limit = 20) {
    const messages = await mcpClient.querySQLite(
      `SELECT * FROM messages
       WHERE session_id = ?
       ORDER BY timestamp DESC
       LIMIT ?`,
      [sessionId, limit]
    );

    // Reverse to get chronological order
    return messages.reverse();
  }
}

export default new LangChainRAGService();

import { ChatOllama, OllamaEmbeddings } from '@langchain/ollama';
import vectorSearch from './vectorSearch.js';
import database from './database.js';
import { CONFIG } from '../config/index.js';

class LangChainRAGService {
  constructor() {
    this.llm = new ChatOllama({
      baseUrl: CONFIG.OLLAMA_URL,
      model: CONFIG.OLLAMA_CHAT_MODEL,
      temperature: 0.7
    });

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
      const recentMessages = await database.all(
        `SELECT * FROM messages
         WHERE session_id = ?
         ORDER BY timestamp DESC
         LIMIT 20`,
        [sessionId]
      );
      recentMessages.reverse();

      // 2. Embed the user query
      const queryVector = await this.embeddings.embedQuery(userMessage);

      // 3. Semantic search via FAISS
      let vectorResults = [];
      try {
        const searchResults = await vectorSearch.search(sessionId, queryVector, 5);
        vectorResults = searchResults.map(r => ({
          text: r.content,
          role: r.role,
          timestamp: r.timestamp,
          score: r.score
        }));
      } catch (error) {
        console.warn('Vector search failed:', error.message);
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

    if (vectorResults.length > 0) {
      contextParts.push('--- Relevant Past Context ---');
      vectorResults.forEach((result, idx) => {
        contextParts.push(`[${idx + 1}] ${result.text}`);
      });
      contextParts.push('');
    }

    contextParts.push('--- Recent Conversation ---');
    recentMessages.forEach(msg => {
      contextParts.push(`${msg.role}: ${msg.content}`);
    });

    return contextParts.join('\n');
  }

  /**
   * Embed and index messages via FAISS (background job)
   */
  async addDocuments(sessionId, messages) {
    try {
      const documentsToEmbed = messages.filter(msg =>
        msg.role !== 'system' && msg.content.length > 20
      );

      if (documentsToEmbed.length === 0) {
        return { success: true, embedded: 0 };
      }

      await vectorSearch.addDocuments(sessionId, documentsToEmbed);

      for (const msg of documentsToEmbed) {
        await database.run(
          'UPDATE messages SET embedded = 1 WHERE id = ?',
          [msg.id]
        );
      }

      return { success: true, embedded: documentsToEmbed.length };
    } catch (error) {
      console.error('Add documents error:', error);
      throw error;
    }
  }

  /**
   * Get vector index stats for a session
   */
  async getIndexStats(sessionId) {
    try {
      const count = await vectorSearch.getDocumentCount(sessionId);
      return {
        success: true,
        session_id: sessionId,
        document_count: count
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
   * Search vectors for a pre-computed query embedding (used by memory route)
   */
  async searchVectors(sessionId, queryVector, topK = 5) {
    const results = await vectorSearch.search(sessionId, queryVector, topK);
    return { results };
  }

  estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if RAG should be used for this session
   */
  async shouldUseRAG(sessionId, settings) {
    if (!settings.general?.memory) {
      return false;
    }

    const countResult = await database.all(
      'SELECT COUNT(*) as count FROM messages WHERE session_id = ?',
      [sessionId]
    );

    const messageCount = countResult[0]?.count || 0;
    return messageCount > 50;
  }

  /**
   * Get recent messages for non-RAG chat
   */
  async getRecentMessages(sessionId, limit = 20) {
    const messages = await database.all(
      `SELECT * FROM messages
       WHERE session_id = ?
       ORDER BY timestamp DESC
       LIMIT ?`,
      [sessionId, limit]
    );

    return messages.reverse();
  }
}

export default new LangChainRAGService();

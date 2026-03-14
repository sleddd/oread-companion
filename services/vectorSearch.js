import { FaissStore } from '@langchain/community/vectorstores/faiss';
import { OllamaEmbeddings } from '@langchain/ollama';
import { Document } from '@langchain/core/documents';
import path from 'path';
import fs from 'fs/promises';
import { CONFIG } from '../config/index.js';

const VECTORS_DIR = path.join(process.cwd(), 'data', 'vectors');

class FaissVectorSearch {
  constructor() {
    this.embeddings = new OllamaEmbeddings({
      baseUrl: CONFIG.OLLAMA_URL,
      model: CONFIG.OLLAMA_EMBED_MODEL
    });
  }

  _sessionDir(sessionId) {
    return path.join(VECTORS_DIR, sessionId);
  }

  async _indexExists(sessionId) {
    try {
      await fs.access(path.join(this._sessionDir(sessionId), 'faiss.index'));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Semantic search using a pre-computed query vector.
   * Returns [{ messageId, content, role, timestamp, score }]
   */
  async search(sessionId, queryVector, topK = 5) {
    if (!await this._indexExists(sessionId)) return [];

    const store = await FaissStore.load(this._sessionDir(sessionId), this.embeddings);
    const results = await store.similaritySearchVectorWithScore(queryVector, topK);

    return results.map(([doc, distance]) => ({
      messageId: doc.metadata.messageId,
      content: doc.pageContent,
      role: doc.metadata.role,
      timestamp: doc.metadata.timestamp,
      score: 1 / (1 + distance)  // L2 distance → similarity proxy (0–1)
    }));
  }

  /**
   * Embed and index messages into the session's FAISS store.
   * messages: [{ id, content, role, timestamp }]
   */
  async addDocuments(sessionId, messages) {
    if (messages.length === 0) return;

    const docs = messages.map(msg => new Document({
      pageContent: msg.content,
      metadata: { messageId: msg.id, role: msg.role, timestamp: msg.timestamp }
    }));

    const dir = this._sessionDir(sessionId);
    await fs.mkdir(dir, { recursive: true });

    if (await this._indexExists(sessionId)) {
      const store = await FaissStore.load(dir, this.embeddings);
      await store.addDocuments(docs);
      await store.save(dir);
    } else {
      const store = await FaissStore.fromDocuments(docs, this.embeddings);
      await store.save(dir);
    }
  }

  /**
   * Total number of vectors indexed for a session.
   */
  async getDocumentCount(sessionId) {
    if (!await this._indexExists(sessionId)) return 0;
    const store = await FaissStore.load(this._sessionDir(sessionId), this.embeddings);
    return store.index.ntotal;
  }
}

export default new FaissVectorSearch();

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'chat.db');

class DatabaseService {
  constructor() {
    this.db = null;
  }

  async initialize() {
    try {
      // Ensure data directory exists
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        console.log('✅ Created /data directory');
      }

      // Open database connection
      this.db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database
      });

      console.log('✅ Connected to SQLite database');

      // CRITICAL: Enable WAL mode for concurrent reads/writes
      await this.db.exec('PRAGMA journal_mode = WAL;');
      console.log('✅ WAL mode enabled - concurrent access safe');

      // Enable foreign key constraints (MUST be done per connection in SQLite)
      await this.db.exec('PRAGMA foreign_keys = ON;');
      console.log('✅ Foreign key constraints enabled');

      // Create schema
      await this.createTables();

      console.log('✅ Database schema initialized');

      return this.db;
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw error;
    }
  }

  async createTables() {
    // Migration: drop old SQLite vector table (vectors now stored in FAISS files)
    await this.db.exec(`DROP TABLE IF EXISTS message_vectors;`);
    await this.db.exec(`UPDATE messages SET embedded = 0, embedding_id = NULL WHERE embedded = 1;`);

    // Sessions table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        character_name TEXT,
        character_mode TEXT,
        mode TEXT NOT NULL,
        settings_snapshot TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        message_count INTEGER DEFAULT 0,
        last_message_at DATETIME,
        archived BOOLEAN DEFAULT 0,
        metadata TEXT
      );
    `);

    // Messages table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        model TEXT,
        system_prompt_hash TEXT,
        token_count INTEGER,
        embedded BOOLEAN DEFAULT 0,
        embedding_id TEXT,
        extracted_data TEXT,
        extraction_status TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
    `);


    // Create indexes
    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_session
      ON messages(session_id, timestamp DESC);
    `);

    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_role
      ON messages(role);
    `);

    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_updated
      ON sessions(updated_at DESC);
    `);

  }

  // Helper methods
  async all(sql, params = []) {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return await this.db.all(sql, params);
  }

  async run(sql, params = []) {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return await this.db.run(sql, params);
  }

  async get(sql, params = []) {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return await this.db.get(sql, params);
  }

  async transaction(fn) {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    await this.db.run('BEGIN');
    try {
      const result = await fn();
      await this.db.run('COMMIT');
      return result;
    } catch (error) {
      await this.db.run('ROLLBACK');
      throw error;
    }
  }

  async close() {
    if (this.db) {
      await this.db.close();
      console.log('✅ Database connection closed');
    }
  }
}

export default new DatabaseService();

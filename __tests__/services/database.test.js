import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import database from '../../services/database.js';

// Inject a fresh in-memory SQLite db into the singleton before each test
// so we test the real transaction/run/get/all logic without touching disk.

async function openInMemory() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec('PRAGMA foreign_keys = ON;');
  return db;
}

describe('DatabaseService', () => {
  let testDb;

  beforeEach(async () => {
    testDb = await openInMemory();
    await testDb.exec(`
      CREATE TABLE items (
        id   TEXT PRIMARY KEY,
        val  TEXT NOT NULL
      )
    `);
    database.db = testDb; // inject into singleton
  });

  afterEach(async () => {
    database.db = null;
    await testDb.close();
  });

  // ─── transaction ────────────────────────────────────────────────────────

  describe('transaction', () => {
    it('commits all operations on success', async () => {
      await database.transaction(async () => {
        await database.run('INSERT INTO items VALUES (?, ?)', ['1', 'a']);
        await database.run('INSERT INTO items VALUES (?, ?)', ['2', 'b']);
      });

      const rows = await database.all('SELECT * FROM items ORDER BY id');
      expect(rows).toHaveLength(2);
      expect(rows[0].val).toBe('a');
    });

    it('rolls back ALL operations when the callback throws', async () => {
      await expect(
        database.transaction(async () => {
          await database.run('INSERT INTO items VALUES (?, ?)', ['3', 'c']);
          throw new Error('intentional failure');
        })
      ).rejects.toThrow('intentional failure');

      const rows = await database.all('SELECT * FROM items');
      expect(rows).toHaveLength(0); // rolled back
    });

    it('rethrows the original error after rolling back', async () => {
      const err = new Error('specific error');
      await expect(
        database.transaction(async () => { throw err; })
      ).rejects.toBe(err);
    });

    it('returns the value returned by the callback', async () => {
      const result = await database.transaction(async () => {
        await database.run('INSERT INTO items VALUES (?, ?)', ['x', 'y']);
        return 'done';
      });
      expect(result).toBe('done');
    });
  });

  // ─── run / get / all ────────────────────────────────────────────────────

  describe('run / get / all', () => {
    it('run inserts a row', async () => {
      await database.run('INSERT INTO items VALUES (?, ?)', ['k', 'v']);
      const row = await database.get('SELECT * FROM items WHERE id = ?', ['k']);
      expect(row).toMatchObject({ id: 'k', val: 'v' });
    });

    it('get returns undefined for a missing row', async () => {
      const row = await database.get('SELECT * FROM items WHERE id = ?', ['nope']);
      expect(row).toBeUndefined();
    });

    it('all returns every row', async () => {
      await database.run('INSERT INTO items VALUES (?, ?)', ['a', '1']);
      await database.run('INSERT INTO items VALUES (?, ?)', ['b', '2']);
      const rows = await database.all('SELECT * FROM items ORDER BY id');
      expect(rows).toHaveLength(2);
    });

    it('all returns an empty array when the table is empty', async () => {
      const rows = await database.all('SELECT * FROM items');
      expect(rows).toEqual([]);
    });
  });

  // ─── guard: uninitialized ────────────────────────────────────────────────

  describe('uninitialized guards', () => {
    beforeEach(() => { database.db = null; });

    it('run throws when db is null', async () => {
      await expect(database.run('SELECT 1')).rejects.toThrow(/not initialized/i);
    });

    it('get throws when db is null', async () => {
      await expect(database.get('SELECT 1')).rejects.toThrow(/not initialized/i);
    });

    it('all throws when db is null', async () => {
      await expect(database.all('SELECT 1')).rejects.toThrow(/not initialized/i);
    });

    it('transaction throws when db is null', async () => {
      await expect(database.transaction(async () => {})).rejects.toThrow(/not initialized/i);
    });
  });
});

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import logger from '../lib/logger.ts';

export function getSafeDatabase(dbPath: string): Database.Database {
  let instance: Database.Database | null = null;
  try {
    instance = new Database(dbPath);
    
    // Perform a quick integrity check
    const result = instance.pragma('integrity_check');
    if (result !== 'ok' && JSON.stringify(result) !== '[{"integrity_check":"ok"}]') {
      throw new Error(`Integrity check failed: ${JSON.stringify(result)}`);
    }
    
    return instance;
  } catch (err: any) {
    const msg = err?.message || String(err);
    logger?.warn?.(`SQLite database at ${dbPath} is malformed or invalid (${msg}). Recreating database...`) ||
      console.warn(`SQLite database at ${dbPath} is malformed or invalid (${msg}). Recreating database...`);

    if (instance) {
      try {
        instance.close();
      } catch (_) {}
    }

    const backupPath = `${dbPath}.corrupted.${Date.now()}`;
    if (fs.existsSync(dbPath)) {
      try {
        fs.renameSync(dbPath, backupPath);
      } catch (e) {
        logger?.error?.('Failed to rename corrupted sqlite file:', e);
      }
    }
    // ... rest of logic for unlinking WAL/SHM
    if (fs.existsSync(`${dbPath}-wal`)) {
      try {
        fs.unlinkSync(`${dbPath}-wal`);
      } catch (_) {}
    }
    if (fs.existsSync(`${dbPath}-shm`)) {
      try {
        fs.unlinkSync(`${dbPath}-shm`);
      } catch (_) {}
    }

    return new Database(dbPath);
  }
}

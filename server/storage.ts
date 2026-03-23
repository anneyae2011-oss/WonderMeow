import { IStorage } from './types.js';

let _storage: IStorage | undefined;

export function getStorage(): IStorage {
  if (!_storage) {
    throw new Error("Storage not initialized! Call initStorage() first.");
  }
  return _storage;
}

export async function initStorage() {
  if (_storage) return;

  if (process.env.DATABASE_URL) {
    try {
      console.log("[STORAGE] Initializing PostgresStorage (Vercel/Production)");
      const { PostgresStorage } = await import('./postgres-storage.js');
      _storage = new PostgresStorage();
    } catch (err) {
      console.error("[STORAGE] PostgresStorage initialization failed:", err);
      const { MemoryStorage } = await import('./memory-storage.js');
      _storage = new MemoryStorage();
    }
  } else {
    try {
      console.log("[STORAGE] Initializing SQLiteStorage (Local/Development)");
      const sqliteModule = './sqlite-storage.js';
      const betterPkg = 'better-sqlite3';
      const { SQLiteStorage } = await import(sqliteModule);
      // @ts-ignore
      const { default: DatabaseClass } = await import(betterPkg);
      _storage = new SQLiteStorage(DatabaseClass);
    } catch (err) {
      console.error("[STORAGE] SQLite initialization failed (normal on Vercel without DATABASE_URL):", err);
      // Fallback to memory storage to prevent undefined storage
      const { MemoryStorage } = await import('./memory-storage.js');
      _storage = new MemoryStorage();
    }
  }
}

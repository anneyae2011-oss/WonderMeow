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

  const hasDatabaseUrl = !!process.env.DATABASE_URL;
  console.log(`[STORAGE] initStorage starting. hasDatabaseUrl: ${hasDatabaseUrl}`);

  if (hasDatabaseUrl) {
    try {
      console.log("[STORAGE] Attempting to initialize PostgresStorage...");
      const { PostgresStorage } = await import('./postgres-storage.js');
      _storage = new PostgresStorage();
      console.log("[STORAGE] PostgresStorage initialization successful.");
    } catch (err: any) {
      console.error("[STORAGE] [CRITICAL] PostgresStorage initialization failed:", err.message);
      console.error("[STORAGE] Falling back to MemoryStorage. DATA WILL NOT PERSIST!");
      const { MemoryStorage } = await import('./memory-storage.js');
      _storage = new MemoryStorage();
    }
  } else {
    try {
      if (process.env.VERCEL) {
        console.warn("[STORAGE] [WARNING] Vercel detected but DATABASE_URL is missing. Data persistence will be ephemeral!");
      }
      console.log("[STORAGE] Initializing SQLiteStorage (Local/Development)...");
      const sqliteModule = './sqlite-storage.js';
      const betterPkg = 'better-sqlite3';
      const { SQLiteStorage } = await import(sqliteModule);
      // @ts-ignore
      const { default: DatabaseClass } = await import(betterPkg);
      _storage = new SQLiteStorage(DatabaseClass);
      console.log("[STORAGE] SQLiteStorage initialization successful.");
    } catch (err: any) {
      console.error("[STORAGE] SQLite initialization failed:", err.message);
      console.log("[STORAGE] Falling back to MemoryStorage.");
      const { MemoryStorage } = await import('./memory-storage.js');
      _storage = new MemoryStorage();
    }
  }
}

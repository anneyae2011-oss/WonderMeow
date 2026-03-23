import { randomUUID } from "crypto";
import * as path from "path";

export interface ProviderAccount {
  id: string;
  username: string;
  password: string;
  sessionToken?: string;
  createdAt: number;
}

export class ProviderAuthStorage {
  private db: any | null = null;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.cwd(), "providers.db");
  }

  private dbPath: string;

  private async ensureDb() {
    if (this.db) return;
    try {
      const { default: Database } = await import("better-sqlite3");
      this.db = new Database(this.dbPath);
      this.initializeDatabase();
    } catch (err) {
      console.error("ProviderAuthStorage: Failed to load better-sqlite3. Disabling provider auth storage.", err);
      // In a real serverless env, we might want a mock here.
      throw new Error("Provider storage unavailable");
    }
  }

  private initializeDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS provider_accounts (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        session_token TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_provider_accounts_username ON provider_accounts(username);
      CREATE INDEX IF NOT EXISTS idx_provider_accounts_session ON provider_accounts(session_token);
    `);
  }

  private rowToProvider(row: any): ProviderAccount {
    return {
      id: row.id,
      username: row.username,
      password: row.password,
      sessionToken: row.session_token ?? undefined,
      createdAt: row.created_at,
    };
  }

  async getProviderByUsername(username: string): Promise<ProviderAccount | undefined> {
    await this.ensureDb();
    const row = this.db.prepare("SELECT * FROM provider_accounts WHERE username = ?").get(username);
    return row ? this.rowToProvider(row) : undefined;
  }

  async getProviderById(id: string): Promise<ProviderAccount | undefined> {
    await this.ensureDb();
    const row = this.db.prepare("SELECT * FROM provider_accounts WHERE id = ?").get(id);
    return row ? this.rowToProvider(row) : undefined;
  }

  async getProviderBySessionToken(sessionToken: string): Promise<ProviderAccount | undefined> {
    await this.ensureDb();
    const row = this.db.prepare("SELECT * FROM provider_accounts WHERE session_token = ?").get(sessionToken);
    return row ? this.rowToProvider(row) : undefined;
  }

  async getProviderAccounts(): Promise<ProviderAccount[]> {
    await this.ensureDb();
    const rows = this.db.prepare("SELECT * FROM provider_accounts ORDER BY created_at DESC").all();
    return rows.map((row) => this.rowToProvider(row));
  }

  async createProviderAccount(username: string, passwordHash: string): Promise<ProviderAccount> {
    await this.ensureDb();
    const id = randomUUID();
    const createdAt = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO provider_accounts (id, username, password, created_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, username, passwordHash, createdAt);
    return {
      id,
      username,
      password: passwordHash,
      createdAt,
    };
  }

  async updateProviderAccount(id: string, updates: { username?: string; passwordHash?: string; clearSession?: boolean }): Promise<ProviderAccount | undefined> {
    await this.ensureDb();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.username !== undefined) {
      fields.push("username = ?");
      values.push(updates.username);
    }
    if (updates.passwordHash !== undefined) {
      fields.push("password = ?");
      values.push(updates.passwordHash);
    }
    if (updates.clearSession) {
      fields.push("session_token = NULL");
    }

    if (fields.length === 0) {
      return this.getProviderById(id);
    }

    const stmt = this.db.prepare(`UPDATE provider_accounts SET ${fields.join(", ")} WHERE id = ?`);
    stmt.run(...values, id);
    return this.getProviderById(id);
  }

  async deleteProviderAccount(id: string): Promise<boolean> {
    await this.ensureDb();
    const stmt = this.db.prepare("DELETE FROM provider_accounts WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }

  async setProviderSession(id: string, sessionToken: string): Promise<void> {
    await this.ensureDb();
    const stmt = this.db.prepare("UPDATE provider_accounts SET session_token = ? WHERE id = ?");
    stmt.run(sessionToken, id);
  }

  async clearProviderSession(id: string): Promise<void> {
    await this.ensureDb();
    const stmt = this.db.prepare("UPDATE provider_accounts SET session_token = NULL WHERE id = ?");
    stmt.run(id);
  }
}

export const providerAuthStorage = new ProviderAuthStorage();

import {
  Provider,
  InsertProvider,
  ApiKey,
  InsertApiKey,
  Model,
  InsertModel,
  UserToken,
  InsertUserToken,
  UsageRecord,
  InsertUsageRecord,
  Stats,
  AdminCredentials,
  Admin,
} from "@shared/schema";

export interface IStorage {
  // Provider methods
  getProviders(): Promise<Provider[]>;
  getProvider(id: string): Promise<Provider | undefined>;
  createProvider(provider: InsertProvider): Promise<Provider>;
  updateProvider(id: string, provider: Partial<InsertProvider>): Promise<Provider | undefined>;
  deleteProvider(id: string): Promise<boolean>;

  // API Key methods
  getApiKeys(providerId: string): Promise<ApiKey[]>;
  createApiKey(apiKey: InsertApiKey): Promise<ApiKey>;
  deleteApiKey(id: string): Promise<boolean>;
  updateApiKey(id: string, key: string): Promise<ApiKey | undefined>;
  getNextApiKey(providerId: string): Promise<ApiKey | undefined>;
  updateApiKeyUsage(id: string): Promise<void>;

  // Model methods
  getModels(providerId?: string): Promise<Model[]>;
  createModel(model: InsertModel): Promise<Model>;
  updateModel(id: string, model: Partial<InsertModel>): Promise<Model | undefined>;
  updateModelsByProvider(providerId: string, updates: Partial<InsertModel>): Promise<Model[]>;
  deleteModel(id: string): Promise<boolean>;
  deleteModelsByProvider(providerId: string): Promise<void>;
  replaceProviderModels(providerId: string, modelIds: string[]): Promise<Model[]>;
  enableAllModelsByProvider(providerId: string): Promise<Model[]>;
  disableAllModelsByProvider(providerId: string): Promise<Model[]>;
  updateCostAllModelsByProvider(providerId: string, requestCost: number): Promise<Model[]>;

  // User Token methods
  getUserTokens(): Promise<UserToken[]>;
  getUserToken(token: string): Promise<UserToken | undefined>;
  getUserTokenById(id: string): Promise<UserToken | undefined>;
  createUserToken(userToken: InsertUserToken): Promise<UserToken>;
  updateUserToken(id: string, userToken: Partial<InsertUserToken>): Promise<UserToken | undefined>;
  deleteUserToken(id: string): Promise<boolean>;
  regenerateUserToken(id: string): Promise<UserToken | undefined>;

  // Sub-key methods
  getSubKeys(parentTokenId: string): Promise<UserToken[]>;
  getAncestorChain(tokenId: string): Promise<UserToken[]>;
  getRootToken(tokenId: string): Promise<UserToken | undefined>;
  getTotalAllocatedQuota(parentTokenId: string): Promise<{ rpd: number; rpm: number }>;
  canCreateSubKey(parentTokenId: string, requestedRPD: number, requestedRPM: number): Promise<{ valid: boolean; reason?: string }>;
  validateAncestorChain(tokenId: string): Promise<{ valid: boolean; reason?: string }>;
  validateAncestorChainQuota(tokenId: string, requestCost: number): Promise<{ valid: boolean; reason?: string; insufficientToken?: string }>;
  createUsageRecordForChain(tokenId: string, record: Omit<InsertUsageRecord, "userTokenId">): Promise<void>;
  cascadeDeleteSubKeys(parentTokenId: string): Promise<number>;
  cascadeDisableSubKeys(parentTokenId: string): Promise<number>;
  cascadeEnableSubKeys(parentTokenId: string): Promise<number>;

  // Usage methods
  createUsageRecord(record: InsertUsageRecord): Promise<UsageRecord>;
  getUsageRecords(userTokenId: string): Promise<UsageRecord[]>;
  getTodayUsageCount(userTokenId: string): Promise<number>;
  getMinuteUsageCount(userTokenId: string): Promise<number>;

  // Stats methods
  getStats(): Promise<Stats>;
  incrementActiveRequests(): Promise<void>;
  decrementActiveRequests(): Promise<void>;

  // Admin methods
  getAdmin(username: string): Promise<Admin | undefined>;
  createAdmin(username: string, password: string): Promise<Admin>;
  updateAdmin(username: string, passwordHash: string): Promise<Admin | undefined>;

  // Auth methods
  getAuthMode(): Promise<"user_tokens" | "general_password" | "no_auth">;
  getGeneralPassword(): Promise<string | undefined>;
}

import { PostgresStorage } from './postgres-storage.js';
import { MemoryStorage } from './memory-storage.js';

export let storage: IStorage;

export async function initStorage() {
  if (storage) return;

  if (process.env.DATABASE_URL) {
    try {
      console.log("[STORAGE] Initializing PostgresStorage (Vercel/Production)");
      storage = new PostgresStorage();
    } catch (err) {
      console.error("[STORAGE] PostgresStorage initialization failed:", err);
      storage = new MemoryStorage();
    }
  } else {
    try {
      console.log("[STORAGE] Initializing SQLiteStorage (Local/Development)");
      const sqliteModule = './sqlite-storage.js';
      const betterPkg = 'better-sqlite3';
      const { SQLiteStorage } = await import(sqliteModule);
      // @ts-ignore
      const { default: DatabaseClass } = await import(betterPkg);
      storage = new SQLiteStorage(DatabaseClass);
    } catch (err) {
      console.error("[STORAGE] SQLite initialization failed (normal on Vercel without DATABASE_URL):", err);
      // Fallback to memory storage to prevent undefined storage
      storage = new MemoryStorage();
    }
  }
}

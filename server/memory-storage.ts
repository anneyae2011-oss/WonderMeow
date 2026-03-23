import { IStorage } from "./storage.js";
import * as schema from "../shared/schema.js";
import { randomUUID } from "crypto";

export class MemoryStorage implements IStorage {
  private providers: Map<string, schema.Provider> = new Map();
  private apiKeys: Map<string, schema.ApiKey> = new Map();
  private models: Map<string, schema.Model> = new Map();
  private userTokens: Map<string, schema.UserToken> = new Map();
  private usageRecords: Map<string, schema.UsageRecord> = new Map();
  private admins: Map<string, schema.Admin> = new Map();
  private activeRequests: number = 0;

  constructor() {
    console.log("[STORAGE] MemoryStorage initialized (Failsafe Mode)");
  }

  async getProviders(): Promise<schema.Provider[]> {
    return Array.from(this.providers.values());
  }

  async getProvider(id: string): Promise<schema.Provider | undefined> {
    return this.providers.get(id);
  }

  async createProvider(provider: schema.InsertProvider): Promise<schema.Provider> {
    const id = randomUUID();
    const newProvider: schema.Provider = { ...provider, id, createdAt: Date.now() };
    this.providers.set(id, newProvider);
    return newProvider;
  }

  async updateProvider(id: string, provider: Partial<schema.InsertProvider>): Promise<schema.Provider | undefined> {
    const existing = this.providers.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...provider };
    this.providers.set(id, updated);
    return updated;
  }

  async deleteProvider(id: string): Promise<boolean> {
    return this.providers.delete(id);
  }

  async getApiKeys(providerId: string): Promise<schema.ApiKey[]> {
    return Array.from(this.apiKeys.values()).filter(k => k.providerId === providerId);
  }

  async createApiKey(apiKey: schema.InsertApiKey): Promise<schema.ApiKey> {
    const id = randomUUID();
    const newKey: schema.ApiKey = { ...apiKey, id, createdAt: Date.now(), lastUsed: null, useCount: 0 };
    this.apiKeys.set(id, newKey);
    return newKey;
  }

  async deleteApiKey(id: string): Promise<boolean> {
    return this.apiKeys.delete(id);
  }

  async updateApiKey(id: string, key: string): Promise<schema.ApiKey | undefined> {
    const existing = this.apiKeys.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, key };
    this.apiKeys.set(id, updated);
    return updated;
  }

  async getNextApiKey(providerId: string): Promise<schema.ApiKey | undefined> {
    return Array.from(this.apiKeys.values()).find(k => k.providerId === providerId);
  }

  async updateApiKeyUsage(id: string): Promise<void> {
    const existing = this.apiKeys.get(id);
    if (existing) {
      existing.useCount++;
      existing.lastUsed = Date.now();
    }
  }

  async getModels(providerId?: string): Promise<schema.Model[]> {
    const all = Array.from(this.models.values());
    return providerId ? all.filter(m => m.providerId === providerId) : all;
  }

  async createModel(model: schema.InsertModel): Promise<schema.Model> {
    const id = randomUUID();
    const newModel: schema.Model = { ...model, id, createdAt: Date.now() };
    this.models.set(id, newModel);
    return newModel;
  }

  async updateModel(id: string, model: Partial<schema.InsertModel>): Promise<schema.Model | undefined> {
    const existing = this.models.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...model };
    this.models.set(id, updated);
    return updated;
  }

  async updateModelsByProvider(providerId: string, updates: Partial<schema.InsertModel>): Promise<schema.Model[]> {
    const updated: schema.Model[] = [];
    for (const model of this.models.values()) {
      if (model.providerId === providerId) {
        Object.assign(model, updates);
        updated.push(model);
      }
    }
    return updated;
  }

  async deleteModel(id: string): Promise<boolean> {
    return this.models.delete(id);
  }

  async deleteModelsByProvider(providerId: string): Promise<void> {
    for (const [id, model] of this.models.entries()) {
      if (model.providerId === providerId) this.models.delete(id);
    }
  }

  async replaceProviderModels(providerId: string, modelIds: string[]): Promise<schema.Model[]> {
    await this.deleteModelsByProvider(providerId);
    const created: schema.Model[] = [];
    for (const name of modelIds) {
      created.push(await this.createModel({ providerId, name, enabled: true, requestCost: 0 }));
    }
    return created;
  }

  async enableAllModelsByProvider(providerId: string): Promise<schema.Model[]> {
    return this.updateModelsByProvider(providerId, { enabled: true });
  }

  async disableAllModelsByProvider(providerId: string): Promise<schema.Model[]> {
    return this.updateModelsByProvider(providerId, { enabled: false });
  }

  async updateCostAllModelsByProvider(providerId: string, requestCost: number): Promise<schema.Model[]> {
    return this.updateModelsByProvider(providerId, { requestCost });
  }

  async getUserTokens(): Promise<schema.UserToken[]> {
    return Array.from(this.userTokens.values());
  }

  async getUserToken(token: string): Promise<schema.UserToken | undefined> {
    return Array.from(this.userTokens.values()).find(t => t.token === token);
  }

  async getUserTokenById(id: string): Promise<schema.UserToken | undefined> {
    return this.userTokens.get(id);
  }

  async createUserToken(userToken: schema.InsertUserToken): Promise<schema.UserToken> {
    const id = randomUUID();
    const newToken: schema.UserToken = { ...userToken, id, createdAt: Date.now() };
    this.userTokens.set(id, newToken);
    return newToken;
  }

  async updateUserToken(id: string, userToken: Partial<schema.InsertUserToken>): Promise<schema.UserToken | undefined> {
    const existing = this.userTokens.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...userToken };
    this.userTokens.set(id, updated);
    return updated;
  }

  async deleteUserToken(id: string): Promise<boolean> {
    return this.userTokens.delete(id);
  }

  async regenerateUserToken(id: string): Promise<schema.UserToken | undefined> {
    const existing = this.userTokens.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, token: randomUUID() };
    this.userTokens.set(id, updated);
    return updated;
  }

  async getSubKeys(parentTokenId: string): Promise<schema.UserToken[]> {
    return Array.from(this.userTokens.values()).filter(t => t.parentTokenId === parentTokenId);
  }

  async getAncestorChain(tokenId: string): Promise<schema.UserToken[]> {
    const chain: schema.UserToken[] = [];
    let current = this.userTokens.get(tokenId);
    while (current) {
      chain.push(current);
      current = current.parentTokenId ? this.userTokens.get(current.parentTokenId) : undefined;
    }
    return chain;
  }

  async getRootToken(tokenId: string): Promise<schema.UserToken | undefined> {
    const chain = await this.getAncestorChain(tokenId);
    return chain[chain.length - 1];
  }

  async getTotalAllocatedQuota(parentTokenId: string): Promise<{ rpd: number; rpm: number }> {
    const subKeys = await this.getSubKeys(parentTokenId);
    return subKeys.reduce((acc, k) => ({ rpd: acc.rpd + k.rpd, rpm: acc.rpm + k.rpm }), { rpd: 0, rpm: 0 });
  }

  async canCreateSubKey(parentTokenId: string, requestedRPD: number, requestedRPM: number): Promise<{ valid: boolean; reason?: string }> {
    return { valid: true };
  }

  async validateAncestorChain(tokenId: string): Promise<{ valid: boolean; reason?: string }> {
    return { valid: true };
  }

  async validateAncestorChainQuota(tokenId: string, requestCost: number): Promise<{ valid: boolean; reason?: string; insufficientToken?: string }> {
    return { valid: true };
  }

  async createUsageRecordForChain(tokenId: string, record: Omit<schema.InsertUsageRecord, "userTokenId">): Promise<void> {
    const chain = await this.getAncestorChain(tokenId);
    for (const token of chain) {
      await this.createUsageRecord({ ...record, userTokenId: token.id });
    }
  }

  async cascadeDeleteSubKeys(parentTokenId: string): Promise<number> {
    let count = 0;
    for (const [id, token] of this.userTokens.entries()) {
      if (token.parentTokenId === parentTokenId) {
        this.userTokens.delete(id);
        count += 1 + await this.cascadeDeleteSubKeys(id);
      }
    }
    return count;
  }

  async cascadeDisableSubKeys(parentTokenId: string): Promise<number> {
    return 0;
  }

  async cascadeEnableSubKeys(parentTokenId: string): Promise<number> {
    return 0;
  }

  async createUsageRecord(record: schema.InsertUsageRecord): Promise<schema.UsageRecord> {
    const id = randomUUID();
    const newRecord: schema.UsageRecord = { ...record, id, createdAt: Date.now() };
    this.usageRecords.set(id, newRecord);
    return newRecord;
  }

  async getUsageRecords(userTokenId: string): Promise<schema.UsageRecord[]> {
    return Array.from(this.usageRecords.values()).filter(r => r.userTokenId === userTokenId);
  }

  async getTodayUsageCount(userTokenId: string): Promise<number> {
    return 0;
  }

  async getMinuteUsageCount(userTokenId: string): Promise<number> {
    return 0;
  }

  async getStats(): Promise<schema.Stats> {
    return {
      activeRequests: this.activeRequests,
      totalRequests: this.usageRecords.size,
      uptime: Math.floor((Date.now() - this.startTime) / 1000)
    };
  }

  async incrementActiveRequests(): Promise<void> {
    this.activeRequests++;
  }

  async decrementActiveRequests(): Promise<void> {
    this.activeRequests--;
  }

  async getAdmin(username: string): Promise<schema.Admin | undefined> {
    return this.admins.get(username);
  }

  async createAdmin(username: string, password: string): Promise<schema.Admin> {
    const admin: schema.Admin = { id: randomUUID(), username, password, createdAt: Date.now() };
    this.admins.set(username, admin);
    return admin;
  }

  async updateAdmin(username: string, passwordHash: string): Promise<schema.Admin | undefined> {
    const existing = this.admins.get(username);
    if (!existing) return undefined;
    const updated = { ...existing, password: passwordHash };
    this.admins.set(username, updated);
    return updated;
  }

  async getAuthMode(): Promise<"user_tokens" | "general_password" | "no_auth"> {
    return "user_tokens";
  }

  async getGeneralPassword(): Promise<string | undefined> {
    return undefined;
  }
}

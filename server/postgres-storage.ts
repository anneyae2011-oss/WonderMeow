import { drizzle } from 'drizzle-orm/neon-serverless';
import { neon, neonConfig } from '@neondatabase/serverless';
import * as schema from '@shared/schema';
import { IStorage } from './storage';
import { eq, and, asc, desc, sql, gte } from 'drizzle-orm';
import { randomUUID } from 'crypto';

// Enable connection caching for serverless environments
// neonConfig.fetchConnectionCache = true;

export class PostgresStorage implements IStorage {
  private db: any;
  private activeRequests: number = 0;
  private startTime: number = Date.now();

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL must be set for PostgresStorage");
    }
    const sqlConnection = neon(databaseUrl);
    this.db = drizzle(sqlConnection, { schema });
  }

  // Provider methods
  async getProviders(): Promise<schema.Provider[]> {
    return await this.db.select().from(schema.providers).orderBy(asc(schema.providers.name));
  }

  async getProvider(id: string): Promise<schema.Provider | undefined> {
    const [provider] = await this.db.select().from(schema.providers).where(eq(schema.providers.id, id));
    return provider;
  }

  async createProvider(provider: schema.InsertProvider): Promise<schema.Provider> {
    const id = randomUUID();
    const now = Date.now();
    const [newProvider] = await this.db.insert(schema.providers).values({
      ...provider,
      id,
      createdAt: now,
    }).returning();
    return newProvider;
  }

  async updateProvider(id: string, provider: Partial<schema.InsertProvider>): Promise<schema.Provider | undefined> {
    const [updated] = await this.db.update(schema.providers)
      .set(provider)
      .where(eq(schema.providers.id, id))
      .returning();
    return updated;
  }

  async deleteProvider(id: string): Promise<boolean> {
    const result = await this.db.delete(schema.providers).where(eq(schema.providers.id, id)).returning();
    return result.length > 0;
  }

  // API Key methods
  async getApiKeys(providerId: string): Promise<schema.ApiKey[]> {
    return await this.db.select().from(schema.apiKeys)
      .where(eq(schema.apiKeys.providerId, providerId))
      .orderBy(desc(schema.apiKeys.lastUsed));
  }

  async createApiKey(apiKey: schema.InsertApiKey): Promise<schema.ApiKey> {
    const id = randomUUID();
    const [newKey] = await this.db.insert(schema.apiKeys).values({
      ...apiKey,
      id,
      lastUsed: 0,
      requestCount: 0,
    }).returning();
    return newKey;
  }

  async deleteApiKey(id: string): Promise<boolean> {
    const result = await this.db.delete(schema.apiKeys).where(eq(schema.apiKeys.id, id)).returning();
    return result.length > 0;
  }

  async updateApiKey(id: string, key: string): Promise<schema.ApiKey | undefined> {
    const [updated] = await this.db.update(schema.apiKeys)
      .set({ key })
      .where(eq(schema.apiKeys.id, id))
      .returning();
    return updated;
  }

  async getNextApiKey(providerId: string): Promise<schema.ApiKey | undefined> {
    const keys = await this.db.select().from(schema.apiKeys)
      .where(eq(schema.apiKeys.providerId, providerId))
      .orderBy(asc(schema.apiKeys.requestCount), asc(schema.apiKeys.lastUsed))
      .limit(1);
    return keys[0];
  }

  async updateApiKeyUsage(id: string): Promise<void> {
    await this.db.update(schema.apiKeys)
      .set({ 
        lastUsed: Date.now(),
        requestCount: sql`${schema.apiKeys.requestCount} + 1`
      })
      .where(eq(schema.apiKeys.id, id));
  }

  // Model methods
  async getModels(providerId?: string): Promise<schema.Model[]> {
    if (providerId) {
      return await this.db.select().from(schema.models)
        .where(eq(schema.models.providerId, providerId))
        .orderBy(asc(schema.models.modelId));
    }
    return await this.db.select().from(schema.models).orderBy(asc(schema.models.providerId), asc(schema.models.modelId));
  }

  async createModel(model: schema.InsertModel): Promise<schema.Model> {
    const id = randomUUID();
    const [newModel] = await this.db.insert(schema.models).values({
      ...model,
      id,
    }).returning();
    return newModel;
  }

  async updateModel(id: string, model: Partial<schema.InsertModel>): Promise<schema.Model | undefined> {
    const [updated] = await this.db.update(schema.models)
      .set(model)
      .where(eq(schema.models.id, id))
      .returning();
    return updated;
  }

  async updateModelsByProvider(providerId: string, updates: Partial<schema.InsertModel>): Promise<schema.Model[]> {
    return await this.db.update(schema.models)
      .set(updates)
      .where(eq(schema.models.providerId, providerId))
      .returning();
  }

  async deleteModel(id: string): Promise<boolean> {
    const result = await this.db.delete(schema.models).where(eq(schema.models.id, id)).returning();
    return result.length > 0;
  }

  async deleteModelsByProvider(providerId: string): Promise<void> {
    await this.db.delete(schema.models).where(eq(schema.models.providerId, providerId));
  }

  async replaceProviderModels(providerId: string, modelIds: string[]): Promise<schema.Model[]> {
    // This is complex due to the enable/disable logic. 
    // In serverless, we'll do this in multiple steps since we don't have long transactions in the same way.
    
    const existingModels = await this.getModels(providerId);
    const uniqueModelIds = [...new Set(modelIds)];
    const existingModelMap = new Map<string, schema.Model>(existingModels.map(m => [m.modelId, m]));
    const newModelIdSet = new Set(uniqueModelIds);
    
    const resultModels: schema.Model[] = [];
    
    for (const modelId of uniqueModelIds) {
      const existing = existingModelMap.get(modelId);
      if (existing) {
        const m = existing as schema.Model;
        if (!m.enabled) {
          const [updated] = await this.db.update(schema.models)
            .set({ enabled: true })
            .where(eq(schema.models.id, m.id))
            .returning();
          resultModels.push(updated);
        } else {
          resultModels.push(m);
        }
      } else {
        const newModel = await this.createModel({
          providerId,
          modelId,
          enabled: true,
          requestCost: 1,
          tokenLimit: null,
        });
        resultModels.push(newModel);
      }
    }
    
    for (const m of existingModels) {
      if (!newModelIdSet.has(m.modelId) && m.enabled) {
        const [updated] = await this.db.update(schema.models)
          .set({ enabled: false })
          .where(eq(schema.models.id, m.id))
          .returning();
        resultModels.push(updated);
      }
    }
    
    return resultModels;
  }

  async enableAllModelsByProvider(providerId: string): Promise<schema.Model[]> {
    return await this.updateModelsByProvider(providerId, { enabled: true });
  }

  async disableAllModelsByProvider(providerId: string): Promise<schema.Model[]> {
    return await this.updateModelsByProvider(providerId, { enabled: false });
  }

  async updateCostAllModelsByProvider(providerId: string, requestCost: number): Promise<schema.Model[]> {
    return await this.updateModelsByProvider(providerId, { requestCost });
  }

  // User Token methods
  async getUserTokens(): Promise<schema.UserToken[]> {
    return await this.db.select().from(schema.userTokens)
      .where(sql`${schema.userTokens.deletedAt} IS NULL`)
      .orderBy(desc(schema.userTokens.createdAt));
  }

  async getUserToken(token: string): Promise<schema.UserToken | undefined> {
    const [userToken] = await this.db.select().from(schema.userTokens)
      .where(and(eq(schema.userTokens.token, token), sql`${schema.userTokens.deletedAt} IS NULL`));
    return userToken;
  }

  async getUserTokenById(id: string): Promise<schema.UserToken | undefined> {
    const [userToken] = await this.db.select().from(schema.userTokens)
      .where(and(eq(schema.userTokens.id, id), sql`${schema.userTokens.deletedAt} IS NULL`));
    return userToken;
  }

  async createUserToken(userToken: schema.InsertUserToken): Promise<schema.UserToken> {
    const id = randomUUID();
    const token = "sk_" + randomUUID().replace(/-/g, "");
    const now = Date.now();
    
    const [newUserToken] = await this.db.insert(schema.userTokens).values({
      ...userToken,
      id,
      token,
      createdAt: now,
      enabled: userToken.enabled !== undefined ? userToken.enabled : true,
    }).returning();
    return newUserToken;
  }

  async updateUserToken(id: string, userToken: Partial<schema.InsertUserToken>): Promise<schema.UserToken | undefined> {
    const updates: any = { ...userToken };
    
    const [updated] = await this.db.update(schema.userTokens)
      .set(updates)
      .where(eq(schema.userTokens.id, id))
      .returning();
    return updated;
  }

  async deleteUserToken(id: string): Promise<boolean> {
    const [updated] = await this.db.update(schema.userTokens)
      .set({ deletedAt: Date.now() })
      .where(eq(schema.userTokens.id, id))
      .returning();
    return !!updated;
  }

  async regenerateUserToken(id: string): Promise<schema.UserToken | undefined> {
    const newToken = "sk_" + randomUUID().replace(/-/g, "");
    const [updated] = await this.db.update(schema.userTokens)
      .set({ token: newToken })
      .where(eq(schema.userTokens.id, id))
      .returning();
    return updated;
  }

  // Sub-key methods
  async getSubKeys(parentTokenId: string): Promise<schema.UserToken[]> {
    return await this.db.select().from(schema.userTokens)
      .where(and(eq(schema.userTokens.parentTokenId, parentTokenId), sql`${schema.userTokens.deletedAt} IS NULL`));
  }

  async getAncestorChain(tokenId: string): Promise<schema.UserToken[]> {
    const chain: schema.UserToken[] = [];
    let currentId: string | null = tokenId;
    
    while (currentId) {
      const token = await this.getUserTokenById(currentId);
      if (!token) break;
      chain.push(token);
      currentId = token.parentTokenId || null;
    }
    
    return chain;
  }

  async getRootToken(tokenId: string): Promise<schema.UserToken | undefined> {
    const chain = await this.getAncestorChain(tokenId);
    return chain[chain.length - 1];
  }

  async getTotalAllocatedQuota(parentTokenId: string): Promise<{ rpd: number; rpm: number }> {
    const subKeys = await this.getSubKeys(parentTokenId);
    return subKeys.reduce((acc, key) => ({
      rpd: acc.rpd + key.maxRPD,
      rpm: acc.rpm + key.maxRPM,
    }), { rpd: 0, rpm: 0 });
  }

  async canCreateSubKey(parentTokenId: string, requestedRPD: number, requestedRPM: number): Promise<{ valid: boolean; reason?: string }> {
    const parent = await this.getUserTokenById(parentTokenId);
    if (!parent) return { valid: false, reason: "Parent token not found" };
    
    if (!parent.sigmaBoy && parent.keyType === "master") {
      return { valid: false, reason: "Only Sigma Boy accounts can create sub-keys" };
    }
    
    const allocated = await this.getTotalAllocatedQuota(parentTokenId);
    const newTotalRPD = allocated.rpd + requestedRPD;
    const newTotalRPM = allocated.rpm + requestedRPM;
    
    if (newTotalRPD > parent.maxRPD) {
      return { 
        valid: false, 
        reason: `Exceeds parent RPD limit. Available: ${parent.maxRPD - allocated.rpd}, Requested: ${requestedRPD}` 
      };
    }
    
    if (newTotalRPM > parent.maxRPM) {
      return { 
        valid: false, 
        reason: `Exceeds parent RPM limit. Available: ${parent.maxRPM - allocated.rpm}, Requested: ${requestedRPM}` 
      };
    }
    
    return { valid: true };
  }

  async validateAncestorChain(tokenId: string): Promise<{ valid: boolean; reason?: string }> {
    try {
      const chain = await this.getAncestorChain(tokenId);
      for (const token of chain) {
        if (!token.enabled) {
          return { valid: false, reason: `Token disabled: ${token.name}` };
        }
        if (token.expiresAt && token.expiresAt <= Date.now()) {
          return { valid: false, reason: `Token expired: ${token.name}` };
        }
        
        const todayUsage = await this.getTodayUsageCount(token.id);
        const minuteUsage = await this.getMinuteUsageCount(token.id);
        
        if (todayUsage >= token.maxRPD) {
          return { valid: false, reason: `Daily limit exceeded for : ${token.name}` };
        }
        if (minuteUsage >= token.maxRPM) {
          return { valid: false, reason: `Rate limit exceeded for : ${token.name}` };
        }
      }
      return { valid: true };
    } catch (error: any) {
      return { valid: false, reason: error.message };
    }
  }

  async validateAncestorChainQuota(tokenId: string, requestCost: number): Promise<{ valid: boolean; reason?: string; insufficientToken?: string }> {
    try {
      const chain = await this.getAncestorChain(tokenId);
      for (const token of chain) {
        const todayUsage = await this.getTodayUsageCount(token.id);
        if (token.maxRPD - todayUsage < requestCost) {
          return { 
            valid: false, 
            reason: `Insufficient quota in: ${token.name}`,
            insufficientToken: token.name 
          };
        }
      }
      return { valid: true };
    } catch (error: any) {
      return { valid: false, reason: error.message };
    }
  }

  async createUsageRecordForChain(tokenId: string, record: Omit<schema.InsertUsageRecord, "userTokenId">): Promise<void> {
    const chain = await this.getAncestorChain(tokenId);
    for (const token of chain) {
      await this.createUsageRecord({
        ...record,
        userTokenId: token.id!,
      });
    }
  }

  async cascadeDeleteSubKeys(parentTokenId: string): Promise<number> {
    const subKeys = await this.getSubKeys(parentTokenId);
    let count = 0;
    for (const subKey of subKeys) {
      await this.deleteUserToken(subKey.id);
      count++;
      count += await this.cascadeDeleteSubKeys(subKey.id);
    }
    return count;
  }

  async cascadeDisableSubKeys(parentTokenId: string): Promise<number> {
    const subKeys = await this.getSubKeys(parentTokenId);
    let count = 0;
    for (const subKey of subKeys) {
      await this.updateUserToken(subKey.id, { enabled: false });
      count++;
      count += await this.cascadeDisableSubKeys(subKey.id);
    }
    return count;
  }

  async cascadeEnableSubKeys(parentTokenId: string): Promise<number> {
    const subKeys = await this.getSubKeys(parentTokenId);
    let count = 0;
    for (const subKey of subKeys) {
      if (!subKey.expiresAt || subKey.expiresAt > Date.now()) {
        await this.updateUserToken(subKey.id, { enabled: true });
        count++;
        count += await this.cascadeEnableSubKeys(subKey.id);
      }
    }
    return count;
  }

  // Usage methods
  async createUsageRecord(record: schema.InsertUsageRecord): Promise<schema.UsageRecord> {
    const id = randomUUID();
    const now = Date.now();
    const [newRecord] = await this.db.insert(schema.usageRecords).values({
      ...record,
      id,
      timestamp: now,
      cost: record.cost || 1,
    }).returning();
    return newRecord;
  }

  async getUsageRecords(userTokenId: string): Promise<schema.UsageRecord[]> {
    return await this.db.select().from(schema.usageRecords)
      .where(eq(schema.usageRecords.userTokenId, userTokenId))
      .orderBy(desc(schema.usageRecords.timestamp));
  }

  async getTodayUsageCount(userTokenId: string): Promise<number> {
    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const result = await this.db.select({ 
      totalCost: sql<number>`COALESCE(SUM(${schema.usageRecords.cost}), 0)` 
    })
    .from(schema.usageRecords)
    .where(and(eq(schema.usageRecords.userTokenId, userTokenId), gte(schema.usageRecords.timestamp, today)));
    
    return Number(Number(result[0].totalCost).toFixed(2));
  }

  async getMinuteUsageCount(userTokenId: string): Promise<number> {
    const oneMinuteAgo = Date.now() - 60000;
    const result = await this.db.select({ 
      totalCost: sql<number>`COALESCE(SUM(${schema.usageRecords.cost}), 0)` 
    })
    .from(schema.usageRecords)
    .where(and(eq(schema.usageRecords.userTokenId, userTokenId), gte(schema.usageRecords.timestamp, oneMinuteAgo)));
    
    return Number(Number(result[0].totalCost).toFixed(2));
  }

  // Stats methods
  async getStats(): Promise<schema.Stats> {
    const totalTokensRow = await this.db.select({ value: schema.systemConfig.value })
      .from(schema.systemConfig).where(eq(schema.systemConfig.key, 'total_tokens_all'));
    const totalRequestsRow = await this.db.select({ value: schema.systemConfig.value })
      .from(schema.systemConfig).where(eq(schema.systemConfig.key, 'total_requests_all'));
      
    const totalTokens = parseInt(totalTokensRow[0]?.value || '0', 10);
    const totalRequests = parseInt(totalRequestsRow[0]?.value || '0', 10);
    
    return {
      totalTokens,
      totalRequests,
      activeRequests: this.activeRequests,
      successRate: 100,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  async incrementActiveRequests(): Promise<void> {
    this.activeRequests++;
  }

  async decrementActiveRequests(): Promise<void> {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
  }

  // Admin methods
  async getAdmin(username: string): Promise<schema.Admin | undefined> {
    const [admin] = await this.db.select().from(schema.admins).where(eq(schema.admins.username, username));
    return admin;
  }

  async createAdmin(username: string, passwordHash: string): Promise<schema.Admin> {
    const id = randomUUID();
    const now = Date.now();
    const [newAdmin] = await this.db.insert(schema.admins).values({
      id,
      username,
      password: passwordHash,
      createdAt: now,
    }).returning();
    return newAdmin;
  }

  async updateAdmin(username: string, passwordHash: string): Promise<schema.Admin | undefined> {
    const [updated] = await this.db.update(schema.admins)
      .set({ password: passwordHash })
      .where(eq(schema.admins.username, username))
      .returning();
    return updated;
  }

  // Auth methods
  async getAuthMode(): Promise<"user_tokens" | "general_password" | "no_auth"> {
    const rows = await this.db.select({ value: schema.systemConfig.value })
      .from(schema.systemConfig).where(eq(schema.systemConfig.key, 'auth_mode'));
    let value = rows[0]?.value;
    if (value && (value.startsWith('"') || value.startsWith("'"))) {
      value = JSON.parse(value);
    }
    return (value as any) || "user_tokens";
  }

  async getGeneralPassword(): Promise<string | undefined> {
    const rows = await this.db.select({ value: schema.systemConfig.value })
      .from(schema.systemConfig).where(eq(schema.systemConfig.key, 'general_password'));
    const value = rows[0]?.value;
    return value === 'NULL' ? undefined : value;
  }
}

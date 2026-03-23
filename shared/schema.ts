import { pgTable, text, serial, integer, boolean, timestamp, real, jsonb, bigint, unique } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Drizzle PG Table Definitions
export const providers = pgTable("providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  customHeaders: jsonb("custom_headers").$type<Record<string, string>>(),
  disableCacheDiscount: boolean("disable_cache_discount").default(false),
  ownerId: text("owner_id"),
});

export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull().references(() => providers.id, { onDelete: 'cascade' }),
  key: text("key").notNull(),
  lastUsed: bigint("last_used", { mode: "number" }).default(0),
  requestCount: integer("request_count").default(0),
});

export const models = pgTable("models", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull().references(() => providers.id, { onDelete: 'cascade' }),
  modelId: text("model_id").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  requestCost: real("request_cost").notNull().default(1.0),
  tokenLimit: integer("token_limit"),
}, (table) => ({
  unq: unique().on(table.providerId, table.modelId),
}));

export const userTokens = pgTable("user_tokens", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  token: text("token").notNull().unique(),
  maxRPD: real("max_rpd").notNull(),
  maxRPM: real("max_rpm").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  allowedProviders: jsonb("allowed_providers").$type<string[]>(),
  parentTokenId: text("parent_token_id").references((): any => userTokens.id, { onDelete: 'cascade' }),
  keyType: text("key_type").notNull().default('master'),
  expiresAt: bigint("expires_at", { mode: "number" }),
  enabled: boolean("enabled").default(true),
  sigmaBoy: boolean("sigma_boy").default(false),
  maxSubKeys: integer("max_sub_keys").default(20),
  deletedAt: bigint("deleted_at", { mode: "number" }),
  createdByProviderId: text("created_by_provider_id"),
});

export const usageRecords = pgTable("usage_records", {
  id: text("id").primaryKey(),
  userTokenId: text("user_token_id").references(() => userTokens.id, { onDelete: 'set null' }),
  modelId: text("model_id").references(() => models.id, { onDelete: 'set null' }),
  providerId: text("provider_id").references(() => providers.id, { onDelete: 'set null' }),
  tokens: integer("tokens").default(0),
  inputTokens: integer("input_tokens").default(0),
  outputTokens: integer("output_tokens").default(0),
  timestamp: bigint("timestamp", { mode: "number" }).notNull(),
  cost: real("cost").notNull().default(1.0),
});

export const admins = pgTable("admins", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const systemConfig = pgTable("system_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

// Provider schema
export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  createdAt: number;
  customHeaders?: Record<string, string>;
  disableCacheDiscount?: boolean;
  ownerId?: string;
}

export const insertProviderSchema = createInsertSchema(providers).extend({
  id: z.string().optional(),
  createdAt: z.number().optional(),
  baseUrl: z.string().url(),
  customHeaders: z.record(z.string()).optional(),
});
export type InsertProvider = z.infer<typeof insertProviderSchema>;

// API Key schema
export interface ApiKey {
  id: string;
  providerId: string;
  key: string;
  lastUsed: number;
  requestCount: number;
}

export const insertApiKeySchema = createInsertSchema(apiKeys);
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;

// Model schema
export interface Model {
  id: string;
  providerId: string;
  modelId: string;
  enabled: boolean;
  requestCost: number;
  tokenLimit?: number | null;
}

export const insertModelSchema = createInsertSchema(models);
export type InsertModel = z.infer<typeof insertModelSchema>;

// User Token schema
export interface UserToken {
  id: string;
  name: string;
  token: string;
  maxRPD: number;
  maxRPM: number;
  createdAt: number;
  allowedProviders?: string[];
  parentTokenId?: string;
  keyType: "master" | "sub";
  expiresAt?: number;
  enabled?: boolean;
  sigmaBoy?: boolean;
  maxSubKeys?: number;
  deletedAt?: number;
  createdByProviderId?: string;
}

export const insertUserTokenSchema = createInsertSchema(userTokens).extend({
  keyType: z.enum(["master", "sub"]).default("master"),
});
export type InsertUserToken = z.infer<typeof insertUserTokenSchema>;

// Usage Record schema
export interface UsageRecord {
  id: string;
  userTokenId: string;
  modelId: string;
  providerId: string;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  timestamp: number;
  cost: number;
}

export const insertUsageRecordSchema = createInsertSchema(usageRecords);
export type InsertUsageRecord = z.infer<typeof insertUsageRecordSchema>;

// Stats schema
export interface Stats {
  totalTokens: number;
  totalRequests: number;
  activeRequests: number;
  successRate: number;
  uptime: number;
}

// Admin credentials
export interface AdminCredentials {
  username: string;
  password: string;
}

export interface Admin {
  id: string;
  username: string;
  password: string;
  createdAt: number;
}

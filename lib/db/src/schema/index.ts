import { pgTable, uuid, text, boolean, integer, jsonb, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const notificationsTable = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  type: text("type").notNull().default("system"),
  read: boolean("read").notNull().default(false),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const chatSessionsTable = pgTable("chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().unique(),
  userEmail: text("user_email"),
  userName: text("user_name"),
  status: text("status").notNull().default("temporary"),
  retentionDays: integer("retention_days"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const messagesTable = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => chatSessionsTable.id, { onDelete: "cascade" }),
  fromAdmin: boolean("from_admin").notNull().default(false),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const feedbackTable = pgTable("feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id"),
  userEmail: text("user_email"),
  userName: text("user_name"),
  message: text("message").notNull(),
  type: text("type").notNull().default("general"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── HyperLaw AI ──────────────────────────────────────────────────────────────

export const uploadedDocumentsTable = pgTable("uploaded_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  caseId: text("case_id"),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  extractedText: text("extracted_text"),
  caseExtraction: jsonb("case_extraction"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── AI Usage Logging ──────────────────────────────────────────────────────────

export const aiLogsTable = pgTable("ai_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  caseId: text("case_id"),
  /** e.g. "analyze_incident" | "analyze_case" | "chat" | "extract_document" | "ocr_image" */
  feature: text("feature").notNull(),
  model: text("model").notNull().default("claude-opus-4-5"),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  /** Micro-USD: divide by 1_000_000 for dollars. $15/MTok input, $75/MTok output */
  estimatedCostMicroUsd: integer("estimated_cost_micro_usd").notNull().default(0),
  responseTimeMs: integer("response_time_ms").notNull().default(0),
  cacheHit: boolean("cache_hit").notNull().default(false),
  promptTemplate: text("prompt_template"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── AI Analysis Cache ─────────────────────────────────────────────────────────

export const aiAnalysisCacheTable = pgTable("ai_analysis_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  /** SHA-256 of (feature + content) — 32 hex chars */
  cacheKey: text("cache_key").notNull(),
  feature: text("feature").notNull(),
  result: jsonb("result").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at").notNull().defaultNow(),
}, (table) => ({
  userCacheKeyIdx: uniqueIndex("ai_cache_user_key_idx").on(table.userId, table.cacheKey),
}));

// ── Generated Documents ───────────────────────────────────────────────────────

export const generatedDocumentsTable = pgTable("generated_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  caseId: text("case_id"),
  title: text("title").notNull(),
  /** e.g. "analysis" | "complaint" | "motion" | "timeline" | "chat_summary" | "other" */
  documentType: text("document_type").notNull().default("other"),
  content: text("content").notNull(),
  version: integer("version").notNull().default(1),
  /** "draft" | "verified" | "filed" */
  status: text("status").notNull().default("draft"),
  /** "free" | "pending" | "paid" */
  paymentStatus: text("payment_status").notNull().default("free"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  genDocsUserIdx: uniqueIndex("gen_docs_user_idx").on(table.userId, table.createdAt),
  genDocsCaseIdx: uniqueIndex("gen_docs_case_idx").on(table.userId, table.caseId),
}));

// ── Knowledge Library ─────────────────────────────────────────────────────────

export const knowledgeLibraryTable = pgTable("knowledge_library", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),       // 1-2 sentence description shown in search results
  body: text("body").notNull(),             // Full authoritative content
  category: text("category").notNull().default("other"), // employment|police|court|other|federal
  tags: jsonb("tags").notNull().$type<string[]>().default([]),
  keywords: jsonb("keywords").notNull().$type<string[]>().default([]),  // extra search terms
  jurisdiction: text("jurisdiction"),       // e.g. "Kentucky" or "Federal" or null = all
  source: text("source"),                   // optional citation/URL
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  libCategoryIdx: index("knowledge_library_category_idx").on(table.category),
  libActiveIdx: index("knowledge_library_active_idx").on(table.isActive),
}));

// ── Insert schemas ────────────────────────────────────────────────────────────

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({ id: true, createdAt: true });
export const insertFeedbackSchema = createInsertSchema(feedbackTable).omit({ id: true, createdAt: true });
export const insertMessageSchema = createInsertSchema(messagesTable).omit({ id: true, createdAt: true });

// ── Inferred types ────────────────────────────────────────────────────────────

export type Notification = typeof notificationsTable.$inferSelect;
export type ChatSession = typeof chatSessionsTable.$inferSelect;
export type Message = typeof messagesTable.$inferSelect;
export type Feedback = typeof feedbackTable.$inferSelect;
export type UploadedDocument = typeof uploadedDocumentsTable.$inferSelect;
export type GeneratedDocument = typeof generatedDocumentsTable.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;

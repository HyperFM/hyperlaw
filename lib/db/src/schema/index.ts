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
  /** Set when the user completes the TTS read-aloud pre-verification step. */
  verifiedAt: timestamp("verified_at"),
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

// ── Stripe idempotency ────────────────────────────────────────────────────────
// Tracks processed checkout session IDs to prevent double-crediting on webhook retries.

export const stripeProcessedSessionsTable = pgTable("stripe_processed_sessions", {
  sessionId: text("session_id").primaryKey(),     // Stripe checkout.session.id
  userId: text("user_id").notNull(),
  creditAmount: integer("credit_amount").notNull(),
  processedAt: timestamp("processed_at").notNull().defaultNow(),
});

// ── Cases (server-side persistence for HLCase + Organization Engine output) ────

export const casesTable = pgTable("cases", {
  /** Client-generated UUID — matches HLCase.id in the frontend store */
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull().default("Untitled Case"),
  workflowStage: text("workflow_stage").notNull().default("parties"),
  /** Full serialized HLCase object — localStorage mirror synced on every save */
  caseData: jsonb("case_data").notNull().$type<Record<string, unknown>>(),
  /** Structured output from the Organization Engine — clouds, facts, claims, etc. */
  structuredCase: jsonb("structured_case").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  casesUserIdx: index("cases_user_idx").on(table.userId),
}));

// ── Users ─────────────────────────────────────────────────────────────────────

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),                            // Clerk user ID
  email: text("email"),
  stripeCustomerId: text("stripe_customer_id"),
  creditBalance: integer("credit_balance").notNull().default(0),
  /** True once the user has dismissed the one-time Welcome modal (per-user, not per-device). */
  hasSeenWelcome: boolean("has_seen_welcome").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Account Security (PIN + WebAuthn) ──────────────────────────────────────────
// Guards destructive actions (case + account deletion). PIN is the server-verified
// mandatory gate; WebAuthn platform-authenticator is an additive device check.

export const userSecurityTable = pgTable("user_security", {
  userId: text("user_id").primaryKey(),                   // Clerk user ID
  /** scrypt hash of the account PIN, stored as "salt:hash" hex. Null until the user sets a PIN. */
  pinHash: text("pin_hash"),
  /** Enrolled WebAuthn platform credentials: { id, publicKey, counter, transports }[] */
  webauthnCredentials: jsonb("webauthn_credentials").notNull().$type<Array<{
    id: string; publicKey: string; counter: number; transports?: string[];
  }>>().default([]),
  /** Transient base64url challenge issued for the current register/auth ceremony. */
  webauthnChallenge: text("webauthn_challenge"),
  /** Brute-force throttle for PIN verification. */
  failedPinAttempts: integer("failed_pin_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── IFP (In Forma Pauperis) Template Library ───────────────────────────────────
// Admin-managed fee-waiver form templates keyed by jurisdiction. Used to fill the
// user's IFP application; the generic (isGeneric) row is the Appendix A fallback.

export const ifpTemplatesTable = pgTable("ifp_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** e.g. "Kentucky", "Federal", or null for the generic fallback template. */
  jurisdiction: text("jurisdiction"),
  title: text("title").notNull(),
  /** Official form number/name if known (e.g. "AO 240"). */
  formName: text("form_name"),
  /** Source URL where the official form was found. */
  sourceUrl: text("source_url"),
  /** Human-readable template body / drafting instructions used to build the filled form. */
  body: text("body").notNull().default(""),
  /** Optional structured field definitions for the fill wizard. */
  fields: jsonb("fields").notNull().$type<Array<{ key: string; label: string; type?: string }>>().default([]),
  /** Marks the single generic Appendix A fallback used when no jurisdiction form is found. */
  isGeneric: boolean("is_generic").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  ifpJurisdictionIdx: index("ifp_templates_jurisdiction_idx").on(table.jurisdiction),
  ifpActiveIdx: index("ifp_templates_active_idx").on(table.isActive),
}));

// ── Error Logs ────────────────────────────────────────────────────────────────
// Server-side audit trail of upload failures and AI processing errors visible
// in the admin panel. User ID may be null for unauthenticated failures.

export const errorLogsTable = pgTable("error_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id"),
  context: text("context").notNull(), // "upload" | "ai_generate" | "analyze" etc.
  message: text("message").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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
export type UserSecurity = typeof userSecurityTable.$inferSelect;
export type IfpTemplate = typeof ifpTemplatesTable.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;

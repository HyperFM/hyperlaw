import { pgTable, uuid, text, boolean, integer, jsonb, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { randomUUID } from "node:crypto";

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
  // Admin inbox state — read/adminReply/repliedAt let the admin view track
  // what's been seen and respond to a specific submission in place, rather
  // than feedback being a one-way form with no reply path.
  read: boolean("read").notNull().default(false),
  adminReply: text("admin_reply"),
  repliedAt: timestamp("replied_at"),
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
  /** Guidance Session this call belongs to (null for one-off calls). */
  sessionId: text("session_id"),
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
  /** Credits actually charged for this call (0 = free / cached / waived). */
  creditsCharged: integer("credits_charged").notNull().default(0),
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
  /** Expiry timestamp for the studio project (markers + exhibits + stored video).
   *  Set to now + 30 days on every studio autosave; cleared on expiry.
   *  Null = no studio project exists yet. */
  studioProjectExpiresAt: timestamp("studio_project_expires_at"),
  /** Supabase Storage object key for this case's uploaded video, once stored
   *  server-side. Null = never uploaded (or wiped on expiry). Server-authoritative
   *  — deliberately its own column, not inside caseData, since the client
   *  fully overwrites caseData on every autosave. */
  studioVideoKey: text("studio_video_key"),
  /** Downscaled (256px) JPEG data URL for this case's photo, shown on the
   *  barrel/home screen. Its own column, not inside caseData, for the same
   *  reason as studioVideoKey — caseData is fully overwritten by the client
   *  on every autosave, so anything server-authoritative needs to live
   *  outside it. Small (a few KB), so a text column is fine — no need for
   *  Supabase Storage the way the (much larger) studio video needs it. */
  casePhotoDataUrl: text("case_photo_data_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  casesUserIdx: index("cases_user_idx").on(table.userId),
}));

// ── Guidance Sessions (conversational context-gathering, usage-billed) ─────────
// A calm chat that gathers only the context that improves analysis / drafting.
// Charged AFTER completion by conversation length (word-count → credits, capped).

export const guidanceSessionsTable = pgTable("guidance_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  caseId: text("case_id"),
  /** The drafting action that prompted the session (documentType) or "general". */
  action: text("action").notNull().default("general"),
  /** "active" | "completed" | "abandoned" */
  status: text("status").notNull().default("active"),
  /** Topics the session should cover (from the decision layer). */
  topics: jsonb("topics").notNull().$type<string[]>().default([]),
  /** Full conversation transcript. */
  messages: jsonb("messages").notNull().$type<Array<{ role: "user" | "assistant"; content: string }>>().default([]),
  /** Structured answers extracted on completion and merged into case memory. */
  extractedAnswers: jsonb("extracted_answers").$type<Record<string, unknown>>(),
  /** Running total words of the conversation (user + assistant). */
  wordCount: integer("word_count").notNull().default(0),
  /** Hard spend cap (in credits) approved for this session. */
  creditCap: integer("credit_cap").notNull().default(1),
  /** Credits actually charged on completion. */
  creditsCharged: integer("credits_charged").notNull().default(0),
  /**
   * Billing waived flag captured at session-start (admin or active Apex sub).
   * Authoritative for the lifetime of this session — /complete honours this
   * value and never re-queries Stripe, preventing an Apex lapse mid-session
   * from unexpectedly charging the user.
   */
  billingWaived: boolean("billing_waived").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  guidanceUserIdx: index("guidance_sessions_user_idx").on(table.userId),
  guidanceCaseIdx: index("guidance_sessions_case_idx").on(table.caseId),
}));

// ── Users ─────────────────────────────────────────────────────────────────────

export const usersTable = pgTable("users", {
  /** App-generated UUID string (was the Clerk user ID before self-hosted auth). */
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  username: text("username").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  /** Required at the app layer for email/password registration (enforced by zod in
   *  routes/auth.ts), but nullable here since Google/Apple sign-in never collects one.
   *  Unique so a lost-phone signup can't create a duplicate account — recovery goes
   *  through email instead, which doesn't change when a phone does. */
  phoneNumber: text("phone_number").unique(),
  email: text("email").notNull().unique(),
  /** scrypt hash of the password, "salt:hash" hex — same convention as userSecurityTable.pinHash.
   *  Null for accounts that only ever signed in via Google/Apple. */
  passwordHash: text("password_hash"),
  emailVerified: boolean("email_verified").notNull().default(false),
  emailVerificationToken: text("email_verification_token"),
  emailVerificationExpiresAt: timestamp("email_verification_expires_at"),
  passwordResetToken: text("password_reset_token"),
  passwordResetExpiresAt: timestamp("password_reset_expires_at"),
  googleId: text("google_id").unique(),
  appleId: text("apple_id").unique(),
  /** Fixed 3-question account recovery (no email required) — same scrypt hash
   *  convention as passwordHash, but the raw answer is normalized (trimmed +
   *  lowercased) before hashing so "Elm Street" and "elm street" both match.
   *  Null for accounts created before this existed or via Google/Apple. */
  securityAnswer1Hash: text("security_answer_1_hash"),
  securityAnswer2Hash: text("security_answer_2_hash"),
  securityAnswer3Hash: text("security_answer_3_hash"),
  /** True only once granted through the gated admin-registration flow in
   *  routes/auth.ts (requires the primary or secondary email to already be on
   *  a hardcoded allowlist) — never settable by a plain profile edit. */
  isAdmin: boolean("is_admin").notNull().default(false),
  /** True only once granted through the gated tester-registration flow in
   *  routes/auth.ts (requires a secret TESTER_ACCESS_CODE, not just checking a
   *  box) — bypasses paywalls/tier limits like isAdmin does, but doesn't grant
   *  any of isAdmin's account-management powers. Sticky once set — not a
   *  per-login toggle. */
  isTester: boolean("is_tester").notNull().default(false),
  /** Admin accounts only: a second recovery-eligible email address. */
  secondaryEmail: text("secondary_email"),
  /** Admin accounts only: scrypt hash of the last 4 SSN digits, same
   *  never-retrievable convention as every other hash on this table — this
   *  is an extra identity check at signup, never displayed or logged in plain
   *  form again after that request completes. */
  ssnLast4Hash: text("ssn_last4_hash"),
  /** Admin accounts only: a question THEY write (not from the fixed list),
   *  plus its scrypt-hashed, normalized answer — same convention as
   *  securityAnswer{1,2,3}Hash above. */
  adminSecurityQuestion: text("admin_security_question"),
  adminSecurityAnswerHash: text("admin_security_answer_hash"),
  stripeCustomerId: text("stripe_customer_id"),
  creditBalance: integer("credit_balance").notNull().default(0),
  /** True once the user has dismissed the one-time Welcome modal (per-user, not per-device). */
  hasSeenWelcome: boolean("has_seen_welcome").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Login sessions (connect-pg-simple) ──────────────────────────────────────
// Column names/types match what connect-pg-simple itself expects exactly —
// created here via the normal drizzle push instead of the library's own
// createTableIfMissing, since that reads a table.sql file that doesn't survive
// the esbuild bundle in dist/.
export const sessionTable = pgTable("session", {
  sid: text("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
}, (table) => ({
  expireIdx: index("IDX_session_expire").on(table.expire),
}));

// ── Account Security (PIN + WebAuthn) ──────────────────────────────────────────
// Guards destructive actions (case + account deletion). PIN is the server-verified
// mandatory gate; WebAuthn platform-authenticator is an additive device check.

export const userSecurityTable = pgTable("user_security", {
  userId: text("user_id").primaryKey(),                   // usersTable.id
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

// ── Passkey login credentials (real WebAuthn, separate from the PIN-unlock
// convenience trigger above) ─────────────────────────────────────────────
// Unlike userSecurityTable.webauthnCredentials (id-only, never cryptographically
// verified — see services/security.ts), this stores real public keys and is
// used to actually authenticate a login via @simplewebauthn/server. A user can
// have both, neither, or either independently — passkey-for-PIN-unlock and
// passkey-for-login are two separate toggles by design.
export const loginCredentialsTable = pgTable("login_credentials", {
  /** WebAuthn credential ID, base64url — globally unique per authenticator. */
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  /** Base64url-encoded COSE public key, used to verify future assertions. */
  publicKey: text("public_key").notNull(),
  /** Signature counter — must strictly increase each use; guards against cloned authenticators. */
  counter: integer("counter").notNull().default(0),
  transports: jsonb("transports").$type<string[]>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
}, (table) => ({
  loginCredUserIdx: index("login_credentials_user_idx").on(table.userId),
}));

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

// ── Case Memory & Litigation History ──────────────────────────────────────────
// Five tables that give the AI persistent, structured memory of each case so
// every Guidance Session, draft, and analysis is informed by prior history —
// not treated as a first encounter.

export const caseFacts = pgTable("case_facts", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: text("case_id").notNull(),
  factType: text("fact_type").notNull(), // what_happened | party | key_date | damages | claim
  content: text("content").notNull(),
  source: text("source").notNull().default("user_entered"), // upload | ai_extracted | user_entered
  supersededBy: uuid("superseded_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  caseFactsCaseIdx: index("case_facts_case_id_idx").on(t.caseId),
}));

export const caseHistory = pgTable("case_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: text("case_id").notNull(),
  itemType: text("item_type").notNull(), // document_generated | document_uploaded | guidance_session | analysis
  title: text("title").notNull(),
  contentRef: text("content_ref"),
  shortSummary: text("short_summary").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  caseHistoryCaseIdx: index("case_history_case_id_idx").on(t.caseId),
}));

export const litigationTimeline = pgTable("litigation_timeline", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: text("case_id").notNull(),
  eventType: text("event_type").notNull(), // filing | response | hearing | discovery | deadline
  eventDate: timestamp("event_date").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("upcoming"), // upcoming | completed | missed
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  litigationTimelineCaseIdx: index("litigation_timeline_case_id_idx").on(t.caseId),
}));

export const caseStrategyMemory = pgTable("case_strategy_memory", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: text("case_id").notNull(),
  category: text("category").notNull(), // issue_identified | argument_used | weakness | evidence_gap
  content: text("content").notNull(),
  status: text("status").notNull().default("open"), // open | resolved | superseded
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  caseStrategyMemoryCaseIdx: index("case_strategy_memory_case_id_idx").on(t.caseId),
}));

export const memorySummaries = pgTable("memory_summaries", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: text("case_id").notNull(),
  summaryType: text("summary_type").notNull(), // rolling_case_summary | strategy_summary
  content: text("content").notNull().default(""),
  tokenCount: integer("token_count").notNull().default(0),
  lastUpdatedFrom: uuid("last_updated_from"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  memorySummariesCaseIdx: index("memory_summaries_case_id_idx").on(t.caseId),
  memorySummariesCaseTypeIdx: uniqueIndex("memory_summaries_case_type_idx").on(t.caseId, t.summaryType),
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
export type UserSecurity = typeof userSecurityTable.$inferSelect;
export type IfpTemplate = typeof ifpTemplatesTable.$inferSelect;
export type GuidanceSession = typeof guidanceSessionsTable.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;

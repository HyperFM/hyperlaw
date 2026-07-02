import { pgTable, uuid, text, boolean, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
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
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;

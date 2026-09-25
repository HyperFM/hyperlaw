// Family Court chat (Phase 6d, v1). A private thread between two co-parents.
//
// Defaults chosen for v1 (owner's open questions — easy to change):
//  - NO message filter or rewriting.
//  - Messages are LOGGED permanently and can never be edited or deleted; either parent can export the log.
//  - Only the two participants can read a thread. There is no supervisor/third-party access yet.
//  - Custody and court dates become reminders for BOTH parents (the day before and the day of).

import { Router, type Request, type Response } from "express";
import { and, asc, eq, gt, or } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db, familyThreadsTable, familyMessagesTable, notificationsTable, usersTable } from "@workspace/db";
import { getAuth } from "../services/auth.js";
import { sendFamilyInviteEmail } from "../services/email.js";
import { createReminders } from "../services/reminders.js";
import { logger } from "../lib/logger.js";

const router = Router();
type Thread = typeof familyThreadsTable.$inferSelect;

const newCode = () => randomBytes(4).toString("hex").toUpperCase(); // 8 characters

async function loadThread(id: string, userId: string): Promise<Thread | null> {
  const [t] = await db.select().from(familyThreadsTable).where(eq(familyThreadsTable.id, id));
  if (!t || (t.ownerId !== userId && t.otherUserId !== userId)) return null;
  return t;
}
const otherOf = (t: Thread, userId: string) => (t.ownerId === userId ? t.otherUserId : t.ownerId);
async function firstName(userId: string): Promise<string> {
  const [u] = await db.select({ f: usersTable.firstName }).from(usersTable).where(eq(usersTable.id, userId));
  return u?.f ?? "Your co-parent";
}

// GET /family/threads — my threads
router.get("/family/threads", async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const rows = await db.select().from(familyThreadsTable)
    .where(or(eq(familyThreadsTable.ownerId, userId), eq(familyThreadsTable.otherUserId, userId)));
  const out = await Promise.all(rows.map(async t => ({
    id: t.id, title: t.title, status: t.status, isOwner: t.ownerId === userId,
    inviteCode: t.ownerId === userId ? t.inviteCode : null, // only the person who started it needs the code
    otherName: otherOf(t, userId) ? await firstName(otherOf(t, userId)!) : (t.inviteEmail ?? "Waiting for them to join"),
    createdAt: t.createdAt,
  })));
  res.json(out);
});

// POST /family/threads — start one; optionally email the invite
router.post("/family/threads", async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { title, inviteEmail } = req.body as { title?: string; inviteEmail?: string };
  const code = newCode();
  const [t] = await db.insert(familyThreadsTable).values({
    ownerId: userId, title: (title?.trim() || "Co-parenting").slice(0, 80), inviteEmail: inviteEmail?.trim() || null, inviteCode: code,
  }).returning();
  if (inviteEmail?.trim()) {
    void sendFamilyInviteEmail(inviteEmail.trim(), await firstName(userId), code).catch(err => logger.warn({ err }, "family invite email failed"));
  }
  res.json({ id: t.id, inviteCode: code });
});

// Guessing codes is capped: 10 tries per person per hour.
const joinTries = new Map<string, number[]>();

// POST /family/join { code } — the other parent joins
router.post("/family/join", async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  {
    const now = Date.now();
    const recent = (joinTries.get(userId) ?? []).filter(t => now - t < 3_600_000);
    if (recent.length >= 10) { res.status(429).json({ error: "Too many tries — please wait a while." }); return; }
    joinTries.set(userId, [...recent, now]);
  }
  const code = String((req.body as { code?: string }).code ?? "").trim().toUpperCase();
  if (!code) { res.status(400).json({ error: "Enter the code" }); return; }
  const [t] = await db.select().from(familyThreadsTable).where(eq(familyThreadsTable.inviteCode, code));
  if (!t || t.status !== "pending") { res.status(404).json({ error: "That code isn't valid anymore." }); return; }
  if (t.ownerId === userId) { res.status(400).json({ error: "That's your own invite — send it to the other parent." }); return; }
  await db.update(familyThreadsTable).set({ otherUserId: userId, status: "active", inviteCode: null }).where(eq(familyThreadsTable.id, t.id));
  await db.insert(notificationsTable).values({ userId: t.ownerId, title: "Your co-parent joined", body: "You can start messaging now.", type: "system", metadata: { familyThreadId: t.id } }).catch(() => {});
  res.json({ id: t.id });
});

// GET /family/threads/:id/messages?after=<iso>
router.get("/family/threads/:id/messages", async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const t = await loadThread(String(req.params.id), userId);
  if (!t) { res.status(404).json({ error: "Not found" }); return; }
  const after = req.query.after ? new Date(String(req.query.after)) : null;
  const rows = await db.select().from(familyMessagesTable)
    .where(and(eq(familyMessagesTable.threadId, t.id), after && !Number.isNaN(after.getTime()) ? gt(familyMessagesTable.createdAt, after) : undefined))
    .orderBy(asc(familyMessagesTable.createdAt));
  res.json({ status: t.status, messages: rows.map(m => ({ id: m.id, mine: m.senderId === userId, kind: m.kind, body: m.body, payload: m.payload, createdAt: m.createdAt })) });
});

// POST /family/threads/:id/messages { kind, body, payload }
router.post("/family/threads/:id/messages", async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const t = await loadThread(String(req.params.id), userId);
  if (!t) { res.status(404).json({ error: "Not found" }); return; }
  if (t.status !== "active") { res.status(409).json({ error: "The other parent hasn't joined yet." }); return; }

  const { kind = "text", body, payload } = req.body as { kind?: string; body?: string; payload?: Record<string, unknown> };
  if (!["text", "event", "offer"].includes(kind)) { res.status(400).json({ error: "Invalid message type" }); return; }
  const text = String(body ?? "").trim().slice(0, 2000);
  if (!text) { res.status(400).json({ error: "Write something first" }); return; }

  let saved: Record<string, unknown> | null = null;
  if (kind === "event") {
    const p = payload as { title?: string; date?: string } | undefined;
    if (!p?.title?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(p.date ?? "")) { res.status(400).json({ error: "An event needs a title and a date" }); return; }
    saved = { title: p.title.trim().slice(0, 120), date: p.date };
    // Both parents get reminders: the day before and the day of.
    for (const uid of [t.ownerId, t.otherUserId!]) {
      await createReminders({ userId: uid, title: `${saved.title as string} (co-parenting)`, dueDate: p.date!, offsets: [1, 0] }).catch(err => logger.warn({ err }, "family reminder failed"));
    }
  } else if (kind === "offer") {
    const p = payload as { type?: string; summary?: string } | undefined;
    saved = { type: ["schedule", "expenses", "other"].includes(p?.type ?? "") ? p!.type : "other", summary: String(p?.summary ?? text).slice(0, 500), status: "open" };
  }

  const [m] = await db.insert(familyMessagesTable).values({ threadId: t.id, senderId: userId, kind, body: text, payload: saved }).returning();
  const other = otherOf(t, userId);
  if (other) {
    await db.insert(notificationsTable).values({ userId: other, title: `${await firstName(userId)} sent a message`, body: text.slice(0, 120), type: "system", metadata: { familyThreadId: t.id } }).catch(() => {});
  }
  res.json({ id: m.id });
});

// POST /family/threads/:id/offers/:messageId/respond { decision }
router.post("/family/threads/:id/offers/:messageId/respond", async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const t = await loadThread(String(req.params.id), userId);
  if (!t) { res.status(404).json({ error: "Not found" }); return; }
  const decision = (req.body as { decision?: string }).decision;
  if (decision !== "accepted" && decision !== "declined") { res.status(400).json({ error: "Invalid decision" }); return; }
  const [offer] = await db.select().from(familyMessagesTable).where(and(eq(familyMessagesTable.id, String(req.params.messageId)), eq(familyMessagesTable.threadId, t.id)));
  if (!offer || offer.kind !== "offer") { res.status(404).json({ error: "Offer not found" }); return; }
  if (offer.senderId === userId) { res.status(403).json({ error: "You can't answer your own offer." }); return; }
  const payload = (offer.payload ?? {}) as Record<string, unknown>;
  if (payload.status !== "open") { res.status(409).json({ error: "That offer was already answered." }); return; }
  await db.update(familyMessagesTable).set({ payload: { ...payload, status: decision, respondedAt: new Date().toISOString() } }).where(eq(familyMessagesTable.id, offer.id));
  // The answer is also written into the log as its own line, so the record reads in order.
  await db.insert(familyMessagesTable).values({ threadId: t.id, senderId: userId, kind: "note", body: `${decision === "accepted" ? "Accepted" : "Declined"} the offer: ${String(payload.summary ?? offer.body).slice(0, 200)}` });
  res.json({ ok: true });
});

export default router;

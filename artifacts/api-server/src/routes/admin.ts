import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { db, chatSessionsTable, messagesTable, notificationsTable } from "@workspace/db";
import { eq, desc, asc } from "drizzle-orm";
import { getClerkUserEmail } from "./feedback";

const router = Router();
const ADMIN_EMAIL = "hyperlawcompliance@gmail.com";

async function requireAdmin(req: Request, res: Response): Promise<string | null> {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const info = await getClerkUserEmail(auth.userId);
  if (info?.email !== ADMIN_EMAIL) { res.status(403).json({ error: "Forbidden" }); return null; }
  return auth.userId;
}

router.get("/admin/users", async (req: Request, res: Response): Promise<void> => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) { res.status(500).json({ error: "No secret key" }); return; }

  const r = await fetch("https://api.clerk.com/v1/users?limit=100&order_by=-created_at", {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const users = await r.json();
  res.json(users);
});

router.get("/admin/chat-sessions", async (req: Request, res: Response): Promise<void> => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const sessions = await db.select().from(chatSessionsTable).orderBy(desc(chatSessionsTable.createdAt));
  res.json(sessions);
});

router.post("/admin/chat/:userId", async (req: Request, res: Response): Promise<void> => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const userId = String(req.params.userId);
  const { userEmail, userName } = req.body as { userEmail?: string; userName?: string };

  const existing = await db.select().from(chatSessionsTable).where(eq(chatSessionsTable.userId, userId));
  if (existing.length > 0) { res.json(existing[0]); return; }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const [session] = await db.insert(chatSessionsTable).values({
    userId,
    userEmail: userEmail ?? "",
    userName: userName ?? "",
    status: "temporary",
    retentionDays: 30,
    expiresAt,
  }).returning();

  res.json(session);
});

router.get("/admin/messages/:sessionId", async (req: Request, res: Response): Promise<void> => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const sessionId = String(req.params.sessionId);
  const msgs = await db.select().from(messagesTable)
    .where(eq(messagesTable.sessionId, sessionId))
    .orderBy(asc(messagesTable.createdAt));
  res.json(msgs);
});

router.post("/admin/messages/:sessionId", async (req: Request, res: Response): Promise<void> => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const sessionId = String(req.params.sessionId);
  const { body } = req.body as { body: string };
  if (!body?.trim()) { res.status(400).json({ error: "Message required" }); return; }

  const sessions = await db.select().from(chatSessionsTable).where(eq(chatSessionsTable.id, sessionId));
  if (!sessions.length) { res.status(404).json({ error: "Session not found" }); return; }

  const [msg] = await db.insert(messagesTable).values({
    sessionId,
    fromAdmin: true,
    body: body.trim(),
  }).returning();

  await db.insert(notificationsTable).values({
    userId: sessions[0].userId,
    title: "New message from HyperLaw",
    body: body.trim().slice(0, 120),
    type: "admin_message",
    metadata: { sessionId },
  });

  res.json(msg);
});

router.put("/admin/sessions/:sessionId/retention", async (req: Request, res: Response): Promise<void> => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const sessionId = String(req.params.sessionId);
  const { status, retentionDays } = req.body as { status: string; retentionDays: number | null };

  let expiresAt: Date | undefined;
  if (status === "temporary" && retentionDays) {
    expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + retentionDays);
  }

  const [updated] = await db.update(chatSessionsTable)
    .set({ status, retentionDays: retentionDays ?? null, expiresAt })
    .where(eq(chatSessionsTable.id, sessionId))
    .returning();

  res.json(updated);
});

export default router;

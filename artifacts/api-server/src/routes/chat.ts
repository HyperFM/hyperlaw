import { Router, type Request, type Response } from "express";
import { getAuth } from "../services/auth.js";
import { db, chatSessionsTable, messagesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

const router = Router();

router.get("/chat/session", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const sessions = await db.select().from(chatSessionsTable).where(eq(chatSessionsTable.userId, auth.userId));
  res.json(sessions[0] ?? null);
});

router.get("/chat/messages/:sessionId", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const sessionId = String(req.params.sessionId);
  const sessions = await db.select().from(chatSessionsTable).where(eq(chatSessionsTable.id, sessionId));

  if (!sessions.length || sessions[0].userId !== auth.userId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const msgs = await db.select().from(messagesTable)
    .where(eq(messagesTable.sessionId, sessionId))
    .orderBy(asc(messagesTable.createdAt));

  res.json(msgs);
});

router.post("/chat/messages/:sessionId", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const sessionId = String(req.params.sessionId);
  const sessions = await db.select().from(chatSessionsTable).where(eq(chatSessionsTable.id, sessionId));

  if (!sessions.length || sessions[0].userId !== auth.userId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const { body } = req.body as { body: string };
  if (!body?.trim()) { res.status(400).json({ error: "Message required" }); return; }

  const [msg] = await db.insert(messagesTable).values({
    sessionId,
    fromAdmin: false,
    body: body.trim(),
  }).returning();

  res.json(msg);
});

export default router;

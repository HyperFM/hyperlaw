import { Router, type Request, type Response } from "express";
import { and, eq, isNull, asc } from "drizzle-orm";
import { db, remindersTable } from "@workspace/db";
import { getAuth } from "../services/auth.js";
import { createReminders, processDueReminders, DEFAULT_OFFSETS } from "../services/reminders.js";

const router = Router();

// POST /reminders — one tap from the chat: reminders before a deadline.
router.post("/reminders", async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { caseId, title, dueDate } = req.body as { caseId?: string; title?: string; dueDate?: string };
  if (!title?.trim() || !dueDate) { res.status(400).json({ error: "title and dueDate are required" }); return; }
  try {
    const r = await createReminders({ userId, caseId, title: title.trim().slice(0, 200), dueDate });
    res.json({ ok: true, groupId: r.groupId, count: r.times.length, offsets: DEFAULT_OFFSETS });
  } catch {
    res.status(400).json({ error: "Invalid due date" });
  }
});

// GET /reminders?caseId= — the person's pending reminders.
router.get("/reminders", async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const caseId = req.query.caseId ? String(req.query.caseId) : null;
  const rows = await db.select().from(remindersTable)
    .where(and(eq(remindersTable.userId, userId), isNull(remindersTable.sentAt), caseId ? eq(remindersTable.caseId, caseId) : undefined))
    .orderBy(asc(remindersTable.remindAt));
  res.json(rows);
});

// DELETE /reminders/:groupId — remove every pending reminder for one deadline.
router.delete("/reminders/:groupId", async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  await db.delete(remindersTable).where(and(eq(remindersTable.userId, userId), eq(remindersTable.groupId, String(req.params.groupId)), isNull(remindersTable.sentAt)));
  res.json({ ok: true });
});

// POST /reminders/run — called by an outside scheduler about every 15 minutes. Needs REMINDER_CRON_SECRET.
router.post("/reminders/run", async (req: Request, res: Response): Promise<void> => {
  const secret = process.env.REMINDER_CRON_SECRET;
  if (!secret || req.get("X-Cron-Secret") !== secret) { res.status(401).json({ error: "Unauthorized" }); return; }
  res.json({ sent: await processDueReminders() });
});

export default router;

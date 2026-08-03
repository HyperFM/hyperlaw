import { Router, type Request, type Response } from "express";
import { getAuth } from "../services/auth.js";
import { db, feedbackTable, notificationsTable, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();

function requireAdmin(req: Request, res: Response): boolean {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return false; }
  if (!req.user?.isAdmin) { res.status(403).json({ error: "Forbidden" }); return false; }
  return true;
}

/** Resolves a user's email/name from our own users table (was a Clerk REST call). */
export async function getUserEmail(userId: string): Promise<{ email: string; name: string } | null> {
  const [user] = await db
    .select({ email: usersTable.email, firstName: usersTable.firstName, lastName: usersTable.lastName })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!user) return null;
  return { email: user.email, name: [user.firstName, user.lastName].filter(Boolean).join(" ") };
}

router.post("/feedback", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  const { message, type = "general" } = req.body as { message: string; type?: string };
  if (!message?.trim()) { res.status(400).json({ error: "Message required" }); return; }

  let userEmail = "";
  let userName = "";
  if (auth?.userId) {
    const info = await getUserEmail(auth.userId);
    userEmail = info?.email ?? "";
    userName = info?.name ?? "";
  }

  await db.insert(feedbackTable).values({
    userId: auth?.userId ?? null,
    userEmail,
    userName,
    message: message.trim(),
    type,
  });

  if (auth?.userId) {
    await db.insert(notificationsTable).values({
      userId: auth.userId,
      title: "Feedback received",
      body: "Thanks for your feedback! We review every submission.",
      type: "system",
    });
  }

  res.json({ ok: true });
});

router.get("/feedback", async (req: Request, res: Response): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  const rows = await db.select().from(feedbackTable).orderBy(sql`${feedbackTable.createdAt} desc`);
  res.json(rows);
});

// GET /feedback/unread-counts — per-category unread count, for the badge
// bubbles on the admin's category icons (improvement/support/general).
router.get("/feedback/unread-counts", async (req: Request, res: Response): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  const rows = await db
    .select({ type: feedbackTable.type, count: sql<number>`count(*)::int` })
    .from(feedbackTable)
    .where(eq(feedbackTable.read, false))
    .groupBy(feedbackTable.type);

  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.type] = row.count;
  res.json(counts);
});

// POST /feedback/:id/read — marks a submission as seen without replying to
// it, so the badge count drops as soon as the admin opens it.
router.post("/feedback/:id/read", async (req: Request, res: Response): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  const id = String(req.params.id);
  const [updated] = await db.update(feedbackTable).set({ read: true }).where(eq(feedbackTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

// POST /feedback/:id/reply — the admin's response to one specific
// submission. Marks it read, and — if the original sender has an account —
// drops a notification in their notifications feed so they see it there
// (real push-notification delivery is a separate, larger piece of work: it
// needs the Capacitor push-notifications plugin, an Apple Push Notification
// key from the Developer portal, and a backend service to actually send
// through APNs — none of that exists yet, so for now this is in-app only).
router.post("/feedback/:id/reply", async (req: Request, res: Response): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  const id = String(req.params.id);
  const { reply } = req.body as { reply?: string };
  if (!reply?.trim()) { res.status(400).json({ error: "Reply message required" }); return; }

  const [existing] = await db.select().from(feedbackTable).where(eq(feedbackTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const [updated] = await db.update(feedbackTable)
    .set({ adminReply: reply.trim(), repliedAt: new Date(), read: true })
    .where(eq(feedbackTable.id, id))
    .returning();

  if (existing.userId) {
    await db.insert(notificationsTable).values({
      userId: existing.userId,
      title: "You received a response from the creator",
      body: reply.trim().slice(0, 140),
      type: "feedback_reply",
      metadata: { feedbackId: id },
    });
  }

  res.json(updated);
});

export default router;

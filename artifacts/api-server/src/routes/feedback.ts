import { Router, type Request, type Response } from "express";
import { getAuth } from "../services/auth.js";
import { db, feedbackTable, notificationsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

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
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!req.user?.isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

  const rows = await db.select().from(feedbackTable);
  res.json(rows);
});

export default router;

import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { db, feedbackTable, notificationsTable } from "@workspace/db";

const router = Router();

const ADMIN_EMAIL = "hyperlawcompliance@gmail.com";

export async function getClerkUserEmail(userId: string): Promise<{ email: string; name: string } | null> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return null;
  try {
    const r = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!r.ok) return null;
    const u = await r.json() as { email_addresses?: { email_address: string }[]; first_name?: string; last_name?: string };
    const email = u.email_addresses?.[0]?.email_address ?? "";
    const name = [u.first_name, u.last_name].filter(Boolean).join(" ");
    return { email, name };
  } catch {
    return null;
  }
}

router.post("/feedback", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  const { message, type = "general" } = req.body as { message: string; type?: string };
  if (!message?.trim()) { res.status(400).json({ error: "Message required" }); return; }

  let userEmail = "";
  let userName = "";
  if (auth?.userId) {
    const info = await getClerkUserEmail(auth.userId);
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

  const info = await getClerkUserEmail(auth.userId);
  if (info?.email !== ADMIN_EMAIL) { res.status(403).json({ error: "Forbidden" }); return; }

  const rows = await db.select().from(feedbackTable);
  res.json(rows);
});

export default router;

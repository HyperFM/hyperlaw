import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { db, notificationsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

router.get("/notifications", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, auth.userId))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);

  res.json(rows);
});

router.put("/notifications/:id/read", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = String(req.params.id);
  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, auth.userId)));

  res.json({ ok: true });
});

router.put("/notifications/read-all", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(and(eq(notificationsTable.userId, auth.userId), eq(notificationsTable.read, false)));

  res.json({ ok: true });
});

export default router;

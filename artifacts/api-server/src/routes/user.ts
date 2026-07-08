/**
 * User self-service routes:
 *  GET  /user/settings      — per-user preferences (welcome flag)
 *  POST /user/welcome-seen  — mark the one-time Welcome modal as seen
 *  POST /user/delete        — PIN-guarded purge of ALL user data (call before Clerk user.delete())
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import {
  db, usersTable, generatedDocumentsTable, aiLogsTable, aiAnalysisCacheTable,
  uploadedDocumentsTable, notificationsTable, chatSessionsTable, casesTable, userSecurityTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifyPin } from "../services/security.js";

const router = Router();

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  (req as Request & { userId?: string }).userId = userId;
  next();
}
const uid = (req: Request): string => (req as Request & { userId: string }).userId;

// GET /user/settings — per-user preferences
router.get("/user/settings", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const [u] = await db.select({ hasSeenWelcome: usersTable.hasSeenWelcome })
    .from(usersTable).where(eq(usersTable.id, uid(req)));
  res.json({ hasSeenWelcome: u?.hasSeenWelcome ?? false });
});

// POST /user/welcome-seen — mark the Welcome modal as seen (per-user, upsert)
router.post("/user/welcome-seen", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  await db.insert(usersTable)
    .values({ id: userId, hasSeenWelcome: true })
    .onConflictDoUpdate({ target: usersTable.id, set: { hasSeenWelcome: true, updatedAt: new Date() } });
  res.json({ ok: true });
});

// POST /user/delete — verify PIN, then purge every user-owned row
router.post("/user/delete", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  const { pin } = req.body as { pin?: string };
  if (typeof pin !== "string" || !pin) { res.status(400).json({ error: "PIN is required" }); return; }
  const v = await verifyPin(userId, pin);
  if (!v.ok) { res.status(v.locked ? 429 : 401).json(v); return; }
  try {
    // chatSessions cascades → messages automatically
    await Promise.all([
      db.delete(generatedDocumentsTable).where(eq(generatedDocumentsTable.userId, userId)),
      db.delete(aiLogsTable).where(eq(aiLogsTable.userId, userId)),
      db.delete(aiAnalysisCacheTable).where(eq(aiAnalysisCacheTable.userId, userId)),
      db.delete(uploadedDocumentsTable).where(eq(uploadedDocumentsTable.userId, userId)),
      db.delete(notificationsTable).where(eq(notificationsTable.userId, userId)),
      db.delete(chatSessionsTable).where(eq(chatSessionsTable.userId, userId)),
      db.delete(casesTable).where(eq(casesTable.userId, userId)),
      db.delete(userSecurityTable).where(eq(userSecurityTable.userId, userId)),
    ]);
    await db.delete(usersTable).where(eq(usersTable.id, userId));
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[user] delete error", err);
    res.status(500).json({ error: "Failed to purge user data" });
  }
});

export default router;

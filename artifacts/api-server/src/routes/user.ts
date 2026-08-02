/**
 * User self-service routes:
 *  GET  /user/settings        — per-user preferences (welcome flag)
 *  POST /user/welcome-seen    — mark the one-time Welcome modal as seen
 *  GET  /user/credit-history  — chronological log of credit-charging events
 *  POST /user/delete          — PIN-guarded purge of ALL user data, including the account itself
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "../services/auth.js";
import {
  db, usersTable, generatedDocumentsTable, aiLogsTable, aiAnalysisCacheTable,
  uploadedDocumentsTable, notificationsTable, chatSessionsTable, casesTable, userSecurityTable,
} from "@workspace/db";
import { and, eq, gt, desc, inArray } from "drizzle-orm";
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

// GET /user/credit-history — full chronological log of every credit-charging ai_log entry.
// Returns ALL rows where creditsCharged > 0 (no truncation), enriched with case title.
router.get("/user/credit-history", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  try {
    // Pull every ai_log row where this user was charged at least 1 credit.
    // No LIMIT — the goal is a full statement of every charge. The WHERE clause
    // filters creditsCharged > 0 in SQL, so only genuinely charged rows are returned.
    // Fetch charged rows and current balance in parallel
    const [charged, userRow] = await Promise.all([
      db
        .select({
          id: aiLogsTable.id,
          caseId: aiLogsTable.caseId,
          feature: aiLogsTable.feature,
          creditsCharged: aiLogsTable.creditsCharged,
          createdAt: aiLogsTable.createdAt,
        })
        .from(aiLogsTable)
        .where(and(
          eq(aiLogsTable.userId, userId),
          gt(aiLogsTable.creditsCharged, 0),
        ))
        .orderBy(desc(aiLogsTable.createdAt)),
      db
        .select({ creditBalance: usersTable.creditBalance })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1),
    ]);

    // Look up case titles for all referenced caseIds
    const caseIds = [...new Set(charged.map(r => r.caseId).filter((id): id is string => !!id))];
    const caseTitleMap = new Map<string, string>();
    if (caseIds.length > 0) {
      const caseRows = await db
        .select({ id: casesTable.id, title: casesTable.title })
        .from(casesTable)
        .where(inArray(casesTable.id, caseIds));
      caseRows.forEach(c => caseTitleMap.set(c.id, c.title));
    }

    // Reconstruct running balance: entries are newest-first.
    // balanceAfter[0] (newest) = current balance; each older entry adds back the credits
    // that were charged by the entries that came after it.
    const currentBalance = userRow[0]?.creditBalance ?? 0;
    let runningBalance = currentBalance;
    const result = charged.map(r => {
      const creditsCharged = r.creditsCharged ?? 1;
      const balanceAfter = runningBalance;
      runningBalance += creditsCharged; // step back in time
      return {
        id: r.id,
        date: r.createdAt.toISOString(),
        feature: r.feature,
        caseId: r.caseId ?? null,
        caseTitle: r.caseId ? (caseTitleMap.get(r.caseId) ?? null) : null,
        creditsCharged,
        balanceAfter,
      };
    });

    res.json({ entries: result, total: result.length });
  } catch (err) {
    console.error("[credit-history] error", err);
    res.status(500).json({ error: "Failed to load credit history" });
  }
});

// POST /user/welcome-seen — mark the Welcome modal as seen (per-user)
router.post("/user/welcome-seen", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  await db.update(usersTable)
    .set({ hasSeenWelcome: true, updatedAt: new Date() })
    .where(eq(usersTable.id, userId));
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
    req.logout(() => {
      res.status(200).json({ ok: true });
    });
  } catch (err) {
    console.error("[user] delete error", err);
    res.status(500).json({ error: "Failed to purge user data" });
  }
});

export default router;

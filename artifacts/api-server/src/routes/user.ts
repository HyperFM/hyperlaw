/**
 * User self-service route.
 * DELETE /user — purges all user-owned rows from the database
 * before the caller invokes Clerk's user.delete() on the frontend.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db, generatedDocumentsTable, aiLogsTable, aiAnalysisCacheTable, uploadedDocumentsTable, notificationsTable, chatSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  (req as any).userId = userId;
  next();
}

router.delete("/user", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;
  try {
    // Run all deletes in parallel; chatSessions cascades → messages automatically
    await Promise.all([
      db.delete(generatedDocumentsTable).where(eq(generatedDocumentsTable.userId, userId)),
      db.delete(aiLogsTable).where(eq(aiLogsTable.userId, userId)),
      db.delete(aiAnalysisCacheTable).where(eq(aiAnalysisCacheTable.userId, userId)),
      db.delete(uploadedDocumentsTable).where(eq(uploadedDocumentsTable.userId, userId)),
      db.delete(notificationsTable).where(eq(notificationsTable.userId, userId)),
      db.delete(chatSessionsTable).where(eq(chatSessionsTable.userId, userId)),
    ]);
    res.status(204).end();
  } catch (err) {
    console.error("[user] delete error", err);
    res.status(500).json({ error: "Failed to purge user data" });
  }
});

export default router;

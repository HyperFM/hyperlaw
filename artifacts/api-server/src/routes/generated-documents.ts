import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db, generatedDocumentsTable } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";

const router = Router();

// Paywall retired (usage-based billing): AI documents are charged at generation time
// and are always returned in full. Legacy rows may still carry a "preview"
// paymentStatus, but it no longer gates access — nothing here truncates content.

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  (req as any).userId = userId;
  next();
}

// ── List generated documents (optionally filtered by caseId) ──────────────────
router.get("/ai/generated-documents", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;
  const rawCaseId = req.query.caseId;
  const caseId = typeof rawCaseId === "string" ? rawCaseId : undefined;
  try {
    const rows = await (caseId
      ? db.select().from(generatedDocumentsTable)
          .where(and(eq(generatedDocumentsTable.userId, userId), eq(generatedDocumentsTable.caseId, caseId)))
          .orderBy(desc(generatedDocumentsTable.createdAt))
      : db.select().from(generatedDocumentsTable)
          .where(eq(generatedDocumentsTable.userId, userId))
          .orderBy(desc(generatedDocumentsTable.createdAt)));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch generated documents" });
  }
});

// ── Create a generated document ───────────────────────────────────────────────
router.post("/ai/generated-documents", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;
  const { caseId, title, documentType, content } = req.body as {
    caseId?: string | null;
    title: string;
    documentType?: string;
    content: string;
  };
  if (!title?.trim() || !content?.trim()) {
    res.status(400).json({ error: "title and content are required" });
    return;
  }
  try {
    const [doc] = await db
      .insert(generatedDocumentsTable)
      .values({
        userId,
        caseId: caseId ?? null,
        title: title.trim(),
        documentType: documentType ?? "other",
        content,
      })
      .returning();
    res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ error: "Failed to save document" });
  }
});

// ── Update a generated document (status or title) ─────────────────────────────
router.patch("/ai/generated-documents/:id", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;
  const id = String(req.params.id);
  const { status, title } = req.body as { status?: string; title?: string };
  if (!status && !title?.trim()) {
    res.status(400).json({ error: "Provide at least one of: status, title" });
    return;
  }
  try {
    const [doc] = await db
      .update(generatedDocumentsTable)
      .set({
        ...(status ? { status } : {}),
        ...(title?.trim() ? { title: title.trim() } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(generatedDocumentsTable.id, id),
          eq(generatedDocumentsTable.userId, userId),
        ),
      )
      .returning();
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: "Failed to update document" });
  }
});

// ── Mark a document as TTS-verified ──────────────────────────────────────────
// Called after the user completes the read-aloud pre-verification step.
router.post("/ai/generated-documents/:id/verify", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;
  const id = String(req.params.id);
  try {
    const [doc] = await db
      .update(generatedDocumentsTable)
      .set({ verifiedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(generatedDocumentsTable.id, id), eq(generatedDocumentsTable.userId, userId)))
      .returning();
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }
    res.json(doc);
  } catch {
    res.status(500).json({ error: "Failed to mark document as verified" });
  }
});

// ── Delete a generated document ───────────────────────────────────────────────
router.delete("/ai/generated-documents/:id", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;
  const id = String(req.params.id);
  try {
    const result = await db
      .delete(generatedDocumentsTable)
      .where(
        and(
          eq(generatedDocumentsTable.id, id),
          eq(generatedDocumentsTable.userId, userId),
        ),
      )
      .returning({ id: generatedDocumentsTable.id });
    if (result.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: "Failed to delete document" });
  }
});

export default router;

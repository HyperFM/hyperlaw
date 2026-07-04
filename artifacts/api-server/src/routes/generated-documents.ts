import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db, generatedDocumentsTable } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import { storage } from "../storage.js";
import { logger } from "../lib/logger.js";
import { getClerkUserEmail } from "./feedback.js";

const router = Router();

const ADMIN_EMAIL = "hyperlawcompliance@gmail.com";

// ── Server-side paywall helper ────────────────────────────────────────────────
// Preview docs are stored with full content but must NEVER be sent in full to
// the client until unlocked. Admins always receive the full content.
const PREVIEW_SERVER_WORD_LIMIT = 200;

type GeneratedDoc = typeof generatedDocumentsTable.$inferSelect;

function toClientDoc(doc: GeneratedDoc, isAdmin = false): GeneratedDoc {
  if (doc.paymentStatus === "paid" || isAdmin) return doc;
  const words = doc.content.split(/\s+/);
  const truncated = words.slice(0, PREVIEW_SERVER_WORD_LIMIT).join(" ");
  return {
    ...doc,
    content: truncated + (words.length > PREVIEW_SERVER_WORD_LIMIT
      ? " … [Unlock the full document to continue reading]"
      : ""),
  };
}

async function checkIsAdmin(userId: string): Promise<boolean> {
  try {
    const info = await getClerkUserEmail(userId);
    return info?.email === ADMIN_EMAIL;
  } catch {
    return false;
  }
}

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
    const [rows, isAdmin] = await Promise.all([
      caseId
        ? db.select().from(generatedDocumentsTable)
            .where(and(eq(generatedDocumentsTable.userId, userId), eq(generatedDocumentsTable.caseId, caseId)))
            .orderBy(desc(generatedDocumentsTable.createdAt))
        : db.select().from(generatedDocumentsTable)
            .where(eq(generatedDocumentsTable.userId, userId))
            .orderBy(desc(generatedDocumentsTable.createdAt)),
      checkIsAdmin(userId),
    ]);
    res.json(rows.map(r => toClientDoc(r, isAdmin)));
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

// ── Unlock a generated document (spend 1 credit) ──────────────────────────────
// If the document is already "paid", returns it immediately (idempotent).
router.post("/ai/generated-documents/:id/unlock", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = String(req.params.id);

  // Verify the document belongs to this user
  const [doc] = await db
    .select()
    .from(generatedDocumentsTable)
    .where(and(eq(generatedDocumentsTable.id, id), eq(generatedDocumentsTable.userId, userId)));

  if (!doc) { res.status(404).json({ error: "Not found" }); return; }

  // Already unlocked — idempotent (return full content)
  if (doc.paymentStatus === "paid") { res.json(doc); return; }

  // Admin bypass — unlock immediately without charging any credits
  const isAdmin = await checkIsAdmin(userId);
  if (isAdmin) {
    const [unlocked] = await db
      .update(generatedDocumentsTable)
      .set({ paymentStatus: "paid", updatedAt: new Date() })
      .where(and(eq(generatedDocumentsTable.id, id), eq(generatedDocumentsTable.userId, userId)))
      .returning();
    res.json(unlocked ?? doc);
    return;
  }

  // Deduct 1 credit atomically
  const deducted = await storage.deductCredit(userId);
  if (!deducted) {
    const balance = await storage.getCreditBalance(userId);
    res.status(402).json({
      error: "Insufficient credits",
      code: "insufficient_credits",
      creditBalance: balance,
    });
    return;
  }

  try {
    // Race-safe: only update if still "preview". If another parallel request already
    // flipped to "paid", this returns 0 rows → refund the credit we just deducted.
    const [updated] = await db
      .update(generatedDocumentsTable)
      .set({ paymentStatus: "paid", updatedAt: new Date() })
      .where(and(
        eq(generatedDocumentsTable.id, id),
        eq(generatedDocumentsTable.userId, userId),
        eq(generatedDocumentsTable.paymentStatus, "preview"), // ← prevents double-unlock
      ))
      .returning();

    if (!updated) {
      // Another request already unlocked it — refund credit and return the paid doc
      await storage.addCredits(userId, 1).catch(e => logger.error({ e }, 'Refund failed'));
      const [existing] = await db
        .select()
        .from(generatedDocumentsTable)
        .where(and(eq(generatedDocumentsTable.id, id), eq(generatedDocumentsTable.userId, userId)));
      res.json(existing ?? { error: "Not found" });
      return;
    }

    res.json(updated); // full content — paymentStatus is now "paid"
  } catch (err) {
    // Refund credit on DB failure
    await storage.addCredits(userId, 1).catch(e => logger.error({ e }, 'Refund failed'));
    res.status(500).json({ error: "Failed to unlock document" });
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
    const isAdmin = await checkIsAdmin(userId);
    res.json(toClientDoc(doc, isAdmin));
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

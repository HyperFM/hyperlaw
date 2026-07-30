import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { casesTable, generatedDocumentsTable, uploadedDocumentsTable } from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { verifyPin } from "../services/security.js";

const router = Router();

// ── GET /cases ─────────────────────────────────────────────────────────────────
router.get("/cases", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const cases = await db
    .select()
    .from(casesTable)
    .where(eq(casesTable.userId, auth.userId))
    .orderBy(desc(casesTable.updatedAt));

  res.json(cases);
});

// ── POST /cases — upsert (create or update) ────────────────────────────────────
router.post("/cases", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { id, title, workflowStage, caseData } = req.body as {
    id: string;
    title: string;
    workflowStage: string;
    caseData: Record<string, unknown>;
  };

  if (!id || !title) { res.status(400).json({ error: "Missing id or title" }); return; }

  // Check ownership before deciding insert vs update — prevents cross-tenant overwrites
  const [existing] = await db
    .select({ userId: casesTable.userId })
    .from(casesTable)
    .where(eq(casesTable.id, id));

  if (existing) {
    // Case already exists — only update if this user owns it
    if (existing.userId !== auth.userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await db
      .update(casesTable)
      .set({
        title: title || "Untitled Case",
        workflowStage: workflowStage ?? "parties",
        caseData: caseData ?? {},
        updatedAt: new Date(),
      })
      .where(eq(casesTable.id, id));
  } else {
    // New case — insert (onConflictDoNothing guards against rare parallel requests)
    await db
      .insert(casesTable)
      .values({
        id,
        userId: auth.userId,
        title: title || "Untitled Case",
        workflowStage: workflowStage ?? "parties",
        caseData: caseData ?? {},
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }

  res.json({ ok: true });
});

// ── PATCH /cases/:id/structured — save Organization Engine output ──────────────
router.patch("/cases/:id/structured", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { structuredCase } = req.body as { structuredCase: Record<string, unknown> };
  if (!structuredCase) { res.status(400).json({ error: "Missing structuredCase" }); return; }

  await db
    .update(casesTable)
    .set({ structuredCase, updatedAt: new Date() })
    .where(and(eq(casesTable.id, String(req.params.id)), eq(casesTable.userId, auth.userId)));

  res.json({ ok: true });
});

// ── POST /cases/:id/studio-project/keep-alive — reset 30-day TTL ───────────────
router.post("/cases/:id/studio-project/keep-alive", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await db
    .update(casesTable)
    .set({ studioProjectExpiresAt: expiresAt, updatedAt: new Date() })
    .where(and(eq(casesTable.id, String(req.params.id)), eq(casesTable.userId, auth.userId)));

  res.json({ ok: true, expiresAt: expiresAt.toISOString() });
});

// ── DELETE /cases/:id/studio-project/clear-expiry — called after confirmed export
router.delete("/cases/:id/studio-project/clear-expiry", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  await db
    .update(casesTable)
    .set({ studioProjectExpiresAt: null, updatedAt: new Date() })
    .where(and(eq(casesTable.id, String(req.params.id)), eq(casesTable.userId, auth.userId)));

  res.json({ ok: true });
});

// ── DELETE /cases/:id ──────────────────────────────────────────────────────────
router.delete("/cases/:id", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  await db
    .delete(casesTable)
    .where(and(eq(casesTable.id, String(req.params.id)), eq(casesTable.userId, auth.userId)));

  res.json({ ok: true });
});

// ── POST /cases/batch-delete — PIN-guarded multi-select deletion ────────────────
router.post("/cases/batch-delete", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { ids, pin } = req.body as { ids?: string[]; pin?: string };
  if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: "No cases selected" }); return; }
  if (typeof pin !== "string" || !pin) { res.status(400).json({ error: "PIN is required" }); return; }

  const v = await verifyPin(auth.userId, pin);
  if (!v.ok) { res.status(v.locked ? 429 : 401).json(v); return; }

  const cleanIds = ids.filter((i): i is string => typeof i === "string");
  await Promise.all([
    db.delete(casesTable).where(and(eq(casesTable.userId, auth.userId), inArray(casesTable.id, cleanIds))),
    db.delete(generatedDocumentsTable).where(and(eq(generatedDocumentsTable.userId, auth.userId), inArray(generatedDocumentsTable.caseId, cleanIds))),
    db.delete(uploadedDocumentsTable).where(and(eq(uploadedDocumentsTable.userId, auth.userId), inArray(uploadedDocumentsTable.caseId, cleanIds))),
  ]);
  res.json({ ok: true, deleted: cleanIds.length });
});

export default router;

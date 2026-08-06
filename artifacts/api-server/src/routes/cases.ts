import { Router, type Request, type Response } from "express";
import { getAuth } from "../services/auth.js";
import { db } from "@workspace/db";
import { casesTable, generatedDocumentsTable, uploadedDocumentsTable } from "@workspace/db";
import { eq, and, desc, inArray, lt } from "drizzle-orm";
import { verifyPin } from "../services/security.js";

const router = Router();

// A case with zero saves (title/story/documents/studio work, anything that
// touches updatedAt) for this long is treated as abandoned and permanently
// deleted the next time this user's case list is loaded. There's no separate
// cron/worker in this deployment, so the sweep runs lazily on GET /cases —
// cheap (one indexed query per app load) and only matters when it matters:
// if the user never opens the app again, nobody's around to notice either way.
const CASE_INACTIVITY_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

async function sweepInactiveCases(userId: string): Promise<void> {
  const cutoff = new Date(Date.now() - CASE_INACTIVITY_MS);
  const stale = await db
    .select({ id: casesTable.id })
    .from(casesTable)
    .where(and(eq(casesTable.userId, userId), lt(casesTable.updatedAt, cutoff)));
  if (!stale.length) return;

  const staleIds = stale.map(c => c.id);
  await Promise.all([
    db.delete(casesTable).where(and(eq(casesTable.userId, userId), inArray(casesTable.id, staleIds))),
    db.delete(generatedDocumentsTable).where(and(eq(generatedDocumentsTable.userId, userId), inArray(generatedDocumentsTable.caseId, staleIds))),
    db.delete(uploadedDocumentsTable).where(and(eq(uploadedDocumentsTable.userId, userId), inArray(uploadedDocumentsTable.caseId, staleIds))),
  ]);
}

// ── GET /cases ─────────────────────────────────────────────────────────────────
router.get("/cases", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  await sweepInactiveCases(auth.userId);

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

// ── PUT /cases/:id/photo — save the barrel-screen case photo ───────────────────
// Small (a few KB) downscaled JPEG data URL — client already resizes to 256px
// before sending. Its own column (not caseData) for the same reason as the
// studio video: caseData is fully overwritten by the client on every autosave.
const CASE_PHOTO_MAX_CHARS = 400_000; // generous headroom over a 256px JPEG data URL
router.put("/cases/:id/photo", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { dataUrl } = req.body as { dataUrl?: string };
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    res.status(400).json({ error: "Missing or invalid dataUrl" });
    return;
  }
  if (dataUrl.length > CASE_PHOTO_MAX_CHARS) { res.status(413).json({ error: "Photo too large" }); return; }

  await db
    .update(casesTable)
    .set({ casePhotoDataUrl: dataUrl, updatedAt: new Date() })
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

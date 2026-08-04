import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { getAuth } from "../services/auth.js";
import { db } from "@workspace/db";
import { casesTable, generatedDocumentsTable, uploadedDocumentsTable } from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { verifyPin } from "../services/security.js";
import * as videoStorage from "../services/videoStorage.js";

const router = Router();

// 500 MB ceiling — well above what a 5-minute clip needs even uncompressed;
// the real gate is the duration check below, this is just a sane backstop.
const uploadVideo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
});

function handleVideoMulterError(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (err && (err as NodeJS.ErrnoException).code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "Video file too large (max 500 MB)." });
    return;
  }
  next(err);
}

const FIVE_MINUTES_SEC = 5 * 60;

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

// ── POST /cases/:id/studio-project/video — upload the studio video to storage ──
// Body: multipart form, field "video" (the file) + "durationSec" (from the
// browser's own loadedmetadata event). Non-admins are capped at 5 minutes —
// the client should already show an upgrade prompt before even getting here,
// but this is the real enforcement point since the client can't be trusted.
router.post(
  "/cases/:id/studio-project/video",
  uploadVideo.single("video"),
  handleVideoMulterError,
  async (req: Request, res: Response): Promise<void> => {
    const auth = getAuth(req);
    if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    if (!videoStorage.isConfigured()) {
      res.status(503).json({ error: "Video storage is not configured yet." });
      return;
    }

    const multerReq = req as Request & { file?: { buffer: Buffer; mimetype: string } };
    if (!multerReq.file) { res.status(400).json({ error: "No video provided" }); return; }

    const durationSec = Number(req.body.durationSec);
    const isAdmin = !!req.user?.isAdmin;
    if (Number.isFinite(durationSec) && durationSec > FIVE_MINUTES_SEC && !isAdmin) {
      res.status(403).json({
        error: "Videos are limited to 5 minutes on the free plan. Upgrade for longer videos.",
        code: "video_duration_limit",
      });
      return;
    }

    const caseId = String(req.params.id);
    const [existing] = await db
      .select({ userId: casesTable.userId, oldKey: casesTable.studioVideoKey })
      .from(casesTable)
      .where(eq(casesTable.id, caseId));
    if (!existing || existing.userId !== auth.userId) { res.status(404).json({ error: "Case not found" }); return; }

    const { buffer, mimetype } = multerReq.file;
    try {
      const key = await videoStorage.uploadVideo(caseId, buffer, mimetype);
      // Replacing an existing upload (re-linked/re-picked video) — clean up the old object.
      if (existing.oldKey) await videoStorage.deleteVideo(existing.oldKey).catch(() => {});
      await db.update(casesTable).set({ studioVideoKey: key, updatedAt: new Date() }).where(eq(casesTable.id, caseId));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message || "Video upload failed" });
    }
  },
);

// ── GET /cases/:id/studio-project/video — signed URL for the stored video ──────
router.get("/cases/:id/studio-project/video", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [row] = await db
    .select({ userId: casesTable.userId, key: casesTable.studioVideoKey })
    .from(casesTable)
    .where(eq(casesTable.id, String(req.params.id)));
  if (!row || row.userId !== auth.userId) { res.status(404).json({ error: "Case not found" }); return; }
  if (!row.key) { res.json({ url: null }); return; }

  try {
    const url = await videoStorage.getSignedVideoUrl(row.key);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || "Could not retrieve video" });
  }
});

// ── DELETE /cases/:id/studio-project/video — wipe the stored video ─────────────
router.delete("/cases/:id/studio-project/video", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const caseId = String(req.params.id);
  const [row] = await db
    .select({ userId: casesTable.userId, key: casesTable.studioVideoKey })
    .from(casesTable)
    .where(eq(casesTable.id, caseId));
  if (!row || row.userId !== auth.userId) { res.status(404).json({ error: "Case not found" }); return; }

  if (row.key) await videoStorage.deleteVideo(row.key).catch(() => {});
  await db.update(casesTable).set({ studioVideoKey: null, updatedAt: new Date() }).where(eq(casesTable.id, caseId));
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

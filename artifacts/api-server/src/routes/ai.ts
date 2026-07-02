import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import multer from "multer";
import { aiService } from "../services/ai.js";
import { parseDocument } from "../services/documentParser.js";
import { db, uploadedDocumentsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const router = Router();

// 20 MB limit; memory storage (no disk writes needed for text extraction)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// Auth guard middleware — MUST run before multer to block unauthenticated large uploads
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
}

// Multer error handler (file-too-large, etc.)
function handleMulterError(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (err && (err as NodeJS.ErrnoException).code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "File too large. Maximum size is 20 MB." });
    return;
  }
  next(err);
}

// ── GET /ai/status ────────────────────────────────────────────────────────────
router.get("/ai/status", (_req: Request, res: Response): void => {
  res.json({ configured: aiService.isConfigured(), provider: "claude" });
});

// ── POST /ai/analyze ──────────────────────────────────────────────────────────
router.post("/ai/analyze", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  if (!aiService.isConfigured()) {
    res.status(503).json({ error: "Claude AI not configured", code: "ai_not_configured" });
    return;
  }

  const { type, incident, hlCase, incidents } = req.body as {
    type: "incident" | "case";
    incident?: Record<string, string>;
    hlCase?: { title: string; notes: string };
    incidents?: Array<{ title: string; description: string; category: string; dateOfEvent?: string; location?: string }>;
  };

  try {
    if (type === "incident" && incident) {
      const analysis = await aiService.analyzeIncident(incident as Parameters<typeof aiService.analyzeIncident>[0]);
      res.json(analysis);
    } else if (type === "case" && hlCase) {
      const analysis = await aiService.analyzeCase(hlCase, incidents ?? []);
      res.json(analysis);
    } else {
      res.status(400).json({ error: "Invalid request body" });
    }
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || "Analysis failed" });
  }
});

// ── POST /ai/chat ─────────────────────────────────────────────────────────────
router.post("/ai/chat", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  if (!aiService.isConfigured()) {
    res.status(503).json({ error: "Claude AI not configured", code: "ai_not_configured" });
    return;
  }

  const { message, context } = req.body as {
    message: string;
    context?: Parameters<typeof aiService.chat>[1];
  };

  if (!message?.trim()) { res.status(400).json({ error: "message is required" }); return; }

  try {
    const reply = await aiService.chat(message, context ?? { history: [] });
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || "Chat failed" });
  }
});

// ── POST /ai/upload ───────────────────────────────────────────────────────────
router.post(
  "/ai/upload",
  requireAuth,          // ← auth FIRST so unauthenticated requests never touch multer
  upload.single("file"),
  handleMulterError,    // ← catch LIMIT_FILE_SIZE before the async handler
  async (req: Request, res: Response): Promise<void> => {
    const auth = getAuth(req);
    // auth.userId is guaranteed by requireAuth middleware
    if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    // multer v2 attaches file to req at runtime; cast to access it
    const multerReq = req as Request & { file?: { buffer: Buffer; mimetype: string; originalname: string } };
    if (!multerReq.file) { res.status(400).json({ error: "No file provided" }); return; }

    const { buffer, mimetype, originalname } = multerReq.file;

    try {
      // 1. Extract text from the document
      const parsed = await parseDocument(buffer, mimetype, originalname);

      // 2. AI-extract case metadata (optional — skip if not configured or text is too short)
      let extraction = null;
      if (aiService.isConfigured() && parsed.wordCount > 20) {
        try {
          extraction = await aiService.extractFromDocument(parsed.text);
        } catch {
          // Non-fatal — upload still succeeds without extraction
        }
      }

      // 3. Persist to DB (non-fatal if DB is unavailable)
      let docId: string | null = null;
      try {
        const caseId = typeof req.body.caseId === "string" ? req.body.caseId : null;
        const rows = await db.insert(uploadedDocumentsTable).values({
          userId: auth.userId,
          caseId,
          fileName: originalname,
          mimeType: mimetype,
          extractedText: parsed.text.slice(0, 50_000), // cap at 50k chars
          caseExtraction: extraction as Record<string, unknown> | null,
        }).returning({ id: uploadedDocumentsTable.id });
        docId = rows[0]?.id ?? null;
      } catch {
        // DB storage failure is non-fatal
      }

      res.json({
        docId,
        method: parsed.method,
        pageCount: parsed.pageCount,
        wordCount: parsed.wordCount,
        textPreview: parsed.text.slice(0, 2000),
        extraction,
      });
    } catch (err) {
      res.status(422).json({ error: (err as Error).message || "Document processing failed" });
    }
  },
);

// ── GET /ai/documents/:caseId ─────────────────────────────────────────────────
router.get("/ai/documents/:caseId", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const docs = await db
      .select({
        id: uploadedDocumentsTable.id,
        fileName: uploadedDocumentsTable.fileName,
        mimeType: uploadedDocumentsTable.mimeType,
        wordCount: uploadedDocumentsTable.extractedText,
        caseExtraction: uploadedDocumentsTable.caseExtraction,
        createdAt: uploadedDocumentsTable.createdAt,
      })
      .from(uploadedDocumentsTable)
      .where(
        and(
          eq(uploadedDocumentsTable.caseId, String(req.params.caseId)),
          eq(uploadedDocumentsTable.userId, auth.userId),
        ),
      );
    res.json(docs);
  } catch {
    res.json([]);
  }
});

export default router;

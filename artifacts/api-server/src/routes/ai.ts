import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import multer from "multer";
import { aiService } from "../services/ai.js";
import { parseDocument } from "../services/documentParser.js";
import {
  computeCacheKey,
  getFromCache,
  setCache,
  logAiCall,
  checkDailyLimit,
  type AiFeature,
} from "../services/aiCache.js";
import { db, uploadedDocumentsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const router = Router();

// 20 MB limit; memory storage (no disk writes needed for text extraction)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// Auth guard — MUST run before multer to block unauthenticated large uploads
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
}

function handleMulterError(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (err && (err as NodeJS.ErrnoException).code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "File too large. Maximum size is 20 MB." });
    return;
  }
  next(err);
}

// ── GET /ai/status ─────────────────────────────────────────────────────────────
router.get("/ai/status", (_req: Request, res: Response): void => {
  res.json({ configured: aiService.isConfigured(), provider: "claude" });
});

// ── POST /ai/analyze ───────────────────────────────────────────────────────────
// Body: { type, incident?, hlCase?, incidents?, forceRefresh?, caseId? }
// Response: TutorAnalysis + { fromCache, cachedAt? }
router.post("/ai/analyze", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  if (!aiService.isConfigured()) {
    res.status(503).json({ error: "Claude AI not configured", code: "ai_not_configured" });
    return;
  }

  const { type, incident, hlCase, incidents, forceRefresh, caseId } = req.body as {
    type: "incident" | "case";
    incident?: Record<string, string>;
    hlCase?: { title: string; notes: string };
    incidents?: Array<{ title: string; description: string; category: string; dateOfEvent?: string; location?: string }>;
    forceRefresh?: boolean;
    caseId?: string;
  };

  const userId = auth.userId;
  const feature: AiFeature = type === "incident" ? "analyze_incident" : "analyze_case";

  // Content used for cache key
  const cacheContent = type === "incident" ? incident : { hlCase, incidents };
  const cacheKey = computeCacheKey(feature, cacheContent);

  try {
    // ── Cache check ──────────────────────────────────────────────────────────
    if (!forceRefresh) {
      const cached = await getFromCache(userId, cacheKey);
      if (cached) {
        // Log cache hit (0 tokens, 0 cost, 0 ms)
        void logAiCall({
          userId,
          caseId: caseId ?? null,
          feature,
          model: "claude-opus-4-5",
          inputTokens: 0,
          outputTokens: 0,
          estimatedCostMicroUsd: 0,
          responseTimeMs: 0,
          cacheHit: true,
          promptTemplate: feature,
        });
        res.json({ ...cached.result as object, fromCache: true, cachedAt: cached.createdAt });
        return;
      }
    }

    // ── Rate limit check ─────────────────────────────────────────────────────
    const limitCheck = await checkDailyLimit(userId);
    if (!limitCheck.allowed) {
      res.status(429).json({
        error: `Daily AI limit reached (${limitCheck.count}/${limitCheck.limit} calls). Upgrade your plan for more.`,
        code: "rate_limited",
      });
      return;
    }

    // ── Call Claude ──────────────────────────────────────────────────────────
    let aiResult;
    if (type === "incident" && incident) {
      aiResult = await aiService.analyzeIncident(incident as Parameters<typeof aiService.analyzeIncident>[0]);
    } else if (type === "case" && hlCase) {
      aiResult = await aiService.analyzeCase(hlCase, incidents ?? []);
    } else {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    // ── Log + cache ──────────────────────────────────────────────────────────
    void logAiCall({
      userId,
      caseId: caseId ?? null,
      feature,
      model: aiResult.meta.model,
      inputTokens: aiResult.meta.inputTokens,
      outputTokens: aiResult.meta.outputTokens,
      estimatedCostMicroUsd: aiResult.meta.estimatedCostMicroUsd,
      responseTimeMs: aiResult.meta.responseTimeMs,
      cacheHit: false,
      promptTemplate: feature,
    });
    void setCache(userId, cacheKey, feature, aiResult.data);

    res.json({ ...aiResult.data, fromCache: false });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || "Analysis failed" });
  }
});

// ── POST /ai/chat ──────────────────────────────────────────────────────────────
// Chat is not cached (it's conversational), but every call is logged.
router.post("/ai/chat", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  if (!aiService.isConfigured()) {
    res.status(503).json({ error: "Claude AI not configured", code: "ai_not_configured" });
    return;
  }

  const { message, context, caseId } = req.body as {
    message: string;
    context?: Parameters<typeof aiService.chat>[1];
    caseId?: string;
  };

  if (!message?.trim()) { res.status(400).json({ error: "message is required" }); return; }

  const userId = auth.userId;

  // Rate limit
  const limitCheck = await checkDailyLimit(userId);
  if (!limitCheck.allowed) {
    res.status(429).json({ error: `Daily AI limit reached (${limitCheck.count}/${limitCheck.limit}).`, code: "rate_limited" });
    return;
  }

  try {
    const aiResult = await aiService.chat(message, context ?? { history: [] });

    void logAiCall({
      userId,
      caseId: caseId ?? null,
      feature: "chat",
      model: aiResult.meta.model,
      inputTokens: aiResult.meta.inputTokens,
      outputTokens: aiResult.meta.outputTokens,
      estimatedCostMicroUsd: aiResult.meta.estimatedCostMicroUsd,
      responseTimeMs: aiResult.meta.responseTimeMs,
      cacheHit: false,
      promptTemplate: "chat",
    });

    res.json({ reply: aiResult.data });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || "Chat failed" });
  }
});

// ── POST /ai/upload ────────────────────────────────────────────────────────────
router.post(
  "/ai/upload",
  requireAuth,
  upload.single("file"),
  handleMulterError,
  async (req: Request, res: Response): Promise<void> => {
    const auth = getAuth(req);
    if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const multerReq = req as Request & { file?: { buffer: Buffer; mimetype: string; originalname: string } };
    if (!multerReq.file) { res.status(400).json({ error: "No file provided" }); return; }

    const { buffer, mimetype, originalname } = multerReq.file;
    const userId = auth.userId;

    try {
      // 1. Extract text from the document
      const parsed = await parseDocument(buffer, mimetype, originalname);

      // 2. AI-extract case metadata — check cache by content hash first
      let extraction = null;
      let docExtractionFromCache = false;

      if (aiService.isConfigured() && parsed.wordCount > 20) {
        const extractKey = computeCacheKey("extract_document", parsed.text.slice(0, 5000));
        const cached = await getFromCache(userId, extractKey);

        if (cached) {
          extraction = cached.result;
          docExtractionFromCache = true;
          void logAiCall({
            userId,
            feature: "extract_document",
            model: "claude-opus-4-5",
            inputTokens: 0, outputTokens: 0, estimatedCostMicroUsd: 0, responseTimeMs: 0,
            cacheHit: true, promptTemplate: "extract_document",
          });
        } else {
          try {
            const aiResult = await aiService.extractFromDocument(parsed.text);
            extraction = aiResult.data;
            void logAiCall({
              userId,
              feature: "extract_document",
              model: aiResult.meta.model,
              inputTokens: aiResult.meta.inputTokens,
              outputTokens: aiResult.meta.outputTokens,
              estimatedCostMicroUsd: aiResult.meta.estimatedCostMicroUsd,
              responseTimeMs: aiResult.meta.responseTimeMs,
              cacheHit: false,
              promptTemplate: "extract_document",
            });
            void setCache(userId, extractKey, "extract_document", extraction);
          } catch {
            // Non-fatal — upload still succeeds without extraction
          }
        }
      }

      // 3. OCR logging (handled inside parseDocument when it calls aiService.ocrImage)
      // If the document was parsed via OCR, that call is logged separately by the image branch below.

      // 4. Persist to DB
      let docId: string | null = null;
      try {
        const caseId = typeof req.body.caseId === "string" ? req.body.caseId : null;
        const rows = await db.insert(uploadedDocumentsTable).values({
          userId,
          caseId,
          fileName: originalname,
          mimeType: mimetype,
          extractedText: parsed.text.slice(0, 50_000),
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
        fromCache: docExtractionFromCache,
      });
    } catch (err) {
      res.status(422).json({ error: (err as Error).message || "Document processing failed" });
    }
  },
);

// ── GET /ai/documents/:caseId ──────────────────────────────────────────────────
router.get("/ai/documents/:caseId", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const docs = await db
      .select({
        id: uploadedDocumentsTable.id,
        fileName: uploadedDocumentsTable.fileName,
        mimeType: uploadedDocumentsTable.mimeType,
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

import { Router, type Request, type Response, type NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { getAuth } from "@clerk/express";
import { searchLibrary, formatLibraryContext } from "../services/knowledgeLibrary.js";
import multer from "multer";
import { aiService, MODEL } from "../services/ai.js";
import { parseDocument } from "../services/documentParser.js";
import {
  computeCacheKey,
  getFromCache,
  setCache,
  logAiCall,
  checkDailyLimit,
  type AiFeature,
} from "../services/aiCache.js";
import { db, uploadedDocumentsTable, generatedDocumentsTable, errorLogsTable, casesTable } from "@workspace/db";
import { storage } from "../storage.js";
import { and, eq, sql } from "drizzle-orm";
import { getClerkUserEmail } from "./feedback.js";

const ADMIN_EMAILS = new Set(["hyperlawcompliance@gmail.com", "hypermodula@gmail.com"]);

const router = Router();

// Per-IP burst protection — supplements the per-user daily limit in aiCache.ts
router.use(rateLimit({
  windowMs: 60_000, // 1-minute window
  max: 40,          // 40 AI requests per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a moment before trying again." },
}));

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
  // v2 = factual-gap schema (summary insight type replaced by gap)
  const feature: AiFeature = type === "incident" ? "analyze_incident_v2" : "analyze_case_v2";

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
          model: MODEL,
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

    // ── Library-first context injection ──────────────────────────────────────
    const queryText = type === "incident"
      ? `${(incident as Record<string, string>)?.title ?? ""} ${(incident as Record<string, string>)?.description ?? ""}`
      : `${hlCase?.title ?? ""} ${hlCase?.notes ?? ""} ${(incidents ?? []).map(i => `${i.title} ${i.description}`).join(" ")}`;
    const libCategory = type === "incident" ? (incident as Record<string, string>)?.category : undefined;
    const libEntries = await searchLibrary({ query: queryText, category: libCategory, limit: 3 });
    const libContext = formatLibraryContext(libEntries) || undefined;

    // ── Call Claude ──────────────────────────────────────────────────────────
    let aiResult;
    if (type === "incident" && incident) {
      aiResult = await aiService.analyzeIncident(
        incident as Parameters<typeof aiService.analyzeIncident>[0],
        { libraryContext: libContext },
      );
    } else if (type === "case" && hlCase) {
      aiResult = await aiService.analyzeCase(hlCase, incidents ?? [], { libraryContext: libContext });
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

// ── POST /ai/timeline ─────────────────────────────────────────────────────────
// Parse a free-text story into chronological timeline events.
router.post("/ai/timeline", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  if (!aiService.isConfigured()) {
    res.status(503).json({ error: "Claude AI not configured", code: "ai_not_configured" });
    return;
  }

  const { story, caseId } = req.body as { story?: string; caseId?: string };
  if (!story?.trim()) { res.status(400).json({ error: "story is required" }); return; }

  const userId = auth.userId;
  const limitCheck = await checkDailyLimit(userId);
  if (!limitCheck.allowed) {
    res.status(429).json({ error: `Daily AI limit reached (${limitCheck.count}/${limitCheck.limit}).`, code: "rate_limited" });
    return;
  }

  try {
    const aiResult = await aiService.buildTimeline(story);

    void logAiCall({
      userId,
      caseId: caseId ?? null,
      feature: "timeline",
      model: aiResult.meta.model,
      inputTokens: aiResult.meta.inputTokens,
      outputTokens: aiResult.meta.outputTokens,
      estimatedCostMicroUsd: aiResult.meta.estimatedCostMicroUsd,
      responseTimeMs: aiResult.meta.responseTimeMs,
      cacheHit: false,
      promptTemplate: "timeline",
    });

    res.json({ events: aiResult.data });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || "Timeline build failed" });
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
      // 1. Parse text from the document — no AI analysis at this stage
      const parsed = await parseDocument(buffer, mimetype, originalname);

      // 2. Persist to DB — store raw text for later analysis
      let docId: string | null = null;
      try {
        const caseId = typeof req.body.caseId === "string" ? req.body.caseId : null;
        const rows = await db.insert(uploadedDocumentsTable).values({
          userId,
          caseId,
          fileName: originalname,
          mimeType: mimetype,
          extractedText: parsed.text.slice(0, 50_000),
          caseExtraction: null,
        }).returning({ id: uploadedDocumentsTable.id });
        docId = rows[0]?.id ?? null;
      } catch {
        // DB storage failure is non-fatal
      }

      // 3. Return receipt — no AI extraction here; call POST /ai/analyze-document for that
      res.json({
        docId,
        method: parsed.method,
        pageCount: parsed.pageCount,
        wordCount: parsed.wordCount,
        textPreview: parsed.text.slice(0, 2000),
        extraction: null,
        fromCache: false,
      });
    } catch (err) {
      // Log failure for admin visibility — truly fire-and-forget (no await)
      void (async () => {
        try {
          const uid = (req as any).auth?.userId as string | undefined;
          const fileName = ((req as any).file?.originalname) as string | undefined;
          if (uid) {
            await db.insert(errorLogsTable).values({
              userId: uid,
              context: "upload",
              message: (err as Error).message || "Document processing failed",
              metadata: fileName ? { fileName } : null,
            });
          }
        } catch { /* swallow — never surface DB failures to the client */ }
      })();
      res.status(422).json({ error: (err as Error).message || "Document processing failed" });
    }
  },
);

// ── POST /ai/analyze-document ──────────────────────────────────────────────────
// Deducts 1 credit, runs Claude Case Memory build on a stored document.
// Body: { docId, caseId, intakeAnswers: { docType, preparedBy, hasParties, hasDates, additionalContext } }
router.post("/ai/analyze-document", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { docId, caseId, intakeAnswers } = req.body as {
    docId?: string;
    caseId?: string;
    intakeAnswers?: { docType: string; preparedBy: string; hasParties: string; hasDates: string; additionalContext: string };
  };

  const userId = auth.userId;
  let failStep = "pre-validation";
  let creditDeducted = false; // only true when a real credit was charged (not admin/Apex)

  // Helper — log a failure to errorLogsTable so it's visible in the Admin Errors tab
  async function logFailure(step: string, err: unknown) {
    console.error(`[analyze-document] FAIL step="${step}" userId=${userId} caseId=${caseId ?? "?"} docId=${docId ?? "?"} error="${(err as Error).message ?? String(err)}"`);
    try {
      await db.insert(errorLogsTable).values({
        userId,
        context: "analyze_document",
        message: `Step "${step}" failed: ${(err as Error).message || String(err)}`,
        metadata: { step, caseId: caseId ?? null, docId: docId ?? null, stack: (err as Error).stack?.slice(0, 500) ?? null },
      });
    } catch { /* never let logging break the response */ }
  }

  try {
    // ── Checkpoint 1: User pressed Analyze ─────────────────────────────────
    console.log(`[analyze-document] STEP 1: request received userId=${userId} docId=${docId} caseId=${caseId}`);

    // ── Checkpoint 2: Validate inputs ──────────────────────────────────────
    failStep = "input-validation";
    if (!docId) { res.status(400).json({ error: "docId is required" }); return; }
    if (!caseId) { res.status(400).json({ error: "caseId is required" }); return; }
    if (!intakeAnswers) { res.status(400).json({ error: "intakeAnswers is required" }); return; }

    if (!aiService.isConfigured()) {
      console.error("[analyze-document] FAIL: ANTHROPIC_API_KEY not set");
      res.status(503).json({ error: "AI not configured", code: "ai_not_configured" });
      return;
    }
    console.log(`[analyze-document] STEP 2: inputs valid, AI configured`);

    // ── Checkpoint 3: Load document text from DB ───────────────────────────
    failStep = "load-document";
    const [doc] = await db
      .select({
        extractedText: uploadedDocumentsTable.extractedText,
        fileName: uploadedDocumentsTable.fileName,
        caseExtraction: uploadedDocumentsTable.caseExtraction,
      })
      .from(uploadedDocumentsTable)
      .where(and(eq(uploadedDocumentsTable.id, docId), eq(uploadedDocumentsTable.userId, userId)));

    if (!doc) {
      console.error(`[analyze-document] FAIL: document not found docId=${docId}`);
      res.status(404).json({ error: "Document not found" });
      return;
    }
    const textLen = doc.extractedText?.trim().length ?? 0;
    if (textLen < 10) {
      console.error(`[analyze-document] FAIL: document has no extractable text docId=${docId} textLen=${textLen}`);
      res.status(422).json({ error: "Document has no extractable text. Please upload a text-based PDF or document." });
      return;
    }
    console.log(`[analyze-document] STEP 3: document loaded fileName="${doc.fileName}" textLen=${textLen}`);

    // ── Checkpoint 4: Intake responses loaded ─────────────────────────────
    console.log(`[analyze-document] STEP 4: intake answers loaded docType="${intakeAnswers.docType}" preparedBy="${intakeAnswers.preparedBy}" hasParties="${intakeAnswers.hasParties}" hasDates="${intakeAnswers.hasDates}"`);

    // ── Idempotency guard — return stored result if already analyzed ───────
    // Guard requires meaningful content (caseSummary or summary key present)
    const stored = doc.caseExtraction as Record<string, unknown> | null;
    if (stored && (stored.caseSummary || stored.summary) && Object.keys(stored).length >= 3) {
      console.log(`[analyze-document] idempotency hit — returning stored result docId=${docId}`);
      res.json({ ok: true, analysis: stored, fileName: doc.fileName, fromCache: true });
      return;
    }

    // ── Checkpoint 5: Credit verification ─────────────────────────────────
    failStep = "credit-verification";
    const userInfo = await getClerkUserEmail(userId).catch(() => null);
    const isAdminUser = ADMIN_EMAILS.has(userInfo?.email ?? "");

    // Check Apex plan tier via Stripe (Apex = unlimited, no credit charge)
    let isApexUser = false;
    if (!isAdminUser) {
      try {
        const customerId = await storage.getStripeCustomerId(userId);
        if (customerId) {
          const { getUncachableStripeClient } = await import("../stripeClient.js");
          const stripe = await getUncachableStripeClient();
          const subs = await stripe.subscriptions.list({
            customer: customerId,
            status: "active",
            limit: 5,
            expand: ["data.items.data.price.product"],
          });
          outer: for (const sub of subs.data) {
            for (const item of sub.items.data) {
              const product = item.price.product as { name?: string };
              if ((product.name ?? "").toLowerCase().includes("apex")) { isApexUser = true; break outer; }
            }
          }
        }
      } catch { /* non-fatal — default stays false */ }
    }

    if (isAdminUser) {
      console.log(`[analyze-document] STEP 5: admin account — credit deduction skipped`);
    } else if (isApexUser) {
      console.log(`[analyze-document] STEP 5: Apex Litigant — credit deduction skipped`);
    } else {
      const balance = await storage.getCreditBalance(userId);
      console.log(`[analyze-document] STEP 5: credit check userId=${userId} balance=${balance}`);
      if (balance < 1) {
        console.log(`[analyze-document] FAIL: insufficient credits balance=${balance}`);
        res.status(402).json({ error: "Insufficient credits", code: "insufficient_credits", creditBalance: balance });
        return;
      }
      const deducted = await storage.deductCredit(userId);
      if (!deducted) {
        console.log(`[analyze-document] FAIL: deductCredit returned false (race condition) userId=${userId}`);
        res.status(402).json({ error: "Insufficient credits", code: "insufficient_credits", creditBalance: 0 });
        return;
      }
      creditDeducted = true;
      console.log(`[analyze-document] STEP 5: 1 credit deducted`);
    }

    // ── Checkpoint 6: Build Claude request payload ─────────────────────────
    failStep = "claude-call";
    console.log(`[analyze-document] STEP 6: building Claude Case Memory prompt documentTextLen=${doc.extractedText!.length}`);

    // ── Checkpoint 7: Claude API request sent ─────────────────────────────
    console.log(`[analyze-document] STEP 7: sending request to Claude model=${process.env.AI_MODEL ?? "claude-sonnet-5"}`);

    let analysis;
    try {
      const aiResult = await aiService.buildCaseMemory(doc.extractedText!, intakeAnswers);
      analysis = aiResult.data;

      // ── Checkpoint 8: Claude response received ─────────────────────────
      console.log(`[analyze-document] STEP 8: Claude responded inputTokens=${aiResult.meta.inputTokens} outputTokens=${aiResult.meta.outputTokens} responseTimeMs=${aiResult.meta.responseTimeMs}`);

      void logAiCall({
        userId,
        caseId,
        feature: "build_case_memory",
        model: aiResult.meta.model,
        inputTokens: aiResult.meta.inputTokens,
        outputTokens: aiResult.meta.outputTokens,
        estimatedCostMicroUsd: aiResult.meta.estimatedCostMicroUsd,
        responseTimeMs: aiResult.meta.responseTimeMs,
        cacheHit: false,
        promptTemplate: "build_case_memory",
      });
    } catch (claudeErr) {
      // Refund only if a credit was actually charged — admin & Apex users are never deducted,
      // so refunding them would inflate their balance on every failure.
      if (creditDeducted) {
        await db.execute(sql`UPDATE users SET credit_balance = credit_balance + 1 WHERE id = ${userId}`);
        console.log(`[analyze-document] credit refunded after Claude failure`);
      }
      await logFailure("claude-call", claudeErr);
      throw claudeErr;
    }

    // ── Checkpoint 9: Response parsed ─────────────────────────────────────
    console.log(`[analyze-document] STEP 9: response parsed parties=${(analysis.parties ?? []).length} events=${(analysis.events ?? []).length} claims=${(analysis.claims ?? []).length}`);

    // ── Checkpoint 10: Save Case Memory to DB ─────────────────────────────
    failStep = "save-case-memory";

    // Save on document record (idempotency key for future calls)
    try {
      await db
        .update(uploadedDocumentsTable)
        .set({ caseExtraction: analysis as unknown as Record<string, unknown> })
        .where(eq(uploadedDocumentsTable.id, docId));
    } catch (saveErr) {
      console.warn(`[analyze-document] WARN: failed to save caseExtraction to uploadedDocuments — non-fatal`, (saveErr as Error).message);
    }

    // Merge Case Memory into the case record: parties, events → timeline, notes, caseMemory blob
    try {
      const [existingCase] = await db
        .select({ caseData: casesTable.caseData })
        .from(casesTable)
        .where(and(eq(casesTable.id, caseId), eq(casesTable.userId, userId)));

      if (existingCase) {
        const existing = (existingCase.caseData ?? {}) as Record<string, unknown>;

        // Merge parties
        const existingParties = (existing.parties as unknown[]) ?? [];
        const newParties = (analysis.parties ?? []).map((p: { name: string; role: string; details?: string }) => ({
          id: crypto.randomUUID(),
          firstName: p.name.split(" ")[0] ?? p.name,
          lastName: p.name.split(" ").slice(1).join(" ") ?? "",
          type: p.role === "plaintiff" ? "plaintiff" : p.role === "defendant" ? "defendant" : "other",
          description: p.details ?? "",
          nickname: "",
        }));
        const mergedParties = [...existingParties, ...newParties];

        // Merge timeline events (from analysis.events)
        const existingTimeline = (existing.timeline as unknown[]) ?? [];
        const newTimeline = (analysis.events ?? []).map((t: { date: string; description: string; significance?: string }) => ({
          id: crypto.randomUUID(),
          date: t.date,
          title: t.description.slice(0, 80),
          description: t.significance ?? t.description,
          category: "other",
        }));
        const mergedTimeline = [...existingTimeline, ...newTimeline];

        // Store the full Case Memory blob under caseData.caseMemory
        await db
          .update(casesTable)
          .set({
            caseData: {
              ...existing,
              parties: mergedParties,
              timeline: mergedTimeline,
              notes: [existing.notes as string ?? "", analysis.caseSummary].filter(Boolean).join("\n\n"),
              caseMemory: analysis,
            },
            updatedAt: new Date(),
          })
          .where(and(eq(casesTable.id, caseId), eq(casesTable.userId, userId)));

        console.log(`[analyze-document] STEP 10: Case Memory saved to DB caseId=${caseId} mergedParties=${mergedParties.length} mergedTimeline=${mergedTimeline.length}`);
      } else {
        console.warn(`[analyze-document] WARN: case not found for caseMemory merge caseId=${caseId}`);
      }
    } catch (mergeErr) {
      console.warn(`[analyze-document] WARN: case merge failed — non-fatal`, (mergeErr as Error).message);
    }

    // ── Checkpoint 11: Return result ──────────────────────────────────────
    console.log(`[analyze-document] STEP 11: sending response to client`);
    res.json({ ok: true, analysis, fileName: doc.fileName });

  } catch (err) {
    await logFailure(failStep, err);
    res.status(500).json({ error: (err as Error).message || "Document analysis failed" });
  }
});

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

// ── POST /ai/generate-document ─────────────────────────────────────────────────
// FREE — Generates a formal legal document and saves it as a "preview".
// The full content is stored but gated behind paymentStatus: "preview".
// Users spend 1 credit via POST /ai/generated-documents/:id/unlock to unlock.
// Body: { caseId: string; documentType: "complaint"|"motion"|"timeline"; title?: string }
router.post("/ai/generate-document", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  if (!aiService.isConfigured()) {
    res.status(503).json({ error: "AI not configured", code: "ai_not_configured" });
    return;
  }

  const { caseId, documentType, caseData, title } = req.body as {
    caseId?: string;
    documentType: "complaint" | "motion" | "timeline";
    caseData: Parameters<typeof aiService.generateLegalDocument>[1];
    title?: string;
  };

  if (!documentType || !["complaint", "motion", "timeline"].includes(documentType)) {
    res.status(400).json({ error: "documentType must be complaint, motion, or timeline" });
    return;
  }

  if (!caseData?.title) {
    res.status(400).json({ error: "caseData.title is required" });
    return;
  }

  const userId = auth.userId;

  try {
    // Library context for richer output
    const queryText = `${caseData.title} ${caseData.notes ?? ""} ${(caseData.incidents ?? []).map(i => `${i.title} ${i.description}`).join(" ")}`;
    const libEntries = await searchLibrary({ query: queryText, limit: 3 });
    const libContext = formatLibraryContext(libEntries) || undefined;

    // Ground the draft in the case's already-extracted Case Memory (server-authoritative).
    // The generator reads stored analysis instead of re-deriving facts from raw documents.
    if (caseId) {
      try {
        const [caseRow] = await db
          .select({ caseData: casesTable.caseData })
          .from(casesTable)
          .where(and(eq(casesTable.id, caseId), eq(casesTable.userId, userId)));
        const storedMemory = (caseRow?.caseData as Record<string, unknown> | undefined)?.caseMemory;
        if (storedMemory) caseData.caseMemory = storedMemory as typeof caseData.caseMemory;
      } catch (memErr) {
        console.warn(`[generate-document] WARN: could not load caseMemory — proceeding without`, (memErr as Error).message);
      }
    }

    const aiResult = await aiService.generateLegalDocument(documentType, caseData, { libraryContext: libContext });

    void logAiCall({
      userId,
      caseId: caseId ?? null,
      feature: "generate_document" as AiFeature,
      model: aiResult.meta.model,
      inputTokens: aiResult.meta.inputTokens,
      outputTokens: aiResult.meta.outputTokens,
      estimatedCostMicroUsd: aiResult.meta.estimatedCostMicroUsd,
      responseTimeMs: aiResult.meta.responseTimeMs,
      cacheHit: false,
      promptTemplate: `generate_${documentType}`,
    });

    const docTitle = title || `${documentType.charAt(0).toUpperCase() + documentType.slice(1)} — ${caseData.title}`;

    // Admin accounts always get full access — check before deciding truncation
    const adminInfo = await getClerkUserEmail(userId).catch(() => null);
    const isAdminUser = ADMIN_EMAILS.has(adminInfo?.email ?? "");

    // Save as "preview" — full content stored in DB
    const [savedDoc] = await db.insert(generatedDocumentsTable).values({
      userId,
      caseId: caseId ?? null,
      title: docTitle,
      documentType,
      content: aiResult.data,
      // Admin documents are saved as "paid" immediately — no credit gate
      paymentStatus: isAdminUser ? "paid" : "preview",
    }).returning();

    if (isAdminUser) {
      // Admin: return full content, already marked as paid
      res.json(savedDoc);
      return;
    }

    // Non-admin: truncate before sending to client — full content stays in DB
    const PREVIEW_WORDS = 200;
    const words = (savedDoc.content ?? "").split(/\s+/);
    const clientContent = words.length > PREVIEW_WORDS
      ? words.slice(0, PREVIEW_WORDS).join(" ") + " … [Unlock the full document to continue reading]"
      : savedDoc.content;

    res.json({ ...savedDoc, content: clientContent });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || "Document generation failed" });
  }
});

// ── POST /ai/assembly ──────────────────────────────────────────────────────────
router.post("/ai/assembly", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const { parties, court, story, timeline, caseId } = req.body as {
    parties?: Array<{ name: string; role: string; badge?: string }>;
    court?: { name: string; level: string; state: string } | null;
    story?: string;
    timeline?: Array<{ title: string; description: string }>;
    caseId?: string;
  };

  if (!story || !story.trim()) { res.status(400).json({ error: "story is required" }); return; }
  if (!aiService.isConfigured()) { res.status(503).json({ error: "AI service not configured" }); return; }

  const limitResult = await checkDailyLimit(userId);
  if (!limitResult.allowed) { res.status(429).json({ code: "rate_limited", error: `Daily AI limit reached (${limitResult.count}/${limitResult.limit} calls)` }); return; }

  const cacheKey = computeCacheKey("assembly", { parties, court, story: story.slice(0, 2000), timeline });
  const cached = await getFromCache(userId, cacheKey);
  if (cached) {
    await logAiCall({ userId, feature: "assembly", model: "cache", inputTokens: 0, outputTokens: 0, estimatedCostMicroUsd: 0, responseTimeMs: 0, cacheHit: true, caseId });
    res.json({ ...(cached.result as object), fromCache: true, cachedAt: cached.createdAt.toISOString() });
    return;
  }

  try {
    const result = await aiService.assembleCase({
      parties: parties ?? [],
      court: court ?? null,
      story,
      timeline: timeline ?? [],
    });
    await setCache(userId, cacheKey, "assembly", result.data);
    await logAiCall({ userId, feature: "assembly", model: "claude", inputTokens: result.meta.inputTokens, outputTokens: result.meta.outputTokens, estimatedCostMicroUsd: result.meta.estimatedCostMicroUsd, responseTimeMs: result.meta.responseTimeMs, cacheHit: false, caseId });
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || "Assembly failed" });
  }
});

// ── POST /ai/learning ──────────────────────────────────────────────────────────
router.post("/ai/learning", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const { organizedFacts, potentialClaims, court, caseId } = req.body as {
    organizedFacts?: string;
    potentialClaims?: Array<{ claim: string; supportingFacts: string[] }>;
    court?: { name: string; level: string; state: string } | null;
    caseId?: string;
  };

  if (!organizedFacts || !organizedFacts.trim()) { res.status(400).json({ error: "organizedFacts is required" }); return; }
  if (!aiService.isConfigured()) { res.status(503).json({ error: "AI service not configured" }); return; }

  const limitResult = await checkDailyLimit(userId);
  if (!limitResult.allowed) { res.status(429).json({ code: "rate_limited", error: `Daily AI limit reached (${limitResult.count}/${limitResult.limit} calls)` }); return; }

  const cacheKey = computeCacheKey("learning", { organizedFacts: organizedFacts.slice(0, 1000), potentialClaims, court });
  const cached = await getFromCache(userId, cacheKey);
  if (cached) {
    await logAiCall({ userId, feature: "learning", model: "cache", inputTokens: 0, outputTokens: 0, estimatedCostMicroUsd: 0, responseTimeMs: 0, cacheHit: true, caseId });
    res.json({ ...(cached.result as object), fromCache: true, cachedAt: cached.createdAt.toISOString() });
    return;
  }

  try {
    const result = await aiService.buildLearning({
      organizedFacts,
      potentialClaims: potentialClaims ?? [],
      court: court ?? null,
    });
    await setCache(userId, cacheKey, "learning", result.data);
    await logAiCall({ userId, feature: "learning", model: "claude", inputTokens: result.meta.inputTokens, outputTokens: result.meta.outputTokens, estimatedCostMicroUsd: result.meta.estimatedCostMicroUsd, responseTimeMs: result.meta.responseTimeMs, cacheHit: false, caseId });
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || "Learning index generation failed" });
  }
});

// ── POST /ai/builder-extract — Builder Engine ─────────────────────────────────
router.post("/ai/builder-extract", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const { timestamp, dictation, whyItMatters, exhibitNumber, caseTitle, parties, court, caseId } = req.body as {
    timestamp: string; dictation: string; whyItMatters?: string; exhibitNumber: number;
    caseTitle: string; parties: Array<{ firstName: string; lastName: string; type: string; nickname: string; agency?: string; title?: string }>;
    court: { name: string; level: string; state: string } | null; caseId?: string;
  };

  if (!dictation?.trim() && !caseTitle) { res.status(400).json({ error: "dictation or caseTitle required" }); return; }
  if (!aiService.isConfigured()) { res.status(503).json({ error: "AI service not configured" }); return; }

  const limitResult = await checkDailyLimit(userId);
  if (!limitResult.allowed) { res.status(429).json({ code: "rate_limited", error: `Daily AI limit reached (${limitResult.count}/${limitResult.limit} calls)` }); return; }

  try {
    const result = await aiService.builderExtract({ timestamp, dictation, whyItMatters: whyItMatters ?? "", exhibitNumber, caseTitle, parties: parties ?? [], court: court ?? null });
    await logAiCall({ userId, feature: "builder_extract", model: "claude", inputTokens: result.meta.inputTokens, outputTokens: result.meta.outputTokens, estimatedCostMicroUsd: result.meta.estimatedCostMicroUsd, responseTimeMs: result.meta.responseTimeMs, cacheHit: false, caseId });
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || "Builder extraction failed" });
  }
});

// ── POST /ai/jurisdiction-verify ───────────────────────────────────────────────
router.post("/ai/jurisdiction-verify", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const { state, county, courtName, caseId } = req.body as { state: string; county?: string; courtName: string; caseId?: string };

  if (!state || !courtName) { res.status(400).json({ error: "state and courtName required" }); return; }
  if (!aiService.isConfigured()) { res.status(503).json({ error: "AI service not configured" }); return; }

  const limitResult = await checkDailyLimit(userId);
  if (!limitResult.allowed) { res.status(429).json({ code: "rate_limited", error: `Daily AI limit reached (${limitResult.count}/${limitResult.limit} calls)` }); return; }

  // Cache check — jurisdiction rules don't change; cache for 7 days
  const cacheKey = computeCacheKey("jurisdiction_verify", { state, county: county ?? "", courtName });
  const cached = await getFromCache(userId, cacheKey);
  if (cached) {
    await logAiCall({ userId, feature: "jurisdiction_verify", model: "cache", inputTokens: 0, outputTokens: 0, estimatedCostMicroUsd: 0, responseTimeMs: 0, cacheHit: true, caseId });
    res.json({ ...(cached.result as object), fromCache: true });
    return;
  }

  try {
    const result = await aiService.jurisdictionVerify({ state, county: county ?? "", courtName });
    await setCache(userId, cacheKey, "jurisdiction_verify", result.data);
    await logAiCall({ userId, feature: "jurisdiction_verify", model: "claude", inputTokens: result.meta.inputTokens, outputTokens: result.meta.outputTokens, estimatedCostMicroUsd: result.meta.estimatedCostMicroUsd, responseTimeMs: result.meta.responseTimeMs, cacheHit: false, caseId });
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || "Jurisdiction verification failed" });
  }
});

// ── POST /ai/organize — Organization Engine ────────────────────────────────────
// Produces the full structured case Index. Auto-triggered after assembly.
router.post("/ai/organize", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const { hlCase, extractedDocs, caseId } = req.body as {
    hlCase: {
      title: string;
      parties: Array<{ firstName: string; lastName: string; type: string; nickname: string; agency?: string; title?: string }>;
      court: { name: string; level: string; state: string } | null;
      story: string;
      timeline: Array<{ title: string; description: string }>;
      assembly?: { organizedFacts: string; potentialClaims: Array<{ claim: string; supportingFacts: string[] }> } | null;
      evidence?: Array<{ type: string; label: string; notes: string }>;
    };
    extractedDocs?: Array<{ fileName: string; summary: string; claims: string[]; deadlines: string[] }>;
    caseId?: string;
  };

  if (!hlCase?.title) { res.status(400).json({ error: "hlCase is required" }); return; }
  if (!aiService.isConfigured()) { res.status(503).json({ error: "AI service not configured" }); return; }

  const limitResult = await checkDailyLimit(userId);
  if (!limitResult.allowed) { res.status(429).json({ code: "rate_limited", error: `Daily AI limit reached (${limitResult.count}/${limitResult.limit} calls)` }); return; }

  // Fetch extracted docs from DB if caseId provided and none passed
  let docs = extractedDocs ?? [];
  if (!docs.length && caseId) {
    try {
      const uploaded = await db.select().from(uploadedDocumentsTable).where(
        and(eq(uploadedDocumentsTable.userId, userId), eq(uploadedDocumentsTable.caseId, caseId))
      );
      docs = uploaded
        .filter(d => d.caseExtraction)
        .map(d => {
          const ex = d.caseExtraction as { summary?: string; claims?: string[]; deadlines?: string[] };
          return { fileName: d.fileName, summary: ex.summary ?? "", claims: ex.claims ?? [], deadlines: ex.deadlines ?? [] };
        });
    } catch { /* non-critical */ }
  }

  // Load the case's stored Case Memory so the Index is built from the single
  // authoritative analysis rather than re-deriving everything from scratch.
  let caseMemory: unknown = null;
  if (caseId) {
    try {
      const [caseRow] = await db
        .select({ caseData: casesTable.caseData })
        .from(casesTable)
        .where(and(eq(casesTable.id, caseId), eq(casesTable.userId, userId)));
      caseMemory = (caseRow?.caseData as Record<string, unknown> | undefined)?.caseMemory ?? null;
    } catch { /* non-critical */ }
  }

  try {
    const result = await aiService.organizeCase({ ...hlCase, extractedDocs: docs, caseMemory: (caseMemory ?? undefined) as Parameters<typeof aiService.organizeCase>[0]["caseMemory"] });
    await logAiCall({ userId, feature: "organize_case", model: "claude", inputTokens: result.meta.inputTokens, outputTokens: result.meta.outputTokens, estimatedCostMicroUsd: result.meta.estimatedCostMicroUsd, responseTimeMs: result.meta.responseTimeMs, cacheHit: false, caseId });
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || "Organization engine failed" });
  }
});

// ── POST /ai/gap-detect — Gap Detection Engine ─────────────────────────────────
// Batches ALL follow-up questions in one Claude call.
router.post("/ai/gap-detect", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const { hlCase, caseId } = req.body as {
    hlCase: {
      title: string;
      parties: Array<{ firstName: string; lastName: string; type: string; nickname: string }>;
      court: { name: string; level: string; state: string } | null;
      story: string;
      timeline: Array<{ title: string; description: string }>;
      intakeChecklist: Array<{ key: string; completed: boolean; notes: string }>;
      evidence?: Array<{ type: string; label: string }>;
    };
    caseId?: string;
  };

  if (!hlCase?.title) { res.status(400).json({ error: "hlCase is required" }); return; }
  if (!aiService.isConfigured()) { res.status(503).json({ error: "AI service not configured" }); return; }

  const limitResult = await checkDailyLimit(userId);
  if (!limitResult.allowed) { res.status(429).json({ code: "rate_limited", error: `Daily AI limit reached (${limitResult.count}/${limitResult.limit} calls)` }); return; }

  try {
    const result = await aiService.detectGaps(hlCase);
    await logAiCall({ userId, feature: "gap_detect", model: "claude", inputTokens: result.meta.inputTokens, outputTokens: result.meta.outputTokens, estimatedCostMicroUsd: result.meta.estimatedCostMicroUsd, responseTimeMs: result.meta.responseTimeMs, cacheHit: false, caseId });
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || "Gap detection failed" });
  }
});

export default router;

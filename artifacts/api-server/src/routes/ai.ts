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
import { db, uploadedDocumentsTable, generatedDocumentsTable, errorLogsTable, casesTable, guidanceSessionsTable, caseHistory, litigationTimeline } from "@workspace/db";
import { storage } from "../storage.js";
import {
  chargeOneCredit, refundOneCredit,
  chargeCredits, refundCredits, checkBalanceForEstimate,
  isBillingWaived,
  creditsForWords, countWords, WORDS_PER_CREDIT,
} from "../services/credits.js";
import { estimateForDocument, estimateForGuidance } from "../services/estimate.js";
import { and, eq, sql, desc } from "drizzle-orm";
import { getClerkUserEmail } from "./feedback.js";
import { buildCaseContext } from "../services/caseContext.js";
import { recordCaseEvent } from "../services/memorySummarizer.js";

const ADMIN_EMAILS = new Set(["hyperlawcompliance@gmail.com", "hypermodula@gmail.com"]);

/**
 * Exported for integration testing.
 *
 * Encapsulates the INTENTIONAL ordering inside the Claude failure catch block
 * for POST /ai/analyze-document:
 *
 *   1. Refund the credit (if one was actually deducted)  ← must happen first
 *   2. Call the provided logFn (may throw — must NOT suppress the refund)
 *   3. Re-throw the original Claude error
 *
 * The ordering guarantee is the contract: a crash in logFn must never prevent
 * the credit from landing. Tests import and call this function directly so that
 * any future reordering of steps 1/2 in production code will break the tests.
 */
export async function applyDocumentAnalysisRefund(opts: {
  userId: string;
  creditDeducted: boolean;
  logFn: (err: unknown) => Promise<void>;
  err: unknown;
}): Promise<never> {
  // ── Step 1: Refund — MUST execute before logFn is awaited ─────────────────
  if (opts.creditDeducted) {
    await db.execute(sql`UPDATE users SET credit_balance = credit_balance + 1 WHERE id = ${opts.userId}`);
  }
  // ── Step 2: Log — may throw; refund has already committed ──────────────────
  await opts.logFn(opts.err);
  // ── Step 3: Rethrow — propagates to the outer handler → 500 response ───────
  throw opts.err;
}

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

  const { type, incident, hlCase, incidents, forceRefresh, caseId, billableRebuild } = req.body as {
    type: "incident" | "case";
    incident?: Record<string, string>;
    hlCase?: { title: string; notes: string };
    incidents?: Array<{ title: string; description: string; category: string; dateOfEvent?: string; location?: string }>;
    forceRefresh?: boolean;
    caseId?: string;
    /** True only for the explicit "hold to rebuild" Index button — spends 1 credit.
     *  The plain ↻ refresh icon sends forceRefresh alone and stays free. */
    billableRebuild?: boolean;
  };

  const userId = auth.userId;
  // v2 = factual-gap schema (summary insight type replaced by gap)
  const feature: AiFeature = type === "incident" ? "analyze_incident_v2" : "analyze_case_v2";

  // Content used for cache key
  const cacheContent = type === "incident" ? incident : { hlCase, incidents };
  const cacheKey = computeCacheKey(feature, cacheContent);

  // A forced rebuild of a case's Index (the "hold to rebuild" button) spends
  // 1 credit — everything else (initial load, cache hits, incident analysis)
  // stays free. `billableRebuild` alone is not enough: it must also actually
  // bypass the cache (forceRefresh) or a client could set billableRebuild=true
  // with forceRefresh=false and get charged for a free cache hit.
  const isBillableRebuild = type === "case" && !!billableRebuild && !!forceRefresh;
  let creditCharge: Awaited<ReturnType<typeof chargeOneCredit>> | null = null;

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

    // ── Credit charge — only once we know a real Claude call is about to run ──
    if (isBillableRebuild) {
      creditCharge = await chargeOneCredit(userId);
      if (!creditCharge.ok) {
        res.status(402).json({ error: "Insufficient credits", code: "insufficient_credits", creditBalance: creditCharge.balance });
        return;
      }
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
      if (creditCharge?.charged) {
        await refundOneCredit(userId).catch(() => { /* best-effort */ });
      }
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

    res.json({
      ...aiResult.data,
      fromCache: false,
      ...(creditCharge ? { creditsCharged: creditCharge.charged ? 1 : 0, creditBalance: creditCharge.balance } : {}),
    });
  } catch (err) {
    // Never take a credit for a rebuild that didn't actually happen.
    if (creditCharge?.charged) {
      await refundOneCredit(userId).catch(() => { /* best-effort — logged failure below still surfaces */ });
    }
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
      // Delegate to the exported helper so tests can import and pin the ordering.
      // Ordering guarantee: refund → logFailure → rethrow (see applyDocumentAnalysisRefund).
      if (creditDeducted) {
        console.log(`[analyze-document] credit refunded after Claude failure`);
      }
      await applyDocumentAnalysisRefund({
        userId,
        creditDeducted,
        logFn: (e) => logFailure("claude-call", e),
        err: claudeErr,
      });
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

// ── POST /ai/procedural-info ───────────────────────────────────────────────────
// FREE — Informational, jurisdiction-aware procedural notes for a document type.
// Shown while the user answers upfront drafting questions (no credit charged).
router.post("/ai/procedural-info", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!aiService.isConfigured()) {
    res.status(503).json({ error: "AI not configured", code: "ai_not_configured" });
    return;
  }
  const { documentType, jurisdiction, caseId } = req.body as { documentType?: string; jurisdiction?: string; caseId?: string };
  if (!documentType) { res.status(400).json({ error: "documentType is required" }); return; }
  const userId = getAuth(req)!.userId!;
  try {
    const r = await aiService.proceduralInfo(
      documentType as Parameters<typeof aiService.proceduralInfo>[0],
      jurisdiction ?? "",
    );
    void logAiCall({
      userId,
      caseId: caseId ?? null,
      feature: "procedural_info" as AiFeature,
      model: r.meta.model,
      inputTokens: r.meta.inputTokens,
      outputTokens: r.meta.outputTokens,
      estimatedCostMicroUsd: r.meta.estimatedCostMicroUsd,
      responseTimeMs: r.meta.responseTimeMs,
      cacheHit: false,
      promptTemplate: "procedural_info",
    });
    res.json(r.data);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || "Failed to load procedural info" });
  }
});

// ── POST /ai/ifp-find-form ─────────────────────────────────────────────────────
// 1 CREDIT — Web-searches for the official IFP / fee-waiver form for a
// jurisdiction. found=false signals the client to fall back to the generic
// Appendix A template.
router.post("/ai/ifp-find-form", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!aiService.isConfigured()) {
    res.status(503).json({ error: "AI not configured", code: "ai_not_configured" });
    return;
  }
  const { jurisdiction, caseData, caseId } = req.body as {
    jurisdiction?: string;
    caseData?: { court?: string; caseNumber?: string; plaintiff?: string; state?: string; county?: string };
    caseId?: string;
  };
  const userId = getAuth(req)!.userId!;

  const charge = await chargeOneCredit(userId);
  if (!charge.ok) {
    res.status(402).json({ error: "Insufficient credits", code: "insufficient_credits", creditBalance: charge.balance });
    return;
  }
  try {
    const r = await aiService.ifpFindForm(jurisdiction ?? "", caseData ?? {});
    void logAiCall({
      userId, caseId: caseId ?? null, feature: "ifp_find_form" as AiFeature,
      model: r.meta.model, inputTokens: r.meta.inputTokens, outputTokens: r.meta.outputTokens,
      estimatedCostMicroUsd: r.meta.estimatedCostMicroUsd, responseTimeMs: r.meta.responseTimeMs,
      cacheHit: false, promptTemplate: "ifp_find_form",
    });
    res.json(r.data);
  } catch (err) {
    if (charge.charged) await refundOneCredit(userId);
    res.status(500).json({ error: (err as Error).message || "IFP form search failed" });
  }
});

// ── POST /ai/defense-analyze ───────────────────────────────────────────────────
// 1 CREDIT — Extracts the opposing party's identity + the substance of what they
// filed, from uploaded document(s) and/or photo(s), to draft a responsive motion.
router.post(
  "/ai/defense-analyze",
  requireAuth,
  upload.array("files", 10),
  handleMulterError,
  async (req: Request, res: Response): Promise<void> => {
    if (!aiService.isConfigured()) {
      res.status(503).json({ error: "AI not configured", code: "ai_not_configured" });
      return;
    }
    const userId = getAuth(req)!.userId!;
    const multerReq = req as Request & { files?: Array<{ buffer: Buffer; mimetype: string; originalname: string }> };
    const files = multerReq.files ?? [];
    const caseId = typeof req.body.caseId === "string" ? req.body.caseId : null;
    const caseTitle = typeof req.body.caseTitle === "string" ? req.body.caseTitle : undefined;
    let sourceText = typeof req.body.sourceText === "string" ? req.body.sourceText : "";

    const images: Array<{ mimeType: string; base64: string }> = [];
    for (const f of files) {
      if (f.mimetype.startsWith("image/")) {
        images.push({ mimeType: f.mimetype, base64: f.buffer.toString("base64") });
      } else {
        try {
          const parsed = await parseDocument(f.buffer, f.mimetype, f.originalname);
          sourceText += `\n\n[${f.originalname}]\n${parsed.text}`;
        } catch { /* skip unparseable file */ }
      }
    }
    const imgs = images.slice(0, 5); // bound vision cost

    if (!imgs.length && !sourceText.trim()) {
      res.status(400).json({ error: "Provide a document, photo, or text of the defense filing." });
      return;
    }

    const charge = await chargeOneCredit(userId);
    if (!charge.ok) {
      res.status(402).json({ error: "Insufficient credits", code: "insufficient_credits", creditBalance: charge.balance });
      return;
    }
    try {
      const r = await aiService.defenseAnalyze({ sourceText: sourceText.trim() || undefined, images: imgs, caseTitle });
      void logAiCall({
        userId, caseId, feature: "defense_analyze" as AiFeature,
        model: r.meta.model, inputTokens: r.meta.inputTokens, outputTokens: r.meta.outputTokens,
        estimatedCostMicroUsd: r.meta.estimatedCostMicroUsd, responseTimeMs: r.meta.responseTimeMs,
        cacheHit: false, promptTemplate: "defense_analyze",
      });
      res.json(r.data);
    } catch (err) {
      if (charge.charged) await refundOneCredit(userId);
      void db.insert(errorLogsTable).values({
        userId, context: "defense_analyze",
        message: (err as Error).message || "Defense analysis failed", metadata: null,
      }).catch(() => {});
      res.status(500).json({ error: (err as Error).message || "Defense analysis failed" });
    }
  },
);

// ── POST /ai/generate-document ─────────────────────────────────────────────────
// USAGE-BASED — Generates a formal legal document and charges by output length,
// capped at the estimate shown to the user first (see /ai/estimate). The full
// content is saved and always returned; there is no preview/unlock gate.
// Body: { caseId: string; documentType: "complaint"|"motion"|"timeline"; title?: string }
router.post("/ai/generate-document", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  if (!aiService.isConfigured()) {
    res.status(503).json({ error: "AI not configured", code: "ai_not_configured" });
    return;
  }

  const { caseId, documentType, caseData, title, draftContext, sourceDocument } = req.body as {
    caseId?: string;
    documentType: string;
    caseData: Parameters<typeof aiService.generateLegalDocument>[1];
    title?: string;
    draftContext?: string | Record<string, unknown>;
    sourceDocument?: { title?: string; content: string };
  };

  const ALLOWED_DOC_TYPES = [
    "complaint", "motion", "timeline", "discovery", "judgment_summary", "strengthen",
    "motion_summary_judgment", "motion_compel_discovery", "motion_dismiss", "answer",
    "opposition", "declaration", "demand_letter", "defense_response", "fee_waiver",
  ];
  const NEEDS_SOURCE = new Set(["strengthen", "answer", "opposition", "defense_response"]);
  if (!documentType || !ALLOWED_DOC_TYPES.includes(documentType)) {
    res.status(400).json({ error: "Unsupported documentType" });
    return;
  }
  if (NEEDS_SOURCE.has(documentType) && !sourceDocument?.content) {
    res.status(400).json({ error: "This document type requires a source document to work from." });
    return;
  }

  if (!caseData?.title) {
    res.status(400).json({ error: "caseData.title is required" });
    return;
  }

  const userId = auth.userId;

  try {
    // Usage-based billing: the estimate is also the hard spend cap. Verify the
    // user can cover it before doing any billable work.
    const estimate = estimateForDocument(documentType);
    const balanceCheck = await checkBalanceForEstimate(userId, estimate.estimatedCredits);
    if (!balanceCheck.ok) {
      res.status(402).json({
        error: "Insufficient credits",
        code: "insufficient_credits",
        creditBalance: balanceCheck.balance,
        estimatedCredits: estimate.estimatedCredits,
      });
      return;
    }

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

    const aiResult = await aiService.generateLegalDocument(
      documentType as Parameters<typeof aiService.generateLegalDocument>[0],
      caseData,
      { libraryContext: libContext, draftContext, sourceDocument },
    );

    const docTitle = title || `${documentType.charAt(0).toUpperCase() + documentType.slice(1)} — ${caseData.title}`;

    // Usage-based charge: credits from ACTUAL output words, capped at the estimate
    // shown to the user (we never charge above the estimate). Admin/Apex waived.
    const outputWords = countWords(aiResult.data);
    const usageCredits = Math.min(creditsForWords(outputWords), estimate.estimatedCredits);
    const charge = await chargeCredits(userId, usageCredits);

    // Persist as fully paid — the usage-based model has no preview/unlock gate.
    const inserted = await db.insert(generatedDocumentsTable).values({
      userId,
      caseId: caseId ?? null,
      title: docTitle,
      documentType,
      content: aiResult.data,
      paymentStatus: "paid",
    }).returning().catch(async (saveErr) => {
      // Save failed after charging — refund so we never take credits for nothing.
      if (charge.charged) await refundCredits(userId, charge.chargedAmount ?? 0);
      throw saveErr;
    });
    const savedDoc = inserted[0];

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
      creditsCharged: charge.chargedAmount ?? 0,
    });

    if (caseId) {
      void recordCaseEvent({
        caseId,
        itemType: "document_generated",
        title: savedDoc.title,
        contentRef: savedDoc.id,
        shortSummary: `Generated ${documentType} (${countWords(aiResult.data)} words)`,
      });
    }

    res.json({ ...savedDoc, creditsCharged: charge.chargedAmount ?? 0, creditBalance: charge.balance });
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

// ── POST /ai/organize-video-chunks — Video Organization Assistant ──────────────
// Suggests a presentation order for a Studio project's labeled video chunks.
router.post("/ai/organize-video-chunks", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const { chunks, caseTitle, parties, story, claims, caseId } = req.body as {
    chunks: Array<{ id: string; start: number; end: number; label: string; tag?: string }>;
    caseTitle?: string;
    parties?: Array<{ firstName: string; lastName: string; type: string }>;
    story?: string;
    claims?: string[];
    caseId?: string;
  };

  if (!Array.isArray(chunks) || chunks.length === 0) { res.status(400).json({ error: "chunks is required" }); return; }
  if (!aiService.isConfigured()) { res.status(503).json({ error: "AI service not configured" }); return; }

  const limitResult = await checkDailyLimit(userId);
  if (!limitResult.allowed) { res.status(429).json({ code: "rate_limited", error: `Daily AI limit reached (${limitResult.count}/${limitResult.limit} calls)` }); return; }

  try {
    const result = await aiService.organizeVideoChunks({ chunks, caseTitle, parties, story, claims });
    await logAiCall({ userId, feature: "organize_video_chunks", model: "claude", inputTokens: result.meta.inputTokens, outputTokens: result.meta.outputTokens, estimatedCostMicroUsd: result.meta.estimatedCostMicroUsd, responseTimeMs: result.meta.responseTimeMs, cacheHit: false, caseId });
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || "Video organization failed" });
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

// ── Guidance Sessions & usage-based helpers ─────────────────────────────────

// Build a compact, human-readable case context string from stored case data —
// used by the decision layer and guidance sessions to ground their reasoning.
async function loadCaseContext(userId: string, caseId?: string): Promise<{ caseTitle: string; caseContext: string }> {
  if (!caseId) return { caseTitle: "Untitled Case", caseContext: "" };
  try {
    const [row] = await db
      .select({ title: casesTable.title, caseData: casesTable.caseData })
      .from(casesTable)
      .where(and(eq(casesTable.id, caseId), eq(casesTable.userId, userId)));
    if (!row) return { caseTitle: "Untitled Case", caseContext: "" };

    const data = (row.caseData ?? {}) as Record<string, unknown>;
    const parts: string[] = [];

    const memory = data.caseMemory as Record<string, unknown> | undefined;
    if (memory) parts.push(`CASE MEMORY:\n${JSON.stringify(memory).slice(0, 5000)}`);
    if (typeof data.story === "string" && data.story.trim()) parts.push(`NARRATIVE:\n${data.story.slice(0, 3000)}`);

    if (Array.isArray(data.parties) && data.parties.length) {
      const list = (data.parties as Array<{ firstName?: string; lastName?: string; type?: string; name?: string }>)
        .map(p => {
          const full = [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || p.name || "";
          return full ? `${full}${p.type ? ` (${p.type})` : ""}` : "";
        })
        .filter(Boolean).join("; ");
      if (list) parts.push(`PARTIES: ${list}`);
    }
    if (Array.isArray(data.timeline) && data.timeline.length) {
      const tl = (data.timeline as Array<{ title?: string }>).map(t => t.title).filter(Boolean).join("; ");
      if (tl) parts.push(`TIMELINE: ${tl}`);
    }
    if (Array.isArray(data.incidents) && data.incidents.length) {
      const inc = (data.incidents as Array<{ title?: string }>).map(i => i.title).filter(Boolean).join("; ");
      if (inc) parts.push(`INCIDENTS: ${inc}`);
    }
    const court = data.court as { name?: string; state?: string } | undefined;
    if (court?.name) parts.push(`COURT: ${court.name}${court.state ? `, ${court.state}` : ""}`);
    if (typeof data.jurisdiction === "string" && data.jurisdiction) parts.push(`JURISDICTION: ${data.jurisdiction}`);

    if (Array.isArray(data.guidanceSessions) && data.guidanceSessions.length) {
      const summaries = (data.guidanceSessions as Array<{ summary?: string }>).map(g => g.summary).filter(Boolean);
      if (summaries.length) parts.push(`PRIOR GUIDANCE FINDINGS:\n${summaries.join("\n")}`);
    }

    const baseContext = parts.join("\n\n");
    const memoryBlock = await buildCaseContext(caseId);
    const caseContext = memoryBlock ? `CASE CONTEXT:\n${memoryBlock}\n\n${baseContext}` : baseContext;
    return { caseTitle: (row.title as string) || "Untitled Case", caseContext };
  } catch {
    return { caseTitle: "Untitled Case", caseContext: "" };
  }
}

// Merge a completed guidance session's extracted answers into the case's stored
// memory. Enrichment is additive: append new array items (deduped) and fill only
// empty scalar fields — never clobber facts the user already has.
async function mergeGuidanceIntoCase(userId: string, caseId: string, sessionId: string, extracted: Record<string, unknown>): Promise<void> {
  const [row] = await db.select({ caseData: casesTable.caseData })
    .from(casesTable)
    .where(and(eq(casesTable.id, caseId), eq(casesTable.userId, userId)));
  if (!row) return;

  const data = (row.caseData ?? {}) as Record<string, unknown>;
  const memory = ((data.caseMemory as Record<string, unknown>) ?? {}) as Record<string, unknown>;

  const appendUnique = (existing: unknown, incoming: unknown, keyFn: (x: any) => string): unknown[] => {
    const base = Array.isArray(existing) ? [...existing] : [];
    const seen = new Set(base.map(keyFn).map(s => (s ?? "").toLowerCase()).filter(Boolean));
    for (const item of (Array.isArray(incoming) ? incoming : [])) {
      const k = (keyFn(item) ?? "").toLowerCase();
      if (k && !seen.has(k)) { base.push(item); seen.add(k); }
    }
    return base;
  };

  memory.parties = appendUnique(memory.parties, extracted.parties, (p) => p?.name ?? "");
  memory.events = appendUnique(memory.events, extracted.events, (e) => `${e?.description ?? ""}${e?.date ?? ""}`);
  memory.evidence = appendUnique(memory.evidence, extracted.evidence, (e) => e?.description ?? "");
  memory.witnesses = appendUnique(memory.witnesses, extracted.witnesses, (w) => w?.name ?? "");
  memory.claims = appendUnique(memory.claims, extracted.claims, (c) => (typeof c === "string" ? c : ""));
  memory.locations = appendUnique(memory.locations, extracted.locations, (l) => (typeof l === "string" ? l : ""));
  memory.openQuestions = appendUnique(memory.openQuestions, extracted.openQuestions, (q) => (typeof q === "string" ? q : ""));

  // Durable guidance findings block (summary + new facts) for future drafting.
  const findings = Array.isArray(memory.guidanceFindings) ? memory.guidanceFindings as unknown[] : [];
  const newFacts = Array.isArray(extracted.newFacts) ? extracted.newFacts : [];
  if (extracted.summary || newFacts.length) {
    findings.push({ sessionId, summary: extracted.summary ?? "", facts: newFacts, at: new Date().toISOString() });
    memory.guidanceFindings = findings;
  }
  if (!memory.caseSummary && typeof extracted.summary === "string") memory.caseSummary = extracted.summary;

  data.caseMemory = memory;

  const sessions = Array.isArray(data.guidanceSessions) ? data.guidanceSessions as unknown[] : [];
  sessions.push({ sessionId, summary: extracted.summary ?? "", completedAt: new Date().toISOString() });
  data.guidanceSessions = sessions;

  await db.update(casesTable)
    .set({ caseData: data, updatedAt: new Date() })
    .where(and(eq(casesTable.id, caseId), eq(casesTable.userId, userId)));
}

// ── POST /ai/estimate ───────────────────────────────────────────────────────
// Up-front credit estimate for a billable action (also the enforced spend cap).
router.post("/ai/estimate", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const { kind, documentType } = req.body as { kind?: "document" | "guidance"; documentType?: string };

  const estimate = kind === "guidance" ? estimateForGuidance() : estimateForDocument(documentType ?? "motion");
  const check = await checkBalanceForEstimate(userId, estimate.estimatedCredits);
  res.json({ ...estimate, waived: check.waived, creditBalance: check.balance, sufficient: check.ok });
});

// ── POST /ai/draft-decision ─────────────────────────────────────────────────
// AI Decision Layer: ready-to-draft / guidance-recommended / guidance-required.
router.post("/ai/draft-decision", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  if (!aiService.isConfigured()) { res.status(503).json({ error: "AI not configured", code: "ai_not_configured" }); return; }

  const { caseId, documentType, documentLabel } = req.body as { caseId?: string; documentType?: string; documentLabel?: string };
  if (!documentType) { res.status(400).json({ error: "documentType is required" }); return; }

  try {
    const { caseTitle, caseContext } = await loadCaseContext(userId, caseId);
    const result = await aiService.draftReadiness({
      documentType,
      documentLabel: documentLabel || documentType,
      caseTitle,
      caseContext,
    });

    void logAiCall({
      userId, caseId: caseId ?? null, feature: "draft_decision" as AiFeature,
      model: result.meta.model, inputTokens: result.meta.inputTokens, outputTokens: result.meta.outputTokens,
      estimatedCostMicroUsd: result.meta.estimatedCostMicroUsd, responseTimeMs: result.meta.responseTimeMs,
      cacheHit: false, promptTemplate: "draft_decision", creditsCharged: 0,
    });

    res.json({ ...result.data, estimate: estimateForDocument(documentType) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || "Decision failed" });
  }
});

// ── POST /ai/guidance/start ─────────────────────────────────────────────────
// Open a Guidance Session: create the row and generate a warm opening message.
router.post("/ai/guidance/start", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  if (!aiService.isConfigured()) { res.status(503).json({ error: "AI not configured", code: "ai_not_configured" }); return; }

  const { caseId, action, documentLabel, topics } = req.body as {
    caseId?: string; action?: string; documentLabel?: string; topics?: string[];
  };

  // Capture billing-waived status at session-start (admin or active Apex sub).
  // This value is stored on the session row and is authoritative for the entire
  // session lifetime — /complete will honour it rather than re-querying Stripe,
  // so an Apex lapse (or gain) mid-session never accidentally charges / waives.
  const billingWaived = await isBillingWaived(userId);

  // Verify the user can cover the guidance estimate (the spend cap) before starting.
  // Waived users always pass; non-waived users must have enough credits.
  const estimate = estimateForGuidance();
  const balanceCheck = billingWaived
    ? { ok: true, waived: true, balance: -1 }
    : await checkBalanceForEstimate(userId, estimate.estimatedCredits);
  if (!balanceCheck.ok) {
    res.status(402).json({ error: "Insufficient credits", code: "insufficient_credits", creditBalance: balanceCheck.balance, estimatedCredits: estimate.estimatedCredits });
    return;
  }

  try {
    const { caseTitle, caseContext } = await loadCaseContext(userId, caseId);
    const sessionTopics = Array.isArray(topics) ? topics.filter(t => typeof t === "string" && t.trim()).slice(0, 8) : [];

    const opening = await aiService.guidanceChat({ caseTitle, caseContext, topics: sessionTopics, documentLabel, history: [] });
    const greeting = opening.data.reply;

    const [session] = await db.insert(guidanceSessionsTable).values({
      userId,
      caseId: caseId ?? null,
      action: action || "general",
      status: "active",
      topics: sessionTopics,
      messages: [{ role: "assistant", content: greeting }],
      wordCount: countWords(greeting),
      creditCap: estimate.estimatedCredits,
      billingWaived,
    }).returning();

    void logAiCall({
      userId, caseId: caseId ?? null, sessionId: session.id, feature: "guidance_session" as AiFeature,
      model: opening.meta.model, inputTokens: opening.meta.inputTokens, outputTokens: opening.meta.outputTokens,
      estimatedCostMicroUsd: opening.meta.estimatedCostMicroUsd, responseTimeMs: opening.meta.responseTimeMs,
      cacheHit: false, promptTemplate: "guidance_start", creditsCharged: 0,
    });

    res.json({
      sessionId: session.id,
      greeting,
      topics: sessionTopics,
      estimate,
      creditBalance: balanceCheck.balance,
      wordCount: session.wordCount,
      creditCap: session.creditCap,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || "Could not start guidance session" });
  }
});

// ── POST /ai/guidance/:id/message ───────────────────────────────────────────
// Continue a session. Enforces the spend cap: when the conversation nears the
// cap we stop and ask the user to approve more before continuing.
router.post("/ai/guidance/:id/message", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  if (!aiService.isConfigured()) { res.status(503).json({ error: "AI not configured", code: "ai_not_configured" }); return; }

  const sessionId = String(req.params.id);
  const { message, extendCap } = req.body as { message?: string; extendCap?: boolean };
  if (!message?.trim()) { res.status(400).json({ error: "message is required" }); return; }

  try {
    const [session] = await db.select().from(guidanceSessionsTable)
      .where(and(eq(guidanceSessionsTable.id, sessionId), eq(guidanceSessionsTable.userId, userId)));
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    if (session.status !== "active") { res.status(409).json({ error: "This guidance session has already ended.", code: "session_closed" }); return; }

    let creditCap = session.creditCap;
    if (extendCap) {
      const newCap = creditCap + estimateForGuidance().estimatedCredits;
      // billingWaived is captured at session-start and is authoritative for the
      // lifetime of this session — never re-query Stripe here. Otherwise an
      // Apex sub lapsing mid-session would fail this live check and incorrectly
      // block/charge the extension.
      if (!session.billingWaived) {
        const check = await checkBalanceForEstimate(userId, newCap);
        if (!check.ok) { res.status(402).json({ error: "Insufficient credits to extend", code: "insufficient_credits", creditBalance: check.balance }); return; }
      }
      creditCap = newCap;
      await db.update(guidanceSessionsTable).set({ creditCap, updatedAt: new Date() }).where(eq(guidanceSessionsTable.id, sessionId));
    }

    const history = (session.messages ?? []) as Array<{ role: "user" | "assistant"; content: string }>;

    // Pause at the cap and ask to approve more (unless the user just approved).
    const projectedWords = session.wordCount + countWords(message);
    if (!extendCap && projectedWords >= creditCap * WORDS_PER_CREDIT) {
      res.json({
        capReached: true,
        reply: null,
        done: false,
        wordCount: session.wordCount,
        creditCap,
        estimatedCredits: Math.min(creditsForWords(session.wordCount), creditCap),
      });
      return;
    }

    const { caseTitle, caseContext } = await loadCaseContext(userId, session.caseId ?? undefined);
    const turn = await aiService.guidanceChat({
      caseTitle, caseContext,
      topics: (session.topics ?? []) as string[],
      documentLabel: session.action !== "general" ? session.action : undefined,
      history,
      userMessage: message,
    });

    const reply = turn.data.reply;
    const newMessages = [...history, { role: "user" as const, content: message }, { role: "assistant" as const, content: reply }];
    const newWordCount = session.wordCount + countWords(message) + countWords(reply);

    await db.update(guidanceSessionsTable).set({ messages: newMessages, wordCount: newWordCount, updatedAt: new Date() }).where(eq(guidanceSessionsTable.id, sessionId));

    void logAiCall({
      userId, caseId: session.caseId, sessionId, feature: "guidance_session" as AiFeature,
      model: turn.meta.model, inputTokens: turn.meta.inputTokens, outputTokens: turn.meta.outputTokens,
      estimatedCostMicroUsd: turn.meta.estimatedCostMicroUsd, responseTimeMs: turn.meta.responseTimeMs,
      cacheHit: false, promptTemplate: "guidance_message", creditsCharged: 0,
    });

    res.json({
      reply,
      done: turn.data.done,
      wordCount: newWordCount,
      creditCap,
      estimatedCredits: Math.min(creditsForWords(newWordCount), creditCap),
      capReached: false,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || "Guidance message failed" });
  }
});

// ── POST /ai/guidance/:id/complete ──────────────────────────────────────────
// Finalize a session: extract structured answers, merge into case memory, charge
// by conversation length (capped), and log usage with the session id.
router.post("/ai/guidance/:id/complete", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const sessionId = String(req.params.id);

  try {
    const [session] = await db.select().from(guidanceSessionsTable)
      .where(and(eq(guidanceSessionsTable.id, sessionId), eq(guidanceSessionsTable.userId, userId)));
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    if (session.status === "completed" || session.status === "abandoned") {
      res.json({ ok: true, alreadyCompleted: true, creditsCharged: session.creditsCharged, summary: (session.extractedAnswers as { summary?: string } | null)?.summary ?? "" });
      return;
    }

    const history = (session.messages ?? []) as Array<{ role: "user" | "assistant"; content: string }>;
    const hasUserContent = history.some(m => m.role === "user");
    const transcript = history.map(m => `${m.role === "user" ? "User" : "Guide"}: ${m.content}`).join("\n\n");

    // Extract structured answers (best-effort — a failure still lets us charge & close).
    let extracted: Record<string, unknown> | null = null;
    let extractMeta: { model: string; inputTokens: number; outputTokens: number; estimatedCostMicroUsd: number; responseTimeMs: number } | null = null;
    if (aiService.isConfigured() && hasUserContent) {
      try {
        const { caseTitle } = await loadCaseContext(userId, session.caseId ?? undefined);
        const ex = await aiService.extractGuidanceAnswers({ caseTitle, topics: (session.topics ?? []) as string[], transcript });
        extracted = ex.data as unknown as Record<string, unknown>;
        extractMeta = ex.meta;
      } catch (exErr) {
        console.warn(`[guidance/complete] extraction failed session=${sessionId}:`, (exErr as Error).message);
      }
    }

    // Charge by conversation length, capped. Sessions with no user input are free.
    // billingWaived is captured at session-start and is authoritative — we never
    // re-query Stripe so an Apex lapse (or gain) mid-session has no effect.
    const usageCredits = (hasUserContent && !session.billingWaived)
      ? Math.min(creditsForWords(session.wordCount), session.creditCap)
      : 0;

    // Atomically claim completion: only the request that transitions the session out
    // of "active" is allowed to charge. This makes /complete idempotent under retries
    // and concurrent calls — a losing request never double-charges the same session.
    const [claimed] = await db.update(guidanceSessionsTable).set({
      status: hasUserContent ? "completed" : "abandoned",
      extractedAnswers: extracted ?? undefined,
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(
      eq(guidanceSessionsTable.id, sessionId),
      eq(guidanceSessionsTable.status, "active"),
    )).returning();

    if (!claimed) {
      // Another request already finalized this session — return its result, never re-charge.
      const [fresh] = await db.select().from(guidanceSessionsTable).where(eq(guidanceSessionsTable.id, sessionId));
      res.json({
        ok: true,
        alreadyCompleted: true,
        creditsCharged: fresh?.creditsCharged ?? 0,
        summary: (fresh?.extractedAnswers as { summary?: string } | null)?.summary ?? "",
      });
      return;
    }

    // We own the completion — safe to charge exactly once, then record the actual amount.
    // chargeCredits is only called for non-waived sessions; waived sessions (admin / Apex
    // at start-time) always produce creditsCharged=0 without touching the wallet.
    const charge = session.billingWaived
      ? { chargedAmount: 0, balance: -1 }
      : await chargeCredits(userId, usageCredits);
    const creditsCharged = charge.chargedAmount ?? 0;
    if (creditsCharged > 0) {
      await db.update(guidanceSessionsTable).set({ creditsCharged, updatedAt: new Date() })
        .where(eq(guidanceSessionsTable.id, sessionId));
    }

    if (extracted && session.caseId) {
      try { await mergeGuidanceIntoCase(userId, session.caseId, sessionId, extracted); }
      catch (mErr) { console.warn(`[guidance/complete] case merge failed session=${sessionId}:`, (mErr as Error).message); }
    }

    if (session.caseId) {
      void recordCaseEvent({
        caseId: session.caseId,
        itemType: "guidance_session",
        title: session.action ?? "Guidance Session",
        contentRef: sessionId,
        shortSummary: (extracted as { summary?: string } | null)?.summary
          ?? `${session.wordCount ?? 0} words exchanged`,
      });
    }

    // Always log the completion so the charge appears in Credit History, even when
    // the extraction step failed or was skipped (extractMeta may be null in those cases).
    void logAiCall({
      userId, caseId: session.caseId, sessionId, feature: "guidance_session" as AiFeature,
      model: extractMeta?.model ?? MODEL,
      inputTokens: extractMeta?.inputTokens ?? 0,
      outputTokens: extractMeta?.outputTokens ?? 0,
      estimatedCostMicroUsd: extractMeta?.estimatedCostMicroUsd ?? 0,
      responseTimeMs: extractMeta?.responseTimeMs ?? 0,
      cacheHit: false, promptTemplate: "guidance_complete", creditsCharged,
    });

    res.json({
      ok: true,
      creditsCharged,
      creditBalance: charge.balance,
      summary: (extracted as { summary?: string } | null)?.summary ?? "",
      extractedAnswers: extracted,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || "Could not complete guidance session" });
  }
});

// ── GET /ai/cases/:caseId/history ─────────────────────────────────────────────
// Returns up to 5 most recent items merged from case_history + litigation_timeline.
// Powers the compact history strip on the case screen.
router.get("/ai/cases/:caseId/history", async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const caseId = String(req.params.caseId);
  try {
    // Ownership check — 404 if this case doesn't belong to the requesting user.
    const [ownedCase] = await db
      .select({ id: casesTable.id })
      .from(casesTable)
      .where(and(eq(casesTable.id, caseId), eq(casesTable.userId, userId)));
    if (!ownedCase) { res.status(404).json({ error: "Case not found" }); return; }

    const [historyRows, timelineRows] = await Promise.all([
      db.select().from(caseHistory)
        .where(eq(caseHistory.caseId, caseId))
        .orderBy(desc(caseHistory.createdAt))
        .limit(5),
      db.select().from(litigationTimeline)
        .where(eq(litigationTimeline.caseId, caseId))
        .orderBy(desc(litigationTimeline.createdAt))
        .limit(5),
    ]);
    const combined = [
      ...historyRows.map(r => ({ source: "history" as const, id: r.id, date: r.createdAt, label: r.title, summary: r.shortSummary, type: r.itemType })),
      ...timelineRows.map(r => ({ source: "timeline" as const, id: r.id, date: r.eventDate, label: r.description, summary: r.status, type: r.eventType })),
    ].sort((a, b) => new Date(String(b.date)).getTime() - new Date(String(a.date)).getTime()).slice(0, 5);
    res.json(combined);
  } catch {
    res.status(500).json({ error: "Failed to fetch case history" });
  }
});

export default router;

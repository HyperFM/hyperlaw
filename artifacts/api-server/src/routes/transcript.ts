import { randomUUID } from "node:crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { getAuth } from "../services/auth.js";
import { aiService, MODEL } from "../services/ai.js";
import { logAiCall } from "../services/aiCache.js";
import { db, casesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { buildPartiesAndCourtBlocks, buildStructuredCaseBlock } from "./exhibit.js";

const router = Router();

// Auth guard — MUST run before multer to block unauthenticated large uploads,
// same reasoning as routes/ai.ts's /ai/upload.
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
}

// OpenAI's transcription endpoint caps requests at 25MB — the client chunks
// audio into pieces comfortably under that (see VideoWorkspaceView's
// extraction logic) before ever reaching this route. 26MB here just guards
// against a chunk that slipped slightly over, not a real ceiling of its own.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 26 * 1024 * 1024 },
});

function handleMulterError(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (err && (err as NodeJS.ErrnoException).code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "Audio chunk too large — this shouldn't happen from the app's own chunking." });
    return;
  }
  next(err);
}

interface OpenAiSegment {
  start: number;
  end: number;
  text: string;
}

// ── POST /transcript/audio-chunk ────────────────────────────────────────────
// Transcribes ONE chunk of audio (the client splits a long recording into
// pieces under OpenAI's 25MB request limit — this route has no idea the
// audio is part of something longer). startOffsetSec shifts the returned
// segment timestamps so they land correctly on the full recording's
// timeline once the client stitches every chunk's segments back together.
router.post(
  "/transcript/audio-chunk",
  requireAuth,
  upload.single("audio"),
  handleMulterError,
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const multerReq = req as Request & { file?: { buffer: Buffer; mimetype: string; originalname: string } };
    if (!multerReq.file) { res.status(400).json({ error: "No audio file provided" }); return; }

    const startOffsetSec = Number(req.body?.startOffsetSec ?? 0);
    if (!Number.isFinite(startOffsetSec) || startOffsetSec < 0) {
      res.status(400).json({ error: "Invalid startOffsetSec" });
      return;
    }

    if (!process.env.OPENAI_API_KEY) {
      res.status(503).json({ error: "Transcription isn't configured yet — OPENAI_API_KEY is missing." });
      return;
    }

    const { buffer, mimetype, originalname } = multerReq.file;

    try {
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(buffer)], { type: mimetype || "audio/webm" }), originalname || "chunk.webm");
      form.append("model", "whisper-1");
      form.append("response_format", "verbose_json");

      const openAiRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: form,
      });

      if (!openAiRes.ok) {
        const errText = await openAiRes.text().catch(() => "");
        console.error(`[transcript-audio-chunk] OpenAI error ${openAiRes.status}: ${errText}`);
        res.status(openAiRes.status < 500 ? 502 : 502).json({ error: "Transcription service failed on this chunk." });
        return;
      }

      const data = (await openAiRes.json()) as { text?: string; segments?: OpenAiSegment[] };
      const segments = (data.segments ?? []).map(s => ({
        start: s.start + startOffsetSec,
        end: s.end + startOffsetSec,
        text: s.text.trim(),
      }));

      res.json({ segments, fullText: (data.text ?? "").trim() });
    } catch (err) {
      console.error("[transcript-audio-chunk] failed", err);
      res.status(502).json({ error: "Couldn't reach the transcription service — try again." });
    }
  },
);

// ── POST /transcript/match-moments ──────────────────────────────────────────
// Cross-references an already-produced transcript against a witness
// examination's structured Q&A record — the whole point of building the
// Witness Examination tool first, per the live-capture pipeline spec: this
// is a narrower "find where this KNOWN claim appears in the timed
// transcript" problem, not blind diarization from a cold transcript.
router.post("/transcript/match-moments", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { witnessExaminationId, witnessName, questions, segments } = req.body as {
    witnessExaminationId: string;
    witnessName: string;
    questions: Array<{ id: string; question: string; yesNo?: "yes" | "no"; answerText?: string }>;
    segments: Array<{ start: number; end: number; text: string }>;
  };

  if (!witnessExaminationId || !Array.isArray(questions) || questions.length === 0) {
    res.status(400).json({ error: "No questions to match against" });
    return;
  }
  if (!Array.isArray(segments) || segments.length === 0) {
    res.status(400).json({ error: "No transcript to search" });
    return;
  }

  const answeredQuestions = questions.filter(q => q.yesNo || q.answerText?.trim());
  if (answeredQuestions.length === 0) {
    res.json({ suggestedMoments: [] });
    return;
  }

  const transcriptBlock = segments
    .map(s => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`)
    .join("\n");

  const questionsBlock = answeredQuestions
    .map((q, i) => `${i + 1}. (id: ${q.id}) Q: "${q.question}"${q.yesNo ? ` — Answer: ${q.yesNo.toUpperCase()}` : ""}${q.answerText ? ` — "${q.answerText}"` : ""}`)
    .join("\n");

  const systemPrompt = `You match already-known witness testimony (a question, and what the witness answered) to where that same exchange appears in a timestamped transcript of the actual footage. You are NOT identifying new facts — every question and answer you're given already happened; you're finding its timestamp in the recording.

For each question below that you can confidently locate in the transcript, return the start and end timestamp (in seconds) of that exchange, and a short one-sentence reason citing what in the transcript matched. If you can't confidently locate a question in the transcript, omit it entirely — never guess a timestamp range.

Respond with ONLY raw JSON, no markdown fences, no commentary, in this exact shape:
{"matches": [{"questionId": "<id>", "start": <number>, "end": <number>, "reason": "<short reason>"}]}`;

  const userMessage = `WITNESS: ${witnessName}

QUESTIONS AND ANSWERS ALREADY RECORDED:
${questionsBlock}

TIMESTAMPED TRANSCRIPT:
${transcriptBlock}`;

  const start = Date.now();
  let response: Awaited<ReturnType<typeof aiService.createMessage>>;
  try {
    response = await aiService.createMessage({
      model: MODEL,
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }, { timeoutMs: 120_000 });
  } catch (err) {
    const status = (err as { status?: number }).status;
    console.error(`[transcript-match-moments] AI call failed status=${status ?? "?"}`, err);
    res.status(status && status < 500 ? status : 502).json({ error: "Couldn't match moments right now — try again." });
    return;
  }

  {
    const { estimatedCostMicroUsd, cacheHit } = aiService.estimateCallCost(response.usage);
    void logAiCall({
      userId,
      feature: "transcript_match_moments",
      model: MODEL,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      estimatedCostMicroUsd,
      responseTimeMs: Date.now() - start,
      cacheHit,
    });
  }

  const rawText = response.content.find(b => b.type === "text")?.text ?? "";
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    res.json({ suggestedMoments: [] });
    return;
  }

  let matches: Array<{ questionId?: string; start?: number; end?: number; reason?: string }> = [];
  try {
    const parsed = JSON.parse(jsonMatch[0]) as { matches?: typeof matches };
    matches = Array.isArray(parsed.matches) ? parsed.matches : [];
  } catch {
    res.json({ suggestedMoments: [] });
    return;
  }

  const validQuestionIds = new Set(answeredQuestions.map(q => q.id));
  const suggestedMoments = matches
    .filter(m =>
      typeof m.questionId === "string" && validQuestionIds.has(m.questionId) &&
      typeof m.start === "number" && typeof m.end === "number" && m.end > m.start,
    )
    .map(m => ({
      id: randomUUID(),
      witnessExaminationId,
      qaEntryId: m.questionId as string,
      start: m.start as number,
      end: m.end as number,
      reason: typeof m.reason === "string" ? m.reason : "",
    }));

  res.json({ suggestedMoments });
});

// ── POST /transcript/find-moments ───────────────────────────────────────────
// APEX Override's discovery step — the opposite problem from match-moments
// above. There's no pre-typed Q&A to anchor against; Claude has to find
// significant moments COLD, reasoning only from the transcript itself plus
// the case's known parties/claims. Runs per ~50-minute window (with ~5min of
// overlap baked into the segments the caller sends) rather than over an
// entire multi-hour transcript in one call — keeps context bounded and the
// "true start" backtracking reasoning below accurate over a manageable span.
router.post("/transcript/find-moments", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { caseId, segments, windowStartSec, windowEndSec } = req.body as {
    caseId: string;
    segments: Array<{ start: number; end: number; text: string }>;
    windowStartSec: number;
    windowEndSec: number;
  };

  if (!caseId) { res.status(400).json({ error: "caseId is required" }); return; }
  if (!Array.isArray(segments) || segments.length === 0) {
    res.json({ moments: [] });
    return;
  }
  if (!Number.isFinite(windowStartSec) || !Number.isFinite(windowEndSec) || windowEndSec <= windowStartSec) {
    res.status(400).json({ error: "Invalid window range" });
    return;
  }

  const [caseRow] = await db
    .select()
    .from(casesTable)
    .where(and(eq(casesTable.id, caseId), eq(casesTable.userId, userId)));

  if (!caseRow) { res.status(404).json({ error: "Case not found" }); return; }

  const cd = (caseRow.caseData ?? {}) as Record<string, unknown>;
  const { partiesBlock, courtBlock } = buildPartiesAndCourtBlocks(cd);
  const contextBlock = [partiesBlock, courtBlock, buildStructuredCaseBlock(cd)].filter(Boolean).join("\n\n");

  const transcriptBlock = segments
    .map(s => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`)
    .join("\n");

  // The range actually covered by the segments given (includes the overlap
  // padding the caller adds) — moments are validated against this, not the
  // nominal window, since the whole point of the overlap is letting a true
  // start that falls just before windowStartSec still be found and returned.
  const coveredStart = Math.min(...segments.map(s => s.start));
  const coveredEnd = Math.max(...segments.map(s => s.end));

  const systemPrompt = `You are reviewing a window of a timestamped courtroom/testimony transcript COLD — there is no pre-existing list of questions or claims to match against. Find every moment in this window that would matter as evidence: admissions, contradictions, evasive non-answers, escalations, or anything a self-represented litigant would want to pull out and use.

THE MOST IMPORTANT RULE — finding the TRUE START of each moment: never anchor a moment's start to just the key line itself (the admission, the contradiction, the answer). Read backward through the transcript from that line to find where the underlying EXCHANGE actually begins — the start of the question that led to it. Keep backing up through false starts, a rephrased question, an objection, or the judge interjecting — the moment must start at the true beginning of the exchange, not mid-sentence and not mid-objection, so a viewer sees the full context, not a fragment. This is real reasoning per moment, not a fixed offset — some exchanges have a clean single-sentence question, others get interrupted three times before the real answer lands.

${contextBlock ? `Use the case's known parties and claims below to judge what's actually significant here — a moment matters more when it touches something already claimed or disputed in this case.\n\n${contextBlock}\n\n` : ""}Only report moments whose full exchange (start through end) falls within ${coveredStart.toFixed(1)}-${coveredEnd.toFixed(1)} seconds — the range actually covered by the transcript below. Skip anything you're not confident about rather than guessing.

Respond with ONLY raw JSON, no markdown fences, no commentary, in this exact shape:
{"moments": [{"start": <number>, "end": <number>, "label": "<short, specific, human-readable summary — this becomes the clip's label, not a generic phrase like 'important moment'>", "reason": "<one sentence: why this matters as evidence>"}]}`;

  const userMessage = `TIMESTAMPED TRANSCRIPT WINDOW (${windowStartSec.toFixed(1)}-${windowEndSec.toFixed(1)}s nominal, ${coveredStart.toFixed(1)}-${coveredEnd.toFixed(1)}s actually covered below):\n${transcriptBlock}`;

  const start = Date.now();
  let response: Awaited<ReturnType<typeof aiService.createMessage>>;
  try {
    response = await aiService.createMessage({
      model: MODEL,
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }, { timeoutMs: 120_000 });
  } catch (err) {
    const status = (err as { status?: number }).status;
    console.error(`[transcript-find-moments] AI call failed status=${status ?? "?"}`, err);
    res.status(status && status < 500 ? status : 502).json({ error: "Couldn't scan this window right now — try again." });
    return;
  }

  {
    const { estimatedCostMicroUsd, cacheHit } = aiService.estimateCallCost(response.usage);
    void logAiCall({
      userId,
      feature: "transcript_find_moments",
      model: MODEL,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      estimatedCostMicroUsd,
      responseTimeMs: Date.now() - start,
      cacheHit,
    });
  }

  const rawText = response.content.find(b => b.type === "text")?.text ?? "";
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    res.json({ moments: [] });
    return;
  }

  let rawMoments: Array<{ start?: number; end?: number; label?: string; reason?: string }> = [];
  try {
    const parsed = JSON.parse(jsonMatch[0]) as { moments?: typeof rawMoments };
    rawMoments = Array.isArray(parsed.moments) ? parsed.moments : [];
  } catch {
    res.json({ moments: [] });
    return;
  }

  const moments = rawMoments
    .filter(m =>
      typeof m.start === "number" && typeof m.end === "number" && m.end > m.start &&
      m.start >= coveredStart - 1 && m.end <= coveredEnd + 1 &&
      typeof m.label === "string" && m.label.trim().length > 0,
    )
    .map(m => ({
      id: randomUUID(),
      start: m.start as number,
      end: m.end as number,
      label: (m.label as string).trim(),
      reason: typeof m.reason === "string" ? m.reason : "",
    }));

  res.json({ moments });
});

export default router;

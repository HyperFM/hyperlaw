// Voir Dire helper: generates the questions to put to prospective jurors, tailored to the person's case,
// each with what a BAD answer sounds like and what a GOOD answer sounds like for their side.
import { Router, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, casesTable } from "@workspace/db";
import { getAuth } from "../services/auth.js";
import { aiService, MODEL } from "../services/ai.js";
import { logAiCall } from "../services/aiCache.js";
import { logger } from "../lib/logger.js";

const router = Router();

const SYSTEM = `You help a person who is representing themselves in a civil case prepare to question prospective jurors (voir dire). You give legal information, never legal advice.

Given the case record, write 8 questions to ask jurors, tailored to THIS case's actual issues (for example attitudes toward police or government officials, toward the kind of harm alleged, toward large damages awards, toward people who represent themselves). Rules:
- Each question must be neutral and non-leading, the way a court would allow it — it should invite the juror to talk, not argue the case.
- For each question give "bad" (what an answer that is BAD for this person's side sounds like — one plain sentence) and "good" (what to listen for that is GOOD for their side — one plain sentence).
- Plain language a non-lawyer can use. No case law, no advice about who to strike.
- Base everything on the case record only. Never invent facts.

Respond with ONLY raw JSON, no markdown fences:
{ "questions": [ { "question": "...", "bad": "...", "good": "..." } ] }`;

function parseJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```(?:json)?/g, "").trim();
  const a = cleaned.indexOf("{"), b = cleaned.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(cleaned.slice(a, b + 1)) as Record<string, unknown>; } catch { return null; }
}

router.post("/voir-dire/questions", async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!aiService.isConfigured()) { res.status(503).json({ error: "AI service not configured" }); return; }
  const { caseId } = req.body as { caseId?: string };
  if (!caseId) { res.status(400).json({ error: "caseId required" }); return; }

  const [row] = await db.select().from(casesTable).where(and(eq(casesTable.id, caseId), eq(casesTable.userId, userId)));
  if (!row) { res.status(404).json({ error: "Case not found" }); return; }
  const c = row.caseData as Record<string, any>;
  const sc = (row.structuredCase ?? c.structuredCase ?? {}) as Record<string, any>;
  const record = [
    `CASE: ${row.title}`,
    `COURT: ${c.court?.name ?? c.jurisdiction ?? "not set"}`,
    `PEOPLE: ${((c.parties ?? []) as any[]).slice(0, 20).map(p => `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() + (p.type === "official" ? ` (${[p.title, p.agency].filter(Boolean).join(", ")})` : "")).join("; ") || "none"}`,
    `WHAT HAPPENED: ${((c.timeline ?? []) as any[]).slice(0, 20).map(t => `${t.title}: ${t.description}`).join(" | ") || String(c.story ?? "").slice(0, 1200) || "not recorded"}`,
    `SUMMARY: ${sc.executiveSummary ?? ""}`,
    `CLAIMS: ${((sc.claims ?? []) as string[]).slice(0, 10).join("; ") || "none recorded"}`,
  ].join("\n");

  const start = Date.now();
  let response: Awaited<ReturnType<typeof aiService.createMessage>>;
  try {
    response = await aiService.createMessage({ model: MODEL, max_tokens: 2200, system: SYSTEM, messages: [{ role: "user", content: record }] });
  } catch (err) {
    logger.warn({ err }, "voir dire question generation failed");
    res.status(502).json({ error: "Couldn't generate questions right now — please try again." });
    return;
  }
  const { estimatedCostMicroUsd, cacheHit } = aiService.estimateCallCost(response.usage, MODEL);
  void logAiCall({ userId, caseId, feature: "voir_dire", model: MODEL, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, estimatedCostMicroUsd, responseTimeMs: Date.now() - start, cacheHit });

  const parsed = parseJson(response.content.find(b => b.type === "text")?.text ?? "");
  const questions = (Array.isArray(parsed?.questions) ? (parsed!.questions as any[]) : [])
    .filter(q => q && typeof q.question === "string" && q.question.trim())
    .slice(0, 12)
    .map(q => ({ question: String(q.question).trim(), bad: String(q.bad ?? "").trim(), good: String(q.good ?? "").trim() }));
  if (questions.length === 0) { res.status(502).json({ error: "Couldn't generate questions right now — please try again." }); return; }
  res.json({ questions });
});

export default router;

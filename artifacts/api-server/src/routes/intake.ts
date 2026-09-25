// Free intake chat — the person tells their story in their own words and the AI asks
// only the follow-up questions needed to organize the case. It builds nothing itself:
// it returns what it captured, the app shows it for confirmation, and only confirmed
// items are saved to the case. The server keeps NO transcript — just a small per-account
// record so the free intake stays free but bounded (one per account, 25 messages, $1.50).

import { Router, type Request, type Response } from "express";
import { getAuth } from "../services/auth.js";
import { aiService, MODEL } from "../services/ai.js";
import { logAiCall } from "../services/aiCache.js";
import { kvGet, kvSet } from "../services/kv.js";
import { storage } from "../storage.js";
import { logger } from "../lib/logger.js";

const router = Router();

export const INTAKE_MAX_USER_MESSAGES = 25;
export const INTAKE_MAX_COST_MICRO_USD = 1_500_000; // $1.50 hard stop

interface IntakeRecord { messages: number; costMicroUsd: number; startedAt: number; finished: boolean }
const recordKey = (userId: string) => `intake:${userId}`;

const SYSTEM_PROMPT = `You are HyperLaw's intake guide. A person is telling you, in their own words, what happened to them so their case can be organized. They may be hurt, scared or angry. Be warm and steady, never clinical.

How you work:
- You only ask questions needed to organize the case: who was involved (names, roles, agency), what happened, when, where, what documents or evidence exist, and which court or county is involved. One question at a time.
- Keep every reply under 50 words. Acknowledge what they said in a few words, then ask ONE follow-up. Never lecture and never explain the law.
- Never give legal advice or predict outcomes. Never say "you should" or "I recommend". Never invent facts: record only what the person actually said.
- If they say something that sounds like they may hurt themselves, stop asking case questions, respond with care, and tell them they can call or text 988 (the Suicide & Crisis Lifeline) any time.

Also return what you learned THIS turn (only new information, nothing repeated from earlier turns) so the app can ask the person to confirm it.

Respond with ONLY raw JSON, no markdown fences:
{
  "reply": "<your short reply and next question>",
  "new": {
    "parties": [{ "name": "<full name as given>", "role": "<role or relationship, e.g. deputy, jail nurse, witness>", "isOfficial": <true if a government employee or agency, else false>, "agency": "<agency/department or null>" }],
    "events": [{ "when": "<date or time as the person gave it, or null>", "what": "<one plain sentence of what happened>" }],
    "court": "<court or county if mentioned, else null>"
  },
  "readyToWrapUp": <true once you have who, what happened, when and where, and asking more would not add much; else false>
}`;

function parseJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```(?:json)?/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>; } catch { return null; }
}

router.post("/intake/chat", async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!aiService.isConfigured()) { res.status(503).json({ error: "AI service not configured" }); return; }

  const { messages, captured } = req.body as { messages?: Array<{ role: string; content: string }>; captured?: { parties?: string[]; events?: string[] } };
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 80) { res.status(400).json({ error: "Invalid messages" }); return; }
  const clean = messages.map(m => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), content: String(m.content ?? "").slice(0, 4000) }));
  if (clean[clean.length - 1].role !== "user" || !clean[clean.length - 1].content.trim()) { res.status(400).json({ error: "Last message must be the person's" }); return; }
  if (clean[0].role !== "user") clean.unshift({ role: "user", content: "(The person opened the intake.)" }); // API needs a user turn first; the app's opening prompt is assistant-side

  const user = await storage.getUser(userId);
  const exempt = !!(user?.isAdmin || user?.isTester);
  let record: IntakeRecord = { messages: 0, costMicroUsd: 0, startedAt: Date.now(), finished: false };

  if (!exempt) {
    if (!user?.emailVerified && process.env.INTAKE_REQUIRE_VERIFIED_EMAIL !== "false") {
      res.status(403).json({ code: "verify_email", error: "Please verify your email first — check your inbox for the link — then come back." });
      return;
    }
    record = (await kvGet<IntakeRecord>(recordKey(userId))) ?? record;
    if (record.finished) {
      res.status(403).json({ code: "free_intake_used", error: "You've already used your free intake. Your case and Index are saved." });
      return;
    }
    if (record.messages >= INTAKE_MAX_USER_MESSAGES || record.costMicroUsd >= INTAKE_MAX_COST_MICRO_USD) {
      res.status(429).json({ code: "intake_limit", error: "You've reached the end of the free intake. Everything you confirmed is saved — tap Finish to build your case." });
      return;
    }
  }

  // Mark the last message for prompt caching: the next turn re-reads this whole prefix at ~10% of the normal price.
  const apiMessages = clean.map((m, i) =>
    i === clean.length - 1
      ? { role: m.role, content: [{ type: "text" as const, text: m.content, cache_control: { type: "ephemeral" as const } }] }
      : { role: m.role, content: m.content });

  const start = Date.now();
  let response: Awaited<ReturnType<typeof aiService.createMessage>>;
  try {
    // Tell the model what the app already has so it reports only what is genuinely new this turn.
    const have = [
      ...(captured?.parties ?? []).slice(0, 30).map(x => `person: ${String(x).slice(0, 80)}`),
      ...(captured?.events ?? []).slice(0, 30).map(x => `event: ${String(x).slice(0, 140)}`),
    ];
    const system = have.length ? `${SYSTEM_PROMPT}\n\nALREADY CAPTURED (do NOT list these again, in any wording, and do not list the same person twice with or without a title):\n${have.join("\n")}` : SYSTEM_PROMPT;
    response = await aiService.createMessage({ model: MODEL, max_tokens: 700, system, messages: apiMessages });
  } catch (err) {
    logger.warn({ err }, "intake chat call failed");
    res.status(502).json({ error: "Couldn't reach the intake guide right now — please try again." });
    return;
  }

  const { estimatedCostMicroUsd, cacheHit } = aiService.estimateCallCost(response.usage, MODEL);
  void logAiCall({ userId, feature: "intake_chat", model: MODEL, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, estimatedCostMicroUsd, responseTimeMs: Date.now() - start, cacheHit });

  const text = response.content.find(b => b.type === "text")?.text ?? "";
  const parsed = parseJson(text);
  const reply = typeof parsed?.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : (parsed ? "Thank you. Can you tell me a little more?" : text.trim().slice(0, 600) || "Thank you. Can you tell me a little more?");
  const fresh = (parsed?.new ?? {}) as { parties?: unknown; events?: unknown; court?: unknown };
  const arr = <T,>(v: unknown, limit: number): T[] => (Array.isArray(v) ? (v.slice(0, limit) as T[]) : []);

  const userMsgCount = clean.filter(m => m.role === "user").length;
  if (!exempt) {
    record = { ...record, messages: Math.max(record.messages, userMsgCount), costMicroUsd: record.costMicroUsd + estimatedCostMicroUsd };
    await kvSet(recordKey(userId), record).catch(err => logger.warn({ err }, "could not save intake record"));
  }

  res.json({
    reply,
    new: {
      parties: arr<{ name: string; role?: string; isOfficial?: boolean; agency?: string | null }>(fresh.parties, 10),
      events: arr<{ when?: string | null; what: string }>(fresh.events, 10),
      court: typeof fresh.court === "string" && fresh.court.trim() ? fresh.court.trim() : null,
    },
    readyToWrapUp: parsed?.readyToWrapUp === true,
    messagesLeft: exempt ? null : Math.max(0, INTAKE_MAX_USER_MESSAGES - record.messages),
  });
});

// The person confirmed and finished: the free intake is used up. (The transcript is never stored here.)
router.post("/intake/finish", async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = await storage.getUser(userId);
  if (!(user?.isAdmin || user?.isTester)) {
    const record = (await kvGet<IntakeRecord>(recordKey(userId))) ?? { messages: 0, costMicroUsd: 0, startedAt: Date.now(), finished: false };
    await kvSet(recordKey(userId), { ...record, finished: true });
  }
  res.json({ ok: true });
});

export default router;

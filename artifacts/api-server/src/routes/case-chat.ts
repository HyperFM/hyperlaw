// Case chat with bubbles (Phase 3). Short answers, one next step and its reason, and 2-4 tap options.
// The app owns the facts: it reads the stored case record, computes every deadline from the rules table
// (services/deadlines.ts), and hands the results to the model — the model never does date math.
// The server keeps no transcript; the app holds it (24h, wiped on request) and only confirmed facts reach the case.

import { Router, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, casesTable, caseHistory } from "@workspace/db";
import { getAuth } from "../services/auth.js";
import { aiService, MODEL } from "../services/ai.js";
import { logAiCall } from "../services/aiCache.js";
import { storage } from "../storage.js";
import { isBillingEnabled, isUserWaived } from "../services/billing.js";
import { deadlinesFor, rulesForCourt } from "../services/deadlines.js";
import { logger } from "../lib/logger.js";

const router = Router();

const SYSTEM_PROMPT = `You are HyperLaw's case guide. You help a person who is handling their own legal matter keep track of it and know what comes next. You give legal information and drafting help — never legal advice.

Every reply has three parts and is UNDER 60 WORDS in total:
1. "happening": one or two lines on what is going on, in plain words.
2. "next_step" and "why": ONE next action, and one reason tied to a specific rule or date you were given below.
3. "bubbles": 2 to 4 short tap options (each under 5 words) for what the person might do or say next.

Hard rules:
- Never say "you should" or "I recommend". Say "Next step: ..." and give the rule or date behind it.
- NEVER calculate or state a deadline date yourself. If a date is involved, ask for the trigger date and set "event" (below). The app computes the deadline and shows it. In "why" name the rule, never a computed date. You may repeat a date that appears under APP-PROVIDED DATES.
- Use only facts in the case record and the conversation. If the record does not cover the situation, say so plainly and ask ONE question.
- If the court has no rule listed under RULES ON FILE for what they need, say you don't have a rule on file for that and they should ask the court clerk. Never guess a rule.
- If they say something that sounds like they may hurt themselves, stop the case questions, respond with care, and tell them they can call or text 988.

If the person tells you a date that starts a clock, set "event": {"type": "served_complaint" | "waiver_requested" | "judgment_entered", "date": "YYYY-MM-DD"} using ONLY a date they actually gave (today's date is provided; resolve words like "yesterday" against it). Otherwise event is null.
If the person states NEW facts about the case (people, what happened, when) that are not already in the record, list them in "proposeFacts" so the app can ask them to confirm. Never invent facts.

Respond with ONLY raw JSON, no markdown fences:
{
  "happening": "...",
  "event": null,
  "next_step": "...",
  "why": "...",
  "bubbles": ["...", "..."],
  "proposeFacts": { "parties": [{ "name": "...", "role": "...", "isOfficial": false, "agency": null }], "events": [{ "when": null, "what": "..." }] }
}`;

function parseJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```(?:json)?/g, "").trim();
  const a = cleaned.indexOf("{");
  const b = cleaned.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(cleaned.slice(a, b + 1)) as Record<string, unknown>; } catch { return null; }
}

const isoToday = () => new Date().toISOString().slice(0, 10);
const fmt = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

type CaseRow = typeof casesTable.$inferSelect;

/** What still blocks the chat for this account and case, in the order the person should fix it. Admins/testers skip everything. */
async function chatMissing(userId: string, row: CaseRow): Promise<string[]> {
  const user = await storage.getUser(userId);
  if (user?.isAdmin || user?.isTester) return [];
  const c = row.caseData as Record<string, any>;
  const missing: string[] = [];
  if (!String(c.jurisdiction ?? "").trim() && !c.court?.name) missing.push("jurisdiction");
  if (!row.casePhotoDataUrl) missing.push("photo");
  if (await isBillingEnabled() && !(await isUserWaived(userId)) && (await storage.getCreditBalance(userId)) < 1) missing.push("topup");
  return missing;
}

// GET /case-chat/gate?caseId= — what to fix before the chat opens (no AI call, free).
router.get("/case-chat/gate", async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const caseId = String(req.query.caseId ?? "");
  const [row] = await db.select().from(casesTable).where(and(eq(casesTable.id, caseId), eq(casesTable.userId, userId)));
  if (!row) { res.status(404).json({ error: "Case not found" }); return; }
  res.json({ missing: await chatMissing(userId, row) });
});

router.post("/case-chat/message", async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!aiService.isConfigured()) { res.status(503).json({ error: "AI service not configured" }); return; }

  const { caseId, messages } = req.body as { caseId?: string; messages?: Array<{ role: string; content: string }> };
  if (!caseId || !Array.isArray(messages) || messages.length === 0 || messages.length > 60) { res.status(400).json({ error: "Invalid request" }); return; }
  const clean = messages.map(m => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), content: String(m.content ?? "").slice(0, 3000) }));
  if (clean[clean.length - 1].role !== "user" || !clean[clean.length - 1].content.trim()) { res.status(400).json({ error: "Last message must be the person's" }); return; }
  while (clean.length && clean[0].role !== "user") clean.shift();

  const [row] = await db.select().from(casesTable).where(and(eq(casesTable.id, caseId), eq(casesTable.userId, userId)));
  if (!row) { res.status(404).json({ error: "Case not found" }); return; }
  const c = row.caseData as Record<string, any>;

  const missing = await chatMissing(userId, row);
  if (missing.length) {
    res.status(403).json({ code: "chat_locked", missing, error: "The chat unlocks once the case has its court or county, a photo, and credits." });
    return;
  }

  // ── Build the case record the model reads ──
  const parties = ((c.parties ?? []) as Array<any>).slice(0, 30).map(p => `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() + (p.type === "official" ? ` (${[p.title, p.agency].filter(Boolean).join(", ") || "official"})` : "")).filter(Boolean);
  const timeline = ((c.timeline ?? []) as Array<any>).slice(0, 25).map(t => `${t.title}: ${t.description}`);
  const sc = (row.structuredCase ?? c.structuredCase ?? {}) as Record<string, any>;
  const nextUp = ((sc.nextUp ?? []) as Array<any>).map(n => `${n.kind}: ${n.text}${n.dueDate ? ` (due ${fmt(n.dueDate)})` : ""}${n.note ? ` [${n.note}]` : ""}`);
  const recentDocs = await db.select({ t: caseHistory.title, ty: caseHistory.itemType, at: caseHistory.createdAt }).from(caseHistory).where(eq(caseHistory.caseId, caseId)).orderBy(desc(caseHistory.createdAt)).limit(6).catch(() => []);
  const rules = rulesForCourt(c.court ?? null);

  const record = [
    `TODAY: ${fmt(isoToday())} (${isoToday()})`,
    `CASE: ${row.title}`,
    `COURT: ${c.court?.name ? `${c.court.name} (${c.court.level}${c.court.state ? `, ${c.court.state}` : ""})` : c.jurisdiction || "not set"}`,
    `LAST CASE ACTIVITY: ${row.updatedAt.toISOString().slice(0, 10)}`,
    `PEOPLE: ${parties.join("; ") || "none recorded"}`,
    `WHAT HAPPENED (timeline): ${timeline.join(" | ") || "none recorded"}`,
    `WHERE THINGS STAND: ${sc.whereThingsStand ?? "not recorded"}`,
    `APP-PROVIDED DATES / TO-DO / WAITING: ${nextUp.join(" | ") || "none recorded"}`,
    `RECENT DOCUMENTS & ACTIVITY: ${recentDocs.map(d => `${d.ty}: ${d.t} (${d.at.toISOString().slice(0, 10)})`).join(" | ") || "none"}`,
    `RULES ON FILE FOR THIS COURT: ${rules.map(r => `${r.filing} — ${r.days} days after ${r.event.replace(/_/g, " ")} (${r.rule})`).join(" | ") || "none on file"}`,
    `STORY (their words, trimmed): ${String(c.story ?? "").slice(0, 1500) || "none"}`,
  ].join("\n");

  const apiMessages = clean.map((m, i) =>
    i === clean.length - 1
      ? { role: m.role, content: [{ type: "text" as const, text: m.content, cache_control: { type: "ephemeral" as const } }] }
      : { role: m.role, content: m.content });

  const start = Date.now();
  let response: Awaited<ReturnType<typeof aiService.createMessage>>;
  try {
    response = await aiService.createMessage({
      model: MODEL,
      max_tokens: 600,
      system: [
        { type: "text", text: SYSTEM_PROMPT },
        { type: "text", text: `=== CASE RECORD (from the app — authoritative) ===\n${record}`, cache_control: { type: "ephemeral" } },
      ],
      messages: apiMessages,
    });
  } catch (err) {
    logger.warn({ err }, "case chat call failed");
    res.status(502).json({ error: "Couldn't reach the case guide right now — please try again." });
    return;
  }

  const { estimatedCostMicroUsd, cacheHit } = aiService.estimateCallCost(response.usage, MODEL);
  void logAiCall({ userId, caseId, feature: "case_chat", model: MODEL, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, estimatedCostMicroUsd, responseTimeMs: Date.now() - start, cacheHit });

  const text = response.content.find(b => b.type === "text")?.text ?? "";
  const p = parseJson(text);
  const str = (v: unknown, d = "") => (typeof v === "string" && v.trim() ? v.trim() : d);
  const bubbles = Array.isArray(p?.bubbles) ? (p!.bubbles as unknown[]).filter((b): b is string => typeof b === "string" && b.trim().length > 0).slice(0, 4) : [];

  // ── The app computes the deadline, never the model ──
  let deadline: { flag: boolean; text: string; dueDate?: string; rule?: string; filing?: string; verified?: boolean } | null = null;
  const ev = p?.event as { type?: string; date?: string } | null | undefined;
  if (ev && typeof ev.type === "string" && typeof ev.date === "string") {
    const found = deadlinesFor(c.court ?? null, ev.type, ev.date);
    if (found.length) {
      const first = found[0];
      deadline = {
        flag: true,
        text: `${first.rule.filing} due ${fmt(first.dueDate)}`,
        dueDate: first.dueDate,
        rule: first.rule.rule,
        filing: first.rule.filing,
        verified: first.rule.verified,
      };
    } else {
      deadline = { flag: false, text: "I don't have a rule on file for this court and situation — please ask the court clerk for the deadline." };
    }
  }

  res.json({
    happening: str(p?.happening, p ? "Thanks for telling me." : text.trim().slice(0, 300) || "Thanks for telling me."),
    deadline,
    next_step: str(p?.next_step),
    why: str(p?.why),
    bubbles: bubbles.length >= 2 ? bubbles : ["Check my status", "I have a question"],
    proposeFacts: {
      parties: Array.isArray((p?.proposeFacts as any)?.parties) ? (p!.proposeFacts as any).parties.slice(0, 8) : [],
      events: Array.isArray((p?.proposeFacts as any)?.events) ? (p!.proposeFacts as any).events.slice(0, 8) : [],
    },
  });
});

export default router;

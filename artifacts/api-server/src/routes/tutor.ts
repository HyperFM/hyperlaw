import { Router, type Request, type Response } from "express";
import { getAuth } from "../services/auth.js";
import { aiService } from "../services/ai.js";
import { logAiCall } from "../services/aiCache.js";

const router = Router();

// Deliberately Haiku, not the app-wide Sonnet MODEL constant — this is
// narrow app-navigation help, not legal reasoning, and the user explicitly
// asked for this feature to keep usage to a minimum. Free for the user
// (no chargeOneCredit/chargeCredits call anywhere in this route) — logAiCall
// is purely for cost observability, same as every other AI call in this
// codebase, and never bills the user.
const TUTOR_MODEL = "claude-haiku-4-5";

// Every screen the Tutor is allowed to send someone to — a fixed whitelist,
// never a freeform guess, so a hallucinated destination can't silently do
// nothing (or worse) on the client. Deliberately excludes document_intake
// (transient, destructive on cancel) and the dead "studio" variant.
const DESTINATIONS = [
  "home", "about_creator", "case_detail", "case_parties", "case_court",
  "case_story", "case_timeline", "case_review", "case_assembly",
  "case_learning", "studio_workspace",
] as const;
type Destination = (typeof DESTINATIONS)[number];

const TUTOR_SYSTEM_PROMPT = `You are the HyperLaw Tutor — a small, friendly, in-app guide that helps people find their way around the HyperLaw app and understand what each part of it does.

You are NOT a legal advisor. Never answer legal questions, give legal advice, or discuss the user's actual case facts, charges, evidence, or strategy — only how to use the app itself. If asked anything outside "how do I use this app" (legal questions, general chit-chat, anything unrelated to app navigation), politely decline and say you can only help with using HyperLaw itself.

Keep every answer short — two or three sentences at most, plain language, no long explanations.

If a specific screen would help, recommend exactly ONE of these destination keys (or null if none fits):
${DESTINATIONS.map(d => `- "${d}"`).join("\n")}

Respond with ONLY raw JSON in this exact shape, nothing else, no markdown fences, no commentary:
{"reply": "<your short answer>", "destination": "<one of the keys above, or null>"}`;

router.post("/tutor/help", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { message } = req.body as { message?: string };
  if (!message || !message.trim()) {
    res.status(400).json({ error: "No message provided" });
    return;
  }

  const start = Date.now();
  let response: Awaited<ReturnType<typeof aiService.createMessage>>;
  try {
    response = await aiService.createMessage({
      model: TUTOR_MODEL,
      max_tokens: 300,
      system: TUTOR_SYSTEM_PROMPT,
      messages: [{ role: "user", content: message.slice(0, 2000) }],
    });
  } catch (err) {
    const status = (err as { status?: number }).status;
    console.error(`[tutor-help] AI call failed status=${status ?? "?"}`, err);
    res.status(status && status < 500 ? status : 502).json({ error: "Couldn't reach your Tutor right now — try again." });
    return;
  }

  {
    const { estimatedCostMicroUsd, cacheHit } = aiService.estimateCallCost(response.usage);
    void logAiCall({
      userId,
      feature: "tutor_help",
      model: TUTOR_MODEL,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      estimatedCostMicroUsd,
      responseTimeMs: Date.now() - start,
      cacheHit,
    });
  }

  const rawText = response.content.find(b => b.type === "text")?.text ?? "";
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  let reply = "Sorry, I couldn't come up with an answer — try asking again.";
  let destination: Destination | null = null;
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { reply?: string; destination?: string | null };
      if (typeof parsed.reply === "string" && parsed.reply.trim()) reply = parsed.reply.trim();
      if (typeof parsed.destination === "string" && (DESTINATIONS as readonly string[]).includes(parsed.destination)) {
        destination = parsed.destination as Destination;
      }
    } catch {
      // Falls through to the default reply above — a malformed response
      // shouldn't surface as a hard error for something this low-stakes.
    }
  }

  res.json({ reply, destination });
});

export default router;

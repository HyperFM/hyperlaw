import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "../services/auth.js";
import { aiService, MODEL } from "../services/ai.js";
import { db, casesTable, uploadedDocumentsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const router = Router();

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
}

// ── Source verification ───────────────────────────────────────────────────────

interface VerificationResult {
  field: string;
  ref: string;
  origin: string;
  supported: boolean;
}

function checkRefInSource(ref: string, sourceLower: string): boolean {
  const r = ref.toLowerCase().trim();
  if (sourceLower.includes(r)) return true;
  if (r.length > 40 && sourceLower.includes(r.slice(0, 40))) return true;
  // Check any 3-word sequence of 5+ char words
  const words = r.split(/\s+/).filter(w => w.length >= 5);
  if (words.length >= 3) {
    for (let i = 0; i <= words.length - 3; i++) {
      if (sourceLower.includes(words.slice(i, i + 3).join(" "))) return true;
    }
  }
  return false;
}

function verifySourceClaims(
  content: Record<string, unknown>,
  sourceText: string,
): VerificationResult[] {
  const results: VerificationResult[] = [];
  const sourceLower = sourceText.toLowerCase();

  function walk(obj: unknown, path: string) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      obj.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    const rec = obj as Record<string, unknown>;
    // Found a source ref (ClaimField.source or quote.source)
    if (
      rec.origin && typeof rec.origin === "string" &&
      rec.ref && typeof rec.ref === "string"
    ) {
      results.push({
        field: path,
        ref: rec.ref,
        origin: rec.origin,
        supported: checkRefInSource(rec.ref, sourceLower),
      });
      return; // don't recurse into source objects themselves
    }
    Object.entries(rec).forEach(([key, val]) => {
      walk(val, path ? `${path}.${key}` : key);
    });
  }

  walk(content, "");
  return results;
}

// ── Exhibit generation prompt ─────────────────────────────────────────────────

const EXHIBIT_SYSTEM_PROMPT = `You are an exhibit screen generator for HyperLaw, a legal evidence presentation platform.

You analyze dictation from a user reviewing video evidence and produce a structured exhibit screen in JSON.

EXHIBIT TYPES OVERVIEW:
- contradiction: split_screen layout — two conflicting accounts side by side
- narrative_reveal: narrative_reveal layout — known facts → pivot quote → CTA
- escalation: question_board layout — minor trigger → disproportionate response
- policy_comparison: split_screen layout — stated policy vs actual conduct  
- timeline_conflict: timeline layout — chronological events that reveal a conflict
- quote_breakdown: quote_focus layout — one statement unpacked with context
- evidence_stack: evidence_grid layout — multiple independent evidence items (check icons)
- missing_investigation: evidence_grid layout — steps never taken (x icons)
- question_analysis: question_board layout — event → response → central question
- watch_this_moment: narrative_reveal layout — context before a key video moment

LAYOUT SCHEMAS (abbreviated — follow these shapes exactly):

hero_headline_argument: { layout, header:{actor,category,badgeNumber}, headline:string[], quote:{text,contextNote?,source}, findings:[{icon,title,body:ClaimField}], conclusion:{lines:string[]}, footerCitations:string[] }
narrative_reveal: { layout, header, headline, facts:[{icon,text:ClaimField}], pivotQuote:{leadIn,text,highlightedFragment?,source}, ctaLabel, closingParagraph:{text,boldFragment?}, footerCitations }
question_board: { layout, header, headline, leftColumn:{steps:[{icon,label,quote:ClaimField}],questionBox:{prompt,answer}}, rightColumn:{intro,checklist:ClaimField[],closingHighlight}, footerCitations }
split_screen: { layout, header, headline, leftSide:{label,content:ClaimField}, rightSide:{label,content:ClaimField}, takeaway:{text,phrasedAsQuestion}, footerCitations }
timeline: { layout, header, headline, events:[{label,detail:ClaimField,timestamp?}], conclusion:{lines:string[]}, footerCitations }
quote_focus: { layout, header, headline, dominantQuote:{text,source}, context:ClaimField[], implication:{text,phrasedAsQuestion}, footerCitations }
evidence_grid: { layout, header, headline, items:[{icon,label,source}], conclusion:{lines:string[]}, footerCitations }
summary_board: { layout, header, headline, recapPoints:[{exhibitRef,summary}], finalTakeaway:{lines:string[]}, footerCitations }

ClaimField: { text:string, source:SourceRef|null, classification:"verified_fact"|"observation"|"speculation" }
SourceRef: { origin:"dictation"|"complaint"|"discovery"|"evidence"|"existing_exhibit", ref:string }

SourceRef.ref MUST be a verbatim excerpt from the provided source material — never invented.
Use classification "verified_fact" only for direct citations, "observation" for inferences, "speculation" for unsupported claims.

If a PARTIES IN THIS CASE block is provided, use it to resolve who's who: dictation often refers to people by nickname, role, or description rather than full name. Populate header.actor and any badgeNumber/agency/title fields with the party's real name and details from that block, not the nickname itself, unless the dictation explicitly quotes someone using the nickname.

Generate 2–3 DISTINCT candidate exhibits for this moment — different exhibit types or angles on the same moment (e.g. one framed as a contradiction, one as an escalation), not near-duplicates of each other. For each candidate, write a one-sentence "rationale" explaining why THIS framing is persuasive for a judge or jury. Then pick the single strongest candidate as the recommendation and explain why it beats the others in one or two sentences — weigh evidence strength, visual clarity, and whether a viewer would grasp the point within five seconds.

RETURN FORMAT — valid JSON only, no preamble:
{
  "candidates": [
    {
      "selectedType": "<one of the 10 exhibit type IDs>",
      "content": { <the complete layout object matching the chosen layout's schema> },
      "rationale": "<one sentence: why this framing is persuasive>"
    }
  ],
  "recommendedIndex": <index into candidates of the strongest one>,
  "recommendationReason": "<one or two sentences explaining why this candidate is the strongest of the set>"
}`;

// ── Court script (Illustrative Aid Script tool) ─────────────────────────────────
// A LITIGANT-FACING reading script, generated from the same raw moment text as
// the exhibit slides, but deliberately NOT the same output — exhibit slides are
// written for on-screen display; this is meant to be read aloud in court while
// the video plays, so it has to still sound like the person actually talking,
// word for word, just legible. Kept intentionally conservative: copyediting
// only, never rewriting, summarizing, or "elevating" the language.

const COURT_SCRIPT_SYSTEM_PROMPT = `You are a court-reading script formatter for HyperLaw. You are given a self-represented litigant's own raw, dictated description of a moment of video evidence, exactly as they said it (repetition, false starts, and all). Your ONLY job is light copyediting so it reads naturally aloud in court — you are NOT a writer, summarizer, or legal drafter, and this is NOT the text that appears on the exhibit slide on screen.

STRICT RULES — read carefully, these are not suggestions:
- Keep every substantive word and phrase the person used. Do not replace their vocabulary with different words, and do not make the tone more legal, formal, or polished than a lightly cleaned transcript.
- Do not summarize, shorten, condense, or drop any statement, fact, or detail they included.
- Do not add any new facts, claims, framing, or interpretation that wasn't already there.
- DO remove: filler words (um, uh, like, you know — only when clearly meaningless filler), exact word/phrase repetition caused by dictation stutter (e.g. "he he hit me hit me" → "he hit me"), false starts that were clearly abandoned mid-sentence.
- DO add: correct punctuation, capitalization, and paragraph/sentence breaks so it reads clearly aloud. Nothing else.
- The result must still sound like the same person, in their own words and voice — a clean transcript, never a lawyer's rewrite. If a passage is already clean, return it nearly unchanged.
- Process every moment provided, independently, in the same order they're given.

Return ONLY valid JSON, no preamble: { "scripts": [ { "id": "<the moment id exactly as given>", "text": "<cleaned text>" }, ... ] }`;

function fmtMMSS(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── POST /exhibit/court-script ──────────────────────────────────────────────
router.post("/exhibit/court-script", requireAuth, async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { caseId, moments } = req.body as {
    caseId: string;
    moments: Array<{ id: string; start: number; end: number; label: string }>;
  };

  if (!Array.isArray(moments) || moments.length === 0) {
    res.status(400).json({ error: "No moments provided" });
    return;
  }

  const [caseRow] = await db
    .select()
    .from(casesTable)
    .where(and(eq(casesTable.id, caseId), eq(casesTable.userId, userId)));

  if (!caseRow) {
    res.status(404).json({ error: "Case not found" });
    return;
  }

  const userMessage = moments
    .map(m => `MOMENT ${m.id} (${fmtMMSS(m.start)}–${fmtMMSS(m.end)}):\n${m.label}`)
    .join("\n\n---\n\n");

  const start = Date.now();
  const response = await (aiService as unknown as { client: { messages: { create: (args: unknown) => Promise<{ content: Array<{ type: string; text?: string }> }> } } }).client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: COURT_SCRIPT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const rawText = response.content.find((b) => b.type === "text")?.text ?? "";
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    res.status(500).json({ error: "AI did not return valid JSON" });
    return;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch {
    res.status(500).json({ error: "AI returned malformed JSON" });
    return;
  }

  const rawScripts = Array.isArray(parsed.scripts) ? parsed.scripts : [];
  const scripts = rawScripts.filter(
    (s): s is { id: string; text: string } =>
      !!s && typeof s === "object" && typeof (s as Record<string, unknown>).id === "string" && typeof (s as Record<string, unknown>).text === "string",
  );

  if (scripts.length === 0) {
    res.status(500).json({ error: "AI response missing required fields" });
    return;
  }

  const responseMs = Date.now() - start;
  console.log(`[exhibit-court-script] moments=${moments.length} returned=${scripts.length} ms=${responseMs}`);

  res.json({ scripts });
});

// ── POST /exhibit/generate ────────────────────────────────────────────────────

router.post("/exhibit/generate", requireAuth, async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const {
    caseId,
    timestamp,
    dictation,
    existingExhibits = [] as string[],
    forceType,
  } = req.body as {
    caseId: string;
    timestamp: string;
    dictation: string;
    existingExhibits?: string[];
    forceType?: string;
  };

  if (!dictation?.trim()) {
    res.status(400).json({ error: "Dictation is required" });
    return;
  }

  // Load case
  const [caseRow] = await db
    .select()
    .from(casesTable)
    .where(and(eq(casesTable.id, caseId), eq(casesTable.userId, userId)));

  if (!caseRow) {
    res.status(404).json({ error: "Case not found" });
    return;
  }

  // Load uploaded documents for source context
  const docs = await db
    .select({ text: uploadedDocumentsTable.extractedText, fileName: uploadedDocumentsTable.fileName })
    .from(uploadedDocumentsTable)
    .where(and(
      eq(uploadedDocumentsTable.caseId, caseId),
      eq(uploadedDocumentsTable.userId, userId),
    ));

  // Parties and court are pulled out and included in full, rather than
  // relying on them surviving inside the truncated CASE NOTES blob below.
  // caseData is the entire case object (parties, court, story, notes,
  // timeline, evidence, assembly, etc. all together) and jsonb doesn't
  // guarantee key order is preserved on the way back from Postgres — so a
  // long story or notes field could easily push party names and court info
  // past a 1500-char cutoff. Names and roles are exactly what the AI needs
  // to attribute quotes/actions to the right person, so they can't be left
  // to chance.
  const cd = (caseRow.caseData ?? {}) as Record<string, unknown>;
  const parties = Array.isArray(cd.parties) ? (cd.parties as Record<string, unknown>[]) : [];
  const court = cd.court && typeof cd.court === "object" ? (cd.court as Record<string, unknown>) : null;

  const partiesBlock = parties.length > 0
    ? `PARTIES IN THIS CASE:\n${parties.map(p => {
        const name = [p.firstName, p.lastName].filter(Boolean).join(" ");
        const role = [p.type, p.title, p.agency, p.badge ? `badge #${p.badge}` : null].filter(Boolean).join(", ");
        const nickname = p.nickname ? ` (referred to in dictation as "${p.nickname}")` : "";
        return `- ${name}${nickname}${role ? ` — ${role}` : ""}`;
      }).join("\n")}`
    : null;

  const courtBlock = court
    ? `COURT: ${[court.name, court.state, court.level].filter(Boolean).join(", ")}`
    : null;

  // Build source material
  const sourceText = [
    `DICTATION (primary source — timestamp ${timestamp}): ${dictation}`,
    partiesBlock,
    courtBlock,
    typeof cd.story === "string" && cd.story.trim() ? `CASE STORY: ${cd.story.slice(0, 3000)}` : null,
    caseRow.caseData ? `OTHER CASE NOTES: ${JSON.stringify(caseRow.caseData).slice(0, 1500)}` : null,
    ...docs.map((d, i) =>
      `UPLOADED DOCUMENT ${i + 1} (${d.fileName ?? "file"}): ${(d.text ?? "").slice(0, 2000)}`
    ),
  ].filter(Boolean).join("\n\n");

  // Prior exhibits context
  const priorBlock = existingExhibits.length > 0
    ? `\n\nPRIOR EXHIBIT SUMMARIES (for narrative consistency — avoid repeating these):\n${existingExhibits.map((e, i) => `Exhibit ${i + 1}: ${e}`).join("\n")}`
    : "";

  // Force type hint — when set, the user asked to regenerate with one
  // specific type instead of a fresh multi-candidate set, so ask for exactly
  // one candidate of that type.
  const forceBlock = forceType
    ? `\n\nUSER REQUESTED TYPE: "${forceType}" — generate exactly ONE candidate of this type instead of the usual 2-3, and prefer it if the content supports it.`
    : "";

  const userMessage = `VIDEO TIMESTAMP: ${timestamp}

USER DICTATION:
${dictation}
${priorBlock}${forceBlock}

SOURCE MATERIAL:
${sourceText}`;

  // Claude call
  const start = Date.now();
  const response = await (aiService as unknown as { client: { messages: { create: (args: unknown) => Promise<{ content: Array<{ type: string; text?: string }>; stop_reason: string }> } } }).client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: EXHIBIT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  // Extract JSON text
  const rawText = response.content.find((b) => b.type === "text")?.text ?? "";
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    res.status(500).json({ error: "AI did not return valid JSON" });
    return;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch {
    res.status(500).json({ error: "AI returned malformed JSON" });
    return;
  }

  // Basic shape validation
  const rawCandidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
  const validCandidates = rawCandidates.filter(
    (c): c is { selectedType: string; content: Record<string, unknown>; rationale?: string } =>
      !!c && typeof c === "object" && !!(c as Record<string, unknown>).selectedType && typeof (c as Record<string, unknown>).content === "object",
  );
  if (validCandidates.length === 0) {
    res.status(500).json({ error: "AI response missing required fields" });
    return;
  }

  // Source verification, per candidate
  const candidates = validCandidates.map(c => ({
    selectedType: c.selectedType,
    content: c.content,
    rationale: typeof c.rationale === "string" ? c.rationale : "",
    verificationResults: verifySourceClaims(c.content, sourceText),
  }));

  const rawRecommendedIndex = typeof parsed.recommendedIndex === "number" ? parsed.recommendedIndex : 0;
  const recommendedIndex = rawRecommendedIndex >= 0 && rawRecommendedIndex < candidates.length ? rawRecommendedIndex : 0;
  const recommendationReason = typeof parsed.recommendationReason === "string" ? parsed.recommendationReason : "";

  const responseMs = Date.now() - start;
  console.log(
    `[exhibit-generate] candidates=${candidates.length} types=${candidates.map(c => c.selectedType).join(",")} recommended=${recommendedIndex} ms=${responseMs}`
  );

  res.json({ candidates, recommendedIndex, recommendationReason });
});

export default router;

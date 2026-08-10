import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "../services/auth.js";
import { aiService, MODEL } from "../services/ai.js";
import { logAiCall } from "../services/aiCache.js";
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

// ── Shared rule text — used by BOTH /exhibit/generate and /exhibit/court-script.
// Deliberately defined once here rather than duplicated in each prompt string,
// so a fix to one applies to both outputs the same way, from the same source
// of truth. Neither endpoint calls the other — they stay independent so the
// court-script tool keeps working even if slide generation is broken (that
// independence is the whole point of the Emergency Fallback button) — but
// the actual rule text and case-context building underneath both is shared.

const STATUS_CLAIM_RULE = `STATUS-CLAIM RULE — this is read/shown on its own, not in the context of the whole video, so it must never assert something as a permanent fact when it was only true at this one moment. Any claim about charged/not-yet-charged, arrested/not-arrested, in-custody/released, guilty/not-guilty, or any other status that can change over the course of events MUST either (a) be explicitly time-qualified ("at this point," "up to this moment," "as of this stop") rather than stated as an absolute, or (b) if a FULL VIDEO TIMELINE / other moments in this same video are visible to you and show this status changing later, get flagged instead of asserted unqualified. Never generate a bare absolute like "NEVER CHARGED" or "NO CHARGES" when the only evidence for it is this one moment — you do not know what happens later unless you can see it, and if you can and it contradicts this moment's framing, that is exactly what the flags are for.`;

const QUOTE_FIDELITY_RULE = `QUOTE-FIDELITY RULE — when characterizing what a named person "said," "claimed," "admitted," or "denied," the paraphrase must preserve the actual TYPE of claim being made, not just its punch. "No records or documentation exist" is a claim about paperwork — it is NOT the same as "they said it never happened," which is a denial of the underlying event. Collapsing a documentation-gap statement into an event-denial statement is a mischaracterization even if it sounds more dramatic. When genuinely uncertain which the source quote means, use the narrower, more literal paraphrase — accurate but less punchy is always preferable to punchier but overstated. Never sacrifice claim-type accuracy for impact.`;

const NAME_CORRECTION_RULE = `NAME-CORRECTION RULE — dictation and hand-typed notes routinely misspell or mishear the same person's name multiple different ways across a case (e.g. "Hernton" / "Herndon" / "DeHurnton" for one officer). Before finalizing, check every name you're about to output against the PARTIES IN THIS CASE list using fuzzy/phonetic matching, not just exact-string matching — near-misses like the example above must be caught. For each name:
- HIGH CONFIDENCE (the raw form is clearly a near-miss for exactly one party — a typo, misheard spelling, or phonetic variant, and no other party it could plausibly be): silently use the party's official spelling from the list in your output text, but ALSO report the change in a "corrections" array so the change is never invisible: {"field": "<where in your output>", "from": "<raw form>", "to": "<corrected form>"}.
- LOW CONFIDENCE OR AMBIGUOUS (could plausibly match more than one party, or doesn't clearly match any): do NOT auto-correct — leave the raw text as given, and instead add an entry to confidence_flags naming the specific ambiguity (e.g. "'Ritchie' does not exactly match any known party — closest match: Officer Richie — please confirm").
Never invent a party who isn't in the list. If no PARTIES block is provided, skip this check entirely (nothing to correct against).`;

const CONTENT_SAFETY_RULE = `CONTENT-SAFETY RULE — this may be read aloud in open court, not shown as a private note. Strip profanity entirely and convert raw emotional venting into composed, factual statements ("I felt dehumanized" is fine; the raw version is not) — this is a hard content rule, not a style preference. If the source material contains crisis-level personal disclosure (self-harm history, suicide attempts, or similar), NEVER include it, paraphrased or otherwise — set skip_recommended true with a skip_reason that flags this needs a human decision, and leave the actual content out of spoken_script entirely rather than including any version of it.`;

interface NameCorrection { field: string; from: string; to: string }

/** Shared by both endpoints — parses the "corrections" array the
 *  NAME_CORRECTION_RULE asks the model to report alongside its output. */
function parseCorrections(raw: unknown): NameCorrection[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c): c is NameCorrection =>
      !!c && typeof c === "object" &&
      typeof (c as Record<string, unknown>).field === "string" &&
      typeof (c as Record<string, unknown>).from === "string" &&
      typeof (c as Record<string, unknown>).to === "string",
  );
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
narrative_reveal: { layout, header, headline:string[], facts:[{icon,text:ClaimField}], pivotQuote:{leadIn,text,highlightedFragment?,source}, ctaLabel, closingParagraph:{text,boldFragment?}, footerCitations }
question_board: { layout, header, headline:string[], leftColumn:{steps:[{icon,label,quote:ClaimField}],questionBox:{prompt,answer}}, rightColumn:{intro,checklist:ClaimField[],closingHighlight}, footerCitations }
split_screen: { layout, header, headline:string[], leftSide:{label,content:ClaimField}, rightSide:{label,content:ClaimField}, takeaway:{text,phrasedAsQuestion}, footerCitations }
timeline: { layout, header, headline:string[], events:[{label,detail:ClaimField,timestamp?}], conclusion:{lines:string[]}, footerCitations }
quote_focus: { layout, header, headline:string[], dominantQuote:{text,source}, context:ClaimField[], implication:{text,phrasedAsQuestion}, footerCitations }
evidence_grid: { layout, header, headline:string[], items:[{icon,label,source}], conclusion:{lines:string[]}, footerCitations }
summary_board: { layout, header, headline:string[], recapPoints:[{exhibitRef,summary}], finalTakeaway:{lines:string[]}, footerCitations }

headline is ALWAYS an array of short bold lines (1-3 short lines that together read as one punchy statement) — for every layout listed above, never a single plain string, even when it's only one line long. The renderer requires the array form and will fail to display the screen otherwise.

Every "icon" field (in findings/facts/steps/items above) MUST be exactly one of these, spelled exactly as shown — never invent or guess a different name, the renderer will fail to display the screen otherwise: mic (a quote/statement), check (confirms/corroborates), x (absence/failure/denial), speech (an admission), scale (a legal standard), camera (no evidence/no cameras), clock (timing), calendar (a prior/dated event), person, document, question, arrow, shield, shieldCheck, comment, play.

ClaimField: { text:string, source:SourceRef|null, classification:"verified_fact"|"observation"|"speculation" }
SourceRef: { origin:"dictation"|"complaint"|"discovery"|"evidence"|"existing_exhibit", ref:string }

SourceRef.ref MUST be a verbatim excerpt from the provided source material — never invented.
Use classification "verified_fact" only for direct citations, "observation" for inferences, "speculation" for unsupported claims.

If a PARTIES IN THIS CASE block is provided, use it to resolve who's who: dictation often refers to people by nickname, role, or description rather than full name. Populate header.actor and any badgeNumber/agency/title fields with the party's real name and details from that block, not the nickname itself, unless the dictation explicitly quotes someone using the nickname.

${STATUS_CLAIM_RULE}

${QUOTE_FIDELITY_RULE}

${NAME_CORRECTION_RULE}

If a FULL VIDEO TIMELINE block is provided below (every moment in this same video, in order), use it only to check this moment's own claims for the STATUS-CLAIM RULE above — do not pull content from other moments into this slide, this slide is still about the one moment you were asked to cover.

Generate 2–3 DISTINCT candidate exhibits for this moment — different exhibit types or angles on the same moment (e.g. one framed as a contradiction, one as an escalation), not near-duplicates of each other. For each candidate, write a one-sentence "rationale" explaining why THIS framing is persuasive for a judge or jury. Then pick the single strongest candidate as the recommendation and explain why it beats the others in one or two sentences — weigh evidence strength, visual clarity, and whether a viewer would grasp the point within five seconds.

RETURN FORMAT — valid JSON only, no preamble:
{
  "candidates": [
    {
      "selectedType": "<one of the 10 exhibit type IDs>",
      "content": { <the complete layout object matching the chosen layout's schema> },
      "rationale": "<one sentence: why this framing is persuasive>",
      "confidence_flags": ["<anything you were not fully certain about — an unclear name, an ambiguous quote, a status claim that might be contradicted later in the video, a number that seems inconsistent. Empty array if none.>"],
      "corrections": [{"field": "<where in your output this was corrected>", "from": "<raw form>", "to": "<corrected form>"}]
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

const COURT_SCRIPT_SYSTEM_PROMPT = `You are a court-reading script generator for HyperLaw. For each moment given (a self-represented litigant's own raw, dictated description of a moment of video evidence, exactly as they said it — repetition, false starts, rambling commentary and all), produce a polished, litigation-ready spoken paragraph meant to be read ALOUD while presenting that moment's clip in court — not shown as text on screen, and NOT the same output as an exhibit slide.

Written in first person, in the litigant's own voice and vocabulary, cleaned up — composed and courtroom-appropriate, not a raw transcript, but still unmistakably the same person talking, not a lawyer's rewrite. Keep every substantive fact and detail they included; do not add facts, claims, or interpretation that wasn't there; do not add legal argument.

${CONTENT_SAFETY_RULE}

${STATUS_CLAIM_RULE}

${QUOTE_FIDELITY_RULE}

${NAME_CORRECTION_RULE}

LENGTH — one paragraph, readable aloud in roughly the time the clip itself takes to play (each moment's own start/end times are given below) — never several times longer than the clip actually runs.

LEGAL CITATIONS ARE OPTIONAL per moment — only reference a statute or case law if the moment directly supports one; do not force a citation onto a moment that's purely factual or scene-setting.

SKIP RECOMMENDATION — many moments in a typical case are pure narrative connective tissue: background, transitions, or reactions with no independent evidentiary content ("nothing really happens here"). Set "skip_recommended": true with a skip_reason whenever a moment doesn't need its own spoken script rather than forcing filler out of it — err toward flagging these, this should fire often, not rarely. When skip_recommended is true, spoken_script may be an empty string.

You have access to every moment in this video below, in order — use the full set only to check each individual moment's own status claims per the STATUS-CLAIM RULE. Still write a script only for the ONE moment each output entry is for; do not pull other moments' content into a script that isn't theirs. Process every moment provided, independently, in the same order given.

Return ONLY valid JSON, no preamble:
{
  "scripts": [
    {
      "id": "<the moment id exactly as given>",
      "spoken_script": "<the polished paragraph, or empty string if skip_recommended is true>",
      "key_quotes_used": [{"speaker": "<must match a name from PARTIES IN THIS CASE if provided, or a role like 'the officer' if the speaker isn't a known party>", "quote": "<verbatim, or clearly marked as a paraphrase>"}],
      "as_of_status_notes": "<string, or null — required whenever the script touches something that could change later in the video (charged/not yet charged, in custody/released, etc.); state the time-scoped fact explicitly>",
      "confidence_flags": ["<same meaning as the slide generator — an unclear name, an uncertain quote, a status conflict, etc. Empty array if none.>"],
      "corrections": [{"field": "<where>", "from": "<raw form>", "to": "<corrected form>"}],
      "skip_recommended": <bool>,
      "skip_reason": "<string, or null>"
    }
  ]
}`;

// ── Shared case-context builders — used by BOTH endpoints, so a fix here
// (like the document-truncation and structuredCase fixes below) applies to
// slides and scripts alike without maintaining two copies. ─────────────────

function buildPartiesAndCourtBlocks(cd: Record<string, unknown>) {
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

  return { partiesBlock, courtBlock };
}

/** structuredCase (Organization Engine output — executive summary, key
 *  facts, claims) is the closest thing to a "case status/charges" field
 *  that actually exists in the data model, but was never included in any
 *  generation prompt before — silently invisible to both slides and
 *  scripts. Included here so status/claim reasoning has real material to
 *  check against, not just one moment's own raw text. */
function buildStructuredCaseBlock(cd: Record<string, unknown>): string | null {
  const sc = cd.structuredCase && typeof cd.structuredCase === "object" ? cd.structuredCase as Record<string, unknown> : null;
  if (!sc) return null;
  const parts: string[] = [];
  if (typeof sc.executiveSummary === "string" && sc.executiveSummary.trim()) {
    parts.push(`Summary: ${sc.executiveSummary.slice(0, 2000)}`);
  }
  if (Array.isArray(sc.keyFacts) && sc.keyFacts.length > 0) {
    parts.push(`Key facts:\n${sc.keyFacts.slice(0, 40).map(f => `- ${String(f)}`).join("\n")}`);
  }
  if (Array.isArray(sc.claims) && sc.claims.length > 0) {
    parts.push(`Claims:\n${sc.claims.slice(0, 40).map(c => `- ${String(c)}`).join("\n")}`);
  }
  return parts.length > 0 ? `CASE SUMMARY / KEY FACTS / CLAIMS (from case organization):\n${parts.join("\n\n")}` : null;
}

/** Uploaded documents (the complaint, discovery, etc.) — was 2000, then
 *  12000, then briefly 60000 to match the storage cap. 60000 was wrong for
 *  THIS function specifically: /exhibit/generate calls it once PER MOMENT,
 *  sequentially (each screen's own AI call), so every extra character here
 *  gets resent and reprocessed on every single one of those calls — with
 *  ~17+ moments in a batch, that's 17x the latency cost of raising it here,
 *  unlike a one-shot endpoint. Settled on a middle ground: real gain over
 *  the original 12000 for source verification, without the multiplied
 *  slowdown 60000 caused on a real batch tonight. */
function buildDocumentBlocks(docs: Array<{ text: string | null; fileName: string | null }>): string[] {
  return docs.map((d, i) =>
    `UPLOADED DOCUMENT ${i + 1} (${d.fileName ?? "file"}): ${(d.text ?? "").slice(0, 20000)}`
  );
}

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

  // Case context — was completely absent before (this endpoint only ever
  // saw raw moment text, no parties, no case story, no documents), so the
  // known-entities/name-correction and status-scoping rules above had
  // nothing real to check against. Same builders /exhibit/generate uses.
  const docs = await db
    .select({ text: uploadedDocumentsTable.extractedText, fileName: uploadedDocumentsTable.fileName })
    .from(uploadedDocumentsTable)
    .where(and(
      eq(uploadedDocumentsTable.caseId, caseId),
      eq(uploadedDocumentsTable.userId, userId),
    ));

  const cd = (caseRow.caseData ?? {}) as Record<string, unknown>;
  const { partiesBlock, courtBlock } = buildPartiesAndCourtBlocks(cd);

  const caseContext = [
    partiesBlock,
    courtBlock,
    typeof cd.story === "string" && cd.story.trim() ? `CASE STORY: ${cd.story.slice(0, 6000)}` : null,
    buildStructuredCaseBlock(cd),
    ...buildDocumentBlocks(docs),
  ].filter(Boolean).join("\n\n");

  const momentsBlock = moments
    .map(m => `MOMENT ${m.id} (${fmtMMSS(m.start)}–${fmtMMSS(m.end)}):\n${m.label}`)
    .join("\n\n---\n\n");

  const userMessage = `${momentsBlock}\n\nCASE CONTEXT:\n${caseContext || "(none provided)"}`;

  const start = Date.now();
  let response: Awaited<ReturnType<typeof aiService.createMessage>>;
  try {
    response = await aiService.createMessage({
      model: MODEL,
      max_tokens: 8000,
      system: COURT_SCRIPT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (err) {
    // Previously unguarded — a thrown error here (rate limit, overloaded,
    // bad API key) skipped straight to Express's default HTML error page,
    // which aiFetch on the client can't parse as JSON, so every failure
    // surfaced as a generic "Request failed" with no real cause visible.
    const status = (err as { status?: number }).status;
    console.error(`[exhibit-court-script] AI call failed status=${status ?? "?"}`, err);
    res.status(status && status < 500 ? status : 502).json({ error: (err as Error).message || "AI request failed" });
    return;
  }

  {
    const { estimatedCostMicroUsd, cacheHit } = aiService.estimateCallCost(response.usage);
    void logAiCall({
      userId,
      caseId,
      feature: "court_script",
      model: MODEL,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      estimatedCostMicroUsd,
      responseTimeMs: Date.now() - start,
      cacheHit,
    });
  }

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
  const scripts = rawScripts
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object" && typeof s.id === "string")
    .map(s => ({
      id: s.id as string,
      spokenScript: typeof s.spoken_script === "string" ? s.spoken_script : "",
      keyQuotesUsed: Array.isArray(s.key_quotes_used)
        ? s.key_quotes_used.filter(
            (q): q is { speaker: string; quote: string } =>
              !!q && typeof q === "object" && typeof (q as Record<string, unknown>).speaker === "string" && typeof (q as Record<string, unknown>).quote === "string",
          )
        : [],
      asOfStatusNotes: typeof s.as_of_status_notes === "string" ? s.as_of_status_notes : null,
      confidenceFlags: Array.isArray(s.confidence_flags) ? s.confidence_flags.filter((f): f is string => typeof f === "string") : [],
      corrections: parseCorrections(s.corrections),
      skipRecommended: s.skip_recommended === true,
      skipReason: typeof s.skip_reason === "string" ? s.skip_reason : null,
    }));

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
    momentsTimeline = [] as Array<{ timestamp: string; label: string }>,
    forceType,
    userFeedback,
    existingContent,
  } = req.body as {
    caseId: string;
    timestamp: string;
    dictation: string;
    existingExhibits?: string[];
    /** Every moment in this same video, in order — NOT just already-generated
     *  exhibits. Lets the model check this moment's own status claims (charged/
     *  not charged, in custody/released, etc.) against what happens later in
     *  the same video, per the system prompt's STATUS-CLAIM RULE, instead of
     *  asserting something as permanent that was only true at this timestamp. */
    momentsTimeline?: Array<{ timestamp: string; label: string }>;
    forceType?: string;
    /** Free-text note from the user on what to fix, from the "Reiterate"
     *  regenerate-this-one-screen flow — optional, left blank just means
     *  "try again," not "there was something specifically wrong." */
    userFeedback?: string;
    /** The review-and-correct flow's existing screen content — when present
     *  (alongside forceType and userFeedback), the model patches this in
     *  place instead of drafting fresh, and forceType already caps the
     *  response to one candidate instead of 2-3, both of which cut the
     *  usual generation cost for what's meant to be a small fix. */
    existingContent?: Record<string, unknown>;
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
  // past a cutoff. Names and roles are exactly what the AI needs to
  // attribute quotes/actions to the right person, so they can't be left
  // to chance.
  const cd = (caseRow.caseData ?? {}) as Record<string, unknown>;
  const { partiesBlock, courtBlock } = buildPartiesAndCourtBlocks(cd);

  // Full video timeline — see the STATUS-CLAIM RULE in the system prompt.
  // Deliberately every moment, not just ones already turned into exhibits,
  // so a status claim true at this timestamp can be checked against what
  // happens later in the SAME video even before those later moments have
  // their own exhibits generated yet. The client computes this once and
  // sends the same value on every call in a batch, so it belongs in the
  // static block below, not rebuilt fresh with a leading \n\n per-call.
  const timelineBlock = momentsTimeline.length > 0
    ? `FULL VIDEO TIMELINE (every moment in this video, in order — use only to check this moment's own status claims, per the STATUS-CLAIM RULE):\n${momentsTimeline.map(m => `${m.timestamp}: ${m.label}`).join("\n")}`
    : null;

  // STATIC block — identical for every moment generated in the same batch
  // (same case, same parties, same documents, same full timeline). Sent as
  // its own cache_control-marked content block below, so a real batch
  // (15+ sequential calls) is billed full price for this once instead of
  // on every single call — this block alone, once documents/parties/case
  // organization data are included, easily runs tens of thousands of
  // characters. Resending and reprocessing that at full price on every
  // one of 15+ calls is exactly the "highly inefficient" cost driver
  // behind an unexpectedly large API bill tonight.
  const staticBlock = [
    partiesBlock,
    courtBlock,
    typeof cd.story === "string" && cd.story.trim() ? `CASE STORY: ${cd.story.slice(0, 6000)}` : null,
    buildStructuredCaseBlock(cd),
    caseRow.caseData ? `OTHER CASE NOTES: ${JSON.stringify(caseRow.caseData).slice(0, 1500)}` : null,
    ...buildDocumentBlocks(docs),
    timelineBlock,
  ].filter(Boolean).join("\n\n");

  // Used only for local source-verification below (verifySourceClaims) —
  // needs the dictation included, unlike the cached staticBlock sent to
  // the model as a separate content block.
  const sourceTextForVerification = `DICTATION (primary source — timestamp ${timestamp}): ${dictation}\n\n${staticBlock}`;

  // Prior exhibits context — grows with every screen generated so far in
  // this batch, so unlike the rest of the source material it can't be part
  // of the cached static block.
  const priorBlock = existingExhibits.length > 0
    ? `\n\nPRIOR EXHIBIT SUMMARIES (for narrative consistency — avoid repeating these):\n${existingExhibits.map((e, i) => `Exhibit ${i + 1}: ${e}`).join("\n")}`
    : "";

  // Force type hint — when set, the user asked to regenerate with one
  // specific type instead of a fresh multi-candidate set, so ask for exactly
  // one candidate of that type.
  const forceBlock = forceType
    ? `\n\nUSER REQUESTED TYPE: "${forceType}" — generate exactly ONE candidate of this type instead of the usual 2-3, and prefer it if the content supports it.`
    : "";

  // "Reiterate" flow — regenerating one already-existing screen. Blank means
  // just try again with fresh judgment; if filled, it names something
  // specific to fix and takes priority over the model's own first instinct.
  const feedbackBlock = userFeedback && userFeedback.trim()
    ? `\n\nUSER FEEDBACK ON THE PREVIOUS VERSION OF THIS SCREEN: "${userFeedback.trim()}" — address this specifically when generating the new version.`
    : "";

  // "Review and correct" flow — the user answered a specific gap the AI
  // itself flagged (a missing name, an ambiguous claim). Confirmed live
  // tonight that burying this instruction at the end of the message, after
  // the dictation and other blocks, wasn't enough — the model treated it as
  // a fresh drafting task anyway and returned a differently-framed screen,
  // not a corrected version of the same one. Led with it instead, in its
  // own forceful block, and the system prompt is overridden below too so
  // "generate 2-3 distinct candidates" (the default instruction) can't
  // compete with "patch this one field."
  const patchBlock = existingContent
    ? `THIS IS A CORRECTION TO AN EXISTING, ALREADY-APPROVED SCREEN — NOT A NEW DRAFT.

EXISTING SCREEN CONTENT (return this exact JSON, changed only where the correction below requires it — same layout type, same headline, same wording, same icons, same structure, everything unchanged except what the correction actually touches):
${JSON.stringify(existingContent)}

THE CORRECTION TO APPLY: "${(userFeedback ?? "").trim()}"

Do not reframe, redesign, or draft a new angle on this moment. Return exactly ONE candidate: the existing content above with the minimal edit applied.

`
    : "";

  // Per-moment dynamic content only — the shared case context lives in its
  // own cached content block instead (see the call below), not inlined
  // here, so this stays small on every call regardless of how much
  // document/party/case-organization context the case has.
  const dynamicBlock = `${patchBlock}VIDEO TIMESTAMP: ${timestamp}

USER DICTATION:
${dictation}
${priorBlock}${forceBlock}${feedbackBlock}`;

  // Patch mode overrides the base prompt's "generate 2-3 distinct
  // candidates" instruction (EXHIBIT_SYSTEM_PROMPT line ~157) — without
  // this, that instruction was competing with the correction request and
  // winning, producing a re-drafted screen instead of a corrected one.
  const systemPrompt = existingContent
    ? `${EXHIBIT_SYSTEM_PROMPT}\n\nCORRECTION MODE — OVERRIDES THE ABOVE: ignore the "generate 2-3 distinct candidates" instruction. The user is not asking for a new screen; they are correcting one specific detail on an existing, already-approved one. Return exactly ONE candidate whose content is the existing JSON given in the user message, unchanged except for the minimal edit the stated correction requires.`
    : EXHIBIT_SYSTEM_PROMPT;

  // Claude call — system prompt and the static case-context block are each
  // their own cache_control-marked content block. Within one Generate
  // Screens batch (15+ sequential calls, same case, same documents, same
  // parties, same timeline every time), the first call pays full price to
  // write the cache; every call after that for the next 5 minutes reads it
  // back at a fraction of the cost instead of reprocessing the same tens
  // of thousands of characters from scratch on every single moment.
  const start = Date.now();
  let response: Awaited<ReturnType<typeof aiService.createMessage>>;
  try {
    response = await aiService.createMessage({
      model: MODEL,
      max_tokens: 8000,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        content: [
          { type: "text", text: `SOURCE MATERIAL (case-wide context — parties, court, documents, full video timeline):\n${staticBlock}`, cache_control: { type: "ephemeral" } },
          { type: "text", text: dynamicBlock },
        ],
      }],
    });
  } catch (err) {
    // Previously unguarded — a thrown error here (rate limit, overloaded,
    // bad API key) skipped straight to Express's default HTML error page,
    // which aiFetch on the client can't parse as JSON, so batch-generating
    // screens for every moment failed near-instantly with a generic
    // "Request failed" instead of showing what actually went wrong.
    const status = (err as { status?: number }).status;
    console.error(`[exhibit-generate] AI call failed status=${status ?? "?"}`, err);
    res.status(status && status < 500 ? status : 502).json({ error: (err as Error).message || "AI request failed" });
    return;
  }

  // Was never logged anywhere — every other AI feature in this app logs to
  // aiLogsTable (visible in the admin AI cost dashboard), but this route
  // reached the client directly and skipped it entirely. That's exactly
  // why screen generation never showed up next to "case memory" and
  // everything else in the admin panel.
  {
    const { estimatedCostMicroUsd, cacheHit } = aiService.estimateCallCost(response.usage);
    void logAiCall({
      userId,
      caseId,
      feature: "exhibit_screen",
      model: MODEL,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      estimatedCostMicroUsd,
      responseTimeMs: Date.now() - start,
      cacheHit,
    });
  }

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
    (c): c is { selectedType: string; content: Record<string, unknown>; rationale?: string; confidence_flags?: unknown; corrections?: unknown } =>
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
    verificationResults: verifySourceClaims(c.content, sourceTextForVerification),
    confidenceFlags: Array.isArray(c.confidence_flags) ? c.confidence_flags.filter((f): f is string => typeof f === "string") : [],
    corrections: parseCorrections(c.corrections),
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

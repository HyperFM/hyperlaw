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

RETURN FORMAT — valid JSON only, no preamble:
{
  "selectedType": "<one of the 10 exhibit type IDs>",
  "content": { <the complete layout object matching the chosen layout's schema> },
  "alternativeLayouts": ["<up to 3 other suitable exhibit type IDs>"]
}`;

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

  // Build source material
  const sourceText = [
    `DICTATION (primary source — timestamp ${timestamp}): ${dictation}`,
    caseRow.caseData ? `CASE NOTES: ${JSON.stringify(caseRow.caseData).slice(0, 1500)}` : null,
    ...docs.map((d, i) =>
      `UPLOADED DOCUMENT ${i + 1} (${d.fileName ?? "file"}): ${(d.text ?? "").slice(0, 2000)}`
    ),
  ].filter(Boolean).join("\n\n");

  // Prior exhibits context
  const priorBlock = existingExhibits.length > 0
    ? `\n\nPRIOR EXHIBIT SUMMARIES (for narrative consistency — avoid repeating these):\n${existingExhibits.map((e, i) => `Exhibit ${i + 1}: ${e}`).join("\n")}`
    : "";

  // Force type hint
  const forceBlock = forceType
    ? `\n\nUSER REQUESTED TYPE: "${forceType}" — prefer this exhibit type if the content supports it.`
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
    max_tokens: 4000,
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
  if (!parsed.selectedType || !parsed.content || typeof parsed.content !== "object") {
    res.status(500).json({ error: "AI response missing required fields" });
    return;
  }

  // Source verification
  const verificationResults = verifySourceClaims(
    parsed.content as Record<string, unknown>,
    sourceText,
  );

  const responseMs = Date.now() - start;
  console.log(
    `[exhibit-generate] selectedType=${parsed.selectedType} layout=${(parsed.content as Record<string, unknown>).layout} verified=${verificationResults.filter(r => r.supported).length}/${verificationResults.length} ms=${responseMs}`
  );

  res.json({
    selectedType: parsed.selectedType,
    content: parsed.content,
    alternativeLayouts: Array.isArray(parsed.alternativeLayouts) ? parsed.alternativeLayouts : [],
    verificationResults,
  });
});

export default router;

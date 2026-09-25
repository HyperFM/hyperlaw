// ── Hearing Script generation + staleness detection ──────────────────────────
// See lib/db/src/schema/index.ts's hearingScripts/hearingScriptSections tables
// for why this is its own real per-row pair instead of a jsonb blob like most
// other "structured" AI features in this app.

import {
  db,
  casesTable,
  generatedDocumentsTable,
  uploadedDocumentsTable,
  hearingScripts,
  hearingScriptSections,
  notificationsTable,
} from "@workspace/db";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { aiService, MODEL } from "./ai.js";
import { logAiCall, type AiFeature } from "./aiCache.js";
import { buildPartiesAndCourtBlocks, buildStructuredCaseBlock, buildDocumentBlocks } from "../routes/exhibit.js";

const HEARING_SCRIPT_SYSTEM_PROMPT = `You help a self-represented (pro se) litigant prepare a spoken script for a specific court hearing.

Return ONLY a JSON object of the shape: {"sections": [{"heading": string, "body": string, "trigger_type": "opening"|"responsive"|"closing"|"conditional", "condition_note": string|null}]}

Rules:
- "body" is what the person will actually SAY OUT LOUD, standing at a podium — plain spoken language, not legal-memo prose. Short sentences. No citations recited verbatim unless truly necessary.
- Order sections the way a hearing actually unfolds: an "opening" statement first, then "responsive" sections addressing specific issues/motions, a "closing" section last.
- Use "conditional" for a section that should ONLY be said if something specific happens (the judge raises an issue, opposing counsel argues a point) — put that trigger in "condition_note" as plain English (not logic), e.g. "Only if the judge questions finality of the criminal judgment."
- Base every section on the actual case material provided below — do not invent facts, dates, or legal arguments that aren't supported by it.
- ONE THING PER HEARING. The whole script should focus on the single, simplest thing this hearing is actually about. Do not let other issues pile on top of it. If the person has other problems with the case, do not argue them here: include a short "conditional" section they can say if another issue comes up, along the lines of "Your Honor, I'd like to raise that separately — I'll file a motion so it can be heard properly." More can always be handled later.
- Include a closing line that asks for the hearing to be on the record, and (only if something is still unresolved) asks the judge to state what happens next and by when, so the person leaves with a clear next step. Suggest requesting a copy of the order or the record afterward if needed.
- If prior sections from an earlier version of this same script are provided, treat the new source material as authoritative for anything that changed (e.g. a new filing) and note in the relevant section's body if something needs to be said differently because of it.`;

interface PriorSection {
  heading: string;
  body: string;
  triggerType: string;
  conditionNote: string | null;
}

export async function generateHearingScript(params: {
  caseId: string;
  userId: string;
  hearingDate: Date | null;
  court: string | null;
  division: string | null;
  judge: string | null;
  sourceGeneratedDocIds: string[];
  sourceUploadedDocIds: string[];
  priorSections?: PriorSection[];
}): Promise<{
  sections: Array<{ heading: string; body: string; triggerType: string; conditionNote: string | null }>;
}> {
  const { caseId, userId } = params;

  const [caseRow] = await db
    .select()
    .from(casesTable)
    .where(and(eq(casesTable.id, caseId), eq(casesTable.userId, userId)));
  if (!caseRow) throw new Error("Case not found");

  const cd = (caseRow.caseData ?? {}) as Record<string, unknown>;
  const { partiesBlock, courtBlock } = buildPartiesAndCourtBlocks(cd);

  // Real source-document TEXT, fetched directly — caseData.caseMemory alone
  // would silently drop an uploaded filing's actual content, since nothing
  // folds upload text into caseMemory today. Mirrors /exhibit/court-script.
  const genDocs = params.sourceGeneratedDocIds.length > 0
    ? await db.select({ text: generatedDocumentsTable.content, fileName: generatedDocumentsTable.title })
        .from(generatedDocumentsTable)
        .where(and(
          eq(generatedDocumentsTable.userId, userId),
          eq(generatedDocumentsTable.caseId, caseId),
          inArray(generatedDocumentsTable.id, params.sourceGeneratedDocIds),
        ))
    : [];
  const uploadedDocs = params.sourceUploadedDocIds.length > 0
    ? await db.select({ text: uploadedDocumentsTable.extractedText, fileName: uploadedDocumentsTable.fileName })
        .from(uploadedDocumentsTable)
        .where(and(
          eq(uploadedDocumentsTable.userId, userId),
          eq(uploadedDocumentsTable.caseId, caseId),
          inArray(uploadedDocumentsTable.id, params.sourceUploadedDocIds),
        ))
    : [];

  const hearingBlock = `HEARING: ${[
    params.hearingDate ? params.hearingDate.toDateString() : null,
    params.court,
    params.division ? `${params.division} division` : null,
    params.judge ? `Judge ${params.judge}` : null,
  ].filter(Boolean).join(", ") || "(date/court not yet set)"}`;

  const priorScriptBlock = params.priorSections && params.priorSections.length > 0
    ? `PRIOR VERSION OF THIS SCRIPT (regenerate accounting for what's changed in the source material above):\n${
        params.priorSections.map(s => `[${s.triggerType}] ${s.heading}\n${s.body}`).join("\n\n")
      }`
    : null;

  const caseContext = [
    hearingBlock,
    partiesBlock,
    courtBlock,
    typeof cd.story === "string" && cd.story.trim() ? `CASE STORY: ${cd.story.slice(0, 6000)}` : null,
    buildStructuredCaseBlock(cd),
    ...buildDocumentBlocks(genDocs),
    ...buildDocumentBlocks(uploadedDocs),
    priorScriptBlock,
  ].filter(Boolean).join("\n\n");

  const start = Date.now();
  let response: Awaited<ReturnType<typeof aiService.createMessage>>;
  try {
    response = await aiService.createMessage({
      model: MODEL,
      max_tokens: 8000,
      system: HEARING_SCRIPT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: caseContext || "(no case material provided)" }],
    }, { timeoutMs: 120_000 });
  } catch (err) {
    console.error("[hearingScript] AI call failed", err);
    throw new Error((err as Error).message || "AI request failed");
  }

  {
    const { estimatedCostMicroUsd, cacheHit } = aiService.estimateCallCost(response.usage);
    void logAiCall({
      userId,
      caseId,
      feature: "hearing_script" as AiFeature,
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
  if (!jsonMatch) throw new Error("AI did not return valid JSON");

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch {
    throw new Error("AI returned malformed JSON");
  }

  const rawSections = Array.isArray(parsed.sections) ? parsed.sections : [];
  const VALID_TRIGGERS = new Set(["opening", "responsive", "closing", "conditional"]);
  const sections = rawSections
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object" && typeof s.heading === "string" && typeof s.body === "string")
    .map(s => ({
      heading: s.heading as string,
      body: s.body as string,
      triggerType: typeof s.trigger_type === "string" && VALID_TRIGGERS.has(s.trigger_type) ? s.trigger_type : "opening",
      conditionNote: typeof s.condition_note === "string" && s.condition_note.trim() ? s.condition_note : null,
    }));

  if (sections.length === 0) throw new Error("AI response missing required fields");

  return { sections };
}

/** Called after a new generated/uploaded document lands for a case. Flags any
 *  'ready' hearing script for that case as possibly stale — 'delivered'
 *  scripts are for hearings already over, not stale, so excluded. Dedup is
 *  keyed by scriptId (not just caseId) since a case can have multiple
 *  independent upcoming hearings. */
export async function checkHearingScriptStaleness(caseId: string, newDocCreatedAt: Date): Promise<void> {
  const readyScripts = await db
    .select({ id: hearingScripts.id, userId: hearingScripts.userId, title: hearingScripts.title, lastGeneratedAt: hearingScripts.lastGeneratedAt })
    .from(hearingScripts)
    .where(and(eq(hearingScripts.caseId, caseId), eq(hearingScripts.status, "ready")));

  for (const script of readyScripts) {
    if (script.lastGeneratedAt && newDocCreatedAt <= script.lastGeneratedAt) continue;

    const [existing] = await db
      .select({ id: notificationsTable.id })
      .from(notificationsTable)
      .where(and(
        eq(notificationsTable.userId, script.userId),
        eq(notificationsTable.type, "hearing_script_stale"),
        sql`${notificationsTable.metadata}->>'scriptId' = ${script.id}`,
        script.lastGeneratedAt ? gte(notificationsTable.createdAt, script.lastGeneratedAt) : sql`true`,
      ));
    if (existing) continue;

    await db.insert(notificationsTable).values({
      userId: script.userId,
      title: "New filing may affect your hearing script",
      body: `A new document was added to this case since you marked "${script.title}" ready — want to review it before the hearing?`,
      type: "hearing_script_stale",
      metadata: { caseId, scriptId: script.id },
    });
  }
}

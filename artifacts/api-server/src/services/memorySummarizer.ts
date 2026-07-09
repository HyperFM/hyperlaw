/**
 * memorySummarizer — lightweight service that:
 *  1. Writes a case_history row after any significant AI action
 *     (document generated, guidance session completed, document analysis).
 *  2. Triggers an async rolling-summary update via Claude so subsequent
 *     AI calls always have a compact, current context block.
 *
 * All functions are fire-and-forget (never throw to callers).
 */
import Anthropic from "@anthropic-ai/sdk";
import { db, caseHistory, memorySummaries } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// ── Rolling summary ────────────────────────────────────────────────────────────

async function updateRollingSummary(caseId: string, newItemDescription: string): Promise<void> {
  const [existing] = await db
    .select()
    .from(memorySummaries)
    .where(and(eq(memorySummaries.caseId, caseId), eq(memorySummaries.summaryType, "rolling_case_summary")));

  const currentSummary = existing?.content ?? "";

  const userContent = currentSummary
    ? `Fold this new development into the existing summary. Output ONLY the updated summary — same length or shorter, never longer. Preserve: what happened, who is involved, key dates, current claims/damages, how prior issues were handled, what is still open. Drop resolved procedural noise.\n\nEXISTING SUMMARY:\n${currentSummary}\n\nNEW DEVELOPMENT:\n${newItemDescription}`
    : `Create a compact initial case summary from this first recorded item. Keep it under 200 words. Cover: what happened, parties involved, key dates, claims/damages, what is open.\n\nITEM:\n${newItemDescription}`;

  const response = await anthropic.messages.create({
    model: "claude-3-5-haiku-20241022",
    max_tokens: 400,
    system:
      "You maintain compact, rolling legal case summaries for a litigation-support app. Be concise and factual. Output only the summary text — no preamble, no commentary.",
    messages: [{ role: "user", content: userContent }],
  });

  // claude-sonnet family may lead with a thinking block — find first text block
  const textBlock = response.content.find(b => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return;

  const updatedContent = textBlock.text.trim();
  const tokenCount = Math.ceil(updatedContent.length / 4);

  if (existing) {
    await db
      .update(memorySummaries)
      .set({ content: updatedContent, tokenCount, updatedAt: new Date() })
      .where(and(eq(memorySummaries.caseId, caseId), eq(memorySummaries.summaryType, "rolling_case_summary")));
  } else {
    await db.insert(memorySummaries).values({
      caseId,
      summaryType: "rolling_case_summary",
      content: updatedContent,
      tokenCount,
    });
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export type HistoryItemType =
  | "document_generated"
  | "document_uploaded"
  | "guidance_session"
  | "analysis";

/**
 * Write a case_history row and trigger a rolling-summary update.
 * Never throws — errors are logged and swallowed.
 */
export async function recordCaseEvent(params: {
  caseId: string;
  itemType: HistoryItemType;
  title: string;
  contentRef?: string;
  shortSummary: string;
}): Promise<void> {
  try {
    await db.insert(caseHistory).values({
      caseId: params.caseId,
      itemType: params.itemType,
      title: params.title,
      contentRef: params.contentRef ?? null,
      shortSummary: params.shortSummary,
    });
    // Async — don't await so we don't delay the HTTP response
    updateRollingSummary(
      params.caseId,
      `${params.itemType}: ${params.title} — ${params.shortSummary}`,
    ).catch(err =>
      console.warn(`[memorySummarizer] rolling summary update failed (case ${params.caseId}):`, (err as Error).message),
    );
  } catch (err) {
    console.warn(`[memorySummarizer] recordCaseEvent failed (case ${params.caseId}):`, (err as Error).message);
  }
}

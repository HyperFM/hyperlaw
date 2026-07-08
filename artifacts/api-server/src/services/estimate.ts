// ── Credit estimation ─────────────────────────────────────────────────────────
// Predicts the credit cost of a billable AI action from expected output size, so
// the UI can show "Estimated Cost: ~N credits" and the server can enforce it as a
// hard spend cap (we never charge above the shown estimate).

import { creditsForWords, WORDS_PER_CREDIT } from "./credits.js";

/** Expected output length (words) per document type — used only for estimation. */
const DOC_EXPECTED_WORDS: Record<string, number> = {
  complaint: 3200,
  motion: 2400,
  motion_summary_judgment: 3200,
  motion_compel_discovery: 2200,
  motion_dismiss: 2600,
  opposition: 2600,
  defense_response: 2600,
  answer: 1600,
  declaration: 1000,
  demand_letter: 1100,
  discovery: 1600,
  strengthen: 2800,
  timeline: 800,
  judgment_summary: 1000,
  fee_waiver: 1400,
};

const DEFAULT_DOC_WORDS = 2400;

export interface CreditEstimate {
  /** Credits shown to the user AND enforced as the hard spend cap. */
  estimatedCredits: number;
  /** Expected output size that drove the estimate. */
  expectedWords: number;
  /** Plain-language explanation for the confirm prompt. */
  note: string;
}

/** Estimate credits for drafting a given document type. */
export function estimateForDocument(documentType: string): CreditEstimate {
  const expectedWords = DOC_EXPECTED_WORDS[documentType] ?? DEFAULT_DOC_WORDS;
  const estimatedCredits = Math.max(1, creditsForWords(expectedWords));
  const plural = estimatedCredits === 1 ? "" : "s";
  return {
    estimatedCredits,
    expectedWords,
    note: `This draft is expected to run about ${expectedWords.toLocaleString()} words (~${estimatedCredits} credit${plural} at ${WORDS_PER_CREDIT.toLocaleString()} words each). You're only charged for what's actually generated — never more than this estimate.`,
  };
}

/** Estimate credits for a guidance session (charged by conversation length). */
export function estimateForGuidance(): CreditEstimate {
  // A typical short session runs ~2,000–4,000 words of back-and-forth. We cap at
  // 2 credits up front and pause to ask before charging beyond that.
  const estimatedCredits = 2;
  return {
    estimatedCredits,
    expectedWords: estimatedCredits * WORDS_PER_CREDIT,
    note: `A guidance session usually costs about 1–2 credits, based on how long the conversation runs. We'll pause and ask before charging more than ${estimatedCredits} credits, and you're only charged after it finishes.`,
  };
}

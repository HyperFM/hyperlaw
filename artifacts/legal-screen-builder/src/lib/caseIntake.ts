import type { HLCase } from "../types";
import { aiApi } from "./aiApi";
import { api } from "./api";
import { mergeFactsIntoCase, type ConfirmedFacts } from "./caseMerge";
import { caseSourceKey } from "./caseSourceKey";

/**
 * The free intake chat finished: fold what the person confirmed into the case, build the Index right away
 * (no waiting for the background refresh), and mark the free intake as used. Returns the finished case so the
 * caller can take the person to their Index. Shared by the new-case screen and the case page.
 */
export async function runIntakeCompletion(hlCase: HLCase, facts: ConfirmedFacts, onUpdateCase: (c: HLCase) => void): Promise<HLCase> {
  const updated = mergeFactsIntoCase(hlCase, facts);
  onUpdateCase(updated);
  let final = updated;
  try {
    const structured = await aiApi.organizeCase({ hlCase: updated as Parameters<typeof aiApi.organizeCase>[0]["hlCase"], caseId: hlCase.id });
    const full = { ...structured, organizedAt: Date.now(), sourceKey: caseSourceKey(updated) };
    final = { ...updated, structuredCase: full, structuredCaseGeneratedAt: Date.now() };
    onUpdateCase(final);
    api.cases.saveStructured(hlCase.id, full as unknown as Record<string, unknown>).catch(() => {});
  } catch {
    // The Index will build itself in the background; the confirmed details are already saved.
  }
  void aiApi.intakeFinish().catch(() => {});
  return final;
}

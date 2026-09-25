/**
 * AI Cache & Logging Service
 *
 * Responsibilities:
 * 1. Check / set the ai_analysis_cache table before/after Claude calls
 * 2. Log every AI call (and cache hit) to ai_logs
 * 3. Compute cache keys from content hashes
 */

import { createHash } from "crypto";
import { db, aiLogsTable, aiAnalysisCacheTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { rateFor } from "./aiRates.js";
import { chargeForCall } from "./billing.js";

export type AiFeature =
  | "analyze_incident"
  | "analyze_incident_v2"
  | "analyze_case"
  | "analyze_case_v2"
  | "chat"
  | "timeline"
  | "assembly"
  | "learning"
  | "extract_document"
  | "ocr_image"
  | "generate_document"
  | "analyze_document_intake"
  | "build_case_memory"
  | "builder_extract"
  | "jurisdiction_verify"
  | "organize_case"
  | "organize_video_chunks"
  | "gap_detect"
  | "procedural_info"
  | "ifp_find_form"
  | "find_courthouse"
  | "defense_analyze"
  | "draft_decision"
  | "guidance_session"
  | "estimate"
  | "exhibit_screen"
  | "court_script"
  | "hearing_script"
  | "tutor_help"
  | "transcript_match_moments"
  | "transcript_find_moments"
  | "exhibit_analyze_photos"
  | "transcript_audio"
  | "intake_chat"
  | "case_chat"
  | "voir_dire";

// ── Cache key ─────────────────────────────────────────────────────────────────

/** Deterministic hash of (feature, content) — cache is user-scoped so userId is separate */
export function computeCacheKey(feature: AiFeature, content: unknown): string {
  const str = `${feature}:${JSON.stringify(content)}`;
  return createHash("sha256").update(str).digest("hex").slice(0, 32);
}

// ── Cache read / write ────────────────────────────────────────────────────────

export async function getFromCache(
  userId: string,
  cacheKey: string,
): Promise<{ result: unknown; createdAt: Date } | null> {
  try {
    const rows = await db
      .select()
      .from(aiAnalysisCacheTable)
      .where(
        and(
          eq(aiAnalysisCacheTable.userId, userId),
          eq(aiAnalysisCacheTable.cacheKey, cacheKey),
        ),
      )
      .limit(1);
    if (!rows.length) return null;

    // Fire-and-forget lastUsedAt update
    void db
      .update(aiAnalysisCacheTable)
      .set({ lastUsedAt: new Date() })
      .where(eq(aiAnalysisCacheTable.id, rows[0].id))
      .catch(() => undefined);

    return { result: rows[0].result, createdAt: rows[0].createdAt };
  } catch {
    return null;
  }
}

export async function setCache(
  userId: string,
  cacheKey: string,
  feature: AiFeature,
  result: unknown,
): Promise<void> {
  try {
    await db.insert(aiAnalysisCacheTable).values({
      userId,
      cacheKey,
      feature,
      result: result as Record<string, unknown>,
    });
  } catch {
    // If a duplicate exists (race), ignore — the existing cached value is correct
  }
}

// ── Call logging ──────────────────────────────────────────────────────────────

export interface LogCallParams {
  userId: string;
  caseId?: string | null;
  sessionId?: string | null;
  feature: AiFeature;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostMicroUsd: number;
  responseTimeMs: number;
  cacheHit: boolean;
  promptTemplate?: string;
  creditsCharged?: number;
  /** Rate (USD/MTok) the cost was computed at; stored so rate changes never rewrite history. */
  rateInputUsdPerMtok?: number;
  rateOutputUsdPerMtok?: number;
}

export async function logAiCall(params: LogCallParams): Promise<void> {
  const rate = params.cacheHit ? null : rateFor(params.model);
  // Cost-based charging: a real call is charged here, once, when billing is on (services/billing.ts).
  const charged = params.cacheHit ? 0 : await chargeForCall(params.userId, params.estimatedCostMicroUsd, params.feature);
  const base = {
    userId: params.userId,
    caseId: params.caseId ?? null,
    sessionId: params.sessionId ?? null,
    feature: params.feature,
    model: params.model,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    estimatedCostMicroUsd: params.estimatedCostMicroUsd,
    responseTimeMs: params.responseTimeMs,
    cacheHit: params.cacheHit,
    promptTemplate: params.promptTemplate ?? null,
    creditsCharged: charged || (params.creditsCharged ?? 0),
  };
  try {
    await db.insert(aiLogsTable).values({
      ...base,
      rateInputUsdPerMtok: params.rateInputUsdPerMtok ?? rate?.inputUsdPerMtok ?? null,
      rateOutputUsdPerMtok: params.rateOutputUsdPerMtok ?? rate?.outputUsdPerMtok ?? null,
    });
  } catch {
    // The rate columns only exist after phase05_metering.sql has been run. Never lose the cost row over that.
    try { await db.insert(aiLogsTable).values(base); } catch { /* logging must never break the main flow */ }
  }
}

// ── Legacy per-handler daily check ────────────────────────────────────────────
// Phase 0.5: a user's own credit balance is their spending ceiling, so this never blocks any more.
// Owner alerts and the emergency pause live in services/aiSpend.ts (run for every AI route by aiCap.ts).
// Kept as a stub so the existing call sites in routes/ai.ts keep compiling.
export async function checkDailyLimit(_userId: string): Promise<{ allowed: boolean; count: number; limit: number }> {
  return { allowed: true, count: 0, limit: 0 };
}

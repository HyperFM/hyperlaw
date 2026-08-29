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
  | "tutor_help"
  | "transcript_match_moments"
  | "transcript_find_moments"
  | "exhibit_analyze_photos";

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
}

export async function logAiCall(params: LogCallParams): Promise<void> {
  try {
    await db.insert(aiLogsTable).values({
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
      creditsCharged: params.creditsCharged ?? 0,
    });
  } catch {
    // Logging is never allowed to break the main flow
  }
}

// ── Free-tier daily limit guard ───────────────────────────────────────────────
// Threshold from env var AI_FREE_TIER_DAILY_LIMIT (default: unlimited = 0)

import { sql } from "drizzle-orm";
import { gte } from "drizzle-orm";

export async function checkDailyLimit(userId: string): Promise<{ allowed: boolean; count: number; limit: number }> {
  const limit = parseInt(process.env.AI_FREE_TIER_DAILY_LIMIT ?? "0", 10);
  if (!limit) return { allowed: true, count: 0, limit: 0 }; // 0 = unlimited

  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const rows = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(aiLogsTable)
      .where(
        and(
          eq(aiLogsTable.userId, userId),
          eq(aiLogsTable.cacheHit, false), // only count real Claude calls
          gte(aiLogsTable.createdAt, startOfDay),
        ),
      );

    const count = rows[0]?.count ?? 0;
    return { allowed: count < limit, count, limit };
  } catch {
    return { allowed: true, count: 0, limit }; // fail open
  }
}

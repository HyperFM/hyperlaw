// Real-dollar spend guards (Phase 0.5): a per-user daily backstop and a global
// kill switch. Spend is summed from ai_logs (real provider cost, cache hits are $0).

import { db, aiLogsTable, appSettingsTable } from "@workspace/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { sendOwnerAlert } from "./email.js";
import { logger } from "../lib/logger.js";

function usdEnv(name: string, fallback: number): number {
  const n = parseFloat(process.env[name] ?? "");
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
/** Per-user real provider cost allowed per day. Default $3. */
export const userDailyCapMicroUsd = () => Math.round(usdEnv("AI_USER_DAILY_USD", 3) * 1_000_000);
/** Total provider spend across ALL users (owner included) before AI pauses app-wide. Default $12. */
export const globalDailyCapMicroUsd = () => Math.round(usdEnv("AI_GLOBAL_DAILY_USD", 12) * 1_000_000);

function startOfToday(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function userSpendTodayMicroUsd(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`cast(coalesce(sum(estimated_cost_micro_usd), 0) as bigint)` })
    .from(aiLogsTable)
    .where(and(eq(aiLogsTable.userId, userId), gte(aiLogsTable.createdAt, startOfToday())));
  return Number(row?.total ?? 0);
}

export async function globalSpendTodayMicroUsd(): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`cast(coalesce(sum(estimated_cost_micro_usd), 0) as bigint)` })
    .from(aiLogsTable)
    .where(gte(aiLogsTable.createdAt, startOfToday()));
  return Number(row?.total ?? 0);
}

// ── Kill switch ──────────────────────────────────────────────────────────────
// Persisted in app_settings.ai_paused so it survives restarts; the in-memory
// copy covers the window before that table exists and avoids a DB hit per request.
let pausedMem = false;
let pausedCheckedAt = 0;

export async function isAiPaused(): Promise<boolean> {
  if (Date.now() - pausedCheckedAt < 15_000) return pausedMem;
  try {
    const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "ai_paused"));
    pausedMem = row?.value === "true" || pausedMem;
    if (row && row.value !== "true") pausedMem = false;
  } catch { /* table not created yet — memory copy stands */ }
  pausedCheckedAt = Date.now();
  return pausedMem;
}

export async function setAiPaused(paused: boolean): Promise<void> {
  pausedMem = paused;
  pausedCheckedAt = Date.now();
  try {
    await db
      .insert(appSettingsTable)
      .values({ key: "ai_paused", value: String(paused) })
      .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: String(paused), updatedAt: new Date() } });
  } catch (err) {
    logger.warn({ err }, "could not persist ai_paused (run phase05_metering.sql)");
  }
}

const alertedToday = new Set<string>(); // one owner email per user per day, one for the global switch
function alertOnce(key: string, subject: string, body: string): void {
  const k = `${new Date().toISOString().slice(0, 10)}|${key}`;
  if (alertedToday.has(k)) return;
  alertedToday.add(k);
  void sendOwnerAlert(subject, body).catch((err) => logger.warn({ err }, "owner alert email failed"));
}

export type SpendVerdict = { ok: true } | { ok: false; status: number; code: string; error: string };

/** Run before every model-calling request. Admins skip the per-user backstop but not the global switch. */
export async function checkSpend(userId: string, isAdmin: boolean): Promise<SpendVerdict> {
  if (await isAiPaused()) {
    return { ok: false, status: 503, code: "ai_paused", error: "AI features are paused for a moment. Your work is saved — please try again later." };
  }
  try {
    const globalSpend = await globalSpendTodayMicroUsd();
    if (globalSpend >= globalDailyCapMicroUsd()) {
      await setAiPaused(true);
      alertOnce("global", "HyperLaw AI paused: daily spend ceiling reached",
        `Total provider spend today reached $${(globalSpend / 1e6).toFixed(2)} (ceiling $${(globalDailyCapMicroUsd() / 1e6).toFixed(2)}). AI is paused app-wide until you resume it (POST /api/admin/ai/resume).`);
      return { ok: false, status: 503, code: "ai_paused", error: "AI features are paused for a moment. Your work is saved — please try again later." };
    }
    if (!isAdmin) {
      const spend = await userSpendTodayMicroUsd(userId);
      if (spend >= userDailyCapMicroUsd()) {
        alertOnce(`user:${userId}`, "HyperLaw: a user hit the daily AI backstop",
          `User ${userId} has cost $${(spend / 1e6).toFixed(2)} in provider spend today (cap $${(userDailyCapMicroUsd() / 1e6).toFixed(2)}). Check for a looping bug or abuse.`);
        return { ok: false, status: 429, code: "rate_limited", error: "You've reached today's AI limit. Everything you've done is saved — it resets tomorrow." };
      }
    }
  } catch {
    // fail open on a DB hiccup; the next request re-checks
  }
  return { ok: true };
}

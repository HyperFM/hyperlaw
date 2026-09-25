// Real-dollar spend guards (Phase 0.5), summed from ai_logs (real provider cost, cache hits are $0).
// Normal days are fully passive. Only two things ever email the owner, and only one ever stops anything:
//   - one user hits their tier's daily limit   -> that user is stopped until tomorrow + owner email (free $15, Pro $30, Apex $75)
//   - total spend across everyone passes $60   -> email only, nothing pauses
//   - total spend passes $40                   -> AI pauses app-wide + email, until the owner resumes it

import { db, aiLogsTable, appSettingsTable, stripeProcessedSessionsTable, appleProcessedTransactionsTable } from "@workspace/db";
import { isBillingEnabled } from "./billing.js";
import { and, eq, gte, sql } from "drizzle-orm";
import { sendOwnerAlert } from "./email.js";
import { staleRates } from "./aiRates.js";
import { storage } from "../storage.js";
import { logger } from "../lib/logger.js";

function usdEnv(name: string, fallback: number): number {
  const n = parseFloat(process.env[name] ?? "");
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
/** Real provider cost one user may run per day, by plan. Admins are exempt. Editable in Render. */
export function userDailyLimitMicroUsd(planTier: string | null | undefined): number {
  const usd =
    planTier === "apex" ? usdEnv("AI_USER_LIMIT_APEX_USD", 75)
    : planTier === "prosay" ? usdEnv("AI_USER_LIMIT_PRO_USD", 30)
    : usdEnv("AI_USER_LIMIT_FREE_USD", 5); // free + pay-as-you-go (with billing on, their credit balance is the tighter limit)
  return Math.round(usd * 1_000_000);
}
/** Total provider spend across ALL users (owner included) that triggers an owner email. Default $60. Never blocks. */
/**
 * Members (Pro-Say / Apex) pay a flat monthly price, so their AI cost has to stay under a share of that price, or a
 * heavy user costs more than they pay. Monthly real-cost caps: defaults keep at least ~50% of the price as margin.
 */
export function memberMonthlyCapMicroUsd(planTier: string | null | undefined): number | null {
  if (planTier === "prosay") return Math.round(usdEnv("AI_MEMBER_MONTHLY_PRO_USD", 12) * 1_000_000);   // $25/mo plan
  if (planTier === "apex") return Math.round(usdEnv("AI_MEMBER_MONTHLY_APEX_USD", 60) * 1_000_000);   // $100/mo plan
  return null;
}

function startOfMonth(): Date {
  const d = new Date();
  d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function userSpendMonthMicroUsd(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`cast(coalesce(sum(estimated_cost_micro_usd), 0) as bigint)` })
    .from(aiLogsTable)
    .where(and(eq(aiLogsTable.userId, userId), gte(aiLogsTable.createdAt, startOfMonth())));
  return Number(row?.total ?? 0);
}

export const globalAlertMicroUsd = () => Math.round(usdEnv("AI_GLOBAL_ALERT_USD", 60) * 1_000_000);
/** Total provider spend across ALL users that auto-pauses AI app-wide. Default $150. The one true kill switch. */
export const globalPauseMicroUsd = () => Math.round(usdEnv("AI_GLOBAL_PAUSE_USD", 150) * 1_000_000);

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

// Money in vs money out: once billing is on, an email if this month's real AI cost is heading past what people have paid.
let lastMarginCheck = 0;
async function checkMargin(): Promise<void> {
  if (Date.now() - lastMarginCheck < 30 * 60_000) return;
  lastMarginCheck = Date.now();
  if (!(await isBillingEnabled())) return;
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const [[c], [w], [a]] = await Promise.all([
    db.select({ t: sql<number>`cast(coalesce(sum(estimated_cost_micro_usd), 0) as bigint)` }).from(aiLogsTable).where(gte(aiLogsTable.createdAt, monthStart)),
    db.select({ t: sql<number>`cast(coalesce(sum(credit_amount), 0) as bigint)` }).from(stripeProcessedSessionsTable).where(gte(stripeProcessedSessionsTable.processedAt, monthStart)),
    db.select({ t: sql<number>`cast(coalesce(sum(amount_micro_usd), 0) as bigint)` }).from(appleProcessedTransactionsTable).where(gte(appleProcessedTransactionsTable.processedAt, monthStart)),
  ]);
  const cost = Number(c?.t ?? 0), revenue = Number(w?.t ?? 0) * 50_000 + Number(a?.t ?? 0);
  if (cost > 10_000_000 && cost > revenue * 0.8) {
    alertOnce("margin", "HyperLaw: AI cost is close to (or past) what people have paid this month",
      `This month: real AI cost $${(cost / 1e6).toFixed(2)} vs $${(revenue / 1e6).toFixed(2)} paid by users. Check the spend dashboard for who is using the most.`);
  }
}

export type SpendVerdict = { ok: true } | { ok: false; status: number; code: string; error: string };

/** Run before every model-calling request. Rejects when AI is paused app-wide, or when this user has reached their plan's daily limit. */
export async function checkSpend(userId: string, isAdmin: boolean): Promise<SpendVerdict> {
  const paused: SpendVerdict = { ok: false, status: 503, code: "ai_paused", error: "AI features are paused for a moment. Your work is saved — please try again later." };
  if (await isAiPaused()) return paused;
  void checkMargin().catch(() => {});
  try {
    const globalSpend = await globalSpendTodayMicroUsd();
    if (globalSpend >= globalPauseMicroUsd()) {
      await setAiPaused(true);
      alertOnce("global-pause", "HyperLaw AI PAUSED: emergency spend ceiling reached",
        `Total provider spend today reached $${(globalSpend / 1e6).toFixed(2)} (emergency ceiling $${(globalPauseMicroUsd() / 1e6).toFixed(2)}). AI is paused app-wide. Check the spend dashboard for a loop or runaway bug, then resume with POST /api/admin/ai/resume.`);
      return paused;
    }
    if (globalSpend >= globalAlertMicroUsd()) {
      alertOnce("global-alert", "HyperLaw: total AI spend passed the daily alert",
        `Total provider spend today is $${(globalSpend / 1e6).toFixed(2)} (alert at $${(globalAlertMicroUsd() / 1e6).toFixed(2)}). Nothing is paused. It pauses at $${(globalPauseMicroUsd() / 1e6).toFixed(2)}.`);
    }
    const stale = await staleRates();
    if (stale.length) {
      alertOnce("stale-rates", "HyperLaw: AI prices need a check",
        `These model prices haven't been confirmed in the last 30 days: ${stale.map(r => r.model + (r.daysOld === null ? " (never confirmed)" : ` (${r.daysOld} days)`)).join(", ")}. Compare them with the providers' pricing pages and update the ai_rates table (touch updated_at even if unchanged) so costs stay accurate.`);
    }
    if (!isAdmin) {
      const [spend, user] = await Promise.all([userSpendTodayMicroUsd(userId), storage.getUser(userId)]);
      const memberCap = memberMonthlyCapMicroUsd(user?.planTier);
      if (memberCap !== null) {
        const month = await userSpendMonthMicroUsd(userId);
        if (month >= memberCap) {
          alertOnce(`member:${userId}`, "HyperLaw: a member reached their monthly AI allowance",
            `User ${userId} (${user?.planTier}) has used $${(month / 1e6).toFixed(2)} of real AI cost this month (allowance $${(memberCap / 1e6).toFixed(2)}). They're paused until the 1st.`);
          return { ok: false, status: 429, code: "rate_limited", error: "You've used this month's included AI usage. It resets on the 1st, and everything you've done is saved." };
        }
      }
      const limit = userDailyLimitMicroUsd(user?.planTier);
      if (spend >= limit) {
        alertOnce(`user:${userId}`, "HyperLaw: a user hit their daily AI limit",
          `User ${userId} (${user?.planTier ?? "free"}) reached $${(spend / 1e6).toFixed(2)} of provider spend today (limit $${(limit / 1e6).toFixed(2)}). They're stopped until tomorrow. Check for a looping bug or abuse if this looks wrong.`);
        return { ok: false, status: 429, code: "rate_limited", error: "You've reached today's AI limit. Everything you've done is saved — it resets tomorrow." };
      }
    }
  } catch {
    // fail open on a DB hiccup; the next request re-checks
  }
  return { ok: true };
}

// Billing switch + cost-based credit charging (Phase 0.5).
//
// Billing is OFF until the owner turns it on (Phase 2). While it is off nothing is charged
// and every action is free to the user (the spend guards in aiSpend.ts still watch real cost).
// When it is ON, every real (non-cached) AI call is charged in credits at
//   real provider cost x 1.5 markup / $0.05 per credit
// from services/aiRates.ts. Charging happens in exactly one place — logAiCall — so a call is
// never charged twice; the older flat "1 credit per action" chargers step aside (see credits.ts).

import { storage } from "../storage.js";
import { kvGet, kvSet } from "./kv.js";
import { logger } from "../lib/logger.js";
import { CREDIT_MARKUP, USD_PER_CREDIT } from "./aiRates.js";

let enabledMem: boolean | null = null;
let checkedAt = 0;

export async function isBillingEnabled(): Promise<boolean> {
  if (process.env.BILLING_ENABLED === "true") return true;
  if (enabledMem !== null && Date.now() - checkedAt < 15_000) return enabledMem;
  try {
    const v = await kvGet<boolean>("billing_enabled");
    enabledMem = v === true;
  } catch {
    enabledMem = enabledMem ?? false;
  }
  checkedAt = Date.now();
  return enabledMem;
}

export async function setBillingEnabled(on: boolean): Promise<void> {
  enabledMem = on;
  checkedAt = Date.now();
  await kvSet("billing_enabled", on);
}

/** Never charged: billing off, admins, and members (Pro-Say / Apex — their plan covers usage; the per-user daily limit is their protection). */
export async function isUserWaived(userId: string): Promise<boolean> {
  if (!(await isBillingEnabled())) return true;
  const user = await storage.getUser(userId);
  return !!(user?.isAdmin || user?.planTier === "apex" || user?.planTier === "prosay");
}

// Work in integer 'billed micro-USD' (real cost x markup) so $0.50 is exactly 15 credits with no float drift.
const BILLED_MICRO_PER_CREDIT = Math.round(USD_PER_CREDIT * 1_000_000); // 50,000

/**
 * Charge one AI call. Fractions of a credit are carried per user so a one-cent chat message
 * doesn't cost a whole credit: cost accumulates, whole credits are deducted as they add up.
 * Returns the credits actually deducted (0 when waived, cached, or still under a credit).
 */
// Features that are free to the person by design (their cost is still logged and counted by the spend guards).
const FREE_FEATURES = new Set(['intake_chat']);

export async function chargeForCall(userId: string, costMicroUsd: number, feature?: string): Promise<number> {
  if (costMicroUsd <= 0 || (feature && FREE_FEATURES.has(feature))) return 0;
  try {
    if (await isUserWaived(userId)) return 0;
    const carryKey = `carry:${userId}`;
    const carry = (await kvGet<number>(carryKey)) ?? 0;
    const total = carry + Math.round(costMicroUsd * CREDIT_MARKUP);
    const whole = Math.floor(total / BILLED_MICRO_PER_CREDIT);
    await kvSet(carryKey, total - whole * BILLED_MICRO_PER_CREDIT);
    if (whole <= 0) return 0;
    const balance = await storage.getCreditBalance(userId);
    const take = Math.min(whole, Math.max(0, balance)); // never below zero; the pre-check is what stops overspending
    if (take > 0) await storage.deductCredits(userId, take);
    return take;
  } catch (err) {
    logger.warn({ err }, "credit charge failed");
    return 0;
  }
}

/** Typical credit cost of an action, for the up-front balance check and the "about X credits" estimate.
 *  Starter values from measured/estimated costs — refine from real ai_logs averages once users are on. */
export const TYPICAL_CREDITS: Record<string, number> = {
  exhibit_generate: 15,   // ~$0.50 real cost x1.5 / $0.05
  exhibit_court_script: 15,
  exhibit_analyze_photos: 5,
  hearing_script: 6,
  organize: 3,
  chat: 1,
};

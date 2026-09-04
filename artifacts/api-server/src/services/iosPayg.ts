// ── iOS pay-as-you-go billing helper ──────────────────────────────────────────
// Mirrors services/credits.ts's shape, but for the iOS-only micro-USD balance
// funded by real Apple In-App Purchases (see routes/appleIap.ts). Web/Stripe
// billing (services/credits.ts, usersTable.creditBalance) is untouched by any
// of this — the two balances are entirely separate per platform.

import type { Request } from "express";
import { storage } from "../storage.js";
import { chargeOneCredit, type ChargeResult } from "./credits.js";

/** True when the request came from the iOS app (see src/lib/platform.ts and
 *  the X-Client-Platform header added to apiFetch/aiFetch on the client).
 *  This header only selects which balance to check/deduct — it carries no
 *  dollar amounts and isn't a trust boundary for money. */
export function isIosClient(req: Request): boolean {
  return req.headers["x-client-platform"] === "ios";
}

export interface IosPaygCheck {
  ok: boolean;              // false when the balance is <= 0
  balanceMicroUsd: number;
}

/** Pre-flight check before a billable AI call: the real per-call cost isn't
 *  known until the call returns, so this only confirms the user has *some*
 *  balance left, not that it covers this specific call. */
export async function checkIosPaygBalance(userId: string): Promise<IosPaygCheck> {
  const balanceMicroUsd = await storage.getIosPaygBalance(userId);
  return { ok: balanceMicroUsd > 0, balanceMicroUsd };
}

/** Deduct the real cost of a completed AI call from the iOS PAYG balance.
 *  Unconditional — the cost was already incurred, so this is allowed to take
 *  the balance slightly negative rather than fail after the fact (mirrors the
 *  "honor the cap in the user's favor" philosophy in chargeCredits). */
export async function chargeIosPaygActual(
  userId: string,
  amountMicroUsd: number,
): Promise<{ balanceMicroUsd: number }> {
  const balanceMicroUsd = await storage.deductIosPaygBalance(userId, amountMicroUsd);
  return { balanceMicroUsd };
}

// ── Shared "flat single-unit" charge facade ───────────────────────────────
// For the many routes that simply do: chargeOneCredit → run AI call → log →
// respond, refunding on failure. Wraps the platform branch once so call sites
// don't each hand-roll it. iOS only pre-flight-checks here (no charge yet);
// the real cost is deducted after success via chargeIosPaygActual. On the web
// path this is just chargeOneCredit, unchanged.
export interface UnitChargeOutcome {
  iosClient: boolean;
  ok: boolean; // false ⇒ caller must respond 402 and return
  creditCharge: ChargeResult | null; // web path only — pass to refundOneCredit on failure
  iosBalanceMicroUsd: number | null; // iOS path only
}

export async function chargeOneUnit(req: Request, userId: string): Promise<UnitChargeOutcome> {
  if (isIosClient(req)) {
    const check = await checkIosPaygBalance(userId);
    return { iosClient: true, ok: check.ok, creditCharge: null, iosBalanceMicroUsd: check.balanceMicroUsd };
  }
  const creditCharge = await chargeOneCredit(userId);
  return { iosClient: false, ok: creditCharge.ok, creditCharge, iosBalanceMicroUsd: null };
}

/** 402 response body for a failed chargeOneUnit() — same shape either platform. */
export function insufficientBalanceBody(outcome: UnitChargeOutcome) {
  return {
    error: outcome.iosClient ? "Insufficient balance" : "Insufficient credits",
    code: "insufficient_credits" as const,
    creditBalance: outcome.creditCharge?.balance ?? 0,
    ...(outcome.iosClient ? { iosPaygBalanceMicroUsd: outcome.iosBalanceMicroUsd } : {}),
  };
}

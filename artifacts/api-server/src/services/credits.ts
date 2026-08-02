// ── Credit billing helper ─────────────────────────────────────────────────────
// Centralizes the "admin & Apex are waived, everyone else spends 1 credit" rule
// plus race-safe deduction and refund. Mirrors the inline logic in the legacy
// analyze-document route so new AI features stay consistent.

import { storage } from "../storage.js";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

/** True when the account's isAdmin column is set (granted only through the
 *  gated admin-registration flow in routes/auth.ts) — the same real flag
 *  every other admin-only route checks now, not an email-string match. */
export async function isAdminUser(userId: string): Promise<boolean> {
  const [user] = await db.select({ isAdmin: usersTable.isAdmin }).from(usersTable).where(eq(usersTable.id, userId));
  return user?.isAdmin ?? false;
}

/** True when the user should not be charged credits. Billing is currently disabled — always waived. */
export async function isBillingWaived(_userId: string): Promise<boolean> {
  return true;
}

export interface ChargeResult {
  ok: boolean;            // false only when the user has insufficient credits
  waived: boolean;        // true for admin / Apex (no charge attempted)
  charged: boolean;       // true only when credits were actually deducted (⇒ refundable)
  balance: number;        // remaining balance (‑1 when waived / unknown)
  chargedAmount?: number; // how many credits were actually deducted
}

/**
 * Charge 1 credit unless the user is waived. Race-safe: uses the conditional
 * UPDATE in storage.deductCredit. When ok is false, the caller should return
 * a 402 with code "insufficient_credits".
 */
export async function chargeOneCredit(userId: string): Promise<ChargeResult> {
  const waived = await isBillingWaived(userId);
  if (waived) return { ok: true, waived: true, charged: false, balance: -1 };

  const balance = await storage.getCreditBalance(userId);
  if (balance < 1) return { ok: false, waived: false, charged: false, balance };

  const deducted = await storage.deductCredit(userId);
  if (!deducted) return { ok: false, waived: false, charged: false, balance: 0 };

  return { ok: true, waived: false, charged: true, balance: balance - 1 };
}

/** Refund a previously charged credit (call only when ChargeResult.charged was true). */
export async function refundOneCredit(userId: string): Promise<void> {
  await db.execute(sql`UPDATE users SET credit_balance = credit_balance + 1 WHERE id = ${userId}`);
}

// ── Usage-based multi-credit billing ──────────────────────────────────────────
// 1 credit ≈ 2,000 words of AI output (drafts) or total conversation (guidance),
// rounded up, minimum 1 when any words were produced. Token counts + dollar cost
// are still logged underneath in ai_logs.

export const WORDS_PER_CREDIT = 2000;

/** Convert a word count to whole credits (min 1 when any words were produced). */
export function creditsForWords(words: number): number {
  if (!words || words <= 0) return 0;
  return Math.max(1, Math.ceil(words / WORDS_PER_CREDIT));
}

/** Count whitespace-delimited words in a string. */
export function countWords(text: string | null | undefined): number {
  const t = (text ?? "").trim();
  return t ? t.split(/\s+/).length : 0;
}

export interface EstimateCheck {
  ok: boolean;      // false only when a non-waived user can't cover the estimate
  waived: boolean;  // admin / Apex
  balance: number;  // ‑1 when waived
}

/** Verify a user can cover an up-front estimate before a billable action runs. */
export async function checkBalanceForEstimate(userId: string, estimate: number): Promise<EstimateCheck> {
  const waived = await isBillingWaived(userId);
  if (waived) return { ok: true, waived: true, balance: -1 };
  const balance = await storage.getCreditBalance(userId);
  return { ok: balance >= estimate, waived: false, balance };
}

/**
 * Charge up to `amount` credits (usage-based). Never charges a waived user.
 * Race-safe via storage.deductCredits. If the exact amount can't be covered
 * (concurrent spend), it deducts the remaining balance instead of failing —
 * honoring the spend cap in the user's favor. `chargedAmount` reports the actual
 * deduction; `ok` is true only when the full requested amount was charged.
 */
export async function chargeCredits(userId: string, amount: number): Promise<ChargeResult> {
  const waived = await isBillingWaived(userId);
  if (waived) return { ok: true, waived: true, charged: false, balance: -1, chargedAmount: 0 };
  if (amount <= 0) {
    const bal = await storage.getCreditBalance(userId);
    return { ok: true, waived: false, charged: false, balance: bal, chargedAmount: 0 };
  }

  // Race-safe: if a concurrent spend beats our conditional deduction, re-read the
  // fresh balance and retry. We never charge more than `amount`; if the balance
  // can't cover the full amount we deduct whatever remains (honoring the cap in the
  // user's favor) rather than dropping the charge after the billable work completed.
  for (let attempt = 0; attempt < 5; attempt++) {
    const balance = await storage.getCreditBalance(userId);
    const toCharge = Math.min(amount, balance);
    if (toCharge <= 0) return { ok: false, waived: false, charged: false, balance, chargedAmount: 0 };

    const deducted = await storage.deductCredits(userId, toCharge);
    if (deducted) {
      return {
        ok: toCharge >= amount,
        waived: false,
        charged: true,
        balance: balance - toCharge,
        chargedAmount: toCharge,
      };
    }
    // Lost the race against a concurrent deduction — loop and retry on a fresh balance.
  }

  const fresh = await storage.getCreditBalance(userId);
  return { ok: false, waived: false, charged: false, balance: fresh, chargedAmount: 0 };
}

/** Refund N previously charged credits (call only when credits were actually deducted). */
export async function refundCredits(userId: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  await db.execute(sql`UPDATE users SET credit_balance = credit_balance + ${amount} WHERE id = ${userId}`);
}

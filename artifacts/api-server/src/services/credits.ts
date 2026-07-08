// ── Credit billing helper ─────────────────────────────────────────────────────
// Centralizes the "admin & Apex are waived, everyone else spends 1 credit" rule
// plus race-safe deduction and refund. Mirrors the inline logic in the legacy
// analyze-document route so new AI features stay consistent.

import { storage } from "../storage.js";
import { getClerkUserEmail } from "../routes/feedback.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const ADMIN_EMAILS = new Set(["hyperlawcompliance@gmail.com", "hypermodula@gmail.com"]);

/** True when the user's Clerk email is on the admin allow-list. */
export async function isAdminUser(userId: string): Promise<boolean> {
  const info = await getClerkUserEmail(userId).catch(() => null);
  return ADMIN_EMAILS.has(info?.email ?? "");
}

/** True when the user should not be charged credits (admin account or Apex plan). */
export async function isBillingWaived(userId: string): Promise<boolean> {
  const userInfo = await getClerkUserEmail(userId).catch(() => null);
  if (ADMIN_EMAILS.has(userInfo?.email ?? "")) return true;

  try {
    const customerId = await storage.getStripeCustomerId(userId);
    if (customerId) {
      const { getUncachableStripeClient } = await import("../stripeClient.js");
      const stripe = await getUncachableStripeClient();
      const subs = await stripe.subscriptions.list({
        customer: customerId,
        status: "active",
        limit: 5,
        expand: ["data.items.data.price.product"],
      });
      for (const sub of subs.data) {
        for (const item of sub.items.data) {
          const product = item.price.product as { name?: string };
          if ((product.name ?? "").toLowerCase().includes("apex")) return true;
        }
      }
    }
  } catch {
    /* non-fatal — default to charging */
  }
  return false;
}

export interface ChargeResult {
  ok: boolean;      // false only when the user has insufficient credits
  waived: boolean;  // true for admin / Apex (no charge attempted)
  charged: boolean; // true only when a credit was actually deducted (⇒ refundable)
  balance: number;  // remaining balance (‑1 when waived / unknown)
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

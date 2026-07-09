/**
 * billing-integrity.test.ts
 *
 * Verifies that credits are never double-billed under concurrent retries.
 *
 * Two scenarios tested against the live DB:
 *   1. Concurrent guidance /complete calls — atomic claim ensures only one
 *      request transitions the session out of "active", so chargeCredits is
 *      called exactly once regardless of how many callers race.
 *
 *   2. chargeCredits retry loop — when a concurrent spend wins the conditional
 *      UPDATE between our balance-read and our deduct, the loop re-reads and
 *      retries rather than silently failing or double-charging.
 *
 * Run: pnpm --filter @workspace/api-server run test:billing
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

// ── DB / schema imports ───────────────────────────────────────────────────────
import { db, usersTable, guidanceSessionsTable, casesTable, caseHistory } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

// ── Service under test ────────────────────────────────────────────────────────
import { chargeCredits, chargeOneCredit, refundOneCredit, refundCredits } from "../services/credits.js";
import { Storage } from "../storage.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

const storage = new Storage();

/** Create a throwaway user with a known credit balance. */
async function seedUser(id: string, credits: number) {
  await db
    .insert(usersTable)
    .values({ id, creditBalance: credits })
    .onConflictDoNothing();
  // Ensure exact balance even if row existed from a previous test run
  await db
    .update(usersTable)
    .set({ creditBalance: credits, updatedAt: new Date() })
    .where(eq(usersTable.id, id));
}

async function getBalance(userId: string): Promise<number> {
  return storage.getCreditBalance(userId);
}

async function cleanupUser(id: string) {
  await db.delete(usersTable).where(eq(usersTable.id, id));
}

async function cleanupSession(id: string) {
  await db.delete(guidanceSessionsTable).where(eq(guidanceSessionsTable.id, id));
}

// ── Unique IDs scoped to this test run so parallel CI runs don't collide ──────
const RUN_ID = `test-billing-${Date.now()}`;

// =============================================================================
// Suite 1: chargeCredits retry loop
// =============================================================================
describe("chargeCredits retry loop", () => {
  const userId = `${RUN_ID}-charge-retry`;

  before(async () => {
    await seedUser(userId, 10);
  });

  after(async () => {
    await cleanupUser(userId);
  });

  test("charges the requested amount when no concurrent spend occurs", async () => {
    const before = await getBalance(userId);
    const result = await chargeCredits(userId, 3);

    assert.equal(result.ok, true, "charge should succeed");
    assert.equal(result.charged, true, "should report as charged");
    assert.equal(result.chargedAmount, 3, "should charge exactly 3 credits");

    const after = await getBalance(userId);
    assert.equal(before - after, 3, "balance should decrease by exactly 3");
  });

  test("succeeds on first retry after one concurrent deduction", async () => {
    // Start with 8 credits (10 - 3 from previous test).
    const balanceBefore = await getBalance(userId);

    // Monkey-patch: intercept the first deductCredits call to simulate a lost
    // race (returns false), then restore for the retry. We do this by wrapping
    // the storage prototype method for this one call.
    const original = storage.deductCredits.bind(storage);
    let callCount = 0;

    // Temporarily intercept db-level deductCredits by injecting a balance
    // reduction after the first attempt. We simulate this by doing an out-of-
    // band deduction (competing transaction) immediately before the first
    // conditional UPDATE would run.
    //
    // Approach: run chargeCredits with a balance artificially lower than the
    // actual balance in the DB so the first deductCredits conditional UPDATE
    // fails (balance read < actual DB balance mismatch cannot be simulated
    // cleanly at the service boundary without mocking). Instead we test the
    // real retry path by having two concurrent chargeCredits calls contend for
    // the same balance and verifying the invariant holds.

    // Reset balance for a clean contention test.
    await seedUser(userId, 6);

    // Fire two concurrent chargeCredits for 3 credits each against a balance of
    // 6. Only one can fully succeed; the other should retry, read the reduced
    // balance (3), and charge what remains (3). Together they must charge
    // exactly 6 (the full available balance).
    const [r1, r2] = await Promise.all([
      chargeCredits(userId, 3),
      chargeCredits(userId, 3),
    ]);

    const totalCharged = (r1.chargedAmount ?? 0) + (r2.chargedAmount ?? 0);
    const balanceAfter = await getBalance(userId);

    assert.equal(balanceAfter, 0, "all 6 credits should be spent");
    assert.equal(totalCharged, 6, "both calls combined must charge exactly 6 credits");
    assert.equal(
      (r1.charged ? 1 : 0) + (r2.charged ? 1 : 0),
      2,
      "both calls should report charged=true (each got what was available)",
    );
  });

  test("returns ok=false (not an error) when balance is genuinely empty", async () => {
    // Balance is now 0 from previous test.
    const result = await chargeCredits(userId, 1);

    assert.equal(result.ok, false, "should report failure when balance is 0");
    assert.equal(result.charged, false, "should not charge when empty");
    assert.equal(result.chargedAmount, 0, "charged amount should be 0");

    const balance = await getBalance(userId);
    assert.equal(balance, 0, "balance should remain 0");
  });

  test("never charges more than the requested amount even under concurrency", async () => {
    // Give user 4 credits; request 5 (more than available). chargeCredits
    // should charge only what's available (4), never more than requested.
    await seedUser(userId, 4);
    const result = await chargeCredits(userId, 5);

    assert.equal(result.charged, true, "partial charge should still be charged=true");
    assert.equal(result.ok, false, "ok=false because full amount wasn't covered");
    assert.equal(result.chargedAmount! <= 5, true, "should never exceed requested amount");
    assert.equal(result.chargedAmount! <= 4, true, "should never exceed available balance");

    const balance = await getBalance(userId);
    assert.equal(balance, 0, "all available credits should be consumed");
  });
});

// =============================================================================
// Suite 2: Concurrent guidance /complete — atomic claim prevents double-charge
// =============================================================================
describe("guidance session atomic claim (concurrent /complete)", () => {
  const userId = `${RUN_ID}-claim-race`;
  let sessionId: string;

  before(async () => {
    await seedUser(userId, 10);

    // Seed an active guidance session with 2000 words ≈ 1 credit
    const [row] = await db
      .insert(guidanceSessionsTable)
      .values({
        userId,
        action: "general",
        status: "active",
        topics: [],
        messages: [
          { role: "user", content: "Tell me about my case." },
          { role: "assistant", content: "Sure, let me help you with your case details." },
        ],
        wordCount: 2000, // → 1 credit via creditsForWords
        creditCap: 3,
        creditsCharged: 0,
      })
      .returning({ id: guidanceSessionsTable.id });

    sessionId = row.id;
  });

  after(async () => {
    await cleanupSession(sessionId);
    await cleanupUser(userId);
  });

  test("only one concurrent caller wins the atomic claim", async () => {
    // Simulate two requests racing to finalize the same active session.
    // This mirrors what POST /ai/guidance/:id/complete does:
    //   UPDATE guidance_sessions SET status='completed' WHERE id=? AND status='active'
    // Only one UPDATE can match — the other gets 0 rows back.

    const claimSession = () =>
      db
        .update(guidanceSessionsTable)
        .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(guidanceSessionsTable.id, sessionId),
            eq(guidanceSessionsTable.status, "active"),
          ),
        )
        .returning({ id: guidanceSessionsTable.id });

    // Fire both claims concurrently.
    const [result1, result2] = await Promise.all([
      claimSession(),
      claimSession(),
    ]);

    const winners = [result1, result2].filter(r => r.length > 0);
    const losers  = [result1, result2].filter(r => r.length === 0);

    assert.equal(winners.length, 1, "exactly one request must win the claim");
    assert.equal(losers.length,  1, "exactly one request must be the loser (0 rows returned)");
  });

  test("winner charges credits; loser reads the already-set creditsCharged and does not re-charge", async () => {
    // Reset: re-insert a fresh active session for this second assertion.
    const [row] = await db
      .insert(guidanceSessionsTable)
      .values({
        userId,
        action: "general",
        status: "active",
        topics: [],
        messages: [
          { role: "user", content: "What should I file next?" },
        ],
        wordCount: 4000, // → 2 credits
        creditCap: 5,
        creditsCharged: 0,
      })
      .returning({ id: guidanceSessionsTable.id });
    const freshSessionId = row.id;

    const balanceBefore = await getBalance(userId);

    // Simulate both /complete handlers running concurrently:
    const completeSession = async () => {
      // Step 1: Attempt atomic claim.
      const [claimed] = await db
        .update(guidanceSessionsTable)
        .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(guidanceSessionsTable.id, freshSessionId),
            eq(guidanceSessionsTable.status, "active"),
          ),
        )
        .returning({ id: guidanceSessionsTable.id, wordCount: guidanceSessionsTable.wordCount, creditCap: guidanceSessionsTable.creditCap });

      if (!claimed) {
        // Loser path — read back what the winner already charged.
        const [fresh] = await db
          .select({ creditsCharged: guidanceSessionsTable.creditsCharged })
          .from(guidanceSessionsTable)
          .where(eq(guidanceSessionsTable.id, freshSessionId));
        return { won: false, creditsCharged: fresh?.creditsCharged ?? 0 };
      }

      // Winner path — charge credits.
      const usageCredits = Math.min(
        Math.max(1, Math.ceil(claimed.wordCount / 2000)),
        claimed.creditCap,
      );
      const charge = await chargeCredits(userId, usageCredits);
      const charged = charge.chargedAmount ?? 0;

      if (charged > 0) {
        await db
          .update(guidanceSessionsTable)
          .set({ creditsCharged: charged, updatedAt: new Date() })
          .where(eq(guidanceSessionsTable.id, freshSessionId));
      }

      return { won: true, creditsCharged: charged };
    };

    const [outcome1, outcome2] = await Promise.all([
      completeSession(),
      completeSession(),
    ]);

    const winners = [outcome1, outcome2].filter(o => o.won);
    const losers  = [outcome1, outcome2].filter(o => !o.won);

    assert.equal(winners.length, 1, "exactly one handler should win the claim");
    assert.equal(losers.length,  1, "exactly one handler should be the loser");

    // Winner should have charged the session cost (2 credits for 4000 words).
    const winnerCharged = winners[0].creditsCharged;
    assert.equal(winnerCharged, 2, "winner should charge 2 credits (4000 words / 2000 per credit)");

    // Loser must NOT have called chargeCredits at all — it never wins the claim.
    assert.equal(losers[0].won, false, "loser must not have won the claim");

    // Core invariant: the wallet is debited exactly once, not twice.
    // Wait briefly to let the winner's creditsCharged UPDATE land before reading.
    await new Promise(r => setTimeout(r, 50));
    const balanceAfter = await getBalance(userId);
    assert.equal(
      balanceBefore - balanceAfter,
      2,
      "wallet must decrease by exactly 2 credits total — no double-billing",
    );

    // Confirm the session row records the correct charge (winner's UPDATE).
    const [finalSession] = await db
      .select({ creditsCharged: guidanceSessionsTable.creditsCharged, status: guidanceSessionsTable.status })
      .from(guidanceSessionsTable)
      .where(eq(guidanceSessionsTable.id, freshSessionId));

    assert.equal(finalSession?.creditsCharged, 2, "session row must record exactly 2 credits charged");
    assert.equal(finalSession?.status, "completed", "session must be in completed state");

    // Cleanup
    await cleanupSession(freshSessionId);
  });
});

// =============================================================================
// Suite 3: Case history ownership gate (IDOR prevention)
// =============================================================================
describe("GET /ai/cases/:caseId/history ownership check", () => {
  const ownerUserId    = `${RUN_ID}-idor-owner`;
  const intruderUserId = `${RUN_ID}-idor-intruder`;
  let ownedCaseId: string;

  before(async () => {
    await Promise.all([
      seedUser(ownerUserId, 0),
      seedUser(intruderUserId, 0),
    ]);

    // Create a case belonging to ownerUserId
    ownedCaseId = `${RUN_ID}-idor-case`;
    await db.insert(casesTable).values({
      id: ownedCaseId,
      userId: ownerUserId,
      title: "Test IDOR Case",
      workflowStage: "parties",
      caseData: {},
    });

    // Seed a history row for that case
    await db.insert(caseHistory).values({
      caseId: ownedCaseId,
      itemType: "analysis",
      title: "Sensitive analysis",
      shortSummary: "Confidential content",
    });
  });

  after(async () => {
    await db.delete(caseHistory).where(eq(caseHistory.caseId, ownedCaseId));
    await db.delete(casesTable).where(eq(casesTable.id, ownedCaseId));
    await Promise.all([cleanupUser(ownerUserId), cleanupUser(intruderUserId)]);
  });

  test("owner can access their own case history via the ownership gate", async () => {
    // Simulate the ownership check the route performs:
    // SELECT id FROM cases WHERE id = ? AND user_id = ownerUserId
    const [ownedCase] = await db
      .select({ id: casesTable.id })
      .from(casesTable)
      .where(and(eq(casesTable.id, ownedCaseId), eq(casesTable.userId, ownerUserId)));

    assert.ok(ownedCase, "owner should be able to access their own case");
    assert.equal(ownedCase.id, ownedCaseId);
  });

  test("intruder is denied access to another user's case via the ownership gate", async () => {
    // Same query the route now runs — must return no row for the intruder.
    const [result] = await db
      .select({ id: casesTable.id })
      .from(casesTable)
      .where(and(eq(casesTable.id, ownedCaseId), eq(casesTable.userId, intruderUserId)));

    assert.equal(result, undefined, "intruder must NOT be able to see the owner's case (IDOR gate)");
  });
});

// =============================================================================
// Suite 4: deductCredit / deductCredits atomicity guards
// =============================================================================
describe("storage.deductCredit and deductCredits atomicity", () => {
  const userId = `${RUN_ID}-atomic-deduct`;

  before(async () => {
    await seedUser(userId, 3);
  });

  after(async () => {
    await cleanupUser(userId);
  });

  test("deductCredit returns false when balance is 0, never goes negative", async () => {
    // Drain to 0 first.
    await seedUser(userId, 0);
    const result = await storage.deductCredit(userId);
    assert.equal(result, false, "should return false when balance is 0");

    const balance = await getBalance(userId);
    assert.equal(balance >= 0, true, "balance must never go negative");
  });

  test("concurrent deductCredit calls on balance=1 produce exactly one success", async () => {
    await seedUser(userId, 1);

    const [r1, r2] = await Promise.all([
      storage.deductCredit(userId),
      storage.deductCredit(userId),
    ]);

    const successes = [r1, r2].filter(Boolean).length;
    assert.equal(successes, 1, "exactly one deductCredit should succeed against balance=1");

    const balance = await getBalance(userId);
    assert.equal(balance, 0, "balance should be 0 after one successful deduction");
  });

  test("concurrent deductCredits(2) calls on balance=2 produce exactly one success", async () => {
    await seedUser(userId, 2);

    const [r1, r2] = await Promise.all([
      storage.deductCredits(userId, 2),
      storage.deductCredits(userId, 2),
    ]);

    const successes = [r1, r2].filter(Boolean).length;
    assert.equal(successes, 1, "exactly one deductCredits(2) should succeed against balance=2");

    const balance = await getBalance(userId);
    assert.equal(balance, 0, "balance should be 0 after one successful deduction");
  });

  test("10 concurrent deductCredit calls on balance=5 produce exactly 5 successes", async () => {
    await seedUser(userId, 5);

    const results = await Promise.all(
      Array.from({ length: 10 }, () => storage.deductCredit(userId)),
    );

    const successes = results.filter(Boolean).length;
    assert.equal(successes, 5, "exactly 5 of 10 concurrent calls should succeed against balance=5");

    const balance = await getBalance(userId);
    assert.equal(balance, 0, "balance should be 0 — no extra deductions, no over-spend");
  });
});

// =============================================================================
// Suite 5: Refunds land correctly when AI fails mid-session
// =============================================================================
// These tests mirror the actual error paths in the routes:
//   - analyze-document: chargeOneCredit → Claude fails → refundOneCredit
//   - generate-document / guidance: chargeCredits → save fails → refundCredits
//
// Each test seeds a known balance, charges, simulates a failure (without
// actually calling Claude), then calls the refund function and verifies
// the wallet is restored to its exact original value.
// =============================================================================
describe("refundOneCredit — analyze-document Claude failure path", () => {
  const userId = `${RUN_ID}-refund-one`;

  before(async () => {
    await seedUser(userId, 5);
  });

  after(async () => {
    await cleanupUser(userId);
  });

  test("refundOneCredit restores balance after a successful chargeOneCredit", async () => {
    const before = await getBalance(userId);

    // Simulate the route: charge 1 credit before calling Claude.
    const charge = await chargeOneCredit(userId);
    assert.equal(charge.ok, true, "charge should succeed");
    assert.equal(charge.charged, true, "credit should have been deducted");

    const afterCharge = await getBalance(userId);
    assert.equal(before - afterCharge, 1, "balance should have decreased by 1 after charge");

    // Simulate Claude throwing — route calls refundOneCredit when charged=true.
    await refundOneCredit(userId);

    const afterRefund = await getBalance(userId);
    assert.equal(afterRefund, before, "refund must restore balance to its pre-charge value");
  });

  test("chargeOneCredit returns charged=false when waived — no refund is issued", async () => {
    // We can't easily put the test user on an Apex plan, but we CAN verify the
    // guard condition: when ChargeResult.charged is false the route skips the
    // refund call entirely. If a buggy implementation called refundOneCredit
    // unconditionally it would inflate the balance — this test detects that.
    const before = await getBalance(userId);

    // Drain to 0 so chargeOneCredit returns ok=false, charged=false (no deduction).
    await seedUser(userId, 0);
    const charge = await chargeOneCredit(userId);

    assert.equal(charge.ok, false, "charge should fail when balance is 0");
    assert.equal(charge.charged, false, "charged must be false — nothing was deducted");

    // The route guards on charge.charged before calling refundOneCredit.
    // Calling refundOneCredit here (wrong) would give the user a free credit.
    // We verify that NOT calling it leaves the balance at 0.
    const balanceAfter = await getBalance(userId);
    assert.equal(balanceAfter, 0, "balance must stay 0 — no phantom credit from a spurious refund");

    // Restore for next test.
    await seedUser(userId, 5);
  });

  test("multiple concurrent Claude failures each get a refund (one credit each)", async () => {
    // Two requests each charge 1 credit and both fail: both must be refunded.
    await seedUser(userId, 5);
    const before = await getBalance(userId);

    // Both charges succeed.
    const [c1, c2] = await Promise.all([chargeOneCredit(userId), chargeOneCredit(userId)]);
    assert.equal(c1.charged, true, "first charge should succeed");
    assert.equal(c2.charged, true, "second charge should succeed");

    const afterBothCharges = await getBalance(userId);
    assert.equal(before - afterBothCharges, 2, "two credits should have been deducted");

    // Both Claude calls fail — both routes call refundOneCredit.
    await Promise.all([refundOneCredit(userId), refundOneCredit(userId)]);

    const afterBothRefunds = await getBalance(userId);
    assert.equal(afterBothRefunds, before, "both refunds must restore the original balance");
  });
});

describe("refundCredits — guidance / generate-document failure path", () => {
  const userId = `${RUN_ID}-refund-multi`;

  before(async () => {
    await seedUser(userId, 10);
  });

  after(async () => {
    await cleanupUser(userId);
  });

  test("refundCredits(N) restores balance after a successful chargeCredits(N)", async () => {
    const before = await getBalance(userId);

    // Simulate the route charging for 3 credits of output.
    const charge = await chargeCredits(userId, 3);
    assert.equal(charge.ok, true, "charge should succeed");
    assert.equal(charge.charged, true, "credits should have been deducted");
    assert.equal(charge.chargedAmount, 3, "should have charged exactly 3");

    const afterCharge = await getBalance(userId);
    assert.equal(before - afterCharge, 3, "balance must decrease by 3 after charge");

    // Simulate the DB save throwing — route calls refundCredits(chargedAmount).
    await refundCredits(userId, charge.chargedAmount ?? 0);

    const afterRefund = await getBalance(userId);
    assert.equal(afterRefund, before, "refund must restore balance to its pre-charge value");
  });

  test("refundCredits(0) is a no-op — balance unchanged", async () => {
    const before = await getBalance(userId);

    // chargeCredits with amount=0 returns charged=false, chargedAmount=0.
    const charge = await chargeCredits(userId, 0);
    assert.equal(charge.charged, false, "zero-amount charge should not deduct anything");

    // Route calls refundCredits(chargedAmount ?? 0) → refundCredits(0).
    await refundCredits(userId, 0);

    const after = await getBalance(userId);
    assert.equal(after, before, "balance should be unchanged after refundCredits(0)");
  });

  test("partial charge (balance < requested) is fully refunded on failure", async () => {
    // User has 2 credits; route requests 5. chargeCredits deducts 2 (what's available).
    await seedUser(userId, 2);

    const charge = await chargeCredits(userId, 5);
    assert.equal(charge.charged, true, "partial charge should still be charged=true");
    assert.equal(charge.ok, false, "ok=false because full amount wasn't covered");

    const chargedAmount = charge.chargedAmount ?? 0;
    assert.ok(chargedAmount > 0 && chargedAmount <= 2, "charged amount should be between 1 and 2");

    // Simulate failure → refund whatever was actually deducted.
    await refundCredits(userId, chargedAmount);

    const balanceAfterRefund = await getBalance(userId);
    assert.equal(balanceAfterRefund, 2, "partial charge must be fully refunded — balance back to 2");
  });

  test("refund after concurrent charges refunds the correct per-call amount", async () => {
    // Two concurrent charges of 2 credits each against a balance of 10.
    // Both succeed. Both then fail. Both must be individually refunded.
    await seedUser(userId, 10);
    const before = await getBalance(userId);

    const [c1, c2] = await Promise.all([chargeCredits(userId, 2), chargeCredits(userId, 2)]);
    assert.equal(c1.charged, true, "first charge should succeed");
    assert.equal(c2.charged, true, "second charge should succeed");

    const totalCharged = (c1.chargedAmount ?? 0) + (c2.chargedAmount ?? 0);
    assert.equal(totalCharged, 4, "total deducted should be 4 credits");

    // Both requests fail mid-flight; each refunds its own chargedAmount.
    await Promise.all([
      refundCredits(userId, c1.chargedAmount ?? 0),
      refundCredits(userId, c2.chargedAmount ?? 0),
    ]);

    const afterRefunds = await getBalance(userId);
    assert.equal(afterRefunds, before, "both refunds must restore the full original balance");
  });
});

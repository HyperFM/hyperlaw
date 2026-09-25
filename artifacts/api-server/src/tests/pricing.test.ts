/**
 * pricing.test.ts — pure checks (no database) for the money math and pack rules.
 * Run: pnpm --filter @workspace/api-server run test:pricing
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { creditsForCost, costMicroUsd, audioCostMicroUsd } from "../services/aiRates.js";
import { packById, CREDIT_PACKS } from "../services/creditPacks.js";

test("credits = real cost x 1.5 / $0.05", () => {
  assert.equal(creditsForCost(500_000), 15);   // $0.50 -> 15 credits
  assert.equal(creditsForCost(5_000_000), 150);
  assert.equal(creditsForCost(0), 0);
  assert.equal(creditsForCost(1), 1);          // a paid call never rounds to free
});

test("token and audio costs", () => {
  assert.equal(costMicroUsd("claude-sonnet-5", { input_tokens: 100_000, output_tokens: 20_000 }).costMicroUsd, 600_000);
  assert.equal(audioCostMicroUsd("whisper-1", 600).costMicroUsd, 60_000);
});

test("the $5 pack grants 100 credits and unknown packs are refused", () => {
  const p = packById("topup5");
  assert.equal(p?.credits, 100);
  assert.equal(p?.amountCents, 500);
  assert.equal(packById("free-money"), null);
  assert.equal(CREDIT_PACKS.every(x => x.amountCents / 100 / x.credits === 0.05), true); // 1 credit = $0.05
});

test("webhook signatures: valid accepted, wrong secret and tampered body rejected", () => {
  const s = new Stripe("sk_test_dummy");
  const secret = "whsec_test";
  const payload = JSON.stringify({ id: "evt_1", object: "event", type: "checkout.session.completed", data: { object: {} } });
  const header = s.webhooks.generateTestHeaderString({ payload, secret });
  assert.equal(s.webhooks.constructEvent(Buffer.from(payload), header, secret).type, "checkout.session.completed");
  assert.throws(() => s.webhooks.constructEvent(Buffer.from(payload), header, "whsec_other"));
  assert.throws(() => s.webhooks.constructEvent(Buffer.from(payload + " "), header, secret));
});

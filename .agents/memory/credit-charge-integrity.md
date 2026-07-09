---
name: Credit Charge Integrity
description: Rules for race-safe credit charging — retry loop, atomic claim-then-charge, and idempotency pattern
---

## Rule: any credit-charging endpoint must claim a terminal state transition BEFORE charging

**Why:** Charging before committing the terminal state creates a window where retries or concurrent requests charge the same session multiple times (charge succeeds, commit fails/races, retry sees the session still "active" and charges again).

**Pattern (guidance/complete as canonical example):**
1. Atomically flip the session from `active → completed/abandoned` via a conditional UPDATE with `.returning()` (Drizzle / Postgres).
2. Only the request that gets a non-empty `.returning()` result is the winner — it may charge.
3. Losing requests (returning nothing) re-read the row and return the already-persisted `creditsCharged` idempotently — no second charge.
4. Record `creditsCharged` in a follow-up UPDATE after the charge call succeeds.

**How to apply:** Any new billable action that could be retried or hit concurrently should follow this pattern. The terminal state transition is the idempotency key.

## Rule: conditional deductions must retry on a lost race, not silently return zero

**Why:** `storage.deductCredits(userId, amount)` does a conditional UPDATE (`balance >= amount`). If a concurrent deduction runs first and reduces balance, the conditional fails. Before this fix, `chargeCredits` would return `chargedAmount: 0` after billable work completed — user gets work free, merchant loses revenue silently.

**Pattern (`services/credits.ts`):**
- Loop up to 5 attempts.
- Each attempt: re-read fresh balance, compute `toCharge = min(amount, balance)`, try conditional deduct.
- On success: return `charged: true, chargedAmount: toCharge`.
- On exhaustion: return `charged: false, chargedAmount: 0` (fail-open, user's favor — acceptable for low-probability case).
- Never charge MORE than `amount`; if balance < amount, charge the remainder (partial charge is user-favorable and avoids zero-charge on billable work).

## Refunds mirror deductions

Any code path that refunds credits must use the same conditional logic as deductions. See `services/credits.ts` for `refundCredits`.

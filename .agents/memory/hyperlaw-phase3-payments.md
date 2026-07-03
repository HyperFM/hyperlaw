---
name: HyperLaw Phase 3 Payments
description: Stripe credit wallet architecture, security decisions, and key files
---

## Credit model
One-time purchase packs only (not subscriptions): 1 credit/$4.99, 5/$19.99, 15/$49.99.
- Packs seeded via `pnpm --filter @workspace/scripts run seed-products` (idempotent).
- Premium docs: complaint, motion, timeline — 1 credit each.
- Free docs: analysis/chat summaries.

## Server-authoritative credit amounts (critical security rule)
The client is NEVER trusted for `creditAmount`. The checkout route accepts only `priceId` from the client; `creditAmount` is derived server-side by expanding the Stripe price to its product and reading `product.metadata.credits`.

**Why:** A malicious client could supply a valid cheap `priceId` with an inflated `creditAmount` and receive excess credits after payment.

**How to apply:** In `stripeService.createCreditCheckout`, call `stripe.prices.retrieve(priceId, { expand: ['product'] })` and parse `product.metadata.credits`. This value is embedded in session metadata for the webhook to use.

## Webhook idempotency
Table `stripe_processed_sessions` (public schema, Drizzle) with `session_id VARCHAR PRIMARY KEY` prevents duplicate credit fulfillment on Stripe webhook retries.

Flow in `app.ts`:
1. Parse `checkout.session.completed`
2. Call `storage.markSessionProcessed(sessionId, userId, creditAmount)` — uses `ON CONFLICT DO NOTHING`
3. Only credit if `markSessionProcessed` returns true (first delivery)

## Atomic credit operations
- `storage.deductCredit(userId)`: `WHERE credit_balance >= 1` guard — returns false if insufficient
- `storage.addCredits(userId, amount)`: `SET credit_balance = credit_balance + amount`
- Refund on AI failure is best-effort (wrapped in try/catch, error logged but not re-thrown)

## Key files
- `artifacts/api-server/src/stripeClient.ts` — credential fetch from Replit connector
- `artifacts/api-server/src/stripeService.ts` — customer management, server-authoritative checkout
- `artifacts/api-server/src/routes/stripe.ts` — products (Stripe API direct), credits, checkout, portal
- `artifacts/api-server/src/storage.ts` — credit wallet + idempotency methods
- `artifacts/api-server/src/app.ts` — webhook handler with idempotency guard
- `artifacts/api-server/src/routes/ai.ts` — generate-document route (deduct → generate → refund on fail)
- `artifacts/legal-screen-builder/src/components/CreditShopModal.tsx` — purchase UI
- `lib/db/src/schema/index.ts` — `usersTable` (credits), `stripeProcessedSessionsTable`
- `scripts/src/seed-products.ts` — idempotent product seeder

## Frontend credit flow
1. `App.tsx` fetches credit balance on mount via `aiApi.creditBalance()`
2. `?checkout=success` URL param → shows toast + re-fetches balance after 2s delay
3. `CreditShopModal` fetches products from `/api/stripe/products` (Stripe API direct)
4. "GENERATE FORMAL DOCUMENTS" panel in `CaseDetailView` — three buttons, each costing 1 credit
5. On `code === "insufficient_credits"` from API → opens credit shop modal

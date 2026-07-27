---
name: Stripe Sync Package Quirks
description: Quirks when using the stripe-replit-sync package in api-server (Postgres sync + webhook processing)
---

## Credentials
Both `getUncachableStripeClient()` and `getStripeSync()` (in `artifacts/api-server/src/stripeClient.ts`)
read `STRIPE_LIVE_API_KEY` directly from the environment. The project previously fell back to a
Replit-connector HTTP call (`REPLIT_CONNECTORS_HOSTNAME` + `X-Replit-Token`) when that env var was
unset; that fallback was removed when the project moved off Replit — `STRIPE_LIVE_API_KEY` is now
required.

## esbuild externalization (critical)
`stripe-replit-sync` and `stripe` MUST be in the `external` list in `artifacts/api-server/build.mjs`.

**Why:** `stripe-replit-sync` uses `path.resolve(__dirname, "./migrations")` to find SQL migration files at runtime. When esbuild bundles it, `__dirname` resolves to the dist directory and the SQL files are not found — schema tables are never created. Externalizing preserves the correct `__dirname` from node_modules.

## syncBackfill behavior
`stripeSync.syncBackfill()` completes near-instantly and does NOT reliably pull product data from the Stripe API for newly created products. The local `stripe.products` table may be empty even after backfill.

**Fix:** Query products directly from the Stripe API client (`stripe.products.list(...)`) rather than from the local sync tables. The sync tables are more reliable for webhook-driven events (subscriptions, payments) than direct API calls.

## runMigrations
Call as `runMigrations({ databaseUrl })` — no `schema` parameter needed (it hardcodes `"stripe"` internally). Passing an unknown `schema` option may cause TypeScript errors.

---
name: Stripe Replit Connector
description: Quirks when using the Stripe Replit integration connector in api-server
---

## Connector API field names
- Credential endpoint: `https://$REPLIT_CONNECTORS_HOSTNAME/api/v2/connection?include_secrets=true&connector_names=stripe`
- Auth header MUST be `"X-Replit-Token"` (hyphen), NOT `X_REPLIT_TOKEN` (underscore) — JS fetch passes names verbatim.
- Secret key field is `settings.secret` (NOT `settings.secret_key`).
- Publishable key field is `settings.publishable`.
- Token format: `"repl " + process.env.REPL_IDENTITY`.

**Why:** The Replit Stripe connector schema uses `secret`/`publishable` — not the generic `secret_key` pattern you might assume from other connectors.

## esbuild externalization (critical)
`stripe-replit-sync` and `stripe` MUST be in the `external` list in `artifacts/api-server/build.mjs`.

**Why:** `stripe-replit-sync` uses `path.resolve(__dirname, "./migrations")` to find SQL migration files at runtime. When esbuild bundles it, `__dirname` resolves to the dist directory and the SQL files are not found — schema tables are never created. Externalizing preserves the correct `__dirname` from node_modules.

## syncBackfill behavior
`stripeSync.syncBackfill()` completes near-instantly and does NOT reliably pull product data from the Stripe API for newly created products. The local `stripe.products` table may be empty even after backfill.

**Fix:** Query products directly from the Stripe API client (`stripe.products.list(...)`) rather than from the local sync tables. The sync tables are more reliable for webhook-driven events (subscriptions, payments) than direct API calls.

## runMigrations
Call as `runMigrations({ databaseUrl })` — no `schema` parameter needed (it hardcodes `"stripe"` internally). Passing an unknown `schema` option may cause TypeScript errors.

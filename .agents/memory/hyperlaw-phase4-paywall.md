---
name: HyperLaw Phase 4 Paywall
description: SUPERSEDED — preview/unlock model retired; see credit-charge-integrity.md for current billing rules
---

> **SUPERSEDED — Paywall retired.** The preview→unlock model described below no longer exists. Documents are billed usage-based at generation time and always returned in full. The `/unlock` route, `toClientDoc()` truncation, and `paymentStatus`-gated access have all been removed from `routes/generated-documents.ts`.

## What was here (historical record only)

Phase 4 added a generate-free / unlock-for-1-credit paywall. Key artifacts that survive:
- `paymentStatus` column still exists in `generatedDocumentsTable` (legacy rows may say "preview") but nothing gates on it — all docs return full content.
- `DocumentViewerModal` still exists but its interface was slimmed to `{ doc, onClose }` — the old unlock CTA and credit-balance props were removed.
- Admin Revenue tab (`AdminPanel.tsx`) still shows doc counts by paymentStatus (legacy metric).

## lib/db stale declarations (still applies)

If TS errors claim `usersTable` or similar don't exist, run:
```
pnpm --filter @workspace/db exec tsc -p tsconfig.json
```

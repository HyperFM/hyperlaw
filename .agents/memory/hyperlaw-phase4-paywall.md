---
name: HyperLaw Phase 4 Paywall
description: Preview paywall architecture, race-safe unlock, and admin stats — Phase 4
---

## Preview paywall architecture (generate → preview → unlock)

Phase 4 changes the document monetization model:
- `POST /ai/generate-document` — FREE. Generates full doc via Claude, saves with `paymentStatus: "preview"`. Returns truncated content (200 words + sentinel).
- `POST /ai/generated-documents/:id/unlock` — Costs 1 credit. Flips `paymentStatus` to `"paid"`. Returns full content.
- Read endpoints (`GET /ai/generated-documents`) apply `toClientDoc()` which strips content to 200 words for preview docs.

**Why server-side truncation is critical:** Client-side truncation only is bypassable via devtools/network inspection. Full content must never reach the client until paid, even though it's stored in DB.

**How to apply:** Every endpoint that returns `generatedDocumentsTable` rows must call `toClientDoc(doc)` before sending. The `toClientDoc` helper lives in `routes/generated-documents.ts`.

## Race-safe unlock (conditional UPDATE)

The unlock route adds `eq(generatedDocumentsTable.paymentStatus, "preview")` to the UPDATE WHERE clause. This means:
- Only one concurrent unlock request can flip the status (PG row-level exclusivity).
- If a parallel request already unlocked → 0 rows returned → credit refunded immediately.
- Pattern: deductCredit first, then conditional UPDATE, refund if UPDATE returns no rows.

**Why:** Without the `paymentStatus = "preview"` condition, two parallel unlocks both succeed and both charge a credit — double-charge bug.

## lib/db stale declarations (known gotcha)

`lib/db/dist/index.d.ts` can become stale when new tables are added to `lib/db/src/schema/index.ts`. The api-server uses project references to `lib/db`. If TS errors appear claiming `usersTable` or similar don't exist, run:
```
pnpm --filter @workspace/db exec tsc -p tsconfig.json
```
This regenerates `dist/`. However, since `package.json` `exports` points to `./src/index.ts` directly, the runtime resolution is usually fine — only TS typecheck may fail.

## DocumentViewerModal (new component)

`artifacts/legal-screen-builder/src/components/DocumentViewerModal.tsx`:
- `position: fixed` modal, mounts inside CaseDetailView (works anywhere in DOM)
- Preview mode: shows `truncateWords(content, 150)` + fade + "Unlock Full Document (1 credit)" CTA
- Paid mode: full content + "Verify with Read-Aloud" + "Download PDF" actions
- TTS: `window.speechSynthesis` — utterance ref stored to enable pause/resume. `stopTts()` called on unmount and close.
- PDF download: `window.open()` print window, `setTimeout(w.print, 700)` — must allow pop-ups.
- Download checklist: 4 checkboxes, all required before PDF download button activates.
- Footer panels: "actions" | "tts" | "checklist" state — rendered as collapsible panels.

## Admin Revenue tab

AdminPanel.tsx now has a "Revenue" tab (4th tab, DollarSign icon). Shows:
- Total users, Stripe revenue ($), credits sold, docs unlocked
- Document funnel bar chart (generated vs unlocked, conversion %)
- Powered by `GET /admin/platform-stats` (admin-auth required)
- Platform stats query: usersTable count, generatedDocumentsTable by paymentStatus, stripeProcessedSessionsTable sum, stripe.payment_intents sum (with fallback to 0 if stripe schema empty)

## Generate section UX change

Generate buttons are now FREE (no credit check). Description changed to "Generate a free preview — unlock the full document for 1 credit." After generation, the DocumentViewerModal auto-opens showing the preview. This "try before you buy" model improves conversion.

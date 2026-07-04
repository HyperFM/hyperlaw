---
name: HyperLaw Stops 5-6-7 Implementation
description: What was built in the Stops 5/6/7 pass — free-case gate, polish, admin error logging.
---

# HyperLaw Stops 5, 6, 7

## Stop 5 — Two Free Cases

- Gate in both `handleConvertToCase` and `handleUploadForNewCase` in App.tsx:
  `if (data.cases.length >= 2 && (creditBalance ?? 0) < 1) { setShowCreditShop(true); return; }`
- Cases remain localStorage-only; no credit is spent on case creation — only doc unlock deducts credits.
- CasesView shows a "X / 2 free cases used" inline indicator (amber + AlertCircle when at limit).

## Stop 6 — Polish

- **Offline banner**: `isOnline` state + window `online`/`offline` event listeners; amber WifiOff strip shown when offline.
- **Generate retry**: `lastGenerateDocType` state (set before try block in handleGenerateDoc); "Try again" button in generateError row re-calls `handleGenerateDoc(lastGenerateDocType)`.
- **Accessibility**: `aria-hidden="true"` on WaveBar (decorative), `aria-label="Close document"` on DocumentViewerModal X button.

## Stop 7 — Admin

- **errorLogsTable**: schema in lib/db; columns: id (uuid), userId (text), context (text), message (text), metadata (jsonb nullable), createdAt. Pushed and db rebuilt.
- **Upload error logging**: In POST /ai/upload catch block — truly fire-and-forget via `void (async () => { await db.insert(...) })()`. Non-fatal; never awaited before 422 response.
- **avgResponseTimeMs per day**: Added to admin-ai.ts `last30Days` select via `avg(CASE WHEN cache_hit THEN NULL ELSE response_time_ms END)`. Coalesce to 0 for cache-only days; chart renders those as neutral stubs (4px height, 40% opacity).
- **GET /admin/error-logs**: Paginated, admin-only, in admin-ai.ts. Returns `{ logs, total, page, limit }`.
- **aiApi.admin.errorLogs()**: Added. ErrorLog interface added.
- **AdminPanel Errors tab**: AlertCircle icon, "errors" in AdminView type, loadErrorLogs useCallback, useEffect auto-loads on tab open (deps suppression intentional), refresh button wired, pagination, empty state.
- **Response time chart**: In AI Inspector, between feature breakdown and logs table. Bars colored green/orange/red by threshold.

## Key Decisions
- Fire-and-forget error insert uses `void (async () => { ... })()` pattern — not a detached promise; wraps await inside IIFE.
- `eslint-disable react-hooks/exhaustive-deps` on errors tab useEffect is intentional: "load once on tab open" behavior.
- 0ms avgResponseTimeMs on cache-only days renders as neutral stub, not a false "fast" bar.

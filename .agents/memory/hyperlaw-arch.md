---
name: HyperLaw Architecture
description: Core app structure, routing, and data flow patterns.
---

## Frontend

- **Landing page** (unauthenticated) = plans carousel
- **App.tsx** = authenticated main app; Wouter routes at /, /sign-in/*?, /sign-up/*?
- **NavTab IDs**: `"home" | "builder" | "tutor" | "profile"` — never rename; "Index" is only the display label for `"tutor"`
- **State**: cases stored in localStorage (key: `hl_v3`) via `store.ts`; synced to server via debounced `api.cases.upsert()` (1.5s delay)
- **Mount**: loads cases from server, merges — local always wins (unsynced edits safe); server fills in cases not locally present + adds `structuredCase`
- **Auto-organize**: useEffect in App watches `data.cases`; when `assembly` set but `structuredCase` missing, fires `aiApi.organizeCase()` → saves to HLCase + server
- `organizingCasesRef` Set guards against double-firing organize per case

## Backend

- API server at `artifacts/api-server`
- Routes all prefixed `/api`
- Cases route: GET /cases, POST /cases (upsert with ownership check), PATCH /cases/:id/structured, DELETE /cases/:id

## Database

Cases are NOW persisted server-side in `cases` table (added):
- `id` = client-generated UUID matching HLCase.id
- `caseData` JSONB = full HLCase mirror
- `structuredCase` JSONB = Organization Engine output

Previously: cases were localStorage-only (no server table).

## Organization Engine

- Endpoint: `POST /ai/organize`
- Service: `aiService.organizeCase()` — 4000 max_tokens
- Produces: `executiveSummary`, `clouds[]`, `keyFacts[]`, `claims[]`, `importantQuotes[]`, `gapQuestions[]`
- Auto-triggered after assembly; result stored in `HLCase.structuredCase` + `cases.structured_case`
- **TutorView reads structuredCase.clouds directly** — skips `/ai/analyze` when data available

## Gap Detection Engine

- Endpoint: `POST /ai/gap-detect`
- Service: `aiService.detectGaps()` — 1000 max_tokens
- Returns ALL follow-up questions in ONE batch (max 12), not one-at-a-time
- Not yet wired to any UI trigger — endpoint is ready

## Case Switcher

- `CaseSwitcherBar` component in App.tsx — shows above case content when 2+ cases
- Bottom-sheet picker on tap; shows all cases with organize status indicator
- Only visible when `navTab === "builder"` AND inside a case view (case_detail, case_parties, etc.)

## Constants

- `ORANGE = "#d9711f"` everywhere
- Admin email = `hypermodula@gmail.com`
- Cloud colors: Blue=amendment, Orange=statute, Green=evidence, Purple=party, Red=violation, Gray=deadline, Yellow=concept

## Assembly screen (CaseDetailView) — drafting is inline, not a routed phase
- `onGoToPhase` routes ONLY the 4 pre-assembly workflow phases: parties/court/story/timeline. No branch for assembly/documents.
- Drafting (complaint/motion/…), the VerifyPanel, and the AssemblyProgress strip all live ON CaseDetailView. Drafting is NOT a separate routed screen.
- **Why:** the AssemblyProgress "Draft" step must scroll within the screen (to `#draft-documents-section`), NOT call `onGoToPhase("documents")`. A code review WILL suggest wiring it to onGoToPhase — that recommendation is wrong here; keep it an in-screen scroll.
- VerifyPanel displays the Organization Engine's organize-time `structuredCase.gapQuestions`. It does NOT call `/ai/gap-detect` (that endpoint is still unwired to any live trigger).

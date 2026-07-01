# HyperLaw

A React/Vite web app for pro se civil rights litigants to describe incidents, organize them into cases, and understand what happened with guided legal reasoning.

## Run & Operate

- `pnpm --filter @workspace/legal-screen-builder run dev` — run the web app (port from $PORT)
- `pnpm run typecheck` — full typecheck across all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (artifact: `legal-screen-builder`)
- Storage: localStorage under key `hl_v3`
- No backend required (client-only)

## Where things live

- `artifacts/legal-screen-builder/src/App.tsx` — entire UI (HomeView, IncidentDetailView, CasesView, CaseDetailView, TutorView, ProfileView, nav components, root App)
- `artifacts/legal-screen-builder/src/types.ts` — `Incident`, `HLCase`, `AppData`
- `artifacts/legal-screen-builder/src/store.ts` — `loadData`/`saveData` + mutation helpers
- `artifacts/legal-screen-builder/src/services/tutor.ts` — `TutorService` interface + `staticTutorService` (keyword-based, swappable for Claude)
- `artifacts/legal-screen-builder/public/hyperlaw-logo.png` — app logo

## Architecture decisions

- All data persists to localStorage under `hl_v3` (no backend needed for MVP).
- AI/tutor logic lives behind `TutorService` interface — swap `staticTutorService` for a Claude-backed implementation without touching any UI code.
- Navigation is state-based (no router): `NavTab` ("home"|"cases"|"tutor"|"profile") + a discriminated union `AppView` for sub-views.
- No auto-generated citations, no legal pre-processing — user explicitly controls all content.
- Easter egg: 5 rapid taps on the dimmed logo at bottom of ProfileView triggers `EasterEggScreen`.

## Product

- **New Incident** (FAB / orange button): user describes what happened in plain language → saved as Incident
- **Incident Detail**: view/edit/delete incident; convert to new Case or add to existing Case; open in Tutor
- **Cases**: collection of related Incidents + notes + timeline
- **Tutor**: selects an Incident or Case, provides overview, key observations, and 5 guiding questions (keyword-based engine, Claude-ready interface)
- **Profile**: settings shell + Claude API key reminder card

## User preferences

- Keep system simple — no auto-citations, no background processing, no auto-generated legal documents
- AI features go behind service interfaces so the engine can be swapped for Claude without UI changes
- Dark theme (#0a0a0a bg, #d9711f orange accent)

## Gotchas

- `hl_v3` is the localStorage key — previous sessions used `lsb_v2` (old screen builder). These are separate and won't conflict.
- Do NOT add citation auto-generation, screen builders, or legal pre-processing back — these were intentionally removed.
- BlockCanvas.tsx remains in the codebase but is not imported by App.tsx — it's preserved for a future "visual argument screen" feature (Phase 1 of the roadmap).

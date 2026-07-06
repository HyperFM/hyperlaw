---
name: HyperLaw Index Concept Clouds
description: Index tab redesign (concept clouds) and HoldToUnlockButton; key type contract and cleanup rules.
---

## Index Concept Clouds

The `TutorView` (navTab `"tutor"`, user-facing label "Index") was redesigned from a chat UI to an interactive concept cloud map.

**Type contract — IMPORTANT:**
`TutorAnalysis` is defined in TWO places that must stay in sync:
1. `artifacts/legal-screen-builder/src/services/tutor.ts` — imported by App.tsx
2. `artifacts/legal-screen-builder/src/lib/aiApi.ts` — API response shape

Both must have `clouds?: IndexCloud[]`. `services/tutor.ts` imports `IndexCloud` from `../lib/aiApi`.
`IndexCloud` is also defined in `artifacts/api-server/src/services/ai.ts` (backend).

**Color system (must remain consistent):**
- amendment: `#3b82f6` (blue)
- statute: `#d9711f` (orange)
- evidence: `#22c55e` (green)
- party: `#8b5cf6` (purple)
- violation: `#ef4444` (red)
- deadline: `#9ca3af` (gray)
- concept: `#eab308` (yellow)

**Backend prompts:** both `analyzeIncident` (max_tokens: 2500) and `analyzeCase` (max_tokens: 3000) now ask Claude to return `clouds[]` in JSON output alongside existing `insights[]` and `guidingQuestions[]`.

**Fallback behavior:** Old cached results have no `clouds` — TutorView gracefully falls back to the insights + questions list view when `clouds` is empty/undefined.

**Cloud sanitization:** Filter with `.filter(c => c && c.label && c.category)` before rendering to guard against malformed Claude output.

## HoldToUnlockButton (DocumentViewerModal)

3-second hold-to-unlock replacing the simple click button. Key rules:
- Native `touchstart`/`touchend`/`touchcancel` listeners with `{ passive: false }` — prevents scroll stealing
- `useEffect` cleanup must call `cancel()` on unmount to stop in-flight RAF
- `WebkitUserSelect: "none"` — no type cast needed, string literal works
- `hasCredits = creditBalance === undefined || creditBalance > 0` — treat undefined as "loading" so button isn't disabled before balance loads; server rejects on actual insufficient credits
- When no credits (`creditBalance === 0`): hold button is disabled, "Buy Credits" button is shown as primary CTA
- `navigator.vibrate([25])` on hold start; `[40, 25, 80]` on completion
- Glow: `box-shadow: 0 0 Npx rgba(217,113,31,0.9), 0 0 2Npx rgba(217,113,31,0.4)` where N scales with progress

**Why:** Hold pattern prevents accidental credit charges; vibration + glow provides clear haptic+visual feedback on mobile.

---
name: HyperLaw Exhibit Studio
description: Architecture and key decisions for the Studio tab (formerly Builder) — video evidence workspace.
---

## What was built
- Builder tab renamed to "Studio" (NAV_ITEMS label + BuilderIcon updated to orange square with white ▶ triangle)
- `AppView` extended with `{ type: "studio_workspace"; caseId: string }`
- `types.ts` — new types: `ExhibitExtraction`, `ExhibitDraft`, `ExhibitMarker`, `JurisdictionVerification`, `StudioProject`; `studioProject?` added to `HLCase`
- `src/pages/studio/ExhibitStudioView.tsx` — opening screen; case picker with jurisdiction verdict badges
- `src/pages/studio/VideoWorkspaceView.tsx` — full workspace (see below)
- Backend: `builderExtract()` + `jurisdictionVerify()` on AiService; POST `/ai/builder-extract` + `/ai/jurisdiction-verify` routes
- Frontend: `aiApi.builderExtract()` + `aiApi.jurisdictionVerify()` added to aiApi.ts

## VideoWorkspaceView key design choices

**Video** — local file only (URL.createObjectURL), never uploaded. Relink required after navigation.
- Object URL tracked via `videoUrlRef` (ref not state) so unmount cleanup always revokes the latest URL — avoids memory leak.

**Markers / in-flight extraction safety** — `extractAndDraft` uses `setMarkersRaw(prev => ...)` functional updates on completion/error so concurrent edits during AI call are never clobbered.

**Dictation** — empty transcript does NOT trigger extraction; marker stays `"draft"` so user can dictate again. Only non-empty text sets `"extracting"` and calls the Builder Engine.

**Speech Recognition cleanup** — recognitionRef.current.stop() called in unmount cleanup (not just on dictation end) to prevent orphaned recognition after navigation.

**Undo/redo** — up to 20 snapshots. `setMarkers(updated, pushUndo=false)` used for async AI-driven updates to avoid polluting undo history with non-user-initiated changes.

**Jurisdiction verification** — 3-second hold (JurisdictionVerifyButton, identical mechanic to HoldToUnlockButton). Cached 7 days server-side (cache key = state+county+courtName). Once verified, tap = view result; hold again = refresh.

**Why:**
- Video privacy requirement (spec) — no hour-long videos on server, object URL = device only.
- Functional setState pattern prevents stale closure overwrites for async calls.
- Empty-dictation guard prevents infinite "extracting" spinner if user cancels speech.

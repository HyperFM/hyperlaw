---
name: HyperLaw Rebuild Phase 1
description: Complete rebuild foundation — new data model, 4 workflow phases, HomeView redesign, buildTimeline AI endpoint, Tutor bug fix.
---

## What was built

### Data model (types.ts)
- Added `Party` (id, firstName, lastName, type: official|civilian, agency, title, badge, officialLocation, nickname, nicknameEmoji)
- Added `Court` (level: federal|state, state, name, shortName?)
- Added `TimelineEvent` (id, title, description, order)
- Added `WorkflowStage` union: "parties" | "court" | "story" | "timeline" | "assembly" | "learning" | "documents"
- Extended `HLCase` with: parties, court, story, timeline, workflowStage, intakeChecklist
- Added `computeCaseHealth()`, `getNextStep()`, `caseCompletionPct()` helper functions exported from types.ts

### Backward compat
- Existing cases migrated in `store.ts` loadData() with safe defaults: `parties: [], court: null, story: "", timeline: [], workflowStage: "documents", intakeChecklist: []`
- Legacy cases get `workflowStage: "documents"` so they skip the new workflow and go straight to CaseDetailView

### New app views (AppView union)
- `{ type: "case_parties"; caseId: string }`
- `{ type: "case_court"; caseId: string }`
- `{ type: "case_story"; caseId: string }`
- `{ type: "case_timeline"; caseId: string }`

### Workflow screens
- `PartiesView` — Party collection with Official/Civilian split, auto-assigns voice nickname from nicknames.ts library
- `CourtSelectionView` — Federal/State toggle → state search → court list picker; uses courts.ts static data
- `StoryView` — Large textarea + Web Speech API mic button; nickname reference card; mic toggle properly stops active recognition via ref
- `TimelineView` — Shows story, "Build Timeline with AI" button, editable event cards, rebuild-confirm protection

### Supporting files
- `src/lib/nicknames.ts` — 30-entry library of emoji+word pairs; `assignNickname(usedWords)` function
- `src/data/courts.ts` — All 94 federal district courts + primary state trial courts for all 50 states + DC
- `src/components/CaseHealthBar.tsx` — Shows progress dots for Parties/Court/Story/Timeline/Documents; compact and full modes

### HomeView redesign
- Case-centric: "Continue Your Case" as primary section with `PrimaryCaseCard` (health bar + single next-step CTA)
- Other active cases, closed cases, recent incidents all shown below
- "New Case" button at bottom; FAB (⊕) now calls `handleCreateNewCase` instead of `openNewIncident`
- DesktopSideNav label changed from "New Incident" to "New Case"

### New case creation flow
- `handleCreateNewCase()` creates blank HLCase with workflowStage:"parties" → navigates to case_parties
- `handleConvertToCase(incident)` pre-fills story from incident.description → navigates to case_parties
- `handleUploadForNewCase()` keeps navigating to case_detail (upload shortcut skips workflow as per spec)
- `handleContinueCase(hlCase, stage)` maps WorkflowStage → correct view type

### AI endpoint (POST /ai/timeline)
- Added to api-server/src/services/ai.ts: `buildTimeline(story)` method using `parseJsonArray`
- Added to api-server/src/routes/ai.ts: `/ai/timeline` route with auth + rate limit
- Added `"timeline"` to `AiFeature` union in aiCache.ts
- Added `buildTimeline()` to frontend aiApi.ts

### Tutor bug fix
- `sendChat` catch block now branches on `e.code`: ai_not_configured, rate_limited, insufficient_credits
- Shows specific helpful messages instead of generic "Couldn't get a response"

### Bug fix
- `deleteReminder` in store.ts had typo `r.id !== r.id` (always true → never deleted); fixed to `r.id !== id`

## What remains to build (from spec)
- Phase 5: AI Assembly (builds complaint, matches claims, detects gaps) — needs new AI endpoint
- Phase 6: Learning Index (per-allegation statute/precedent/plain-English) — new AI endpoint
- Intake Checklist UI (checkboxes for evidence types, each opens small form)
- Upload Shortcut (detect complaint upload → auto-extract to parties/court/timeline)
- Evidence Modules (moved out of primary workflow per spec)
- Tutor "Prompts user before adding anything new" behavior
- Case title editing in the parties phase (title is currently "New Case")

**Why:**
The spec calls for a linear 9-phase workflow replacing the incident-centric dashboard. Phase 1–4 are the intake phases (Parties, Court, Story, Timeline). This session built all four plus the home screen redesign. Phases 5–9 require more AI endpoints and will be built in subsequent sessions.

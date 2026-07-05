---
name: HyperLaw Rebuild Phase 1
description: New data model, 4 workflow screens, WorkflowStepper, WhyThisMatters, CaseReviewView, auto-save, version history — all completed in Phase 1 QA task.
---

## Data Model (types.ts)
- `Party`, `Court`, `TimelineEvent`, `WorkflowStage` union
- `StorySnapshot`, `TimelineSnapshot` (version history, optional, max 10 each)
- `HLCase` extended with: `parties`, `court`, `story`, `timeline`, `workflowStage`, `intakeChecklist`, `storyHistory?`, `timelineHistory?`
- Helpers: `computeCaseHealth()`, `getNextStep()`, `caseCompletionPct()`

## Workflow Screens (src/pages/workflow/)
- `PartiesView.tsx` — Parties, add/edit/delete, Official/Civilian, emoji nicknames, WorkflowStepper + WhyThisMatters + sticky bottom bar
- `CourtSelectionView.tsx` — Federal/State → state search → court list; auto-saves on court select (no extra tap needed)
- `StoryView.tsx` — large textarea + Web Speech API mic; auto-saves (800ms debounce) using stable `useCallback` + refs to avoid stale-closure loop; 30s version snapshots; restore history drawer; unmount cleanup for recognition + timers
- `TimelineView.tsx` — AI-built timeline; auto-saves via same ref pattern; rebuild confirms before overwriting; version history; skips first-render save

## Shared Components
- `WorkflowStepper.tsx` — 4-step progress bar (Parties/Court/Story/Timeline); done=green check, active=orange
- `WhyThisMatters.tsx` — collapsible card with HelpCircle toggle; CSS fade-in animation
- `CaseReviewView.tsx` — read-only summary of all 4 phases; per-phase Edit buttons; sticky bottom CTA; incomplete-section warning banner

## Navigation Flow
```
case_parties → case_court → case_story → case_timeline → case_review → case_detail
```
- `handleContinueCase` routes to the correct workflow step or `case_detail` if stage="documents"
- `CaseDetailView` has `onGoToPhase` prop (optional); renders a "Complete Your Case Setup" banner listing missing phases with direct-nav buttons

## Critical Auto-Save Pattern (prevents stale-closure loop)
**Why:** `useCallback([hlCase, onUpdate])` causes `scheduleAutoSave` to recreate on every save, retriggers `useEffect`, causes infinite save loop.
**Fix:** Use stable refs (`hlCaseRef.current = hlCase`; `onUpdateRef.current = onUpdate`) inside a `useCallback([], [])` with empty deps. Guard with `if (newStory === currentCase.story) return` to skip no-op saves.
**How to apply:** Any debounced save that reads mutable parent props must use this ref pattern, not put props in useCallback deps.

## ORANGE inconsistency
App.tsx uses `"#d9711f"`; workflow files use `"#f45d01"` — intentionally left as-is (isolated, not a functional issue). CaseReviewView and shared components use `"#f45d01"` to match workflow files.

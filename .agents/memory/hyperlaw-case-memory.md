---
name: HyperLaw Case Memory Architecture
description: New document analysis engine — buildCaseMemory replaces analyzeDocumentWithIntake; CaseMemory schema; 11-checkpoint logging; success phase UI.
---

## Rule
`buildCaseMemory` is the canonical analysis method. Never re-introduce `analyzeDocumentWithIntake` for the intake flow.

**Why:** The old flow produced 0-token log entries because the idempotency guard fired on empty `caseExtraction` objects, and 402s because users had no credits. The new flow separates concerns cleanly and logs every failure step.

## CaseMemory schema (backend + frontend must stay in sync)
Fields: `caseSummary`, `factPattern`, `parties`, `events`, `evidence`, `witnesses`, `agencies`, `claims`, `locations`, `openQuestions`, `jurisdictionSuggestions`.
Old `DocumentIntakeAnalysis` had `summary`, `timeline`, `legalIssues` — these are gone from the intake flow but the interface still exists for `extractFromDocument` (chat context).

## Key files
- `artifacts/api-server/src/services/ai.ts` — `buildCaseMemory()` method; `CaseMemory` interface
- `artifacts/api-server/src/services/aiCache.ts` — feature union includes `"build_case_memory"`
- `artifacts/api-server/src/routes/ai.ts` — `POST /ai/analyze-document` has 11 STEP checkpoints + `logFailure()` helper writing to `errorLogsTable`
- `artifacts/legal-screen-builder/src/lib/aiApi.ts` — `buildCaseMemory()` client call; `CaseMemory` interface; featureLabel `"build_case_memory"` → "Case Memory Build"
- `artifacts/legal-screen-builder/src/App.tsx` — `DocumentIntakeView` has `"success"` phase; uses `caseSummary` / `events` / `claims` field names

## Idempotency guard
Checks `stored.caseSummary || stored.summary` AND `Object.keys(stored).length >= 3`. An empty `{}` from a failed write no longer triggers the guard.

## Case Memory persistence
Stored under `caseData.caseMemory` (JSONB) on the `casesTable` row. Parties merged into `caseData.parties`, events merged into `caseData.timeline`. No new DB column needed.

## Navigation bug fixed
`CaseDetailView.onBack` and `handleDeleteCaseWithSync` both call `goHome()` (sets view + navTab to "home"). Previously only set view, leaving navTab="builder" which rendered ExhibitStudioView instead of the cases list.

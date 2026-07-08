---
name: HyperLaw Document Intake Redesign
description: 5-step guided intake wizard before AI analysis; upload stores only, credit deducted at analyze step
---

## CRITICAL: Two separate upload entry points

There are TWO upload entry points — both must route through the intake wizard:

1. **HomeView "Start from a Document"** → `handleUploadForNewCase(file)` in App.tsx. This is the primary new-case creation path. It now: stores file → creates case shell → navigates to `{ type: "document_intake" }` view. Before this fix it went directly to `case_detail`.

2. **CaseDetailView DOCUMENTS section** → inline intake wizard in `CaseDetailView` (states: receiving→received→intake→gate→analyzing→done). Used for adding documents to an existing case.

The `DocumentIntakeView` component (standalone full-screen, placed before ProfileView in App.tsx) handles the HomeView path. It accepts `docId`, `caseId`, `fileName`, `onComplete(analysis)`, `onCancel`.

## Architecture

**Upload split into two endpoints:**
- `POST /api/ai/upload` — parse text + store only, NO AI. Returns `{ docId, fileName, wordCount }`. Credit-free.
- `POST /api/ai/analyze-document` — deducts 1 credit, calls `aiService.analyzeDocumentWithIntake()`, updates case caseData JSONB. Idempotency: checks `uploadedDocumentsTable.caseExtraction` — if non-null, returns cached result without charging.

**Frontend state machine** (uploadState):
`idle` → `receiving` (store upload) → `received` (success banner + Start button) → `intake` (5-step wizard) → `gate` (premium screen + HoldToAnalyzeButton) → `analyzing` → `done` | `error`

**Why separate upload from analyze:**
- User must answer 5 intake questions before AI runs
- Credit is only spent when user explicitly holds the analyze button
- Doc text is stored server-side so it can be sent with intake context

## Key constraints

**Party/timeline ARE now merged from AI output** (supersedes the earlier "notes only" note). `Party` requires `firstName`, `lastName`, `type` (official|civilian), `nickname`, `nicknameEmoji`; AI gives only `name` + `role`. `mergeAnalysisIntoCase()` in App.tsx maps them (split name into first/last; infer official via keyword regex; `assignNickname()` from lib/nicknames for nickname/emoji) and fills ONLY empty case fields. Names are kept honest (no fabricated last names). See hyperlaw-case-sync.md for the fill-empty-only rule and the clobber constraint.

**TimelineEvent** requires `id/title/description/order` (no `date` field). `mergeAnalysisIntoCase()` maps AI events (title=date, description=description+significance, order=index) — only when `hlCase.timeline` is empty.

**AiFeature union** in `artifacts/api-server/src/services/aiCache.ts` must include `"analyze_document_intake"` for logAiCall typing.

## Intake questions (5 steps)
- Q0: docType (8 options, 2-col grid)
- Q1: preparedBy (Attorney / Self Prepared / Not Sure)
- Q2: hasParties (Yes / No / Partially)
- Q3: hasDates (Yes / No / Partially)
- Q4: additionalContext (free textarea, optional)

**Why:** Provides Claude context so analysis is more accurate than raw document parsing.

## DocumentIntakeAnalysis type
Defined in both `artifacts/api-server/src/services/ai.ts` and `artifacts/legal-screen-builder/src/lib/aiApi.ts` (must stay in sync).
Returns: `{ title, summary, parties[], timeline[], evidence[], legalIssues[], openQuestions[], notes? }`.

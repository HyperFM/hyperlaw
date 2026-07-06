---
name: HyperLaw Document Intake Redesign
description: 5-step guided intake wizard before AI analysis; upload stores only, credit deducted at analyze step
---

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

**Party type cannot be merged from AI output** — `Party` requires `firstName`, `lastName`, `type` (official|civilian), `nickname`, `nicknameEmoji`. AI extraction only gives us `name` + `role`. Instead, AI summary is merged into `hlCase.notes` only; server-side case merges use the flexible `caseData` JSONB.

**TimelineEvent** requires `order: number`, no `date` field. Same issue — don't directly inject AI timeline into `HLCase.timeline`.

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

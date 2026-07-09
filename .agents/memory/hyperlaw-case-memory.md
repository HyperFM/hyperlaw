---
name: HyperLaw Case Memory System
description: Five-table persistent case memory architecture; context injection into all AI calls; rolling summarization; history strip + sticky status bar on case screen
---

## Tables (lib/db/src/schema/index.ts)

Five new tables, all keyed on `case_id` (text, no FK — avoids cascade complexity):
- `case_facts` — discrete facts with supersede chain (fact_type, source, superseded_by)
- `case_history` — events written automatically after docs generated, guidance complete, doc uploaded (item_type, title, content_ref, short_summary)
- `litigation_timeline` — court deadlines/events (event_type, event_date, status: upcoming|completed|missed)
- `case_strategy_memory` — open/resolved strategic notes (category, status, resolved_at)
- `memory_summaries` — rolling summaries (summary_type: rolling_case_summary|strategy_summary; content; token_count)

All have a caseId index.

## Context injection (services/caseContext.ts)

`buildCaseContext(caseId)` — parallel-queries memorySummaries (rolling), caseStrategyMemory (open items), litigationTimeline (last 5 + upcoming). Returns a formatted CASE CONTEXT block or "" if nothing recorded yet. Never throws.

`loadCaseContext()` in ai.ts calls `buildCaseContext` and prepends its output to the existing caseData-derived context block. Every guidance session, draft, and analysis gets this automatically.

## History writes (services/memorySummarizer.ts)

`recordCaseEvent({ caseId, itemType, title, contentRef, shortSummary })` — inserts a case_history row, then fires an async rolling-summary update via claude-3-5-haiku-20241022. Never throws to caller.

Hooked into:
- generate-document: after saving (uses `aiResult.data` for word count)
- guidance /complete: after mergeGuidanceIntoCase (in the owned/claimed path only)

## API endpoint

`GET /ai/cases/:caseId/history` in ai.ts — merges last-5 case_history + last-5 litigation_timeline, sorts by date, returns top 5. Used by the client history strip.

## UI (App.tsx CaseDetailView)

- **Recent Activity strip**: shown after status badge, before AssemblyProgress. Tappable items expand shortSummary. Fetched via `aiApi.getCaseHistory()` on mount.
- **Sticky status bar**: `position: sticky; bottom: 0` div at the very end of CaseDetailView JSX (before closing div). Always shows case title (truncated) + tappable status badge. Replaces the one-off post-creation toast.

## Why haiku for summarization

Rolling summaries use claude-3-5-haiku-20241022 (cheap, fast, no thinking blocks). Main AI calls still use claude-sonnet. Scan for first text block in all Anthropic responses (haiku never has thinking blocks but the pattern is defensive).

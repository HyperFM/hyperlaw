---
name: HyperLaw Phase 2 Core Platform
description: Assembly, Learning Index, Intake Checklist, Evidence types, navigation chain, getNextStep progression, cache call signatures.
---

## What was built (Phase 2)

**New workflow screens:** `AssemblyView.tsx`, `LearningIndexView.tsx`, `IntakeChecklistView.tsx`
**New API routes:** `POST /ai/assembly`, `POST /ai/learning`
**New service methods:** `AiService.assembleCase()`, `AiService.buildLearning()`
**New types in types.ts:** `CaseAssembly`, `AssemblyPotentialClaim`, `LearningAuthority`, `EvidenceType`, `EvidenceItem` — all optional fields on `HLCase`

## Navigation chain (complete)

`case_parties → case_court → case_story → case_timeline → case_review → case_assembly → case_learning → case_detail`

`AppView` union includes `case_assembly` and `case_learning` (both carry `caseId: string`).

## getNextStep() progression (types.ts)

Now includes assembly and learning stages:
```
parties → court → story → timeline → assembly (if !c.assembly) → learning (if !c.learningAuthorities?.length) → documents
```

`PrimaryCaseCard` mini-checklist mirrors this 5-step bar: Parties/Court/Story/Timeline/Assembly.

## CacheApi signatures (CRITICAL — always verify)

```typescript
// getFromCache — takes (userId, cacheKey), returns { result, createdAt } | null
const cached = await getFromCache(userId, cacheKey);
if (cached) res.json({ ...(cached.result as object), fromCache: true, cachedAt: cached.createdAt.toISOString() });

// setCache — takes (userId, cacheKey, feature, result)
await setCache(userId, cacheKey, "assembly", result.data);

// logAiCall — uses estimatedCostMicroUsd (not costMicroUsd), no cacheKey field
await logAiCall({ userId, feature, model, inputTokens, outputTokens, estimatedCostMicroUsd, responseTimeMs, cacheHit, caseId });

// checkDailyLimit returns { allowed, count, limit } — use count not used
if (!limitResult.allowed) res.status(429).json({ code: "rate_limited", error: `... ${limitResult.count}/${limitResult.limit}` });
```

**Why:** First implementation used wrong arg order/names and caused silent cache failures + TS errors. Always match the exact signatures above.

## CaseDetailView tabs

Added `caseDetailTab` state ("overview" | "checklist"). Tab bar appears after the action buttons. Overview tab = existing documents/incidents/notes content. Checklist tab = `IntakeChecklistView`. The overview content is wrapped in `{caseDetailTab === "overview" && (<>...</>)}`.

## Prompt constraints (AI service)

Both `assembleCase` and `buildLearning` prompts explicitly state: "NEVER invent, assume, or extrapolate any fact not in the input." Potential claims labeled as AI suggestions only. Use `[BRACKETED PLACEHOLDERS]` for missing required fields in complaint drafts.

**How to apply:** Any new AI feature that generates legal content must include similar anti-fabrication constraints in the system prompt and user prompt.

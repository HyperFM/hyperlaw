---
name: HyperLaw case sync clobber
description: Why case-field updates can silently overwrite server-merged data, and the fill-empty-only rule that guards against it.
---

# HyperLaw case sync (clobber constraint)

`setData(d)` in App.tsx debounce-upserts the **entire local case object** to the
server (`api.cases.upsert` with the whole `caseData`), ~1.5s after any change.
Mount-time hydration (`api.cases.list`) is **"local wins"**: for a case that
already exists locally it only fills fields that are *empty locally* from the
server (structuredCase, parties, timeline, jurisdiction). It never overwrites a
non-empty local field.

**Trap:** any code that calls `onUpdateCase({ ...hlCase, ...patch })` with a
*stale* `hlCase` pushes the stale full blob to the server and clobbers fields the
backend just merged (e.g. `analyze-document` merges parties/timeline into the DB
case). This is why "the AI extracted 10 parties but the case stayed empty."

**Rule — fill empty fields only.** When reacting to a server/AI result, merge it
into the case *before* calling onUpdateCase, writing only fields that are empty
so you never overwrite user edits or newer server data. `mergeAnalysisIntoCase()`
in App.tsx is the canonical example (notes append is idempotent; jurisdiction /
parties / timeline only when empty; AI parties are mapped to `Party` via
name-split + official-keyword inference + `assignNickname()` from lib/nicknames).

**Why:** cases have no revision/version field, so there is no server-authoritative
reconciliation — last full-blob write wins. Until a revisioning/server-merge
scheme is added, "fill-empty-only on write" + "hydration fills empty-local only"
is the guardrail. A proper fix would add per-field revisioning.

**Related gotcha:** CaseDetailView holds `notes` in local `useState`; it must
sync from `hlCase.notes` via `useEffect(..., [hlCase.notes])`, or a later
textarea blur writes the stale local notes back and erases external appends
(like the AI case summary). Same pattern applies to any always-mounted local
editor whose source prop can change underneath it.

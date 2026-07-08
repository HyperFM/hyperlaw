---
name: HyperLaw document drafting flow
description: Contracts and pitfalls for the CaseDetailView "Draft Documents" flow — draftContext shape, always-mounted modal reset, IFP template wiring.
---

# HyperLaw document drafting flow

Assembly (CaseDetailView) drafting UI: a group-of-4 draft buttons + separate Strengthen + Respond-to-filing (Defense) + Fee-waiver (IFP) + a "More documents" expander. Each guided flow gathers answers upfront, then makes ONE `aiApi.generateDocument` call.

## draftContext is a preformatted STRING end-to-end (server accepts string OR object)
All client flows (DraftQuestionsModal, IfpWizard, DefenseModal) build `draftContext` as a single labeled string; the client `generateDocument` type is `string`.
The server `generateLegalDocument` opts type is `string | Record<string, unknown>` and injects a string directly.
**Why:** the server originally typed it `Record<string, unknown>` and ran `Object.keys()/Object.entries()` on it. A string there iterates PER CHARACTER (`Object.entries("ab") → [["0","a"],["1","b"]]`), silently mangling every guided answer into the prompt — the draft looked plausible but ignored the applicant's inputs.
**How to apply:** new drafting entrypoints should keep sending a preformatted string. If you ever switch a caller to an object, confirm the server's string branch still handles the other callers — the contract is deliberately dual.

## Always-mounted `open`-prop modals must reset state on open
IfpWizard and DefenseModal are rendered unconditionally in CaseDetailView with an `open` prop (they early-return `null` when closed), so their instance stays mounted and `useState` persists across close→reopen. Both MUST have `useEffect(() => { if (!open) return; /* reset step/answers/result/signature/error */ }, [open])`.
DraftQuestionsModal is instead conditionally mounted (`{draftModal && <DraftQuestionsModal/>}`), so it remounts fresh each open and needs no reset effect.
**Why:** without the reset, reopening the fee-waiver/defense wizard reuses stale step/answers/signature and can generate a document from a previous session's inputs.
**How to apply:** a new always-mounted `open`-prop modal here needs the reset effect; a conditionally-mounted one does not.

## IFP template body must reach generation as sourceDocument
The admin IFP template library (AdminPanel "Templates" tab → `aiApi.ifpTemplates` CRUD) is matched by jurisdiction via `aiApi.ifp.match`. IfpWizard uses the matched template's `fields` for the intake form AND must pass its `body` as `sourceDocument` on the final `fee_waiver` generate call.
**Why:** if only `fields` are consumed, the admin-authored template body never influences the output and the template CRUD is cosmetic. `fee_waiver` is not in server NEEDS_SOURCE, so `sourceDocument` is optional but still injected as the SOURCE DOCUMENT block.
**How to apply:** for any "match a stored template → generate" flow, feed the template body into the prompt (sourceDocument or draftContext), not just its field schema.

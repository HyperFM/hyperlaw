---
name: HyperLaw Assembly screen & case card redesign
description: Durable design constraints for the case screen (Assembly) and the home case card — what must NOT be re-added.
---

# Assembly screen & case card — design constraints

These come from the user's consolidated "Assembly Screen Redesign & Safety" brief. They
are explicit directives the user cares about; re-violating them reads as "you ignored me."

## Case card (PrimaryCaseCard, home/slider) — keep it SLIM
- Layout: date/court on top → tappable photo + title + stage row → ONE long animated
  "document" line button. Tapping anything opens the case (`onOpen`).
- Do NOT put a dynamic next-step CTA on the card. It used to render `getNextStep().label`,
  which shows **"Add Parties"** when parties are empty — the user raged about this exact
  button repeatedly. Never bring back a card CTA whose label is the next workflow step.
- Do NOT put a 5-phase "Case Health" checklist on the card. It makes the card bulky, which
  the brief explicitly rejects. Progress belongs on the Assembly screen, not the card.
- **Why:** the card is the first thing the user sees; the "Add Parties" button + bulk were
  their top complaints. **How to apply:** if asked to "show progress on the card," push back
  or use a subtle accent on the doc line only — not a checklist or step CTA.

## Notes section removed from the Assembly/case screen (brief §8)
- There is no manual Notes textarea on `CaseDetailView`. Do NOT re-add one.
- BUT the `hlCase.notes` **data field is retained** as background context: `mergeAnalysisIntoCase`
  appends the AI case summary into it, `VerifyPanel` `hasFacts` reads it, and `generateDocument`
  passes it in `caseData.notes`. If you ever remove the field entirely, also update the
  VerifyPanel "Facts captured" hint and the generation payload.
- **Why:** user wants the screen decluttered but the AI summary still needs to feed drafting.

## IfpWizard done-step: onGenerated must fire on EVERY close path (Appendix A)
- The wizard now has a step-4 "You're doing a good job." done screen. `generate()` stores the
  server doc in local `genDoc` state and advances to step 4 instead of firing `onGenerated`
  immediately (the old behavior called `onGenerated`+`onClose` inline).
- **Trap:** once a doc is generated, the header X (and any dismiss path), not just the primary
  CTA, must propagate it — route all closes through one `handleClose` = `if (genDoc) onGenerated(genDoc); onClose();`.
  Otherwise closing via X on the done step silently drops a paid-for generated doc until reload.
- **Why:** deferring `onGenerated` to a CTA created a close-path regression a code review caught.
  **How to apply:** any modal that defers a success callback behind a "review/continue" button
  must still fire that callback on X/backdrop/escape when the result already exists.
- Also de-dupe `extraFields` by key (against group keys AND repeats in form/template metadata)
  before render/prompt — duplicate keys from `ifpFindForm` cause React key collisions.

## Assembly screen ambience (brief §1-3, §9) — className↔CSS coupling
- CaseDetailView root uses `className="hl-assembly"` + `position:relative`; the glow/press/drift
  live in `index.css` keyframes `hlSideGlow` / `hlMilkDrift` / `hlConfirmFlash` and a
  `.hl-assembly button:active` press rule — all **before** the `prefers-reduced-motion` guard
  that disables them. Removing the className silently kills the press feedback + side glow.
- "Case details confirmed" flash = `showConfirmedFlash` set right after `setUploadState("done")`,
  self-clears via a 2600ms `setTimeout` effect. Skipped AssemblyProgress steps (`!done &&
  hlCase.structuredCase`) render WHITE (auto-organized from a doc), not dark (still to-do).

## MSJ drafting gates (DraftQuestionsModal, `isMSJ`)
- Motion for Summary Judgment shows two upfront gates before the single generate call:
  (1) "is your complaint strong enough?" — "Not yet" blocks and tells them to Strengthen first;
  (2) confirm "draft from the complaint, treating evidence as accurate." Both reset on open and
  are written into the one `draftContext` string.
- Reinforces the standing rule: gather ALL drafting questions upfront → ONE Sonnet call. No
  draft-stop-redraft. Non-MSJ doc types are unaffected (all new UI guarded by `isMSJ`).

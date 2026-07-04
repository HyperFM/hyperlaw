---
name: Compliance Language Manager
description: How HyperLaw's centralized compliance notice system works and where all call sites live.
---

# Compliance Language Manager

## Rule
All legal notice text lives in `artifacts/legal-screen-builder/src/lib/compliance.ts`. No component should hardcode a disclaimer — import from compliance.ts instead.

**Why:** The spec requires that changing one notice updates it everywhere. Scattered hardcoded strings were the previous state; they created drift risk.

## How to apply
- Use `COMPLIANCE.KEY` for components without jurisdiction context (WelcomeModal, DocGenConfirmModal, footer bar).
- Use `getNotice("KEY", jurisdiction)` when a case/incident jurisdiction is in scope (TutorView, doc generation) — enables future state-specific overrides without changing call sites.

## Wired call sites (as of implementation)
| Location | Keys used |
|---|---|
| `src/components/WelcomeModal.tsx` | `WELCOME_DISCLAIMER` |
| `src/components/DocGenConfirmModal.tsx` | `DOC_REVIEW_NOTICE`, `DRAFTING_ASSISTANT` |
| `src/components/DocumentViewerModal.tsx` | `VERIFICATION_CHECKLIST` (checklist items), `AI_GENERATED_SHORT` (doc footer), `EXPORT_NOTICE` (PDF print footer), `TTS_WARNING`, `TTS_REVIEW_ACKNOWLEDGMENT` |
| `src/App.tsx` TutorView | `AI_ANALYSIS_BANNER` (Layer Two banner), `EDUCATIONAL_CONTENT` (Layer One banner — always shown when AI unavailable) |
| `src/App.tsx` footer bar | `FOOTER_TAGLINE` |

## Layer One disclaimer
Per spec, Layer One (static/knowledge-library) content is NOT exempt from disclaimers. Implemented as a second banner block in TutorView rendered when `!aiAvailable && analysis` — additive, does not replace the existing AI banner.

## Verification checklist
`VERIFICATION_CHECKLIST` in compliance.ts holds the 7 spec-exact items. `DocumentViewerModal` initializes checklist state from it. To change checklist text, edit compliance.ts only.

## Future jurisdiction variants
`JURISDICTION_OVERRIDES` in compliance.ts is the extension point. Add a state key with a partial `COMPLIANCE` override. `getNotice()` does case-insensitive lookup — no call site changes needed.

## ZDR note
`DATA_RETENTION` constant contains a placeholder comment. Must be updated to reflect actual Anthropic ZDR setting before launch — this is a founder decision, not a code task.

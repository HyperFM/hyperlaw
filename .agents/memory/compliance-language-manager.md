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
| `src/App.tsx` TutorView | `AI_ANALYSIS_BANNER` (Layer Two banner), `EDUCATIONAL_CONTENT` (Layer One banner) |
| `src/App.tsx` footer bar | `FOOTER_TAGLINE` |

## ZDR note
`DATA_RETENTION` constant contains a placeholder comment. Must be updated to reflect actual Anthropic ZDR setting before launch — this is a founder decision, not a code task.

---
name: HyperLaw architecture
description: AI service layer pattern and key design decisions for HyperLaw
---

## TutorService interface
All AI features go through `src/services/tutor.ts`. The `TutorService` interface defines:
- `getInsights(project)` → `TutorInsight[]`
- `getLearningCards(project)` → `LearningCard[]`

Current impl: `staticTutorService` uses keyword detection + screen-type analysis.
Future impl: drop-in Claude-backed version — UI never changes.

**Why:** Brief explicitly requires AI behind interfaces so UI doesn't need to change when engine upgrades.

## Easter egg
Hidden H logo at bottom of ProfileView. Requires 5 rapid taps to trigger. Opens `EasterEggScreen` (white fade-in) with founder copy items that are copyable.

## Logo
`/hyperlaw-logo.png` in `artifacts/legal-screen-builder/public/`. Used in sidebar, header (mobile), and easter egg screen.

## App was previously named "Legal Screen Builder"
All references renamed to "HyperLaw" in UI text and branding.

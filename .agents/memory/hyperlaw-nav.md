---
name: HyperLaw nav structure
description: Navigation state architecture — modular tab system
---

## Top-level state
- `navTab: NavTab` = "home" | "build" | "tutor" | "profile"
- `buildView: BuildView` = "screens" | "pick_type" | "build_flow" | "edit"

## NAV_ITEMS registry
In `App.tsx`, `NAV_ITEMS` is an array of `NavItem` objects. Add new tabs here — both mobile bottom nav and desktop sidebar consume this same array automatically.

The center FAB slot is marked with `center: true`. Left/right items are computed from position relative to the FAB item.

**Why:** User requested modular/expandable nav so future tabs don't require redesign.

## Mobile vs Desktop
- Mobile: `BottomNavBar` with center FAB, Build sub-tabs shown as a secondary bar above the bottom nav when in Build tab
- Desktop: `DesktopSideNav` left sidebar (200px) + content area

## API key banner
`ApiKeyBanner` renders below the header, dismissible via X. State: `showBanner` boolean in App root.

---
name: HyperLaw Creator Page & Profile Photo
description: About the Creator page, profile photo upload system, and creator button in Profile tab.
---

## Profile Photo Upload
- Stored as base64 data URL in `localStorage` key `hl_profile_photo`
- `ProfileIcon` component (used in both BottomNavBar and DesktopSideNav) reads from localStorage on mount and listens to `window.dispatchEvent(new Event("profilePhotoChanged"))` to update reactively
- `ProfileView` has two hidden `<input type="file">` refs: one with `capture="user"` (camera), one without (gallery)
- After processing a file, the input's `.value` is reset to `""` so re-selecting the same file works
- localStorage write is wrapped in try/catch with user alert for oversized images

## Creator Button (Profile Tab)
- Displayed at the bottom of ProfileView, above the egg section
- Uses `/creator-logo.jpeg` (public folder), circular crop, orange glow box-shadow
- Navigates to `{ type: "about_creator" }` AppView via `onAboutCreator` prop

## About Creator Page
- File: `artifacts/legal-screen-builder/src/pages/creator/AboutCreatorView.tsx`
- AppView union: `{ type: "about_creator" }` — routed **before** navTab checks in `currentContent()` so it works regardless of active tab
- Back button returns to `{ type: "home" }` (sets navTab stays on "profile")
- Hero image: `/creator-hero.jpeg`, full-width, 72dvh tall, dark gradient fade overlay
- Personal note: exact text provided by user
- Carousel: 7 images (`/timeline-1.png` through `/timeline-7.png`), touch-swipe + arrow buttons + dot indicators, tap-to-lightbox
- CTA: links to https://beacons.ai/hyperfm

## Public Images Added
- `/creator-logo.jpeg` — circular B&W logo
- `/creator-hero.jpeg` — B&W fashion hero photo
- `/timeline-1.png` through `/timeline-7.png` — injustice timeline carousel

**Why:** Creator asked for a personal About page accessible from the Profile tab, with profile photo upload capability.

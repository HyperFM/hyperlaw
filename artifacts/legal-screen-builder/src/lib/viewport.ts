// On iOS "Add to Home Screen" standalone launches, window.innerHeight (and
// CSS dvh, which tracks the same underlying value) starts out wrong — it
// over-reports the real height by roughly the status bar's height — and only
// self-corrects a moment later, once the native status bar has settled in.
// document.documentElement.clientHeight does NOT have this lag; it's correct
// from the very first reading. --app-100dvh (set in index.html, from
// clientHeight) is the reliable value every full-screen view should use
// instead of 100dvh directly.
//
// clientHeight itself excludes the home-indicator reserved strip at the
// bottom (confirmed on-device: safe-area-inset-bottom measured at 34px,
// matching the consistent small gap every screen was still showing) — the
// background should still paint all the way to the true screen edge there,
// even though interactive controls need their own padding to stay clear of
// it. env() is live CSS, not a JS measurement, so it doesn't have any of the
// timing issues everything else here has run into.
export const FULL_HEIGHT = "calc(var(--app-100dvh, 100dvh) + env(safe-area-inset-bottom))";

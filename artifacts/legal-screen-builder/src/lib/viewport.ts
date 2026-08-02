// On iOS "Add to Home Screen" standalone launches, window.innerHeight (and
// CSS dvh, which tracks the same underlying value) starts out wrong — it
// over-reports the real height by roughly the status bar's height — and only
// self-corrects a moment later, once the native status bar has settled in.
// document.documentElement.clientHeight does NOT have this lag; it's correct
// from the very first reading. --app-100dvh (set in index.html, from
// clientHeight) is the reliable value every full-screen view should use
// instead of 100dvh directly.
export const FULL_HEIGHT = "var(--app-100dvh, 100dvh)";

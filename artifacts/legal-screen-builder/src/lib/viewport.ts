// iOS "Add to Home Screen" standalone web apps have a longstanding WebKit bug
// where window.innerHeight (and by extension dvh) under-reports the real
// viewport height by a fixed amount — this is not a load-timing issue, the
// final settled value is simply wrong, which is why re-measuring on a delay
// never fixes it. -webkit-fill-available is WebKit's own purpose-built value
// for exactly this case. It's Safari/WebKit-only, so it's gated behind a
// feature check and falls back to the JS-measured --app-100dvh variable (set
// in index.html) everywhere else, which still helps with the separate,
// genuine toolbar-settle timing issue in ordinary Safari tabs.
export const FULL_HEIGHT: string =
  typeof CSS !== "undefined" && CSS.supports?.("height", "-webkit-fill-available")
    ? "-webkit-fill-available"
    : "var(--app-100dvh, 100dvh)";

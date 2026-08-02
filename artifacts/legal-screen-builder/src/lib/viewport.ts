import { useEffect } from "react";

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

// Neither dvh nor -webkit-fill-available actually closes the gap on real
// devices — only an actual manual scroll does. So instead of trying to
// measure the correct height up front, trigger that same tiny scroll
// ourselves on mount, which forces WebKit to recompute and settle on the
// real viewport, same as the manual fix. The index.html splash does the
// same trick for itself before React ever mounts; this covers every
// screen React renders afterward, since each is a fresh layout WebKit
// needs to settle for again.
export function nudgeViewportScroll(): void {
  const y = window.scrollY;
  window.scrollTo(0, y + 1);
  requestAnimationFrame(() => window.scrollTo(0, y));
}

export function useViewportNudge(deps: unknown[] = []): void {
  useEffect(() => {
    const timers = [50, 200, 500].map((ms) => setTimeout(nudgeViewportScroll, ms));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

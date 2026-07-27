---
name: iOS Safari hidden-video frame capture
description: Why offscreen <video> elements return stale pixels to drawImage on iOS Safari, and the in-viewport + requestVideoFrameCallback pattern that fixes it
---

# iOS Safari only presents frames for in-viewport video elements

**The rule:** To capture frames from a `<video>` with `drawImage` on iOS Safari, the element MUST be inside the viewport. Hide it by layering an opaque element on top (z-index), never by moving it off-screen.

**Why:** iOS Safari decouples decode position from frame presentation. For an element that is `display:none`, sized 1×1, `opacity:0`, or positioned off-viewport (e.g. `top:-9999px`), Safari advances `currentTime`/fires `seeked` normally but never writes new frames to the element's surface — so `drawImage` returns the first-ever-presented frame forever. Symptoms by hiding technique: `display:none` → black frames; 1×1 → throttled/stale; off-viewport 480×270 → correct timestamps, pixels byte-identical to frame 1. This burned ~13 debugging attempts (seek waits, warm-up seeks, pixel-stability polling, play-forward-then-pause) — all failed because none made the element visible.

**How to apply:**
- Place the extractor `<video>` in-viewport (e.g. 320×180, opacity 1) BEHIND an opaque UI element via z-index. DOM-sibling occlusion does not suppress presentation; only viewport/visibility culling does.
- Use `requestVideoFrameCallback` as the "frame actually presented" signal: arm one-shot rVFC → seek → callback fires with `mediaTime` → draw. Add a ~1.5s timeout fallback and a `seeked`+80ms path when rVFC is unavailable.
- rVFC "firing only once" on a hidden element is not flakiness — it is correctly reporting that only one frame was ever presented. It becomes reliable the moment the element is in-viewport.
- Plain seeks are fast enough once presentation works; play-forward-at-1× workarounds are unnecessary and painfully slow (~44s/frame on 4K).
- Safari fires no `seeked` for no-op seeks (Δ<5ms); detect and capture directly.
- CONFIRMED on-device: in-viewport + rVFC produced correct, position-accurate frames after 13 failed offscreen attempts.
- Some regions of a file can stall `fastSeek` (rVFC never fires) while the rest is instant. Waiting longer doesn't help — retry with a DIFFERENT strategy: short timeouts (~2.5s) on cheap rungs (fastSeek exact → fastSeek +2s for a different keyframe) before one long-timeout exact-seek rescue. A ±2s landing error is invisible in filmstrip tiles.

## Stale-tab trap during iOS debug marathons
- After a revert, the phone showed OLD behavior (blocking overlay, minutes-long strip build). Working tree was git-diff-verified identical to the user-approved commit (only cosmetic deltas). The code was fine; the device wasn't running it.
- **Why:** iOS Safari keeps executing the previously loaded bundle until the tab is force-closed (tab switcher → swipe away). An in-page refresh on a frozen/janked page often never lands. Long sessions repeatedly loading a 4K HEVC blob also wedge the per-tab video decoder — every seek stalls, each frame burns the full retry ladder (~13s × 20 ≈ 4-5 min) and 4K drawImage readbacks jank the UI into "frozen".
- **How to apply:** when a user reports pre-revert behavior after a revert, git-diff the working tree against the approved commit FIRST. If identical, do not edit code — have them force-close the Safari tab (not just refresh), reopen fresh, and if still stalling, restart the phone and check Low Power Mode. Tell them the visual signature of each version so they can self-identify which build they're on.

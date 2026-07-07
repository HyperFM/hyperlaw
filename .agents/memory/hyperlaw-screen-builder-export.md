---
name: HyperLaw Screen Builder revival + Exhibit video export
description: Why the manual Screen Builder needs types in types.ts + un-excluded engine/renderer, and the hard constraints of the canvas+MediaRecorder video export.
---

## Manual Screen Builder revives previously-dead code
The "Manual Screen Builder" (reached from the Exhibit Studio landing) is built on `src/engine.ts` (question-trees `TREES`, `buildScreen`, `detectSuggestion`, `generateBlocks`) and `src/BlockCanvas.tsx` (renderer). Those two files had been **excluded from `tsconfig.json`** only because the types they import were deleted in an earlier cleanup.

**Rule:** the builder types (`ScreenType`, `BlockType`, `Block`, `DataMap`, `QChoice`, `QNode`, `Screen`) live in `src/types.ts`, and `engine.ts` + `BlockCanvas.tsx` must stay OUT of the tsconfig `exclude` list. `laws.ts` is intentionally still excluded (out of scope).
**Why:** if someone re-deletes those types or re-excludes the files, the build silently drops these modules and the Screen Builder breaks with no type error pointing at the cause.
**How to apply:** before touching the builder, confirm the types still exist in `types.ts` and the two files are not re-excluded. Every tree in `TREES` uses `"start"` as its entry node key — the wizard relies on that.

## Real Exhibit video export = canvas + MediaRecorder (no ffmpeg)
Export composites the source video with full-screen exhibit "hold" slides (default 10s each, per-marker `holdSec` on `ExhibitMarker`) recorded in **real time** via `canvas.captureStream()` + `MediaRecorder`. Non-obvious constraints, all learned the hard way:

- **Start `video.play()` BEFORE creating the recorder, and capture audio only AFTER playback is live.** Capturing `video.captureStream().getAudioTracks()` before playback yields silent exports on some browsers.
- **Unmuted autoplay usually fails here** because the slide pre-render step (html2canvas) runs after the button click and consumes the user-activation window. Code falls back to muted playback (silent video) rather than failing. **Audio is best-effort**, by design.
- **A stall watchdog on `video.currentTime` is mandatory.** Without it, a wedged/blocked video means `currentTime` never advances and `ended` never fires, so `MediaRecorder` never stops and the export promise hangs forever. Watchdog flips `ended=true` after ~8s of no progress so remaining holds flush and recording stops.
- **Clean up streams:** stop all MediaStream tracks (canvas + captured audio) and revoke superseded blob object URLs (modal does this via a `useEffect` cleanup keyed on the result URL) or repeated exports leak.
- All resolution presets are **16:9** so the 1920×1080 exhibit slides fill the frame with no letterboxing of the slides themselves.

## Source video is not persisted
Only `videoFileName` is stored, never the video bytes. The user must **relink the video in-browser each session**, so export only works when a video is currently loaded (modal shows a relink hint when the object URL is null). Same-origin object URL → canvas untainted → MediaRecorder works.

## Pre-existing tsc noise (don't chase)
`tsc --noEmit` reports 6 errors unrelated to this work: `SpeechRecognition` DOM typings in `VideoWorkspaceView.tsx` (dictation) and a lucide `flexShrink` prop in `ExhibitStudioView.tsx`. They are tsc-only (esbuild/Vite ignore them) and predate the builder/export work.

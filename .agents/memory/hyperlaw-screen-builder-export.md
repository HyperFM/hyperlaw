---
name: HyperLaw Screen Builder + video export
description: Builder types, VideoWorkspaceView architecture, export pipeline, and moment-based editing flow.
---

## Builder types
- All builder types must stay in `types.ts`; `engine/BlockCanvas` must not be excluded from the TS build.

## Export pipeline
- Export is canvas+MediaRecorder (play before record, audio best-effort, stall watchdog).
- All presets are 16:9.

## Moment-based editing flow (Chunk → Label → Organize → Exhibit)
Replaced the old loop/scissors/split-point system. Key decisions:
- **No loop region, no splitPoints state** — both removed entirely.
- **`chunks: VideoChunk[]`** is the primary state (start/end/label/tag per chunk).
- **`markMoment()`** — bookmarks from `chunks[last].end ?? 0` to current playhead. The "lastMarkTime" is purely derived, not stored.
- **`splitChunk(id, at)`** — splits one chunk at playhead; replaces it with two in-place.
- **`removeChunk(id)`** — deletes chunk + creates a `video_cut` marker for export continuity.
- **`currentStep` (1–4)** + **`organizedSlots: (string|null)[]`** saved into `StudioProject` and `snapshotRef`.
- **`triggerAutosave`** now accepts optional `updatedChunks`, `updatedSlots`, `updatedStep` so callers can pass fresh values before React re-render.
- **`SlotCell`** component handles drag-drop for the Step 3 organize track; slots auto-expand when the last slot is filled.
- **Step 4** contains the old Exhibit/Media/Mic buttons unchanged.
- **`VideoTimeline`** no longer accepts `loopRegion`, `isLoopMode`, `splitPoints` props; uses `chunks`, `onSplitChunk`, `onRemoveChunk`, `step` instead.

**Why:** User spec (Pasted-HyperLaw-Exhibit-Studio-Update doc) called for a 4-step flow replacing free-form scissors editing with guided bookmarking.

**How to apply:** Any future addition to the studio panel should respect `currentStep` and only show controls relevant to that step. Export should consume `organizedSlots` order for the final exhibit sequence.

import { StudioProject, VideoSourceRef } from "../../types";

// ─── Multi-part video timeline ──────────────────────────────────────────────
// A project's video is 0..N ordered "sources" (parts of one recording split
// by a phone/camera), concatenated into a single virtual timeline. Every
// marker/chunk timestamp elsewhere in the app stays a plain "seconds into
// the concatenated timeline" number — these are the only functions that
// need to know "which source does this second actually belong to."

/** Migrates a project saved before multi-part support (single videoFileName/
 *  videoDurationSec) into a length-1 videoSources array. Old projects don't
 *  need any server/DB migration — this runs lazily on read. */
export function toVideoSources(
  project: Pick<StudioProject, "videoSources" | "videoFileName" | "videoDurationSec">
): VideoSourceRef[] {
  if (project.videoSources?.length) return project.videoSources;
  if (project.videoFileName) {
    return [{ id: "legacy", fileName: project.videoFileName, durationSec: project.videoDurationSec ?? 0 }];
  }
  return [];
}

export function totalDurationSec(sources: VideoSourceRef[]): number {
  return sources.reduce((sum, s) => sum + s.durationSec, 0);
}

/** Sum of durations of every source before `sourceIndex` — this source's
 *  start point on the virtual timeline. */
export function sourceOffsetSec(sources: VideoSourceRef[], sourceIndex: number): number {
  let sum = 0;
  for (let i = 0; i < sourceIndex && i < sources.length; i++) sum += sources[i].durationSec;
  return sum;
}

export interface SourcePoint {
  sourceIndex: number;
  localSec: number;
}

/** Maps a global timeline second to which source it falls in and the local
 *  offset within that source. Clamps into [0, totalDuration] and resolves an
 *  exact source boundary to the START of the NEXT source (not the tail end
 *  of the previous one) so playback never gets stuck re-triggering the last
 *  frame of a finished part. */
export function resolveGlobalTime(sources: VideoSourceRef[], globalSec: number): SourcePoint {
  if (sources.length === 0) return { sourceIndex: 0, localSec: 0 };
  const total = totalDurationSec(sources);
  const clamped = Math.min(Math.max(globalSec, 0), total);
  let elapsed = 0;
  for (let i = 0; i < sources.length; i++) {
    const dur = sources[i].durationSec;
    const isLast = i === sources.length - 1;
    if (clamped < elapsed + dur || isLast) {
      return { sourceIndex: i, localSec: Math.max(0, clamped - elapsed) };
    }
    elapsed += dur;
  }
  const lastIdx = sources.length - 1;
  return { sourceIndex: lastIdx, localSec: sources[lastIdx].durationSec };
}

/** The inverse of resolveGlobalTime — a source index + local offset back to
 *  a global timeline second. */
export function toGlobalTime(sources: VideoSourceRef[], sourceIndex: number, localSec: number): number {
  return sourceOffsetSec(sources, sourceIndex) + localSec;
}

export interface PickedFile {
  fileName: string;
}

export interface MatchAndSortResult<T extends PickedFile> {
  matched: { source: VideoSourceRef; picked: T }[];
  unmatchedPicked: T[];
  missingExpected: VideoSourceRef[];
}

/** Matches a freshly-picked set of files (in whatever order the user picked
 *  or dropped them) back against a project's saved, ordered video sources —
 *  purely by exact filename equality. No fuzzy/size/duration heuristics:
 *  those invite silently reordering to the WRONG order, which is worse than
 *  a clear "couldn't match this one" message. */
export function matchAndSortSources<T extends PickedFile>(
  picked: T[],
  expected: VideoSourceRef[]
): MatchAndSortResult<T> {
  const pickedByName = new Map<string, T>();
  for (const p of picked) pickedByName.set(p.fileName, p);

  const matched: { source: VideoSourceRef; picked: T }[] = [];
  const missingExpected: VideoSourceRef[] = [];
  for (const source of expected) {
    const found = pickedByName.get(source.fileName);
    if (found) {
      matched.push({ source, picked: found });
      pickedByName.delete(source.fileName);
    } else {
      missingExpected.push(source);
    }
  }
  return { matched, unmatchedPicked: Array.from(pickedByName.values()), missingExpected };
}

// ─── Exhibit Studio — IndexedDB workspace persistence ─────────────────────────
// Autosaves the active studio session (markers, timeline position, export
// settings, video file name) to IndexedDB so the workspace can be recovered
// after a tab close, browser crash, or mobile suspension.
//
// The video's actual bytes are NOT stored here, and never uploaded to the
// server either — same model as CapCut/iMovie: the source video only ever
// lives on-device for the current editing session (see VideoWorkspaceView's
// loadVideo header comment). Storing the whole blob locally used to be tried
// and had no real upper bound — it could silently eat many GB of a phone's
// storage for a video that never even finished saving. This file only keeps
// a small cache of extracted thumbnail images, so reopening a case doesn't
// redo the (slow) frame-extraction pass every single time the same file is
// reloaded.

import type { ExhibitMarker } from "../../types";

export interface ExportSettings {
  resKey: string;
  fps: number;
  format: "mp4" | "webm";
  includeAudio: boolean;
}

export interface StudioSnapshot {
  caseId: string;
  savedAt: number;
  markers: ExhibitMarker[];
  timelinePosition: number;
  videoFileName: string;
  exportSettings: ExportSettings;
}

interface ThumbnailCacheRecord {
  caseId: string;
  fileName: string;
  savedAt: number;
  // Cached filmstrip thumbnails for this exact video, so they don't need to
  // be regenerated (a real seek-by-seek extraction pass) every time the case
  // is reopened — only when the video itself changes. Keyed by absolute
  // timestamp in the source video, same as at generation time, so this is
  // unaffected by chunks being reordered in the Organize step. Small JPEG
  // data URLs at low res — nowhere near the scale that made storing the full
  // video locally a problem.
  thumbnails: string[];
}

const DB_NAME = "hyperlaw-studio";
// v3: the old "video-blobs" store held full video files locally (see header
// comment) — bumping the version deletes it outright on upgrade, reclaiming
// that space for anyone who had a video (successfully saved or not) sitting
// in it, then recreates it thumbnail-only.
const DB_VERSION = 3;
const STORE = "workspace-sessions";
const THUMBNAIL_STORE = "video-blobs"; // store name kept as-is; only its contents changed

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "caseId" });
      }
      // Delete and recreate — old records may carry a `blob` field this
      // version never writes again; dropping the store outright is the only
      // way to actually reclaim the disk space IndexedDB had allocated to it.
      if (db.objectStoreNames.contains(THUMBNAIL_STORE)) {
        db.deleteObjectStore(THUMBNAIL_STORE);
      }
      db.createObjectStore(THUMBNAIL_STORE, { keyPath: "caseId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Upsert a workspace snapshot. Failures are silently swallowed — this is
 *  purely a crash-safety net, not the authoritative data store. */
export async function saveStudioSnapshot(snapshot: StudioSnapshot): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(snapshot);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {
    /* non-fatal */
  }
}

/** Load the saved snapshot for a case, or null if none exists. */
export async function loadStudioSnapshot(caseId: string): Promise<StudioSnapshot | null> {
  try {
    const db = await openDB();
    return await new Promise<StudioSnapshot | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(caseId);
      req.onsuccess = () => { db.close(); resolve((req.result as StudioSnapshot) ?? null); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch {
    return null;
  }
}

/** Delete the snapshot for a case (called after restore or discard). */
export async function clearStudioSnapshot(caseId: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(caseId);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); }; // non-fatal
    });
  } catch {
    /* noop */
  }
}

/** Cache extracted thumbnails for a case's video, so reopening the case
 *  doesn't redo the frame-extraction pass. Silently swallowed on failure —
 *  purely a performance cache, thumbnails just regenerate next time. */
export async function saveThumbnails(caseId: string, fileName: string, thumbnails: string[]): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(THUMBNAIL_STORE, "readwrite");
      const record: ThumbnailCacheRecord = { caseId, fileName, savedAt: Date.now(), thumbnails };
      tx.objectStore(THUMBNAIL_STORE).put(record);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {
    /* non-fatal — thumbnails just regenerate next time */
  }
}

/** Load cached thumbnails for a case, or null if none are cached. */
export async function loadThumbnails(caseId: string): Promise<string[] | null> {
  try {
    const db = await openDB();
    return await new Promise<string[] | null>((resolve, reject) => {
      const tx = db.transaction(THUMBNAIL_STORE, "readonly");
      const req = tx.objectStore(THUMBNAIL_STORE).get(caseId);
      req.onsuccess = () => {
        db.close();
        const rec = req.result as ThumbnailCacheRecord | undefined;
        resolve(rec?.thumbnails ?? null);
      };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch {
    return null;
  }
}

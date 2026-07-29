// ─── Exhibit Studio — IndexedDB workspace persistence ─────────────────────────
// Autosaves the active studio session (markers, timeline position, export
// settings, video file name) to IndexedDB so the workspace can be recovered
// after a tab close, browser crash, or mobile suspension.
//
// The video file's actual bytes ARE stored here too (in a separate object
// store from the lightweight metadata above, so frequent metadata autosaves
// don't keep rewriting a large blob) — this is what lets the workspace
// reopen a case without re-picking the video file each time. It's still
// entirely local: the video never leaves the device, this is just the
// browser's own storage instead of a fresh file-picker prompt every time.

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

interface VideoBlobRecord {
  caseId: string;
  blob: Blob;
  fileName: string;
  savedAt: number;
}

const DB_NAME = "hyperlaw-studio";
const DB_VERSION = 2;
const STORE = "workspace-sessions";
const VIDEO_STORE = "video-blobs";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "caseId" });
      }
      if (!db.objectStoreNames.contains(VIDEO_STORE)) {
        db.createObjectStore(VIDEO_STORE, { keyPath: "caseId" });
      }
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

/** Save the video file's bytes for a case. Unlike the metadata snapshot
 *  above, this is NOT silently swallowed on failure (e.g. storage quota
 *  exceeded on a very large file) — it's the only copy of the video, so the
 *  caller needs to know it didn't stick and tell the user. */
export async function saveVideoBlob(caseId: string, blob: Blob, fileName: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(VIDEO_STORE, "readwrite");
    const record: VideoBlobRecord = { caseId, blob, fileName, savedAt: Date.now() };
    tx.objectStore(VIDEO_STORE).put(record);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Load the saved video for a case, or null if none was saved (or storage
 *  was cleared, e.g. the browser evicted it under storage pressure). */
export async function loadVideoBlob(caseId: string): Promise<{ blob: Blob; fileName: string } | null> {
  try {
    const db = await openDB();
    return await new Promise<{ blob: Blob; fileName: string } | null>((resolve, reject) => {
      const tx = db.transaction(VIDEO_STORE, "readonly");
      const req = tx.objectStore(VIDEO_STORE).get(caseId);
      req.onsuccess = () => {
        db.close();
        const rec = req.result as VideoBlobRecord | undefined;
        resolve(rec ? { blob: rec.blob, fileName: rec.fileName } : null);
      };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch {
    return null;
  }
}

/** Delete the saved video bytes for a case (called on expiry or when the
 *  user explicitly replaces/removes the video). */
export async function clearVideoBlob(caseId: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(VIDEO_STORE, "readwrite");
      tx.objectStore(VIDEO_STORE).delete(caseId);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); }; // non-fatal
    });
  } catch {
    /* noop */
  }
}

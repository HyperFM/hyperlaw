// ─── Exhibit Studio — IndexedDB workspace persistence ─────────────────────────
// Autosaves the active studio session (markers, timeline position, export
// settings, video file name) to IndexedDB so the workspace can be recovered
// after a tab close, browser crash, or mobile suspension.
//
// Video files (binary blobs) are NOT stored here — only the file name. The
// existing relink banner handles reopening the file after a page reload.

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

const DB_NAME = "hyperlaw-studio";
const DB_VERSION = 1;
const STORE = "workspace-sessions";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "caseId" });
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

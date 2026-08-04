// ── Server-side video storage (Supabase Storage) ────────────────────────────
// Studio project videos live in browser IndexedDB for fast local editing, but
// also get uploaded here so users never have to re-pick the file on another
// device or after clearing browser storage. Requires SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY — until those are set, isConfigured() is false
// and callers should fail the request clearly rather than silently no-op
// (unlike email, there's no safe "just log it" fallback for a video upload).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const BUCKET = "studio-videos";

let client: SupabaseClient | null | undefined;

function getClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  client = url && key ? createClient(url, key) : null;
  return client;
}

export function isConfigured(): boolean {
  return getClient() !== null;
}

/** Uploads a video's bytes and returns the storage key to save on the case row. */
export async function uploadVideo(caseId: string, buffer: Buffer, mimetype: string): Promise<string> {
  const c = getClient();
  if (!c) throw new Error("Video storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)");

  const ext = mimetype.split("/")[1] || "mp4";
  const key = `${caseId}/${randomUUID()}.${ext}`;
  const { error } = await c.storage.from(BUCKET).upload(key, buffer, { contentType: mimetype, upsert: true });
  if (error) throw new Error(`Video upload failed: ${error.message}`);
  return key;
}

/** Signed, time-limited URL for downloading a stored video (1 hour). */
export async function getSignedVideoUrl(storageKey: string): Promise<string> {
  const c = getClient();
  if (!c) throw new Error("Video storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)");

  const { data, error } = await c.storage.from(BUCKET).createSignedUrl(storageKey, 60 * 60);
  if (error || !data) throw new Error(`Could not create signed URL: ${error?.message ?? "unknown error"}`);
  return data.signedUrl;
}

export async function deleteVideo(storageKey: string): Promise<void> {
  const c = getClient();
  if (!c) return; // not configured — nothing to clean up
  await c.storage.from(BUCKET).remove([storageKey]);
}

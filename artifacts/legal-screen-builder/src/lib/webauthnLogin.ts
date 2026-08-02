// ── Real passkey login (separate from the PIN-unlock convenience in lib/webauthn.ts) ──
// Uses @simplewebauthn/browser, which talks to the real navigator.credentials
// API and handles all base64url encode/decode itself.

import { startRegistration, startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";

export { browserSupportsWebAuthn };

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string }).error || "Passkey request failed");
  return data as T;
}

/** Enroll this device as a login passkey for the currently signed-in user. */
export async function registerLoginPasskey(): Promise<void> {
  const options = await postJson<Parameters<typeof startRegistration>[0]["optionsJSON"]>("/api/auth/passkey/register/options");
  const attestation = await startRegistration({ optionsJSON: options });
  await postJson("/api/auth/passkey/register/verify", attestation);
}

export interface PasskeyListItem {
  id: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export async function listLoginPasskeys(): Promise<PasskeyListItem[]> {
  const r = await fetch("/api/auth/passkey/list", { credentials: "include" });
  if (!r.ok) return [];
  return r.json();
}

export async function removeLoginPasskey(id: string): Promise<void> {
  await fetch(`/api/auth/passkey/${id}`, { method: "DELETE", credentials: "include" });
}

/** Triggers the "usernameless" sign-in flow — the browser shows whichever
 *  passkeys it has for this site; picking one logs the user straight in. */
export async function signInWithPasskey<T>(): Promise<T> {
  const options = await postJson<Parameters<typeof startAuthentication>[0]["optionsJSON"]>("/api/auth/passkey/login/options");
  const assertion = await startAuthentication({ optionsJSON: options });
  return postJson<T>("/api/auth/passkey/login/verify", assertion);
}

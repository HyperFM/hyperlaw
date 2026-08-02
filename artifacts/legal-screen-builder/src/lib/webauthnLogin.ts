// ── Real passkey login (separate from the PIN-unlock convenience in lib/webauthn.ts) ──
// Uses @simplewebauthn/browser, which talks to the real navigator.credentials
// API and handles all base64url encode/decode itself.

import { startRegistration, startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";

export { browserSupportsWebAuthn };

// WebAuthn can't be asked "does a passkey exist for this device?" ahead of
// time — that's deliberately impossible for privacy reasons (see the W3C
// spec's privacy-considerations section, which is exactly what's linked in
// the raw NotAllowedError browsers throw). So instead we remember, per
// browser, whether *this* device ever successfully set one up via Settings —
// only then does the sign-in page offer the passkey option at all, which
// keeps someone who's never set one up from ever hitting that error.
const REMEMBERED_PASSKEY_KEY = "hyperlaw_login_passkey_set_up";

export function hasLoginPasskeySetUp(): boolean {
  try { return localStorage.getItem(REMEMBERED_PASSKEY_KEY) === "1"; } catch { return false; }
}

export function rememberLoginPasskeySetUp(): void {
  try { localStorage.setItem(REMEMBERED_PASSKEY_KEY, "1"); } catch { /* private browsing, etc. — safe to skip */ }
}

export function forgetLoginPasskeySetUp(): void {
  try { localStorage.removeItem(REMEMBERED_PASSKEY_KEY); } catch { /* private browsing, etc. — safe to skip */ }
}

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
  let assertion: Awaited<ReturnType<typeof startAuthentication>>;
  try {
    assertion = await startAuthentication({ optionsJSON: options });
  } catch (err) {
    // NotAllowedError is the browser's catch-all for "no matching passkey
    // here, the user cancelled, or it timed out" — it comes with a raw,
    // spec-citation message that means nothing to most people.
    if (err instanceof Error && err.name === "NotAllowedError") {
      throw new Error("We couldn't find a passkey for this account on this device. Sign in with your username and password instead.");
    }
    throw err;
  }
  return postJson<T>("/api/auth/passkey/login/verify", assertion);
}

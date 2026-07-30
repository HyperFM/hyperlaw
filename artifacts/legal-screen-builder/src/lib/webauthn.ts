// ── Passkey (WebAuthn) convenience unlock ───────────────────────────────────
// This does NOT replace the PIN as the server-verified security gate — per
// the backend (services/security.ts), WebAuthn assertions are never
// cryptographically verified server-side. Instead, a real platform biometric
// prompt (Face ID / Touch ID / Windows Hello) gates access to a copy of the
// PIN cached on this device, so the user can unlock without retyping it. The
// PIN itself is always re-verified server-side wherever it's actually used.

function b64urlToBuffer(b64url: string): ArrayBuffer {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64url.length / 4) * 4, "=");
  const raw = atob(b64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

function bufferToB64url(buf: ArrayBuffer): string {
  let str = "";
  new Uint8Array(buf).forEach(b => { str += String.fromCharCode(b); });
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function isPasskeySupported(): boolean {
  return typeof window !== "undefined" && !!window.PublicKeyCredential && !!navigator.credentials;
}

/** Runs the platform-authenticator creation ceremony and returns the new credential's id. */
export async function createPasskey(userId: string, challenge: string, excludeCredentialIds: string[]): Promise<string> {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: b64urlToBuffer(challenge),
      rp: { name: "HyperLaw" },
      user: {
        id: new TextEncoder().encode(userId),
        name: "HyperLaw Account",
        displayName: "HyperLaw Account",
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },   // ES256
        { type: "public-key", alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60000,
      excludeCredentials: excludeCredentialIds.map(id => ({ id: b64urlToBuffer(id), type: "public-key" as const })),
    },
  }) as PublicKeyCredential | null;
  if (!cred) throw new Error("Passkey setup was cancelled");
  return bufferToB64url(cred.rawId);
}

/** Triggers the platform biometric prompt for an already-enrolled credential. Throws if cancelled/failed. */
export async function verifyPasskey(challenge: string, allowCredentialIds: string[]): Promise<void> {
  if (allowCredentialIds.length === 0) throw new Error("No passkey enrolled");
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: b64urlToBuffer(challenge),
      allowCredentials: allowCredentialIds.map(id => ({ id: b64urlToBuffer(id), type: "public-key" as const })),
      userVerification: "required",
      timeout: 60000,
    },
  });
  if (!assertion) throw new Error("Passkey verification was cancelled");
}

// ── Locally cached PIN — device-only, cleared when the passkey is disabled ──

const cacheKey = (userId: string) => `hl_pin_cache_${userId}`;

export function cachePin(userId: string, pin: string): void {
  try { localStorage.setItem(cacheKey(userId), pin); } catch { /* storage unavailable — passkey unlock just won't have a cached PIN */ }
}

export function getCachedPin(userId: string): string | null {
  try { return localStorage.getItem(cacheKey(userId)); } catch { return null; }
}

export function clearCachedPin(userId: string): void {
  try { localStorage.removeItem(cacheKey(userId)); } catch { /* ignore */ }
}

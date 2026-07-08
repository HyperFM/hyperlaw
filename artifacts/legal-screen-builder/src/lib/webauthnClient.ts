// ── WebAuthn platform-authenticator helper (Face ID / Touch ID / Windows Hello) ──
// Additive device check layered on top of the server-verified PIN. Fails SOFT:
// when the platform is unsupported or blocked (e.g. inside a proxied iframe),
// callers fall back to PIN-only — deletion must never be bricked.

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  // Back the view with a concrete ArrayBuffer so it satisfies BufferSource
  // (TS 5.7+ types Uint8Array generically and rejects ArrayBufferLike here).
  const buffer = new ArrayBuffer(bin.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function isWebauthnAvailable(): boolean {
  return typeof window !== "undefined" && !!window.PublicKeyCredential && !!navigator.credentials;
}

/** True when a platform authenticator (biometric / device PIN) is likely usable. */
export async function hasPlatformAuthenticator(): Promise<boolean> {
  try {
    if (!isWebauthnAvailable()) return false;
    const pkc = window.PublicKeyCredential as unknown as {
      isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
    };
    return (await pkc.isUserVerifyingPlatformAuthenticatorAvailable?.()) ?? false;
  } catch {
    return false;
  }
}

/** Enroll a platform credential; returns its base64url id, or null on any failure. */
export async function enrollDevice(challenge: string, userId: string, userName: string): Promise<string | null> {
  try {
    if (!isWebauthnAvailable()) return null;
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: b64urlToBytes(challenge),
        rp: { name: "HyperLaw", id: window.location.hostname },
        user: { id: new TextEncoder().encode(userId), name: userName, displayName: userName },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
        timeout: 60000,
        attestation: "none",
      },
    })) as PublicKeyCredential | null;
    return cred ? bytesToB64url(cred.rawId) : null;
  } catch {
    return null;
  }
}

/** Trigger a device-auth gesture (biometric). Returns true if completed, false otherwise. */
export async function verifyDevice(challenge: string, credentialIds: string[]): Promise<boolean> {
  try {
    if (!isWebauthnAvailable()) return false;
    const cred = (await navigator.credentials.get({
      publicKey: {
        challenge: b64urlToBytes(challenge),
        rpId: window.location.hostname,
        allowCredentials: credentialIds.map(id => ({ type: "public-key" as const, id: b64urlToBytes(id) })),
        userVerification: "required",
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;
    return !!cred;
  } catch {
    return false;
  }
}

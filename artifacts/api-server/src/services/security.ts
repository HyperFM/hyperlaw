// ── Account security service (PIN + WebAuthn enrollment) ───────────────────────
// PIN is the server-verified, mandatory gate for destructive actions. It is
// hashed with Node's scrypt ("salt:hash" hex) and compared in constant time,
// with a lockout after repeated failures. WebAuthn credential *ids* are tracked
// so the client can trigger a platform-authenticator (Face ID / Touch ID)
// gesture as an additive device check; assertions are not cryptographically
// verified server-side (the PIN remains the enforced gate).

import crypto from "node:crypto";
import { db, userSecurityTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const SCRYPT_KEYLEN = 64;
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pin, salt, SCRYPT_KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

function verifyHash(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(pin, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

type SecurityRow = typeof userSecurityTable.$inferSelect;

export async function getSecurity(userId: string): Promise<SecurityRow | null> {
  const [row] = await db.select().from(userSecurityTable).where(eq(userSecurityTable.userId, userId));
  return row ?? null;
}

async function ensureRow(userId: string): Promise<SecurityRow> {
  const existing = await getSecurity(userId);
  if (existing) return existing;
  await db.insert(userSecurityTable).values({ userId }).onConflictDoNothing();
  return (await getSecurity(userId))!;
}

export function isValidPinFormat(pin: unknown): pin is string {
  return typeof pin === "string" && /^\d{4,8}$/.test(pin);
}

export async function getSecurityStatus(userId: string): Promise<{ hasPin: boolean; webauthnEnabled: boolean; locked: boolean }> {
  const row = await getSecurity(userId);
  const locked = !!(row?.lockedUntil && row.lockedUntil.getTime() > Date.now());
  return {
    hasPin: !!row?.pinHash,
    webauthnEnabled: (row?.webauthnCredentials?.length ?? 0) > 0,
    locked,
  };
}

/** Set or change the PIN. When a PIN already exists, currentPin must match. */
export async function setPin(userId: string, pin: string, currentPin?: string): Promise<{ ok: boolean; error?: string }> {
  const row = await ensureRow(userId);
  if (row.pinHash) {
    if (!currentPin || !verifyHash(currentPin, row.pinHash)) {
      return { ok: false, error: "Current PIN is incorrect" };
    }
  }
  await db.update(userSecurityTable)
    .set({ pinHash: hashPin(pin), failedPinAttempts: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(userSecurityTable.userId, userId));
  return { ok: true };
}

export interface PinVerifyResult { ok: boolean; locked?: boolean; remainingAttempts?: number; error?: string; noPin?: boolean }

/** Verify the PIN with lockout throttling. */
export async function verifyPin(userId: string, pin: string): Promise<PinVerifyResult> {
  const row = await getSecurity(userId);
  if (!row?.pinHash) return { ok: false, noPin: true, error: "No PIN has been set" };
  if (row.lockedUntil && row.lockedUntil.getTime() > Date.now()) {
    return { ok: false, locked: true, error: "Too many attempts. Please try again later." };
  }
  if (verifyHash(pin, row.pinHash)) {
    if ((row.failedPinAttempts ?? 0) > 0) {
      await db.update(userSecurityTable)
        .set({ failedPinAttempts: 0, lockedUntil: null, updatedAt: new Date() })
        .where(eq(userSecurityTable.userId, userId));
    }
    return { ok: true };
  }
  const attempts = (row.failedPinAttempts ?? 0) + 1;
  const lock = attempts >= MAX_ATTEMPTS;
  await db.update(userSecurityTable)
    .set({
      failedPinAttempts: lock ? 0 : attempts,
      lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      updatedAt: new Date(),
    })
    .where(eq(userSecurityTable.userId, userId));
  return {
    ok: false,
    locked: lock,
    remainingAttempts: Math.max(0, MAX_ATTEMPTS - attempts),
    error: lock ? `Too many attempts. Locked for ${LOCK_MINUTES} minutes.` : "Incorrect PIN",
  };
}

/** Issue a one-time challenge for a WebAuthn register/auth ceremony on the client. */
export async function issueWebauthnChallenge(userId: string): Promise<{ challenge: string; credentialIds: string[] }> {
  const row = await ensureRow(userId);
  const challenge = crypto.randomBytes(32).toString("base64url");
  await db.update(userSecurityTable)
    .set({ webauthnChallenge: challenge, updatedAt: new Date() })
    .where(eq(userSecurityTable.userId, userId));
  return { challenge, credentialIds: (row.webauthnCredentials ?? []).map(c => c.id) };
}

/** Record an enrolled platform credential id (additive device check). */
export async function enrollWebauthn(userId: string, credentialId: string): Promise<void> {
  const row = await ensureRow(userId);
  const existing = row.webauthnCredentials ?? [];
  if (!existing.find(c => c.id === credentialId)) {
    existing.push({ id: credentialId, publicKey: "", counter: 0 });
  }
  await db.update(userSecurityTable)
    .set({ webauthnCredentials: existing, webauthnChallenge: null, updatedAt: new Date() })
    .where(eq(userSecurityTable.userId, userId));
}

export async function disableWebauthn(userId: string): Promise<void> {
  await db.update(userSecurityTable)
    .set({ webauthnCredentials: [], webauthnChallenge: null, updatedAt: new Date() })
    .where(eq(userSecurityTable.userId, userId));
}

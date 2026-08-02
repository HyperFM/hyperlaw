// ── Real passkey login (separate from the PIN-unlock trigger in security.ts) ──
// Uses @simplewebauthn/server for genuine cryptographic verification — real
// public keys, real signature-counter tracking, real challenge/origin/RP-ID
// checks. This is what actually authenticates a session; the existing
// userSecurityTable.webauthnCredentials feature is unrelated and untouched.

import type { Request } from "express";
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON, AuthenticationResponseJSON, AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import { db, loginCredentialsTable, usersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

declare module "express-session" {
  interface SessionData {
    webauthnChallenge?: string;
  }
}

/** RP ID must be the exact domain serving the page (no protocol/port) — derived
 *  from the request so this works on both localhost and hyperlaw.site without
 *  separate config. Origin is the full scheme+host the browser sees. */
function getRpConfig(req: Request): { rpID: string; origin: string } {
  const protocol = (req.headers["x-forwarded-proto"] as string) || req.protocol;
  const rpID = req.hostname; // Express strips the port already — must be a bare domain
  const origin = `${protocol}://${req.headers.host}`;
  return { rpID, origin };
}

function bufferToB64url(buf: Uint8Array): string {
  return Buffer.from(buf).toString("base64url");
}

function b64urlToBuffer(b64url: string): Uint8Array<ArrayBuffer> {
  // TS's lib.dom types Uint8Array generically over its backing buffer;
  // @simplewebauthn/server wants the ArrayBuffer-backed variant specifically.
  // Buffer's underlying storage is always a real ArrayBuffer here (freshly
  // allocated by Buffer.from, never a view into a SharedArrayBuffer), so this
  // cast reflects a genuine invariant, not a type-safety workaround.
  return Uint8Array.from(Buffer.from(b64url, "base64url")) as Uint8Array<ArrayBuffer>;
}

export async function startPasskeyRegistration(userId: string, username: string, req: Request) {
  const { rpID } = getRpConfig(req);
  const existing = await db.select({ id: loginCredentialsTable.id, transports: loginCredentialsTable.transports })
    .from(loginCredentialsTable).where(eq(loginCredentialsTable.userId, userId));

  const options = await generateRegistrationOptions({
    rpName: "HyperLaw",
    rpID,
    userName: username,
    userID: new TextEncoder().encode(userId),
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: c.id,
      transports: (c.transports ?? undefined) as AuthenticatorTransportFuture[] | undefined,
    })),
    authenticatorSelection: {
      residentKey: "required", // discoverable credential — needed for usernameless login
      userVerification: "required",
    },
  });

  req.session.webauthnChallenge = options.challenge;
  return options;
}

export async function finishPasskeyRegistration(
  userId: string,
  response: RegistrationResponseJSON,
  req: Request,
): Promise<{ ok: boolean; error?: string }> {
  const expectedChallenge = req.session.webauthnChallenge;
  if (!expectedChallenge) return { ok: false, error: "No registration in progress" };
  const { rpID, origin } = getRpConfig(req);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID,
    });
  } catch (err) {
    return { ok: false, error: (err as Error).message || "Passkey verification failed" };
  }
  req.session.webauthnChallenge = undefined;
  if (!verification.verified || !verification.registrationInfo) return { ok: false, error: "Passkey verification failed" };

  const { credential } = verification.registrationInfo;
  await db.insert(loginCredentialsTable).values({
    id: credential.id,
    userId,
    publicKey: bufferToB64url(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? [],
  });
  return { ok: true };
}

export async function startPasskeyAuthentication(req: Request) {
  const { rpID } = getRpConfig(req);
  // No allowCredentials — usernameless/discoverable flow: the browser shows
  // whichever passkeys it has for this site, the user just presses one.
  const options = await generateAuthenticationOptions({ rpID, userVerification: "required" });
  req.session.webauthnChallenge = options.challenge;
  return options;
}

export async function finishPasskeyAuthentication(
  response: AuthenticationResponseJSON,
  req: Request,
): Promise<{ ok: boolean; user?: typeof usersTable.$inferSelect; error?: string }> {
  const expectedChallenge = req.session.webauthnChallenge;
  if (!expectedChallenge) return { ok: false, error: "No sign-in attempt in progress" };
  const { rpID, origin } = getRpConfig(req);

  const [stored] = await db.select().from(loginCredentialsTable).where(eq(loginCredentialsTable.id, response.id));
  if (!stored) return { ok: false, error: "This passkey isn't registered" };

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID,
      credential: {
        id: stored.id,
        publicKey: b64urlToBuffer(stored.publicKey),
        counter: stored.counter,
        transports: (stored.transports ?? undefined) as AuthenticatorTransportFuture[] | undefined,
      },
    });
  } catch (err) {
    return { ok: false, error: (err as Error).message || "Passkey verification failed" };
  }
  req.session.webauthnChallenge = undefined;
  if (!verification.verified) return { ok: false, error: "Passkey verification failed" };

  await db.update(loginCredentialsTable)
    .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() })
    .where(eq(loginCredentialsTable.id, stored.id));

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, stored.userId));
  if (!user) return { ok: false, error: "Account no longer exists" };
  return { ok: true, user };
}

export async function listPasskeys(userId: string) {
  return db.select({ id: loginCredentialsTable.id, createdAt: loginCredentialsTable.createdAt, lastUsedAt: loginCredentialsTable.lastUsedAt })
    .from(loginCredentialsTable).where(eq(loginCredentialsTable.userId, userId));
}

export async function deletePasskey(userId: string, credentialId: string): Promise<void> {
  // Scoped to userId too, not just credentialId — a credential ID alone must
  // never be enough to delete someone else's passkey.
  await db.delete(loginCredentialsTable)
    .where(and(eq(loginCredentialsTable.id, credentialId), eq(loginCredentialsTable.userId, userId)));
}

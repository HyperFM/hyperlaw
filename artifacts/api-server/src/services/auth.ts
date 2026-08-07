// ── Self-hosted auth service ────────────────────────────────────────────────
// Replaces Clerk. Password hashing follows the exact same convention as
// userSecurityTable.pinHash in services/security.ts: scrypt with a random
// salt, stored as "salt:hash" hex, compared in constant time.

import crypto from "node:crypto";
import type { Request } from "express";
import { usersTable } from "@workspace/db";

const SCRYPT_KEYLEN = 64;

function scryptHash(value: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(value, salt, SCRYPT_KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

function scryptVerify(value: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(value, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

export function hashPassword(password: string): string {
  return scryptHash(password);
}

export function verifyPassword(password: string, stored: string): boolean {
  return scryptVerify(password, stored);
}

/** Fixed set every account answers at signup — order matters, these line up
 *   1:1 with securityAnswer{1,2,3}Hash. Keep this in sync with the identical
 *  copy in the frontend's AuthPages.tsx (separate package, no shared import). */
export const SECURITY_QUESTIONS = [
  "What street did you grow up on?",
  "What is your mother's first name?",
  "What was your favorite TV show as a child?",
] as const;

function normalizeAnswer(answer: string): string {
  return answer.trim().toLowerCase();
}

/** Answers are normalized before hashing so "Elm Street" and "elm street"
 *  both verify — unlike passwords, these are case/whitespace-insensitive. */
export function hashSecurityAnswer(answer: string): string {
  return scryptHash(normalizeAnswer(answer));
}

export function verifySecurityAnswer(answer: string, stored: string): boolean {
  return scryptVerify(normalizeAnswer(answer), stored);
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Only these two emails (primary OR secondary) can register through the
 *  admin-registration path in routes/auth.ts — checking the "admin" box with
 *  any other email is rejected outright, not silently downgraded to a
 *  regular account. */
export const ADMIN_EMAIL_ALLOWLIST = new Set(["hyperlawcompliance@gmail.com", "hypermodula@gmail.com"]);

/**
 * Temporary lock on creating brand-new accounts, while the app is still
 * being finished pre-launch. Existing accounts (any account already in the
 * DB — admin, tester, or otherwise) can still log in completely normally;
 * this only blocks the three places a NEW row gets inserted into usersTable:
 * POST /auth/register, first-ever Google sign-in, and first-ever Apple
 * sign-in (see routes/auth.ts and middlewares/passportConfig.ts).
 *
 * Flip to false to reopen signups once the app is ready for real users.
 */
export const SIGNUPS_LOCKED = true;

export function hashSsnLast4(last4: string): string {
  return scryptHash(last4.trim());
}

export function verifySsnLast4(last4: string, stored: string): boolean {
  return scryptVerify(last4.trim(), stored);
}

/** Admin accounts pick their own question/answer (not from the fixed list) —
 *  same normalize-then-hash convention as the regular security questions. */
export function hashAdminSecurityAnswer(answer: string): string {
  return scryptHash(normalizeAnswer(answer));
}

export function verifyAdminSecurityAnswer(answer: string, stored: string): boolean {
  return scryptVerify(normalizeAnswer(answer), stored);
}

export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

type UserRow = typeof usersTable.$inferSelect;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface User extends UserRow {}
  }
}

export type SanitizedUser = Omit<
  UserRow,
  "passwordHash" | "emailVerificationToken" | "passwordResetToken" |
  "securityAnswer1Hash" | "securityAnswer2Hash" | "securityAnswer3Hash" |
  "ssnLast4Hash" | "adminSecurityAnswerHash"
>;

/** Strip everything a client should never see before sending a user object back. */
export function sanitizeUser(user: UserRow): SanitizedUser {
  const {
    passwordHash, emailVerificationToken, passwordResetToken,
    securityAnswer1Hash, securityAnswer2Hash, securityAnswer3Hash,
    ssnLast4Hash, adminSecurityAnswerHash,
    ...safe
  } = user;
  return safe;
}

/** Drop-in replacement for Clerk's getAuth(req) — same { userId } shape, backed
 *  by the passport session (req.user, populated by deserializeUser). */
export function getAuth(req: Request): { userId: string | null } {
  return { userId: req.user?.id ?? null };
}

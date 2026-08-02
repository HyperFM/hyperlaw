---
name: Auth Setup
description: HyperLaw's self-hosted auth (replaced Clerk) — architecture and known quirks
---

# Auth Setup

## Status
Clerk was fully removed (production instance had an unresolvable `host_invalid`
backend bug on Clerk's own infrastructure — proven via direct API calls
bypassing the app entirely). Replaced with self-hosted email/password +
Google + Apple sign-in.

## Login methods
- Email/password: ✅ — username, first/last name, phone, email, password (confirmed twice)
- Email verification: ✅ — verification link, Resend for delivery
- Password reset: ✅ — self-service, emailed link
- Google: ✅, only active once `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set
- Apple: ✅, only active once `APPLE_CLIENT_ID`/`APPLE_TEAM_ID`/`APPLE_KEY_ID`/`APPLE_PRIVATE_KEY` are set
- Phone/SMS sign-in: ❌ not implemented — phone number is collected but used only
  for duplicate-account prevention (unique constraint), not as a login method

## Architecture
- `lib/db/src/schema/index.ts` — `usersTable` holds everything (username, names,
  phone, email, `passwordHash` (scrypt, same convention as `userSecurityTable.pinHash`),
  verification/reset tokens, `googleId`/`appleId`)
- `artifacts/api-server/src/middlewares/passportConfig.ts` — session (express-session +
  connect-pg-simple, Postgres-backed, table auto-created) + passport (local + Google strategies)
- `artifacts/api-server/src/services/auth.ts` — hashing, tokens, `sanitizeUser`,
  `getAuth(req)` (drop-in replacement for Clerk's `getAuth`, same `{ userId }` shape)
- `artifacts/api-server/src/routes/auth.ts` — all `/api/auth/*` endpoints
- `artifacts/legal-screen-builder/src/lib/auth.ts` — `useAuth()`/`useLogin()`/
  `useRegister()`/`useLogout()` etc., react-query IS the provider (no Context needed)
- `artifacts/legal-screen-builder/src/pages/AuthPages.tsx` — sign-in/up, forgot/reset
  password, verify-email pages
- `main.tsx` routes: `/` (HomeRedirect), `/sign-in`, `/sign-up`, `/forgot-password`,
  `/reset-password`, `/verify-email`

## Why
Clerk's production Frontend API rejected every request with `host_invalid` despite
the domain, proxy config, and keys all being independently verified correct —
including Clerk's own dashboard failing its own live proxy-verification test.
Not fixable from the app side; moved off Clerk entirely rather than wait on
unresponsive third-party support.

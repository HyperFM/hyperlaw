---
name: Clerk Auth Setup
description: Clerk auth integration state and known quirks for HyperLaw
---

# Clerk Auth Setup

## Status
- Provisioned via setupClerkWhitelabelAuth() — app_id: app_3FvLhiEmgZKIzqMUcZG4aGxM6Fq
- Env vars auto-set: CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY, VITE_CLERK_PUBLISHABLE_KEY
- Dev keys active (pk_test_*) — normal and expected

## Login methods enabled
- Email/password: ✅ (Clerk default)
- Google: ✅ (Clerk default)
- Apple: ⚠️ Must be toggled ON in the Replit Auth pane by the user
- Phone/SMS: ❌ Not supported by Replit-managed Clerk

## Architecture
- main.tsx wraps everything: WouterRouter > ClerkProvider > Switch
- Routes: / (HomeRedirect), /sign-in/*?, /sign-up/*?
- HomeRedirect shows Landing (plans carousel) when signed out, App when signed in
- Proxy middleware: artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts
- API server: clerkMiddleware() mounted before routes in app.ts

## Why
Phone sign-in is not supported by Replit-managed Clerk tenant system. Apple requires manual toggle in Auth pane.

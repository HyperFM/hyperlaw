---
name: HyperLaw Architecture
description: Key routing and data flow decisions for HyperLaw
---

# HyperLaw Architecture

## Routing (Wouter)
- base path from import.meta.env.BASE_URL
- / → HomeRedirect (Landing if signed out, App if signed in)
- /sign-in/*? → Clerk SignIn component
- /sign-up/*? → Clerk SignUp component

## Auth
- ClerkProvider + proxyUrl in main.tsx (not App.tsx)
- App.tsx uses useClerk (signOut), useUser (display name/email)
- ProfileView shows real user name + sign-out button

## Data
- localStorage key: hl_v3
- No backend for user data yet — still purely client-side localStorage
- Clerk user ID could be used as partition key in future if migrating to DB

## Plans/Subscription page
- Landing.tsx = src/pages/Landing.tsx
- Three tiers: First Filing (free), Pro-Say Selection ($19/mo), Apex Litigant (TBD)
- Swipeable carousel (pointer events), default active = index 1 (Pro-Say)
- All CTAs route to /sign-up for now; Stripe wiring is next

## Why
- Home route must be public (Clerk skill requirement)
- App.tsx kept clean of router imports (Clerk hooks only)
- QueryClientProvider lives inside ClerkProvider in main.tsx for cache invalidation on user change

---
name: HyperLaw Architecture
description: Frontend routing, auth setup, data layer, and AI backend integration decisions for the HyperLaw app.
---

## Frontend (artifacts/legal-screen-builder/src/)

- `main.tsx` — ClerkProvider, Wouter routes `/, /sign-in/*?, /sign-up/*?, /plans`; ToS/Privacy links point to `${basePath}/legal.html` (real page)
- `App.tsx` — 2450+ lines. Nav: home | cases | tutor | profile. Views: HomeView, IncidentDetailView, CaseDetailView, TutorView, ProfileView.
- `types.ts` — Incident, HLCase (+ jurisdiction?: string), Reminder, AppData, GeneratedDocument, DocumentStatus, PaymentStatus
- `store.ts` — loadData/saveData (localStorage key `hl_v3`) + CRUD helpers; defaults `jurisdiction: ""` on load
- `services/tutor.ts` — staticTutorService (keyword regex fallback when Claude not configured)
- `lib/api.ts` — existing apiFetch wrapper (notifications, feedback, admin, chat)
- `lib/aiApi.ts` — AI API client; includes generated docs CRUD + `deleteUserData()` for server-side account purge

## Backend (artifacts/api-server/src/)

- `app.ts` — Express, pino, Clerk middleware, routes at `/api`
- `routes/ai.ts` — AI routes: GET /ai/status, POST /ai/analyze, POST /ai/chat, POST /ai/upload, GET /ai/documents/:caseId
- `routes/generated-documents.ts` — CRUD for generated docs: GET /ai/generated-documents?caseId=, POST, PATCH/:id, DELETE/:id
- `routes/user.ts` — DELETE /user: purges all user DB data (parallel deletes across 6 tables) before Clerk account deletion
- `services/ai.ts` — AiService class wrapping Claude (claude-opus-4-5); analyzeIncident, analyzeCase, chat, extractFromDocument, ocrImage
- `services/documentParser.ts` — parseDocument: PDF (pdf-parse), DOCX (mammoth), TXT/RTF (text), images (Claude Vision OCR)
- `middlewares/clerkProxyMiddleware.ts` — Clerk JS proxy

## Database (lib/db/src/schema/index.ts)

Tables: notifications, chat_sessions, messages, feedback, uploaded_documents, ai_logs, ai_analysis_cache, **generated_documents** (userId, caseId, title, documentType, content, version, status, paymentStatus; indexed on userId+createdAt and userId+caseId)

**Why:** generatedDocumentsTable stores AI-generated content per user/case with status tracking for future paywall (status: draft→verified→filed; paymentStatus: free→pending→paid).

Run `pnpm --filter @workspace/db push` then `cd lib/db && pnpm exec tsc -p tsconfig.json` after schema changes.

## AI Integration Design

**Provider:** Claude via `@anthropic-ai/sdk`. Model: `claude-opus-4-5`.

**Key decisions:**
- `ANTHROPIC_API_KEY` secret → AiService.isConfigured() gates all AI routes
- When not configured: backend returns 503 with `code: "ai_not_configured"`; frontend falls back to staticTutorService; document upload still works for text/PDF/DOCX (skips extraction)
- TutorView checks AI status on mount, triggers async analysis, falls back to static on error
- TutorView dependency: `[target, aiAvailable, relevantIncidentKey]` — `relevantIncidentKey` is a stable string derived from incident content so stale analysis re-runs when user edits incidents in the selected case
- Chat history stored in React component state (per session, resets on refresh)

**Why:** Swappable provider design — AiService is the single entry point; changing provider = new AiService impl, no app changes.

## Phase 2 — Knowledge Library

**DB table:** `knowledge_library` — title, summary, body, category, tags (jsonb), keywords (jsonb), jurisdiction, source, isActive, createdAt, updatedAt.
**Indexes:** GIN on full tsvector (title+summary+body+keywords::text+tags::text) created via raw psql (drizzle push can't do GIN expression indexes — run psql manually after schema changes); btree indexes on category and isActive via drizzle.

**Search service:** `artifacts/api-server/src/services/knowledgeLibrary.ts` — PostgreSQL `plainto_tsquery` FTS using pool.query() (raw SQL, not drizzle ORM, to avoid drizzle typing issues with dynamic conditions). FTS vector includes keywords/tags jsonb cast to text. Falls back to empty array on any error so library failures never break AI calls.

**Library-first routing:** `routes/ai.ts` searches library AFTER cache check and BEFORE Claude call. Results injected as `opts.libraryContext` into `aiService.analyzeIncident()` / `analyzeCase()`. Library context appears as a `---` separated block at the top of the prompt.

**Admin auth pattern:** Knowledge CRUD routes use same `requireAdmin` + `getClerkUserEmail` check as `routes/admin.ts` — admin email is `hyperlawcompliance@gmail.com`. Search endpoint is public (no auth).

**aiFetch 204 fix:** Added `if (r.status === 204) return undefined as unknown as T;` before `r.json()` in `aiApi.ts`. Required for DELETE routes that return 204 No Content.

**GIN index creation command (run after schema changes):**
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS knowledge_library_fts_gin
ON knowledge_library USING gin(
  to_tsvector('english', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(body,'') || ' ' || coalesce(keywords::text,'') || ' ' || coalesce(tags::text,''))
);
```

## Generated Docs Refresh Pattern

TutorView has `onDocSaved?: () => void` prop. When user saves analysis, it calls `onDocSaved()`. App increments `genDocsRefreshKey` state. CaseDetailView receives `genDocsRefreshKey` in its useEffect deps, triggering a re-fetch of docs. TutorView save guard: `savedTargetKey` state (string `kind:id`) prevents duplicate saves per target; resets via useEffect when target changes.

## Legal Docs

`public/legal.html` — actual ToS/Privacy/AI Disclaimer content served statically. Hash-based tab selector script at bottom: `#tos`, `#privacy`, `#ai`. Links throughout app use `${basePath}/legal.html#tos` etc.

## Security Notes

- `/ai/upload`: `requireAuth` middleware runs BEFORE `upload.single("file")` (multer) — prevents unauthenticated 20MB memory exhaustion
- `DELETE /user` purges all 6 table groups (generated_documents, ai_logs, ai_analysis_cache, uploaded_documents, notifications, chat_sessions→messages cascade) before Clerk account deletion
- CORS is still `origin: true` — high risk in production
- caseId on upload comes from request body; not ownership-validated server-side (track for future hardening)
- req.params.id values must use `String(req.params.id)` in route handlers — typed as `string | string[]` in Express; `eq()` rejects `string | string[]` for UUID columns

## CSS Animations

`@keyframes spin` and `@keyframes pulse` added to `artifacts/legal-screen-builder/src/index.css` — used by Loader2 spinner and typing indicator dots in TutorView.

## TypeScript Notes

- `@types/multer` does not exist for multer v2 — custom declaration at `artifacts/api-server/src/types/multer.d.ts`
- lib/db uses TypeScript project references; run `cd lib/db && pnpm exec tsc -p tsconfig.json` after schema changes to rebuild dist declarations before api-server typecheck
- drizzle-orm 0.45.x: `eq(uuid_column, value)` requires value typed as `string` (not `string | string[]`) — use `String(req.params.id)` for URL params, explicit cast for query params

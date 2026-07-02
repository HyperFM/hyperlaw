---
name: HyperLaw Architecture
description: Frontend routing, auth setup, data layer, and AI backend integration decisions for the HyperLaw app.
---

## Frontend (artifacts/legal-screen-builder/src/)

- `main.tsx` — ClerkProvider, Wouter routes `/, /sign-in/*?, /sign-up/*?, /plans`
- `App.tsx` — 2000+ lines. Nav: home | cases | tutor | profile. Views: HomeView, IncidentDetailView, CaseDetailView, TutorView, ProfileView.
- `types.ts` — Incident, HLCase, Reminder, AppData
- `store.ts` — loadData/saveData (localStorage key `hl_v3`) + CRUD helpers
- `services/tutor.ts` — staticTutorService (keyword regex fallback when Claude not configured)
- `lib/api.ts` — existing apiFetch wrapper (notifications, feedback, admin, chat)
- `lib/aiApi.ts` — AI API client (status, analyzeIncident, analyzeCase, chat, upload, documents)

## Backend (artifacts/api-server/src/)

- `app.ts` — Express, pino, Clerk middleware, routes at `/api`
- `routes/ai.ts` — AI routes: GET /ai/status, POST /ai/analyze, POST /ai/chat, POST /ai/upload, GET /ai/documents/:caseId
- `services/ai.ts` — AiService class wrapping Claude (claude-opus-4-5); analyzeIncident, analyzeCase, chat, extractFromDocument, ocrImage
- `services/documentParser.ts` — parseDocument: PDF (pdf-parse), DOCX (mammoth), TXT/RTF (text), images (Claude Vision OCR)
- `middlewares/clerkProxyMiddleware.ts` — Clerk JS proxy

## Database (lib/db/src/schema/index.ts)

Tables: notifications, chat_sessions, messages, feedback, **uploaded_documents** (new: userId, caseId, fileName, mimeType, extractedText, caseExtraction jsonb)

**Why:** uploadedDocumentsTable stores AI-extracted text and case metadata per user/case. Run `pnpm --filter @workspace/db push` to sync schema.

## AI Integration Design

**Provider:** Claude via `@anthropic-ai/sdk`. Model: `claude-opus-4-5`.

**Key decisions:**
- `ANTHROPIC_API_KEY` secret → AiService.isConfigured() gates all AI routes
- When not configured: backend returns 503 with `code: "ai_not_configured"`; frontend falls back to staticTutorService; document upload still works for text/PDF/DOCX (skips extraction)
- TutorView checks AI status on mount, triggers async analysis, falls back to static on error
- TutorView dependency: `[target, aiAvailable, relevantIncidentKey]` — `relevantIncidentKey` is a stable string derived from incident content so stale analysis re-runs when user edits incidents in the selected case
- Chat history stored in React component state (per session, resets on refresh)

**Why:** Swappable provider design — AiService is the single entry point; changing provider = new AiService impl, no app changes.

## Security Notes

- `/ai/upload`: `requireAuth` middleware runs BEFORE `upload.single("file")` (multer) — prevents unauthenticated 20MB memory exhaustion
- CORS is still `origin: true` (Task #2 proposed but not yet done) — high risk in production
- caseId on upload comes from request body; not ownership-validated server-side (track for Task #3)

## CSS Animations

`@keyframes spin` and `@keyframes pulse` added to `artifacts/legal-screen-builder/src/index.css` — used by Loader2 spinner and typing indicator dots in TutorView.

## TypeScript Notes

- `@types/multer` does not exist for multer v2 — custom declaration at `artifacts/api-server/src/types/multer.d.ts`
- lib/db uses TypeScript project references; run `npx tsc -p lib/db/tsconfig.json` after schema changes to rebuild dist declarations before api-server typecheck

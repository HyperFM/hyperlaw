---
name: HyperLaw Stops 2-3-4 Implementation
description: What was built in the combined Stop 2/3/4 implementation pass and key decisions made.
---

# HyperLaw Stops 2, 3, 4 — Combined Implementation

## Stop 2 — Foundation Gaps

### Auto Case Creation from Upload
- `HomeView` gained `onUploadForNewCase?: (file: File) => void` prop and a hidden file input + "Start from a Document" button (empty state only for now)
- `handleUploadForNewCase` in main App: uploads via `aiApi.uploadWithProgress`, builds case title from `extraction.plaintiff v. extraction.defendant` or filename, creates HLCase in localStorage, navigates to it
- Cases are still localStorage-only (no server-side cases table)

### Upload Progress Bar
- `CaseDetailView` gained `uploadPct` state (0–100)
- Uses `aiApi.uploadWithProgress(form, setUploadPct)` instead of `aiApi.upload(form)`
- Progress bar div shown while `uploadState === "uploading"`, animated width transition

### aiApi.uploadWithProgress
- XHR-based (not fetch) so `upload.onprogress` fires
- `xhr.withCredentials = true` for session cookie auth
- Handles load/error/abort events, parses error JSON

## Stop 3 — Verification Hardening

### TXT Download Gating
- `.TXT` button in checklist panel now has `disabled={!allChecked}` and grayed styling matching the PDF button

### Word-by-Word TTS Highlighting
- `ttsCharIndex` state (-1 = inactive) tracked in DocumentViewerModal
- `u.onboundary` updates charIndex on ANY boundary event (browser-tolerant — Chrome emits name="word", Safari may vary)
- `renderHighlightedText(text, charIndex)` splits on `(\s+)` preserving whitespace, wraps current word in orange span
- Active when `ttsPlaying || ttsPaused`; resets to -1 on stop/end/error

### Verification Session Saved
- Added `verifiedAt timestamp` column to `generatedDocumentsTable` (DB pushed)
- `POST /ai/generated-documents/:id/verify` endpoint — ownership enforced via userId WHERE clause
- `aiApi.generatedDocs.verify(id)` — fire-and-forget call from Continue button in TTS panel

## Stop 4 — AI Hardening

### Jurisdiction Enforcement
- Generate buttons in CaseDetailView check `hlCase.jurisdiction?.trim()` before calling `handleGenerateDoc`
- Shows `setGenerateError(...)` inline if unset; no modal needed

### Retry Logic
- `withRetry<T>(fn)` helper in `ai.ts` — retries ONLY on explicit 429 or 5xx status; fails fast on all others including undefined status
- 3 attempts with delays [1s, 2s, 4s]
- All 6 `this.client.messages.create(...)` calls wrapped

### Rate Limiting
- `express-rate-limit` v8 installed
- Applied to entire AI router (`router.use(...)`) — 40 req/IP/min, 1-minute window
- `app.set("trust proxy", 1)` added to app.ts so real client IPs are resolved through Replit's proxy

## Key Architectural Decisions
- Cases remain localStorage-only; auto-creation from upload creates a client-side HLCase
- `verifiedAt` is nullable (null = not TTS-verified); no migration needed for existing rows
- TTS highlighting is purely additive — degrades gracefully if browser doesn't emit boundary events

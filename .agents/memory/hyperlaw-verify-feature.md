---
name: HyperLaw Verify (read-aloud) feature
description: Case-level document-verification read-aloud feature — credit charge shape, TTS reuse, and known limitation.
---

# HyperLaw Verify Feature

- Case-level "Verify" is a *separate* entry point from the existing per-document
  download flow. The download flow's TTS pre-check (in DocumentViewerModal) stays
  free/mandatory-before-download; only the dedicated Verify modal charges 1 credit.
- Read-aloud + orange word highlighting uses the browser's native `SpeechSynthesis`
  API (`onboundary` events), not a real Claude/TTS audio pipeline — Claude has no
  TTS endpoint. Anthropic's `textToSpeech` media-generation tool produces a static
  file with no per-word timestamps, so it can't drive live highlighting; browser TTS
  already provides that for free. Be transparent with the user about this when asked
  how "Claude reads the document" actually works.
- Credit-charge routes that aren't tied to a real Claude call should still: verify
  resource ownership before charging, refund via `refundOneCredit` if anything fails
  after the charge, and log to `ai_logs` via `logAiCall` (with 0 tokens/cost) so credit
  history stays reconcilable with paid AI features.
- Known limitation (accepted for this feature): no DB-level idempotency key exists in
  this codebase for credit charges — protection against double-charge relies on
  client-side button disabling + step transition, matching the pattern already used by
  other charge-once flows (e.g. guidance session complete). A real idempotency-key table
  would be a larger architectural change, out of scope unless double-charges are observed.

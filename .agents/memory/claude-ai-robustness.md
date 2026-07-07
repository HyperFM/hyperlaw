---
name: Claude AI service robustness
description: Non-obvious failure modes of the Anthropic Claude calls in api-server ai.ts and how to keep them robust.
---

# Claude AI service robustness

## Always scan for the first `text` content block — never trust `content[0]`
`claude-sonnet-5` (the model behind `MODEL` in api-server) **routinely emits a leading `thinking` block**, so `response.content[0]` is often `{ type: "thinking" }`, not text. Confirmed live: real documents returned content blocks `thinking,text` on most runs (not just intermittently).

**Why:** the old pattern `response.content[0].type === "text" ? response.content[0].text : fallback` returned the fallback (`""`, `"[]"`, etc.) whenever a thinking block landed first → silent empty AI result → downstream `JSON.parse` fails → the feature dies with no obvious cause. This is what produced dead/empty analysis results.

**How to apply:** extract via a helper that loops `response.content` and returns the first block with `type === "text"` (see `firstText` in ai.ts). Do NOT accept thinking/redacted/tool blocks. Every new Claude call must route through it.

## Size `max_tokens` to the FULL output or it truncates silently
Large-output calls stop at `max_tokens` with `stop_reason: "max_tokens"`. For JSON that yields incomplete JSON → `JSON.parse` throws; for document generation it silently persists a half-written legal document.

Measured: `buildCaseMemory` on a real 40k-char complaint (input sliced to 15000 chars) needs ~4300 output tokens for the full 10-field schema. `max_tokens: 3000` truncated mid-array; `8000` completes (`stop_reason: end_turn`).

**Why:** the Case Memory / legal-document schemas are large; an under-sized ceiling is a non-deterministic failure that only shows up on big/complex inputs.

**How to apply:** budget `max_tokens` by expected output size, with headroom. `buildCaseMemory` and `generateLegalDocument` are set to 8000. Still small and at risk on large inputs (raise when touched): `assembleCase` (4000), `organizeCase` (4000, emits 8–20 clouds). `analyzeDocumentWithIntake` (2500) has the same profile but is currently unused/dead. For JSON-critical calls, consider treating `stop_reason === "max_tokens"` as a hard failure instead of parsing partial output.

## Credit refund must mirror the deduction conditions
`/ai/analyze-document` skips deduction for admin AND Apex users. A refund-on-failure branch must therefore refund only when a credit was actually charged (a `creditDeducted` flag), not "everyone except admin" — otherwise Apex users gain a credit on every failure.

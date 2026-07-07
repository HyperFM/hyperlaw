---
name: Secrets are write-only to the sandbox and need a restart
description: How Replit secrets behave for the code-execution sandbox and for running workflows.
---

# Secrets / env at runtime

- `requestSecrets` in the code-execution sandbox is **write-only**: it prompts/ensures the secret exists but **never returns the secret value** to the sandbox. Direct-fetch "does the key work?" tests from the sandbox will always see it missing → don't do that; it just re-prompts the user for nothing.
- A running workflow reads secret values into `process.env` **at boot**. Rotating/updating a secret does **not** hot-reload — the server keeps using the OLD value until the workflow is restarted.

**Why:** a rotated `ANTHROPIC_API_KEY` looked "broken" only because the api-server was still running with the previous key in memory; a restart fixed it. Separately, sandbox self-tests kept showing the key absent because the sandbox cannot read secret values at all.

**How to apply:** to verify a secret-dependent feature after a secret changes, restart the owning workflow first. To run an ad-hoc test that needs the actual value, do it in the server/shell environment (where `process.env.X` is populated) — e.g. `node script.mjs` from the artifact dir — not via `requestSecrets` in the sandbox.

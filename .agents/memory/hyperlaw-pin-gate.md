---
name: HyperLaw destructive-action PIN gate
description: PinGateModal is PIN-only — never require a passkey/biometric in addition to the PIN for deletes.
---

# Destructive-action gate = PIN only

`PinGateModal` (used for BOTH case deletion via ManageCasesModal and account deletion) is a
single-factor PIN gate. It creates a PIN on first use and verifies it thereafter, then hands
the verified PIN to the server-authoritative endpoint (`batchDeleteCases(ids, pin)`,
`deleteUserData(pin)`).

- **Do NOT add WebAuthn / passkey / Face ID / Touch ID as a second required step.** It was
  removed because a user who set a PIN was then ALSO prompted for a device passkey on every
  delete — they explicitly rejected needing both for one action.
- The server authorizes deletion on the PIN alone; the old device gesture was fail-soft and
  non-authoritative (it called `onSuccess` regardless of the gesture), so it added friction
  with zero security value. The webauthn client lib + `aiApi.security.webauthn*` wrappers
  remain in the tree but dormant/unused — safe to leave; do not re-wire them into deletes.
- **Why:** explicit user directive — "if they type in their password [PIN], they don't need
  both to delete a case." **How to apply:** keep destructive gates single-factor (PIN).

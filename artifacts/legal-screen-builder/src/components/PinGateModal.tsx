import React, { useEffect, useState } from "react";
import { useUser } from "@clerk/react";
import { aiApi } from "../lib/aiApi";
import { hasPlatformAuthenticator, verifyDevice, enrollDevice, isWebauthnAvailable } from "../lib/webauthnClient";

const ORANGE = "#d9711f";

/**
 * Security gate for destructive actions. Handles first-time PIN creation and
 * PIN verification, plus an optional Face ID / Touch ID gesture when the device
 * supports it. The verified PIN is handed back via onSuccess so the caller can
 * pass it to a PIN-guarded endpoint. WebAuthn is additive and fails soft — the
 * PIN is always the enforced gate.
 */
export default function PinGateModal({ open, title, description, confirmLabel = "Confirm", onClose, onSuccess }: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  onClose: () => void;
  onSuccess: (pin: string) => void;
}) {
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [hasPin, setHasPin] = useState(false);
  const [webauthnEnabled, setWebauthnEnabled] = useState(false);
  const [deviceCapable, setDeviceCapable] = useState(false);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offerDevice, setOfferDevice] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPin(""); setConfirm(""); setError(null); setOfferDevice(false); setLoading(true);
    aiApi.security.status()
      .then(async s => {
        setHasPin(s.hasPin);
        setWebauthnEnabled(s.webauthnEnabled);
        setDeviceCapable(await hasPlatformAuthenticator());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  async function runDeviceGesture(): Promise<void> {
    if (!webauthnEnabled || !isWebauthnAvailable()) return;
    try {
      const { challenge, credentialIds } = await aiApi.security.webauthnChallenge();
      await verifyDevice(challenge, credentialIds);
    } catch { /* fail soft — PIN is the enforced gate */ }
  }

  async function submit() {
    setError(null);
    if (!/^\d{4,8}$/.test(pin)) { setError("PIN must be 4–8 digits"); return; }
    setBusy(true);
    try {
      if (!hasPin) {
        if (pin !== confirm) { setError("PINs do not match"); setBusy(false); return; }
        await aiApi.security.setPin(pin);
        if (deviceCapable) { setOfferDevice(true); setBusy(false); return; }
        onSuccess(pin);
      } else {
        await aiApi.security.verifyPin(pin);
        await runDeviceGesture();
        onSuccess(pin);
      }
    } catch (e) {
      setError((e as Error).message || "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function enrollAndFinish() {
    setBusy(true);
    try {
      const { challenge } = await aiApi.security.webauthnChallenge();
      const id = await enrollDevice(
        challenge,
        user?.id ?? "user",
        user?.primaryEmailAddress?.emailAddress ?? "HyperLaw User",
      );
      if (id) await aiApi.security.webauthnEnroll(id);
    } catch { /* best-effort */ }
    setBusy(false);
    onSuccess(pin);
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "14px 16px", background: "#0d0d0d",
    border: "1px solid #2a2a2a", borderRadius: 12, color: "#fff",
    fontSize: 20, letterSpacing: "0.3em", textAlign: "center", outline: "none",
    fontFamily: "monospace",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.9)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 20px",
      fontFamily: "Arial, sans-serif",
    }}>
      <div style={{
        background: "#111", border: "1px solid #2a2a2a", borderRadius: 20,
        maxWidth: 380, width: "100%", padding: "28px 24px",
      }}>
        {loading ? (
          <div style={{ textAlign: "center", color: "#666", fontSize: 14, padding: "20px 0" }}>Loading…</div>
        ) : offerDevice ? (
          <>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: "#fff", margin: "0 0 8px", textAlign: "center" }}>
              Add Face ID / Touch ID?
            </h3>
            <p style={{ fontSize: 13, color: "#888", lineHeight: 1.6, textAlign: "center", marginBottom: 22 }}>
              Add your device's biometric as an extra layer before any deletion. You can skip this and use your PIN alone.
            </p>
            <button onClick={enrollAndFinish} disabled={busy} style={{
              width: "100%", padding: "14px", background: `linear-gradient(90deg, ${ORANGE}, #FF7A1A)`,
              border: "none", borderRadius: 12, color: "#0a0908", fontWeight: 800, fontSize: 14,
              cursor: busy ? "default" : "pointer", marginBottom: 10, opacity: busy ? 0.6 : 1,
            }}>
              {busy ? "Setting up…" : "Enable device unlock"}
            </button>
            <button onClick={() => onSuccess(pin)} disabled={busy} style={{
              width: "100%", padding: "12px", background: "none", border: "1px solid #2a2a2a",
              borderRadius: 12, color: "#888", fontWeight: 600, fontSize: 13, cursor: "pointer",
            }}>
              Skip — use PIN only
            </button>
          </>
        ) : (
          <>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: "#fff", margin: "0 0 8px", textAlign: "center" }}>
              {hasPin ? title : "Create a security PIN"}
            </h3>
            <p style={{ fontSize: 13, color: "#888", lineHeight: 1.6, textAlign: "center", marginBottom: 20 }}>
              {hasPin
                ? (description ?? "Enter your PIN to continue.")
                : "Set a 4–8 digit PIN. You'll need it to delete cases or your account."}
            </p>

            <input
              type="password" inputMode="numeric" autoFocus
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="••••"
              style={{ ...inputStyle, marginBottom: hasPin ? 12 : 10 }}
              onKeyDown={e => { if (e.key === "Enter" && hasPin) submit(); }}
            />
            {!hasPin && (
              <input
                type="password" inputMode="numeric"
                value={confirm}
                onChange={e => setConfirm(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="Confirm PIN"
                style={{ ...inputStyle, marginBottom: 12 }}
                onKeyDown={e => { if (e.key === "Enter") submit(); }}
              />
            )}

            {error && <div style={{ color: "#ef4444", fontSize: 12, textAlign: "center", marginBottom: 12 }}>{error}</div>}

            <button onClick={submit} disabled={busy} style={{
              width: "100%", padding: "14px", background: `linear-gradient(90deg, ${ORANGE}, #FF7A1A)`,
              border: "none", borderRadius: 12, color: "#0a0908", fontWeight: 800, fontSize: 14,
              cursor: busy ? "default" : "pointer", marginBottom: 10, opacity: busy ? 0.6 : 1,
            }}>
              {busy ? "Please wait…" : (hasPin ? confirmLabel : "Set PIN & continue")}
            </button>
            <button onClick={onClose} disabled={busy} style={{
              width: "100%", padding: "12px", background: "none", border: "none",
              color: "#666", fontWeight: 600, fontSize: 13, cursor: "pointer",
            }}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}

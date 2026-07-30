import React, { useEffect, useRef, useState } from "react";
import { Fingerprint } from "lucide-react";
import { aiApi } from "../lib/aiApi";
import { isPasskeySupported, verifyPasskey, cachePin, getCachedPin } from "../lib/webauthn";

const ORANGE = "#d9711f";

/**
 * Security gate for destructive actions. Handles first-time PIN creation and PIN
 * verification, and hands the verified PIN back via onSuccess so the caller can
 * pass it to a PIN-guarded endpoint.
 *
 * The PIN is always the server-verified factor — every PIN-guarded endpoint
 * re-checks it itself. If the user has enrolled a passkey (Face ID / Touch ID /
 * fingerprint, set up from Profile → Security), a biometric prompt can unlock a
 * copy of the PIN cached on this device instead of retyping it — that's a
 * convenience shortcut, not a second required gate.
 */
export default function PinGateModal({ open, title, description, confirmLabel = "Confirm", userId, onClose, onSuccess }: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  userId?: string | null;
  onClose: () => void;
  onSuccess: (pin: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [hasPin, setHasPin] = useState(false);
  const [webauthnEnabled, setWebauthnEnabled] = useState(false);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const confirmRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setPin(""); setConfirm(""); setError(null); setLoading(true);
    aiApi.security.status()
      .then(s => { setHasPin(s.hasPin); setWebauthnEnabled(s.webauthnEnabled); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  async function submit() {
    setError(null);
    if (!/^\d{4,8}$/.test(pin)) { setError("PIN must be 4–8 digits"); return; }
    setBusy(true);
    try {
      if (!hasPin) {
        if (pin !== confirm) { setError("PINs do not match"); setBusy(false); return; }
        await aiApi.security.setPin(pin);
        if (webauthnEnabled && userId) cachePin(userId, pin);
        onSuccess(pin);
      } else {
        await aiApi.security.verifyPin(pin);
        if (webauthnEnabled && userId) cachePin(userId, pin);
        onSuccess(pin);
      }
    } catch (e) {
      setError((e as Error).message || "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function usePasskey() {
    if (!userId) return;
    setError(null);
    setPasskeyBusy(true);
    try {
      const { challenge, credentialIds } = await aiApi.security.webauthnChallenge();
      await verifyPasskey(challenge, credentialIds);
      const cached = getCachedPin(userId);
      if (!cached) {
        setError("Passkey confirmed, but no PIN is saved on this device — please enter it once.");
        return;
      }
      onSuccess(cached);
    } catch (e) {
      setError((e as Error).message || "Passkey unlock failed");
    } finally {
      setPasskeyBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "14px 16px", background: "#0d0d0d",
    border: "1px solid #2a2a2a", borderRadius: 12, color: "#fff",
    fontSize: 20, letterSpacing: "0.3em", textAlign: "center", outline: "none",
    fontFamily: "monospace",
  };

  const showPasskeyButton = hasPin && webauthnEnabled && !!userId && isPasskeySupported();

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

            {showPasskeyButton && (
              <>
                <button onClick={usePasskey} disabled={passkeyBusy} style={{
                  width: "100%", padding: "13px", background: "none",
                  border: `1.5px solid ${ORANGE}66`, borderRadius: 12,
                  color: ORANGE, fontWeight: 800, fontSize: 14, marginBottom: 16,
                  cursor: passkeyBusy ? "default" : "pointer", opacity: passkeyBusy ? 0.6 : 1,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}>
                  <Fingerprint size={18} color={ORANGE} />
                  {passkeyBusy ? "Waiting for Face ID / Touch ID…" : "Unlock with Face ID / Touch ID"}
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <div style={{ flex: 1, height: 1, background: "#222" }} />
                  <span style={{ fontSize: 11, color: "#444", fontWeight: 700 }}>OR ENTER PIN</span>
                  <div style={{ flex: 1, height: 1, background: "#222" }} />
                </div>
              </>
            )}

            <input
              type="password" inputMode="numeric" autoFocus
              value={pin}
              onChange={e => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 8);
                setPin(v);
                if (!hasPin && v.length === 4) confirmRef.current?.focus();
              }}
              placeholder="••••"
              style={{ ...inputStyle, marginBottom: hasPin ? 12 : 10 }}
              onKeyDown={e => { if (e.key === "Enter" && hasPin) submit(); }}
            />
            {!hasPin && (
              <input
                ref={confirmRef}
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

import React, { useEffect, useState } from "react";
import { X, Trash2, AlertTriangle } from "lucide-react";
import { aiApi } from "../lib/aiApi";
import PinGateModal from "./PinGateModal";

const ORANGE = "#d9711f";

export default function ManageCasesModal(props: {
  open: boolean;
  cases: Array<{ id: string; title: string }>;
  onClose: () => void;
  onDeleted: (deletedIds: string[]) => void;
  onBuyCredits?: () => void;
}): React.JSX.Element | null {
  const { open, cases, onClose, onDeleted, onBuyCredits } = props;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noCredits, setNoCredits] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setConfirming(false);
      setPinOpen(false);
      setError(null);
      setNoCredits(false);
      setBusy(false);
    }
  }, [open]);

  if (!open) return null;

  const selectedIds = Array.from(selected);
  const count = selectedIds.length;
  const allSelected = cases.length > 0 && count === cases.length;

  function toggle(id: string): void {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(): void {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(cases.map(c => c.id)));
  }

  function resetError(): void {
    setError(null);
    setNoCredits(false);
  }

  async function handlePinSuccess(pin: string): Promise<void> {
    resetError();
    setBusy(true);
    try {
      await aiApi.batchDeleteCases(selectedIds, pin);
      const deleted = selectedIds;
      setPinOpen(false);
      setConfirming(false);
      setSelected(new Set());
      onDeleted(deleted);
      onClose();
    } catch (err: unknown) {
      setPinOpen(false);
      if ((err as { creditBalance?: number }).creditBalance !== undefined) {
        setNoCredits(true);
        setError("Not enough credits");
      } else {
        setError((err as Error).message || "Deletion failed");
      }
    } finally {
      setBusy(false);
    }
  }

  const overlay: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "24px 20px", fontFamily: "Arial, sans-serif", zIndex: 300,
  };
  const card: React.CSSProperties = {
    background: "#111", border: "1px solid #2a2a2a", borderRadius: 20,
    maxWidth: 440, width: "100%", padding: "28px 24px",
    maxHeight: "90vh", overflowY: "auto",
  };
  const primaryBtn = (disabled: boolean): React.CSSProperties => ({
    background: `linear-gradient(90deg, ${ORANGE}, #FF7A1A)`,
    border: "none", borderRadius: 12, color: "#0a0908",
    fontWeight: 800, fontSize: 14, padding: "14px",
    cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1,
    width: "100%",
  });
  const secondaryBtn: React.CSSProperties = {
    background: "none", border: "1px solid #2a2a2a", borderRadius: 12,
    color: "#888", fontWeight: 600, padding: "12px", fontSize: 13,
    cursor: "pointer", width: "100%",
  };
  const sectionLabel: React.CSSProperties = {
    fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5,
    textTransform: "uppercase",
  };

  return (
    <div style={overlay}>
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: "#fff", margin: 0 }}>Manage Cases</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: "none", border: "none", color: "#888", cursor: "pointer", display: "flex", padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div style={{ color: "#ef4444", fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>
            {error}
            {noCredits && onBuyCredits && (
              <div style={{ marginTop: 10 }}>
                <button onClick={onBuyCredits} style={primaryBtn(false)}>Buy credits</button>
              </div>
            )}
          </div>
        )}

        {cases.length === 0 ? (
          <p style={{ color: "#888", fontSize: 13, lineHeight: 1.6, margin: 0 }}>You have no cases yet.</p>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <button
                onClick={toggleAll}
                style={{ background: "none", border: "none", color: ORANGE, fontWeight: 700, fontSize: 12, cursor: "pointer", padding: 0 }}
              >
                {allSelected ? "Deselect all" : "Select all"}
              </button>
              <span style={sectionLabel}>{count} selected</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
              {cases.map(c => {
                const isChecked = selected.has(c.id);
                return (
                  <label
                    key={c.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: 12,
                      padding: "12px 14px", cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(c.id)}
                      style={{ width: 16, height: 16, accentColor: ORANGE, cursor: "pointer" }}
                    />
                    <span style={{ color: "#ccc", fontSize: 13, lineHeight: 1.6, wordBreak: "break-word" }}>
                      {c.title}
                    </span>
                  </label>
                );
              })}
            </div>

            {!confirming ? (
              <button
                onClick={() => { resetError(); setConfirming(true); }}
                disabled={count === 0}
                style={{ ...primaryBtn(count === 0), display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                <Trash2 size={16} />
                Delete selected ({count})
              </button>
            ) : (
              <div style={{ background: "#1a0d0d", border: "1px solid #3a1a1a", borderRadius: 12, padding: "16px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
                  <AlertTriangle size={18} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />
                  <p style={{ color: "#ccc", fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                    This permanently deletes {count} case(s) and all their documents, notes, timelines and reminders. This cannot be undone.
                  </p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <button
                    onClick={() => { resetError(); setPinOpen(true); }}
                    disabled={busy}
                    style={primaryBtn(busy)}
                  >
                    Yes, continue
                  </button>
                  <button onClick={() => setConfirming(false)} disabled={busy} style={secondaryBtn}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {pinOpen && (
        <PinGateModal
          open
          title="Confirm deletion"
          description="Enter your PIN to permanently delete the selected cases."
          confirmLabel="Delete"
          onClose={() => setPinOpen(false)}
          onSuccess={handlePinSuccess}
        />
      )}
    </div>
  );
}

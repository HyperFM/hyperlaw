import React from "react";
import { COMPLIANCE } from "../lib/compliance";

const ORANGE = "#d9711f";

interface Props {
  onConfirm: () => void;
  onClose: () => void;
}

export default function DocGenConfirmModal({ onConfirm, onClose }: Props) {
  const [checked, setChecked] = React.useState(false);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 8000,
      background: "rgba(0,0,0,0.90)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px 20px",
      fontFamily: "Arial, sans-serif",
    }}>
      <div style={{
        background: "#111", border: "1px solid #2a2a2a",
        borderRadius: 18, maxWidth: 380, width: "100%",
        padding: "28px 24px 24px",
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: ORANGE, letterSpacing: "0.12em", marginBottom: 12 }}>
          BEFORE CONTINUING
        </div>
        <p style={{ fontSize: 14, color: "#ccc", lineHeight: 1.65, marginBottom: 20 }}>
          {COMPLIANCE.DOC_REVIEW_NOTICE}
        </p>
        <div style={{
          background: "#0d0d0d", border: "1px solid #1e1e1e",
          borderRadius: 12, padding: "14px 16px", marginBottom: 20, fontSize: 12, color: "#666", lineHeight: 1.6,
        }}>
          {COMPLIANCE.DRAFTING_ASSISTANT}
        </div>

        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", marginBottom: 20 }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={e => setChecked(e.target.checked)}
            style={{ marginTop: 2, accentColor: ORANGE, width: 16, height: 16, flexShrink: 0 }}
          />
          <span style={{ fontSize: 13, color: checked ? "#ccc" : "#777", lineHeight: 1.5, transition: "color 0.2s" }}>
            I understand.
          </span>
        </label>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, background: "none", border: "1px solid #2a2a2a", borderRadius: 10,
            padding: "11px 16px", cursor: "pointer", color: "#555", fontSize: 13, fontWeight: 700,
          }}>
            Cancel
          </button>
          <button
            onClick={() => { if (checked) { onConfirm(); onClose(); } }}
            disabled={!checked}
            style={{
              flex: 2, background: checked ? `linear-gradient(90deg, ${ORANGE}, #FF7A1A)` : "#1a1a1a",
              border: "none", borderRadius: 10,
              padding: "11px 16px", cursor: checked ? "pointer" : "not-allowed",
              color: checked ? "#000" : "#444", fontSize: 13, fontWeight: 800,
              transition: "all 0.2s",
            }}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

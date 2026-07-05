import { useState } from "react";
import { HelpCircle, X } from "lucide-react";

const ORANGE = "#f45d01";

interface Props {
  /** The explanation text or JSX shown when expanded */
  children: React.ReactNode;
  /** Override the button label */
  label?: string;
}

export function WhyThisMatters({ children, label = "Why does this matter?" }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginBottom: 20 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: "none", border: "none", padding: 0,
          color: open ? ORANGE : "#666", fontSize: 13, cursor: "pointer",
          display: "inline-flex", alignItems: "center", gap: 5,
          fontWeight: 700, transition: "color 0.15s",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <HelpCircle size={14} color={open ? ORANGE : "#555"} />
        {label}
      </button>

      {open && (
        <div style={{
          marginTop: 10,
          background: "#100e0c",
          border: `1px solid ${ORANGE}33`,
          borderRadius: 12,
          padding: "14px 38px 14px 16px",
          fontSize: 13, color: "#888", lineHeight: 1.75,
          position: "relative",
          animation: "wtmFadeIn 0.15s ease",
        }}>
          <button
            onClick={() => setOpen(false)}
            style={{
              position: "absolute", top: 10, right: 10,
              background: "none", border: "none",
              color: "#444", cursor: "pointer", padding: 2,
              display: "flex", alignItems: "center",
            }}
            aria-label="Close"
          >
            <X size={13} />
          </button>
          {children}
        </div>
      )}

      <style>{`
        @keyframes wtmFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

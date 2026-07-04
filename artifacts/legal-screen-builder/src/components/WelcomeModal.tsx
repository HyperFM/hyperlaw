import React, { useState, useEffect } from "react";
import { COMPLIANCE } from "../lib/compliance";

const WELCOME_KEY = "hl_welcomed_v1";
const ORANGE = "#d9711f";

export default function WelcomeModal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Show once per account on this device
    if (!localStorage.getItem(WELCOME_KEY)) setVisible(true);
  }, []);

  function dismiss() {
    localStorage.setItem(WELCOME_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.92)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px 20px",
      fontFamily: "Arial, sans-serif",
    }}>
      <div style={{
        background: "#111", border: "1px solid #2a2a2a",
        borderRadius: 20, maxWidth: 400, width: "100%",
        padding: "32px 28px 28px",
        textAlign: "center",
      }}>
        {/* Logo */}
        <div style={{ marginBottom: 20 }}>
          <span style={{ color: ORANGE, fontWeight: 900, fontSize: 22, letterSpacing: "-0.02em" }}>HYPER</span>
          <span style={{ fontWeight: 900, fontSize: 22, letterSpacing: "-0.02em", color: "#fff" }}>LAW</span>
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginBottom: 8, lineHeight: 1.3 }}>
          Welcome to HyperLaw
        </h2>
        <p style={{ fontSize: 12, color: "#555", marginBottom: 24, letterSpacing: 0.5 }}>
          AI-POWERED LEGAL SELF-HELP PLATFORM
        </p>

        {/* What HyperLaw does */}
        <div style={{ textAlign: "left", marginBottom: 24 }}>
          <p style={{ fontSize: 13, color: "#888", marginBottom: 12, lineHeight: 1.6 }}>
            HyperLaw is designed to help you:
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              "Organize your legal information",
              "Draft legal documents",
              "Track important deadlines",
              "Understand legal procedures",
              "Prepare for legal matters",
            ].map((item, i) => (
              <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: "#ccc", lineHeight: 1.5 }}>
                <span style={{ color: ORANGE, fontWeight: 900, flexShrink: 0, marginTop: 1 }}>·</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Disclaimer */}
        <div style={{
          background: "#0d0d0d", border: "1px solid #222",
          borderRadius: 12, padding: "14px 16px", marginBottom: 24,
        }}>
          <p style={{ fontSize: 12, color: "#666", lineHeight: 1.7, margin: 0 }}>
            {COMPLIANCE.WELCOME_DISCLAIMER}
          </p>
        </div>

        <button
          onClick={dismiss}
          style={{
            width: "100%", padding: "14px 20px",
            background: `linear-gradient(90deg, ${ORANGE}, #FF7A1A)`,
            border: "none", borderRadius: 12,
            color: "#0a0908", fontWeight: 800, fontSize: 14,
            textTransform: "uppercase", letterSpacing: "0.08em",
            cursor: "pointer",
            boxShadow: `0 8px 24px -8px ${ORANGE}88`,
          }}
        >
          I Understand — Let's Go
        </button>
      </div>
    </div>
  );
}

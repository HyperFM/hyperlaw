import React, { useState } from "react";
import { X, Send, CheckCircle, MessageSquare, Lightbulb, HelpCircle } from "lucide-react";
import { api } from "../lib/api";

const ORANGE = "#d9711f";

const TYPES = [
  { id: "improvement", label: "Improvement idea", icon: Lightbulb },
  { id: "support", label: "Need assistance", icon: HelpCircle },
  { id: "general", label: "General feedback", icon: MessageSquare },
];

interface SupportModalProps { onClose: () => void }

export default function SupportModal({ onClose }: SupportModalProps) {
  const [type, setType] = useState("general");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [visible, setVisible] = useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setVisible(true), 20);
    return () => clearTimeout(t);
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 280);
  }

  async function handleSend() {
    if (!message.trim()) return;
    setSending(true);
    try {
      await api.feedback.submit(message.trim(), type);
      setSent(true);
      setTimeout(() => handleClose(), 2200);
    } catch {
      setSending(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 400, display: "flex",
      alignItems: "flex-end", justifyContent: "center",
      background: `rgba(0,0,0,${visible ? 0.85 : 0})`,
      transition: "background 0.28s ease",
    }}>
      <div onClick={handleClose} style={{ position: "absolute", inset: 0 }} />
      <div style={{
        position: "relative", zIndex: 1, width: "100%", maxWidth: 560,
        background: "#0f0f0f", border: "1px solid #1e1e1e",
        borderRadius: "20px 20px 0 0",
        transform: `translateY(${visible ? 0 : "100%"})`,
        transition: "transform 0.32s cubic-bezier(.22,.9,.32,1)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}>
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid #1a1a1a",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <MessageSquare size={16} color={ORANGE} />
            <span style={{ fontWeight: 800, fontSize: 15 }}>Support & Feedback</span>
          </div>
          <button onClick={handleClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {sent ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <CheckCircle size={48} color="#22c55e" style={{ marginBottom: 14 }} />
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Received!</div>
            <div style={{ color: "#666", fontSize: 14 }}>We'll be in touch via your notifications.</div>
          </div>
        ) : (
          <div style={{ padding: "20px" }}>
            <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>WHAT IS THIS ABOUT?</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
              {TYPES.map(t => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setType(t.id)}
                    style={{
                      flex: 1, background: type === t.id ? `${ORANGE}18` : "#111",
                      border: `1px solid ${type === t.id ? ORANGE + "55" : "#2a2a2a"}`,
                      borderRadius: 10, padding: "10px 8px", cursor: "pointer",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                    }}
                  >
                    <Icon size={15} color={type === t.id ? ORANGE : "#555"} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: type === t.id ? ORANGE : "#555", textAlign: "center", lineHeight: 1.2 }}>
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>YOUR MESSAGE</div>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Tell us what's on your mind — improvement ideas, something confusing, or anything you need help with…"
              rows={5}
              style={{
                width: "100%", background: "#111", border: "1px solid #2a2a2a",
                borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 14,
                outline: "none", resize: "none", boxSizing: "border-box",
                fontFamily: "Arial, sans-serif", lineHeight: 1.55,
              }}
              onFocus={e => (e.target.style.borderColor = ORANGE)}
              onBlur={e => (e.target.style.borderColor = "#2a2a2a")}
            />

            <button
              onClick={handleSend}
              disabled={!message.trim() || sending}
              style={{
                width: "100%", marginTop: 14, padding: "13px",
                background: message.trim() && !sending ? ORANGE : "#1a1a1a",
                border: "none", borderRadius: 12, color: message.trim() && !sending ? "#000" : "#444",
                fontWeight: 800, fontSize: 14, cursor: message.trim() && !sending ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                transition: "all 0.15s",
              }}
            >
              <Send size={15} /> {sending ? "Sending…" : "Send Feedback"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

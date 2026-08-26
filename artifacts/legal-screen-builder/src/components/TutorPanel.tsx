import React, { useState } from "react";
import { ChevronRight, X, Send, Loader2, ArrowRight } from "lucide-react";
import { aiApi } from "../lib/aiApi";
import GuidanceMascot, { MascotState } from "./GuidanceMascot";

const ORANGE = "#d9711f";

/** The Tutor — a small, free, always-available in-app guide. Separate in
 *  every way from the paid Guidance Session (GuidanceSessionModal): no
 *  credits, no case-strengthening interview, just short answers about how
 *  to use the app itself, with an optional one-tap jump to the relevant
 *  screen. Mounted once at the app root (mirrors DebugPanel's mount
 *  pattern) so it persists across navigation; hidden entirely — not just
 *  collapsed — when Training Wheels is off. */
export default function TutorPanel({
  enabled,
  onNavigate,
}: {
  enabled: boolean;
  onNavigate: (destination: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [destination, setDestination] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!enabled) return null;

  function reset() {
    setInput(""); setReply(null); setDestination(null); setError(null); setSending(false);
  }

  async function ask() {
    const message = input.trim();
    if (!message || sending) return;
    setSending(true);
    setError(null);
    setReply(null);
    setDestination(null);
    try {
      const res = await aiApi.tutorHelp(message);
      setReply(res.reply);
      setDestination(res.destination);
    } catch {
      setError("Couldn't reach your Tutor right now — try again.");
    } finally {
      setSending(false);
    }
  }

  const mascotState: MascotState = sending ? "thinking" : reply ? "happy" : "idle";

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open Tutor"
          style={{
            position: "fixed", left: 0, top: "50%", transform: "translateY(-50%)", zIndex: 998,
            background: ORANGE, border: "none", borderRadius: "0 10px 10px 0",
            padding: "14px 6px", cursor: "pointer", display: "flex", alignItems: "center",
            boxShadow: `0 0 14px ${ORANGE}66`,
          }}
        >
          <ChevronRight size={16} color="#000" />
        </button>
      )}

      {open && (
        <div
          onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 999,
            background: "rgba(0,0,0,0.72)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}
        >
          <div style={{
            background: "#0c0c0c", borderTop: `1px solid ${ORANGE}44`,
            borderLeft: "1px solid #222", borderRight: "1px solid #222",
            borderRadius: "22px 22px 0 0", width: "100%", maxWidth: 480,
            maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden",
            boxShadow: `0 -20px 60px rgba(0,0,0,0.7)`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px 10px", borderBottom: "1px solid #1a1a1a" }}>
              <GuidanceMascot size={44} state={mascotState} costume="judge" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>Tutor</div>
                <div style={{ fontSize: 12, color: "#7a7a7a" }}>I'm your HyperLaw Tutor.</div>
              </div>
              <button onClick={() => { setOpen(false); reset(); }} aria-label="Close" style={{ background: "none", border: "none", color: "#777", cursor: "pointer", padding: 4 }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 13, color: "#999", lineHeight: 1.6 }}>
                What are you trying to do? I can only help with using the app itself — not legal questions.
              </div>

              {reply && (
                <div style={{ background: "#161616", border: "1px solid #262626", borderRadius: 14, padding: "12px 14px", fontSize: 14, color: "#dcdcdc", lineHeight: 1.55 }}>
                  {reply}
                </div>
              )}

              {destination && (
                <button
                  onClick={() => { onNavigate(destination); setOpen(false); reset(); }}
                  style={{
                    background: `linear-gradient(90deg, ${ORANGE}, #FF7A1A)`, border: "none", borderRadius: 12,
                    padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    cursor: "pointer", fontWeight: 800, fontSize: 13.5, color: "#000",
                  }}
                >
                  Take me there <ArrowRight size={15} />
                </button>
              )}

              {error && <div style={{ color: "#ef4444", fontSize: 12.5 }}>{error}</div>}
            </div>

            <div style={{ borderTop: "1px solid #1a1a1a", padding: "12px 14px" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }}
                  placeholder="e.g. How do I add a photo to my exhibit?"
                  rows={1}
                  disabled={sending}
                  style={{
                    flex: 1, resize: "none", background: "#0d0d0d", border: "1px solid #2a2a2a",
                    borderRadius: 12, color: "#fff", padding: "11px 13px", fontSize: 14,
                    outline: "none", fontFamily: "inherit", maxHeight: 100, minHeight: 44,
                  }}
                />
                <button
                  onClick={ask}
                  disabled={sending || !input.trim()}
                  aria-label="Send"
                  style={{
                    background: input.trim() && !sending ? `linear-gradient(90deg, ${ORANGE}, #FF7A1A)` : "#1a1a1a",
                    border: "none", borderRadius: 12, width: 46, height: 44, flexShrink: 0,
                    color: input.trim() && !sending ? "#0a0908" : "#555",
                    cursor: input.trim() && !sending ? "pointer" : "not-allowed",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {sending ? <Loader2 size={17} style={{ animation: "hlTutorSpin 1s linear infinite" }} /> : <Send size={17} />}
                </button>
              </div>
            </div>
          </div>
          <style>{`@keyframes hlTutorSpin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}
    </>
  );
}

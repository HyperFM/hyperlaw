import React, { useEffect, useRef, useState } from "react";
import { X, Send, Loader2, Check, Sparkles } from "lucide-react";
import { aiApi } from "../lib/aiApi";
import { COMPLIANCE } from "../lib/compliance";
import GuidanceMascot, { MascotState } from "./GuidanceMascot";

const ORANGE = "#d9711f";
const WORDS_PER_CREDIT = 2000; // display-only; server is authoritative

type Msg = { role: "user" | "assistant"; content: string };
type Phase = "starting" | "chatting" | "completing" | "done" | "error";

/**
 * GuidanceSession — a warm, conversational chat fronted by the orange-brain mascot.
 * Dims the screen, slides up from the bottom, shows a live credit meter, pauses to
 * ask before charging beyond the estimate (spend cap), and auto-closes when done.
 * All credit math is server-authoritative; the meter here is informational.
 */
export default function GuidanceSessionModal(props: {
  open: boolean;
  caseId?: string;
  action?: string;
  documentLabel?: string;
  topics?: string[];
  creditBalance?: number;
  onClose: () => void;
  onCompleted: (result: { creditsCharged: number; creditBalance?: number; summary: string }) => void;
  onBuyCredits?: () => void;
}): React.JSX.Element | null {
  const { open, caseId, action, documentLabel, topics, onClose, onCompleted, onBuyCredits } = props;

  const [phase, setPhase] = useState<Phase>("starting");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [creditCap, setCreditCap] = useState(2);
  const [estimatedCredits, setEstimatedCredits] = useState(0);
  const [capReached, setCapReached] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [needBuyCredits, setNeedBuyCredits] = useState(false);
  const [result, setResult] = useState<{ creditsCharged: number; creditBalance?: number; summary: string } | null>(null);

  const startedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const completingRef = useRef(false); // guards double-complete

  // ── Start the session once per open (guard against StrictMode double-invoke) ──
  useEffect(() => {
    if (!open) { startedRef.current = false; return; }
    if (startedRef.current) return;
    startedRef.current = true;

    // Reset transient state.
    setPhase("starting");
    setSessionId(null);
    setMessages([]);
    setInput("");
    setSending(false);
    setWordCount(0);
    setCreditCap(2);
    setEstimatedCredits(0);
    setCapReached(false);
    setPendingMessage(null);
    setErrorMsg(null);
    setNeedBuyCredits(false);
    setResult(null);
    completingRef.current = false;

    aiApi.guidance
      .start({ caseId, action, documentLabel, topics })
      .then(res => {
        setSessionId(res.sessionId);
        setMessages([{ role: "assistant", content: res.greeting }]);
        setWordCount(res.wordCount);
        setCreditCap(res.creditCap);
        setPhase("chatting");
      })
      .catch((err: unknown) => {
        const e = err as { code?: string; message?: string };
        if (e.code === "insufficient_credits") {
          setNeedBuyCredits(true);
          setErrorMsg("You don't have enough credits to start a guidance session.");
        } else {
          setErrorMsg(e.message || "Couldn't start the guidance session. Please try again.");
        }
        setPhase("error");
      });
  }, [open, caseId, action, documentLabel, topics]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending, capReached]);

  // Show the completion screen briefly, then hand the result back (parent closes this sheet
  // and re-opens the decision layer, now enriched). onClose cleanup clears this if the user
  // dismisses early. Result is set in the same batch as phase→done, so the closure sees it.
  useEffect(() => {
    if (phase !== "done") return;
    const t = setTimeout(() => { if (result) onCompleted(result); else onClose(); }, 2400);
    return () => clearTimeout(t);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const hasUserContent = messages.some(m => m.role === "user") || !!pendingMessage;

  async function finalize() {
    if (!sessionId || completingRef.current) return;
    completingRef.current = true;
    setCapReached(false);
    setPhase("completing");
    try {
      const res = await aiApi.guidance.complete(sessionId);
      const r = { creditsCharged: res.creditsCharged, creditBalance: res.creditBalance, summary: res.summary };
      setResult(r);
      setPhase("done"); // done-screen renders; the auto-close effect hands `r` back via onCompleted
    } catch (err: unknown) {
      // Even if extraction/charge reporting failed, the session is effectively over.
      const r = { creditsCharged: 0, summary: "" };
      setResult(r);
      setPhase("done");
      void err;
    }
  }

  async function deliver(text: string, extendCap: boolean) {
    if (!sessionId) return;
    setSending(true);
    setErrorMsg(null);
    try {
      const res = await aiApi.guidance.message(sessionId, { message: text, extendCap });
      if (res.capReached) {
        setCapReached(true);
        setPendingMessage(text);
        setCreditCap(res.creditCap);
        setSending(false);
        return;
      }
      setCapReached(false);
      setPendingMessage(null);
      setCreditCap(res.creditCap);
      setWordCount(res.wordCount);
      setEstimatedCredits(res.estimatedCredits);
      if (res.reply) setMessages(prev => [...prev, { role: "assistant", content: res.reply as string }]);
      setSending(false);
      if (res.done) setTimeout(() => finalize(), 900);
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      setSending(false);
      if (e.code === "insufficient_credits") {
        setNeedBuyCredits(true);
        setErrorMsg("You're out of credits to continue this session.");
      } else {
        setErrorMsg(e.message || "Message failed to send. Try again.");
      }
    }
  }

  function handleSend() {
    const text = input.trim();
    if (!text || sending || capReached) return;
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setInput("");
    void deliver(text, false);
  }

  function handleApproveMore() {
    if (!pendingMessage) return;
    void deliver(pendingMessage, true);
  }

  function handleClose() {
    if (phase === "chatting" && hasUserContent) {
      void finalize(); // finalize (and charge for what was used) with the summary screen
      return;
    }
    if (sessionId && phase !== "done") void aiApi.guidance.complete(sessionId).catch(() => {});
    onClose();
  }

  const meterPct = Math.min(100, Math.round((wordCount / Math.max(1, creditCap * WORDS_PER_CREDIT)) * 100));
  const mascotState: MascotState =
    phase === "done" ? "happy" :
    phase === "completing" || phase === "starting" || sending ? "thinking" :
    "idle";

  const bubbleStyle = (role: "user" | "assistant"): React.CSSProperties => ({
    alignSelf: role === "user" ? "flex-end" : "flex-start",
    maxWidth: "82%",
    background: role === "user" ? `linear-gradient(90deg, ${ORANGE}, #FF7A1A)` : "#161616",
    color: role === "user" ? "#0a0908" : "#dcdcdc",
    border: role === "user" ? "none" : "1px solid #262626",
    borderRadius: 14,
    borderBottomRightRadius: role === "user" ? 4 : 14,
    borderBottomLeftRadius: role === "user" ? 14 : 4,
    padding: "10px 13px",
    fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word",
    fontWeight: role === "user" ? 700 : 400,
  });

  return (
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) handleClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 1200,
        background: "rgba(0,0,0,0.78)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        fontFamily: "Arial, sans-serif",
        animation: "hlgsFade 0.2s ease",
      }}
    >
      <div
        style={{
          background: "#0c0c0c", borderTop: `1px solid ${ORANGE}44`,
          borderLeft: "1px solid #222", borderRight: "1px solid #222",
          borderRadius: "22px 22px 0 0", width: "100%", maxWidth: 540,
          maxHeight: "88vh", display: "flex", flexDirection: "column",
          boxShadow: `0 -20px 60px rgba(0,0,0,0.7), 0 0 40px ${ORANGE}18`,
          animation: "hlgsSlideUp 0.32s cubic-bezier(0.16,1,0.3,1)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px 10px", borderBottom: "1px solid #1a1a1a" }}>
          <GuidanceMascot size={48} state={mascotState} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
              Guidance Session
            </div>
            <div style={{ fontSize: 12, color: "#7a7a7a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {documentLabel ? `Preparing to draft: ${documentLabel}` : "Let's strengthen your case together"}
            </div>
          </div>
          <button onClick={handleClose} aria-label="Close" style={{ background: "none", border: "none", color: "#777", cursor: "pointer", padding: 4, lineHeight: 0 }}>
            <X size={20} />
          </button>
        </div>

        {/* Credit meter */}
        {(phase === "chatting" || phase === "completing") && (
          <div style={{ padding: "10px 16px 8px", borderBottom: "1px solid #141414" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: "#888", fontWeight: 700, letterSpacing: 0.4 }}>
                ESTIMATED SO FAR: <span style={{ color: ORANGE }}>{estimatedCredits} credit{estimatedCredits === 1 ? "" : "s"}</span>
              </span>
              <span style={{ fontSize: 11, color: "#555" }}>Cap: {creditCap} credit{creditCap === 1 ? "" : "s"}</span>
            </div>
            <div style={{ height: 5, background: "#1c1c1c", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${meterPct}%`, height: "100%", background: `linear-gradient(90deg, ${ORANGE}, #FF7A1A)`, borderRadius: 3, transition: "width 0.4s ease" }} />
            </div>
            <div style={{ fontSize: 10.5, color: "#555", marginTop: 5 }}>
              You're only charged when the session finishes — never above the cap without asking.
            </div>
          </div>
        )}

        {/* Body */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 10, minHeight: 160 }}>
          {phase === "starting" && (
            <div style={{ margin: "auto", textAlign: "center", color: "#888" }}>
              <Loader2 size={22} style={{ animation: "spin 1s linear infinite", color: ORANGE }} />
              <div style={{ marginTop: 10, fontSize: 13 }}>Waking up your guide…</div>
            </div>
          )}

          {phase === "error" && (
            <div style={{ margin: "auto", textAlign: "center", maxWidth: 340 }}>
              <div style={{ color: "#ef4444", fontSize: 14, lineHeight: 1.6, marginBottom: 14 }}>{errorMsg}</div>
              {needBuyCredits ? (
                <button onClick={() => { onClose(); onBuyCredits?.(); }} style={primaryBtn}>Buy credits</button>
              ) : (
                <button onClick={onClose} style={secondaryBtn}>Close</button>
              )}
            </div>
          )}

          {(phase === "chatting" || phase === "completing") && messages.map((m, i) => (
            <div key={i} style={bubbleStyle(m.role)}>{m.content}</div>
          ))}

          {sending && phase === "chatting" && (
            <div style={{ ...bubbleStyle("assistant"), display: "inline-flex", alignItems: "center", gap: 8, color: "#888" }}>
              <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> thinking…
            </div>
          )}

          {capReached && (
            <div style={{ alignSelf: "stretch", background: "#1a1207", border: `1px solid ${ORANGE}55`, borderRadius: 14, padding: "14px 16px" }}>
              <div style={{ fontWeight: 800, color: "#f0c48a", fontSize: 13, marginBottom: 6 }}>
                You've reached this session's {creditCap}-credit estimate
              </div>
              <div style={{ color: "#c9a978", fontSize: 12.5, lineHeight: 1.55, marginBottom: 12 }}>
                Keep going for up to {creditCap + 2} credits total? You're still only charged for what's actually used.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleApproveMore} disabled={sending} style={{ ...primaryBtn, flex: 1, opacity: sending ? 0.6 : 1 }}>
                  {sending ? "…" : "Approve & continue"}
                </button>
                <button onClick={finalize} disabled={sending} style={{ ...secondaryBtn, flex: 1 }}>Wrap up now</button>
              </div>
            </div>
          )}

          {phase === "completing" && (
            <div style={{ alignSelf: "center", textAlign: "center", color: "#888", marginTop: 8 }}>
              <Loader2 size={18} style={{ animation: "spin 1s linear infinite", color: ORANGE }} />
              <div style={{ marginTop: 8, fontSize: 13 }}>Saving what you shared into your case…</div>
            </div>
          )}

          {phase === "done" && result && (
            <div style={{ margin: "auto", textAlign: "center", maxWidth: 360, padding: "10px 0" }}>
              <div style={{ display: "inline-flex", marginBottom: 12 }}><GuidanceMascot size={72} state="happy" /></div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#22c55e", fontWeight: 800, fontSize: 15, marginBottom: 8 }}>
                <Check size={16} /> Session complete
              </div>
              {result.summary && (
                <div style={{ color: "#bbb", fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>{result.summary}</div>
              )}
              <div style={{ color: result.creditsCharged > 0 ? ORANGE : "#888", fontSize: 13, fontWeight: 700 }}>
                {result.creditsCharged > 0
                  ? `Charged ${result.creditsCharged} credit${result.creditsCharged === 1 ? "" : "s"}`
                  : "No credits used"}
              </div>
              <div style={{ color: "#555", fontSize: 12, marginTop: 6 }}>Your answers are now part of your case.</div>
            </div>
          )}
        </div>

        {/* Footer / input */}
        {phase === "chatting" && !capReached && (
          <div style={{ borderTop: "1px solid #1a1a1a", padding: "12px 14px" }}>
            {errorMsg && <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 8 }}>{errorMsg}</div>}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Type your answer…"
                rows={1}
                disabled={sending}
                style={{
                  flex: 1, resize: "none", background: "#0d0d0d", border: "1px solid #2a2a2a",
                  borderRadius: 12, color: "#fff", padding: "11px 13px", fontSize: 14,
                  outline: "none", fontFamily: "Arial, sans-serif", maxHeight: 120, minHeight: 44,
                }}
              />
              <button
                onClick={handleSend}
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
                {sending ? <Loader2 size={17} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={17} />}
              </button>
            </div>
            <button
              onClick={finalize}
              style={{
                width: "100%", marginTop: 8, background: "none", border: "1px solid #242424",
                borderRadius: 10, color: "#888", fontWeight: 700, fontSize: 12.5, padding: "9px",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              <Sparkles size={13} color={ORANGE} /> I'm done — save &amp; finish
            </button>
            <div style={{ color: "#444", fontSize: 10.5, lineHeight: 1.5, marginTop: 8, textAlign: "center" }}>
              {COMPLIANCE.AI_GENERATED_SHORT}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes hlgsFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes hlgsSlideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
      `}</style>
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  background: `linear-gradient(90deg, ${ORANGE}, #FF7A1A)`, border: "none", borderRadius: 12,
  color: "#0a0908", fontWeight: 800, fontSize: 13, padding: "11px 16px", cursor: "pointer",
  fontFamily: "Arial, sans-serif",
};
const secondaryBtn: React.CSSProperties = {
  background: "none", border: "1px solid #2a2a2a", borderRadius: 12, color: "#999",
  fontWeight: 700, fontSize: 13, padding: "11px 16px", cursor: "pointer", fontFamily: "Arial, sans-serif",
};

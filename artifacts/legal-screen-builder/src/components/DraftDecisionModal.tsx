import React, { useEffect, useRef, useState } from "react";
import { X, Loader2, Sparkles, CheckCircle2, MessageCircle, FileText, AlertCircle } from "lucide-react";
import { aiApi, DocumentType, DraftDecision, DraftDecisionResult } from "../lib/aiApi";
import { COMPLIANCE } from "../lib/compliance";
import GuidanceMascot from "./GuidanceMascot";

const ORANGE = "#d9711f";

/**
 * DraftDecisionModal — the AI Decision Layer shown before any billable draft.
 * On open it asks the server whether the case is Ready-to-Draft, Guidance-Recommended,
 * or Guidance-Required, shows the credit estimate (the enforced spend cap), collects a
 * compliance acknowledgment (and the responded-to document when needed), then routes to
 * either a Guidance Session or straight to drafting.
 */
export default function DraftDecisionModal(props: {
  open: boolean;
  documentType: DocumentType;
  documentLabel: string;
  caseId?: string;
  needsSource: boolean;
  creditBalance?: number;
  waived?: boolean; // admin/apex — never blocked on balance
  guidanceJustCompleted?: boolean; // just returned from a session → surface "draft now"
  onClose: () => void;
  onStartGuidance: (topics: string[]) => void;
  onConfirmDraft: (opts: { sourceDocument?: { title?: string; content: string } }) => void;
  onBuyCredits?: () => void;
}): React.JSX.Element | null {
  const {
    open, documentType, documentLabel, caseId, needsSource, creditBalance, waived,
    guidanceJustCompleted, onClose, onStartGuidance, onConfirmDraft, onBuyCredits,
  } = props;

  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [data, setData] = useState<DraftDecisionResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!open) { loadedRef.current = false; return; }
    if (loadedRef.current) return;
    loadedRef.current = true;
    setPhase("loading");
    setData(null);
    setErrorMsg(null);
    setAck(false);
    setSourceText("");

    aiApi
      .draftDecision({ caseId, documentType, documentLabel })
      .then(res => { setData(res); setPhase("ready"); })
      .catch(async () => {
        // Decision layer is best-effort — fall back to a plain estimate so drafting still works.
        try {
          const est = await aiApi.estimate({ kind: "document", documentType });
          setData({
            decision: "ready",
            rationale: "We couldn't run the readiness check just now, but you can still draft. Review everything carefully before filing.",
            topics: [],
            estimate: { estimatedCredits: est.estimatedCredits, expectedWords: est.expectedWords, note: est.note },
          });
          setPhase("ready");
        } catch (e) {
          setErrorMsg((e as Error).message || "Couldn't prepare this draft. Please try again.");
          setPhase("error");
        }
      });
  }, [open, caseId, documentType, documentLabel]);

  if (!open) return null;

  const estimate = data?.estimate;
  const estCredits = estimate?.estimatedCredits ?? 1;
  const insufficient = !waived && creditBalance !== undefined && creditBalance < estCredits;
  const sourceReady = !needsSource || sourceText.trim().length > 20;
  const canDraft = phase === "ready" && ack && sourceReady && !insufficient;

  const decision: DraftDecision = data?.decision ?? "ready";
  const banner = DECISION_BANNER[decision];

  function doDraft() {
    if (!canDraft) return;
    onConfirmDraft(needsSource ? { sourceDocument: { title: `Document being responded to (${documentLabel})`, content: sourceText.trim() } } : {});
  }

  // For "required", drafting is gated behind guidance unless the user just finished a session.
  const draftAllowed = decision !== "required" || guidanceJustCompleted;

  return (
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 1150, background: "rgba(0,0,0,0.78)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "Arial, sans-serif",
        animation: "hldFade 0.2s ease",
      }}
    >
      <div style={{
        background: "#0c0c0c", border: "1px solid #222", borderRadius: 20, width: "100%", maxWidth: 500,
        maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: `0 30px 80px rgba(0,0,0,0.7), 0 0 40px ${ORANGE}14`, animation: "hldPop 0.28s cubic-bezier(0.16,1,0.3,1)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 16px 12px", borderBottom: "1px solid #1a1a1a" }}>
          <GuidanceMascot size={46} state={phase === "loading" ? "thinking" : guidanceJustCompleted ? "happy" : "idle"} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>Before we draft</div>
            <div style={{ fontSize: 12, color: "#7a7a7a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{documentLabel}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "#777", cursor: "pointer", padding: 4, lineHeight: 0 }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {phase === "loading" && (
            <div style={{ textAlign: "center", padding: "36px 0", color: "#888" }}>
              <Loader2 size={22} style={{ animation: "spin 1s linear infinite", color: ORANGE }} />
              <div style={{ marginTop: 10, fontSize: 13 }}>Reviewing your case…</div>
            </div>
          )}

          {phase === "error" && (
            <div style={{ textAlign: "center", padding: "28px 0" }}>
              <div style={{ color: "#ef4444", fontSize: 14, lineHeight: 1.6, marginBottom: 14 }}>{errorMsg}</div>
              <button onClick={onClose} style={secondaryBtn}>Close</button>
            </div>
          )}

          {phase === "ready" && data && (
            <>
              {/* Decision banner */}
              <div style={{ background: banner.bg, border: `1px solid ${banner.border}`, borderRadius: 14, padding: "13px 15px", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <banner.Icon size={17} color={banner.accent} />
                  <span style={{ fontWeight: 800, color: banner.accent, fontSize: 14 }}>{banner.title}</span>
                </div>
                <div style={{ color: "#cfcfcf", fontSize: 13, lineHeight: 1.6 }}>{data.rationale}</div>
              </div>

              {/* Topics a session would cover */}
              {data.topics.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: "#888", fontWeight: 700, letterSpacing: 0.4, marginBottom: 8 }}>
                    A GUIDANCE SESSION WOULD COVER
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                    {data.topics.map((t, i) => (
                      <span key={i} style={{ background: "#161006", border: `1px solid ${ORANGE}44`, color: "#e0b483", fontSize: 12, borderRadius: 20, padding: "5px 11px" }}>{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Responded-to document (only when the doc type needs a source) */}
              {needsSource && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: "#ccc", fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                    <FileText size={13} color={ORANGE} /> Paste the document you're responding to
                  </div>
                  <textarea
                    value={sourceText}
                    onChange={e => setSourceText(e.target.value)}
                    placeholder="Paste the opposing motion, complaint, or filing text here so the draft responds to it directly…"
                    rows={5}
                    style={{
                      width: "100%", boxSizing: "border-box", resize: "vertical", background: "#0d0d0d",
                      border: "1px solid #2a2a2a", borderRadius: 12, color: "#fff", padding: "11px 13px",
                      fontSize: 13, outline: "none", fontFamily: "Arial, sans-serif", lineHeight: 1.5,
                    }}
                  />
                  {!sourceReady && sourceText.length > 0 && (
                    <div style={{ color: "#a08050", fontSize: 11, marginTop: 5 }}>Add a bit more so the draft can respond accurately.</div>
                  )}
                  <div style={{ color: "#555", fontSize: 11, marginTop: 5 }}>A guidance session can also help you assemble this if you don't have the full text.</div>
                </div>
              )}

              {/* Estimate + spend-cap note */}
              {estimate && (
                <div style={{ background: "#111", border: "1px solid #262626", borderRadius: 14, padding: "13px 15px", marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: "#999", fontWeight: 700 }}>Estimated cost</span>
                    <span style={{ fontSize: 16, fontWeight: 900, color: waived ? "#22c55e" : ORANGE }}>
                      {waived ? "Included" : `~${estCredits} credit${estCredits === 1 ? "" : "s"}`}
                    </span>
                  </div>
                  <div style={{ color: "#777", fontSize: 11.5, lineHeight: 1.55 }}>{estimate.note}</div>
                  {!waived && creditBalance !== undefined && (
                    <div style={{ marginTop: 8, fontSize: 11.5, color: insufficient ? "#ef4444" : "#666" }}>
                      {insufficient
                        ? `You have ${creditBalance} credit${creditBalance === 1 ? "" : "s"} — not enough for this draft.`
                        : `${creditBalance} credit${creditBalance === 1 ? "" : "s"} available`}
                    </div>
                  )}
                </div>
              )}

              {insufficient && (
                <button onClick={() => { onClose(); onBuyCredits?.(); }} style={{ ...primaryBtn, width: "100%", marginBottom: 14 }}>
                  Buy more credits
                </button>
              )}

              {/* Compliance acknowledgment */}
              <label style={{ display: "flex", gap: 9, alignItems: "flex-start", cursor: "pointer", marginBottom: 4 }}>
                <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} style={{ marginTop: 2, accentColor: ORANGE, width: 15, height: 15, flexShrink: 0 }} />
                <span style={{ fontSize: 11.5, color: "#999", lineHeight: 1.5 }}>{COMPLIANCE.DOC_REVIEW_NOTICE}</span>
              </label>
            </>
          )}
        </div>

        {/* Footer actions */}
        {phase === "ready" && data && (
          <div style={{ borderTop: "1px solid #1a1a1a", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 9 }}>
            {decision === "ready" || guidanceJustCompleted ? (
              <>
                <button onClick={doDraft} disabled={!canDraft} style={{ ...primaryBtn, width: "100%", opacity: canDraft ? 1 : 0.45, cursor: canDraft ? "pointer" : "not-allowed" }}>
                  <Sparkles size={15} style={{ marginRight: 6, verticalAlign: "-2px" }} />
                  Draft now{!waived ? ` · ~${estCredits} credit${estCredits === 1 ? "" : "s"}` : ""}
                </button>
                <button onClick={() => onStartGuidance(data.topics)} style={{ ...secondaryBtn, width: "100%" }}>
                  <MessageCircle size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
                  Start a guidance session first
                </button>
              </>
            ) : (
              <>
                <button onClick={() => onStartGuidance(data.topics)} style={{ ...primaryBtn, width: "100%" }}>
                  <MessageCircle size={15} style={{ marginRight: 6, verticalAlign: "-2px" }} />
                  Start Guidance Session
                </button>
                {draftAllowed && (
                  <button onClick={doDraft} disabled={!canDraft} style={{ ...secondaryBtn, width: "100%", opacity: canDraft ? 1 : 0.45, cursor: canDraft ? "pointer" : "not-allowed" }}>
                    Draft now anyway{!waived ? ` · ~${estCredits} credit${estCredits === 1 ? "" : "s"}` : ""}
                  </button>
                )}
                {!draftAllowed && (
                  <div style={{ textAlign: "center", fontSize: 11, color: "#666", lineHeight: 1.5 }}>
                    A quick session is needed before drafting this one — it makes the document far stronger.
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes hldFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes hldPop { from { opacity: 0; transform: scale(0.96) } to { opacity: 1; transform: scale(1) } }
      `}</style>
    </div>
  );
}

const DECISION_BANNER: Record<DraftDecision, { title: string; accent: string; bg: string; border: string; Icon: React.ComponentType<{ size?: number; color?: string }> }> = {
  ready: { title: "You're ready to draft", accent: "#22c55e", bg: "#0c1a0f", border: "#1f4d2e", Icon: CheckCircle2 },
  recommended: { title: "A quick session would sharpen this", accent: ORANGE, bg: "#1a1207", border: `${ORANGE}55`, Icon: Sparkles },
  required: { title: "Let's gather a little more first", accent: "#f0a04a", bg: "#1a1207", border: "#7a4a10", Icon: AlertCircle },
};

const primaryBtn: React.CSSProperties = {
  background: `linear-gradient(90deg, ${ORANGE}, #FF7A1A)`, border: "none", borderRadius: 12,
  color: "#0a0908", fontWeight: 800, fontSize: 14, padding: "12px 16px", cursor: "pointer", fontFamily: "Arial, sans-serif",
};
const secondaryBtn: React.CSSProperties = {
  background: "none", border: "1px solid #2a2a2a", borderRadius: 12, color: "#aaa",
  fontWeight: 700, fontSize: 13.5, padding: "11px 16px", cursor: "pointer", fontFamily: "Arial, sans-serif",
};

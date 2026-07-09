// VerifyCaseModal
// Case-level "Verify" flow: pick any drafted document (most recent first),
// spend 1 credit, then hear it read aloud with word-by-word orange highlighting
// (Speechify-style) so the user can check it against the original a third time
// before printing, filing, or otherwise using it.

import React, { useState, useEffect, useRef } from "react";
import {
  X, ChevronLeft, ChevronRight, FileText, Loader2,
  Play, Pause, Square, AlertTriangle, Check,
} from "lucide-react";
import { COMPLIANCE, VERIFY_CONSEQUENCES } from "../lib/compliance";
import { aiApi, ServerGeneratedDoc } from "../lib/aiApi";

const ORANGE = "#d9711f";

// ── Word-by-word TTS highlight renderer (mirrors DocumentViewerModal) ──────────
function renderHighlightedText(text: string, charIndex: number) {
  if (charIndex < 0) return <>{text}</>;
  const tokens = text.split(/(\s+)/);
  let offset = 0;
  return (
    <>
      {tokens.map((token, i) => {
        const start = offset;
        offset += token.length;
        const isWord = token.length > 0 && !/^\s+$/.test(token);
        const isActive = isWord && charIndex >= start && charIndex < offset;
        return (
          <span
            key={i}
            style={isActive ? {
              background: "rgba(217,113,31,0.22)",
              color: "#f97316",
              borderRadius: 3,
              textShadow: "0 0 10px rgba(217,113,31,0.55)",
              padding: "0 1px",
            } : undefined}
          >
            {token}
          </span>
        );
      })}
    </>
  );
}

function WaveBar({ index, active }: { index: number; active: boolean }) {
  const animKey = `hlVerifyWave${index % 5}`;
  const baseHeight = 15 + (index % 7) * 8;
  return (
    <div
      aria-hidden="true"
      style={{
        width: 4, borderRadius: 2, flexShrink: 0,
        background: active ? ORANGE : "#2a2a2a",
        height: active ? undefined : `${baseHeight}%`,
        animation: active ? `${animKey} ${0.35 + (index % 5) * 0.07}s ease-in-out infinite alternate` : "none",
        transition: "background 0.3s, height 0.3s",
      }}
    />
  );
}

type Step = "list" | "disclaimer" | "reading";

export default function VerifyCaseModal({ docs, creditBalance, onBuyCredits, onClose }: {
  /** All generated documents for this case, most-recent-first. */
  docs: ServerGeneratedDoc[];
  creditBalance?: number;
  onBuyCredits?: () => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("list");
  const [selected, setSelected] = useState<ServerGeneratedDoc | null>(null);
  const [charging, setCharging] = useState(false);
  const [chargeError, setChargeError] = useState<string | null>(null);
  const [insufficientCredits, setInsufficientCredits] = useState(false);

  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [ttsPaused, setTtsPaused] = useState(false);
  const [ttsCharIndex, setTtsCharIndex] = useState(-1);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") { stopTts(); onClose(); } };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      window.speechSynthesis.cancel();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function startTts(content: string) {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(content);
    u.rate = 0.9; u.pitch = 1;
    u.onboundary = (e: SpeechSynthesisEvent) => { if (e.charIndex !== undefined) setTtsCharIndex(e.charIndex); };
    u.onend = () => { setTtsPlaying(false); setTtsPaused(false); setTtsCharIndex(-1); };
    u.onerror = () => { setTtsPlaying(false); setTtsPaused(false); setTtsCharIndex(-1); };
    utteranceRef.current = u;
    window.speechSynthesis.speak(u);
    setTtsPlaying(true);
    setTtsPaused(false);
  }
  function pauseTts() { window.speechSynthesis.pause(); setTtsPlaying(false); setTtsPaused(true); }
  function resumeTts() { window.speechSynthesis.resume(); setTtsPlaying(true); setTtsPaused(false); }
  function stopTts() {
    window.speechSynthesis.cancel();
    setTtsPlaying(false); setTtsPaused(false); setTtsCharIndex(-1);
    utteranceRef.current = null;
  }

  async function handleStartVerification() {
    if (!selected) return;
    setCharging(true);
    setChargeError(null);
    setInsufficientCredits(false);
    try {
      await aiApi.generatedDocs.verifyReadCharge(selected.id);
      setStep("reading");
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "insufficient_credits") setInsufficientCredits(true);
      else setChargeError((err as Error).message || "Could not start verification.");
    } finally {
      setCharging(false);
    }
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) { stopTts(); onClose(); } }}
      style={{
        position: "fixed", inset: 0, zIndex: 1150,
        background: "rgba(0,0,0,0.88)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div style={{
        background: "#0d0d0d", border: "1px solid #222",
        borderRadius: 16, width: "100%", maxWidth: 640, maxHeight: "92vh",
        display: "flex", flexDirection: "column",
        boxShadow: "0 40px 80px rgba(0,0,0,0.9)",
        overflow: "hidden",
      }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "14px 16px", borderBottom: "1px solid #1a1a1a", flexShrink: 0,
        }}>
          {step !== "list" && (
            <button
              onClick={() => {
                if (step === "reading") stopTts();
                setStep(step === "reading" ? "disclaimer" : "list");
                setChargeError(null); setInsufficientCredits(false);
              }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#666", padding: 4, flexShrink: 0 }}
            >
              <ChevronLeft size={18} />
            </button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#eee" }}>
              {step === "list" ? "Verify a document" : step === "disclaimer" ? "Before you listen" : selected?.title}
            </div>
          </div>
          <button
            aria-label="Close"
            onClick={() => { stopTts(); onClose(); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: 4, flexShrink: 0 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Step: document list, most recent first ─────────────────────── */}
        {step === "list" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 20px" }}>
            {docs.length === 0 ? (
              <div style={{ color: "#555", fontSize: 14, textAlign: "center", paddingTop: 40 }}>
                No documents have been drafted for this case yet.
              </div>
            ) : (
              docs.map(doc => (
                <button
                  key={doc.id}
                  onClick={() => { setSelected(doc); setStep("disclaimer"); }}
                  style={{
                    width: "100%", background: "#111", border: "1px solid #1e1e1e", borderRadius: 12,
                    padding: "12px 14px", textAlign: "left", cursor: "pointer", marginBottom: 8,
                    display: "flex", alignItems: "flex-start", gap: 10,
                  }}
                >
                  <FileText size={15} color={ORANGE} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {doc.title}
                    </div>
                    <div style={{ color: "#555", fontSize: 12, marginTop: 2 }}>
                      {doc.documentType.replace(/_/g, " ")} · {new Date(doc.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <ChevronRight size={14} color="#333" style={{ marginTop: 3, flexShrink: 0 }} />
                </button>
              ))
            )}
          </div>
        )}

        {/* ── Step: disclaimer + credit charge ───────────────────────────── */}
        {step === "disclaimer" && selected && (
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{
              background: "#1a0d05", border: `1px solid ${ORANGE}44`, borderRadius: 12,
              padding: "12px 14px", display: "flex", gap: 10,
            }}>
              <AlertTriangle size={16} color={ORANGE} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 12.5, color: "#e8c9a8", lineHeight: 1.55 }}>{COMPLIANCE.VERIFY_RESPONSIBILITY}</div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#666", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 }}>
                Failing to verify carefully could result in:
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {VERIFY_CONSEQUENCES.map((c, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, fontSize: 12.5, color: "#aaa", lineHeight: 1.4 }}>
                    <span style={{ color: ORANGE, flexShrink: 0 }}>•</span>
                    <span>{c}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ fontSize: 11, color: "#555", lineHeight: 1.5 }}>{COMPLIANCE.AI_GENERATED_SHORT}</div>

            {insufficientCredits && (
              <div style={{
                background: "#1a0d0d", border: "1px solid #4a1a1a", borderRadius: 10,
                padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8,
              }}>
                <span style={{ fontSize: 12.5, color: "#f0a0a0" }}>
                  You don't have enough credits for this verification (1 credit needed{creditBalance !== undefined ? ` — you have ${creditBalance}` : ""}).
                </span>
                {onBuyCredits && (
                  <button onClick={onBuyCredits} style={{
                    background: ORANGE, border: "none", borderRadius: 8, padding: "8px 12px",
                    color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer", alignSelf: "flex-start",
                  }}>
                    Buy credits
                  </button>
                )}
              </div>
            )}
            {chargeError && (
              <div style={{ fontSize: 12.5, color: "#f0a0a0" }}>{chargeError}</div>
            )}

            <button
              disabled={charging}
              onClick={handleStartVerification}
              style={{
                background: ORANGE, border: "none", borderRadius: 10, padding: "12px 16px",
                color: "#fff", fontWeight: 800, fontSize: 13, cursor: charging ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                opacity: charging ? 0.7 : 1,
              }}
            >
              {charging
                ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Charging 1 credit…</>
                : <><Check size={14} /> Charge 1 credit &amp; start reading</>}
            </button>
          </div>
        )}

        {/* ── Step: reading — orange word highlight while narrating ─────────── */}
        {step === "reading" && selected && (
          <>
            <div style={{ flex: 1, overflowY: "auto", padding: "18px 18px 8px" }}>
              <div style={{
                color: "#c8c8c8", fontSize: 13, lineHeight: 1.85,
                whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>
                {(ttsPlaying || ttsPaused)
                  ? renderHighlightedText(selected.content, ttsCharIndex)
                  : selected.content}
              </div>
            </div>
            <div style={{ borderTop: "1px solid #1a1a1a", padding: "14px 16px", flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{
                display: "flex", alignItems: "flex-end", gap: 3, height: 32,
                justifyContent: "center", background: "#0a0a0a",
                borderRadius: 8, padding: "6px 12px",
              }}>
                {Array.from({ length: 22 }).map((_, i) => (
                  <WaveBar key={i} index={i} active={ttsPlaying} />
                ))}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {!ttsPlaying && !ttsPaused && (
                  <button onClick={() => startTts(selected.content)} style={{
                    flex: 1, background: ORANGE, border: "none", borderRadius: 8,
                    padding: "10px 12px", color: "#fff", fontWeight: 700, fontSize: 12,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                  }}>
                    <Play size={13} /> Start Reading
                  </button>
                )}
                {ttsPlaying && (
                  <button onClick={pauseTts} style={{
                    flex: 1, background: "#111", border: `1px solid ${ORANGE}`, borderRadius: 8,
                    padding: "10px 12px", color: ORANGE, fontWeight: 700, fontSize: 12,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                  }}>
                    <Pause size={13} /> Pause
                  </button>
                )}
                {ttsPaused && (
                  <button onClick={resumeTts} style={{
                    flex: 1, background: "#111", border: `1px solid ${ORANGE}`, borderRadius: 8,
                    padding: "10px 12px", color: ORANGE, fontWeight: 700, fontSize: 12,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                  }}>
                    <Play size={13} /> Resume
                  </button>
                )}
                {(ttsPlaying || ttsPaused) && (
                  <button onClick={stopTts} style={{
                    background: "#111", border: "1px solid #2a2a2a", borderRadius: 8,
                    padding: "10px 12px", color: "#555", fontSize: 12, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 5,
                  }}>
                    <Square size={13} /> Stop
                  </button>
                )}
              </div>
              <div style={{ fontSize: 11, color: "#555", lineHeight: 1.5 }}>{COMPLIANCE.VERIFY_RESPONSIBILITY}</div>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes hlVerifyWave0 { 0%{height:15%} 100%{height:85%} }
        @keyframes hlVerifyWave1 { 0%{height:35%} 100%{height:65%} }
        @keyframes hlVerifyWave2 { 0%{height:20%} 100%{height:100%} }
        @keyframes hlVerifyWave3 { 0%{height:55%} 100%{height:35%} }
        @keyframes hlVerifyWave4 { 0%{height:28%} 100%{height:75%} }
      `}</style>
    </div>
  );
}

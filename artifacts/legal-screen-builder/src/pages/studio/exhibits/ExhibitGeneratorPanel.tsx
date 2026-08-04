import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, RefreshCw, Loader2, AlertCircle, Mic, MicOff } from "lucide-react";
import { aiApi } from "../../../lib/aiApi";
import type { ExhibitScreenData, FieldVerificationResult } from "../../../types";
import { ExhibitReviewPanel } from "./ExhibitReviewPanel";

const ORANGE = "#E8611A";

export interface ExhibitCandidate {
  selectedType: string;
  content: Record<string, unknown>;
  rationale: string;
  verificationResults: FieldVerificationResult[];
}

interface GenerateResult {
  candidates: ExhibitCandidate[];
  recommendedIndex: number;
  recommendationReason: string;
}

export interface ExhibitGeneratorPanelProps {
  caseId: string;
  currentTime: number;
  /** Used by rewatch buttons to sync the main video */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Blob URL for in-panel video preview */
  videoUrl?: string | null;
  /** Summaries from existing exhibit_screen markers — for narrative consistency */
  existingExhibits?: string[];
  onClose: () => void;
  onApprove: (data: ExhibitScreenData) => void;
}

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getDraftKey(caseId: string) {
  return `exhibit-draft-${caseId}`;
}

export function ExhibitGeneratorPanel({
  caseId,
  currentTime,
  videoRef,
  videoUrl,
  existingExhibits = [],
  onClose,
  onApprove,
}: ExhibitGeneratorPanelProps) {
  const [dictation, setDictation] = useState<string>(() => {
    try { return localStorage.getItem(getDraftKey(caseId)) ?? ""; } catch { return ""; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<GenerateResult | null>(null);
  const [regenError, setRegenError] = useState<string | null>(null);

  // Inline voice recording
  const [isRecording, setIsRecording] = useState(false);
  const [interimText, setInterimText] = useState("");
  const recognitionRef = useRef<any>(null);
  // Ref so the speech-recognition callback always sees the latest dictation
  const dictationRef = useRef(dictation);
  dictationRef.current = dictation;

  const panelVideoRef = useRef<HTMLVideoElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seek panel video to current moment on mount
  useEffect(() => {
    if (panelVideoRef.current) panelVideoRef.current.currentTime = currentTime;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    recognitionRef.current?.stop();
  }, []);

  const handleDictationChange = useCallback((val: string) => {
    setDictation(val);
    dictationRef.current = val;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try { localStorage.setItem(getDraftKey(caseId), val); } catch {}
    }, 2000);
  }, [caseId]);

  function rewatch(offsetSec: number) {
    const panel = panelVideoRef.current;
    const main = videoRef.current;
    const base = panel?.currentTime ?? currentTime;
    const newTime = Math.max(0, base - offsetSec);
    if (panel) { panel.currentTime = newTime; panel.play().catch(() => {}); }
    if (main) main.currentTime = newTime;
  }

  function toggleMic() {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      setInterimText("");
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return; // browser doesn't support it; textarea is always editable as fallback
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    let finalBuffer = "";
    r.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalBuffer += e.results[i][0].transcript + " ";
        else interim += e.results[i][0].transcript;
      }
      setInterimText(interim);
      if (finalBuffer) {
        const base = dictationRef.current;
        const next = (base ? base.trimEnd() + " " : "") + finalBuffer.trim() + " ";
        handleDictationChange(next);
        finalBuffer = "";
      }
    };
    r.onend = () => { setIsRecording(false); setInterimText(""); };
    r.onerror = () => { setIsRecording(false); setInterimText(""); };
    r.start();
    recognitionRef.current = r;
    setIsRecording(true);
  }

  async function handleGenerate(forceType?: string) {
    if (!dictation.trim()) { setError("Please describe what happened before generating."); return; }
    const isRegen = Boolean(forceType);
    if (isRegen) { setRegenError(null); } else { setError(null); setReview(null); }
    setLoading(true);
    try {
      const result = await aiApi.generateExhibitScreen({
        caseId,
        timestamp: formatTime(currentTime),
        dictation: dictation.trim(),
        existingExhibits: existingExhibits.length > 0 ? existingExhibits : undefined,
        forceType,
      });
      setReview(result);
      if (isRegen) setRegenError(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Generation failed. Please try again.";
      if (isRegen) setRegenError(msg); else setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleApprove(data: ExhibitScreenData) {
    try { localStorage.removeItem(getDraftKey(caseId)); } catch {}
    onApprove(data);
  }

  // ── Review phase ────────────────────────────────────────────────────────────
  if (review) {
    return (
      <ExhibitReviewPanel
        result={review}
        dictation={dictation}
        caseId={caseId}
        currentTime={currentTime}
        onBack={() => { setReview(null); setRegenError(null); }}
        onApprove={handleApprove}
        onTryLayout={forceType => handleGenerate(forceType)}
        regenerating={loading}
        regenError={regenError}
      />
    );
  }

  // ── Generator phase ─────────────────────────────────────────────────────────
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 900, display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #1e1e1e", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 900, color: "#fff" }}>AI Exhibit Screen</div>
          <div style={{ fontSize: 11, color: "#555", marginTop: 1 }}>
            at <span style={{ color: ORANGE, fontWeight: 700 }}>{formatTime(currentTime)}</span>
          </div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: 6, display: "flex" }}>
          <X size={20} />
        </button>
      </div>

      {/* Video preview + rewatch */}
      {videoUrl && (
        <div style={{ flexShrink: 0 }}>
          <video
            ref={panelVideoRef}
            src={videoUrl}
            playsInline
            preload="metadata"
            style={{ width: "100%", maxHeight: 190, display: "block", background: "#000" }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderBottom: "1px solid #1a1a1a" }}>
            <span style={{ fontSize: 10, color: "#444", fontWeight: 700, flexShrink: 0 }}>GO BACK</span>
            {[5, 15, 30, 60].map(sec => (
              <button key={sec} onClick={() => rewatch(sec)}
                style={{ flex: 1, background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 8, padding: "7px 4px", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer", color: "#666", fontSize: 11, fontWeight: 700 }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "#333")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "#1e1e1e")}>
                <RefreshCw size={10} /> {sec}s
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Body — 50/50 split */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Left: describe */}
        <div style={{ flex: 1, padding: "12px 10px 12px 16px", display: "flex", flexDirection: "column", gap: 6, borderRight: "1px solid #1a1a1a", overflow: "hidden" }}>
          <div style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: 0.4 }}>DESCRIBE</div>
          <textarea
            value={dictation}
            onChange={e => handleDictationChange(e.target.value)}
            placeholder={"What happened at this moment.\n\nInclude quotes, who was involved, contradictions, and why a judge or jury should see this."}
            style={{ flex: 1, background: "#0a0a0a", border: "1px solid #1e1e1e", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "#ddd", lineHeight: 1.6, resize: "none", boxSizing: "border-box", fontFamily: "inherit", outline: "none", overflowY: "auto" }}
            onFocus={e => (e.currentTarget.style.borderColor = ORANGE + "55")}
            onBlur={e => (e.currentTarget.style.borderColor = "#1e1e1e")}
          />
          {dictation.trim().length > 0 && (
            <div style={{ fontSize: 10, color: "#333", textAlign: "right" }}>{dictation.trim().split(/\s+/).length} words · auto-saved</div>
          )}
        </div>

        {/* Right: voice record */}
        <div style={{ flex: 1, padding: "12px 16px 12px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, overflow: "hidden" }}>
          <div style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: 0.4, alignSelf: "flex-start" }}>VOICE RECORD</div>

          {/* Mic button */}
          <button
            onClick={toggleMic}
            style={{ width: 60, height: 60, borderRadius: 30, background: isRecording ? "#1a0000" : "#111", border: `2px solid ${isRecording ? "#ef4444" : "#2a2a2a"}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, boxShadow: isRecording ? "0 0 0 8px rgba(239,68,68,0.08), 0 0 0 16px rgba(239,68,68,0.04)" : "none", transition: "all 0.3s" }}>
            {isRecording ? <MicOff size={24} color="#ef4444" /> : <Mic size={24} color="#555" />}
          </button>

          {/* Interim / status */}
          <div style={{ width: "100%", flex: 1, background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "#ddd", lineHeight: 1.6, overflowY: "auto" }}>
            {isRecording
              ? (interimText
                  ? <span style={{ color: "#888" }}>{interimText}</span>
                  : <span style={{ color: "#444", fontStyle: "italic" }}>Listening…</span>)
              : <span style={{ color: "#333", fontStyle: "italic" }}>Tap the mic to record your description</span>
            }
          </div>

          {isRecording && (
            <button
              onClick={() => { recognitionRef.current?.stop(); setIsRecording(false); setInterimText(""); }}
              style={{ width: "100%", background: "#ef4444", border: "none", borderRadius: 10, padding: "10px", fontSize: 12, fontWeight: 800, color: "#fff", cursor: "pointer", flexShrink: 0 }}>
              Done Recording
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ margin: "0 16px 10px", display: "flex", gap: 8, background: "#1a0000", border: "1px solid #ef444433", borderRadius: 10, padding: "10px 14px", flexShrink: 0 }}>
          <AlertCircle size={14} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: "#ef4444", lineHeight: 1.5 }}>{error}</div>
        </div>
      )}

      {/* Footer */}
      <div style={{ padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", borderTop: "1px solid #1a1a1a", flexShrink: 0, display: "flex", gap: 10 }}>
        <button onClick={onClose}
          style={{ flex: 1, background: "#111", border: "1px solid #222", borderRadius: 12, padding: 14, fontSize: 14, fontWeight: 700, color: "#666", cursor: "pointer" }}>
          Cancel
        </button>
        <button
          onClick={() => handleGenerate()}
          disabled={loading || !dictation.trim()}
          style={{ flex: 2, background: loading || !dictation.trim() ? "#1a1a1a" : ORANGE, border: "none", borderRadius: 12, padding: 14, fontSize: 14, fontWeight: 800, color: loading || !dictation.trim() ? "#444" : "#000", cursor: loading || !dictation.trim() ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {loading ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Generating…</> : "Generate Screen"}
        </button>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, RefreshCw, Loader2, AlertCircle } from "lucide-react";
import { aiApi } from "../../../lib/aiApi";
import type { ExhibitScreenData, FieldVerificationResult } from "../../../types";
import { ExhibitReviewPanel } from "./ExhibitReviewPanel";

const ORANGE = "#E8611A";

interface GenerateResult {
  selectedType: string;
  content: Record<string, unknown>;
  alternativeLayouts: string[];
  verificationResults: FieldVerificationResult[];
}

interface ExhibitGeneratorPanelProps {
  caseId: string;
  currentTime: number;
  /** Used by rewatch buttons to seek backward in the video */
  videoRef: React.RefObject<HTMLVideoElement | null>;
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

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Autosave dictation to localStorage (debounced 2s)
  const handleDictationChange = useCallback((val: string) => {
    setDictation(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try { localStorage.setItem(getDraftKey(caseId), val); } catch {}
    }, 2000);
  }, [caseId]);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  function rewatch(offsetSec: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, v.currentTime - offsetSec);
    v.play().catch(() => {});
  }

  async function handleGenerate(forceType?: string) {
    if (!dictation.trim()) { setError("Please describe what happened in the video before generating."); return; }
    setError(null);
    setLoading(true);
    setReview(null);
    try {
      const result = await aiApi.generateExhibitScreen({
        caseId,
        timestamp: formatTime(currentTime),
        dictation: dictation.trim(),
        existingExhibits: existingExhibits.length > 0 ? existingExhibits : undefined,
        forceType,
      });
      setReview(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Generation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleApprove(data: ExhibitScreenData) {
    // Clear the saved draft on successful approval
    try { localStorage.removeItem(getDraftKey(caseId)); } catch {}
    onApprove(data);
  }

  // ── Review Phase ──────────────────────────────────────────────────────────────
  if (review) {
    return (
      <ExhibitReviewPanel
        result={review}
        dictation={dictation}
        caseId={caseId}
        currentTime={currentTime}
        onBack={() => setReview(null)}
        onApprove={handleApprove}
        onTryLayout={forceType => handleGenerate(forceType)}
        regenerating={loading}
      />
    );
  }

  // ── Generator Phase ────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.97)", zIndex: 900,
      display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "18px 20px", borderBottom: "1px solid #1e1e1e", flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#fff" }}>AI Exhibit Screen</div>
          <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
            Video timestamp: <span style={{ color: ORANGE, fontWeight: 700 }}>{formatTime(currentTime)}</span>
          </div>
        </div>
        <button onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: 6, display: "flex" }}>
          <X size={20} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 0" }}>
        {/* Rewatch */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "#555", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>
            REWATCH MOMENT
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {[15, 30, 60].map(sec => (
              <button key={sec} onClick={() => rewatch(sec)}
                style={{
                  flex: 1, background: "#111", border: "1px solid #222", borderRadius: 10,
                  padding: "10px 6px", display: "flex", alignItems: "center", justifyContent: "center",
                  gap: 5, cursor: "pointer", color: "#888", fontSize: 12, fontWeight: 700,
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "#333")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "#222")}>
                <RefreshCw size={12} /> −{sec}s
              </button>
            ))}
          </div>
        </div>

        {/* Dictation */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "#555", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>
            DESCRIBE WHAT HAPPENED
          </div>
          <textarea
            value={dictation}
            onChange={e => handleDictationChange(e.target.value)}
            placeholder={
              "Describe exactly what happened at this moment.\n\n" +
              "Include: direct quotes, contradictions you noticed, who was involved, " +
              "what evidence this connects to, and why a judge or jury should see this."
            }
            style={{
              width: "100%", minHeight: 200, background: "#0d0d0d", border: `1px solid #222`,
              borderRadius: 12, padding: "14px 16px", fontSize: 14, color: "#ddd",
              lineHeight: 1.6, resize: "vertical", boxSizing: "border-box",
              fontFamily: "inherit", outline: "none",
            }}
            onFocus={e => (e.currentTarget.style.borderColor = ORANGE + "55")}
            onBlur={e => (e.currentTarget.style.borderColor = "#222")}
            autoFocus
          />
          {dictation.trim().length > 0 && (
            <div style={{ fontSize: 10, color: "#333", marginTop: 6, textAlign: "right" }}>
              {dictation.trim().split(/\s+/).length} words · auto-saved
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 10, background: "#1a0000",
            border: "1px solid #ef444433", borderRadius: 10, padding: "12px 14px", marginBottom: 16,
          }}>
            <AlertCircle size={15} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 13, color: "#ef4444", lineHeight: 1.5 }}>{error}</div>
          </div>
        )}

        {/* Tip */}
        <div style={{ fontSize: 12, color: "#333", lineHeight: 1.7, marginBottom: 24 }}>
          The AI reads your uploaded case documents alongside your dictation to choose the strongest exhibit type
          and verify every claim against your source material.
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: "16px 20px calc(16px + env(safe-area-inset-bottom))",
        borderTop: "1px solid #1a1a1a", flexShrink: 0,
        display: "flex", gap: 10,
      }}>
        <button onClick={onClose}
          style={{
            flex: 1, background: "#111", border: "1px solid #222", borderRadius: 12,
            padding: 16, fontSize: 14, fontWeight: 700, color: "#666", cursor: "pointer",
          }}>
          Cancel
        </button>
        <button
          onClick={() => handleGenerate()}
          disabled={loading || !dictation.trim()}
          style={{
            flex: 2, background: loading || !dictation.trim() ? "#1a1a1a" : ORANGE,
            border: "none", borderRadius: 12, padding: 16, fontSize: 14, fontWeight: 800,
            color: loading || !dictation.trim() ? "#444" : "#000",
            cursor: loading || !dictation.trim() ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
          {loading ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Generating…</> : "Generate Screen"}
        </button>
      </div>
    </div>
  );
}

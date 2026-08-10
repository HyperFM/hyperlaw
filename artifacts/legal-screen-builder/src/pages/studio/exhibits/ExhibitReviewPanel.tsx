import React, { useState } from "react";
import { ArrowLeft, Check, X, Loader2, AlertCircle, Star } from "lucide-react";
import type { ExhibitScreenData } from "../../../types";
import { EXHIBIT_TYPES } from "./exhibitTypes";
import { ExhibitRenderer } from "./ExhibitRenderer";
import type { ExhibitCandidate } from "./ExhibitGeneratorPanel";

const ORANGE = "#E8611A";
const VIOLET = "#8b5cf6";

// Main preview at 18% of native 1920×1080 → 345 × 194
const PREVIEW_SCALE = 0.18;
// Candidate-strip thumbnails, small enough to compare several at a glance
const THUMB_SCALE = 0.09;

interface GenerateResult {
  candidates: ExhibitCandidate[];
  recommendedIndex: number;
  recommendationReason: string;
}

interface ExhibitReviewPanelProps {
  result: GenerateResult;
  dictation: string;
  caseId: string;
  currentTime: number;
  onBack: () => void;
  onApprove: (data: ExhibitScreenData) => void;
  onTryLayout: (forceType: string) => void;
  regenerating?: boolean;
  /** Error that occurred during a forceType regen — shown inline so the panel stays mounted */
  regenError?: string | null;
}

export function ExhibitReviewPanel({
  result,
  dictation,
  currentTime,
  onBack,
  onApprove,
  onTryLayout,
  regenerating = false,
  regenError = null,
}: ExhibitReviewPanelProps) {
  const { candidates, recommendedIndex, recommendationReason } = result;
  const [selectedIndex, setSelectedIndex] = useState(recommendedIndex);

  const selected = candidates[selectedIndex] ?? candidates[0];
  const { selectedType, content, verificationResults, confidenceFlags } = selected;

  const supported = verificationResults.filter(r => r.supported).length;
  const total = verificationResults.length;
  const unsupported = verificationResults.filter(r => !r.supported);

  const selectedConfig = EXHIBIT_TYPES.find(t => t.id === selectedType);
  // Offer "try another layout" for types not already among the generated candidates
  const candidateTypeIds = new Set(candidates.map(c => c.selectedType));
  const altConfigs = EXHIBIT_TYPES.filter(t => !candidateTypeIds.has(t.id)).slice(0, 3);

  function handleApprove() {
    const data: ExhibitScreenData = {
      selectedType,
      content,
      alternativeLayouts: [],
      verificationResults,
      confidenceFlags,
    };
    onApprove(data);
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.97)", zIndex: 900,
      display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "16px 20px", borderBottom: "1px solid #1e1e1e", flexShrink: 0,
      }}>
        <button onClick={onBack}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: 4, display: "flex" }}>
          <ArrowLeft size={20} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: "#fff" }}>Review Screen</div>
          {selectedConfig && (
            <div style={{ fontSize: 11, color: "#555", marginTop: 1 }}>{selectedConfig.name}</div>
          )}
        </div>
        {/* Evidence badge */}
        {total > 0 && (
          <div style={{
            background: supported === total ? "#14532d" : supported === 0 ? "#450a0a" : "#1c1c00",
            border: `1px solid ${supported === total ? "#22c55e33" : supported === 0 ? "#ef444433" : "#eab30833"}`,
            borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 700,
            color: supported === total ? "#22c55e" : supported === 0 ? "#ef4444" : "#eab308",
          }}>
            {supported}/{total} sourced
          </div>
        )}
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 0" }}>

        {/* Candidate strip — only when there's more than one option to compare */}
        {candidates.length > 1 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>
              {candidates.length} OPTIONS FOR THIS MOMENT
            </div>
            <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
              {candidates.map((c, i) => {
                const isRec = i === recommendedIndex;
                const isSel = i === selectedIndex;
                const cfg = EXHIBIT_TYPES.find(t => t.id === c.selectedType);
                return (
                  <button key={i} onClick={() => setSelectedIndex(i)}
                    style={{
                      flexShrink: 0, background: "#0d0d0d",
                      border: `1.5px solid ${isSel ? ORANGE : "#222"}`,
                      borderRadius: 10, padding: 6, cursor: "pointer",
                      display: "flex", flexDirection: "column", gap: 6, width: 1920 * THUMB_SCALE + 12,
                      position: "relative",
                    }}>
                    {isRec && (
                      <div style={{
                        position: "absolute", top: -8, right: -6, background: ORANGE, borderRadius: 6,
                        padding: "2px 6px", display: "flex", alignItems: "center", gap: 3,
                        boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
                      }}>
                        <Star size={9} color="#000" fill="#000" />
                        <span style={{ fontSize: 8, fontWeight: 900, color: "#000" }}>AI PICK</span>
                      </div>
                    )}
                    <div style={{ width: 1920 * THUMB_SCALE, height: 1080 * THUMB_SCALE, borderRadius: 4, overflow: "hidden" }}>
                      <ExhibitRenderer content={c.content} scale={THUMB_SCALE} />
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: isSel ? "#fff" : "#888", textAlign: "center" }}>
                      {cfg?.name ?? c.selectedType}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Why the AI recommended its pick */}
        {recommendationReason && selectedIndex === recommendedIndex && (
          <div style={{
            display: "flex", gap: 8, alignItems: "flex-start",
            background: `${ORANGE}0f`, border: `1px solid ${ORANGE}33`, borderRadius: 10,
            padding: "10px 12px", marginBottom: 16,
          }}>
            <Star size={13} color={ORANGE} fill={ORANGE} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12, color: "#ccc", lineHeight: 1.5 }}>{recommendationReason}</div>
          </div>
        )}
        {/* Why THIS candidate is persuasive, when viewing a non-recommended one */}
        {selected.rationale && selectedIndex !== recommendedIndex && (
          <div style={{
            fontSize: 12, color: "#888", lineHeight: 1.5, marginBottom: 16,
            background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 10, padding: "10px 12px",
          }}>
            {selected.rationale}
          </div>
        )}

        {/* Preview */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>PREVIEW</div>
          <div style={{
            width: 1920 * PREVIEW_SCALE,
            height: 1080 * PREVIEW_SCALE,
            borderRadius: 6, overflow: "hidden",
            border: `1px solid ${ORANGE}33`,
            boxShadow: `0 0 0 1px #000`,
          }}>
            <ExhibitRenderer content={content} scale={PREVIEW_SCALE} />
          </div>
        </div>

        {/* Evidence support */}
        {total > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>
              SOURCE VERIFICATION
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: unsupported.length > 0 ? 10 : 0 }}>
              <div style={{ flex: 1, height: 4, background: "#1a1a1a", borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 2,
                  width: `${total > 0 ? (supported / total) * 100 : 0}%`,
                  background: supported === total ? "#22c55e" : supported === 0 ? "#ef4444" : ORANGE,
                  transition: "width 0.5s ease",
                }} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#888", flexShrink: 0 }}>
                {supported} of {total} claims sourced
              </div>
            </div>

            {/* Unsupported claims */}
            {unsupported.length > 0 && (
              <div style={{
                background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 10,
                padding: "12px 14px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <AlertCircle size={12} color="#f59e0b" />
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b" }}>
                    {unsupported.length} claim{unsupported.length !== 1 ? "s" : ""} not found in source documents
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {unsupported.slice(0, 4).map((u, i) => (
                    <div key={i} style={{ fontSize: 11, color: "#555", lineHeight: 1.5 }}>
                      <span style={{ color: "#444", fontFamily: "monospace" }}>{u.field.split(".").pop()}: </span>
                      <span style={{ color: "#666" }}>"{u.ref.length > 80 ? u.ref.slice(0, 80) + "…" : u.ref}"</span>
                    </div>
                  ))}
                  {unsupported.length > 4 && (
                    <div style={{ fontSize: 11, color: "#333" }}>+{unsupported.length - 4} more</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Regen error — shown when a forceType re-generation fails */}
        {regenError && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            background: "#1a0000", border: "1px solid #ef444433",
            borderRadius: 10, padding: "12px 14px", marginBottom: 14,
          }}>
            <AlertCircle size={14} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 13, color: "#ef4444", lineHeight: 1.5 }}>{regenError}</div>
          </div>
        )}

        {/* Other layouts not already among the generated options */}
        {altConfigs.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>
              TRY ANOTHER LAYOUT
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {altConfigs.map(cfg => (
                <button
                  key={cfg.id}
                  onClick={() => onTryLayout(cfg.id)}
                  disabled={regenerating}
                  style={{
                    background: "#0d0d0d", border: `1px solid ${VIOLET}22`,
                    borderRadius: 10, padding: "12px 14px",
                    display: "flex", alignItems: "center", gap: 10,
                    cursor: regenerating ? "not-allowed" : "pointer", textAlign: "left", width: "100%",
                  }}
                  onMouseEnter={e => { if (!regenerating) e.currentTarget.style.borderColor = VIOLET + "55"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = VIOLET + "22"; }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 7, background: `${VIOLET}15`,
                    border: `1px solid ${VIOLET}33`, display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, fontSize: 14,
                  }}>
                    {cfg.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#ccc" }}>{cfg.name}</div>
                    <div style={{ fontSize: 11, color: "#555", marginTop: 2, lineHeight: 1.4 }}>{cfg.guidance}</div>
                  </div>
                  {regenerating && <Loader2 size={14} color="#555" style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} />}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ height: 20 }} />
      </div>

      {/* Footer */}
      <div style={{
        padding: "16px 20px calc(16px + env(safe-area-inset-bottom))",
        borderTop: "1px solid #1a1a1a", flexShrink: 0,
        display: "flex", gap: 10,
      }}>
        <button onClick={onBack}
          style={{
            flex: 1, background: "#111", border: "1px solid #222", borderRadius: 12,
            padding: 16, fontSize: 14, fontWeight: 700, color: "#666", cursor: "pointer",
          }}>
          <X size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
          Back
        </button>
        <button
          onClick={handleApprove}
          style={{
            flex: 2, background: ORANGE, border: "none", borderRadius: 12,
            padding: 16, fontSize: 14, fontWeight: 800, color: "#000",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
          <Check size={16} /> Add to Timeline
        </button>
      </div>
    </div>
  );
}

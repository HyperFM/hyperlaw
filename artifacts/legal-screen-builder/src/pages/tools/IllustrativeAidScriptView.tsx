import React, { useState } from "react";
import { ChevronRight, Copy, Loader2, RefreshCw, ScrollText, Folder, ArrowLeft, Check, AlertCircle, SkipForward } from "lucide-react";
import type { HLCase, VideoChunk } from "../../types";
import { aiApi } from "../../lib/aiApi";
import { api } from "../../lib/api";

const ORANGE = "#d9711f";

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Prefer the Organize step's order (the order the video will actually play
// in), but only if it accounts for every chunk — a partial/stale slots array
// silently dropping a moment from the script would be far worse than just
// falling back to chronological order.
function orderedChunks(chunks: VideoChunk[], organizedSlots?: (string | null)[]): VideoChunk[] {
  if (organizedSlots && organizedSlots.length > 0) {
    const fromSlots = organizedSlots
      .filter((id): id is string => !!id)
      .map(id => chunks.find(c => c.id === id))
      .filter((c): c is VideoChunk => !!c);
    if (fromSlots.length === chunks.length && fromSlots.length > 0) return fromSlots;
  }
  return [...chunks].sort((a, b) => a.start - b.start);
}

interface Props {
  cases: HLCase[];
  onUpdateCase: (c: HLCase) => void;
  onBack: () => void;
}

export default function IllustrativeAidScriptView({ cases, onUpdateCase, onBack }: Props) {
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Skip-recommended moments are excluded from Copy/Read by default — the AI
  // only ever recommends, the user decides. Manually including one just for
  // this session's view; nothing is deleted or hidden permanently.
  const [includedDespiteSkip, setIncludedDespiteSkip] = useState<Set<string>>(new Set());

  const selectedCase = cases.find(c => c.id === selectedCaseId) ?? null;

  // ── Case list ──────────────────────────────────────────────────────────
  if (!selectedCase) {
    const withMoments = [...cases]
      .filter(c => (c.studioProject?.chunks?.length ?? 0) > 0)
      .sort((a, b) => (b.studioProject?.updatedAt ?? 0) - (a.studioProject?.updatedAt ?? 0));

    return (
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 20px 120px" }}>
          <button onClick={onBack}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 18, display: "flex", alignItems: "center", gap: 6, color: "#666", fontSize: 13, fontWeight: 700 }}>
            <ArrowLeft size={15} /> Tools
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: `${ORANGE}16`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <ScrollText size={19} color={ORANGE} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>Illustrative Aid Script</div>
          </div>
          <div style={{ color: "#666", fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>
            A script you can read from in court while your video plays — built from your own moments, lightly cleaned up, never rewritten.
          </div>

          {withMoments.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 12, paddingTop: 30 }}>
              <Folder size={40} color="#1e1e1e" />
              <div style={{ fontSize: 14, color: "#555", fontWeight: 700 }}>No moments yet</div>
              <div style={{ fontSize: 12, color: "#444", maxWidth: 260, lineHeight: 1.5 }}>
                Chunk and label some moments in Exhibit Studio first, then come back here to build a script from them.
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>SELECT A CASE</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {withMoments.map(c => {
                  const count = c.studioProject?.chunks?.length ?? 0;
                  return (
                    <button key={c.id} onClick={() => setSelectedCaseId(c.id)}
                      style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, padding: "16px", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, width: "100%" }}>
                      <div style={{ width: 40, height: 40, background: "#1a1a1a", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <ScrollText size={18} color={ORANGE} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 15, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
                        <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{count} moment{count !== 1 ? "s" : ""}</div>
                      </div>
                      <ChevronRight size={16} color="#333" style={{ flexShrink: 0 }} />
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Script view for the selected case ────────────────────────────────────
  const chunks = (selectedCase.studioProject?.chunks ?? []).filter(c => c.label.trim());
  const ordered = orderedChunks(chunks, selectedCase.studioProject?.organizedSlots);
  const hasScript = ordered.some(c => c.courtScript);

  function saveChunks(updatedChunks: VideoChunk[]) {
    if (!selectedCase) return;
    const updatedCase: HLCase = {
      ...selectedCase,
      studioProject: selectedCase.studioProject
        ? { ...selectedCase.studioProject, chunks: updatedChunks, updatedAt: Date.now() }
        : selectedCase.studioProject,
    };
    onUpdateCase(updatedCase);
    api.cases.upsert(updatedCase.id, updatedCase.title, updatedCase.workflowStage, updatedCase as unknown as Record<string, unknown>).catch(() => {});
  }

  async function generate() {
    if (!selectedCase || ordered.length === 0) return;
    setGenerating(true);
    setError(null);
    try {
      const { scripts } = await aiApi.generateCourtScript({
        caseId: selectedCase.id,
        moments: ordered.map(c => ({ id: c.id, start: c.start, end: c.end, label: c.label })),
      });
      const byId = new Map(scripts.map(s => [s.id, s]));
      const updatedChunks = (selectedCase.studioProject?.chunks ?? []).map(c => {
        const s = byId.get(c.id);
        if (!s) return c;
        return {
          ...c,
          courtScript: {
            spokenScript: s.spokenScript,
            keyQuotesUsed: s.keyQuotesUsed,
            asOfStatusNotes: s.asOfStatusNotes,
            confidenceFlags: s.confidenceFlags,
            corrections: s.corrections,
            skipRecommended: s.skipRecommended,
            skipReason: s.skipReason,
          },
        };
      });
      saveChunks(updatedChunks);
    } catch (err) {
      setError((err as Error).message || "Couldn't generate the script — try again.");
    } finally {
      setGenerating(false);
    }
  }

  // Inline-editable script text — saves on blur, not on every keystroke.
  function updateScriptText(chunkId: string, text: string) {
    if (!selectedCase) return;
    const updatedChunks = (selectedCase.studioProject?.chunks ?? []).map(c =>
      c.id === chunkId && c.courtScript ? { ...c, courtScript: { ...c.courtScript, spokenScript: text } } : c
    );
    saveChunks(updatedChunks);
  }

  function toggleIncludeDespiteSkip(chunkId: string) {
    setIncludedDespiteSkip(prev => {
      const next = new Set(prev);
      if (next.has(chunkId)) next.delete(chunkId); else next.add(chunkId);
      return next;
    });
  }

  function copyScript() {
    const text = ordered
      .filter(c => !(c.courtScript?.skipRecommended && !includedDespiteSkip.has(c.id)))
      .map(c => `[${formatTime(c.start)}–${formatTime(c.end)}]\n${c.courtScript?.spokenScript || c.label}`)
      .join("\n\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "20px 20px 120px" }}>
        <button onClick={() => setSelectedCaseId(null)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 18, display: "flex", alignItems: "center", gap: 6, color: "#666", fontSize: 13, fontWeight: 700 }}>
          <ArrowLeft size={15} /> All cases
        </button>
        <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 4 }}>{selectedCase.title}</div>
        <div style={{ color: "#666", fontSize: 12, marginBottom: 18 }}>
          {ordered.length} moment{ordered.length !== 1 ? "s" : ""} · {selectedCase.studioProject?.organizedSlots?.some(Boolean) ? "in your organized order" : "in video order"}
        </div>

        {ordered.length === 0 ? (
          <div style={{ fontSize: 13, color: "#555", textAlign: "center", paddingTop: 30 }}>
            No labeled moments in this case yet.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
              <button onClick={generate} disabled={generating}
                style={{ flex: 1, background: hasScript ? "#111" : ORANGE, border: hasScript ? "1px solid #2a2a2a" : "none", borderRadius: 12, padding: "12px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: generating ? "default" : "pointer", fontWeight: 800, fontSize: 13, color: hasScript ? "#ccc" : "#000" }}>
                {generating ? <Loader2 size={14} className="animate-spin" /> : hasScript ? <RefreshCw size={14} /> : <ScrollText size={14} />}
                {generating ? "Writing…" : hasScript ? "Regenerate Script" : "Generate Script"}
              </button>
              {hasScript && (
                <button onClick={copyScript}
                  style={{ background: "none", border: "1px solid #252525", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 800, fontSize: 13, color: "#999" }}>
                  {copied ? <Check size={14} color="#22c55e" /> : <Copy size={14} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              )}
            </div>

            {error && (
              <div style={{ background: "#2a1010", border: "1px solid #4a1515", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#ff8080", marginBottom: 16 }}>
                {error}
              </div>
            )}

            {hasScript && (
              <div style={{ fontSize: 11, color: "#3a3a3a", marginBottom: 14, lineHeight: 1.5 }}>
                Regenerate if you've edited any of these moments since this was made. Skip-recommended moments are left out of Copy unless you include them below.
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {ordered.map((c, i) => {
                const script = c.courtScript;
                const skipped = !!script?.skipRecommended && !includedDespiteSkip.has(c.id);
                const hasFlags = (script?.confidenceFlags?.length ?? 0) > 0;
                return (
                  <div key={c.id} style={{
                    background: "#0d0d0d",
                    border: `1px solid ${skipped ? "#2a2a2a" : hasFlags ? "#f59e0b" : "#1e1e1e"}`,
                    borderRadius: 12, padding: "14px 16px", opacity: skipped ? 0.6 : 1,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: ORANGE, fontWeight: 800, letterSpacing: 0.5 }}>
                        MOMENT {i + 1} · {formatTime(c.start)}–{formatTime(c.end)}
                      </div>
                      {hasFlags && !skipped && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#f59e0b", fontWeight: 700 }}>
                          <AlertCircle size={10} color="#f59e0b" /> Needs review
                        </div>
                      )}
                    </div>

                    {script?.skipRecommended ? (
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#666", fontWeight: 700, marginBottom: 4 }}>
                          <SkipForward size={12} color="#666" /> Recommended: skip
                        </div>
                        {script.skipReason && (
                          <div style={{ fontSize: 12, color: "#555", lineHeight: 1.5, marginBottom: 8 }}>{script.skipReason}</div>
                        )}
                        <button onClick={() => toggleIncludeDespiteSkip(c.id)}
                          style={{ background: "none", border: "1px solid #333", borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 700, color: includedDespiteSkip.has(c.id) ? ORANGE : "#888", cursor: "pointer" }}>
                          {includedDespiteSkip.has(c.id) ? "Included — tap to skip again" : "Include anyway"}
                        </button>
                        {includedDespiteSkip.has(c.id) && (
                          <textarea
                            defaultValue={script.spokenScript}
                            onBlur={e => updateScriptText(c.id, e.target.value)}
                            style={{ width: "100%", marginTop: 10, minHeight: 60, background: "#111", border: "1px solid #252525", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "#ddd", lineHeight: 1.5, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }}
                          />
                        )}
                      </div>
                    ) : script ? (
                      <>
                        <textarea
                          key={script.spokenScript}
                          defaultValue={script.spokenScript}
                          onBlur={e => updateScriptText(c.id, e.target.value)}
                          style={{ width: "100%", minHeight: 70, background: "transparent", border: "none", padding: 0, fontSize: 14, color: "#ddd", lineHeight: 1.6, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", outline: "none" }}
                        />
                        {script.asOfStatusNotes && (
                          <div style={{ fontSize: 11, color: "#7ab0e0", marginTop: 8, lineHeight: 1.5 }}>
                            {script.asOfStatusNotes}
                          </div>
                        )}
                        {hasFlags && (
                          <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 6, lineHeight: 1.5 }}>
                            {script.confidenceFlags.join(" · ")}
                          </div>
                        )}
                        {script.corrections.length > 0 && (
                          <div style={{ fontSize: 10, color: "#7ab0e0", marginTop: 6 }}>
                            {script.corrections.map((cor, ci) => (
                              <div key={ci}>Corrected "{cor.from}" → "{cor.to}"</div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 14, color: "#777", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                          {c.label}
                        </div>
                        <div style={{ fontSize: 10, color: "#444", marginTop: 8, fontStyle: "italic" }}>Not written yet — raw moment text shown</div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

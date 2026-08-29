import React, { useState } from "react";
import { Info, ChevronRight, CheckCircle2, AlertCircle, XCircle, Folder, Film, X, FolderOpen, Zap, Plus, FilePlus2, PenLine } from "lucide-react";
import type { HLCase } from "../../types";

const ORANGE = "#d9711f";

interface Props {
  cases: HLCase[];
  onOpenStudio: (caseId: string) => void;
  onCreateCase: () => void;
  /** Skips the full case-intake wizard entirely (parties/court/story/
   *  timeline) and drops straight into the video editor — for someone who
   *  just wants to work on footage without building out a whole case
   *  first. Still technically creates a case under the hood (nothing else
   *  in this app persists a project without one), just via a shortcut —
   *  and that shell case is marked exhibitOnly so it stays scoped to this
   *  screen instead of showing up in case lists throughout the rest of
   *  the app. Only called when the user explicitly declines to tie the
   *  project to one of their existing cases in the picker below. */
  onCreateManualProject: () => void;
  /** Apex Litigant tier gate for the APEX Override entry point below —
   *  the option itself stays visible to everyone (so it's discoverable,
   *  not hidden behind a wall), but a non-Apex click goes to
   *  onRequireApexUpgrade instead of opening the picker. */
  isApex: boolean;
  onRequireApexUpgrade: () => void;
  /** Same shape as onCreateManualProject — exhibitOnly shell case, video
   *  workspace's own APEX Override toggle does the real work once a video
   *  is loaded. */
  onCreateApexOverride: () => void;
}

export default function ExhibitStudioView({ cases, onOpenStudio, onCreateCase, onCreateManualProject, isApex, onRequireApexUpgrade, onCreateApexOverride }: Props) {
  const [showInfo, setShowInfo] = useState(false);
  const [showNewProjectPicker, setShowNewProjectPicker] = useState(false);
  const [showManualPicker, setShowManualPicker] = useState(false);
  const [showApexPicker, setShowApexPicker] = useState(false);

  function handleApexOptionClick() {
    if (!isApex) { onRequireApexUpgrade(); return; }
    setShowNewProjectPicker(false);
    setShowApexPicker(true);
  }

  function handleManualOptionClick() {
    setShowNewProjectPicker(false);
    setShowManualPicker(true);
  }

  const sorted = [...cases].sort((a, b) => b.createdAt - a.createdAt);
  // Only real cases (not previous manual/exhibit-only shells) are offered
  // as "tie this to an existing case" options.
  const realCases = sorted.filter(c => !c.exhibitOnly);

  return (
    <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>

      {/* ── Banner image — smaller, full image visible, left-flush ── */}
      <img
        src="/exhibit-studio-banner.png"
        alt="Exhibit Studio"
        style={{ height: 130, width: "auto", display: "block", flexShrink: 0, alignSelf: "flex-start" }}
      />

      <div style={{ padding: "20px 20px 120px", display: "flex", flexDirection: "column" }}>

      {/* ── More Info ────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <button
          onClick={() => setShowInfo(v => !v)}
          style={{ background: "none", border: "1px solid #222", borderRadius: 8, padding: "6px 14px", fontSize: 12, color: "#777", cursor: "pointer", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6, letterSpacing: 0.3 }}>
          <Info size={12} color="#555" />
          {showInfo ? "Hide Info" : "More Info"}
        </button>
        {showInfo && (
          <div style={{ marginTop: 10, background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>ABOUT THIS TOOL</div>
            <ul style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                "This tool is designed to help organize and present video evidence.",
                "Rules regarding illustrative aids differ by jurisdiction.",
                "Users are responsible for confirming admissibility in their court.",
                "HyperLaw helps prepare exhibits but does not determine admissibility.",
              ].map((line, i) => (
                <li key={i} style={{ fontSize: 13, color: "#888", lineHeight: 1.55 }}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── Case List ─────────────────────────────────────────────────── */}
      {sorted.length === 0 ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 14, paddingTop: 40 }}>
          <Folder size={48} color="#1e1e1e" />
          <div style={{ fontSize: 16, fontWeight: 800, color: "#555" }}>No cases yet</div>
          <div style={{ fontSize: 13, color: "#444", maxWidth: 260, lineHeight: 1.55, marginBottom: 6 }}>
            Create a case first, then build exhibits from your video evidence.
          </div>
          <button onClick={() => setShowNewProjectPicker(true)} style={{
            background: "#fff", border: "none",
            borderRadius: 12, padding: "12px 24px", color: "#000", fontSize: 14, fontWeight: 900,
            cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8,
          }}>
            <Plus size={16} color="#000" /> New Project
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5 }}>SELECT A CASE</div>
            <button onClick={() => setShowNewProjectPicker(true)} style={{
              background: "#fff", border: "none", borderRadius: 8, padding: "6px 14px",
              color: "#000", fontSize: 12, fontWeight: 800, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <Plus size={13} color="#000" /> New Project
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sorted.map(c => {
              const court = c.court;
              const verdict = c.studioProject?.jurisdictionVerification?.verdict;
              const markerCount = c.studioProject?.markers.filter(m => m.status === "ready").length ?? 0;
              const hasProject = !!c.studioProject;

              return (
                <button key={c.id} onClick={() => onOpenStudio(c.id)}
                  style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, padding: "16px 16px", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, width: "100%" }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE + "55")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "#1e1e1e")}>
                  <div style={{ width: 44, height: 44, background: "#1a1a1a", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Film size={20} color={hasProject ? ORANGE : "#444"} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 3 }}>
                      {c.title}
                    </div>
                    <div style={{ fontSize: 12, color: "#555" }}>
                      {court ? court.name : "No court selected"}
                      {markerCount > 0 && ` · ${markerCount} exhibit${markerCount !== 1 ? "s" : ""}`}
                    </div>
                    {verdict && (
                      <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                        {verdict === "permitted" && <><CheckCircle2 size={11} color="#22c55e" /><span style={{ fontSize: 11, color: "#22c55e", fontWeight: 700 }}>Jurisdiction verified</span></>}
                        {verdict === "limited"   && <><AlertCircle  size={11} color="#f59e0b" /><span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 700 }}>Allowed with limitations</span></>}
                        {verdict === "not_accepted" && <><XCircle   size={11} color="#ef4444" /><span style={{ fontSize: 11, color: "#ef4444", fontWeight: 700 }}>Not generally accepted</span></>}
                      </div>
                    )}
                  </div>
                  <ChevronRight size={16} color="#333" style={{ flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        </>
      )}
      </div>

      {/* ── New Project picker — one entry point, three explained options.
          Explanation sits right on each option, always visible, not
          revealed after tapping — so the choice is informed up front. ──── */}
      {showNewProjectPicker && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 900,
          display: "flex", alignItems: "flex-end", justifyContent: "center",
        }} onClick={() => setShowNewProjectPicker(false)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto",
              background: "#111", border: "1px solid #222", borderTopLeftRadius: 20, borderTopRightRadius: 20,
              padding: "20px 20px calc(20px + env(safe-area-inset-bottom))",
            }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#fff" }}>New Project</div>
              <button onClick={() => setShowNewProjectPicker(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: 4, display: "flex" }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* New Case — first, recommended */}
              <button onClick={() => { setShowNewProjectPicker(false); onCreateCase(); }}
                style={{ background: "#0d0d0d", border: `1px solid ${ORANGE}55`, borderRadius: 14, padding: "16px", textAlign: "left", cursor: "pointer", width: "100%" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = ORANGE + "55")}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <FilePlus2 size={17} color={ORANGE} />
                  <div style={{ fontWeight: 800, fontSize: 15, color: "#fff" }}>New Case</div>
                  <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 800, color: ORANGE, letterSpacing: 0.3, textTransform: "uppercase" }}>Recommended</span>
                </div>
                <div style={{ fontSize: 12.5, color: "#999", lineHeight: 1.55 }}>
                  Creates a new case across your whole HyperLaw account, registered with every tool for the full experience. This is the recommended way to start another project in Exhibit Studio.
                </div>
              </button>

              {/* APEX Override — second */}
              <button onClick={handleApexOptionClick}
                style={{ background: "#0d0d0d", border: "1px solid #333", borderRadius: 14, padding: "16px", textAlign: "left", cursor: "pointer", width: "100%" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE + "88")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "#333")}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <Zap size={17} color={ORANGE} style={{ flexShrink: 0 }} />
                    <div style={{ whiteSpace: "nowrap" }}>
                      {"APEX Override".split("").map((ch, i) => (
                        <span key={i} style={{ fontWeight: 800, fontSize: 15, color: ch === " " ? undefined : (i % 2 === 0 ? ORANGE : "#ccc") }}>{ch}</span>
                      ))}
                    </div>
                  </div>
                  <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, color: "#666", letterSpacing: 0.3, textTransform: "uppercase" }}>Apex Litigant</span>
                </div>
                <div style={{ fontSize: 12, color: "#777", fontWeight: 700, marginBottom: 6 }}>Project</div>
                <div style={{ fontSize: 12.5, color: "#999", lineHeight: 1.55 }}>
                  Apex Litigant exclusive. This is man eater material — load raw footage and AI transcribes it, finds the moments that matter, and builds your exhibits automatically. Less thinking, less work, way more firepower.
                </div>
              </button>

              {/* Manual Project — last, not recommended */}
              <button onClick={handleManualOptionClick}
                style={{ background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: 14, padding: "16px", textAlign: "left", cursor: "pointer", width: "100%" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "#555")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "#2a2a2a")}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <PenLine size={17} color="#888" />
                  <div style={{ fontWeight: 800, fontSize: 15, color: "#ccc" }}>Manual Project</div>
                  <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 800, color: "#777", letterSpacing: 0.3, textTransform: "uppercase" }}>Not Recommended</span>
                </div>
                <div style={{ fontSize: 12.5, color: "#777", lineHeight: 1.55 }}>
                  Starts a project from scratch, not tied to any case — for whatever reason you need that. Not recommended if you want the full HyperLaw experience, with every tool working together off the same case for the most effective result.
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Manual Project picker — is this for an existing case? ───────── */}
      {showManualPicker && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 900,
          display: "flex", alignItems: "flex-end", justifyContent: "center",
        }} onClick={() => setShowManualPicker(false)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 480, maxHeight: "80vh", overflowY: "auto",
              background: "#111", border: "1px solid #222", borderTopLeftRadius: 20, borderTopRightRadius: 20,
              padding: "20px 20px calc(20px + env(safe-area-inset-bottom))",
            }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#fff" }}>Manual Project</div>
              <button onClick={() => setShowManualPicker(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: 4, display: "flex" }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ fontSize: 13, color: "#888", lineHeight: 1.5, marginBottom: 18 }}>
              Is this video for one of your existing cases?
            </div>

            {realCases.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
                {realCases.map(c => (
                  <button key={c.id}
                    onClick={() => { setShowManualPicker(false); onOpenStudio(c.id); }}
                    style={{ background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 12, padding: "12px 14px", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, width: "100%" }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE + "55")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "#1e1e1e")}>
                    <FolderOpen size={16} color={ORANGE} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 14, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.title}
                    </div>
                    <ChevronRight size={15} color="#333" style={{ flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => { setShowManualPicker(false); onCreateManualProject(); }}
              style={{
                width: "100%", background: "none", border: "1px dashed #333", borderRadius: 12,
                padding: "14px 16px", color: "#aaa", fontSize: 14, fontWeight: 800, cursor: "pointer",
              }}>
              No — not tied to a case, just start editing
            </button>
          </div>
        </div>
      )}

      {/* ── APEX Override picker — same "existing case, or not" choice as
          Manual Project. Either path lands in the same studio_workspace;
          the real pipeline only starts once a video is loaded there. ───── */}
      {showApexPicker && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 900,
          display: "flex", alignItems: "flex-end", justifyContent: "center",
        }} onClick={() => setShowApexPicker(false)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 480, maxHeight: "80vh", overflowY: "auto",
              background: "#111", border: `1px solid ${ORANGE}33`, borderTopLeftRadius: 20, borderTopRightRadius: 20,
              padding: "20px 20px calc(20px + env(safe-area-inset-bottom))",
            }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Zap size={16} color={ORANGE} />
                <div style={{ fontSize: 16, fontWeight: 900, color: "#fff" }}>APEX Override</div>
              </div>
              <button onClick={() => setShowApexPicker(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: 4, display: "flex" }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ fontSize: 13, color: "#888", lineHeight: 1.5, marginBottom: 18 }}>
              Is this video for one of your existing cases?
            </div>

            {realCases.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
                {realCases.map(c => (
                  <button key={c.id}
                    onClick={() => { setShowApexPicker(false); onOpenStudio(c.id); }}
                    style={{ background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 12, padding: "12px 14px", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, width: "100%" }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE + "55")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "#1e1e1e")}>
                    <FolderOpen size={16} color={ORANGE} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 14, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.title}
                    </div>
                    <ChevronRight size={15} color="#333" style={{ flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => { setShowApexPicker(false); onCreateApexOverride(); }}
              style={{
                width: "100%", background: "none", border: "1px dashed #333", borderRadius: 12,
                padding: "14px 16px", color: "#aaa", fontSize: 14, fontWeight: 800, cursor: "pointer",
              }}>
              No — not tied to a case, just start editing
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

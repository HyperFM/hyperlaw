import React, { useState } from "react";
import { Info, ChevronRight, CheckCircle2, AlertCircle, XCircle, Folder, Film, PencilRuler } from "lucide-react";
import type { HLCase } from "../../types";

const ORANGE = "#d9711f";

interface Props {
  cases: HLCase[];
  onOpenStudio: (caseId: string) => void;
  onOpenScreenBuilder: () => void;
}

export default function ExhibitStudioView({ cases, onOpenStudio, onOpenScreenBuilder }: Props) {
  const [showInfo, setShowInfo] = useState(false);

  const sorted = [...cases].sort((a, b) => b.createdAt - a.createdAt);

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

      {/* ── Manual Screen Builder entry ───────────────────────────────── */}
      <button onClick={onOpenScreenBuilder}
        style={{ background: "#111", border: `1px solid ${ORANGE}44`, borderRadius: 14, padding: "16px", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, width: "100%", marginBottom: 24 }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE)}
        onMouseLeave={e => (e.currentTarget.style.borderColor = ORANGE + "44")}>
        <div style={{ width: 44, height: 44, background: "#1a1200", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <PencilRuler size={20} color={ORANGE} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: "#fff", marginBottom: 3 }}>Manual Screen Builder</div>
          <div style={{ fontSize: 12, color: "#666" }}>Build an exhibit screen by hand — no video needed</div>
        </div>
        <ChevronRight size={16} color={ORANGE} style={{ flexShrink: 0 }} />
      </button>

      {/* ── Case List ─────────────────────────────────────────────────── */}
      {sorted.length === 0 ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 14, paddingTop: 40 }}>
          <Folder size={48} color="#1e1e1e" />
          <div style={{ fontSize: 16, fontWeight: 800, color: "#555" }}>No cases yet</div>
          <div style={{ fontSize: 13, color: "#444", maxWidth: 260, lineHeight: 1.55 }}>
            Create a case first, then return here to build exhibits from video evidence.
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>SELECT A CASE</div>
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
    </div>
  );
}

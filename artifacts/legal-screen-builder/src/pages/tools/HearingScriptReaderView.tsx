import React, { useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight, Check, Volume2, VolumeX } from "lucide-react";
import type { HearingScript, HearingScriptSection } from "../../types";

const ORANGE = "#d9711f";

interface Props {
  script: HearingScript;
  onBack: () => void;
  onUpdateSection: (sectionId: string, changes: { delivered?: boolean }) => void;
}

/** Bigger type for a shorter section keeps everything readable without
 *  scrolling at a podium — mirrors TestimonyCard's dynamic-size-by-length
 *  idea, just for a scrollable reading surface instead of a fixed export
 *  canvas. */
function bodyFontSize(len: number): number {
  if (len > 900) return 20;
  if (len > 500) return 24;
  if (len > 250) return 30;
  return 36;
}

export default function HearingScriptReaderView({ script, onBack, onUpdateSection }: Props) {
  const [index, setIndex] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const sections: HearingScriptSection[] = script.sections;
  const section = sections[index];

  useEffect(() => {
    return () => window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, [index]);

  function toggleSpeak() {
    if (!section) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utter = new SpeechSynthesisUtterance(section.body);
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utter);
    setSpeaking(true);
  }

  if (!section) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 900, display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>
        No sections yet.
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 900, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px 10px" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#888", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, padding: 0 }}>
          <X size={18} /> Exit
        </button>
        <div style={{ color: "#666", fontSize: 12, fontWeight: 700 }}>{index + 1} / {sections.length}</div>
        <button onClick={toggleSpeak} style={{ background: "none", border: "none", cursor: "pointer", color: speaking ? ORANGE : "#888", padding: 0 }}>
          {speaking ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>

      {/* Section jump strip */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "4px 20px 14px", WebkitOverflowScrolling: "touch" }}>
        {sections.map((s, i) => (
          <button key={s.id} onClick={() => setIndex(i)}
            style={{
              flexShrink: 0, background: i === index ? ORANGE : s.delivered ? "#0f2a17" : "#141414",
              border: `1px solid ${i === index ? ORANGE : s.delivered ? "#22c55e55" : "#252525"}`,
              borderRadius: 999, padding: "6px 12px", fontSize: 11.5, fontWeight: 700,
              color: i === index ? "#000" : s.delivered ? "#22c55e" : "#999", cursor: "pointer", whiteSpace: "nowrap",
              display: "flex", alignItems: "center", gap: 5,
            }}>
            {s.delivered && <Check size={11} />} {s.heading}
          </button>
        ))}
      </div>

      {/* Section content — large, high-contrast, no scroll needed for typical length */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 28px 20px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: ORANGE, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>
          {section.triggerType}{section.conditionNote ? ` — only if: ${section.conditionNote}` : ""}
        </div>
        <div style={{ fontSize: 26, fontWeight: 900, color: "#fff", marginBottom: 20, lineHeight: 1.2 }}>{section.heading}</div>
        <div style={{ fontSize: bodyFontSize(section.body.length), fontWeight: 600, color: "#f4f1ea", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
          {section.body}
        </div>
      </div>

      {/* Footer controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px calc(18px + env(safe-area-inset-bottom))", borderTop: "1px solid #1a1a1a" }}>
        <button onClick={() => setIndex(i => Math.max(0, i - 1))} disabled={index === 0}
          style={{ width: 52, height: 52, borderRadius: 14, background: "#141414", border: "1px solid #252525", display: "flex", alignItems: "center", justifyContent: "center", cursor: index === 0 ? "default" : "pointer", opacity: index === 0 ? 0.4 : 1, flexShrink: 0 }}>
          <ChevronLeft size={22} color="#fff" />
        </button>
        <button onClick={() => onUpdateSection(section.id, { delivered: !section.delivered })}
          style={{
            flex: 1, height: 52, borderRadius: 14, cursor: "pointer",
            background: section.delivered ? "#0f2a17" : ORANGE,
            border: `1px solid ${section.delivered ? "#22c55e" : ORANGE}`,
            color: section.delivered ? "#22c55e" : "#000",
            fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
          <Check size={17} /> {section.delivered ? "Marked Delivered" : "Mark Delivered"}
        </button>
        <button onClick={() => setIndex(i => Math.min(sections.length - 1, i + 1))} disabled={index === sections.length - 1}
          style={{ width: 52, height: 52, borderRadius: 14, background: "#141414", border: "1px solid #252525", display: "flex", alignItems: "center", justifyContent: "center", cursor: index === sections.length - 1 ? "default" : "pointer", opacity: index === sections.length - 1 ? 0.4 : 1, flexShrink: 0 }}>
          <ChevronRight size={22} color="#fff" />
        </button>
      </div>
    </div>
  );
}

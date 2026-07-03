import React, { useState, useEffect, useRef } from "react";

const ORANGE = "#d9711f";

interface Props {
  text: string;
  title?: string;
  onClose: () => void;
}

export default function PreVerificationModal({ text, title, onClose }: Props) {
  // Split text into words preserving whitespace boundaries
  const words = text.trim().split(/(\s+)/).filter(Boolean);
  const nonSpaceIndices = words.reduce<number[]>((acc, w, i) => {
    if (!/^\s+$/.test(w)) acc.push(i);
    return acc;
  }, []);

  const [activeWordIdx, setActiveWordIdx] = useState<number>(-1); // index into nonSpaceIndices
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(300); // ms per word
  const [confirmed, setConfirmed] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);

  // Auto-scroll to active word
  useEffect(() => {
    if (activeWordIdx >= 0 && activeWordIdx < nonSpaceIndices.length) {
      const el = wordRefs.current[nonSpaceIndices[activeWordIdx]];
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeWordIdx, nonSpaceIndices]);

  // Play/pause logic
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setActiveWordIdx(prev => {
          const next = prev + 1;
          if (next >= nonSpaceIndices.length) {
            setIsPlaying(false);
            return prev;
          }
          return next;
        });
      }, speed);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPlaying, speed, nonSpaceIndices.length]);

  function handlePlay() {
    // If at end, restart
    if (activeWordIdx >= nonSpaceIndices.length - 1) setActiveWordIdx(-1);
    setIsPlaying(true);
  }

  function handlePause() { setIsPlaying(false); }

  function handleRestart() {
    setIsPlaying(false);
    setActiveWordIdx(-1);
  }

  const progress = nonSpaceIndices.length > 0
    ? Math.round(((activeWordIdx + 1) / nonSpaceIndices.length) * 100)
    : 0;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9000,
      background: "rgba(0,0,0,0.95)",
      display: "flex", flexDirection: "column",
      fontFamily: "Arial, sans-serif",
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 20px",
        borderBottom: "1px solid #1e1e1e",
        background: "#0d0d0d",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            background: `${ORANGE}22`, border: `1px solid ${ORANGE}55`,
            borderRadius: 6, padding: "3px 10px",
            fontSize: 10, fontWeight: 800, color: ORANGE, letterSpacing: "0.12em",
          }}>
            PRE-VERIFICATION
          </div>
          {title && <span style={{ fontSize: 13, color: "#666" }}>{title}</span>}
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#555", fontSize: 20, lineHeight: 1 }}>×</button>
      </div>

      {/* Important notice */}
      <div style={{
        padding: "10px 20px",
        background: "#0a0a0a",
        borderBottom: "1px solid #1a1a1a",
        flexShrink: 0,
      }}>
        <p style={{ margin: 0, fontSize: 12, color: "#888", lineHeight: 1.6, textAlign: "center" }}>
          <strong style={{ color: "#aaa" }}>Review every word carefully.</strong>{" "}
          You must verify this document again on your own before submitting it to any court, agency, or other party.
          HyperLaw assists with drafting — final accuracy is your responsibility.
        </p>
      </div>

      {/* Document content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px" }}>
        <div style={{
          maxWidth: 640, margin: "0 auto",
          fontSize: 15, color: "#bbb", lineHeight: 2,
          fontFamily: "Georgia, serif",
        }}>
          {words.map((word, i) => {
            const wordOrderIdx = nonSpaceIndices.indexOf(i);
            const isActive = wordOrderIdx >= 0 && wordOrderIdx === activeWordIdx;
            const isPast = wordOrderIdx >= 0 && wordOrderIdx < activeWordIdx;
            const isSpace = /^\s+$/.test(word);

            return (
              <span
                key={i}
                ref={el => { wordRefs.current[i] = el; }}
                style={{
                  display: isSpace ? "inline" : "inline-block",
                  whiteSpace: isSpace ? "pre" : "normal",
                  background: isActive
                    ? `${ORANGE}33`
                    : "transparent",
                  color: isActive ? "#fff" : isPast ? "#888" : "#bbb",
                  borderRadius: isActive ? 4 : 0,
                  padding: isActive ? "0 3px" : "0",
                  boxShadow: isActive
                    ? `0 0 12px ${ORANGE}88, 0 0 24px ${ORANGE}44`
                    : "none",
                  transition: "all 0.15s ease",
                  fontWeight: isActive ? 700 : 400,
                  cursor: "pointer",
                  userSelect: "none",
                }}
                onClick={() => {
                  if (wordOrderIdx >= 0) {
                    setIsPlaying(false);
                    setActiveWordIdx(wordOrderIdx);
                  }
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: "#111", flexShrink: 0 }}>
        <div style={{
          height: "100%", width: `${progress}%`,
          background: `linear-gradient(90deg, ${ORANGE}, #FF7A1A)`,
          transition: "width 0.15s linear",
        }} />
      </div>

      {/* Controls */}
      <div style={{
        padding: "14px 20px",
        background: "#0d0d0d",
        borderTop: "1px solid #1e1e1e",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, maxWidth: 640, margin: "0 auto 14px" }}>
          {/* Restart */}
          <button onClick={handleRestart} style={{
            background: "#111", border: "1px solid #2a2a2a", borderRadius: 8,
            padding: "8px 14px", cursor: "pointer", color: "#666", fontSize: 12, fontWeight: 700,
          }}>↺</button>

          {/* Play / Pause */}
          {isPlaying ? (
            <button onClick={handlePause} style={{
              background: ORANGE, border: "none", borderRadius: 8,
              padding: "8px 20px", cursor: "pointer", color: "#000", fontSize: 12, fontWeight: 800,
              flex: 1,
            }}>⏸ Pause</button>
          ) : (
            <button onClick={handlePlay} style={{
              background: ORANGE, border: "none", borderRadius: 8,
              padding: "8px 20px", cursor: "pointer", color: "#000", fontSize: 12, fontWeight: 800,
              flex: 1,
            }}>▶ {activeWordIdx < 0 ? "Start Reading" : "Resume"}</button>
          )}

          {/* Speed */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <span style={{ fontSize: 9, color: "#555", fontWeight: 700 }}>SPEED</span>
            <select
              value={speed}
              onChange={e => setSpeed(Number(e.target.value))}
              style={{
                background: "#111", border: "1px solid #2a2a2a", borderRadius: 6,
                color: "#888", fontSize: 11, padding: "4px 6px", cursor: "pointer",
              }}
            >
              <option value={500}>Slow</option>
              <option value={300}>Normal</option>
              <option value={150}>Fast</option>
              <option value={80}>Very Fast</option>
            </select>
          </div>
        </div>

        {/* Confirmation before closing */}
        <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", alignItems: "flex-start", gap: 10 }}>
          <input
            type="checkbox"
            id="preverify-confirm"
            checked={confirmed}
            onChange={e => setConfirmed(e.target.checked)}
            style={{ marginTop: 2, accentColor: ORANGE, flexShrink: 0, width: 15, height: 15, cursor: "pointer" }}
          />
          <label htmlFor="preverify-confirm" style={{ fontSize: 12, color: "#777", lineHeight: 1.55, cursor: "pointer" }}>
            I have reviewed this document for factual accuracy, legal citations, deadlines, and formatting.
            I understand HyperLaw assists with drafting and does not replace the judgment of a licensed attorney.
          </label>
        </div>

        <div style={{ maxWidth: 640, margin: "12px auto 0" }}>
          <button
            onClick={onClose}
            disabled={!confirmed}
            style={{
              width: "100%", padding: "12px 20px",
              background: confirmed ? `linear-gradient(90deg, ${ORANGE}, #FF7A1A)` : "#1a1a1a",
              border: confirmed ? "none" : "1px solid #2a2a2a",
              borderRadius: 10, cursor: confirmed ? "pointer" : "not-allowed",
              color: confirmed ? "#000" : "#444",
              fontWeight: 800, fontSize: 13,
              textTransform: "uppercase", letterSpacing: "0.08em",
              transition: "all 0.2s",
            }}
          >
            {confirmed ? "Verification Complete — Continue" : "Check the box above to continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

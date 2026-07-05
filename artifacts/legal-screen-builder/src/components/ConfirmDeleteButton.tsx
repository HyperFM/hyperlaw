/**
 * ConfirmDeleteButton
 *
 * Tap once → 10-second countdown begins. Five orange ripple rings expand outward.
 * The number inside counts down: 10 → 0. At 0 the onDelete callback fires.
 * Tap again during countdown to cancel.
 */
import React, { useState, useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";

const ORANGE = "#d9711f";
const TOTAL = 10; // seconds

// Inject keyframe CSS once into the document head
const STYLE_ID = "hl-confirm-delete-kf";
function ensureKeyframes() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
    @keyframes hlRingExpand {
      0%   { transform: scale(1);   opacity: 0.55; }
      100% { transform: scale(2.6); opacity: 0; }
    }
    @keyframes hlDeletePulse {
      0%, 100% { box-shadow: 0 0 0 0 ${ORANGE}55; }
      50%       { box-shadow: 0 0 0 8px ${ORANGE}00; }
    }
  `;
  document.head.appendChild(s);
}

interface Props {
  onDelete: () => void;
  /** Icon size in the idle state (default 14) */
  iconSize?: number;
  style?: React.CSSProperties;
  title?: string;
}

export default function ConfirmDeleteButton({
  onDelete,
  iconSize = 14,
  style,
  title = "Delete",
}: Props) {
  ensureKeyframes();

  const [active, setActive] = useState(false);
  const [count, setCount] = useState(TOTAL);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearTimer() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (active) {
      // Second tap → cancel
      clearTimer();
      setActive(false);
      setCount(TOTAL);
      return;
    }
    setActive(true);
    setCount(TOTAL);
    intervalRef.current = setInterval(() => {
      setCount(prev => prev - 1);
    }, 1000);
  }

  // Fire onDelete when count hits 0
  useEffect(() => {
    if (count <= 0 && active) {
      clearTimer();
      setActive(false);
      setCount(TOTAL);
      onDelete();
    }
  }, [count]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => () => clearTimer(), []);

  // Fraction complete (0→1 as countdown runs)
  const progress = (TOTAL - count) / TOTAL;

  return (
    <div
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        // Expand outer container to give rings room
        width: active ? 52 : 28,
        height: active ? 52 : 28,
        flexShrink: 0,
        transition: "width 0.2s, height 0.2s",
        ...style,
      }}
    >
      {/* Five expanding rings — only visible while active */}
      {active &&
        [0, 1, 2, 3, 4].map(i => {
          const delay = `${i * 0.18}s`;
          const ringSize = 28 + i * 4; // each ring slightly bigger base size
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                width: ringSize,
                height: ringSize,
                borderRadius: "50%",
                border: `${2 - i * 0.2}px solid ${ORANGE}`,
                opacity: Math.max(0, 0.55 - i * 0.08),
                animation: `hlRingExpand 1.4s ease-out ${delay} infinite`,
                pointerEvents: "none",
              }}
            />
          );
        })}

      {/* Core button */}
      <button
        onClick={handleClick}
        title={active ? `${count}s — tap to cancel` : title}
        style={{
          position: "absolute",
          width: 28,
          height: 28,
          borderRadius: "50%",
          border: `2px solid ${ORANGE}`,
          background: active
            ? `conic-gradient(${ORANGE} ${progress * 360}deg, ${ORANGE}22 0deg)`
            : `${ORANGE}18`,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: active ? "#fff" : ORANGE,
          fontWeight: 900,
          fontSize: 11,
          letterSpacing: "-0.5px",
          zIndex: 1,
          animation: active ? "hlDeletePulse 1s ease-in-out infinite" : "none",
          transition: "background 0.15s",
          padding: 0,
          lineHeight: 1,
        }}
      >
        {active ? (
          <span style={{ fontSize: 12, fontWeight: 900, color: "#fff" }}>{count}</span>
        ) : (
          <Trash2 size={iconSize} />
        )}
      </button>
    </div>
  );
}

/**
 * ConfirmDeleteButton v3
 *
 * Phase 1 — Safety cover: a guard sits over the delete button.
 *   The cover IS a trash-can button — tap/slide it to reveal phase 2.
 * Phase 2 — Hold to delete: the button turns full red with a pulsing glow.
 *   Press and hold. An orange ring sweeps around your finger with a countdown.
 *   Release early → cancelled. Complete → fires onDelete.
 */
import React, { useState, useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";

const RED    = "#dc2626";
const RED_DIM = "#7a1c1c";
const ORANGE = "#d9711f";
const HOLD_MS = 2500;

const STYLE_ID = "hl-delete-v3-kf";
function ensureKeyframes() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
    @keyframes v3CoverSlide {
      0%   { transform: translateX(0);    opacity: 1; }
      100% { transform: translateX(110%); opacity: 0; }
    }
    @keyframes v3DangerPulse {
      0%, 100% { box-shadow: 0 0 6px 2px ${RED}55, inset 0 0 10px ${RED}22; }
      50%       { box-shadow: 0 0 18px 6px ${RED}99, inset 0 0 20px ${RED}44; }
    }
    @keyframes v3HoldPulse {
      0%, 100% { box-shadow: 0 0 12px 5px ${RED}88, 0 0 30px 10px ${RED}44; }
      50%       { box-shadow: 0 0 24px 10px ${RED}cc, 0 0 50px 18px ${RED}66; }
    }
    @keyframes v3Gone {
      0%   { transform: translate(-50%, 0)   scale(0.7); opacity: 0; }
      35%  { transform: translate(-50%, -16px) scale(1.15); opacity: 1; }
      100% { transform: translate(-50%, -28px) scale(0.9);  opacity: 0; }
    }
    @keyframes v3CoverHint {
      0%, 70%, 100% { transform: translateX(0); }
      40%           { transform: translateX(4px); }
    }
  `;
  document.head.appendChild(s);
}

type Phase = "idle" | "sliding" | "uncovered" | "holding" | "fired";

interface Props {
  onDelete: () => void;
  iconSize?: number;
  style?: React.CSSProperties;
  title?: string;
}

export default function ConfirmDeleteButton({
  onDelete,
  iconSize = 16,
  style,
  title = "Delete",
}: Props) {
  ensureKeyframes();

  const [phase, setPhase]       = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);

  const rafRef       = useRef<number | null>(null);
  const holdStartRef = useRef<number | null>(null);
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slideTimerRef= useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelRaf()      { if (rafRef.current       !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } }
  function clearAutoClose() { if (autoCloseRef.current  !== null) { clearTimeout(autoCloseRef.current);  autoCloseRef.current = null; } }
  function clearSlideTimer(){ if (slideTimerRef.current !== null) { clearTimeout(slideTimerRef.current); slideTimerRef.current = null; } }

  // Auto-reset if user doesn't interact after uncovering
  useEffect(() => {
    if (phase === "uncovered") {
      clearAutoClose();
      autoCloseRef.current = setTimeout(() => setPhase("idle"), 5000);
    } else {
      clearAutoClose();
    }
    return clearAutoClose;
  }, [phase]);

  useEffect(() => () => { cancelRaf(); clearAutoClose(); clearSlideTimer(); }, []);

  // ── Cover tap → slide away ──────────────────────────────────────────────────
  function handleCoverClick(e: React.MouseEvent | React.TouchEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (phase !== "idle") return;
    setPhase("sliding");
    clearSlideTimer();
    slideTimerRef.current = setTimeout(() => setPhase("uncovered"), 240);
  }

  // ── Hold start ─────────────────────────────────────────────────────────────
  function startHold(e: React.PointerEvent) {
    if (phase !== "uncovered") return;
    e.preventDefault();
    clearAutoClose();
    setPhase("holding");
    setProgress(0);
    holdStartRef.current = performance.now();

    function tick(now: number) {
      const p = Math.min(1, (now - (holdStartRef.current ?? now)) / HOLD_MS);
      setProgress(p);
      if (p >= 1) { setPhase("fired"); return; }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  function cancelHold() {
    if (phase !== "holding") return;
    cancelRaf();
    holdStartRef.current = null;
    setProgress(0);
    setPhase("uncovered");
  }

  // ── Fire ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "fired") return;
    cancelRaf();
    const t = setTimeout(() => { setPhase("idle"); setProgress(0); onDelete(); }, 700);
    return () => clearTimeout(t);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ────────────────────────────────────────────────────────────────
  const secsLeft = Math.max(0, Math.ceil((1 - progress) * (HOLD_MS / 1000)));
  const SVG      = 56;
  const CR       = 24;
  const circ     = 2 * Math.PI * CR;
  const dashOffset = circ * (1 - progress);

  const showCover  = phase === "idle" || phase === "sliding";
  const showButton = phase === "uncovered" || phase === "holding" || phase === "fired";
  const isHolding  = phase === "holding";
  const isFired    = phase === "fired";

  return (
    <div
      title={title}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "stretch",
        justifyContent: "center",
        width: 42,
        height: 42,
        flexShrink: 0,
        borderRadius: 10,
        overflow: "hidden",
        ...style,
      }}
    >
      {/* ══ PHASE 1 — SAFETY COVER ════════════════════════════════════════════
          Looks exactly like a DELETE button — trash icon, dark red tint.
          Tap it → slides away to reveal the live button.                     */}
      {showCover && (
        <button
          onClick={handleCoverClick}
          onTouchEnd={handleCoverClick}
          title="Slide to delete"
          style={{
            position: "absolute",
            inset: 0,
            border: `1.5px solid ${RED_DIM}66`,
            background: `linear-gradient(160deg, #220808 0%, #130404 60%, #0a0303 100%)`,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 10,
            zIndex: 3,
            padding: 0,
            boxShadow: `inset 0 -2px 5px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,80,80,0.08), 0 2px 6px rgba(0,0,0,0.5)`,
            animation: phase === "sliding"
              ? "v3CoverSlide 0.24s cubic-bezier(0.4,0,1,1) forwards"
              : "v3CoverHint 4s ease-in-out 1.5s infinite",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <Trash2 size={iconSize} color={RED_DIM} />
        </button>
      )}

      {/* ══ PHASE 2-4 — ACTIVE DELETE BUTTON ═════════════════════════════════
          Fully red. Trash icon is unmistakable. Hold to confirm.             */}
      {showButton && (
        <>
          {/* SVG progress ring (only during hold) */}
          {isHolding && (
            <svg
              width={SVG} height={SVG}
              style={{
                position: "absolute",
                top: "50%", left: "50%",
                transform: "translate(-50%, -50%) rotate(-90deg)",
                zIndex: 0, pointerEvents: "none",
              }}
            >
              <circle cx={SVG/2} cy={SVG/2} r={CR} fill="none" stroke={`${RED}22`} strokeWidth={3} />
              <circle cx={SVG/2} cy={SVG/2} r={CR} fill="none"
                stroke={RED} strokeWidth={3}
                strokeDasharray={circ} strokeDashoffset={dashOffset}
                strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 4px ${RED})` }}
              />
            </svg>
          )}

          {/* The actual DELETE button */}
          <button
            onPointerDown={startHold}
            onPointerUp={cancelHold}
            onPointerLeave={cancelHold}
            onPointerCancel={cancelHold}
            title={phase === "uncovered" ? "Hold to delete" : undefined}
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 10,
              border: `2px solid ${RED}`,
              background: isHolding
                ? `radial-gradient(circle at 50% 50%, ${RED}77 0%, ${RED}33 60%, ${RED}11 100%)`
                : `linear-gradient(160deg, ${RED}44 0%, ${RED}22 100%)`,
              cursor: phase === "uncovered" ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1,
              padding: 0,
              touchAction: "none",
              userSelect: "none",
              WebkitUserSelect: "none",
              transition: "background 0.2s",
              animation: isHolding
                ? "v3HoldPulse 0.6s ease-in-out infinite"
                : "v3DangerPulse 2s ease-in-out infinite",
            }}
          >
            {!isFired && (
              <Trash2
                size={isHolding ? iconSize + 2 : iconSize}
                color={isHolding ? "#fff" : RED}
                style={{ transition: "all 0.15s", filter: isHolding ? `drop-shadow(0 0 4px ${RED})` : "none" }}
              />
            )}
            {isHolding && (
              <div style={{
                position: "absolute", bottom: 2,
                fontSize: 9, fontWeight: 900, color: "#fff",
                opacity: 0.8, letterSpacing: 0.3,
              }}>
                {secsLeft}s
              </div>
            )}
          </button>

          {/* "Gone!" burst */}
          {isFired && (
            <div style={{
              position: "absolute", top: "50%", left: "50%",
              whiteSpace: "nowrap", fontSize: 10, fontWeight: 900,
              color: RED, textShadow: `0 0 8px ${RED}`,
              zIndex: 5, animation: "v3Gone 0.7s ease-out forwards",
              pointerEvents: "none",
            }}>
              Gone 🗑️
            </div>
          )}
        </>
      )}
    </div>
  );
}

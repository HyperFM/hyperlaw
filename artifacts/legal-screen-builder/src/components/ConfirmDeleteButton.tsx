/**
 * ConfirmDeleteButton v2
 *
 * Phase 1 — Safety cover: a physical sliding guard sits over the trash button.
 *   Tap the cover to slide it open (reveals the delete button underneath).
 * Phase 2 — Hold to delete: press-and-hold the glowing button.
 *   A countdown number orbits your finger while an orange arc sweeps around.
 *   Release early to cancel. Complete → "See ya! 👋" fires onDelete.
 */
import React, { useState, useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";

const ORANGE = "#d9711f";
const HOLD_MS = 2500;
const ORBIT_RADIUS = 22; // px from button center to orbiting number

const STYLE_ID = "hl-delete-v2-kf";
function ensureKeyframes() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
    @keyframes hlCoverSlide {
      0%   { transform: translateX(0)    scaleX(1);   opacity: 1; }
      100% { transform: translateX(130%) scaleX(0.5); opacity: 0; }
    }
    @keyframes hlCoverHint {
      0%, 80%, 100% { transform: translateX(0); }
      40%           { transform: translateX(3px); }
    }
    @keyframes hlGlowIdle {
      0%, 100% { box-shadow: 0 0 4px 1px ${ORANGE}44; }
      50%       { box-shadow: 0 0 10px 4px ${ORANGE}77; }
    }
    @keyframes hlGlowHold {
      0%, 100% { box-shadow: 0 0 8px 4px ${ORANGE}99, 0 0 22px 8px ${ORANGE}55; }
      50%       { box-shadow: 0 0 18px 7px ${ORANGE}cc, 0 0 40px 16px ${ORANGE}88; }
    }
    @keyframes hlSeeYa {
      0%   { transform: translate(-50%, 0)  scale(0.6); opacity: 0; }
      35%  { transform: translate(-50%, -18px) scale(1.2); opacity: 1; }
      100% { transform: translate(-50%, -30px) scale(0.85); opacity: 0; }
    }
    @keyframes hlCoverRipple {
      0%   { box-shadow: inset 0 -2px 4px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,180,100,0.12), 0 2px 5px rgba(0,0,0,0.5); }
      50%  { box-shadow: inset 0 -2px 4px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,180,100,0.12), 0 2px 5px rgba(0,0,0,0.5), 0 0 0 2px ${ORANGE}66; }
      100% { box-shadow: inset 0 -2px 4px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,180,100,0.12), 0 2px 5px rgba(0,0,0,0.5); }
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
  iconSize = 14,
  style,
  title = "Delete",
}: Props) {
  ensureKeyframes();

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0); // 0..1 hold progress
  const [orbitAngle, setOrbitAngle] = useState(0); // degrees

  const rafRef = useRef<number | null>(null);
  const holdStartRef = useRef<number | null>(null);
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelRaf() {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }
  function clearAutoClose() {
    if (autoCloseRef.current !== null) { clearTimeout(autoCloseRef.current); autoCloseRef.current = null; }
  }
  function clearSlideTimer() {
    if (slideTimerRef.current !== null) { clearTimeout(slideTimerRef.current); slideTimerRef.current = null; }
  }

  // Auto-close the cover after 5 s of inactivity in "uncovered" state
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

  // ── Cover tap ──────────────────────────────────────────────────────────────
  function handleCoverClick(e: React.MouseEvent | React.TouchEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (phase !== "idle") return;
    setPhase("sliding");
    clearSlideTimer();
    slideTimerRef.current = setTimeout(() => setPhase("uncovered"), 280);
  }

  // ── Hold start ─────────────────────────────────────────────────────────────
  function startHold(e: React.PointerEvent) {
    if (phase !== "uncovered") return;
    e.preventDefault();
    clearAutoClose();
    setPhase("holding");
    setProgress(0);
    setOrbitAngle(0);
    holdStartRef.current = performance.now();

    function tick(now: number) {
      const elapsed = now - (holdStartRef.current ?? now);
      const p = Math.min(1, elapsed / HOLD_MS);
      // Orbit: two full sweeps over the hold duration
      const angle = (p * 720) % 360;
      setProgress(p);
      setOrbitAngle(angle);
      if (p >= 1) {
        setPhase("fired");
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  // ── Hold cancel (released early) ───────────────────────────────────────────
  function cancelHold() {
    if (phase !== "holding") return;
    cancelRaf();
    holdStartRef.current = null;
    setProgress(0);
    setOrbitAngle(0);
    setPhase("uncovered");
  }

  // ── Fire when hold completes ───────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "fired") return;
    cancelRaf();
    const t = setTimeout(() => {
      setPhase("idle");
      setProgress(0);
      setOrbitAngle(0);
      onDelete();
    }, 750);
    return () => clearTimeout(t);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived visuals ────────────────────────────────────────────────────────
  const secsLeft = Math.max(0, Math.ceil((1 - progress) * (HOLD_MS / 1000)));

  // Orbiting number position
  const rad = (orbitAngle * Math.PI) / 180;
  const numX = Math.sin(rad) * ORBIT_RADIUS;
  const numY = -Math.cos(rad) * ORBIT_RADIUS;

  // SVG progress ring
  const SVG = 64;
  const CR = 28; // circle radius
  const circ = 2 * Math.PI * CR;
  const dashOffset = circ * (1 - progress);

  const showCover    = phase === "idle" || phase === "sliding";
  const showButton   = phase === "uncovered" || phase === "holding" || phase === "fired";
  const isHolding    = phase === "holding";
  const isFired      = phase === "fired";

  return (
    <div
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 34,
        height: 34,
        flexShrink: 0,
        ...style,
      }}
    >
      {/* ══ SAFETY COVER ══════════════════════════════════════════════════════ */}
      {showCover && (
        <button
          onClick={handleCoverClick}
          title="Slide to reveal delete"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 8,
            border: `1.5px solid ${ORANGE}66`,
            background: `linear-gradient(160deg, #2e1206 0%, #180a03 60%, #0e0704 100%)`,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "visible",
            zIndex: 3,
            padding: 0,
            // Physical raised-cover shadow
            boxShadow: `inset 0 -2px 4px rgba(0,0,0,0.65),
                        inset 0 1px 1px rgba(255,170,80,0.13),
                        0 3px 6px rgba(0,0,0,0.55),
                        0 1px 0 rgba(255,140,60,0.08)`,
            animation: phase === "sliding"
              ? "hlCoverSlide 0.28s cubic-bezier(0.4,0,1,1) forwards"
              : "hlCoverHint 3.5s ease-in-out 2s 1, hlCoverRipple 2.5s ease-in-out 0.5s 1",
          }}
        >
          {/* Centre groove — acts as the visible "slide handle" */}
          <div style={{
            position: "absolute",
            top: 3, bottom: 3,
            left: "50%",
            transform: "translateX(-50%)",
            width: 4,
            borderRadius: 2,
            background: `linear-gradient(180deg,
              transparent 0%,
              ${ORANGE}22 20%,
              ${ORANGE}55 50%,
              ${ORANGE}22 80%,
              transparent 100%)`,
          }} />
          {/* Side-scroll chevron hint */}
          <span style={{
            fontSize: 9,
            color: `${ORANGE}99`,
            fontWeight: 900,
            letterSpacing: -1.5,
            zIndex: 1,
            userSelect: "none",
            textShadow: `0 0 5px ${ORANGE}88`,
            lineHeight: 1,
          }}>›</span>

          {/* Tiny raised ridge at top for realism */}
          <div style={{
            position: "absolute",
            top: 0,
            left: 4, right: 4,
            height: 2,
            borderRadius: "2px 2px 0 0",
            background: `linear-gradient(90deg, transparent, ${ORANGE}33, transparent)`,
          }} />
        </button>
      )}

      {/* ══ DELETE BUTTON + HOLD VISUALS ══════════════════════════════════════ */}
      {showButton && (
        <>
          {/* SVG sweep arc — visible only while holding */}
          {isHolding && (
            <svg
              width={SVG}
              height={SVG}
              style={{
                position: "absolute",
                top: "50%", left: "50%",
                transform: "translate(-50%, -50%) rotate(-90deg)",
                zIndex: 0,
                pointerEvents: "none",
              }}
            >
              {/* Track */}
              <circle cx={SVG / 2} cy={SVG / 2} r={CR}
                fill="none" stroke={`${ORANGE}1a`} strokeWidth={3} />
              {/* Progress */}
              <circle cx={SVG / 2} cy={SVG / 2} r={CR}
                fill="none"
                stroke={ORANGE}
                strokeWidth={3}
                strokeDasharray={circ}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 5px ${ORANGE})` }}
              />
            </svg>
          )}

          {/* Core trash button */}
          <button
            onPointerDown={startHold}
            onPointerUp={cancelHold}
            onPointerLeave={cancelHold}
            onPointerCancel={cancelHold}
            title={phase === "uncovered" ? "Hold to delete" : undefined}
            style={{
              position: "absolute",
              width: 30,
              height: 30,
              borderRadius: "50%",
              border: `2px solid ${ORANGE}`,
              background: isHolding
                ? `radial-gradient(circle at 50% 50%, ${ORANGE}55 0%, ${ORANGE}15 70%)`
                : `${ORANGE}18`,
              cursor: phase === "uncovered" ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: ORANGE,
              zIndex: 1,
              padding: 0,
              touchAction: "none",
              userSelect: "none",
              WebkitUserSelect: "none",
              animation: isHolding
                ? "hlGlowHold 0.7s ease-in-out infinite"
                : "hlGlowIdle 2s ease-in-out infinite",
              transition: "background 0.15s",
            }}
          >
            {!isHolding && !isFired && <Trash2 size={iconSize} />}
          </button>

          {/* Orbiting countdown number */}
          {isHolding && (
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: 16,
                height: 16,
                // Orbit offset from center
                transform: `translate(calc(-50% + ${numX}px), calc(-50% + ${numY}px))`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                fontSize: 10,
                color: "#fff",
                textShadow: `0 0 6px ${ORANGE}, 0 0 12px ${ORANGE}`,
                zIndex: 4,
                pointerEvents: "none",
                lineHeight: 1,
              }}
            >
              {secsLeft}
            </div>
          )}

          {/* "See ya!" burst */}
          {isFired && (
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                whiteSpace: "nowrap",
                fontSize: 11,
                fontWeight: 900,
                color: ORANGE,
                textShadow: `0 0 8px ${ORANGE}, 0 0 18px ${ORANGE}88`,
                zIndex: 5,
                animation: "hlSeeYa 0.75s ease-out forwards",
                pointerEvents: "none",
              }}
            >
              See ya! 👋
            </div>
          )}
        </>
      )}
    </div>
  );
}

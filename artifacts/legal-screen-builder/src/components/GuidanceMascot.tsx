import React from "react";

// GuidanceMascot — an animated, on-brand orange "brain" character that fronts the
// Guidance Session experience. Pure CSS/SVG (no external image). Gently floats,
// breathes, and blinks; reacts to conversation state (thinking / speaking / happy).

const ORANGE = "#d9711f";
const ORANGE_LIGHT = "#FF7A1A";

export type MascotState = "idle" | "thinking" | "speaking" | "happy";

export default function GuidanceMascot({
  size = 96,
  state = "idle",
  style,
}: {
  size?: number;
  state?: MascotState;
  style?: React.CSSProperties;
}): React.JSX.Element {
  // Unique suffix so multiple mascots on one screen don't share gradient / keyframe ids.
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const gradId = `hlmGrad${uid}`;
  const glowId = `hlmGlowF${uid}`;
  const speaking = state === "speaking";
  const thinking = state === "thinking";
  const happy = state === "happy";

  return (
    <div
      aria-hidden="true"
      style={{
        width: size, height: size, position: "relative",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, ...style,
      }}
    >
      {/* Ambient glow */}
      <div
        style={{
          position: "absolute", inset: "-16%", borderRadius: "50%",
          background: `radial-gradient(circle, ${ORANGE}55 0%, ${ORANGE}22 45%, transparent 70%)`,
          filter: "blur(3px)",
          animation: `hlmGlow${uid} ${thinking ? 1.1 : 2.8}s ease-in-out infinite`,
        }}
      />
      <svg
        width={size} height={size} viewBox="0 0 120 120"
        style={{ position: "relative", overflow: "visible", animation: `hlmFloat${uid} 3.6s ease-in-out infinite` }}
      >
        <defs>
          <radialGradient id={gradId} cx="42%" cy="32%" r="78%">
            <stop offset="0%" stopColor={ORANGE_LIGHT} />
            <stop offset="55%" stopColor={ORANGE} />
            <stop offset="100%" stopColor="#a8530f" />
          </radialGradient>
          <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g style={{ transformOrigin: "60px 60px", animation: `hlmBreathe${uid} ${speaking ? 1 : 3.6}s ease-in-out infinite` }}>
          {/* Brain body — lumpy silhouette */}
          <path
            d="M60 20 C 45 9, 25 15, 24 33 C 12 36, 12 54, 22 60 C 14 69, 19 85, 33 86 C 37 98, 55 99, 60 90 C 65 99, 83 98, 87 86 C 101 85, 106 69, 98 60 C 108 54, 108 36, 96 33 C 95 15, 75 9, 60 20 Z"
            fill={`url(#${gradId})`}
            stroke="#7a3d0a"
            strokeWidth="2"
            filter={`url(#${glowId})`}
          />
          {/* Fissure + folds */}
          <g fill="none" stroke="#8a4a10" strokeWidth="2" strokeLinecap="round" opacity="0.5">
            <path d="M60 24 C 55 36, 65 42, 60 54 C 56 64, 64 72, 60 84" />
            <path d="M34 36 C 45 40, 43 49, 34 51" />
            <path d="M27 58 C 40 58, 43 66, 32 72" />
            <path d="M86 36 C 75 40, 77 49, 86 51" />
            <path d="M93 58 C 80 58, 77 66, 88 72" />
          </g>
          {/* Shine */}
          <ellipse cx="44" cy="34" rx="10" ry="6" fill="#fff" opacity="0.26" />

          {/* Face */}
          <g style={{ transformOrigin: "60px 62px", animation: `hlmBlink${uid} 4.8s ease-in-out infinite` }}>
            <circle cx="50" cy="62" r="5.2" fill="#2a1403" />
            <circle cx="70" cy="62" r="5.2" fill="#2a1403" />
            <circle cx="51.7" cy="60.2" r="1.7" fill="#fff" />
            <circle cx="71.7" cy="60.2" r="1.7" fill="#fff" />
          </g>
          {happy ? (
            <path d="M50 73 Q 60 83 70 73" fill="none" stroke="#2a1403" strokeWidth="3" strokeLinecap="round" />
          ) : speaking ? (
            <ellipse
              cx="60" cy="75" rx="6" ry="4.5" fill="#2a1403"
              style={{ transformOrigin: "60px 75px", animation: `hlmTalk${uid} 0.5s ease-in-out infinite` }}
            />
          ) : (
            <path d="M52 74 Q 60 79 68 74" fill="none" stroke="#2a1403" strokeWidth="2.6" strokeLinecap="round" />
          )}
        </g>
      </svg>

      <style>{`
        @keyframes hlmFloat${uid} { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
        @keyframes hlmBreathe${uid} { 0%,100%{transform:scale(1)} 50%{transform:scale(1.04)} }
        @keyframes hlmGlow${uid} { 0%,100%{opacity:0.55;transform:scale(1)} 50%{opacity:0.95;transform:scale(1.08)} }
        @keyframes hlmBlink${uid} { 0%,92%,100%{transform:scaleY(1)} 96%{transform:scaleY(0.12)} }
        @keyframes hlmTalk${uid} { 0%,100%{transform:scaleY(0.55)} 50%{transform:scaleY(1.2)} }
      `}</style>
    </div>
  );
}

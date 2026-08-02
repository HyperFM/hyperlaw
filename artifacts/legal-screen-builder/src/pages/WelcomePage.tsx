import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { FULL_HEIGHT } from "../lib/viewport";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// TEMPORARY — remove once the last bit of the mobile bottom-gap bug is
// diagnosed. Reads the resting-state numbers, not mid-scroll, so this shows
// exactly what the fixed, unchanging remaining gap actually is.
function ViewportDebugHUD({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    function measure() {
      const el = containerRef.current;
      const rect = el ? el.getBoundingClientRect() : null;
      const cs = document.documentElement.style.getPropertyValue("--app-100dvh");
      const containerCS = el ? getComputedStyle(el) : null;
      setLines([
        `innerHeight: ${window.innerHeight}`,
        `documentElement.clientHeight: ${document.documentElement.clientHeight}`,
        `--app-100dvh var: ${cs}`,
        `container computed height: ${containerCS ? containerCS.height : "n/a"}`,
        `container computed minHeight: ${containerCS ? containerCS.minHeight : "n/a"}`,
        `container bottom (rect): ${rect ? rect.bottom.toFixed(1) : "n/a"}`,
        `GAP (innerHeight - container bottom): ${rect ? (window.innerHeight - rect.bottom).toFixed(1) : "n/a"}`,
        `devicePixelRatio: ${window.devicePixelRatio}`,
      ]);
    }
    measure();
    const t = setTimeout(measure, 1500);
    return () => clearTimeout(t);
  }, [containerRef]);

  return (
    <div
      style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 999999,
        background: "rgba(0,0,0,0.92)", color: "#39ff6a",
        fontFamily: "Menlo, monospace", fontSize: 10.5, lineHeight: 1.6,
        padding: "6px 10px", pointerEvents: "none",
        borderBottom: "2px solid #39ff6a", textAlign: "left",
      }}
    >
      {lines.map((line) => <div key={line}>{line}</div>)}
    </div>
  );
}

export default function WelcomePage() {
  const [, navigate] = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      style={{
        minHeight: FULL_HEIGHT,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(ellipse 900px 500px at 50% -10%, rgba(244,93,1,0.14), transparent 60%), #0a0908",
        padding: "40px 24px 60px",
        fontFamily: "Arial, sans-serif",
        color: "#F4EFE8",
        textAlign: "center",
      }}
    >
      <ViewportDebugHUD containerRef={containerRef} />
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 32 }}>
        <span style={{ color: "#F45D01", fontWeight: 900, fontSize: 32, letterSpacing: "-0.02em" }}>HYPER</span>
        <span style={{ fontWeight: 900, fontSize: 32, letterSpacing: "-0.02em" }}>LAW</span>
      </div>

      {/* Eyebrow */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          justifyContent: "center",
          textTransform: "uppercase",
          letterSpacing: "0.26em",
          fontSize: 10,
          color: "#FF7A1A",
          fontWeight: 600,
          marginBottom: 20,
        }}
      >
        <span style={{ height: 1, width: 28, background: "linear-gradient(90deg, transparent, #F45D01)", opacity: 0.7 }} />
        Legal Self-Help Tool
        <span style={{ height: 1, width: 28, background: "linear-gradient(90deg, #F45D01, transparent)", opacity: 0.7 }} />
      </div>

      {/* Heading */}
      <h1
        style={{
          fontWeight: 900,
          fontStyle: "italic",
          textTransform: "uppercase",
          fontSize: "clamp(28px, 7vw, 52px)",
          lineHeight: 1.05,
          letterSpacing: "0.01em",
          color: "#F4EFE8",
          maxWidth: 520,
          margin: "0 0 18px",
        }}
      >
        Build Your Case.<br />
        <span style={{ color: "#FF7A1A" }}>Know Your Rights.</span>
      </h1>

      <p
        style={{
          color: "#9C948A",
          fontSize: 15,
          lineHeight: 1.65,
          maxWidth: 420,
          margin: "0 0 40px",
        }}
      >
        Organize incidents, track cases, and understand your evidence — built for
        pro se litigants who have to fight their own battles.
      </p>

      {/* CTAs */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 320 }}>
        <button
          onClick={() => navigate(`${basePath}/sign-up`)}
          style={{
            width: "100%",
            padding: "15px 20px",
            background: "linear-gradient(90deg, #F45D01, #FF7A1A)",
            border: "none",
            borderRadius: 12,
            color: "#0a0908",
            fontWeight: 800,
            fontSize: 14,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            cursor: "pointer",
            boxShadow: "0 10px 30px -10px rgba(244,93,1,.75)",
          }}
        >
          Start Building Your Case
        </button>
        <button
          onClick={() => navigate(`${basePath}/sign-in`)}
          style={{
            width: "100%",
            padding: "15px 20px",
            background: "transparent",
            border: "1px solid #2a2521",
            borderRadius: 12,
            color: "#F4EFE8",
            fontWeight: 700,
            fontSize: 14,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            cursor: "pointer",
          }}
        >
          Sign In
        </button>
        <button
          onClick={() => navigate(`${basePath}/plans`)}
          style={{
            background: "none",
            border: "none",
            color: "#9C948A",
            fontSize: 13,
            cursor: "pointer",
            padding: "6px 0",
            textDecoration: "underline",
            textUnderlineOffset: 3,
          }}
        >
          View plans & pricing
        </button>
      </div>

      <p style={{ color: "#3a3532", fontSize: 11, marginTop: 40, lineHeight: 1.6 }}>
No subscription necessary
      </p>
    </div>
  );
}

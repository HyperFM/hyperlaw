import { useLocation } from "wouter";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function WelcomePage() {
  const [, navigate] = useLocation();

  return (
    <div
      style={{
        minHeight: "100dvh",
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

import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";

const ORANGE = "#F45D01";
const ORANGE_HOT = "#FF7A1A";
const PAPER = "#F4EFE8";
const DIM = "#9C948A";
const PANEL = "#141210";
const PANEL2 = "#1b1815";
const LINE = "#2a2521";

const plans = [
  {
    id: "firstfiling",
    name: "First Filing",
    tagline: "You don't have to be fearless. Doing it afraid is just as brave.",
    price: "Free",
    cycle: null,
    priceNote: "No card required · usage limits apply",
    badge: null,
    quote:
      '"You\'ll make mistakes. That\'s not disqualifying — quitting is. Stay determined and the scale tips your way eventually, even when it doesn\'t look like it yet."',
    features: [
      { text: "<b>Build one case, start to finish</b> — one new case per day, so it grows with you instead of overwhelming you", tbd: false },
      { text: "Guided case tutor included, with its own usage limits so it's there whenever you need it", tbd: false },
      { text: "Usage limits are built to flex — whatever situation you're filing from, the tool works with you", tbd: false },
      { text: "A document & evidence checklist: keep the camera rolling, save every receipt", tbd: false },
      { text: "Plain-English glossary for the terms nobody explains to you", tbd: false },
    ],
    ctaLabel: "Start First Filing",
    ctaStyle: "secondary",
    signUpPath: "/sign-up",
  },
  {
    id: "prosay",
    name: "Pro-Say Selection",
    tagline: "Say it right, every filing",
    price: "$19",
    cycle: "/ month",
    priceNote: "Billed monthly · cancel anytime",
    badge: null,
    quote:
      '"The law rewards those who show up prepared. Pro-Say gives you every tool to make sure that person is you."',
    features: [
      { text: "<b>Unlimited cases</b> — build and track as many cases as your docket demands", tbd: false },
      { text: "<b>Priority tutor access</b> — no usage caps, full reasoning depth", tbd: false },
      { text: "<b>Document analysis</b> — upload evidence, get structured breakdowns", tbd: false },
      { text: "<b>Readiness engine</b> — know your case strength before you file", tbd: false },
      { text: "<b>Advanced reminders</b> — deadline tracking across all your cases", tbd: false },
    ],
    ctaLabel: "Select Pro-Say",
    ctaStyle: "primary",
    signUpPath: "/sign-up",
  },
  {
    id: "apex",
    name: "Apex Litigant",
    tagline: "The full docket. No compromises.",
    price: "TBD",
    cycle: null,
    priceNote: "After full discovery",
    badge: "Full Docket",
    quote:
      '"Apex is for those who treat their case like a profession. Every tool, every insight, full depth."',
    features: [
      { text: "To be determined — after full discovery", tbd: true },
      { text: "To be determined — after full discovery", tbd: true },
      { text: "To be determined — after full discovery", tbd: true },
      { text: "To be determined — after full discovery", tbd: true },
      { text: "To be determined — after full discovery", tbd: true },
    ],
    ctaLabel: "Get Notified",
    ctaStyle: "secondary",
    signUpPath: "/sign-up",
  },
] as const;

const CARD_ICONS = ["⚖️", "🗂️", "🏛️"];

export default function Landing() {
  const [, navigate] = useLocation();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const [activeIndex, setActiveIndex] = useState(1);
  const trackRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const currentXRef = useRef(0);
  const isDraggingRef = useRef(false);

  const goTo = useCallback((idx: number) => {
    setActiveIndex(Math.max(0, Math.min(plans.length - 1, idx)));
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    currentXRef.current = e.clientX;
    trackRef.current?.setPointerCapture(e.pointerId);
    trackRef.current?.classList.add("dragging");
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!isDraggingRef.current) return;
    currentXRef.current = e.clientX;
  }

  function onPointerUp() {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    trackRef.current?.classList.remove("dragging");
    const diff = currentXRef.current - startXRef.current;
    if (Math.abs(diff) > 50) {
      goTo(activeIndex + (diff < 0 ? 1 : -1));
    }
  }

  function handleCta(plan: (typeof plans)[number]) {
    navigate(`${basePath}${plan.signUpPath}`);
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        background:
          "radial-gradient(ellipse 900px 500px at 50% -10%, rgba(244,93,1,0.14), transparent 60%), linear-gradient(180deg, #0a0908 0%, #0d0b09 100%)",
        padding: "56px 20px 80px",
        overflowX: "hidden",
        fontFamily: "Arial, sans-serif",
        color: PAPER,
      }}
    >
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        {/* Logo mark */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
            }}
            onClick={() => navigate("/")}
          >
            <span style={{ color: ORANGE, fontWeight: 900, fontSize: 22, letterSpacing: "-0.02em" }}>
              HYPER
            </span>
            <span style={{ fontWeight: 900, fontSize: 22, letterSpacing: "-0.02em" }}>LAW</span>
          </div>
        </div>

        {/* Eyebrow */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            justifyContent: "center",
            textTransform: "uppercase",
            letterSpacing: "0.28em",
            fontSize: 11,
            color: ORANGE_HOT,
            fontWeight: 600,
            marginBottom: 18,
          }}
        >
          <span style={{ height: 1, width: 36, background: `linear-gradient(90deg, transparent, ${ORANGE})`, opacity: 0.7, display: "block" }} />
          HyperLaw · Membership
          <span style={{ height: 1, width: 36, background: `linear-gradient(90deg, ${ORANGE}, transparent)`, opacity: 0.7, display: "block" }} />
        </div>

        {/* Heading */}
        <h1
          style={{
            fontWeight: 900,
            fontStyle: "italic",
            textTransform: "uppercase",
            textAlign: "center",
            fontSize: "clamp(30px, 8vw, 52px)",
            letterSpacing: "0.01em",
            lineHeight: 1.02,
            color: PAPER,
            margin: "0 0 14px",
          }}
        >
          Choose Your <span style={{ color: ORANGE_HOT }}>Standing</span>
        </h1>
        <p
          style={{
            textAlign: "center",
            color: DIM,
            fontSize: 14,
            lineHeight: 1.6,
            marginBottom: 32,
          }}
        >
          Three ways to work the case, from your first filing to a full docket.
          Pick the tier that matches where you're at — upgrade any time.
        </p>

        {/* Divider swoosh */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
          <svg viewBox="0 0 420 26" style={{ width: "100%", maxWidth: 420, height: 26, filter: "drop-shadow(0 0 6px rgba(244,93,1,.55))" }} preserveAspectRatio="none">
            <path d="M0,20 L360,20 L420,4" stroke={ORANGE} strokeWidth="2.5" fill="none" strokeLinecap="round" />
          </svg>
        </div>

        {/* Swipe hint */}
        <div
          style={{
            textAlign: "center",
            color: DIM,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.16em",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
            <path d="M9 18l6-6-6-6" />
          </svg>
          Swipe to browse plans
        </div>

        {/* Carousel */}
        <div style={{ position: "relative", maxWidth: 460, margin: "0 auto" }}>
          <div style={{ overflow: "hidden", borderRadius: 22 }}>
            <div
              ref={trackRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{
                display: "flex",
                transform: `translateX(-${activeIndex * 100}%)`,
                transition: isDraggingRef.current ? "none" : "transform 0.38s cubic-bezier(.22,.9,.32,1)",
                cursor: "grab",
                userSelect: "none",
              }}
            >
              {plans.map((plan, i) => (
                <div key={plan.id} style={{ flex: "0 0 100%", maxWidth: "100%", padding: 6, display: "flex" }}>
                  <PlanCard
                    plan={plan}
                    icon={CARD_ICONS[i]}
                    isActive={i === activeIndex}
                    onCta={() => handleCta(plan)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Dots */}
          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 20 }}>
            {plans.map((p, i) => (
              <button
                key={p.id}
                onClick={() => goTo(i)}
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  background: i === activeIndex
                    ? `linear-gradient(90deg, ${ORANGE}, ${ORANGE_HOT})`
                    : LINE,
                  transform: i === activeIndex ? "scale(1.3)" : "scale(1)",
                  boxShadow: i === activeIndex ? `0 0 10px rgba(244,93,1,.7)` : "none",
                  transition: "all 0.25s ease",
                }}
              />
            ))}
          </div>

          {/* Arrow buttons */}
          <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 14 }}>
            <button
              onClick={() => goTo(activeIndex - 1)}
              disabled={activeIndex === 0}
              style={{
                width: 38, height: 38, borderRadius: "50%",
                border: `1px solid ${LINE}`, background: PANEL, color: PAPER,
                cursor: activeIndex === 0 ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: activeIndex === 0 ? 0.3 : 1,
                transition: "all 0.2s ease",
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              onClick={() => goTo(activeIndex + 1)}
              disabled={activeIndex === plans.length - 1}
              style={{
                width: 38, height: 38, borderRadius: "50%",
                border: `1px solid ${LINE}`, background: PANEL, color: PAPER,
                cursor: activeIndex === plans.length - 1 ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: activeIndex === plans.length - 1 ? 0.3 : 1,
                transition: "all 0.2s ease",
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        </div>

        {/* Bottom sign-in link */}
        <p style={{ textAlign: "center", color: DIM, fontSize: 13, marginTop: 36, lineHeight: 1.7 }}>
          Already have an account?{" "}
          <button
            onClick={() => navigate(`${basePath}/sign-in`)}
            style={{ color: ORANGE_HOT, background: "none", border: "none", cursor: "pointer", fontSize: 13, textDecoration: "underline" }}
          >
            Sign in
          </button>
        </p>

        <p style={{ textAlign: "center", color: "#4a4542", fontSize: 11, marginTop: 16, lineHeight: 1.6 }}>
          No auto-renewals without notice · Cancel anytime · Usage limits apply on free tier
        </p>
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  icon,
  isActive,
  onCta,
}: {
  plan: (typeof plans)[number];
  icon: string;
  isActive: boolean;
  onCta: () => void;
}) {
  const glowStyle: React.CSSProperties = isActive
    ? {
        borderColor: "rgba(255,122,26,.75)",
        boxShadow:
          "0 0 0 1px rgba(255,122,26,.35), 0 0 46px -6px rgba(244,93,1,.55), 0 20px 60px -18px rgba(244,93,1,.4)",
        animation: "glowPulse 2.4s ease-in-out infinite",
      }
    : {};

  return (
    <>
      <style>{`
        @keyframes glowPulse {
          0%, 100% { box-shadow: 0 0 0 1px rgba(255,122,26,.28), 0 0 30px -8px rgba(244,93,1,.4), 0 20px 60px -18px rgba(244,93,1,.3); }
          50% { box-shadow: 0 0 0 1px rgba(255,122,26,.55), 0 0 54px -6px rgba(244,93,1,.75), 0 20px 60px -18px rgba(244,93,1,.5); }
        }
      `}</style>
      <div
        style={{
          position: "relative",
          width: "100%",
          background: `linear-gradient(180deg, ${PANEL} 0%, ${PANEL2} 100%)`,
          border: `1px solid ${plan.id === "apex" ? "rgba(244,93,1,.35)" : LINE}`,
          borderRadius: 22,
          padding: "34px 26px 30px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          transition: "border-color .25s ease, box-shadow .35s ease",
          ...glowStyle,
        }}
      >
        {/* Badge */}
        {plan.badge && (
          <div
            style={{
              position: "absolute",
              top: -13,
              left: "50%",
              transform: "translateX(-50%)",
              background: `linear-gradient(90deg, ${ORANGE}, ${ORANGE_HOT})`,
              color: "#0a0908",
              fontWeight: 700,
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              padding: "6px 16px",
              borderRadius: 999,
              boxShadow: "0 6px 18px -6px rgba(244,93,1,.7)",
              whiteSpace: "nowrap",
            }}
          >
            {plan.badge}
          </div>
        )}

        {/* Icon */}
        <div
          style={{
            width: 88,
            height: 88,
            margin: "10px 0 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 52,
            filter: "drop-shadow(0 0 20px rgba(244,93,1,.4))",
          }}
        >
          {icon}
        </div>

        {/* Name */}
        <div
          style={{
            fontWeight: 900,
            fontStyle: "italic",
            textTransform: "uppercase",
            fontSize: 24,
            letterSpacing: "0.01em",
            color: PAPER,
          }}
        >
          {plan.name}
        </div>

        {/* Tagline */}
        <div
          style={{
            color: ORANGE_HOT,
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            fontWeight: 600,
            marginTop: 6,
            minHeight: 16,
          }}
        >
          {plan.tagline}
        </div>

        {/* Price */}
        <div style={{ margin: "22px 0 4px", display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 40 }}>{plan.price}</span>
          {plan.cycle && (
            <span style={{ color: DIM, fontSize: 14 }}>{plan.cycle}</span>
          )}
        </div>
        <div style={{ color: DIM, fontSize: 12, marginBottom: 20 }}>{plan.priceNote}</div>

        {/* Quote */}
        <p
          style={{
            fontStyle: "italic",
            fontSize: 12.5,
            color: "#DAD3C9",
            lineHeight: 1.55,
            padding: "12px 6px 16px",
            borderTop: `1px solid ${LINE}`,
            marginTop: 2,
            marginBottom: 6,
            width: "100%",
          }}
        >
          {plan.quote}
        </p>

        <div style={{ width: "100%", height: 1, background: LINE, margin: "4px 0 20px" }} />

        {/* Features */}
        <ul
          style={{
            listStyle: "none",
            width: "100%",
            textAlign: "left",
            display: "flex",
            flexDirection: "column",
            gap: 11,
            marginBottom: 26,
            flex: 1,
            padding: 0,
          }}
        >
          {plan.features.map((f, i) => (
            <li
              key={i}
              style={{
                display: "flex",
                gap: 9,
                fontSize: 13.5,
                lineHeight: 1.42,
                color: f.tbd ? DIM : "#DAD3C9",
                fontStyle: f.tbd ? "italic" : "normal",
              }}
            >
              <span style={{ flexShrink: 0, color: f.tbd ? DIM : undefined }}>
                {f.tbd ? "○" : "✓"}
              </span>
              <span dangerouslySetInnerHTML={{ __html: f.text.replace(/<b>/g, `<strong style="color:${PAPER};font-weight:600">`).replace(/<\/b>/g, "</strong>") }} />
            </li>
          ))}
        </ul>

        {/* CTA */}
        <button
          onClick={onCta}
          style={{
            width: "100%",
            padding: "14px 18px",
            borderRadius: 12,
            border: plan.ctaStyle === "primary" ? "none" : `1px solid ${LINE}`,
            cursor: "pointer",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontSize: 13.5,
            marginTop: "auto",
            background:
              plan.ctaStyle === "primary"
                ? `linear-gradient(90deg, ${ORANGE}, ${ORANGE_HOT})`
                : "transparent",
            color: plan.ctaStyle === "primary" ? "#0a0908" : PAPER,
            boxShadow:
              plan.ctaStyle === "primary"
                ? "0 10px 30px -10px rgba(244,93,1,.75)"
                : "none",
            transition: "filter .2s ease, transform .15s ease",
          }}
        >
          {plan.ctaLabel}
        </button>
      </div>
    </>
  );
}

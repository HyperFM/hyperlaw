import { useState, useRef, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { isIosApp } from "../lib/platform";

const ORANGE = "#F45D01";
const ORANGE_HOT = "#FF7A1A";
const PAPER = "#F4EFE8";
const DIM = "#9C948A";
const PANEL = "#141210";
const PANEL2 = "#1b1815";
const LINE = "#2a2521";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const PLAN_ICONS = [
  `${basePath}/plan-icon-0.png`,
  `${basePath}/plan-icon-1.png`,
  `${basePath}/plan-icon-2.png`,
];

// Pro-Say and Apex are removed entirely on iOS (Apple Guideline 3.1.1 — no
// subscription purchase, no mention, no link out inside the iOS build; those
// tiers exist only on hyperlaw.site for web users). See src/lib/platform.ts.
const ALL_PLANS = [
  {
    id: "firstfiling",
    name: "First Filing",
    tagline: "You don't have to be fearless. Doing it afraid is just as brave.",
    price: "Pay As You Go",
    cycle: null as string | null,
    priceNote: "No subscription · credits are spent only as you draft",
    badge: null as string | null,
    quote:
      '"You\'ll make mistakes. That\'s not disqualifying — quitting is. Stay determined and the scale tips your way eventually, even when it doesn\'t look like it yet."',
    features: [
      { text: "<b>Cases, incidents & timelines — always free</b> — build and document everything at no cost", tbd: false },
      { text: "<b>See the price before you draft</b> — every AI document shows a clear credit estimate up front, so you decide before anything is generated", tbd: false },
      { text: "<b>Pay only for what you generate</b> — credits are spent by usage, and never above the estimate we show first", tbd: false },
      { text: "Guided case tutor included — plain-English answers to your legal questions", tbd: false },
      { text: "A document & evidence checklist: keep the camera rolling, save every receipt", tbd: false },
    ],
    ctaLabel: "Start Building Your Case",
    ctaStyle: "secondary" as const,
    signUpPath: "/sign-up",
  },
  {
    id: "prosay",
    name: "Pro-Say Selection",
    tagline: "Say it right, every filing",
    price: "$25",
    cycle: "/ month" as string | null,
    priceNote: "Billed monthly · cancel anytime",
    badge: null as string | null,
    quote:
      '"The law rewards those who show up prepared. Pro-Say gives you every tool to make sure that person is you."',
    features: [
      { text: "<b>Unlimited cases</b> — build and track as many cases as your docket demands", tbd: false },
      { text: "<b>Priority tutor access</b> — no usage caps, full reasoning depth", tbd: false },
      { text: "<b>Document analysis</b> — upload evidence, get structured breakdowns", tbd: false },
      { text: "<b>Factual gap checklist</b> — know exactly what documentation is missing before you file", tbd: false },
      { text: "<b>Advanced reminders</b> — deadline tracking across all your cases", tbd: false },
    ],
    ctaLabel: "Select Pro-Say",
    ctaStyle: "primary" as const,
    signUpPath: "/sign-up",
  },
  {
    id: "apex",
    name: "Apex Litigant",
    tagline: "THE MANEATER PACKAGE — NO CAP",
    price: "$100",
    cycle: "/ month" as string | null,
    priceNote: "Billed monthly · cancel anytime",
    badge: "Full Docket" as string | null,
    quote:
      '"For attorneys, power litigants, and anyone who refuses to leave anything on the table. Sink your teeth into the docket and don\'t let go."',
    features: [
      { text: "<b>Sink your teeth into the docket</b> — unlimited cases, zero throttle, zero apologies", tbd: false },
      { text: "<b>Built for attorneys & power litigants</b> — anyone going for the jugular", tbd: false },
      { text: "<b>Full AI reasoning engine</b> — unlimited depth, zero throttling", tbd: false },
      { text: "<b>Priority everything</b> — support, tutor, document analysis, front of the line", tbd: false },
      { text: "<b>Run your entire practice</b> — fight every battle at once, on your terms", tbd: false },
    ],
    ctaLabel: "Select Apex Litigant",
    ctaStyle: "primary" as const,
    signUpPath: "/sign-up",
  },
];

export default function Plans() {
  const [, navigate] = useLocation();
  const plans = useMemo(
    () => (isIosApp() ? ALL_PLANS.filter((p) => p.id === "firstfiling") : ALL_PLANS),
    [],
  );
  const [activeIndex, setActiveIndex] = useState(isIosApp() ? 0 : 1);
  const startXRef = useRef(0);
  const currentXRef = useRef(0);
  const isDraggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const goTo = useCallback((idx: number) => {
    setActiveIndex(Math.max(0, Math.min(plans.length - 1, idx)));
  }, []);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    isDraggingRef.current = true;
    setIsDragging(true);
    startXRef.current = e.clientX;
    currentXRef.current = e.clientX;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!isDraggingRef.current) return;
    currentXRef.current = e.clientX;
  }

  function onPointerUp() {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    const diff = currentXRef.current - startXRef.current;
    if (Math.abs(diff) > 50) {
      goTo(activeIndex + (diff < 0 ? 1 : -1));
    }
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        background:
          "radial-gradient(ellipse 900px 500px at 50% -10%, rgba(244,93,1,0.14), transparent 60%), linear-gradient(180deg, #0a0908 0%, #0d0b09 100%)",
        padding: "48px 20px 80px",
        overflowX: "hidden",
        fontFamily: "Arial, sans-serif",
        color: PAPER,
      }}
    >
      <div style={{ maxWidth: 520, margin: "0 auto" }}>

        {/* Back button */}
        <button
          onClick={() => navigate("/")}
          style={{
            background: "none", border: "none", color: DIM, cursor: "pointer",
            fontSize: 13, display: "flex", alignItems: "center", gap: 6,
            marginBottom: 28, padding: 0,
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back
        </button>

        {/* Eyebrow */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center", textTransform: "uppercase", letterSpacing: "0.28em", fontSize: 11, color: ORANGE_HOT, fontWeight: 600, marginBottom: 18 }}>
          <span style={{ height: 1, width: 36, background: `linear-gradient(90deg, transparent, ${ORANGE})`, opacity: 0.7, display: "block" }} />
          HyperLaw · Membership
          <span style={{ height: 1, width: 36, background: `linear-gradient(90deg, ${ORANGE}, transparent)`, opacity: 0.7, display: "block" }} />
        </div>

        <h1 style={{ fontWeight: 900, fontStyle: "italic", textTransform: "uppercase", textAlign: "center", fontSize: "clamp(30px, 8vw, 52px)", letterSpacing: "0.01em", lineHeight: 1.02, color: PAPER, margin: "0 0 14px" }}>
          Choose Your <span style={{ color: ORANGE_HOT }}>Standing</span>
        </h1>
        <p style={{ textAlign: "center", color: DIM, fontSize: 14, lineHeight: 1.6, marginBottom: 32 }}>
          Three ways to work the case, from your first filing to a full docket.
          Pick the tier that matches where you're at — upgrade any time.
        </p>

        {/* Swoosh */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
          <svg viewBox="0 0 420 26" style={{ width: "100%", maxWidth: 420, height: 26, filter: "drop-shadow(0 0 6px rgba(244,93,1,.55))" }} preserveAspectRatio="none">
            <path d="M0,20 L360,20 L420,4" stroke={ORANGE} strokeWidth="2.5" fill="none" strokeLinecap="round" />
          </svg>
        </div>

        {/* Swipe hint */}
        <div style={{ textAlign: "center", color: DIM, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
            <path d="M9 18l6-6-6-6" />
          </svg>
          Swipe to browse plans
        </div>

        {/* Carousel */}
        <div style={{ position: "relative", maxWidth: 460, margin: "0 auto" }}>
          <div style={{ overflow: "hidden", borderRadius: 22 }}>
            <div
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{
                display: "flex",
                transform: `translateX(-${activeIndex * 100}%)`,
                transition: isDragging ? "none" : "transform 0.38s cubic-bezier(.22,.9,.32,1)",
                cursor: isDragging ? "grabbing" : "grab",
                userSelect: "none",
              }}
            >
              {plans.map((plan, i) => (
                <div key={plan.id} style={{ flex: "0 0 100%", maxWidth: "100%", padding: 6, paddingTop: 20, display: "flex" }}>
                  <PlanCard
                    plan={plan}
                    iconSrc={PLAN_ICONS[i]}
                    isActive={i === activeIndex}
                    onCta={() => navigate(`${basePath}${plan.signUpPath}`)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Dots */}
          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 20 }}>
            {plans.map((p, i) => (
              <button key={p.id} onClick={() => goTo(i)} style={{ width: 9, height: 9, borderRadius: "50%", border: "none", cursor: "pointer", padding: 0, background: i === activeIndex ? `linear-gradient(90deg, ${ORANGE}, ${ORANGE_HOT})` : LINE, transform: i === activeIndex ? "scale(1.3)" : "scale(1)", boxShadow: i === activeIndex ? `0 0 10px rgba(244,93,1,.7)` : "none", transition: "all 0.25s ease" }} />
            ))}
          </div>

          {/* Arrows */}
          <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 14 }}>
            <button onClick={() => goTo(activeIndex - 1)} disabled={activeIndex === 0} style={{ width: 38, height: 38, borderRadius: "50%", border: `1px solid ${LINE}`, background: PANEL, color: PAPER, cursor: activeIndex === 0 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: activeIndex === 0 ? 0.3 : 1, transition: "all 0.2s ease" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <button onClick={() => goTo(activeIndex + 1)} disabled={activeIndex === plans.length - 1} style={{ width: 38, height: 38, borderRadius: "50%", border: `1px solid ${LINE}`, background: PANEL, color: PAPER, cursor: activeIndex === plans.length - 1 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: activeIndex === plans.length - 1 ? 0.3 : 1, transition: "all 0.2s ease" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}><path d="M9 18l6-6-6-6" /></svg>
            </button>
          </div>
        </div>

        <p style={{ textAlign: "center", color: "#4a4542", fontSize: 11, marginTop: 36, lineHeight: 1.6 }}>
          No subscription required · Pay only for what you use · Cancel paid plans anytime
        </p>
      </div>
    </div>
  );
}

function PlanCard({ plan, iconSrc, isActive, onCta }: {
  plan: typeof ALL_PLANS[number];
  iconSrc: string;
  isActive: boolean;
  onCta: () => void;
}) {
  const glowStyle: React.CSSProperties = isActive
    ? { borderColor: "rgba(255,122,26,.75)", boxShadow: "0 0 0 1px rgba(255,122,26,.35), 0 0 46px -6px rgba(244,93,1,.55), 0 20px 60px -18px rgba(244,93,1,.4)", animation: "glowPulse 2.4s ease-in-out infinite" }
    : {};

  return (
    <>
      <style>{`@keyframes glowPulse { 0%,100%{ box-shadow: 0 0 0 1px rgba(255,122,26,.28), 0 0 30px -8px rgba(244,93,1,.4), 0 20px 60px -18px rgba(244,93,1,.3); } 50%{ box-shadow: 0 0 0 1px rgba(255,122,26,.55), 0 0 54px -6px rgba(244,93,1,.75), 0 20px 60px -18px rgba(244,93,1,.5); } }`}</style>
      <div style={{ position: "relative", width: "100%", background: `linear-gradient(180deg, ${PANEL} 0%, ${PANEL2} 100%)`, border: `1px solid ${plan.id === "apex" ? "rgba(244,93,1,.35)" : LINE}`, borderRadius: 22, padding: "34px 26px 30px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", transition: "border-color .25s ease, box-shadow .35s ease", ...glowStyle }}>

        {plan.badge && (
          <div style={{ position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)", background: `linear-gradient(90deg, ${ORANGE}, ${ORANGE_HOT})`, color: "#0a0908", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", padding: "6px 16px", borderRadius: 999, boxShadow: "0 6px 18px -6px rgba(244,93,1,.7)", whiteSpace: "nowrap" }}>
            {plan.badge}
          </div>
        )}

        <div style={{ width: 128, height: 128, margin: "10px 0 20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img
            src={iconSrc}
            alt={plan.name}
            style={{ width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(0 0 20px rgba(244,93,1,.4))", userSelect: "none" }}
            draggable={false}
          />
        </div>

        <div style={{ fontWeight: 900, fontStyle: "italic", textTransform: "uppercase", fontSize: 24, letterSpacing: "0.01em", color: PAPER }}>{plan.name}</div>
        <div style={{ color: ORANGE_HOT, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 600, marginTop: 6, minHeight: 16 }}>{plan.tagline}</div>

        <div style={{ margin: "22px 0 4px", display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 40 }}>{plan.price}</span>
          {plan.cycle && <span style={{ color: DIM, fontSize: 14 }}>{plan.cycle}</span>}
        </div>
        <div style={{ color: DIM, fontSize: 12, marginBottom: isIosApp() && plan.id === "firstfiling" ? 6 : 20 }}>{plan.priceNote}</div>
        {isIosApp() && plan.id === "firstfiling" && (
          <div style={{ color: ORANGE_HOT, fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 20 }}>
            In-App Purchase
          </div>
        )}

        <p style={{ fontStyle: "italic", fontSize: 12.5, color: "#DAD3C9", lineHeight: 1.55, padding: "12px 6px 16px", borderTop: `1px solid ${LINE}`, marginTop: 2, marginBottom: 6, width: "100%" }}>{plan.quote}</p>
        <div style={{ width: "100%", height: 1, background: LINE, margin: "4px 0 20px" }} />

        <ul style={{ listStyle: "none", width: "100%", textAlign: "left", display: "flex", flexDirection: "column", gap: 11, marginBottom: 26, flex: 1, padding: 0 }}>
          {plan.features.map((f, i) => (
            <li key={i} style={{ display: "flex", gap: 9, fontSize: 13.5, lineHeight: 1.42, color: f.tbd ? DIM : "#DAD3C9", fontStyle: f.tbd ? "italic" : "normal" }}>
              <span style={{ flexShrink: 0, color: f.tbd ? DIM : undefined }}>{f.tbd ? "○" : "✓"}</span>
              <span dangerouslySetInnerHTML={{ __html: f.text.replace(/<b>/g, `<strong style="color:${PAPER};font-weight:600">`).replace(/<\/b>/g, "</strong>") }} />
            </li>
          ))}
        </ul>

        <button onClick={onCta} style={{ width: "100%", padding: "14px 18px", borderRadius: 12, border: plan.ctaStyle === "primary" ? "none" : `1px solid ${LINE}`, cursor: "pointer", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 13.5, marginTop: "auto", background: plan.ctaStyle === "primary" ? `linear-gradient(90deg, ${ORANGE}, ${ORANGE_HOT})` : "transparent", color: plan.ctaStyle === "primary" ? "#0a0908" : PAPER, boxShadow: plan.ctaStyle === "primary" ? "0 10px 30px -10px rgba(244,93,1,.75)" : "none", transition: "filter .2s ease, transform .15s ease" }}>
          {plan.ctaLabel}
        </button>
      </div>
    </>
  );
}

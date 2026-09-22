import { useState } from "react";

const ORANGE = "#F45D01";

/** Shown once, right after a brand-new account finishes registering on the
 *  website (never in the native app — the app wrapper doesn't register
 *  accounts at all, see AuthPages.tsx's isIosApp() gate). A short tap-through
 *  walkthrough of what HyperLaw does, ending on the one thing new members
 *  most need spelled out: the app is a member-only, no-paywall view of the
 *  same account — any plan change or billing question always comes back
 *  here to the website. */

interface Step {
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    title: "You're in",
    body: "Quick 60-second tour before you start — here's what HyperLaw does and where everything lives.",
  },
  {
    title: "Cases, incidents & timelines",
    body: "Build and document your case for free — no cost to organize evidence, log incidents, or track your timeline.",
  },
  {
    title: "AI drafting, priced up front",
    body: "Every AI-generated document shows a clear credit estimate before anything is created. You decide first, and you never pay above what's shown.",
  },
  {
    title: "Exhibit Studio",
    body: "Turn raw footage and evidence into exhibits — AI finds the moments that matter and builds the screens for you.",
  },
  {
    title: "There's an app, too",
    body: "HyperLaw is also on the App Store — a sleek, faster view of your account for members. Sign in there with the account you just made.",
  },
  {
    title: "One thing to remember",
    body: "Plan changes, subscriptions, and billing are always handled here on hyperlaw.site — never in the app. The app is just a streamlined view for existing members, not where membership is managed.",
    highlight: true,
  } as Step & { highlight?: boolean },
];

export default function WelcomeTour({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const [visible, setVisible] = useState(true);
  const step = STEPS[i];
  const isLast = i === STEPS.length - 1;
  const isHighlight = (step as { highlight?: boolean }).highlight === true;

  function close() {
    setVisible(false);
    setTimeout(onDone, 220);
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.88)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        opacity: visible ? 1 : 0, transition: "opacity 220ms ease",
      }}
    >
      <div
        style={{
          width: "100%", maxWidth: 420, background: "#111", borderRadius: 20,
          border: `1px solid ${isHighlight ? ORANGE : "#242424"}`, padding: 28,
          transform: visible ? "translateY(0)" : "translateY(12px)", transition: "transform 220ms ease",
        }}
      >
        <div style={{ display: "flex", gap: 6, marginBottom: 22 }}>
          {STEPS.map((_, idx) => (
            <div key={idx} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: idx <= i ? ORANGE : "#2a2a2a",
            }} />
          ))}
        </div>

        {isHighlight && (
          <div style={{
            display: "inline-block", fontSize: 11, fontWeight: 800, letterSpacing: "0.06em",
            textTransform: "uppercase", color: ORANGE, background: `${ORANGE}18`,
            border: `1px solid ${ORANGE}44`, borderRadius: 999, padding: "4px 10px", marginBottom: 12,
          }}>
            Good to know
          </div>
        )}

        <h2 style={{ color: "#f4efe8", fontSize: 22, fontWeight: 800, margin: "0 0 10px" }}>{step.title}</h2>
        <p style={{ color: "#9c948a", fontSize: 14.5, lineHeight: 1.6, margin: "0 0 26px" }}>{step.body}</p>

        <div style={{ display: "flex", gap: 10 }}>
          {i > 0 && (
            <button
              onClick={() => setI(v => v - 1)}
              style={{
                flex: 1, padding: "13px 16px", borderRadius: 12, border: "1px solid #2a2a2a",
                background: "none", color: "#9c948a", fontWeight: 700, fontSize: 14, cursor: "pointer",
              }}
            >
              Back
            </button>
          )}
          <button
            onClick={() => (isLast ? close() : setI(v => v + 1))}
            style={{
              flex: 2, padding: "13px 16px", borderRadius: 12, border: "none",
              background: `linear-gradient(90deg, ${ORANGE}, #f45d01)`, color: "#000",
              fontWeight: 800, fontSize: 14.5, cursor: "pointer",
            }}
          >
            {isLast ? "Got it" : "Next"}
          </button>
        </div>
        {!isLast && (
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <span onClick={close} style={{ color: "#555", fontSize: 12.5, cursor: "pointer" }}>Skip tour</span>
          </div>
        )}
      </div>
    </div>
  );
}

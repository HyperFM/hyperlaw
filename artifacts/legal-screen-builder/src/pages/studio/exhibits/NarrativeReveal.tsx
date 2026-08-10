import React from "react";
import { renderExhibitIcon } from "./icons";
import { HyperLawTheme } from "./theme";
import { NarrativeRevealLayout } from "./exhibitLayoutSchemas";
import { z } from "zod";

type Props = {
  data: z.infer<typeof NarrativeRevealLayout>;
  orientation?: "square" | "portrait";
};

const { orange, white, gray, grayLight, black } = HyperLawTheme;

export const NarrativeReveal: React.FC<Props> = ({ data, orientation = "square" }) => {
  const dimensions =
    orientation === "portrait"
      ? { width: 1080, height: 1920 }
      : { width: 1254, height: 1254 };

  // Split text around a highlighted fragment
  function renderWithHighlight(text: string, fragment?: string) {
    if (!fragment) return <>{text}</>;
    const parts = text.split(fragment);
    return (
      <>
        {parts.map((part, i) => (
          <React.Fragment key={i}>
            {part}
            {i < parts.length - 1 && (
              <span style={{ color: orange }}>{fragment}</span>
            )}
          </React.Fragment>
        ))}
      </>
    );
  }

  function renderWithBold(text: string, bold?: string) {
    if (!bold) return <>{text}</>;
    const parts = text.split(bold);
    return (
      <>
        {parts.map((part, i) => (
          <React.Fragment key={i}>
            {part}
            {i < parts.length - 1 && (
              <strong style={{ color: white }}>{bold}</strong>
            )}
          </React.Fragment>
        ))}
      </>
    );
  }

  return (
    <div
      style={{
        width: dimensions.width,
        height: dimensions.height,
        backgroundColor: black,
        border: `3px solid ${orange}`,
        borderRadius: 12,
        padding: "48px 56px",
        boxSizing: "border-box",
        fontFamily: "'Arial Black', 'Helvetica Neue', sans-serif",
        color: white,
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Left accent bar */}
      <div style={{ position: "absolute", left: 16, top: 48, bottom: 48, width: 6, backgroundColor: orange, borderRadius: 3 }} />

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginLeft: 24 }}>
        <div>
          <div style={{ color: orange, fontSize: 22, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase" }}>
            {data.header.actor}
          </div>
          <div style={{ color: gray, fontSize: 15, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginTop: 4 }}>
            {data.header.category}
          </div>
        </div>
        <div style={{ color: gray, fontSize: 36, fontWeight: 900 }}>{data.header.badgeNumber}</div>
      </div>

      {/* Headline */}
      <div style={{ marginLeft: 24, marginTop: 20 }}>
        {data.headline.map((line, i) => (
          <div
            key={i}
            style={{
              fontSize: 52,
              fontWeight: 900,
              lineHeight: 1.05,
              textTransform: "uppercase",
              color: i === data.headline.length - 1 ? orange : white,
              letterSpacing: -1,
            }}
          >
            {line}
          </div>
        ))}
      </div>

      {/* Orange rule */}
      <div style={{ height: 2, backgroundColor: orange, marginLeft: 24, marginTop: 20, marginBottom: 20, width: "70%" }} />

      {/* Known facts */}
      <div style={{ marginLeft: 24, display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
        {data.facts.map((fact, i) => (
          <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <div style={{ width: 26, height: 26, flexShrink: 0, marginTop: 2 }}>
              {renderExhibitIcon(fact.icon, gray)}
            </div>
            <div style={{ fontSize: 17, fontWeight: 400, color: grayLight, lineHeight: 1.5 }}>
              {fact.text.text}
            </div>
          </div>
        ))}
      </div>

      {/* Pivot quote — the "reveal" */}
      <div
        style={{
          marginLeft: 24,
          marginTop: 20,
          background: "#141414",
          borderLeft: `5px solid ${orange}`,
          borderRadius: "0 10px 10px 0",
          padding: "18px 22px",
        }}
      >
        <div style={{ fontSize: 12, color: gray, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
          {data.pivotQuote.leadIn}
        </div>
        <div style={{ color: orange, fontSize: 36, lineHeight: 1, fontWeight: 900, marginBottom: 4 }}>"</div>
        <div style={{ fontSize: 21, fontWeight: 800, color: white, lineHeight: 1.38 }}>
          {renderWithHighlight(data.pivotQuote.text, data.pivotQuote.highlightedFragment)}
        </div>
      </div>

      {/* CTA label */}
      <div style={{ marginLeft: 24, marginTop: 14, display: "flex" }}>
        <div
          style={{
            border: `2px solid ${orange}`,
            borderRadius: 6,
            padding: "8px 18px",
            fontSize: 13,
            fontWeight: 900,
            color: orange,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          ▶ {data.ctaLabel}
        </div>
      </div>

      {/* Closing paragraph */}
      <div style={{ marginLeft: 24, marginTop: 12, fontSize: 14, color: gray, lineHeight: 1.55, fontWeight: 400 }}>
        {renderWithBold(data.closingParagraph.text, data.closingParagraph.boldFragment)}
      </div>

      {/* Footer citations */}
      <div style={{ marginLeft: 24, marginTop: 14, fontSize: 14, fontWeight: 700, color: orange, letterSpacing: 0.5 }}>
        {data.footerCitations.join("  •  ")}
      </div>
    </div>
  );
};

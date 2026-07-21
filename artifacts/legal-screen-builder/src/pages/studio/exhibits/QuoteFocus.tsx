import React from "react";
import { HyperLawTheme } from "./theme";
import { QuoteFocusLayout } from "./exhibitLayoutSchemas";
import { z } from "zod";

type Props = {
  data: z.infer<typeof QuoteFocusLayout>;
  orientation?: "square" | "portrait";
};

const { orange, white, gray, grayLight, black, divider } = HyperLawTheme;

const classificationColor = (c: string) =>
  c === "verified_fact" ? "#22c55e" : c === "observation" ? orange : "#ef4444";

export const QuoteFocus: React.FC<Props> = ({ data, orientation = "square" }) => {
  const dimensions =
    orientation === "portrait"
      ? { width: 1080, height: 1920 }
      : { width: 1254, height: 1254 };

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
              fontSize: 50,
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
      <div style={{ height: 2, backgroundColor: orange, marginLeft: 24, marginTop: 20, marginBottom: 22, width: "70%" }} />

      {/* Dominant quote — the hero element */}
      <div
        style={{
          marginLeft: 24,
          background: "#0f0f0f",
          border: `1px solid ${orange}44`,
          borderRadius: 12,
          padding: "28px 32px",
          position: "relative",
        }}
      >
        {/* Large decorative open-quote */}
        <div
          style={{
            position: "absolute",
            top: -8,
            left: 20,
            fontSize: 120,
            lineHeight: 1,
            color: orange,
            fontWeight: 900,
            opacity: 0.25,
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          "
        </div>
        <div
          style={{
            fontSize: 30,
            fontWeight: 900,
            color: white,
            lineHeight: 1.3,
            position: "relative",
            zIndex: 1,
          }}
        >
          "{data.dominantQuote.text}"
        </div>
        <div style={{ marginTop: 12, fontSize: 13, color: gray, fontWeight: 700, letterSpacing: 0.5 }}>
          — {data.dominantQuote.source.ref}
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, backgroundColor: divider, marginLeft: 24, marginTop: 20, marginBottom: 16 }} />

      {/* Context items */}
      <div style={{ marginLeft: 24, display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        {data.context.map((item, i) => (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: classificationColor(item.classification),
                flexShrink: 0,
                marginTop: 7,
              }}
            />
            <div style={{ fontSize: 16, color: grayLight, lineHeight: 1.5, fontWeight: 400 }}>
              {item.text}
            </div>
          </div>
        ))}
      </div>

      {/* Implication */}
      <div
        style={{
          marginLeft: 24,
          marginTop: 18,
          border: `2px solid ${data.implication.phrasedAsQuestion ? orange : "#2a2a2a"}`,
          borderRadius: 8,
          padding: "13px 18px",
          background: data.implication.phrasedAsQuestion ? `${orange}0d` : "#111",
        }}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: data.implication.phrasedAsQuestion ? orange : grayLight,
            lineHeight: 1.45,
          }}
        >
          {data.implication.text}
        </div>
      </div>

      {/* Footer citations */}
      <div style={{ marginLeft: 24, marginTop: 14, fontSize: 14, fontWeight: 700, color: orange, letterSpacing: 0.5 }}>
        {data.footerCitations.join("  •  ")}
      </div>
    </div>
  );
};

import React from "react";
import { HyperLawTheme } from "./theme";
import { SummaryBoardLayout } from "./exhibitLayoutSchemas";
import { z } from "zod";

type Props = {
  data: z.infer<typeof SummaryBoardLayout>;
  orientation?: "square" | "portrait";
};

const { orange, white, gray, grayLight, black, divider } = HyperLawTheme;

export const SummaryBoard: React.FC<Props> = ({ data, orientation = "square" }) => {
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
      <div style={{ height: 2, backgroundColor: orange, marginLeft: 24, marginTop: 20, marginBottom: 20, width: "70%" }} />

      {/* Recap points */}
      <div style={{ marginLeft: 24, flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
        {data.recapPoints.map((point, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 14,
              alignItems: "flex-start",
              background: "#111",
              border: "1px solid #1e1e1e",
              borderRadius: 10,
              padding: "14px 16px",
            }}
          >
            {/* Exhibit ref badge */}
            <div
              style={{
                flexShrink: 0,
                background: `${orange}1a`,
                border: `1px solid ${orange}55`,
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 12,
                fontWeight: 900,
                color: orange,
                letterSpacing: 0.3,
                textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}
            >
              {point.exhibitRef}
            </div>
            <div style={{ fontSize: 16, color: grayLight, lineHeight: 1.5, fontWeight: 400, flex: 1 }}>
              {point.summary}
            </div>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div style={{ height: 1, backgroundColor: divider, marginLeft: 24, marginTop: 18, marginBottom: 16 }} />

      {/* Final takeaway */}
      <div
        style={{
          marginLeft: 24,
          border: `2px solid ${orange}`,
          borderRadius: 8,
          padding: "16px 20px",
          background: `${orange}0d`,
        }}
      >
        <div style={{ fontSize: 11, color: orange, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
          Final Takeaway
        </div>
        {data.finalTakeaway.lines.map((line, i) => (
          <div
            key={i}
            style={{
              fontSize: i === 0 ? 19 : 15,
              fontWeight: i === 0 ? 900 : 400,
              color: i === 0 ? white : gray,
              lineHeight: 1.45,
              marginBottom: i < data.finalTakeaway.lines.length - 1 ? 6 : 0,
            }}
          >
            {line}
          </div>
        ))}
      </div>

      {/* Footer citations */}
      <div style={{ marginLeft: 24, marginTop: 14, fontSize: 14, fontWeight: 700, color: orange, letterSpacing: 0.5 }}>
        {data.footerCitations.join("  •  ")}
      </div>
    </div>
  );
};

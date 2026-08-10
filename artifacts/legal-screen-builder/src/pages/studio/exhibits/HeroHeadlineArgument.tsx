import React from "react";
import { ExhibitIcons, renderExhibitIcon } from "./icons";
import { HyperLawTheme } from "./theme";
import { HeroHeadlineLayout } from "./exhibitLayoutSchemas";
import { z } from "zod";

type HeroArgumentProps = {
  data: z.infer<typeof HeroHeadlineLayout>;
  orientation?: "square" | "portrait";
};

const { orange, white, gray, grayLight, black, divider } = HyperLawTheme;

export const HeroHeadlineArgument: React.FC<HeroArgumentProps> = ({
  data,
  orientation = "square",
}) => {
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
        <div style={{ color: gray, fontSize: 36, fontWeight: 900 }}>
          {data.header.badgeNumber}
        </div>
      </div>

      {/* Headline */}
      <div style={{ marginLeft: 24, marginTop: 20 }}>
        {data.headline.map((line, i) => (
          <div
            key={i}
            style={{
              fontSize: 58,
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
      <div style={{ height: 2, backgroundColor: orange, marginLeft: 24, marginTop: 24, marginBottom: 24, width: "70%" }} />

      {/* Quote */}
      <div style={{ marginLeft: 24, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ color: orange, fontSize: 48, lineHeight: 1, fontWeight: 900 }}>"</div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.3, color: white }}>
              {data.quote.text}
            </div>
            {data.quote.contextNote && (
              <div style={{ fontSize: 15, color: gray, marginTop: 10, fontWeight: 400 }}>
                {data.quote.contextNote}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, backgroundColor: divider, marginLeft: 24, marginBottom: 20 }} />

      {/* Findings */}
      <div style={{ marginLeft: 24, display: "flex", flexDirection: "column", gap: 18, flex: 1 }}>
        {data.findings.map((finding, i) => (
          <div key={i} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            <div style={{ width: 32, height: 32, flexShrink: 0 }}>
              {renderExhibitIcon(finding.icon, orange)}
            </div>
            <div>
              <div style={{ fontSize: 19, fontWeight: 800, color: white, lineHeight: 1.3 }}>
                {finding.title}
              </div>
              <div style={{ fontSize: 16, fontWeight: 400, color: grayLight, lineHeight: 1.4, marginTop: 2 }}>
                {finding.body.text}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Conclusion box */}
      <div
        style={{
          marginLeft: 24,
          marginTop: 20,
          border: `2px solid ${orange}`,
          borderRadius: 8,
          padding: "16px 20px",
          display: "flex",
          gap: 16,
          alignItems: "flex-start",
        }}
      >
        <div style={{ width: 40, height: 40, flexShrink: 0 }}>
          {ExhibitIcons.scale(orange)}
        </div>
        <div>
          {data.conclusion.lines.map((line, i) => (
            <div
              key={i}
              style={{
                fontSize: 18,
                fontWeight: i === data.conclusion.lines.length - 1 ? 400 : 900,
                color: i === 1 ? orange : white,
                lineHeight: 1.4,
              }}
            >
              {line}
            </div>
          ))}
        </div>
      </div>

      {/* Footer citations */}
      <div style={{ marginLeft: 24, marginTop: 16, fontSize: 14, fontWeight: 700, color: orange, letterSpacing: 0.5 }}>
        {data.footerCitations.join("  •  ")}
      </div>
    </div>
  );
};

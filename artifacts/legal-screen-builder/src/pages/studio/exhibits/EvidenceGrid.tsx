import React from "react";
import { ExhibitIcons, ExhibitIconKey } from "./icons";
import { HyperLawTheme } from "./theme";
import { EvidenceGridLayout } from "./exhibitLayoutSchemas";
import { z } from "zod";

type Props = {
  data: z.infer<typeof EvidenceGridLayout>;
  orientation?: "square" | "portrait";
};

const { orange, white, gray, grayLight, black } = HyperLawTheme;

export const EvidenceGrid: React.FC<Props> = ({ data, orientation = "square" }) => {
  const dimensions =
    orientation === "portrait"
      ? { width: 1080, height: 1920 }
      : { width: 1254, height: 1254 };

  // Lay items out in a 2-column grid for square, single column for portrait
  const cols = orientation === "portrait" ? 1 : 2;

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

      {/* Evidence grid */}
      <div
        style={{
          marginLeft: 24,
          flex: 1,
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 12,
          alignContent: "start",
        }}
      >
        {data.items.map((item, i) => (
          <div
            key={i}
            style={{
              background: "#111",
              border: "1px solid #1e1e1e",
              borderRadius: 10,
              padding: "14px 16px",
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                flexShrink: 0,
                background: "#181818",
                borderRadius: 7,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 5,
              }}
            >
              {ExhibitIcons[item.icon as ExhibitIconKey](
                item.icon === "x" ? "#ef4444" : item.icon === "check" ? "#22c55e" : orange
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: white, lineHeight: 1.3, marginBottom: 4 }}>
                {item.label}
              </div>
              <div style={{ fontSize: 11, color: gray, fontWeight: 700, letterSpacing: 0.3 }}>
                {item.source.origin.replace("_", " ")} · {item.source.ref}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Conclusion */}
      <div
        style={{
          marginLeft: 24,
          marginTop: 18,
          border: `2px solid ${orange}`,
          borderRadius: 8,
          padding: "13px 18px",
          background: `${orange}0d`,
        }}
      >
        {data.conclusion.lines.map((line, i) => (
          <div
            key={i}
            style={{
              fontSize: 16,
              fontWeight: i === 0 ? 900 : 400,
              color: i === 0 ? white : grayLight,
              lineHeight: 1.45,
              marginBottom: i < data.conclusion.lines.length - 1 ? 4 : 0,
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

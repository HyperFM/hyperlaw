import React from "react";
import { HyperLawTheme } from "./theme";
import { TimelineLayout } from "./exhibitLayoutSchemas";
import { z } from "zod";

type Props = {
  data: z.infer<typeof TimelineLayout>;
  orientation?: "square" | "portrait";
};

const { orange, white, gray, grayLight, black } = HyperLawTheme;

const classificationColor = (c: string) =>
  c === "verified_fact" ? "#22c55e" : c === "observation" ? orange : "#ef4444";

export const Timeline: React.FC<Props> = ({ data, orientation = "square" }) => {
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
          <div style={{ color: gray, fontSize: 22, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginTop: 4 }}>
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

      {/* Timeline events */}
      <div style={{ marginLeft: 24, flex: 1, display: "flex", flexDirection: "column", gap: 0, position: "relative" }}>
        {/* Vertical spine */}
        <div
          style={{
            position: "absolute",
            left: 15,
            top: 10,
            bottom: 10,
            width: 2,
            background: `linear-gradient(to bottom, ${orange}, ${orange}44)`,
          }}
        />

        {data.events.map((event, i) => (
          <div key={i} style={{ display: "flex", gap: 0, alignItems: "flex-start", marginBottom: i < data.events.length - 1 ? 18 : 0 }}>
            {/* Node */}
            <div style={{ width: 32, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  border: `2px solid ${classificationColor(event.detail.classification)}`,
                  background: black,
                  marginTop: 4,
                  flexShrink: 0,
                  zIndex: 1,
                  position: "relative",
                }}
              />
            </div>

            {/* Content */}
            <div style={{ flex: 1, paddingLeft: 14 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
                <div style={{ fontSize: 21, fontWeight: 900, color: orange, textTransform: "uppercase", letterSpacing: 0.3 }}>
                  {event.label}
                </div>
                {event.timestamp && (
                  <div style={{ fontSize: 26, color: gray, fontWeight: 700 }}>{event.timestamp}</div>
                )}
              </div>
              <div style={{ fontSize: 23, color: grayLight, lineHeight: 1.5, fontWeight: 400 }}>
                {event.detail.text}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Conclusion */}
      <div
        style={{
          marginLeft: 24,
          marginTop: 20,
          border: `2px solid ${orange}`,
          borderRadius: 8,
          padding: "14px 20px",
          background: `${orange}0d`,
        }}
      >
        {data.conclusion.lines.map((line, i) => (
          <div
            key={i}
            style={{
              fontSize: 23,
              fontWeight: i === 0 ? 900 : 400,
              color: i === 0 ? white : gray,
              lineHeight: 1.45,
              marginBottom: i < data.conclusion.lines.length - 1 ? 4 : 0,
            }}
          >
            {line}
          </div>
        ))}
      </div>

      {/* Footer citations */}
      <div style={{ marginLeft: 24, marginTop: 14, fontSize: 21, fontWeight: 700, color: orange, letterSpacing: 0.5 }}>
        {data.footerCitations.join("  •  ")}
      </div>
    </div>
  );
};

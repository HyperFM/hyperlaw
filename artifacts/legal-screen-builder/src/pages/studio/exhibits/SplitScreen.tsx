import React from "react";
import { HyperLawTheme } from "./theme";
import { SplitScreenLayout } from "./exhibitLayoutSchemas";
import { z } from "zod";

type Props = {
  data: z.infer<typeof SplitScreenLayout>;
  orientation?: "square" | "portrait";
};

const { orange, white, gray, grayLight, black } = HyperLawTheme;

const classificationColor = (c: string) =>
  c === "verified_fact" ? "#22c55e" : c === "observation" ? orange : "#ef4444";

const classificationLabel = (c: string) =>
  c === "verified_fact" ? "Verified" : c === "observation" ? "Observation" : "Speculation";

export const SplitScreen: React.FC<Props> = ({ data, orientation = "square" }) => {
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

      {/* Split panels */}
      <div style={{ marginLeft: 24, flex: 1, display: "flex", gap: 0, minHeight: 0 }}>

        {/* Left panel */}
        <div
          style={{
            flex: 1,
            background: "#111",
            border: "1px solid #222",
            borderRadius: "10px 0 0 10px",
            padding: "22px 24px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              fontSize: 26,
              fontWeight: 900,
              color: gray,
              letterSpacing: 1,
              textTransform: "uppercase",
              marginBottom: 12,
              paddingBottom: 10,
              borderBottom: "1px solid #2a2a2a",
            }}
          >
            {data.leftSide.label}
          </div>
          <div style={{ fontSize: 25, fontWeight: 400, color: grayLight, lineHeight: 1.6, flex: 1 }}>
            {data.leftSide.content.text}
          </div>
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 7 }}>
            <div
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: classificationColor(data.leftSide.content.classification),
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 25, color: gray, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {classificationLabel(data.leftSide.content.classification)}
            </span>
          </div>
        </div>

        {/* VS divider */}
        <div
          style={{
            width: 48,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#0d0d0d",
          }}
        >
          <div style={{ flex: 1, width: 1, background: "#2a2a2a" }} />
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              border: `2px solid ${orange}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 25,
              fontWeight: 900,
              color: orange,
              margin: "12px 0",
              flexShrink: 0,
              background: black,
            }}
          >
            VS
          </div>
          <div style={{ flex: 1, width: 1, background: "#2a2a2a" }} />
        </div>

        {/* Right panel */}
        <div
          style={{
            flex: 1,
            background: "#111",
            border: `1px solid ${orange}44`,
            borderRadius: "0 10px 10px 0",
            padding: "22px 24px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              fontSize: 26,
              fontWeight: 900,
              color: orange,
              letterSpacing: 1,
              textTransform: "uppercase",
              marginBottom: 12,
              paddingBottom: 10,
              borderBottom: `1px solid ${orange}33`,
            }}
          >
            {data.rightSide.label}
          </div>
          <div style={{ fontSize: 25, fontWeight: 400, color: white, lineHeight: 1.6, flex: 1 }}>
            {data.rightSide.content.text}
          </div>
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 7 }}>
            <div
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: classificationColor(data.rightSide.content.classification),
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 25, color: gray, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {classificationLabel(data.rightSide.content.classification)}
            </span>
          </div>
        </div>
      </div>

      {/* Takeaway bar */}
      <div
        style={{
          marginLeft: 24,
          marginTop: 18,
          border: `2px solid ${data.takeaway.phrasedAsQuestion ? orange : "#2a2a2a"}`,
          borderRadius: 8,
          padding: "14px 20px",
          background: data.takeaway.phrasedAsQuestion ? `${orange}12` : "#0d0d0d",
        }}
      >
        <div
          style={{
            fontSize: 24,
            fontWeight: 800,
            color: data.takeaway.phrasedAsQuestion ? orange : grayLight,
            lineHeight: 1.45,
          }}
        >
          {data.takeaway.text}
        </div>
      </div>

      {/* Footer citations */}
      <div style={{ marginLeft: 24, marginTop: 14, fontSize: 21, fontWeight: 700, color: orange, letterSpacing: 0.5 }}>
        {data.footerCitations.join("  •  ")}
      </div>
    </div>
  );
};

import React from "react";
import { renderExhibitIcon } from "./icons";
import { HyperLawTheme } from "./theme";
import { QuestionBoardLayout } from "./exhibitLayoutSchemas";
import { z } from "zod";

type Props = {
  data: z.infer<typeof QuestionBoardLayout>;
  orientation?: "square" | "portrait";
};

const { orange, white, gray, grayLight, black } = HyperLawTheme;

const classificationDot = (c: string) => ({
  width: 8,
  height: 8,
  borderRadius: "50%",
  flexShrink: 0 as const,
  marginTop: 6,
  background: c === "verified_fact" ? "#22c55e" : c === "observation" ? orange : "#ef4444",
});

export const QuestionBoard: React.FC<Props> = ({ data, orientation = "square" }) => {
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
              fontSize: 46,
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
      <div style={{ height: 2, backgroundColor: orange, marginLeft: 24, marginTop: 18, marginBottom: 18, width: "70%" }} />

      {/* Two-column body */}
      <div style={{ marginLeft: 24, flex: 1, display: "flex", gap: 22, minHeight: 0 }}>

        {/* LEFT COLUMN */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>

          {/* Steps */}
          {data.leftColumn.steps.map((step, i) => (
            <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  flexShrink: 0,
                  background: "#181818",
                  border: "1px solid #2a2a2a",
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 5,
                }}
              >
                {renderExhibitIcon(step.icon, orange)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 25, fontWeight: 900, color: orange, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  {step.label}
                </div>
                <div style={{ fontSize: 22, color: grayLight, lineHeight: 1.5, fontWeight: 400 }}>
                  {step.quote.text}
                </div>
              </div>
            </div>
          ))}

          {/* Question box — focal point */}
          <div
            style={{
              flex: 1,
              marginTop: data.leftColumn.steps.length > 0 ? 6 : 0,
              border: `2px solid ${orange}`,
              borderRadius: 10,
              padding: "18px 20px",
              background: `${orange}0d`,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ fontSize: 25, color: gray, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
              The Question
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: orange, lineHeight: 1.35, flex: 1 }}>
              {data.leftColumn.questionBox.prompt}
            </div>
            <div style={{ height: 1, background: `${orange}44`, margin: "12px 0" }} />
            <div style={{ fontSize: 21, color: white, lineHeight: 1.5, fontWeight: 400 }}>
              {data.leftColumn.questionBox.answer}
            </div>
          </div>
        </div>

        {/* Vertical divider */}
        <div style={{ width: 1, background: "#2a2a2a", flexShrink: 0 }} />

        {/* RIGHT COLUMN */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ fontSize: 20, color: gray, lineHeight: 1.55, marginBottom: 14, fontWeight: 400 }}>
            {data.rightColumn.intro}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
            {data.rightColumn.checklist.map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={classificationDot(item.classification)} />
                <div style={{ fontSize: 22, color: grayLight, lineHeight: 1.5, fontWeight: 400 }}>
                  {item.text}
                </div>
              </div>
            ))}
          </div>

          {/* Closing highlight */}
          <div
            style={{
              marginTop: 14,
              padding: "13px 16px",
              background: "#111",
              borderRadius: 8,
              border: "1px solid #222",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 900, color: orange, lineHeight: 1.4 }}>
              {data.rightColumn.closingHighlight}
            </div>
          </div>
        </div>
      </div>

      {/* Footer citations */}
      <div style={{ marginLeft: 24, marginTop: 16, fontSize: 21, fontWeight: 700, color: orange, letterSpacing: 0.5 }}>
        {data.footerCitations.join("  •  ")}
      </div>
    </div>
  );
};

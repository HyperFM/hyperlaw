import React from "react";
import { HyperLawTheme } from "./theme";
import { TestimonyCardLayout } from "./exhibitLayoutSchemas";
import { z } from "zod";

type Props = {
  data: z.infer<typeof TestimonyCardLayout>;
};

const { orange, white, gray, black } = HyperLawTheme;

// Renders natively at 1920×1080 — unlike every other exhibit layout, this
// one is NOT designed at 1254×1254. It's a widescreen title card meant to
// match a video timeline's own aspect ratio, so ExhibitRenderer.tsx and
// renderAIExhibitSlide.tsx both special-case this layout to skip the usual
// square-then-letterbox treatment.
export const TestimonyCard: React.FC<Props> = ({ data }) => {
  const titleLen = data.title.length;
  const titleFontSize =
    titleLen > 160 ? 52 :
    titleLen > 110 ? 64 :
    titleLen > 70  ? 82 :
    titleLen > 40  ? 104 : 128;

  return (
    <div
      style={{
        width: 1920,
        height: 1080,
        backgroundColor: black,
        boxSizing: "border-box",
        position: "relative",
        fontFamily: "'Arial Black', 'Helvetica Neue', sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Thin solid orange vertical bar down the far left edge */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 10, backgroundColor: orange }} />

      <div style={{ position: "absolute", left: 64, right: 56, top: 48, bottom: 0, display: "flex", flexDirection: "column" }}>
        {/* Header row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ color: orange, fontSize: 40, fontWeight: 900, letterSpacing: 1.5, textTransform: "uppercase" }}>
            {data.speakerName}
          </div>
          <div style={{ color: gray, fontSize: 40, fontWeight: 900, letterSpacing: 1, flexShrink: 0, marginLeft: 24 }}>
            {data.cardNumber}
          </div>
        </div>

        {/* Thin gray divider under the header row */}
        <div style={{ height: 1, backgroundColor: "#3A3A3A", marginTop: 20 }} />

        {/* Main title — the dominant, centered element */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 36, padding: "0 24px" }}>
          <div
            style={{
              color: white,
              fontSize: titleFontSize,
              fontWeight: 900,
              lineHeight: 1.12,
              textAlign: "center",
              overflowWrap: "break-word",
              wordBreak: "break-word",
            }}
          >
            {data.title}
          </div>

          {data.quote && (
            <div
              style={{
                color: gray,
                fontSize: 32,
                fontWeight: 700,
                fontStyle: "italic",
                textAlign: "center",
                maxWidth: "82%",
                lineHeight: 1.4,
              }}
            >
              &ldquo;{data.quote}&rdquo;
            </div>
          )}
        </div>

        {/* Bottom-left dim brand mark */}
        <div style={{ paddingBottom: 40, color: "#3A3A3A", fontSize: 20, fontWeight: 900, letterSpacing: 2 }}>
          HYPERLAW
        </div>
      </div>
    </div>
  );
};

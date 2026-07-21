import React from "react";
import { HeroHeadlineArgument } from "./HeroHeadlineArgument";
import { NarrativeReveal } from "./NarrativeReveal";
import { QuestionBoard } from "./QuestionBoard";
import { SplitScreen } from "./SplitScreen";
import { Timeline } from "./Timeline";
import { QuoteFocus } from "./QuoteFocus";
import { EvidenceGrid } from "./EvidenceGrid";
import { SummaryBoard } from "./SummaryBoard";

// Native design dimensions — all 8 layout components are built at this size
const NATIVE_W = 1920;
const NATIVE_H = 1080;

interface ExhibitRendererProps {
  /** The raw content object returned by the AI — typed loosely to avoid Zod in shared types */
  content: Record<string, unknown>;
  /**
   * Scale factor to apply to the native 1920×1080 canvas.
   * e.g. 0.18 renders at 345×194 px (good for a review panel preview).
   * Default: 1 (native resolution, useful for export rendering).
   */
  scale?: number;
}

/**
 * Renders any of the 8 exhibit layout components inside a scaled wrapper.
 * The outer div is sized to `NATIVE_W * scale` × `NATIVE_H * scale` so that
 * the scaled component takes exactly the right amount of space in the DOM.
 */
export function ExhibitRenderer({ content, scale = 1 }: ExhibitRendererProps) {
  const layout = (content.layout as string) ?? "";

  return (
    <div
      style={{
        width: NATIVE_W * scale,
        height: NATIVE_H * scale,
        overflow: "hidden",
        flexShrink: 0,
        borderRadius: scale < 0.5 ? 6 : 0,
      }}
    >
      <div
        style={{
          width: NATIVE_W,
          height: NATIVE_H,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        {renderLayout(layout, content)}
      </div>
    </div>
  );
}

function renderLayout(layout: string, content: Record<string, unknown>): React.ReactNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = content as any;
  switch (layout) {
    case "hero_headline_argument": return <HeroHeadlineArgument data={p} />;
    case "narrative_reveal":       return <NarrativeReveal data={p} />;
    case "question_board":         return <QuestionBoard data={p} />;
    case "split_screen":           return <SplitScreen data={p} />;
    case "timeline":               return <Timeline data={p} />;
    case "quote_focus":            return <QuoteFocus data={p} />;
    case "evidence_grid":          return <EvidenceGrid data={p} />;
    case "summary_board":          return <SummaryBoard data={p} />;
    default:
      // Graceful fallback — render a minimal black slide with the layout name
      return (
        <div style={{ width: NATIVE_W, height: NATIVE_H, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ color: "#E8611A", fontSize: 48, fontWeight: 900 }}>{layout || "Unknown Layout"}</div>
        </div>
      );
  }
}

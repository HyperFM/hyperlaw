import React from "react";
import { HeroHeadlineArgument } from "./HeroHeadlineArgument";
import { NarrativeReveal } from "./NarrativeReveal";
import { QuestionBoard } from "./QuestionBoard";
import { SplitScreen } from "./SplitScreen";
import { Timeline } from "./Timeline";
import { QuoteFocus } from "./QuoteFocus";
import { EvidenceGrid } from "./EvidenceGrid";
import { SummaryBoard } from "./SummaryBoard";

// Native design dimensions — the outer landscape canvas exhibit screens sit on
const NATIVE_W = 1920;
const NATIVE_H = 1080;
// The 8 layout components actually render themselves at a fixed 1254×1254
// (their default "square" orientation — no orientation prop is passed here,
// so this is always what's used). That's taller than NATIVE_H, so it must be
// scaled down to fit rather than rendered at face value — this preview needs
// to match the fit-and-pillarbox behavior in renderAIExhibitSlide.tsx (the
// actual video-export path), which fixed the same mismatch cropping the top
// and bottom of every exported exhibit slide.
const COMPONENT_W = 1254;
const COMPONENT_H = 1254;
const FIT_SCALE = Math.min(NATIVE_W / COMPONENT_W, NATIVE_H / COMPONENT_H);

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
        background: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: COMPONENT_W,
          height: COMPONENT_H,
          transform: `scale(${scale * FIT_SCALE})`,
          transformOrigin: "center center",
          pointerEvents: "none",
          userSelect: "none",
          flexShrink: 0,
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
      // Graceful fallback — render a minimal black slide with the layout name.
      // Sized to match the real components (COMPONENT_W×COMPONENT_H) so the
      // parent's fit-scale wrapper doesn't distort this differently than it
      // would a real layout.
      return (
        <div style={{ width: COMPONENT_W, height: COMPONENT_H, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ color: "#E8611A", fontSize: 48, fontWeight: 900 }}>{layout || "Unknown Layout"}</div>
        </div>
      );
  }
}

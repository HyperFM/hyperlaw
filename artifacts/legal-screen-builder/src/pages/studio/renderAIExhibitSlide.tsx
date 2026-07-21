// ─── AI exhibit slide rasterizer ──────────────────────────────────────────────
// Mounts a React layout component into an off-screen 1920×1080 frame and
// rasterizes it with html2canvas at the caller's export scale.
//
// Strategy: all 8 layout components are designed at 1254×1254 (square). We
// center that square on a black 1920×1080 background — giving equal black bars
// left/right — then html2canvas the full frame. This avoids CSS transform:scale
// wrappers that html2canvas handles unreliably.

import React from "react";
import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas";
import { HeroHeadlineArgument } from "./exhibits/HeroHeadlineArgument";
import { NarrativeReveal }       from "./exhibits/NarrativeReveal";
import { QuestionBoard }         from "./exhibits/QuestionBoard";
import { SplitScreen }           from "./exhibits/SplitScreen";
import { Timeline }              from "./exhibits/Timeline";
import { QuoteFocus }            from "./exhibits/QuoteFocus";
import { EvidenceGrid }          from "./exhibits/EvidenceGrid";
import { SummaryBoard }          from "./exhibits/SummaryBoard";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickLayoutElement(content: Record<string, unknown>): React.ReactNode {
  const p = content as any;
  switch (content.layout as string) {
    case "hero_headline_argument": return <HeroHeadlineArgument data={p} />;
    case "narrative_reveal":       return <NarrativeReveal       data={p} />;
    case "question_board":         return <QuestionBoard         data={p} />;
    case "split_screen":           return <SplitScreen           data={p} />;
    case "timeline":               return <Timeline              data={p} />;
    case "quote_focus":            return <QuoteFocus            data={p} />;
    case "evidence_grid":          return <EvidenceGrid          data={p} />;
    case "summary_board":          return <SummaryBoard          data={p} />;
    default:
      return (
        <div
          style={{
            width: 1254, height: 1254,
            background: "#0a0a0a",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div style={{ color: "#E8611A", fontSize: 52, fontWeight: 900 }}>
            {String(content.layout ?? "Unknown layout")}
          </div>
        </div>
      );
  }
}

/**
 * Renders an AI-generated exhibit layout component to a canvas at export resolution.
 *
 * @param content      - Raw `ExhibitScreenData.content` (the AI-returned layout object)
 * @param scale        - html2canvas raster scale = exportHeight / 1080  (e.g. 0.667 for 720p)
 * @param exportWidth  - Target canvas pixel width  (e.g. 1280 for 720p)
 * @param exportHeight - Target canvas pixel height (e.g. 720  for 720p)
 */
export async function renderAIExhibitSlide(
  content: Record<string, unknown>,
  scale: number,
  exportWidth: number,
  exportHeight: number,
): Promise<HTMLCanvasElement> {
  // 1. Off-screen 1920×1080 host — black bg, component centered via flex
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;" +
    "width:1920px;height:1080px;" +
    "background:#000000;" +
    "display:flex;align-items:center;justify-content:center;" +
    "overflow:hidden;box-sizing:border-box;";
  document.body.appendChild(host);

  const root = createRoot(host);

  try {
    // 2. Mount the layout component and wait two animation frames:
    //    • Frame 1 — React flushes its commit (DOM writes)
    //    • Frame 2 — Browser paints (images / fonts settle)
    await new Promise<void>(resolve => {
      root.render(pickLayoutElement(content));
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    // 3. Rasterize the full 1920×1080 frame at the export scale
    const raw = await html2canvas(host, {
      backgroundColor: "#000000",
      scale,
      width:        1920,
      height:       1080,
      windowWidth:  1920,
      windowHeight: 1080,
      logging:   false,
      useCORS:   true,
      allowTaint: true,
    });

    // 4. html2canvas may return a canvas that differs from exportWidth×exportHeight
    //    if devicePixelRatio != 1.  Guarantee exact output dimensions.
    if (raw.width === exportWidth && raw.height === exportHeight) return raw;

    const out = document.createElement("canvas");
    out.width  = exportWidth;
    out.height = exportHeight;
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, exportWidth, exportHeight);
    ctx.drawImage(raw, 0, 0, exportWidth, exportHeight);
    return out;

  } finally {
    // Always unmount and remove the host — even if html2canvas throws
    try { root.unmount(); }   catch { /* noop */ }
    try { document.body.removeChild(host); } catch { /* noop */ }
  }
}

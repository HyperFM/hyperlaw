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
import { TestimonyCard }         from "./exhibits/TestimonyCard";

type Orientation = "square" | "portrait";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickLayoutElement(content: Record<string, unknown>, orientation: Orientation): React.ReactNode {
  const p = content as any;
  const o = orientation;
  // Same normalization as ExhibitRenderer.tsx — headline must be string[]
  // for every layout component below, but older/malformed content can still
  // have it as a plain string. Without this the export rasterizer throws
  // and that screen silently drops out of the exported video.
  if (typeof p.headline === "string") p.headline = [p.headline];
  else if (!Array.isArray(p.headline)) p.headline = [];
  switch (content.layout as string) {
    case "hero_headline_argument": return <HeroHeadlineArgument data={p} orientation={o} />;
    case "narrative_reveal":       return <NarrativeReveal       data={p} orientation={o} />;
    case "question_board":         return <QuestionBoard         data={p} orientation={o} />;
    case "split_screen":           return <SplitScreen           data={p} orientation={o} />;
    case "timeline":               return <Timeline              data={p} orientation={o} />;
    case "quote_focus":            return <QuoteFocus            data={p} orientation={o} />;
    case "evidence_grid":          return <EvidenceGrid          data={p} orientation={o} />;
    case "summary_board":          return <SummaryBoard          data={p} orientation={o} />;
    // Testimony Card ignores orientation — it only ever renders at native
    // 1920×1080, handled via the componentSize/fitScale special-case below.
    case "testimony_card":         return <TestimonyCard         data={p} />;
    default: {
      const dim = orientation === "portrait" ? { width: 1080, height: 1920 } : { width: 1254, height: 1254 };
      return (
        <div
          style={{
            ...dim, background: "#0a0a0a",
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
}

/**
 * Renders an AI-generated exhibit layout component to a canvas at export resolution.
 * Orientation is detected automatically from the export dimensions:
 *   • landscape (width ≥ height) — 1920×1080 host, component at square orientation (1254×1254)
 *   • portrait  (height >  width) — 1080×1920 host, component at portrait orientation (1080×1920)
 *
 * @param content      - Raw `ExhibitScreenData.content` (the AI-returned layout object)
 * @param exportWidth  - Target canvas pixel width  (e.g. 1280 for 720p landscape, 720 for 720p portrait)
 * @param exportHeight - Target canvas pixel height (e.g.  720 for 720p landscape, 1280 for 720p portrait)
 */
export async function renderAIExhibitSlide(
  content: Record<string, unknown>,
  exportWidth: number,
  exportHeight: number,
): Promise<HTMLCanvasElement> {
  const isPortrait = exportHeight > exportWidth;

  // Native host dimensions and raster scale depend on orientation:
  //   Landscape: native 1920×1080, scale = exportHeight/1080
  //   Portrait:  native 1080×1920, scale = exportWidth/1080
  const nativeW = isPortrait ? 1080 : 1920;
  const nativeH = isPortrait ? 1920 : 1080;
  const scale   = isPortrait ? exportWidth / 1080 : exportHeight / 1080;
  const orientation = isPortrait ? "portrait" : "square";

  // The layout components render themselves at a fixed native size per
  // orientation — 1254×1254 for "square", 1080×1920 for "portrait" (see each
  // component's own `dimensions` — e.g. SplitScreen.tsx). Portrait's native
  // size equals the host exactly, so fitScale is a no-op there. But the
  // "square" component is 1254 tall, taller than the 1080-tall landscape
  // host — centering it at face value with overflow:hidden (the previous
  // approach) cropped 87px off both the top AND bottom of every AI exhibit
  // slide in the actual exported video at the default landscape resolution.
  // Scaling the component down to fit the host, still centered, pillarboxes
  // it (equal black bars left/right) instead — the originally intended look
  // per this file's own header comment.
  // Testimony Card is the one layout NOT designed at 1254×1254 (or
  // 1080×1920 portrait) — it renders itself natively at full 1920×1080,
  // matching the landscape host exactly, so fitScale is a no-op for it
  // the same way it already is for portrait's matching native size.
  const isTestimonyCard = content.layout === "testimony_card";
  const componentSize = isTestimonyCard
    ? { w: 1920, h: 1080 }
    : orientation === "portrait" ? { w: 1080, h: 1920 } : { w: 1254, h: 1254 };
  const fitScale = Math.min(nativeW / componentSize.w, nativeH / componentSize.h);

  // 1. Off-screen host at native dimensions — black bg, component centered via flex
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;" +
    `width:${nativeW}px;height:${nativeH}px;` +
    "background:#000000;" +
    "display:flex;align-items:center;justify-content:center;" +
    "overflow:hidden;box-sizing:border-box;";
  document.body.appendChild(host);

  const root = createRoot(host);

  try {
    // 2. Mount the layout component at the correct orientation and wait two rAFs:
    //    • Frame 1 — React flushes its commit (DOM writes)
    //    • Frame 2 — Browser paints (images / fonts settle)
    await new Promise<void>(resolve => {
      root.render(
        <div
          style={{
            width: componentSize.w,
            height: componentSize.h,
            transform: `scale(${fitScale})`,
            transformOrigin: "center center",
          }}
        >
          {pickLayoutElement(content, orientation)}
        </div>
      );
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    // 3. Rasterize the full native frame at the export scale
    const raw = await html2canvas(host, {
      backgroundColor: "#000000",
      scale,
      width:        nativeW,
      height:       nativeH,
      windowWidth:  nativeW,
      windowHeight: nativeH,
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

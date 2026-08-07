import React, { useState, useEffect, useRef, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { FilePicker } from "@capawesome/capacitor-file-picker";
import { Filesystem } from "@capacitor/filesystem";
import {
  ArrowLeft, Play, Pause, Plus, Mic, MicOff, Undo2, Redo2,
  Check, Film, Upload, X, AlertCircle, CheckCircle2, XCircle,
  Loader2, Eye, Shield, ZoomIn, ZoomOut, Info, Clapperboard, Download,
  Scissors, Monitor, PlayCircle, StopCircle, RotateCcw, ImageIcon, Wand2, Trash2, Bookmark, HelpCircle, Bandage, Camera, Copy, ClipboardPaste,
} from "lucide-react";
import type { HLCase, ExhibitMarker, StudioProject, JurisdictionVerification, ScreenInsert, MediaInsert, ExhibitScreenData, VideoChunk } from "../../types";
import { aiApi } from "../../lib/aiApi";
import { api } from "../../lib/api";
import { ExhibitGeneratorPanel, ExhibitRenderer } from "./exhibits";
import ExhibitVideoExportModal from "./ExhibitVideoExportModal";
import { saveStudioSnapshot, loadStudioSnapshot, clearStudioSnapshot, saveThumbnails, loadThumbnails } from "./studioIndexedDB";
import { downscaleCasePhoto } from "../../lib/casePhoto";
import type { ExportSettings, StudioSnapshot } from "./studioIndexedDB";

const ORANGE = "#d9711f";

// Free in-browser dictation (Web Speech API) — Chrome/Android only, no cost.
// Safari has no implementation at all, so this stays feature-detected and
// falls back to just focusing the field (native OS dictation) everywhere else.
type SpeechRecognitionLike = {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
const SpeechRecognitionCtor: (new () => SpeechRecognitionLike) | null =
  typeof window !== "undefined"
    ? ((window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike })
        .SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition ?? null)
    : null;
const speechSupported = !!SpeechRecognitionCtor;

// Single source of truth for the studio project retention window — used for
// both the video's local blob and the server-side markers/exhibit data, so
// the two can never drift out of sync with each other.
const EXPIRY_DAYS = 30;
const EXPIRY_MS = EXPIRY_DAYS * 24 * 60 * 60 * 1000;

// Purely informational now — the video is never uploaded (see loadVideo's
// header comment), so there's no server-memory ceiling to enforce. Large
// files just take longer to decode/thumbnail-extract locally; this only
// triggers a heads-up notice, never a rejection.
const LARGE_FILE_NOTICE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function relativeTime(ms: number): string {
  const diff = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diff < 60) return `${diff} second${diff !== 1 ? "s" : ""} ago`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} hour${hrs !== 1 ? "s" : ""} ago`;
}

// ── Jurisdiction verify hold button ─────────────────────────────────────────
function JurisdictionVerifyButton({ onVerify, disabled }: { onVerify: () => void; disabled?: boolean }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const isHoldingRef = useRef(false);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(false);
  const HOLD_MS = 3000;

  function vibrate(p: number | number[]) { try { if (navigator.vibrate) navigator.vibrate(p); } catch {} }

  function begin() {
    if (isHoldingRef.current || disabled) return;
    isHoldingRef.current = true;
    setActive(true);
    setProgress(0);
    startRef.current = performance.now();
    vibrate([20]);
    function tick(now: number) {
      if (!isHoldingRef.current) return;
      const p = Math.min(1, (now - (startRef.current ?? now)) / HOLD_MS);
      setProgress(p);
      if (p >= 1) { isHoldingRef.current = false; setActive(false); vibrate([40, 20, 60]); onVerify(); return; }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  function cancel() {
    if (!isHoldingRef.current) return;
    isHoldingRef.current = false;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    startRef.current = null;
    setProgress(0);
    setActive(false);
  }

  useEffect(() => {
    const el = btnRef.current;
    if (!el) return;
    const ts = (e: TouchEvent) => { e.preventDefault(); begin(); };
    el.addEventListener("touchstart", ts, { passive: false });
    el.addEventListener("touchend", cancel);
    el.addEventListener("touchcancel", cancel);
    return () => { el.removeEventListener("touchstart", ts); el.removeEventListener("touchend", cancel); el.removeEventListener("touchcancel", cancel); cancel(); };
  }, [disabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const circ = 2 * Math.PI * 9;
  return (
    <button ref={btnRef} onMouseDown={begin} onMouseUp={cancel} onMouseLeave={cancel} disabled={disabled}
      title="Hold 3s to verify (0.5 credit)"
      style={{ background: active ? "rgba(217,113,31,0.12)" : "#1a1a1a", border: `1px solid ${active ? ORANGE : "#2a2a2a"}`, borderRadius: 8, padding: "5px 10px", display: "flex", alignItems: "center", gap: 6, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, flexShrink: 0, boxShadow: active ? `0 0 12px ${ORANGE}66` : "none", transition: "all 0.1s" }}>
      {active ? (
        <svg width={22} height={22} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={11} cy={11} r={9} fill="none" stroke="rgba(217,113,31,0.2)" strokeWidth={2.5} />
          <circle cx={11} cy={11} r={9} fill="none" stroke={ORANGE} strokeWidth={2.5}
            strokeDasharray={circ} strokeDashoffset={circ * (1 - progress)} strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 4px ${ORANGE})` }} />
        </svg>
      ) : (
        <Shield size={14} color="#666" />
      )}
      <span style={{ fontSize: 11, fontWeight: 700, color: active ? ORANGE : "#666", letterSpacing: 0.3 }}>
        {active ? `${Math.max(0, Math.ceil((1 - progress) * 3))}s…` : "Verify"}
      </span>
    </button>
  );
}

// ── Video Timeline ────────────────────────────────────────────────────────────
function VideoTimeline({
  duration, currentTime, markers, onSeek,
  activeMarkerId, onSelectMarker,
  chunks,
  thumbnails, thumbsLoading, step, zoom,
  selectedChunkId, setSelectedChunkId,
  healableBoundaries, onHealBoundary, isDraggingBandaid,
}: {
  duration: number; currentTime: number;
  markers: ExhibitMarker[];
  onSeek: (t: number) => void;
  activeMarkerId: string | null;
  onSelectMarker: (id: string) => void;
  chunks: VideoChunk[];
  thumbnails: string[];
  thumbsLoading: boolean;
  step: number;
  zoom: number;
  selectedChunkId: string | null;
  setSelectedChunkId: React.Dispatch<React.SetStateAction<string | null>>;
  healableBoundaries: { time: number; leftChunkId: string; kind: "merge" | "trail" }[];
  onHealBoundary: (leftChunkId: string, kind: "merge" | "trail") => void;
  isDraggingBandaid: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [draggingChunkId, setDraggingChunkId] = useState<string | null>(null);
  const dragState = useRef<{ active: boolean; startX: number; moved: boolean }>(
    { active: false, startX: 0, moved: false }
  );

  // ── Unsplit — grab the Band-Aid and drop it directly on the split you want
  // healed. One at a time, on purpose — no selection zone to fuss with. ──
  const [unsplitDragOverTime, setUnsplitDragOverTime] = useState<number | null>(null);

  // maxDist caps how far (in seconds) the nearest split is allowed to be from
  // the drop/hover point — without this, dropping anywhere in unchunked
  // footage would still snap to whatever split happens to exist elsewhere on
  // the timeline, even if it's nowhere near where you actually dropped.
  function nearestHealable(t: number, maxDist = Infinity): { time: number; leftChunkId: string; kind: "merge" | "trail" } | null {
    let best: { time: number; leftChunkId: string; kind: "merge" | "trail" } | null = null;
    let bestD = Infinity;
    for (const b of healableBoundaries) {
      const d = Math.abs(b.time - t);
      if (d < bestD) { bestD = d; best = b; }
    }
    if (best && bestD > maxDist) return null;
    return best;
  }

  /** ~50px of slack, converted to seconds at the track's current zoom level. */
  function unsplitTolerance(): number {
    const el = trackRef.current;
    if (!el || !duration) return 0;
    const pxPerSec = el.getBoundingClientRect().width / duration;
    return 50 / Math.max(pxPerSec, 0.0001);
  }

  // Re-center the scroll position on the current playhead whenever zoom changes,
  // so zooming in/out doesn't yank the view to some other part of the timeline.
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl || !duration) return;
    const progressFrac = Math.max(0, Math.min(1, currentTime / duration));
    const contentWidth = scrollEl.scrollWidth;
    const target = progressFrac * contentWidth - scrollEl.clientWidth / 2;
    scrollEl.scrollLeft = Math.max(0, Math.min(contentWidth - scrollEl.clientWidth, target));
    // Only re-center when the zoom level itself changes — not on every
    // currentTime tick, or playback would constantly yank the scroll position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  function pctFromX(clientX: number) {
    const el = trackRef.current;
    if (!el || !duration) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }
  function startDrag(clientX: number) {
    dragState.current = { active: true, startX: clientX, moved: false };
    onSeek(pctFromX(clientX) * duration);
  }
  function moveDrag(clientX: number) {
    if (!dragState.current.active) return;
    if (Math.abs(clientX - dragState.current.startX) > 6) dragState.current.moved = true;
    onSeek(pctFromX(clientX) * duration);
  }
  function endDrag() { dragState.current.active = false; }

  useEffect(() => {
    function onMove(e: MouseEvent) { moveDrag(e.clientX); }
    function onUp() { endDrag(); }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [duration]); // eslint-disable-line react-hooks/exhaustive-deps

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Visual segments: chunks + any legacy video_cut gaps
  const cutGaps = markers
    .filter(m => m.type === "video_cut" && m.cutEnd != null)
    .map(m => ({ id: m.id, start: m.timestamp, end: m.cutEnd!, isDeleted: true as const, label: "", tag: undefined as string | undefined }));
  const chunkSegs = chunks.map(c => ({
    id: c.id, start: c.start, end: c.end, isDeleted: false as const, label: c.label, tag: c.tag,
  }));
  const allSegs = [...chunkSegs, ...cutGaps].sort((a, b) => a.start - b.start);

  const NUM = thumbnails.length;
  // Each chunk shows exactly ONE thumbnail — its opening frame — rather than a
  // filmstrip, so the whole segment reads as "this is what this moment looks
  // like" instead of a scrolling series of frames.
  function segStartThumb(start: number): string | null {
    if (!NUM || !duration) return null;
    const dt = duration / Math.max(1, NUM - 1);
    let best = 0, bestD = Infinity;
    thumbnails.forEach((_, i) => { const d = Math.abs(i * dt - start); if (d < bestD) { bestD = d; best = i; } });
    return thumbnails[best] ?? null;
  }

  const TAG_COLORS: Record<string, string> = {
    consistency: "#22c55e", contradiction: "#ef4444",
    escalation: "#f59e0b", no_cause: "#8b5cf6",
  };

  return (
    <div style={{ padding: "0 0 26px", position: "relative", marginBottom: 4 }}>
      {/* Scrollable viewport — stays 100% width regardless of zoom */}
      <div ref={scrollRef} style={{ overflowX: "auto", overflowY: "hidden" }}>
        {/* Zoom-scaled canvas — at zoom=1 this is exactly 100% (no scroll needed);
            at zoom=N it's N×100% wide, so the existing percentage-based positioning
            below (leftPct, widthPct, progress%, marker pct%) just works unchanged,
            now spread across a wider — and thus more precise to click/drag — track. */}
        <div style={{ width: `${zoom * 100}%`, minWidth: "100%" }}>
      <div style={{ display: "flex", alignItems: "stretch" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <div ref={trackRef}
          style={{ flexShrink: 0, height: 72, borderRadius: 10, position: "relative",
            cursor: "pointer", border: `1.5px solid ${unsplitDragOverTime !== null ? ORANGE : "#1e1e1e"}`,
            overflow: "hidden", boxSizing: "border-box" }}
          onMouseDown={e => { if ((e.target as HTMLElement).closest("button")) return; startDrag(e.clientX); }}
          onDragEnter={e => e.preventDefault()}
          onDragOver={e => {
            e.preventDefault();
            if (!duration) return;
            setUnsplitDragOverTime(pctFromX(e.clientX) * duration);
          }}
          onDragLeave={() => setUnsplitDragOverTime(null)}
          onDrop={e => {
            e.preventDefault();
            setUnsplitDragOverTime(null);
            // Only react to the Band-Aid itself — dragging a chunk segment
            // (e.g. toward the trash can) was accidentally healing splits as
            // a side effect, since this drop zone didn't check what was
            // actually being dropped on it.
            if (e.dataTransfer.getData("text/plain") !== "unsplit-bandaid") return;
            // Compute the drop time directly from this event's own position —
            // don't depend on dragover having already set state, in case it
            // never fired before this drop for some reason.
            const t = pctFromX(e.clientX) * duration;
            const near = nearestHealable(t, unsplitTolerance());
            if (near) onHealBoundary(near.leftChunkId, near.kind);
          }}
          onTouchStart={e => {
            if ((e.target as HTMLElement).closest("button")) return;
            e.preventDefault();
            const tc = e.touches[0];
            dragState.current = { active: true, startX: tc.clientX, moved: false };
            onSeek(pctFromX(tc.clientX) * duration);
          }}
          onTouchMove={e => { e.preventDefault(); moveDrag(e.touches[0].clientX); }}
          onTouchEnd={() => endDrag()}>

          {/* While dragging the Band-Aid over the track: every healable split
              shows as a thin line; the one closest to the pointer — the one
              that will actually heal if you drop now — just glows brighter
              and thicker right on the line itself, no separate shape over it. */}
          {unsplitDragOverTime !== null && duration > 0 && (() => {
            const near = nearestHealable(unsplitDragOverTime, unsplitTolerance());
            return healableBoundaries.map(b => {
              const isNear = near?.leftChunkId === b.leftChunkId;
              return (
                <div key={b.leftChunkId} style={{ position: "absolute", top: isNear ? 0 : 4, bottom: isNear ? 0 : 4,
                  left: `${(b.time / duration) * 100}%`, transform: "translateX(-50%)",
                  width: isNear ? 4 : 2, background: isNear ? ORANGE : `${ORANGE}66`,
                  boxShadow: isNear ? `0 0 10px ${ORANGE}` : "none",
                  zIndex: 7, pointerEvents: "none", transition: "all 0.1s" }} />
              );
            });
          })()}

          {/* Raw footage strip — the base layer across the WHOLE track, always,
              so any not-yet-chunked stretch of video still shows real frames.
              Chunk segments (below) draw their own opening-frame thumbnail on
              top of this wherever a chunk actually exists. */}
          {duration > 0 && (
            <div style={{ position: "absolute", inset: 0 }}>
              {thumbnails.length > 0 ? (
                /* Real frames — one img per captured thumbnail */
                <div style={{ position: "absolute", inset: 0, display: "flex" }}>
                  {thumbnails.map((src, i) => (
                    <img key={i} src={src} alt="" draggable={false}
                      style={{ flex: 1, height: "100%", objectFit: "cover", display: "block", minWidth: 0 }} />
                  ))}
                </div>
              ) : thumbsLoading ? (
                /* Skeleton tiles while the hidden video is generating frames */
                <div style={{ position: "absolute", inset: 0, display: "flex" }}>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} style={{
                      flex: 1, height: "100%",
                      background: i % 2 === 0 ? "#1c1c1c" : "#161616",
                      borderRight: "1px solid #111",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {i === 5 && (
                        <div style={{ fontSize: 8, color: "#333", fontWeight: 700, whiteSpace: "nowrap" }}>
                          Loading…
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                /* Idle — no video loaded yet */
                <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(90deg,#111 0,#111 1px,#161616 1px,#161616 40px)" }} />
              )}
            </div>
          )}

          {/* ── Segments ── */}
          {duration > 0 && allSegs.map(seg => {
            const leftPct = (seg.start / duration) * 100;
            const widthPct = ((seg.end - seg.start) / duration) * 100;
            const isSelected = selectedChunkId === seg.id && !seg.isDeleted;
            const startThumb = segStartThumb(seg.start);
            const playedFrac = !seg.isDeleted && currentTime > seg.start
              ? Math.min(1, (Math.min(currentTime, seg.end) - seg.start) / (seg.end - seg.start))
              : 0;
            const tagColor = seg.tag ? TAG_COLORS[seg.tag] : null;
            return (
              <div key={seg.id}
                draggable={!seg.isDeleted && !isDraggingBandaid}
                onDragStart={e => {
                  e.stopPropagation(); e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", JSON.stringify({ chunkId: seg.id }));
                  setDraggingChunkId(seg.id);
                }}
                onDragEnd={() => setDraggingChunkId(null)}
                onClick={e => {
                  if (dragState.current.moved || (e.target as HTMLElement).closest("button")) return;
                  e.stopPropagation();
                  if (!seg.isDeleted) setSelectedChunkId(v => v === seg.id ? null : seg.id);
                }}
                style={{ position: "absolute", left: `${leftPct}%`, width: `${widthPct}%`,
                  top: 0, bottom: 0, boxSizing: "border-box",
                  cursor: seg.isDeleted ? "default" : "grab",
                  opacity: draggingChunkId === seg.id ? 0.35 : 1,
                  // While a Band-Aid is being dragged, segments (and their selection
                  // ring) must never intercept the hover/drop — otherwise dropping
                  // right at a boundary can land on the segment instead of the
                  // track underneath it, and the heal silently never fires.
                  pointerEvents: isDraggingBandaid ? "none" : undefined,
                  transition: "opacity 0.12s" }}>

                {seg.isDeleted ? (
                  <div style={{ position: "absolute", inset: 0, background: "#090909",
                    borderLeft: "1px solid #1a1a1a", borderRight: "1px solid #1a1a1a" }} />
                ) : (
                  <>
                    {/* Single opening-frame thumbnail, stretched across the whole moment */}
                    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
                      {startThumb ? (
                        <img src={startThumb} alt="" draggable={false}
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", background: "repeating-linear-gradient(90deg,#111 0,#111 1px,#161616 1px,#161616 40px)" }} />
                      )}
                    </div>
                    {/* Played scrim */}
                    {playedFrac > 0 && (
                      <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
                        background: `linear-gradient(to right, rgba(0,0,0,0.48) ${playedFrac * 100}%, transparent ${playedFrac * 100}%)` }} />
                    )}
                    {/* Tag color bar */}
                    {tagColor && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: tagColor, zIndex: 3 }} />}
                    {/* Label overlay — shown as soon as it's typed, now that chunking and labeling happen together in step 1 */}
                    {seg.label && (
                      <div style={{ position: "absolute", bottom: tagColor ? 5 : 2, left: 3, right: 3, zIndex: 4,
                        fontSize: 8, fontWeight: 800, color: "#fff", textShadow: "0 1px 3px #000",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {seg.label}
                      </div>
                    )}
                    {/* Right divider */}
                    <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.18)", zIndex: 2 }} />
                    {/* Selected overlay — thick orange ring only; Split and Remove both
                        live in the toolbar now, off the segment, so nothing here can
                        be fat-fingered by mistake. */}
                    {isSelected && (
                      <div style={{ position: "absolute", inset: 0, border: `3px solid ${ORANGE}`,
                        boxSizing: "border-box", background: `${ORANGE}14`, boxShadow: `0 0 10px ${ORANGE}88, inset 0 0 8px ${ORANGE}33`, zIndex: 6 }} />
                    )}
                  </>
                )}
              </div>
            );
          })}

          {/* Playhead */}
          <div style={{ position: "absolute", left: `${progress}%`, top: 0, bottom: 0,
            width: 2, background: ORANGE, transform: "translateX(-50%)", zIndex: 9,
            pointerEvents: "none" }}>
            <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
              width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent",
              borderTop: `11px solid ${ORANGE}` }} />
          </div>

          {/* Exhibit / media / screen marker pins */}
          {duration > 0 && markers.filter(m => m.type !== "video_cut").map(m => {
            const pct = (m.timestamp / duration) * 100;
            const isActive = m.id === activeMarkerId;
            const isCutM = m.type === "screen_cut";
            const isMedia = m.type === "media_insert";
            const isAIScreen = m.type === "exhibit_screen";
            const color = isCutM ? "#60a5fa" : isMedia ? "#a78bfa" : isAIScreen ? "#8b5cf6" : ORANGE;
            return (
              <div key={m.id} onClick={e => { e.stopPropagation(); onSelectMarker(m.id); }}
                style={{ position: "absolute", left: `${pct}%`, top: 0, bottom: 0,
                  transform: "translateX(-50%)", zIndex: 10,
                  display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer" }}>
                <div style={{ width: isActive ? 2 : 1.5, flex: 1, background: isActive ? "#fff" : color + "cc", boxShadow: `0 0 4px ${color}66` }} />
                <div style={{ width: 18, height: 18, background: color, borderRadius: 4, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 1,
                  border: isActive ? "1.5px solid #fff" : "none" }}>
                  {isCutM ? <Monitor size={9} color="#000" /> :
                   isMedia ? (m.mediaInsert?.kind === "clip" ? <Film size={9} color="#000" /> : <ImageIcon size={9} color="#000" />) :
                   isAIScreen ? <Wand2 size={9} color="#000" /> :
                   <span style={{ fontSize: 7, fontWeight: 900, color: "#000" }}>E</span>}
                </div>
              </div>
            );
          })}
        </div>
        {isDraggingBandaid && (
          <div style={{ textAlign: "center", fontSize: 10, fontWeight: 800, color: ORANGE, letterSpacing: 0.3 }}>
            Unsplit. Drag over a split to heal it.
          </div>
        )}
        </div>
      </div>

      {/* Time ticks */}
      <div style={{ position: "relative", height: 20, marginTop: 3 }}>
        {duration > 0 && [0, 0.25, 0.5, 0.75, 1].map(t => (
          <div key={t} style={{ position: "absolute", left: `${t * 100}%`, top: 0,
            fontSize: 8, color: "#3a3a3a", fontWeight: 700,
            transform: t === 1 ? "translateX(-100%)" : t === 0 ? "none" : "translateX(-50%)",
            userSelect: "none", pointerEvents: "none" }}>
            {formatTime(t * duration)}
          </div>
        ))}
        {duration > 0 && markers.filter(m => m.type !== "video_cut").map(m => {
          const pct = (m.timestamp / duration) * 100;
          const isActive = m.id === activeMarkerId;
          const isCutM = m.type === "screen_cut";
          const isMedia = m.type === "media_insert";
          const isAIScreen = m.type === "exhibit_screen";
          const color = isCutM ? "#60a5fa" : isMedia ? "#a78bfa" : isAIScreen ? "#8b5cf6" : ORANGE;
          return (
            <div key={m.id} style={{ position: "absolute", left: `${pct}%`, top: 0,
              transform: "translateX(-50%)", fontSize: 8,
              color: isActive ? "#ccc" : color + "99", fontWeight: 700,
              whiteSpace: "nowrap", maxWidth: 56, overflow: "hidden", textOverflow: "ellipsis",
              pointerEvents: "none", userSelect: "none", textShadow: "0 1px 3px #000" }}>
              {m.label || (isCutM ? "Screen" : isMedia ? (m.mediaInsert?.kind === "clip" ? "Clip" : "Photo") : `EX-${markers.filter(x => x.type !== "video_cut").indexOf(m) + 1}`)}
            </div>
          );
        })}
      </div>
        </div>
      </div>
    </div>
  );
}

// ── Slot Cell (Step 3 Organize track) ─────────────────────────────────────────
function SlotCell({ index, chunk, onDrop, onClear }: {
  index: number;
  chunk: VideoChunk | null;
  onDrop: (chunkId: string) => void;
  onClear: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onDragOver={e => { e.preventDefault(); setHovered(true); }}
      onDragLeave={() => setHovered(false)}
      onDrop={e => {
        e.preventDefault(); setHovered(false);
        try { const { chunkId } = JSON.parse(e.dataTransfer.getData("text/plain")); onDrop(chunkId); } catch {}
      }}
      style={{ width: 84, height: 64, flexShrink: 0, borderRadius: 12, position: "relative",
        background: chunk ? "#111" : hovered ? "#0a1400" : "#0a0a0a",
        border: `1.5px ${chunk ? "solid #1e1e1e" : "dashed"} ${hovered ? "#22c55e" : chunk ? "#1e1e1e" : "#222"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.12s", cursor: "default", overflow: "hidden" }}>
      {chunk ? (
        <>
          <div style={{ padding: "6px 8px", fontSize: 9, fontWeight: 800, color: "#bbb",
            textAlign: "center", lineHeight: 1.35,
            overflow: "hidden", display: "-webkit-box",
            WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as const }}>
            {chunk.label || `Moment`}
          </div>
          <button onClick={e => { e.stopPropagation(); onClear(); }}
            style={{ position: "absolute", top: 3, right: 3, background: "none", border: "none",
              cursor: "pointer", padding: 2, lineHeight: 0 }}>
            <X size={10} color="#444" />
          </button>
        </>
      ) : (
        <div style={{ fontSize: 11, color: "#252525", fontWeight: 800 }}>{index + 1}</div>
      )}
    </div>
  );
}

// ── Exhibit Draft Sheet ────────────────────────────────────────────────────────
function ExhibitDraftSheet({ marker, exhibitNumber, onClose, onUpdateWhyItMatters }: {
  marker: ExhibitMarker;
  exhibitNumber: number;
  onClose: () => void;
  onUpdateWhyItMatters: (text: string) => void;
}) {
  const draft = marker.draft;
  const [why, setWhy] = useState(marker.whyItMatters || draft?.whyItMatters || "");

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 700, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px 20px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 20 }}>
          <div style={{ background: ORANGE, borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 900, color: "#000", letterSpacing: 0.5, flexShrink: 0, marginTop: 2 }}>
            EXHIBIT {exhibitNumber}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#fff", lineHeight: 1.3 }}>
              {draft?.headline || marker.label || "Exhibit Draft"}
            </div>
            <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>at {formatTime(marker.timestamp)}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, flexShrink: 0 }}>
            <X size={20} color="#555" />
          </button>
        </div>

        {draft ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {draft.supportingQuote && (
              <div style={{ background: "#111", border: `1px solid ${ORANGE}33`, borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ fontSize: 10, color: ORANGE, fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>SUPPORTING QUOTE</div>
                <div style={{ fontSize: 14, color: "#ccc", lineHeight: 1.55, fontStyle: "italic" }}>"{draft.supportingQuote}"</div>
              </div>
            )}
            {draft.keyObservations?.length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>KEY OBSERVATIONS</div>
                {draft.keyObservations.map((obs, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: ORANGE, marginTop: 7, flexShrink: 0 }} />
                    <div style={{ fontSize: 13, color: "#bbb", lineHeight: 1.5 }}>{obs}</div>
                  </div>
                ))}
              </div>
            )}
            {draft.timelineContext && (
              <div>
                <div style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>TIMELINE CONTEXT</div>
                <div style={{ fontSize: 13, color: "#888", lineHeight: 1.55 }}>{draft.timelineContext}</div>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {draft.relevantParties?.length > 0 && (
                <div style={{ background: "#111", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>PARTIES</div>
                  {draft.relevantParties.map((p, i) => <div key={i} style={{ fontSize: 12, color: "#888", marginBottom: 3 }}>{p}</div>)}
                </div>
              )}
              {draft.evidenceReferences?.length > 0 && (
                <div style={{ background: "#111", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>EVIDENCE</div>
                  {draft.evidenceReferences.map((e, i) => <div key={i} style={{ fontSize: 12, color: "#888", marginBottom: 3 }}>{e}</div>)}
                </div>
              )}
            </div>
            {draft.legalAuthorities?.length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>LEGAL AUTHORITIES</div>
                {draft.legalAuthorities.map((la, i) => (
                  <div key={i} style={{ fontSize: 12, color: "#888", marginBottom: 3, display: "flex", gap: 6 }}>
                    <span style={{ color: ORANGE }}>§</span> {la}
                  </div>
                ))}
              </div>
            )}
            <div>
              <div style={{ fontSize: 10, color: ORANGE, fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>WHY THIS MOMENT MATTERS</div>
              <textarea
                value={why}
                onChange={e => setWhy(e.target.value)}
                onBlur={() => onUpdateWhyItMatters(why)}
                placeholder="Describe in plain language why this moment is significant…"
                rows={3}
                style={{ width: "100%", background: "#111", border: `1px solid ${ORANGE}33`, borderRadius: 10, padding: "12px 14px", color: "#ccc", fontSize: 13, lineHeight: 1.55, resize: "vertical", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
                onFocus={e => (e.target.style.borderColor = ORANGE + "88")}
              />
            </div>
            <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#444" }}>Exhibit {exhibitNumber} of record</span>
              <div style={{ fontSize: 11, color: "#333", fontStyle: "italic" }}>
                Factual observations only — no legal conclusions asserted
              </div>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "#555", fontSize: 14 }}>
            {marker.status === "extracting" ? "Generating exhibit draft…" : "No draft generated yet."}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Cut Screen Builder ────────────────────────────────────────────────────────

const BG_PRESETS = [
  { label: "Black",   color: "#080808" },
  { label: "Navy",    color: "#0a1628" },
  { label: "Slate",   color: "#0f1923" },
  { label: "Forest",  color: "#0a1a0f" },
  { label: "Crimson", color: "#1a0808" },
  { label: "Amber",   color: "#1a0e00" },
  { label: "Violet",  color: "#0f0a1a" },
  { label: "White",   color: "#f0f0f0" },
];

type BodyLines = [string, string, string];

interface ScreenDraft {
  title: string;
  subtitle: string;
  bgColor: string;
  bodyLines: BodyLines;
}

function ScreenPreviewCard({ screen, mini = false }: { screen: ScreenDraft; mini?: boolean }) {
  const isLight = screen.bgColor === "#f0f0f0";
  const textColor = isLight ? "#111" : "#fff";
  const mutedColor = isLight ? "#555" : "#888";
  return (
    <div style={{
      background: screen.bgColor,
      borderRadius: mini ? 8 : 14,
      border: "1px solid rgba(255,255,255,0.06)",
      aspectRatio: "16/9",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: mini ? "6px 8px" : "20px 24px",
      textAlign: "center",
      gap: mini ? 3 : 10,
      overflow: "hidden",
    }}>
      {screen.title ? (
        <div style={{ fontSize: mini ? 10 : 20, fontWeight: 900, color: textColor, lineHeight: 1.2, maxWidth: "100%", overflow: "hidden" }}>
          {screen.title}
        </div>
      ) : null}
      {screen.subtitle ? (
        <div style={{ fontSize: mini ? 7 : 13, color: mutedColor, lineHeight: 1.4 }}>
          {screen.subtitle}
        </div>
      ) : null}
      {!mini && screen.bodyLines.filter(Boolean).length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, width: "100%", textAlign: "left" }}>
          {screen.bodyLines.filter(Boolean).map((line, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <div style={{ width: 4, height: 4, borderRadius: "50%", background: ORANGE, marginTop: 8, flexShrink: 0 }} />
              <div style={{ fontSize: 13, color: mutedColor, lineHeight: 1.5 }}>{line}</div>
            </div>
          ))}
        </div>
      )}
      {!screen.title && !screen.subtitle && (
        <div style={{ fontSize: mini ? 8 : 13, color: "rgba(255,255,255,0.15)", fontStyle: "italic" }}>Screen preview</div>
      )}
    </div>
  );
}

function CutScreenBuilderModal({
  initialTime,
  duration,
  existingMarkers,
  onInsert,
  onCancel,
}: {
  initialTime: number;
  duration: number;
  existingMarkers: ExhibitMarker[];
  onInsert: (time: number, screen: ScreenInsert, holdSec: number) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<"build" | "place">("build");
  const [screen, setScreen] = useState<ScreenDraft>({
    title: "",
    subtitle: "",
    bgColor: "#080808",
    bodyLines: ["", "", ""],
  });
  const [placementTime, setPlacementTime] = useState(initialTime);
  const [holdSec, setHoldSec] = useState(4);
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  function seekFromXY(clientX: number) {
    const el = trackRef.current;
    if (!el || !duration) return;
    const rect = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setPlacementTime(pct * duration);
  }

  useEffect(() => {
    function onMove(e: MouseEvent) { if (isDragging.current) seekFromXY(e.clientX); }
    function onUp() { isDragging.current = false; }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [duration]); // eslint-disable-line react-hooks/exhaustive-deps

  const placePct = duration > 0 ? (placementTime / duration) * 100 : 50;
  const existingCuts = existingMarkers.filter(m => m.type === "screen_cut");

  /* ── Step 1: Build ── */
  if (step === "build") {
    return (
      <div style={{ position: "fixed", inset: 0, background: "#050505", zIndex: 900, display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ flexShrink: 0, background: "#0a0a0a", borderBottom: "1px solid #151515", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={20} color="#666" />
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: "#ddd" }}>Build Insert Screen</div>
            <div style={{ fontSize: 10, color: "#444" }}>Step 1 of 2 — Design the screen</div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 110px", display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Live preview */}
          <ScreenPreviewCard screen={screen} />

          {/* Background */}
          <div>
            <div style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>BACKGROUND</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {BG_PRESETS.map(p => (
                <button key={p.color} onClick={() => setScreen(s => ({ ...s, bgColor: p.color }))} title={p.label}
                  style={{ width: 36, height: 36, borderRadius: 8, background: p.color, border: `2px solid ${screen.bgColor === p.color ? ORANGE : "rgba(255,255,255,0.08)"}`, cursor: "pointer", boxShadow: screen.bgColor === p.color ? `0 0 8px ${ORANGE}88` : "none", transition: "all 0.15s" }} />
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <div style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>TITLE</div>
            <input value={screen.title}
              onChange={e => setScreen(s => ({ ...s, title: e.target.value }))}
              placeholder="Main headline — e.g. EXHIBIT A · USE OF FORCE"
              style={{ width: "100%", background: "#111", border: "1px solid #222", borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 14, fontWeight: 700, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
              onFocus={e => (e.target.style.borderColor = ORANGE + "88")}
              onBlur={e => (e.target.style.borderColor = "#222")}
            />
          </div>

          {/* Subtitle */}
          <div>
            <div style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>
              SUBTITLE <span style={{ color: "#333", fontWeight: 400 }}>optional</span>
            </div>
            <input value={screen.subtitle}
              onChange={e => setScreen(s => ({ ...s, subtitle: e.target.value }))}
              placeholder="Date, location, case number…"
              style={{ width: "100%", background: "#111", border: "1px solid #222", borderRadius: 10, padding: "12px 14px", color: "#ccc", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
              onFocus={e => (e.target.style.borderColor = ORANGE + "88")}
              onBlur={e => (e.target.style.borderColor = "#222")}
            />
          </div>

          {/* Body lines */}
          <div>
            <div style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>
              KEY POINTS <span style={{ color: "#333", fontWeight: 400 }}>optional — up to 3</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {([0, 1, 2] as const).map(i => (
                <input key={i} value={screen.bodyLines[i]}
                  onChange={e => setScreen(s => {
                    const lines = [...s.bodyLines] as BodyLines;
                    lines[i] = e.target.value;
                    return { ...s, bodyLines: lines };
                  })}
                  placeholder={`Point ${i + 1}`}
                  style={{ width: "100%", background: "#111", border: "1px solid #222", borderRadius: 10, padding: "10px 14px", color: "#ccc", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
                  onFocus={e => (e.target.style.borderColor = ORANGE + "88")}
                  onBlur={e => (e.target.style.borderColor = "#222")}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", background: "#0a0a0a", borderTop: "1px solid #151515" }}>
          <button
            onClick={() => { if (screen.title.trim()) setStep("place"); }}
            disabled={!screen.title.trim()}
            style={{ width: "100%", background: screen.title.trim() ? ORANGE : "#1a1a1a", border: "none", borderRadius: 14, padding: "16px", fontSize: 15, fontWeight: 800, color: screen.title.trim() ? "#000" : "#555", cursor: screen.title.trim() ? "pointer" : "not-allowed" }}>
            Place in Video →
          </button>
        </div>
      </div>
    );
  }

  /* ── Step 2: Place ── */
  return (
    <div style={{ position: "fixed", inset: 0, background: "#050505", zIndex: 900, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ flexShrink: 0, background: "#0a0a0a", borderBottom: "1px solid #151515", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => setStep("build")} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
          <ArrowLeft size={18} color="#666" />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: "#ddd" }}>Place in Video</div>
          <div style={{ fontSize: 10, color: "#444" }}>Step 2 of 2 — Slide to choose the cut point</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 110px", display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Mini preview */}
        <div>
          <div style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>YOUR SCREEN INSERT</div>
          <ScreenPreviewCard screen={screen} />
        </div>

        {/* Timeline placer */}
        <div>
          <div style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>DRAG TO SET CUT POINT</div>
          <div ref={trackRef}
            style={{ height: 56, background: "#111", borderRadius: 10, position: "relative", cursor: "col-resize", border: "1px solid #1a1a1a", userSelect: "none", touchAction: "none" }}
            onMouseDown={e => { isDragging.current = true; seekFromXY(e.clientX); }}
            onTouchStart={e => { e.preventDefault(); seekFromXY(e.touches[0].clientX); }}
            onTouchMove={e => { e.preventDefault(); seekFromXY(e.touches[0].clientX); }}>

            {/* Existing cut ghosts */}
            {existingCuts.map(m => (
              duration > 0 && <div key={m.id} style={{ position: "absolute", top: 0, bottom: 0, left: `${(m.timestamp / duration) * 100}%`, width: 2, background: "#60a5fa33", pointerEvents: "none" }} />
            ))}

            {/* Active placement line */}
            <div style={{ position: "absolute", top: 0, bottom: 0, left: `${placePct}%`, transform: "translateX(-50%)", zIndex: 3, display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "none" }}>
              <div style={{ width: 3, height: "100%", background: ORANGE }} />
              <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", width: 26, height: 26, background: ORANGE, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Scissors size={12} color="#000" />
              </div>
            </div>

            {/* Time labels */}
            {duration > 0 && [0, 0.25, 0.5, 0.75, 1].map(t => (
              <div key={t} style={{ position: "absolute", left: `${t * 100}%`, bottom: 4, fontSize: 8, color: "#333", transform: t === 1 ? "translateX(-100%)" : t === 0 ? "none" : "translateX(-50%)", userSelect: "none", pointerEvents: "none" }}>
                {formatTime(t * (duration || 0))}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
            <div style={{ background: "#111", borderRadius: 8, padding: "6px 16px", fontSize: 16, fontWeight: 900, color: ORANGE, letterSpacing: 0.5 }}>
              ✂ {formatTime(placementTime)}
            </div>
          </div>
        </div>

        {/* Hold duration */}
        <div>
          <div style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>SCREEN HOLD DURATION</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[2, 4, 6, 8, 10].map(s => (
              <button key={s} onClick={() => setHoldSec(s)}
                style={{ flex: 1, padding: "10px 0", borderRadius: 10, background: holdSec === s ? ORANGE : "#111", border: `1px solid ${holdSec === s ? ORANGE : "#222"}`, fontSize: 13, fontWeight: 700, color: holdSec === s ? "#000" : "#666", cursor: "pointer" }}>
                {s}s
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#444", marginTop: 6, textAlign: "center" }}>
            Video pauses for this long while the screen is shown
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ flexShrink: 0, padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", background: "#0a0a0a", borderTop: "1px solid #151515" }}>
        <button
          onClick={() => onInsert(placementTime, {
            title: screen.title,
            subtitle: screen.subtitle || undefined,
            bgColor: screen.bgColor,
            bodyLines: screen.bodyLines.filter(Boolean),
          }, holdSec)}
          style={{ width: "100%", background: ORANGE, border: "none", borderRadius: 14, padding: "16px", fontSize: 15, fontWeight: 800, color: "#000", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Scissors size={16} color="#000" /> Cut & Insert Here
        </button>
      </div>
    </div>
  );
}

// ── Preparing-video message — cycles through on-brand lines while thumbnail
// extraction runs, crossfading between them instead of sitting static. ───────
const PREPARING_MESSAGES = [
  "Patience is key.",
  "Just wait — the strong cases always are.",
  "Building your evidence, frame by frame.",
  "Every case worth winning takes a little prep.",
  "Justice doesn't rush. Neither will this.",
  "This is a one-time thing.",
  "Almost there — hang tight.",
];

function PreparingVideoMessage() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const cycle = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % PREPARING_MESSAGES.length);
        setVisible(true);
      }, 350);
    }, 2800);
    return () => clearInterval(cycle);
  }, []);

  return (
    <span style={{
      fontSize: 12, color: "#888", fontWeight: 600,
      opacity: visible ? 1 : 0,
      transition: "opacity 0.35s ease",
      display: "inline-block",
    }}>
      {PREPARING_MESSAGES[idx]}
    </span>
  );
}

// ── Preview Screen Overlay ────────────────────────────────────────────────────
function PreviewScreenOverlay({ marker, onDone }: { marker: ExhibitMarker; onDone: () => void }) {
  if (marker.type === "exhibit_screen" && marker.exhibitScreen) {
    const vw = typeof window !== "undefined" ? window.innerWidth : 390;
    const vh = typeof window !== "undefined" ? window.innerHeight : 844;
    const scale = Math.min(vw / 1920, vh / 1080);
    return (
      <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <ExhibitRenderer content={marker.exhibitScreen.content} scale={scale} />
        <button onClick={onDone}
          style={{ position: "fixed", bottom: 32, right: 24, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "8px 16px", fontSize: 12, color: "rgba(255,255,255,0.5)", cursor: "pointer" }}>
          Skip
        </button>
      </div>
    );
  }

  const si = marker.screenInsert;
  if (!si) return null;
  const isLight = si.bgColor === "#f0f0f0";
  const textColor = isLight ? "#111" : "#fff";
  const mutedColor = isLight ? "#555" : "#bbb";
  return (
    <div style={{ position: "fixed", inset: 0, background: si.bgColor, zIndex: 500, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 32px", textAlign: "center" }}>
      <div style={{ maxWidth: 600, width: "100%" }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: textColor, lineHeight: 1.2, marginBottom: si.subtitle ? 12 : 0 }}>
          {si.title}
        </div>
        {si.subtitle && (
          <div style={{ fontSize: 16, color: mutedColor, marginBottom: 20 }}>{si.subtitle}</div>
        )}
        {si.bodyLines.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, textAlign: "left", marginTop: 20 }}>
            {si.bodyLines.map((line, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: ORANGE, marginTop: 9, flexShrink: 0 }} />
                <div style={{ fontSize: 16, color: mutedColor, lineHeight: 1.5 }}>{line}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Skip button */}
      <button onClick={onDone}
        style={{ position: "fixed", bottom: 32, right: 24, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "8px 16px", fontSize: 12, color: "rgba(255,255,255,0.5)", cursor: "pointer" }}>
        Skip
      </button>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
interface Props {
  hlCase: HLCase;
  onUpdateCase: (c: HLCase) => void;
  onBack: () => void;
  /** Admin/tester accounts only — the diagnostic overlay dumps raw internal
   *  state (file paths, playback events, picker results) that regular users
   *  have no use for and shouldn't see. */
  showDebug?: boolean;
}

export default function VideoWorkspaceView({ hlCase, onUpdateCase, onBack, showDebug = false }: Props) {
  // ── Video state ────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement>(null); // dedicated thumbnail extractor
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const videoUrlRef = useRef<string | null>(null);
  // The native FilePicker plugin copies every picked file into its own new
  // folder under the app's Caches directory (confirmed by reading the
  // plugin's iOS source) and never deletes it — that copy has nothing to do
  // with our own "video never leaves the device" storage model, it's a side
  // effect of the OS picker handing off a stable file. Left unmanaged, every
  // video ever picked across every session sits there permanently, which is
  // exactly what was silently filling up "Documents & Data" on-device.
  // Tracking the path here lets us delete the previous copy the moment it's
  // replaced by a new pick, instead of leaving it behind forever.
  const nativePickedPathRef = useRef<string | null>(null);
  function deleteNativePickedFile(path: string | null) {
    if (!path) return;
    Filesystem.deleteFile({ path }).catch(() => {}); // best-effort — nothing user-facing depends on this succeeding
  }
  const [videoFileName, setVideoFileName] = useState(hlCase.studioProject?.videoFileName ?? "");
  const [duration, setDuration] = useState(hlCase.studioProject?.videoDurationSec ?? 0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [largFileWarning, setLargeFileWarning] = useState(false);
  // Cross-device continuation (sign in elsewhere, re-pick "the same" video,
  // resume where you left off) relies on markers' saved timestamps still
  // lining up with the newly loaded file. There's no way to verify it's
  // truly the same file, but a duration check catches the common failure
  // case — a re-export, a different trim, or genuinely the wrong video —
  // before the user silently generates exhibits from the wrong timestamps.
  const [videoMismatchWarning, setVideoMismatchWarning] = useState<string | null>(null);
  const expectedDurationRef = useRef<number | null>(null);
  // Guards the Infinity-duration probe seek (below) to at most once per video
  // load. Some browsers keep re-firing durationchange with Infinity instead
  // of resolving it after a single seek — without this guard, every one of
  // those re-fires forces another seek on the live player, which is
  // indistinguishable from "plays a couple seconds, then stops for good."
  const infinityProbeAttemptedRef = useRef(false);
  // ── Import loading state (CapCut-style feedback) ────────────────
  const [videoLoading, setVideoLoading] = useState(false);
  const [loadingFileName, setLoadingFileName] = useState("");
  // ── Drag-and-drop ───────────────────────────────────────────────
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  // ── Markers ────────────────────────────────────────────────────
  const [markers, setMarkersRaw] = useState<ExhibitMarker[]>(() => {
    const sp = hlCase.studioProject;
    if (!sp) return [];
    // Treat the project as gone if its TTL has already passed on this device
    if (sp.expiresAt && sp.expiresAt < Date.now()) return [];
    return sp.markers ?? [];
  });
  // Undo/redo covers both markers AND chunks together, so chunking/splitting/
  // removing a moment is undoable too, not just marker-only edits (Exhibit step).
  type UndoSnapshot = { markers: ExhibitMarker[]; chunks: VideoChunk[] };
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<UndoSnapshot[]>([]);
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);
  const [viewingDraftId, setViewingDraftId] = useState<string | null>(null);

  // ── Dictation ──────────────────────────────────────────────────
  const [isDictating, setIsDictating] = useState(false);
  const [dictationText, setDictationText] = useState("");
  const [dictationMarkerId, setDictationMarkerId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  // ── Cut screen builder ─────────────────────────────────────────
  const [showCutBuilder, setShowCutBuilder] = useState(false);
  // ── Chunk / step state ─────────────────────────────────────────
  const [chunks, setChunks] = useState<VideoChunk[]>(() => hlCase.studioProject?.chunks ?? []);
  const [currentStep, setCurrentStep] = useState(hlCase.studioProject?.workflowStep ?? 1);
  const [organizedSlots, setOrganizedSlots] = useState<(string | null)[]>(() => {
    const saved = hlCase.studioProject?.organizedSlots;
    return saved && saved.length >= 10 ? saved : Array(10).fill(null);
  });
  const [aiOrganizing, setAiOrganizing] = useState(false);
  const [aiOrganizeReason, setAiOrganizeReason] = useState<string | null>(null);
  // Chunking and labeling now happen together in Step 1 — this tracks the
  // most recently created chunk so its label input can be auto-focused,
  // keeping the flow "chunk it, immediately say what happened, chunk the
  // next one" instead of a separate labeling pass afterward.
  const [lastChunkedId, setLastChunkedId] = useState<string | null>(null);
  // Shared between the timeline segments and the Step 1 "MOMENT N" cards, so
  // selecting either one rings the same chunk on the timeline.
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(null);
  const [trashDragOver, setTrashDragOver] = useState(false);
  // Custom cursor-following ghost for the Band-Aid drag, instead of the
  // browser's native drag-image snapshot — some browsers render rounded
  // corners on that snapshot with an ugly black/square fringe around them.
  const [unsplitGhostPos, setUnsplitGhostPos] = useState<{ x: number; y: number } | null>(null);
  const transparentDragImgRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const img = new Image();
    img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7";
    transparentDragImgRef.current = img;
  }, []);
  // Two chunks can only be merged if they're actually touching in time — if a
  // moment in between was deleted (a video_cut gap), the two surrounding
  // chunks are adjacent in the array but NOT adjacent on the timeline, and
  // merging them would silently span across the deleted gap.
  const CHUNK_ADJACENCY_EPS = 0.15;
  function chunksAreAdjacent(a: VideoChunk, b: VideoChunk): boolean {
    return Math.abs(b.start - a.end) < CHUNK_ADJACENCY_EPS;
  }
  // Chunk-to-chunk splits ("merge") plus one more kind of healable edge: the
  // end of the LAST chunk, when there's still unchunked footage after it
  // ("trail"). That edge looks exactly like a real split on the track — the
  // labeled/thumbnailed moment just stops and plain filmstrip picks back up —
  // so it needs to be draggable-healable too, even though there's no second
  // chunk on the other side of it to merge into.
  const healableBoundaries: { time: number; leftChunkId: string; kind: "merge" | "trail" }[] = chunks.slice(0, -1)
    .map((c, i) => ({ time: c.end, leftChunkId: c.id, ok: chunksAreAdjacent(c, chunks[i + 1]) }))
    .filter(b => b.ok)
    .map(({ time, leftChunkId }) => ({ time, leftChunkId, kind: "merge" as const }));
  if (chunks.length > 0) {
    const last = chunks[chunks.length - 1];
    if (last.end < duration - CHUNK_ADJACENCY_EPS) {
      healableBoundaries.push({ time: last.end, leftChunkId: last.id, kind: "trail" });
    }
  }
  const labelInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  useEffect(() => {
    if (!lastChunkedId) return;
    labelInputRefs.current.get(lastChunkedId)?.focus();
  }, [lastChunkedId]);

  // ── Free dictation (Web Speech API) for the label field, Chrome/Android only ──
  const [listeningChunkId, setListeningChunkId] = useState<string | null>(null);
  const [showDictationHelp, setShowDictationHelp] = useState(false);
  const chunkRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  useEffect(() => () => chunkRecognitionRef.current?.stop(), []); // stop mic if the view unmounts mid-listen

  // ── Moment-card frame picker — pick the exact frame for a moment's thumbnail,
  // independent of the auto-picked opening frame the timeline uses ──────────
  const [framePickerChunkId, setFramePickerChunkId] = useState<string | null>(null);
  const [framePickerTime, setFramePickerTime] = useState(0);
  const framePickerVideoRef = useRef<HTMLVideoElement>(null);
  const framePickerChunk = chunks.find(c => c.id === framePickerChunkId) ?? null;

  function openFramePicker(chunkId: string, start: number) {
    setFramePickerChunkId(chunkId);
    setFramePickerTime(start);
  }

  function captureFramePickerFrame() {
    const vid = framePickerVideoRef.current;
    if (!vid || !framePickerChunk) return;
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(vid.videoWidth || 320, 480);
    canvas.height = Math.min(vid.videoHeight || 180, 270);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    const updated = chunks.map(x => x.id === framePickerChunk.id ? { ...x, thumbnailOverride: dataUrl } : x);
    setChunks(updated);
    triggerAutosave(markers, updated, organizedSlots, currentStep);
    setFramePickerChunkId(null);
  }

  function toggleDictation(chunkId: string) {
    if (!SpeechRecognitionCtor) { labelInputRefs.current.get(chunkId)?.focus(); return; }
    if (listeningChunkId === chunkId) { chunkRecognitionRef.current?.stop(); return; }
    chunkRecognitionRef.current?.stop();
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    let finalText = chunks.find(c => c.id === chunkId)?.label ?? "";
    recognition.onresult = e => {
      let transcript = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) transcript += result[0].transcript;
      }
      if (!transcript.trim()) return;
      finalText = (finalText ? finalText + " " : "") + transcript.trim();
      const text = finalText;
      const updated = chunks.map(x => x.id === chunkId ? { ...x, label: text } : x);
      setChunks(updated);
      triggerAutosave(markers, updated, organizedSlots, currentStep);
      // The label input is uncontrolled now (defaultValue, not value — see
      // its own comment for why), so React won't reflect this state update
      // into the DOM on its own. Write it directly through the ref instead,
      // on the platforms where SpeechRecognition actually exists to reach
      // this code at all (iOS never does — see the !SpeechRecognitionCtor
      // branch above).
      const inputEl = labelInputRefs.current.get(chunkId);
      if (inputEl) inputEl.value = text;
    };
    recognition.onerror = () => setListeningChunkId(null);
    recognition.onend = () => setListeningChunkId(null);
    chunkRecognitionRef.current = recognition;
    setListeningChunkId(chunkId);
    labelInputRefs.current.get(chunkId)?.focus();
    recognition.start();
  }
  // ── Video thumbnails ───────────────────────────────────────────
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [thumbsLoading, setThumbsLoading] = useState(false);
  // Thumbnails cached from a previous session (loaded alongside the video
  // blob on mount) — if present, the extraction effect uses these directly
  // instead of re-running the whole seek-by-seek capture pass. Cleared after
  // being consumed once so a later "Change video" doesn't reuse stale frames.
  const cachedThumbsRef = useRef<string[] | null>(null);
  // ── On-screen debug log (thumbnail + native-picker diagnostics) ──
  // Kept on permanently as a pull-out sidebar (not a fixed overlay) with a
  // copy button, so it's available for reporting future issues without
  // getting in the way of normal use (the console [thumbs]/[PICKER] logs
  // always run regardless of this flag). Admin/tester accounts only — see
  // showDebug's own doc comment on Props.
  const THUMB_DEBUG = showDebug;
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const debugLogRef = useRef<string[]>([]);
  const pushDebug = useCallback((line: string) => {
    if (!THUMB_DEBUG) return;
    debugLogRef.current = [...debugLogRef.current, line];
    setDebugLog([...debugLogRef.current]);
  }, [THUMB_DEBUG]);
  // Closed by default — a pull-tab on the edge opens it as a sidebar instead
  // of a fixed bottom overlay always covering part of the screen.
  const [debugSidebarOpen, setDebugSidebarOpen] = useState(false);
  const [debugCopied, setDebugCopied] = useState(false);

  // ── Preview mode ───────────────────────────────────────────────
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [previewOverlayMarkerId, setPreviewOverlayMarkerId] = useState<string | null>(null);
  const previewTriggeredRef = useRef<Set<string>>(new Set());
  // Sequenced preview — when the user has organized moments in Step 2, Preview
  // plays clip → exhibit → clip in THAT order instead of raw chronological
  // order. previewSeqIndex is the position within previewSequence currently
  // playing; null means "no organized order, fall back to chronological."
  const [previewSeqIndex, setPreviewSeqIndex] = useState<number | null>(null);
  const sequencedHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Jurisdiction verification ──────────────────────────────────
  const [verifying, setVerifying] = useState(false);
  const [showVerifResult, setShowVerifResult] = useState(false);
  const verification = hlCase.studioProject?.jurisdictionVerification;

  // ── Autosave ───────────────────────────────────────────────────
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── AI Exhibit Screen ───────────────────────────────────────────
  const [showExhibitGenerator, setShowExhibitGenerator] = useState(false);

  // ── Case photo (barrel screen) — picked from this video's own thumbnails ──
  const [showCasePhotoPicker, setShowCasePhotoPicker] = useState(false);
  const casePhotoInputRef = useRef<HTMLInputElement>(null);

  // On native, "Add Video" offers a choice between Photos and Files — the
  // plugin exposes these as two distinct native pickers, unlike the single
  // HTML <input type=file> sheet on web that already offers both at once.
  const [showNativeSourceChoice, setShowNativeSourceChoice] = useState(false);
  // Set while the "you already have saved moments" confirmation is showing —
  // holds which input ref to actually open once the user confirms.
  const [pendingFilePickerRef, setPendingFilePickerRef] = useState<React.RefObject<HTMLInputElement | null> | null>(null);

  // ── Media inserts ───────────────────────────────────────────────
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const mediaBlobUrlsRef = useRef<string[]>([]); // tracked for revocation on unmount
  const [insertToast, setInsertToast] = useState<string | null>(null);
  const insertToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Paste-back for copyAllMomentInfo's own output — lets someone who saved
  // that text elsewhere (or is recovering from a bad sync) rebuild real
  // chunks with the exact original timestamps instead of re-scrubbing the
  // whole video by eye.
  const [showPasteMoments, setShowPasteMoments] = useState(false);
  const [pasteMomentsText, setPasteMomentsText] = useState("");

  // ── Export ─────────────────────────────────────────────────────
  const [showExport, setShowExport] = useState(false);
  // Info panel — auto-opens on first visit; ⓘ button toggles it afterward
  const [infoPanelOpen, setInfoPanelOpen] = useState(() => {
    try { return !localStorage.getItem("studio-info-seen"); } catch { return true; }
  });
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    resKey: "1080", fps: 30, format: "mp4", includeAudio: true,
  });

  // ── IndexedDB recovery ─────────────────────────────────────────
  const [recoverySnapshot, setRecoverySnapshot] = useState<StudioSnapshot | null>(null);
  const idbSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTimeRef = useRef(0);
  // snapshotRef holds latest values so the debounced IDB write always sees fresh data
  const snapshotRef = useRef<{ markers: ExhibitMarker[]; chunks: VideoChunk[]; organizedSlots: (string | null)[]; workflowStep: number; videoFileName: string; videoDurationSec: number; exportSettings: ExportSettings }>({
    markers: hlCase.studioProject?.markers ?? [],
    chunks: hlCase.studioProject?.chunks ?? [],
    organizedSlots: hlCase.studioProject?.organizedSlots ?? Array(10).fill(null),
    workflowStep: hlCase.studioProject?.workflowStep ?? 1,
    videoFileName: hlCase.studioProject?.videoFileName ?? "",
    videoDurationSec: hlCase.studioProject?.videoDurationSec ?? 0,
    exportSettings: { resKey: "1080", fps: 30, format: "mp4", includeAudio: true },
  });
  // Keep snapshotRef current on every render (synchronous, safe)
  snapshotRef.current.markers = markers;
  snapshotRef.current.chunks = chunks;
  snapshotRef.current.organizedSlots = organizedSlots;
  snapshotRef.current.workflowStep = currentStep;
  snapshotRef.current.videoFileName = videoFileName;
  snapshotRef.current.videoDurationSec = duration;
  snapshotRef.current.exportSettings = exportSettings;

  // Keeps this already-mounted workspace in sync with studio work saved on
  // ANOTHER device. markers/chunks/etc above are only read from hlCase once,
  // in their useState initializers at mount — if this case's studioProject
  // changes afterward (the App-level server->local merge landing after its
  // own fetch, which is async and can resolve after this component already
  // mounted from a stale snapshot), nothing here would ever pick that up.
  // Worse: the very next autosave from this device (even just reloading the
  // video to keep working) would then save that stale/empty local state
  // right back to the server, silently erasing the other device's real
  // work. Comparing updatedAt (rather than just re-syncing on every prop
  // change) avoids that same autosave loop overwriting this device's own
  // in-progress edits with what it just saved a moment ago.
  const lastSyncedProjectUpdatedAtRef = useRef(hlCase.studioProject?.updatedAt ?? 0);
  useEffect(() => {
    const sp = hlCase.studioProject;
    if (!sp || sp.updatedAt <= lastSyncedProjectUpdatedAtRef.current) return;
    // A newer timestamp doesn't mean better data — this device's own real,
    // already-chunked moments must never be replaced by an incoming project
    // that has nothing in it, no matter what the timestamps say (this is
    // exactly what wiped real moments before this guard existed: an empty
    // project autosaved elsewhere raced past real local work on a mere
    // timestamp compare). Still bump the ref so this same stale-but-newer
    // value doesn't get re-evaluated on every render.
    const incomingHasContent = (sp.chunks?.length ?? 0) > 0 || (sp.markers?.length ?? 0) > 0;
    const localHasContent = chunks.length > 0 || markers.length > 0;
    lastSyncedProjectUpdatedAtRef.current = sp.updatedAt;
    if (localHasContent && !incomingHasContent) return;
    const expired = sp.expiresAt && sp.expiresAt < Date.now();
    setMarkersRaw(expired ? [] : (sp.markers ?? []));
    setChunks(sp.chunks ?? []);
    setOrganizedSlots(sp.organizedSlots && sp.organizedSlots.length >= 10 ? sp.organizedSlots : Array(10).fill(null));
    setCurrentStep(sp.workflowStep ?? 1);
    setVideoFileName(sp.videoFileName ?? "");
    setDuration(sp.videoDurationSec ?? 0);
  }, [hlCase.studioProject]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ────────────────────────────────────────────────────
  function getOrCreateProject(): StudioProject {
    return hlCase.studioProject ?? {
      id: crypto.randomUUID(),
      caseId: hlCase.id,
      videoFileName,
      videoDurationSec: duration,
      markers: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  function pushUndoSnapshot() {
    setUndoStack(s => [...s.slice(-20), { markers, chunks }]);
    setRedoStack([]);
  }

  function setMarkers(updated: ExhibitMarker[], pushUndo = true) {
    if (pushUndo) pushUndoSnapshot();
    setMarkersRaw(updated);
    triggerAutosave(updated);
    triggerIndexedDBSave();
  }

  function updateMarkerHold(markerId: string, sec: number) {
    setMarkers(markers.map(m => (m.id === markerId ? { ...m, holdSec: sec } : m)), false);
  }

  function triggerAutosave(
    updatedMarkers: ExhibitMarker[],
    updatedChunks?: VideoChunk[],
    updatedSlots?: (string | null)[],
    updatedStep?: number,
  ) {
    setAutosaveStatus("saving");
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      const project = getOrCreateProject();
      // Read from snapshotRef so we always get the latest values — calling code
      // may have just called setState and closures still hold stale values.
      const expiresAt = Date.now() + EXPIRY_MS;
      const next: StudioProject = {
        ...project,
        videoFileName: snapshotRef.current.videoFileName,
        videoDurationSec: snapshotRef.current.videoDurationSec,
        markers: updatedMarkers,
        chunks: updatedChunks ?? snapshotRef.current.chunks,
        organizedSlots: updatedSlots ?? snapshotRef.current.organizedSlots,
        workflowStep: updatedStep ?? snapshotRef.current.workflowStep,
        updatedAt: Date.now(),
        expiresAt,
      };
      const updatedCase = { ...hlCase, studioProject: next };
      onUpdateCase(updatedCase);
      // Chunk & Label edits (markMoment, splitChunk, label onChange, etc.)
      // only ever called triggerAutosave, never triggerIndexedDBSave — so
      // the one local crash-recovery net this app has never actually caught
      // real chunked moments, only the separate/older markers flow. Piggy-
      // backing it onto every real save here means it now does.
      triggerIndexedDBSave();
      // "Saved" used to be confirmed by keepAlive succeeding — but keepAlive
      // only refreshes this project's expiry timer, it carries no actual
      // data. The real write (markers/chunks/labels) went through
      // onUpdateCase above, which only reaches the server via App.tsx's own
      // 1500ms-debounced, fire-and-forget sync — meaning "Saved" could show
      // here while the edits themselves were still sitting unsent, and would
      // be lost outright if the app got backgrounded/closed before that
      // debounce fired. Awaiting the actual case upsert directly here closes
      // both gaps: "Saved" now means the data really reached the server, and
      // it isn't at the mercy of a timer that can die with the app.
      try {
        await api.cases.upsert(updatedCase.id, updatedCase.title, updatedCase.workflowStage, updatedCase as unknown as Record<string, unknown>);
        api.studioProject.keepAlive(hlCase.id).catch(() => {}); // best-effort expiry refresh, not load-bearing for correctness
        setAutosaveStatus("saved");
        autosaveTimer.current = setTimeout(() => setAutosaveStatus("idle"), 2500);
      } catch {
        setAutosaveStatus("error");
      }
    }, 800);
  }

  /** Manually reset the retention clock without requiring an actual edit —
   *  for the tap-to-extend timer next to the info button. Any real edit
   *  already does this automatically via triggerAutosave; this is for when
   *  there's nothing to change yet but the user still wants more time. */
  function extendExpiry() {
    const project = getOrCreateProject();
    const expiresAt = Date.now() + EXPIRY_MS;
    onUpdateCase({ ...hlCase, studioProject: { ...project, expiresAt, updatedAt: Date.now() } });
    api.studioProject.keepAlive(hlCase.id).catch(() => {/* non-fatal */});
    showInsertToast(`Saved until ${new Date(expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
  }

  /** Debounced IndexedDB save — 3 s after last call, writes the full snapshot.
   *  Reads from snapshotRef so it always captures the latest state even if
   *  called from a closure that has stale marker/settings values. */
  function triggerIndexedDBSave() {
    if (idbSaveTimer.current) clearTimeout(idbSaveTimer.current);
    idbSaveTimer.current = setTimeout(async () => {
      await saveStudioSnapshot({
        caseId: hlCase.id,
        savedAt: Date.now(),
        markers: snapshotRef.current.markers,
        chunks: snapshotRef.current.chunks,
        timelinePosition: currentTimeRef.current,
        videoFileName: snapshotRef.current.videoFileName,
        exportSettings: snapshotRef.current.exportSettings,
      });
    }, 3000);
  }

  async function handleRestore() {
    if (!recoverySnapshot) return;
    setMarkersRaw(recoverySnapshot.markers);
    setChunks(recoverySnapshot.chunks);
    setExportSettings(recoverySnapshot.exportSettings);
    setRecoverySnapshot(null);
    await clearStudioSnapshot(hlCase.id);
    // Immediately persist restored markers/chunks to server
    triggerAutosave(recoverySnapshot.markers, recoverySnapshot.chunks);
  }

  async function handleDiscard() {
    setRecoverySnapshot(null);
    await clearStudioSnapshot(hlCase.id);
  }

  function undo() {
    if (!undoStack.length) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack(s => [...s, { markers, chunks }]);
    setUndoStack(s => s.slice(0, -1));
    setMarkersRaw(prev.markers);
    setChunks(prev.chunks);
    triggerAutosave(prev.markers, prev.chunks);
  }

  function redo() {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(s => [...s, { markers, chunks }]);
    setRedoStack(s => s.slice(0, -1));
    setMarkersRaw(next.markers);
    setChunks(next.chunks);
    triggerAutosave(next.markers, next.chunks);
  }

  // ── Video controls ─────────────────────────────────────────────
  // The raw video is never uploaded anywhere — same model as CapCut/iMovie:
  // editing happens against the local file for this session only, and only
  // the edits themselves (markers, chunks, exhibit screens — see
  // triggerAutosave) and the final exported video (a real download, already
  // small and re-encoded) are guaranteed to persist. Reopening this case in
  // a later session means re-picking the same file, same as reopening a
  // project in any desktop video editor whose media went offline.
  //
  // cachedThumbnails: pass the previously-cached filmstrip (see
  // studioIndexedDB's thumbnail cache) so it doesn't get regenerated when the
  // same file is re-picked. Omit (or leave undefined) for a genuinely new
  // file — this always resets the ref, so a stale filmstrip from a
  // *different* video can never leak into a new one.
  // Accepts either a real File (web picker / native small-enough files read
  // back as a Blob) or a direct native URL (native picker's usual path for
  // anything of real size — see pickVideoNative's header comment for why
  // fetching the whole file into a Blob first isn't viable for large video).
  type VideoSource = File | { url: string; fileName: string; size?: number };
  function loadVideo(source: VideoSource, cachedThumbnails?: string[]) {
    const isFile = source instanceof File;
    const fileName = isFile ? source.name : source.fileName;
    const size = isFile ? source.size : (source.size ?? 0);

    cachedThumbsRef.current = cachedThumbnails?.length ? cachedThumbnails : null;
    setVideoError(null);
    setVideoMismatchWarning(null);
    // Only check when there are existing moments to protect (a resume, not a
    // first upload) and a prior duration was actually saved to compare against.
    expectedDurationRef.current =
      markers.length > 0 && hlCase.studioProject?.videoDurationSec
        ? hlCase.studioProject.videoDurationSec
        : null;
    infinityProbeAttemptedRef.current = false;
    // Informational only — large files just take longer to decode/thumbnail
    // locally, nothing stops them from working the way an upload-size cap
    // would (there's no upload anymore).
    setLargeFileWarning(size > LARGE_FILE_NOTICE_BYTES);
    // Show import loading state immediately — before any decoding happens
    setVideoLoading(true);
    setLoadingFileName(fileName);

    // Revoke the previous blob URL to free memory. Harmless no-op if it
    // wasn't actually a blob: URL (e.g. a native capacitor:// file URL).
    if (videoUrlRef.current) {
      URL.revokeObjectURL(videoUrlRef.current);
      videoUrlRef.current = null;
    }
    const url = isFile ? URL.createObjectURL(source) : source.url;
    videoUrlRef.current = url;

    // Set state so React renders the <video> element
    setVideoUrl(url);
    setVideoFileName(fileName);
    setCurrentTime(0);
    setIsPlaying(false);

    // Also wire the ref directly — React may batch the state update and the
    // video element might already be mounted from a previous load
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = url;
      videoRef.current.load();
    }

    // Persist the filename immediately — snapshotRef will be updated on the
    // next render so the 800 ms debounce always captures the new value.
    snapshotRef.current.videoFileName = fileName;
    triggerAutosave(markers);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      // Cached thumbnails (keyed by caseId, from a previous session) let a
      // re-picked video skip straight past the frame-extraction pass — but
      // ONLY when it's genuinely the same file being reloaded. The cache
      // isn't keyed by which video, so reusing it unconditionally after
      // switching to a different file was exactly why the filmstrip kept
      // showing the previous video's frames instead of the new one's.
      loadThumbnails(hlCase.id).then(cached =>
        loadVideo(file, cached?.fileName === file.name ? cached.thumbnails : undefined)
      );
    }
    // Reset so same file can be picked again
    e.target.value = "";
  }

  function showInsertToast(msg: string) {
    if (insertToastTimer.current) clearTimeout(insertToastTimer.current);
    setInsertToast(msg);
    // Short confirmations ("Clip added to timeline") only need a flash; longer
    // messages (error explanations) need real time to actually read.
    const duration = msg.length > 40 ? 5000 : 2500;
    insertToastTimer.current = setTimeout(() => setInsertToast(null), duration);
  }

  function copyAllMomentInfo() {
    const ordered = [...chunks].sort((a, b) => a.start - b.start);
    const text = ordered
      .map((c, i) => {
        const lines = [`Moment ${i + 1} — ${formatTime(c.start)}–${formatTime(c.end)}`];
        if (c.name?.trim()) lines.push(c.name.trim());
        if (c.label?.trim()) lines.push(c.label.trim());
        return lines.join("\n");
      })
      .join("\n\n");
    navigator.clipboard.writeText(text)
      .then(() => showInsertToast("Copied all moment info"))
      .catch(() => showInsertToast("Couldn't copy — try again"));
  }

  /** Inverse of formatTime — "1:02:03" / "2:03" / "45" -> seconds. */
  function parseTimeToSeconds(str: string): number | null {
    const parts = str.trim().split(":").map(p => parseInt(p, 10));
    if (parts.length === 0 || parts.some(Number.isNaN)) return null;
    return parts.reduce((acc, p) => acc * 60 + p, 0);
  }

  /** Parses copyAllMomentInfo's own output back into real chunks — matches
   *  on the "Moment N — start–end" header line and takes everything up to
   *  the next header (not just the next blank line) as that moment's body,
   *  so a multi-paragraph "what happened here" doesn't get cut short. A
   *  single leftover line is treated as the label (the field people
   *  actually rely on); two or more treats the first as the short name and
   *  the rest as the label, mirroring exactly what copyAllMomentInfo wrote. */
  function parseMomentInfo(text: string): VideoChunk[] {
    const headerRe = /Moment\s+\d+\s*[-–—]\s*([\d:]+)\s*[-–—]\s*([\d:]+)/g;
    const matches = [...text.matchAll(headerRe)];
    const results: VideoChunk[] = [];
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const start = parseTimeToSeconds(m[1]);
      const end = parseTimeToSeconds(m[2]);
      if (start == null || end == null || end <= start) continue;
      const bodyStart = (m.index ?? 0) + m[0].length;
      const bodyEnd = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
      const lines = text.slice(bodyStart, bodyEnd).split("\n").map(l => l.trim()).filter(Boolean);
      const name = lines.length >= 2 ? lines[0] : undefined;
      const label = lines.length >= 2 ? lines.slice(1).join("\n") : (lines[0] ?? "");
      results.push({ id: crypto.randomUUID(), start, end, name, label });
    }
    return results;
  }

  function importPastedMoments() {
    const parsed = parseMomentInfo(pasteMomentsText);
    if (parsed.length === 0) {
      showInsertToast("Couldn't find any moments in that text — check it matches the copied format");
      return;
    }
    pushUndoSnapshot();
    const updated = [...chunks, ...parsed].sort((a, b) => a.start - b.start);
    setChunks(updated);
    setShowPasteMoments(false);
    setPasteMomentsText("");
    triggerAutosave(markers, updated, organizedSlots, currentStep);
    showInsertToast(`Imported ${parsed.length} moment${parsed.length !== 1 ? "s" : ""}`);
  }

  // Raw HTML <input type="file"> inside a Capacitor WKWebView is a known,
  // documented source of native flakiness on iOS (flashes open/closed,
  // sometimes crashes) — confirmed on this app: the identical picker works
  // fine in plain mobile Safari, only breaks in the installed app. On native
  // platforms, use Capacitor's own file-picker plugin instead, which drives
  // the native UIDocumentPickerViewController/PHPickerViewController through
  // Capacitor's bridge rather than leaving it to WKWebView's default
  // <input type=file> handling. Falls back to the plain HTML input on web,
  // where it already works correctly.
  // Real-device diagnostic confirmed the actual failure: fetch() on a
  // Capacitor-converted capacitor:// URL for a large (2.4GB) picked video
  // fails outright with a generic "Load failed" — a known WKWebView
  // limitation reading very large local files back through a custom URL
  // scheme handler's response mechanism. Loading the whole file into a JS
  // Blob first was never necessary anyway: the plugin already copies the
  // picked file into the app's own sandboxed cache directory (confirmed by
  // reading the plugin's iOS Swift source directly), so the converted URL is
  // a real, stable, same-origin file the <video> element can be pointed at
  // directly — it streams progressively from there exactly like it would
  // from any other src, the same way native video players handle multi-hour
  // footage, and never needs the whole file in memory at once.
  async function pickVideoNative(source: "photos" | "files"): Promise<{ url: string; fileName: string; size?: number; nativePath?: string } | null> {
    pushDebug(`[PICKER] FilePicker.${source === "photos" ? "pickVideos" : "pickFiles"}() calling...`);
    // pickFiles' types must be real MIME types — the plugin's iOS side maps
    // each one through UTTypeCreatePreferredIdentifierForTag, which doesn't
    // understand wildcards ("video/*") or bare UTIs ("public.movie"); either
    // would silently fail to resolve and fall back to accepting any file.
    const result = source === "photos"
      ? await FilePicker.pickVideos({ limit: 1 })
      : await FilePicker.pickFiles({ types: ["video/mp4", "video/quicktime", "video/x-m4v", "video/mpeg"], limit: 1 });
    const picked = result.files[0];
    pushDebug(`[PICKER] result: name="${picked?.name}" size=${picked?.size} mimeType="${picked?.mimeType}" hasBlob=${!!picked?.blob} path="${picked?.path}"`);
    if (!picked) return null;
    if (picked.path) {
      const src = Capacitor.convertFileSrc(picked.path);
      pushDebug(`[PICKER] using native src directly (no fetch): "${src}"`);
      // nativePath (the plugin's own file:// copy, not the capacitor://
      // src above) is what deleteNativePickedFile needs — kept separate so
      // callers can clean up the plugin's Caches copy once it's replaced.
      return { url: src, fileName: picked.name, size: picked.size, nativePath: picked.path };
    }
    if (picked.blob) return { url: URL.createObjectURL(picked.blob), fileName: picked.name, size: picked.blob.size };
    return null;
  }

  // MUST fire synchronously inside the original tap handler on web — iOS
  // Safari only honors input.click() as a real file-picker trigger when it's
  // part of the actual user-gesture call stack (this file already has a
  // similar note on video.load()). An earlier version of this function
  // deferred the click via requestAnimationFrame to dodge a suspected
  // animation-timing race, which instead made the picker present outside the
  // trusted gesture and flicker open/closed continuously on every attempt —
  // worse than the original rare glitch it was meant to fix. Don't reintroduce
  // that deferral for the web fallback path.
  // Marker timestamps are tied to the exact video they were made against —
  // loading a different video (or even the same one re-exported/trimmed
  // differently) after moments already exist would silently desync every
  // timestamp from what it's actually pointing at. Once there's real
  // progress to protect, route through a confirmation step first rather
  // than opening the picker immediately.
  function openFilePicker(ref: React.RefObject<HTMLInputElement | null>) {
    if (markers.length > 0) {
      setPendingFilePickerRef(ref);
      return;
    }
    openFilePickerConfirmed(ref);
  }

  function openFilePickerConfirmed(ref: React.RefObject<HTMLInputElement | null>) {
    setPendingFilePickerRef(null);
    // isNativePlatform() alone isn't enough — it's true on ANY native build,
    // including ones installed before this plugin existed. This app loads its
    // web bundle live from the server, so a web deploy can ship this branch
    // before the matching native binary (with the plugin actually compiled
    // in) ever reaches the device — calling a plugin the installed binary
    // doesn't have silently fails, which looked like "tapping does nothing at
    // all." isPluginAvailable checks the ACTUAL installed binary, not just
    // the platform, and falls back to the HTML input either way.
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("FilePicker")) {
      setShowNativeSourceChoice(true);
      return;
    }
    ref.current?.click();
  }

  function pickFromNativeSource(source: "photos" | "files") {
    setShowNativeSourceChoice(false);
    pickVideoNative(source)
      .then(async picked => {
        if (!picked) return;
        // Only reuse the cache if it's actually for this same file — see
        // handleFileChange's matching comment for why that check matters.
        const cached = await loadThumbnails(hlCase.id);
        loadVideo(picked, cached?.fileName === picked.fileName ? cached.thumbnails : undefined);
        // The plugin's own Caches copy of whatever was picked BEFORE this one
        // is now fully replaced — nothing else references it, so it can be
        // deleted instead of sitting there forever (see nativePickedPathRef).
        const previousPath = nativePickedPathRef.current;
        nativePickedPathRef.current = picked.nativePath ?? null;
        if (previousPath && previousPath !== picked.nativePath) deleteNativePickedFile(previousPath);
      })
      .catch((err: unknown) => {
        pushDebug(`[PICKER] FAILED: ${(err as Error)?.message || err}`);
        // A genuine cancel (user backed out of the picker) also lands here —
        // only surface an error banner if there's an actual message to show,
        // so cancelling isn't treated as a failure.
        const msg = (err as Error)?.message;
        if (msg) setVideoError(`Couldn't load that video: ${msg}`);
      });
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    // Don't set isPlaying here — the video element's own onPlay/onPause
    // events (below) are the source of truth. Setting it optimistically
    // meant that if play() rejected (still buffering, not enough data yet),
    // the button would show "Pause" while the video was actually paused —
    // every subsequent press then just toggled between two wrong states.
    if (isPlaying) { v.pause(); }
    else { v.play().catch(() => {}); }
  }

  function seek(t: number) {
    const v = videoRef.current;
    if (v) { v.currentTime = t; setCurrentTime(t); }
  }

  // ── Sequenced preview (Organize step's order → Exhibit → Clip → Exhibit → Clip) ──
  // Chunks in the order the user (or the AI) organized them in Step 2, skipping
  // any empty slots or ids that no longer resolve to a chunk. Empty when the
  // user hasn't organized anything yet — Preview then falls back to playing
  // the raw video chronologically, same as before this feature existed.
  const previewSequence: VideoChunk[] = organizedSlots
    .filter((id): id is string => !!id)
    .map(id => chunks.find(c => c.id === id))
    .filter((c): c is VideoChunk => !!c);

  function exhibitMarkerForChunk(chunkId: string): ExhibitMarker | undefined {
    return markers.find(m => m.type === "exhibit_screen" && m.chunkId === chunkId);
  }

  function playChunkClip(index: number) {
    const chunk = previewSequence[index];
    if (!chunk) return;
    seek(chunk.start);
    const v = videoRef.current;
    if (v) v.play().catch(() => {});
    // isPlaying is left to the video element's own onPlay event — setting it
    // here regardless of whether play() actually succeeds is what caused the
    // play button to get stuck showing "Pause" while nothing was playing.
  }

  /** Show step `index`'s attached exhibit first (if any), then play its clip. */
  function playSequencedStep(index: number) {
    setPreviewSeqIndex(index);
    const chunk = previewSequence[index];
    if (!chunk) return;
    const exhibit = exhibitMarkerForChunk(chunk.id);
    if (exhibit) {
      const v = videoRef.current;
      if (v) v.pause();
      setIsPlaying(false);
      setPreviewOverlayMarkerId(exhibit.id);
      if (sequencedHoldTimerRef.current) clearTimeout(sequencedHoldTimerRef.current);
      sequencedHoldTimerRef.current = setTimeout(() => {
        setPreviewOverlayMarkerId(null);
        playChunkClip(index);
      }, (exhibit.holdSec ?? 8) * 1000);
    } else {
      playChunkClip(index);
    }
  }

  /** Advance from step `fromIndex` to the next one, or end the sequence. */
  function advanceSequencedPreview(fromIndex: number) {
    const nextIndex = fromIndex + 1;
    if (nextIndex >= previewSequence.length) {
      setPreviewSeqIndex(null);
      setPreviewOverlayMarkerId(null);
      setIsPreviewMode(false);
      const v = videoRef.current;
      if (v) v.pause();
      setIsPlaying(false);
      return;
    }
    playSequencedStep(nextIndex);
  }

  /** Opening-frame thumbnail for a chunk starting at `start` — same lookup the
   *  timeline uses, so a moment's card photo always matches its timeline clip. */
  function chunkThumb(start: number): string | null {
    if (!thumbnails.length || !duration) return null;
    const dt = duration / Math.max(1, thumbnails.length - 1);
    let best = 0, bestD = Infinity;
    thumbnails.forEach((_, i) => { const d = Math.abs(i * dt - start); if (d < bestD) { bestD = d; best = i; } });
    return thumbnails[best] ?? null;
  }

  /** One Chunk & Label moment card — shared by the "currently working on"
   *  floating slot and the regular list below it, so they stay identical. */
  function renderMomentCard(c: VideoChunk, displayIndex: number) {
    const thumb = c.thumbnailOverride ?? chunkThumb(c.start);
    const selected = selectedChunkId === c.id;
    return (
      <div key={c.id} style={{ background: "#0d0d0d",
        border: `1px solid ${selected ? ORANGE : "#1e1e1e"}`,
        boxShadow: selected ? `0 0 8px ${ORANGE}55` : "none",
        borderRadius: 12, padding: "12px 14px", transition: "all 0.12s",
        display: "flex", gap: 12 }}>
        <button
          onClick={() => openFramePicker(c.id, c.start)}
          title="Tap to pick the exact frame"
          style={{ width: 56, height: 56, borderRadius: 10, overflow: "hidden", flexShrink: 0,
            background: "#161616", border: "none", padding: 0, cursor: "pointer", position: "relative" }}>
          {thumb && <img src={thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ImageIcon size={14} color="rgba(255,255,255,0.75)" />
          </div>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <button
            onClick={() => setSelectedChunkId(v => v === c.id ? null : c.id)}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
              fontSize: 10, color: selected ? ORANGE : "#3a3a3a", fontWeight: 700, marginBottom: 7 }}>
            MOMENT {displayIndex + 1} · {formatTime(c.start)}–{formatTime(c.end)}
          </button>
          <input
            key={`${c.id}-name`}
            type="text"
            defaultValue={c.name ?? ""}
            placeholder="Short name (e.g. 'Officer arrives')"
            onChange={e => {
              const updated = chunks.map(x => x.id === c.id ? { ...x, name: e.target.value } : x);
              setChunks(updated);
              triggerAutosave(markers, updated, organizedSlots, currentStep);
            }}
            style={{ width: "100%", background: "#111", border: "1px solid #252525",
              borderRadius: 8, padding: "7px 12px", fontSize: 12, color: "#f0b87a",
              fontWeight: 700, outline: "none", boxSizing: "border-box", marginBottom: 6 }}
          />
          <div style={{ position: "relative", marginBottom: 8 }}>
            {/* defaultValue, not value — a fully React-controlled input here
                fights iOS's native dictation: every keystroke re-render
                rewrites the DOM's value out from under dictation's own
                progressive text insertion, which is exactly why dictation
                (and even fast manual typing) got a word in and then closed
                the keyboard. Uncontrolled lets the DOM own the value while
                typing; onChange still keeps chunks state in sync. Safe
                because each chunk row already has a stable key={c.id} above
                (confirmed before making this change) — switching to a
                genuinely different chunk always mounts a fresh input rather
                than reusing this one with stale defaultValue. */}
            <input
              key={`${c.id}-label`}
              ref={el => {
                if (el) labelInputRefs.current.set(c.id, el);
                else labelInputRefs.current.delete(c.id);
              }}
              type="text"
              defaultValue={c.label}
              placeholder="What happened here?"
              onChange={e => {
                const updated = chunks.map(x => x.id === c.id ? { ...x, label: e.target.value } : x);
                setChunks(updated);
                triggerAutosave(markers, updated, organizedSlots, currentStep);
              }}
              style={{ width: "100%", background: "#111", border: `1px solid ${listeningChunkId === c.id ? "#ef4444" : "#252525"}`,
                borderRadius: 8, padding: "9px 56px 9px 12px", fontSize: 13, color: "#ddd",
                fontWeight: 600, outline: "none", boxSizing: "border-box" }}
            />
            <button
              type="button"
              onClick={() => toggleDictation(c.id)}
              title={speechSupported ? "Tap to dictate" : "Tap, then press Control (or Fn) twice to dictate"}
              style={{ position: "absolute", right: 26, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex" }}>
              <Mic size={15} color={listeningChunkId === c.id ? "#ef4444" : ORANGE} />
            </button>
            <button
              type="button"
              onClick={() => setShowDictationHelp(true)}
              title="Dictation help"
              style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex" }}>
              <HelpCircle size={13} color="#4a4038" />
            </button>
          </div>
          {listeningChunkId === c.id && (
            <div style={{ fontSize: 10, color: "#ef4444", fontWeight: 700 }}>🔴 Listening…</div>
          )}
        </div>
      </div>
    );
  }

  // ── Mark Moment — bookmarks from lastMark to playhead as a chunk ──
  function markMoment() {
    if (!videoUrl || !duration) return;
    const t = currentTimeRef.current;
    const lastMark = chunks.length > 0 ? chunks[chunks.length - 1].end : 0;
    if (t <= lastMark + 0.5) return; // too close to previous mark
    const id = crypto.randomUUID();
    const newChunk: VideoChunk = { id, start: lastMark, end: t, label: "" };
    const updated = [...chunks, newChunk];
    pushUndoSnapshot();
    setChunks(updated);
    setLastChunkedId(id);
    triggerAutosave(markers, updated, organizedSlots, currentStep);
  }

  // ── Split a chunk at the current playhead position ─────────────
  function splitChunk(id: string, at: number) {
    const chunk = chunks.find(c => c.id === id);
    if (!chunk || at <= chunk.start + 0.3 || at >= chunk.end - 0.3) return;
    const a: VideoChunk = { ...chunk, end: at };
    const b: VideoChunk = { id: crypto.randomUUID(), start: at, end: chunk.end, label: "", tag: chunk.tag };
    const idx = chunks.findIndex(c => c.id === id);
    const updated = [...chunks.slice(0, idx), a, b, ...chunks.slice(idx + 1)];
    pushUndoSnapshot();
    setChunks(updated);
    triggerAutosave(markers, updated, organizedSlots, currentStep);
  }

  // ── Unchunk — merges a chunk forward into the one ahead of it (not the one
  // before it), so a mis-split moment can be undone permanently, unlike
  // undo/redo which resets the moment you leave and come back to the app. ──
  // Forward-only, always — never merges into the moment before it, even as a
  // fallback. If there's nothing valid ahead (last chunk, or a deleted gap
  // sits between this one and the next), unchunking that moment is simply
  // unavailable — see the button visibility check below, which mirrors this.
  function healBoundary(leftChunkId: string, kind: "merge" | "trail") {
    if (kind === "trail") {
      // The dragged-onto edge was the end of the last chunk, with unchunked
      // footage after it — not a real second chunk to merge into. "Healing"
      // it means dissolving this moment back into raw, unmarked footage, the
      // same as if it had never been chunked — not creating a video_cut
      // (that would mark it as deleted footage, which it isn't).
      pushUndoSnapshot();
      const result = chunks.filter(c => c.id !== leftChunkId);
      setChunks(result);
      setSelectedChunkId(null);
      triggerAutosave(markers, result, organizedSlots, currentStep);
      return;
    }
    const result: VideoChunk[] = [];
    let i = 0;
    while (i < chunks.length) {
      const group = [chunks[i]];
      if (chunks[i].id === leftChunkId && i + 1 < chunks.length) {
        group.push(chunks[i + 1]);
        i++;
      }
      if (group.length === 1) {
        result.push(group[0]);
      } else {
        const last = group[group.length - 1];
        result.push({
          ...last,
          start: group[0].start,
          name: group.map(g => g.name).filter(Boolean).join(" / ") || undefined,
          label: group.map(g => g.label).filter(Boolean).join(" ") || "",
        });
      }
      i++;
    }
    pushUndoSnapshot();
    setChunks(result);
    setSelectedChunkId(null);
    triggerAutosave(markers, result, organizedSlots, currentStep);
  }

  // ── Remove a chunk → creates a video_cut marker for export ────────
  function removeChunk(id: string) {
    const chunk = chunks.find(c => c.id === id);
    if (!chunk) return;
    const cutMarker: ExhibitMarker = {
      id: crypto.randomUUID(), timestamp: chunk.start, cutEnd: chunk.end,
      label: "Cut", dictation: "", whyItMatters: "",
      status: "ready", createdAt: Date.now(), type: "video_cut",
    };
    const newMarkers = [...markers, cutMarker].sort((a, b) => a.timestamp - b.timestamp);
    const newChunks = chunks.filter(c => c.id !== id);
    const newSlots = organizedSlots.map(s => s === id ? null : s);
    pushUndoSnapshot();
    setMarkersRaw(newMarkers);
    setChunks(newChunks);
    setOrganizedSlots(newSlots);
    triggerAutosave(newMarkers, newChunks, newSlots, currentStep);
  }

  // ── AI-suggested presentation order for Step 3 ───────────────────
  async function handleAIOrganize() {
    if (aiOrganizing || chunks.length === 0) return;
    setAiOrganizing(true);
    setAiOrganizeReason(null);
    try {
      const { order, reason } = await aiApi.organizeVideoChunks({
        chunks: chunks.map(c => ({ id: c.id, start: c.start, end: c.end, label: c.label, tag: c.tag })),
        caseTitle: hlCase.title,
        parties: hlCase.parties.map(p => ({ firstName: p.firstName, lastName: p.lastName, type: p.type })),
        story: hlCase.story,
        claims: hlCase.structuredCase?.claims,
        caseId: hlCase.id,
      });
      const newSlots = [...order, null, null];
      setOrganizedSlots(newSlots);
      setAiOrganizeReason(reason || null);
      triggerAutosave(markers, chunks, newSlots, currentStep);
      showInsertToast("AI organized your moments — drag any of them to adjust.");
    } catch (err) {
      showInsertToast((err as Error).message || "Couldn't organize automatically — try again or arrange manually.");
    } finally {
      setAiOrganizing(false);
    }
  }

  // ── Skip video_cut regions during playback ──────────────────────
  useEffect(() => {
    if (!isPlaying) return;
    for (const m of markers) {
      if (m.type === "video_cut" && m.cutEnd != null) {
        if (currentTime >= m.timestamp && currentTime < m.cutEnd) {
          seek(m.cutEnd);
          break;
        }
      }
    }
  }, [currentTime]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Preview mode — fire screen overlay at cut markers ──────────
  // Chronological fallback for when nothing has been organized in Step 2
  // (previewSeqIndex stays null) — plays the raw video in its own order and
  // pauses at each screen_cut / exhibit_screen marker's own timestamp. Once
  // a sequence exists, playSequencedStep/advanceSequencedPreview drive
  // playback instead and this effect steps aside entirely.
  useEffect(() => {
    if (!isPreviewMode || !isPlaying || previewSeqIndex !== null) return;
    const cuts = markers
      .filter(m => m.type === "screen_cut" || m.type === "exhibit_screen")
      .sort((a, b) => a.timestamp - b.timestamp);
    for (const cut of cuts) {
      // Trigger within a 0.3s window of the cut point (timeupdate fires ~4x/s)
      if (Math.abs(currentTime - cut.timestamp) < 0.35 && !previewTriggeredRef.current.has(cut.id)) {
        previewTriggeredRef.current.add(cut.id);
        const v = videoRef.current;
        if (v) { v.pause(); setIsPlaying(false); }
        setPreviewOverlayMarkerId(cut.id);
        // Auto-dismiss after holdSec
        const hold = (cut.holdSec ?? 4) * 1000;
        setTimeout(() => {
          setPreviewOverlayMarkerId(null);
          const vid = videoRef.current;
          if (vid) vid.play().catch(() => {});
        }, hold);
        break;
      }
    }
  }, [currentTime, isPreviewMode, isPlaying, previewSeqIndex, markers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset triggered set when preview mode exits or video position rewinds
  useEffect(() => {
    if (!isPreviewMode) previewTriggeredRef.current = new Set();
  }, [isPreviewMode]);

  // Clear already-triggered cuts when user seeks backward past them
  useEffect(() => {
    previewTriggeredRef.current = new Set(
      [...previewTriggeredRef.current].filter(id => {
        const m = markers.find(x => x.id === id);
        return m ? m.timestamp < currentTime : false;
      })
    );
  }, [currentTime]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sequenced preview — detect reaching the current step's clip end ────
  useEffect(() => {
    if (previewSeqIndex === null || !isPlaying) return;
    const chunk = previewSequence[previewSeqIndex];
    if (!chunk) return;
    if (currentTime >= chunk.end - 0.05) {
      const v = videoRef.current;
      if (v) v.pause();
      setIsPlaying(false);
      advanceSequencedPreview(previewSeqIndex);
    }
  }, [currentTime]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clean up any pending exhibit-hold timer on unmount or when preview exits
  useEffect(() => {
    if (!isPreviewMode && sequencedHoldTimerRef.current) {
      clearTimeout(sequencedHoldTimerRef.current);
      sequencedHoldTimerRef.current = null;
    }
    return () => {
      if (sequencedHoldTimerRef.current) clearTimeout(sequencedHoldTimerRef.current);
    };
  }, [isPreviewMode]);

  // Safety valve: if the video never fires loadedmetadata/canplay (e.g. unsupported
  // codec on iOS), clear the loading overlay after 12 s so the user isn't stuck.
  useEffect(() => {
    if (!videoLoading) return;
    const t = setTimeout(() => setVideoLoading(false), 12_000);
    return () => clearTimeout(t);
  }, [videoLoading]);

  // ── Phase 1 thumbnail extraction ──────────────────────────────────────────
  // Approach (iOS Safari-proven — see .agents/memory/ios-video-frame-presentation.md):
  //   • Dedicated extractor <video> that MUST stay inside the viewport (covered
  //     by the player) — Safari never presents frames to off-screen videos.
  //   • rVFC-confirmed seek ladder per frame: fastSeek → fastSeek+2s → exact.
  //   • Pixel stability check only as a net for unconfirmed (non-rVFC) captures.
  //   • Cache results; only re-run when videoUrl changes.
  //   • Track reveals only once ALL frames are done — the loading overlay
  //     covers the whole generation, no progressive population.
  //   • Results are also cached to IndexedDB (see cachedThumbsRef below) so
  //     this whole seek-by-seek pass only ever has to run once per video,
  //     not every time the case is reopened.
  // Each frame is captured one at a time (seek → wait for presentation →
  // draw → stability-check) — that loop is deliberately sequential and
  // slow-but-correct (see the iOS frame-presentation notes below), so total
  // load time scales directly with this count. 80 gave great zoom density
  // but made first load noticeably slow, especially on mobile — 40 roughly
  // halves it while still giving ~5 distinct frames at max (8x) zoom instead
  // of the original ~2.5 at THUMB_N=20.
  const THUMB_N = 40;

  useEffect(() => {
    // If a previous session already generated (and cached) this exact
    // video's thumbnails, use them directly — skip the whole capture pass.
    if (cachedThumbsRef.current) {
      setThumbnails(cachedThumbsRef.current);
      setThumbsLoading(false);
      cachedThumbsRef.current = null; // consumed — don't reuse across a later video swap
      return;
    }

    setThumbnails([]);
    if (!videoUrl) { setThumbsLoading(false); return; }

    const vid = hiddenVideoRef.current;
    if (!vid) {
      console.error("[thumbs] hiddenVideoRef.current is null — effect ran before DOM mounted");
      return;
    }

    let cancelled = false;
    let frameIdx = 0;
    let dur = 0;
    const results: string[] = [];
    let captureAllStart = 0; // wall-clock ms when capturing phase began
    let frameStart = 0;      // wall-clock ms for the current frame

    // Once extraction is done (or aborted), drop this element's decode session —
    // otherwise it sits holding the full video open indefinitely, competing with
    // the main player's decoder for the rest of the session. Barely noticeable on
    // short clips, but on long videos (tens of minutes) this was enough to stall
    // the main player playback shortly after pressing play.
    function releaseHiddenVideo() {
      vid!.pause();
      vid!.removeAttribute("src");
      vid!.load();
    }

    // ── DIAGNOSTIC 1: log hidden video element CSS + initial dimensions ──
    {
      const cs = window.getComputedStyle(vid);
      const msg = `[1] hiddenVideo CSS: display=${cs.display} vis=${cs.visibility} pos=${cs.position} top=${cs.top} left=${cs.left} w=${cs.width} h=${cs.height} | videoW=${vid.videoWidth} videoH=${vid.videoHeight}`;
      console.log("[thumbs]", msg);
      pushDebug(msg);
    }

    // Small canvas on purpose: filmstrip tiles render ~20-40px wide, so 320×180
    // is already 3× oversampled — and every drawImage / getImageData /
    // toDataURL call gets ~9× cheaper than the old 960×540.
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext("2d")!;

    setThumbsLoading(true);

    // ── Helpers ────────────────────────────────────────────────────

    // Evenly-spaced target timestamp for the i-th frame
    function targetTime(i: number): number {
      const raw = (i / Math.max(1, THUMB_N - 1)) * dur;
      return Math.min(Math.max(raw, 0.001), dur - 0.05);
    }

    // Sample 9 pixels spread across the canvas as a cheap pixel fingerprint
    function pixelFingerprint(): string {
      try {
        const w = canvas.width, h = canvas.height;
        const pts = [
          [w >> 2, h >> 2], [w >> 1, h >> 2], [(w * 3) >> 2, h >> 2],
          [w >> 2, h >> 1], [w >> 1, h >> 1], [(w * 3) >> 2, h >> 1],
          [w >> 2, (h * 3) >> 2], [w >> 1, (h * 3) >> 2], [(w * 3) >> 2, (h * 3) >> 2],
        ];
        return pts.map(([x, y]) => {
          const d = ctx.getImageData(x, y, 1, 1).data;
          return `${d[0]},${d[1]},${d[2]}`;
        }).join("|");
      } catch { return "err"; }
    }

    // Draw the current video frame and return its dataUrl + pixel fingerprint
    function drawSample(): { dataUrl: string; pixels: string } {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let dataUrl = "";
      try {
        // ── DIAGNOSTIC: unique draw ID so we can confirm each call executes separately ──
        const drawId = performance.now().toFixed(1);
        const drawMsg = `[DRAW] f${frameIdx + 1} drawImage @ t=${vid!.currentTime.toFixed(4)}s id=${drawId} canvas=${canvas.width}×${canvas.height}`;
        console.log("[thumbs]", drawMsg);
        pushDebug(drawMsg);
        ctx.drawImage(vid!, 0, 0, canvas.width, canvas.height);
        dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      } catch (err) {
        const errMsg = `[4] ERROR f${frameIdx + 1}: ${String(err)}`;
        console.error("[thumbs]", errMsg);
        pushDebug(errMsg);
      }
      return { dataUrl, pixels: dataUrl ? pixelFingerprint() : "" };
    }

    // Commit a captured frame and kick off the next play-forward capture
    function acceptFrame(dataUrl: string, pixels: string) {
      const frameMs = Date.now() - frameStart;
      const totalSoFar = Date.now() - captureAllStart;
      const timeMsg = `[TIME] f${frameIdx + 1} took ${frameMs}ms | running total ${totalSoFar}ms`;
      console.log("[thumbs]", timeMsg);
      pushDebug(timeMsg);

      results.push(dataUrl);
      if (dataUrl && !cancelled) setThumbnails([...results]);
      frameIdx++;
      if (frameIdx < THUMB_N) {
        captureAt(frameIdx);
      } else if (!cancelled) {
        const totalMs = Date.now() - captureAllStart;
        const doneMsg = `[TOTAL] all ${THUMB_N} frames in ${totalMs}ms (avg ${Math.round(totalMs / THUMB_N)}ms/frame) bestEffort=${bestEffortFrames.length ? bestEffortFrames.join(",") : "none"}`;
        console.log("[thumbs]", doneMsg);
        pushDebug(doneMsg);
        setThumbnails([...results]);
        setThumbsLoading(false);
        releaseHiddenVideo();
        saveThumbnails(hlCase.id, videoFileName, results); // cache for next time — fire-and-forget, non-fatal if it fails
        // Default the case's barrel-screen photo to the video's opening frame,
        // the first time a video is ever loaded — only if the user hasn't
        // already set one (a custom photo or an earlier pick from this same
        // strip always wins, never gets silently overwritten).
        if (!hlCase.photoDataUrl && results[0]) {
          onUpdateCase({ ...hlCase, photoDataUrl: results[0] });
          api.cases.savePhoto(hlCase.id, results[0]).catch(() => {});
        }
      }
    }

    // ── Stability check loop (safety net after play-pause decode) ──────────
    // Protocol per frame:
    //   a. captureFrame() does draw → sampleA  (logged as [5] SAMPLE_A)
    //   b. stabilityLoop waits 150ms (real setTimeout)
    //   c. stabilityLoop does a FRESH draw → sampleB  (logged as [SC] SAMPLE_B)
    //   d. compares sampleA vs sampleB — both values printed side-by-side
    //   e. if match → accept sampleB; if not → sampleA = sampleB, repeat b–e
    //   max 8 rounds (1200ms) before giving up and accepting whatever sampleB is.
    const MAX_CHECKS = 8;

    function stabilityLoop(sampleA_url: string, sampleA_px: string, attempt: number) {
      if (cancelled) return;
      // ── step b: REAL 150ms wait ──
      setTimeout(() => {
        if (cancelled) return;
        // ── step c: fresh draw → sampleB (completely new drawImage call) ──
        const { dataUrl: sampleB_url, pixels: sampleB_px } = drawSample();
        // ── step d: compare A vs B, log BOTH values side by side ──
        const matched = sampleB_px !== "" && sampleB_px === sampleA_px;
        const scMsg = `[SC] f${frameIdx + 1} chk=${attempt + 1}/${MAX_CHECKS} match=${matched} | A=[${sampleA_px.slice(0, 35)}] | B=[${sampleB_px.slice(0, 35)}]`;
        console.log("[thumbs]", scMsg);
        pushDebug(scMsg);
        // ── step e ──
        if (matched || attempt >= MAX_CHECKS - 1) {
          acceptFrame(sampleB_url || sampleA_url, sampleB_px || sampleA_px);
        } else {
          // sampleB becomes next sampleA
          stabilityLoop(sampleB_url, sampleB_px, attempt + 1);
        }
      }, 150);
    }

    // ── Draw (+ stability check only when the frame is NOT rVFC-confirmed) ──
    // confirmed=true means requestVideoFrameCallback just told us this exact
    // frame was presented — the authoritative freshness signal. Re-checking
    // pixels 150ms later would only add dead time (3s+ across 20 frames).
    function captureFrame(confirmed = false) {
      if (cancelled) return;

      // Resize canvas to match aspect (capped 320×180)
      const vw = vid!.videoWidth;
      const vh = vid!.videoHeight;
      if (vw && vh && (canvas.width !== Math.min(vw, 320) || canvas.height !== Math.min(vh, 180))) {
        canvas.width  = Math.min(vw, 320);
        canvas.height = Math.min(vh, 180);
      }

      // ── DIAGNOSTIC 3: state before first draw ──
      const preMsg = `[3] f${frameIdx + 1}/${THUMB_N} canvas=${canvas.width}×${canvas.height} vid=${vw}×${vh} rs=${vid!.readyState} t=${vid!.currentTime.toFixed(3)} confirmed=${confirmed}`;
      console.log("[thumbs]", preMsg);
      pushDebug(preMsg);

      // ── step a: first draw → sampleA ──
      const { dataUrl: sampleA_url, pixels: sampleA_px } = drawSample();

      // ── DIAGNOSTIC 5: log sampleA ──
      const lenMsg = `[5] f${frameIdx + 1} SAMPLE_A urlLen=${sampleA_url.length}${sampleA_url.length < 1000 ? " ← SHORT" : ""} px=[${sampleA_px.slice(0, 35)}]`;
      console.log("[thumbs]", lenMsg);
      pushDebug(lenMsg);

      // rVFC-confirmed + draw succeeded → accept immediately, no 150ms recheck
      if (confirmed && sampleA_url && sampleA_px) {
        acceptFrame(sampleA_url, sampleA_px);
        return;
      }

      // ── step b starts inside stabilityLoop after the 150ms setTimeout ──
      stabilityLoop(sampleA_url, sampleA_px, 0);
    }

    // ── rVFC-driven seek capture ─────────────────────────────────────────────
    // ROOT CAUSE of the duplicate-frame bug across all prior attempts: the
    // extraction <video> sat OFF-VIEWPORT (top:-9999px, opacity:0). iOS Safari
    // only PRESENTS decoded frames for elements inside the viewport —
    // currentTime advanced correctly but drawImage kept reading the only frame
    // ever presented (frame 1). The element now sits in-viewport hidden behind
    // the opaque main player, so every seek presents its frame, and
    // requestVideoFrameCallback (rVFC) signals exactly when it lands.
    // Per frame: arm one-shot rVFC → seek → rVFC fires with mediaTime →
    // captureFrame() → stabilityLoop (safety net) → acceptFrame → next.
    // Fallbacks: 1500ms timeout if rVFC never fires; seeked+80ms if no rVFC API.
    const hasRVFC = typeof (vid as unknown as { requestVideoFrameCallback?: unknown }).requestVideoFrameCallback === "function";
    // fastSeek lands on the nearest KEYFRAME — no decode-from-keyframe-to-exact-
    // millisecond work like currentTime seeks. For a filmstrip tile covering
    // ~1/20th of the video, keyframe accuracy is visually identical and far
    // faster on 4K HEVC. Retries escalate to exact seeks.
    const hasFastSeek = typeof (vid as unknown as { fastSeek?: unknown }).fastSeek === "function";
    let rvfcId = 0;
    let rvfcTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingSk: (() => void) | null = null; // armed one-shot 'seeked' listener (non-rVFC fallback)
    // Adaptive per-attempt waits: when a seek stalls, waiting longer rarely
    // helps — retrying with a different strategy does. So the first two rungs
    // time out fast (2.5s) and only the final guaranteed rung waits long.
    const ATTEMPT_TIMEOUTS_MS = [2500, 2500, 8000];
    const MAX_SEEK_ATTEMPTS = 3;
    const waitForAttempt = (a: number) => ATTEMPT_TIMEOUTS_MS[Math.min(a, ATTEMPT_TIMEOUTS_MS.length) - 1];
    const bestEffortFrames: number[] = []; // 1-based frame numbers captured without rVFC confirmation

    // Buffered time-ranges snapshot — logged with every seek so we can see
    // whether slow frames correlate with unbuffered/differently-keyframed regions.
    function bufStr(): string {
      try {
        const b = vid!.buffered;
        const parts: string[] = [];
        for (let k = 0; k < b.length; k++) parts.push(`${b.start(k).toFixed(1)}-${b.end(k).toFixed(1)}`);
        return parts.length ? parts.join(",") : "none";
      } catch {
        return "err";
      }
    }

    function captureAt(i: number, attempt = 1) {
      if (cancelled || !dur) return;
      if (attempt === 1) frameStart = Date.now(); // total per-frame time spans all attempts
      const target = targetTime(i);
      // Retry ladder targets (each rung must differ from the last — re-seeking
      // the same time is a no-op on Safari, no seeked/no new presentation):
      //   try1: fastSeek at the exact target (nearest keyframe)
      //   try2: fastSeek 2s later — lands on a DIFFERENT keyframe, dodging
      //         whatever stalls at that spot (±2s is invisible per ~104s tile)
      //   try3: exact currentTime seek +80ms — slow but guaranteed decode
      const clampT = (t: number) => Math.min(Math.max(0, dur - 0.05), t);
      const seekTarget = attempt === 1 ? target : attempt === 2 ? clampT(target + 2.0) : clampT(target + 0.08);
      const curT = vid!.currentTime;
      const useFastSeek = attempt <= 2 && hasFastSeek;
      const attemptWait = waitForAttempt(attempt);
      const capMsg = `[CAP] f${i + 1}/${THUMB_N} try${attempt}/${MAX_SEEK_ATTEMPTS} target=${seekTarget.toFixed(3)}s curT=${curT.toFixed(3)}s rvfc=${hasRVFC} fs=${useFastSeek ? 1 : 0} wait=${attemptWait}ms buf=${bufStr()}`;
      console.log("[thumbs]", capMsg);
      pushDebug(capMsg);

      let settled = false;
      function finish(via: string, mediaTime?: number) {
        if (settled || cancelled) return;
        settled = true;
        if (rvfcTimer) { clearTimeout(rvfcTimer); rvfcTimer = null; }
        if (pendingSk) { vid!.removeEventListener("seeked", pendingSk); pendingSk = null; }
        const finMsg = `[CAP] f${i + 1} presented via=${via}${mediaTime !== undefined ? ` mediaTime=${mediaTime.toFixed(3)}` : ""} t=${vid!.currentTime.toFixed(3)}`;
        console.log("[thumbs]", finMsg);
        pushDebug(finMsg);
        const confirmed = via === "rvfc";
        requestAnimationFrame(() => { if (!cancelled) captureFrame(confirmed); });
      }

      if (hasRVFC) {
        // Arm BEFORE seeking so the presentation of the seeked frame is caught
        rvfcId = (vid as unknown as {
          requestVideoFrameCallback: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
        }).requestVideoFrameCallback((_now, meta) => finish("rvfc", meta?.mediaTime));
        rvfcTimer = setTimeout(() => {
          if (settled || cancelled) return;
          // Never capture a stale canvas on timeout — retry the seek first.
          settled = true; // disarm this attempt's rVFC/finish
          rvfcTimer = null;
          (vid as unknown as { cancelVideoFrameCallback?: (id: number) => void }).cancelVideoFrameCallback?.(rvfcId);
          if (attempt < MAX_SEEK_ATTEMPTS) {
            const rtMsg = `[CAP] f${i + 1} RVFC-TIMEOUT (${attemptWait}ms, no frame presented) — retrying seek (try${attempt + 1})`;
            console.warn("[thumbs]", rtMsg);
            pushDebug(rtMsg);
            captureAt(i, attempt + 1);
          } else {
            const beMsg = `[BEST-EFFORT] f${i + 1} — ${MAX_SEEK_ATTEMPTS} attempts exhausted, capturing whatever is available (unconfirmed frame)`;
            console.warn("[thumbs]", beMsg);
            pushDebug(beMsg);
            bestEffortFrames.push(i + 1);
            settled = false; // re-arm finish for the fallback capture
            finish("timeout-best-effort");
          }
        }, attemptWait);
      } else {
        // Non-rVFC fallback: one-shot 'seeked' listener, tracked in pendingSk so
        // finish()/cleanup can always remove it (no leaks across no-op paths),
        // plus a timeout so this path has the same guaranteed termination.
        const onSk = () => {
          vid!.removeEventListener("seeked", onSk);
          if (pendingSk === onSk) pendingSk = null;
          setTimeout(() => finish("seeked+80ms"), 80);
        };
        pendingSk = onSk;
        vid!.addEventListener("seeked", onSk);
        rvfcTimer = setTimeout(() => {
          if (settled || cancelled) return;
          const toMsg = `[CAP] f${i + 1} SEEKED-TIMEOUT (${attemptWait}ms) — capturing anyway`;
          console.warn("[thumbs]", toMsg);
          pushDebug(toMsg);
          finish("seeked-timeout");
        }, attemptWait);
      }

      // No-op-seek guard: Safari fires neither 'seeked' nor a new presentation
      // when currentTime is already at target (e.g. frame 0 right after load).
      if (Math.abs(curT - seekTarget) < 0.005) {
        const noopMsg = `[CAP] f${i + 1} no-op seek (Δ<5ms) rs=${vid!.readyState}`;
        console.log("[thumbs]", noopMsg);
        pushDebug(noopMsg);
        if (!hasRVFC || vid!.readyState >= 2) finish("noop-direct");
        // else: the initial-load presentation or the timeout/retry path resolves it
        return;
      }

      // Rungs 1-2: fastSeek (nearest keyframe — one frame to decode).
      // Rung 3: exact currentTime seek, slow but guaranteed.
      if (useFastSeek) {
        (vid as unknown as { fastSeek: (t: number) => void }).fastSeek(seekTarget);
      } else {
        vid!.currentTime = seekTarget;
      }
    }

    // ── Diagnostic-only seeked logger (state machine removed) ───────────────
    function onSeeked() {
      const seekMsg = `[2] seeked cancelled=${cancelled} t=${vid!.currentTime.toFixed(3)} vidW=${vid!.videoWidth} vidH=${vid!.videoHeight} rs=${vid!.readyState}`;
      console.log("[thumbs]", seekMsg);
      pushDebug(seekMsg);
    }

    // ── Start gating: metadata alone is NOT enough. Frames 1-6 previously
    // timed out because capture began while the element was still doing its
    // initial buffering (frame 1 at ~0s timed out — impossible to blame on
    // sparse keyframes). Wait for readyState>=2 (first frame decodable).
    let captureStarted = false;
    let readyWatchdog: ReturnType<typeof setTimeout> | null = null;
    function beginCapture() {
      if (cancelled || captureStarted || !dur) return;
      captureStarted = true;
      if (readyWatchdog) { clearTimeout(readyWatchdog); readyWatchdog = null; }
      captureAllStart = Date.now();
      const goMsg = `[WU] ready rs=${vid!.readyState} buf=${bufStr()} — starting rVFC seek capture of ${THUMB_N} frames`;
      console.log("[thumbs]", goMsg);
      pushDebug(goMsg);
      captureAt(0);
    }

    function onReadyForCapture() {
      vid!.removeEventListener("loadeddata", onReadyForCapture);
      vid!.removeEventListener("canplay", onReadyForCapture);
      beginCapture();
    }

    function onLoadedMetadata() {
      if (cancelled) return;
      dur = vid!.duration;
      if (!dur || !isFinite(dur) || dur < 0.1) {
        // Terminal: never leave the skeleton spinning on an unusable duration
        const badMsg = `[WU] unusable duration (${String(vid!.duration)}) — aborting thumbnail generation`;
        console.warn("[thumbs]", badMsg);
        pushDebug(badMsg);
        setThumbsLoading(false);
        releaseHiddenVideo();
        return;
      }
      const wuMsg = `[WU] metadata loaded dur=${dur.toFixed(1)}s rs=${vid!.readyState} — ${vid!.readyState >= 2 ? "already ready" : "waiting for first frame (loadeddata/canplay)"}`;
      console.log("[thumbs]", wuMsg);
      pushDebug(wuMsg);
      if (vid!.readyState >= 2) {
        beginCapture();
      } else {
        vid!.addEventListener("loadeddata", onReadyForCapture);
        vid!.addEventListener("canplay", onReadyForCapture);
        // Watchdog: if loadeddata/canplay never fire (Safari decode edge case),
        // start anyway after 10s — per-frame timeouts/retries handle the rest,
        // so every path still terminates in acceptFrame.
        readyWatchdog = setTimeout(() => {
          if (cancelled || captureStarted) return;
          const wdMsg = `[WU] readiness watchdog fired (10s, rs=${vid!.readyState}) — starting capture anyway`;
          console.warn("[thumbs]", wdMsg);
          pushDebug(wdMsg);
          beginCapture();
        }, 10000);
      }
    }

    function onError() {
      const ve = vid!.error;
      // ── DIAGNOSTIC: log src/currentSrc at moment of error ──
      const errMsg = `[ERR] video error code=${ve?.code} msg="${ve?.message}" net=${vid!.networkState} src="${vid!.src.slice(0, 60)}" curSrc="${vid!.currentSrc.slice(0, 60)}"`;
      console.error("[thumbs]", errMsg);
      pushDebug(errMsg);
      if (!cancelled) { setThumbsLoading(false); releaseHiddenVideo(); }
    }

    vid.addEventListener("loadedmetadata", onLoadedMetadata);
    vid.addEventListener("seeked", onSeeked);
    vid.addEventListener("error", onError);
    vid.src = videoUrl;
    vid.load();

    return () => {
      cancelled = true;
      vid.pause(); // stop any in-flight playback
      if (rvfcTimer) clearTimeout(rvfcTimer);
      if (readyWatchdog) clearTimeout(readyWatchdog);
      if (pendingSk) vid.removeEventListener("seeked", pendingSk);
      if (hasRVFC && rvfcId) {
        (vid as unknown as { cancelVideoFrameCallback?: (id: number) => void }).cancelVideoFrameCallback?.(rvfcId);
      }
      vid.removeEventListener("loadedmetadata", onLoadedMetadata);
      vid.removeEventListener("loadeddata", onReadyForCapture);
      vid.removeEventListener("canplay", onReadyForCapture);
      vid.removeEventListener("seeked", onSeeked);
      vid.removeEventListener("error", onError);
      vid.src = "";
      setThumbsLoading(false);
    };
  }, [videoUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Expiry check on mount — clean up server data for expired projects ──
  useEffect(() => {
    const sp = hlCase.studioProject;
    if (sp?.expiresAt && sp.expiresAt < Date.now()) {
      // Markers already cleared in initial state; remove the expired data from server too
      onUpdateCase({ ...hlCase, studioProject: undefined });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Analysis marker insertion ───────────────────────────────────
  function insertMarker() {
    const id = crypto.randomUUID();
    const exhibitNum = markers.filter(m => !m.type || m.type === "analysis").length + 1;
    const newMarker: ExhibitMarker = {
      id, timestamp: currentTime,
      label: `Exhibit ${exhibitNum}`,
      dictation: "", whyItMatters: "",
      status: "draft", createdAt: Date.now(),
      type: "analysis",
    };
    if (videoRef.current && isPlaying) { videoRef.current.pause(); setIsPlaying(false); }
    setMarkers([...markers, newMarker].sort((a, b) => a.timestamp - b.timestamp));
    setActiveMarkerId(id);
    startDictation(id);
  }

  // ── Media insert ────────────────────────────────────────────────
  function insertMediaMarker(file: File, kind: "photo" | "clip") {
    const blobUrl = URL.createObjectURL(file);
    mediaBlobUrlsRef.current.push(blobUrl); // track for cleanup on unmount
    const id = crypto.randomUUID();
    const mediaNum = markers.filter(m => m.type === "media_insert").length + 1;
    const newMarker: ExhibitMarker = {
      id,
      timestamp: currentTime,
      label: `${kind === "photo" ? "Photo" : "Clip"} ${mediaNum}`,
      dictation: "", whyItMatters: "",
      status: "ready",
      holdSec: kind === "photo" ? 5 : undefined, // photos show for holdSec; clips play to natural end
      createdAt: Date.now(),
      type: "media_insert",
      mediaInsert: { kind, blobUrl, fileName: file.name } satisfies MediaInsert,
    };
    if (videoRef.current && isPlaying) { videoRef.current.pause(); setIsPlaying(false); }
    setMarkers([...markers, newMarker].sort((a, b) => a.timestamp - b.timestamp));
    setActiveMarkerId(id);
    setShowMediaPicker(false);
    showInsertToast(kind === "photo" ? "📷 Photo added to timeline" : "🎬 Clip added to timeline");
  }

  // ── Cut screen insertion ────────────────────────────────────────
  function handleCutInsert(time: number, screenData: ScreenInsert, holdSec: number) {
    const id = crypto.randomUUID();
    const cutNum = markers.filter(m => m.type === "screen_cut").length + 1;
    const newMarker: ExhibitMarker = {
      id,
      timestamp: time,
      label: `Screen ${cutNum}`,
      dictation: "",
      whyItMatters: "",
      status: "ready",
      holdSec,
      createdAt: Date.now(),
      type: "screen_cut",
      screenInsert: screenData,
    };
    setMarkers([...markers, newMarker].sort((a, b) => a.timestamp - b.timestamp));
    setActiveMarkerId(id);
    setShowCutBuilder(false);
  }

  // ── AI Exhibit Screen insertion ─────────────────────────────────
  function insertExhibitScreenMarker(data: ExhibitScreenData) {
    const id = crypto.randomUUID();
    const screenNum = markers.filter(m => m.type === "exhibit_screen").length + 1;
    // Attach to whichever moment the playhead is inside of, so the exhibit
    // travels with that moment when Step 2 reorders it — not just whichever
    // chunk happened to be last selected (the playhead may have moved since).
    const owningChunk = chunks.find(c => currentTime >= c.start && currentTime <= c.end);
    const newMarker: ExhibitMarker = {
      id,
      timestamp: currentTime,
      chunkId: owningChunk?.id,
      label: `AI Screen ${screenNum}`,
      dictation: "", whyItMatters: "",
      status: "ready",
      holdSec: 8,
      createdAt: Date.now(),
      type: "exhibit_screen",
      exhibitScreen: data,
    };
    setMarkers([...markers, newMarker].sort((a, b) => a.timestamp - b.timestamp));
    setActiveMarkerId(id);
    setShowExhibitGenerator(false);
  }

  // ── Dictation ──────────────────────────────────────────────────
  function startDictation(markerId: string) {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setDictationMarkerId(markerId);
      setDictationText("");
      setIsDictating(true);
      return;
    }
    const r = new SpeechRecognition();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    let finalText = "";
    r.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript + " ";
        else interim += e.results[i][0].transcript;
      }
      setDictationText(finalText + interim);
    };
    r.onend = () => {};
    r.start();
    recognitionRef.current = r;
    setDictationMarkerId(markerId);
    setDictationText("");
    setIsDictating(true);
  }

  function stopDictation(saveText = true) {
    if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; }
    setIsDictating(false);
    if (!saveText || !dictationMarkerId) { setDictationMarkerId(null); setDictationText(""); return; }
    const text = dictationText.trim();
    const midId = dictationMarkerId;
    setDictationMarkerId(null);
    setDictationText("");
    if (!text) return;
    const updated = markers.map(m =>
      m.id === midId ? { ...m, dictation: text, status: "extracting" as const } : m
    );
    setMarkers(updated);
    const targetMarker = updated.find(m => m.id === midId);
    if (targetMarker) extractAndDraft(targetMarker);
  }

  // ── Claude Builder Engine ───────────────────────────────────────
  async function extractAndDraft(marker: ExhibitMarker) {
    const exhibitNumber = markers.filter(m => m.timestamp <= marker.timestamp && (!m.type || m.type === "analysis")).length;
    const markerId = marker.id;
    try {
      const result = await aiApi.builderExtract({
        timestamp: formatTime(marker.timestamp),
        dictation: marker.dictation,
        whyItMatters: marker.whyItMatters,
        exhibitNumber,
        caseTitle: hlCase.title,
        parties: hlCase.parties ?? [],
        court: hlCase.court ?? null,
        caseId: hlCase.id,
      });
      setMarkersRaw(prev => {
        const updated = prev.map(m =>
          m.id === markerId
            ? { ...m, extraction: result.extraction, draft: { ...result.draft, exhibitNumber }, status: "ready" as const }
            : m
        );
        triggerAutosave(updated);
        return updated;
      });
      setViewingDraftId(markerId);
    } catch {
      setMarkersRaw(prev => {
        const updated = prev.map(m => m.id === markerId ? { ...m, status: "error" as const } : m);
        triggerAutosave(updated);
        return updated;
      });
    }
  }

  // ── Jurisdiction verification ───────────────────────────────────
  async function handleVerify(forceRefresh = false) {
    if (!hlCase.court) return;
    if (verification && !forceRefresh) { setShowVerifResult(true); return; }
    setVerifying(true);
    try {
      const result = await aiApi.jurisdictionVerify({ state: hlCase.court.state, county: "", courtName: hlCase.court.name, caseId: hlCase.id });
      const verif: JurisdictionVerification = { ...result, verifiedAt: Date.now() };
      const project = getOrCreateProject();
      onUpdateCase({ ...hlCase, studioProject: { ...project, jurisdictionVerification: verif, updatedAt: Date.now() } });
      setShowVerifResult(true);
    } catch {
      alert("Verification failed. Please try again.");
    } finally {
      setVerifying(false);
    }
  }

  // ── Recovery check on mount ─────────────────────────────────────
  useEffect(() => {
    loadStudioSnapshot(hlCase.id).then(snapshot => {
      if (!snapshot) return;
      const serverUpdatedAt = hlCase.studioProject?.updatedAt ?? 0;
      const serverMarkersJson = JSON.stringify(hlCase.studioProject?.markers ?? []);
      // chunks (Chunk & Label's real moments) used to be left out of this
      // comparison entirely, so a locally-recoverable difference there never
      // surfaced this banner at all — only marker differences did, and this
      // app's actual workflow barely uses markers.
      const serverChunksJson = JSON.stringify(hlCase.studioProject?.chunks ?? []);
      const markersDiffer = JSON.stringify(snapshot.markers) !== serverMarkersJson;
      const chunksDiffer = JSON.stringify(snapshot.chunks ?? []) !== serverChunksJson;
      if (snapshot.savedAt > serverUpdatedAt && (markersDiffer || chunksDiffer)) {
        setRecoverySnapshot(snapshot);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Nothing to restore on mount — the video isn't stored anywhere but this
  // browser tab's memory for the current session (see loadVideo's header
  // comment). If this case was worked on before, `videoFileName` is already
  // populated from the saved studioProject, and the "reload your video"
  // prompt below picks that up immediately — no fetch needed.

  // ── Cleanup ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      if (idbSaveTimer.current) clearTimeout(idbSaveTimer.current);
      if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; }
      mediaBlobUrlsRef.current.forEach(url => { try { URL.revokeObjectURL(url); } catch {} });
      // Leaving the workspace means this video won't be touched again until
      // it's re-picked from scratch next time (same reasoning as the header
      // comment above) — so the plugin's Caches copy of it has no further
      // use and can go now instead of sitting there until the next pick.
      deleteNativePickedFile(nativePickedPathRef.current);
      nativePickedPathRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activeMarker = markers.find(m => m.id === activeMarkerId);
  const viewingMarker = markers.find(m => m.id === viewingDraftId);
  const sortedMarkers = [...markers].sort((a, b) => a.timestamp - b.timestamp);
  const court = hlCase.court;
  // Badge count: number of things the user should know about (jurisdiction missing = 1)
  const issueCount = !court ? 1 : 0;
  const previewOverlayMarker = markers.find(m => m.id === previewOverlayMarkerId);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#050505" }}>

      {/* ── Top Bar ──────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, background: "#0a0a0a", borderBottom: "1px solid #151515", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}>
          <ArrowLeft size={18} color="#666" />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#ddd", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {hlCase.title}
          </div>
          {videoFileName && <div style={{ fontSize: 10, color: "#444", marginTop: 1 }}>{videoFileName}</div>}
        </div>
        {/* Autosave — "Saved" only shows once the server call actually
            succeeds (see triggerAutosave); a failure shows a real error with
            a retry instead of silently claiming success either way. */}
        {autosaveStatus === "error" ? (
          <button onClick={() => triggerAutosave(markers, chunks, organizedSlots, currentStep)}
            style={{ fontSize: 10, color: "#ef4444", fontWeight: 800, flexShrink: 0, display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            <AlertCircle size={10} /> Not saved — tap to retry
          </button>
        ) : (
          <div style={{ fontSize: 10, color: autosaveStatus === "saving" ? "#666" : autosaveStatus === "saved" ? "#22c55e" : "#333", fontWeight: 700, flexShrink: 0, display: "flex", alignItems: "center", gap: 4, transition: "color 0.3s" }}>
            {autosaveStatus === "saved" && <Check size={10} />}
            {autosaveStatus === "saving" ? "Saving…" : autosaveStatus === "saved" ? "Saved" : ""}
          </div>
        )}
        {/* Undo / Redo */}
        <button onClick={undo} disabled={!undoStack.length} title="Undo"
          style={{ background: "none", border: "none", cursor: undoStack.length ? "pointer" : "not-allowed", padding: 4, opacity: undoStack.length ? 1 : 0.3 }}>
          <Undo2 size={15} color="#666" />
        </button>
        <button onClick={redo} disabled={!redoStack.length} title="Redo"
          style={{ background: "none", border: "none", cursor: redoStack.length ? "pointer" : "not-allowed", padding: 4, opacity: redoStack.length ? 1 : 0.3 }}>
          <Redo2 size={15} color="#666" />
        </button>
        {/* Export — always visible when there are markers */}
        <button
          onClick={() => { if (markers.length > 0) setShowExport(true); }}
          disabled={markers.length === 0}
          title="Export video"
          style={{ background: "none", border: "none", cursor: markers.length > 0 ? "pointer" : "not-allowed", padding: 4, opacity: markers.length > 0 ? 1 : 0.3, display: "flex", alignItems: "center" }}>
          <Download size={16} color={markers.length > 0 ? ORANGE : "#444"} />
        </button>
        {/* Retention timer — tap to add 30 more days without needing an actual edit */}
        {hlCase.studioProject?.expiresAt && (() => {
          const daysLeft = Math.max(0, Math.ceil((hlCase.studioProject.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
          const urgent = daysLeft <= 5;
          return (
            <button
              onClick={extendExpiry}
              title={`Saved until ${new Date(hlCase.studioProject.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} — tap to add ${EXPIRY_DAYS} more days`}
              style={{ background: "none", border: `1px solid ${urgent ? "#4a1500" : "#2a2a2a"}`, borderRadius: 20, padding: "3px 9px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: urgent ? "#ef4444" : "#666" }}>
                {daysLeft}d
              </span>
            </button>
          );
        })()}
        {/* ⓘ Info bubble */}
        <button
          onClick={() => setInfoPanelOpen(p => !p)}
          title="Studio guide"
          style={{ position: "relative", background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}>
          <Info size={16} color={infoPanelOpen ? ORANGE : "#555"} />
          {issueCount > 0 && !infoPanelOpen && (
            <span style={{ position: "absolute", top: 0, right: 0, background: "#ef4444", color: "#fff", borderRadius: 99, fontSize: 8, fontWeight: 900, minWidth: 13, height: 13, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", lineHeight: 1 }}>
              {issueCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Info panel ────────────────────────────────────────────── */}
      {infoPanelOpen && (
        <div style={{ position: "fixed", top: 52, right: 12, width: 300, maxWidth: "calc(100vw - 24px)", background: "#111", border: "1px solid #252525", borderRadius: 14, zIndex: 1200, padding: 16, boxShadow: "0 12px 40px rgba(0,0,0,0.7)" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#ddd" }}>Studio Guide</span>
            <button onClick={() => {
              setInfoPanelOpen(false);
              try { localStorage.setItem("studio-info-seen", "1"); } catch {}
            }} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex" }}>
              <X size={14} color="#555" />
            </button>
          </div>

          {/* File loading */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 7 }}>Loading Your Video</div>
            <div style={{ fontSize: 12, color: "#666", lineHeight: 1.65 }}>
              Save your video from your photo library to the <strong style={{ color: "#999" }}>Files app</strong> on your device first, then tap <strong style={{ color: "#999" }}>Load Video</strong> here and choose it from Files.
              <br /><br />
              Your edits and exhibit screens always save here — the video itself doesn't leave your device. Closing this case and coming back just means reloading the same file, same as any video editor whose project references outside media.
              <br /><br />
              <strong style={{ color: "#d97706" }}>Reload the exact same file every time.</strong> Don't trim, re-export, or re-save the video before reloading it — even a small change shifts the video's length, which throws off every moment's timestamp against the version you already labeled.
            </div>
          </div>

          <div style={{ borderTop: "1px solid #1c1c1c", marginBottom: 14 }} />

          {/* 7-day warning */}
          <div style={{ background: "#130900", border: "1px solid #2e1500", borderRadius: 10, padding: "10px 12px", marginBottom: 14, display: "flex", gap: 9, alignItems: "flex-start" }}>
            <AlertCircle size={13} color="#c2740a" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12, color: "#a0620a", lineHeight: 1.6 }}>
              <strong style={{ color: "#d97706" }}>Edits auto-delete after {EXPIRY_DAYS} days</strong> without activity. Export your video to save it permanently.
              {hlCase.studioProject?.expiresAt && hlCase.studioProject.expiresAt > Date.now() && (
                <div style={{ marginTop: 4, color: "#7a5000", fontWeight: 700 }}>
                  Saved until {new Date(hlCase.studioProject.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} — tap the {Math.max(0, Math.ceil((hlCase.studioProject.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)))}d badge above to add {EXPIRY_DAYS} more days anytime
                </div>
              )}
            </div>
          </div>


          {/* Video/moments duration mismatch — likely wrong file on a resumed session */}
          {videoMismatchWarning && (
            <>
              <div style={{ background: "#1a0000", border: "1px solid #4a0000", borderRadius: 10, padding: "10px 12px", marginBottom: 14, display: "flex", gap: 9, alignItems: "flex-start" }}>
                <AlertCircle size={13} color="#e04444" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 12, color: "#c06060", lineHeight: 1.6, flex: 1 }}>
                  <strong style={{ color: "#e04444" }}>Video doesn't match your saved moments.</strong> {videoMismatchWarning}
                </div>
                <button onClick={() => setVideoMismatchWarning(null)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0 }}>
                  <X size={13} color="#7a2020" />
                </button>
              </div>
              <div style={{ borderTop: "1px solid #1c1c1c", marginBottom: 14 }} />
            </>
          )}

          {/* Large file notice — informational only, nothing is rejected */}
          {largFileWarning && (
            <>
              <div style={{ background: "#1a0e00", border: "1px solid #4a2800", borderRadius: 10, padding: "10px 12px", marginBottom: 14, display: "flex", gap: 9, alignItems: "flex-start" }}>
                <AlertCircle size={13} color="#cc6600" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 12, color: "#a05000", lineHeight: 1.6, flex: 1 }}>
                  <strong style={{ color: "#cc6600" }}>Large file detected.</strong> If playback or thumbnail loading is slow, trim unnecessary portions before loading.
                </div>
                <button onClick={() => setLargeFileWarning(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0 }}>
                  <X size={13} color="#6b3800" />
                </button>
              </div>
              <div style={{ borderTop: "1px solid #1c1c1c", marginBottom: 14 }} />
            </>
          )}

          {/* Jurisdiction */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 7, display: "flex", alignItems: "center", gap: 6 }}>
              Jurisdiction
              {issueCount > 0 && (
                <span style={{ background: "#ef4444", color: "#fff", borderRadius: 99, fontSize: 8, fontWeight: 900, padding: "1px 5px", lineHeight: 1.4 }}>1</span>
              )}
            </div>
            {court ? (
              <div style={{ fontSize: 12, color: "#777", lineHeight: 1.6 }}>
                {verification ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {verification.verdict === "permitted"    && <CheckCircle2 size={12} color="#22c55e" />}
                    {verification.verdict === "limited"      && <AlertCircle  size={12} color="#f59e0b" />}
                    {verification.verdict === "not_accepted" && <XCircle      size={12} color="#ef4444" />}
                    <span>{court.state}{court.name ? ` · ${court.name}` : ""}</span>
                  </div>
                ) : (
                  <span>{court.state}{court.name ? ` · ${court.name}` : ""} — tap Verify in the editor to check illustrative aid rules.</span>
                )}
                {verification && (
                  <button onClick={() => { setInfoPanelOpen(false); setShowVerifResult(true); }}
                    style={{ marginTop: 8, background: "none", border: "1px solid #252525", borderRadius: 7, padding: "4px 10px", fontSize: 11, color: verification.verdict === "permitted" ? "#22c55e" : verification.verdict === "limited" ? "#f59e0b" : "#ef4444", cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
                    <Eye size={10} /> View jurisdiction result
                  </button>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#555", lineHeight: 1.65 }}>
                No court set. Add your court in <strong style={{ color: "#777" }}>Case Profile</strong> to check whether illustrative aids are permitted in your jurisdiction.
              </div>
            )}
          </div>

          {/* Dismiss */}
          <button onClick={() => {
            setInfoPanelOpen(false);
            try { localStorage.setItem("studio-info-seen", "1"); } catch {}
          }} style={{ width: "100%", background: "#181818", border: "1px solid #252525", borderRadius: 10, padding: "9px 14px", fontSize: 12, fontWeight: 700, color: "#777", cursor: "pointer" }}>
            Got it
          </button>
        </div>
      )}


      {/* ── Scrollable content ─────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 140px" }}>

        {/* ── Recovery banner ───────────────────────────────────────── */}
        {recoverySnapshot && (
          <div style={{ background: "#1a1000", border: "1px solid #6b4a00", borderRadius: 12, padding: "14px 16px", marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 10 }}>
            <RotateCcw size={15} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#f59e0b", marginBottom: 3 }}>
                Unsaved workspace recovered
              </div>
              <div style={{ fontSize: 12, color: "#a37a00", lineHeight: 1.55, marginBottom: 10 }}>
                {recoverySnapshot.chunks?.length ?? 0} moment{(recoverySnapshot.chunks?.length ?? 0) !== 1 ? "s" : ""}
                {recoverySnapshot.markers.length > 0 ? ` and ${recoverySnapshot.markers.length} marker${recoverySnapshot.markers.length !== 1 ? "s" : ""}` : ""} from {relativeTime(recoverySnapshot.savedAt)} — restore to pick up where you left off.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleRestore}
                  style={{ background: "#f59e0b", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 800, color: "#000", cursor: "pointer" }}>
                  Restore
                </button>
                <button onClick={handleDiscard}
                  style={{ background: "none", border: "1px solid #4a3000", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, color: "#7a5a00", cursor: "pointer" }}>
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Video area ─────────────────────────────────────────────
             The <video> element is ALWAYS in the DOM so videoRef.current
             is never null when loadVideo() fires inside the gesture handler.
             iOS silently ignores video.load() calls made outside a gesture. */}
        <div style={{ marginBottom: 12, position: "relative", display: videoUrl ? "block" : "none" }}>
          {/* Thumbnail extractor — MUST be IN-VIEWPORT: iOS Safari only
               presents decoded frames for elements inside the viewport.
               Off-viewport (-9999px) elements advance currentTime but never
               receive new frames — the root cause of the duplicate-thumbnail
               bug. It hides UNDER the opaque main player (zIndex 0 vs 1),
               which has minHeight 190 so it always covers this 180px element. */}
          <video
            ref={hiddenVideoRef as React.RefObject<HTMLVideoElement>}
            muted
            playsInline
            preload="auto"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 320,
              maxWidth: "100%", // never wider than the covering player on narrow layouts
              height: 180,
              opacity: 1,
              pointerEvents: "none",
              zIndex: 0,
              borderRadius: 12,
            }}
          />
          <video
            ref={videoRef as React.RefObject<HTMLVideoElement>}
            playsInline
            // "auto" instead of "metadata" — the source is a local blob, not
            // a network fetch, so there's no bandwidth cost to buffering it
            // ahead of time, and it means play() doesn't have to kick off
            // buffering from a cold start on every press.
            preload="auto"
            style={{ width: "100%", borderRadius: 12, background: "#000", display: "block", maxHeight: 260, minHeight: 190, position: "relative", zIndex: 1 }}
            onTimeUpdate={e => {
              setCurrentTime(e.currentTarget.currentTime);
              currentTimeRef.current = e.currentTarget.currentTime;
            }}
            onDurationChange={e => {
              const v = e.currentTarget;
              const d = v.duration;
              if (!isFinite(d)) {
                // Some MP4s (recorded/exported without a proper duration atom
                // in their metadata) report Infinity here. Seeking near the
                // end can force the browser to scan and resolve the real
                // duration — but on some browsers durationchange just keeps
                // re-firing Infinity afterward instead of resolving, and
                // repeating the seek on every one of those re-fires yanks the
                // live player to a bogus position mid-playback, which looks
                // exactly like "plays a couple seconds, then stops for good."
                // Only ever try this once per video.
                if (!infinityProbeAttemptedRef.current) {
                  infinityProbeAttemptedRef.current = true;
                  v.currentTime = 1e101;
                }
                return;
              }
              if (v.currentTime > 1e10) v.currentTime = 0; // undo the probe seek above
              setDuration(d);
              snapshotRef.current.videoDurationSec = d;
              triggerAutosave(markers);
              if (expectedDurationRef.current != null) {
                const expected = expectedDurationRef.current;
                expectedDurationRef.current = null; // only ever check once per load
                if (Math.abs(d - expected) > 2) {
                  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
                  setVideoMismatchWarning(
                    `This video is ${fmt(d)} long, but your saved moments were made against a ${fmt(expected)} video. If this isn't the exact same file, your timestamps will point at the wrong parts.`
                  );
                }
              }
            }}
            onLoadedMetadata={() => setVideoLoading(false)}
            onCanPlay={() => setVideoLoading(false)}
            onLoadedData={() => setVideoLoading(false)}
            onPlay={() => { pushDebug(`[PLAYBACK] video onPlay currentTime=${videoRef.current?.currentTime.toFixed(2)}`); setIsPlaying(true); }}
            onPause={() => { pushDebug(`[PLAYBACK] video onPause currentTime=${videoRef.current?.currentTime.toFixed(2)} readyState=${videoRef.current?.readyState} networkState=${videoRef.current?.networkState}`); setIsPlaying(false); }}
            onWaiting={() => pushDebug(`[PLAYBACK] video onWaiting (stalled/buffering) currentTime=${videoRef.current?.currentTime.toFixed(2)}`)}
            onStalled={() => pushDebug(`[PLAYBACK] video onStalled currentTime=${videoRef.current?.currentTime.toFixed(2)}`)}
            onSuspend={() => pushDebug(`[PLAYBACK] video onSuspend currentTime=${videoRef.current?.currentTime.toFixed(2)}`)}
            onEnded={() => { setIsPlaying(false); if (isPreviewMode) { setPreviewSeqIndex(null); setIsPreviewMode(false); } }}
            onError={e => {
              const v = e.currentTarget;
              const code = v.error?.code;
              pushDebug(`[PLAYBACK] video onError code=${code} message="${v.error?.message}"`);
              const msgs: Record<number, string> = {
                1: "Load aborted.",
                2: "Network error loading video.",
                3: "Video decoding failed — the file may be corrupted.",
                4: "Format not supported by this browser. Try MP4 (H.264).",
              };
              setVideoError(msgs[code ?? 0] ?? "Unknown video error.");
              setVideoLoading(false);
              setIsPlaying(false);
            }}
          />
          {/* Preview mode badge */}
          {isPreviewMode && (
            <div style={{ position: "absolute", top: 10, left: 10, background: "rgba(217,113,31,0.9)", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 800, color: "#000" }}>
              ● PREVIEW
            </div>
          )}
          {/* Loading overlay — on top of the already-rendering video element */}
          {videoLoading && (
            <div style={{
              position: "absolute", inset: 0, borderRadius: 12,
              background: "rgba(5,5,5,0.92)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14,
              zIndex: 2, // sits above the player (zIndex 1)
            }}>
              <Clapperboard size={40} color={ORANGE} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#ddd", marginBottom: 4 }}>Importing video…</div>
                <div style={{ fontSize: 11, color: "#666", maxWidth: 220, lineHeight: 1.5, wordBreak: "break-all" }}>{loadingFileName}</div>
              </div>
              <div style={{ width: 180, height: 3, background: "#1e1e1e", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", background: ORANGE, borderRadius: 2, animation: "hlImportScan 1.4s ease-in-out infinite" }} />
              </div>
            </div>
          )}
        </div>

        {/* Video error banner */}
        {videoError && (
          <div style={{ background: "#1a0000", border: "1px solid #5a1a1a", borderRadius: 10, padding: "10px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#ef4444" }}>
            <AlertCircle size={13} color="#ef4444" />
            <div style={{ flex: 1 }}>{videoError} — try a different file or format.</div>
            <button onClick={() => openFilePicker(fileInputRef)} style={{ background: ORANGE, border: "none", borderRadius: 7, padding: "5px 12px", fontSize: 11, fontWeight: 800, color: "#000", cursor: "pointer", flexShrink: 0 }}>
              Try another
            </button>
          </div>
        )}

        {!videoError && !videoUrl && (
          <div style={{ marginBottom: 16 }}>
            {/* ── Drop zone ── */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => openFilePicker(fileInputRef)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") openFilePicker(fileInputRef); }}
              onDragEnter={e => {
                e.preventDefault();
                dragCounter.current += 1;
                if (dragCounter.current === 1) setIsDragging(true);
              }}
              onDragOver={e => { e.preventDefault(); }}
              onDragLeave={() => {
                dragCounter.current -= 1;
                if (dragCounter.current === 0) setIsDragging(false);
              }}
              onDrop={e => {
                e.preventDefault();
                dragCounter.current = 0;
                setIsDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) loadVideo(file);
              }}
              style={{
                width: "100%",
                background: isDragging ? "#1a0f00" : "#0d0d0d",
                border: `2px dashed ${isDragging ? ORANGE : "#1e1e1e"}`,
                borderRadius: 16,
                padding: "44px 20px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
                cursor: "pointer",
                marginBottom: 10,
                boxSizing: "border-box",
                transition: "border-color 0.15s, background 0.15s",
              }}
              onMouseEnter={e => { if (!isDragging) e.currentTarget.style.borderColor = ORANGE + "55"; }}
              onMouseLeave={e => { if (!isDragging) e.currentTarget.style.borderColor = "#1e1e1e"; }}>
              <Film size={44} color={isDragging ? ORANGE : "#333"} style={{ transition: "color 0.15s" }} />
              <div style={{ fontSize: 15, fontWeight: 700, color: isDragging ? ORANGE : "#555", transition: "color 0.15s" }}>
                {isDragging ? "Release to Load" : "Tap to Load Video"}
              </div>
              {!isDragging && (
                <div style={{ fontSize: 12, color: "#444", textAlign: "center", maxWidth: 280, lineHeight: 1.55 }}>
                  Save your video to the <strong style={{ color: "#555" }}>Files app</strong> first, then tap here to load it.
                  <br />Any length supported — nothing is uploaded to the server.
                </div>
              )}
            </div>
          </div>
        )}

        {/* File input — kept off-screen (not display:none) so iOS Safari can activate it.
            Never add pointerEvents:none here — that breaks the iOS file-picker pipeline. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          style={{ position: "fixed", left: "-9999px", top: "-9999px", width: 1, height: 1, opacity: 0 }}
          onChange={handleFileChange}
        />


        {/* ── Reload video prompt — shown once this case has a saved video
            filename but nothing loaded in this session yet. Same model as
            any desktop video editor whose media went offline: your edits are
            always safe, you just need to point the app back at the source
            file each time you open it (see loadVideo's header comment). ── */}
        {!videoUrl && videoFileName && (
          <div style={{ background: markers.length > 0 ? "#081020" : "#1a0e00", border: `1px solid ${markers.length > 0 ? "#1a3060" : "#4a2800"}`, borderRadius: 10, padding: "12px 14px", marginBottom: 12, display: "flex", alignItems: "flex-start", gap: 10, fontSize: 12, color: markers.length > 0 ? "#4a80c0" : "#cc6600" }}>
            <AlertCircle size={14} color={markers.length > 0 ? "#4a80c0" : "#cc6600"} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1, lineHeight: 1.55 }}>
              {markers.length > 0 ? (
                <>
                  <strong style={{ color: "#7ab0e0" }}>Your {markers.length} saved edit{markers.length !== 1 ? "s" : ""} are here.</strong>{" "}
                  Reload <em style={{ color: "#aaa" }}>{videoFileName}</em> from this device to continue.
                </>
              ) : (
                <>Reload <strong>{videoFileName}</strong> to continue.</>
              )}
            </div>
            <button onClick={() => openFilePicker(fileInputRef)}
              style={{ background: markers.length > 0 ? "#3b82f6" : ORANGE, border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 800, color: "#fff", cursor: "pointer", flexShrink: 0 }}>
              Reload
            </button>
          </div>
        )}

        {/* ── Controls ──────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
          <button onClick={togglePlay} disabled={!videoUrl || thumbsLoading}
            title={thumbsLoading ? "Preparing your video…" : undefined}
            style={{ width: 42, height: 42, borderRadius: 21, background: videoUrl && !thumbsLoading ? ORANGE : "#1a1a1a", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: videoUrl && !thumbsLoading ? "pointer" : "not-allowed", flexShrink: 0 }}>
            {thumbsLoading
              ? <Loader2 size={16} color="#555" className="animate-spin" />
              : isPlaying ? <Pause size={16} color="#000" /> : <Play size={16} color={videoUrl ? "#000" : "#555"} />}
          </button>
          <div style={{ fontSize: 14, fontWeight: 800, color: videoUrl ? "#fff" : "#444", letterSpacing: 0.5, minWidth: 80, flexShrink: 0 }}>
            {thumbsLoading ? <PreparingVideoMessage /> : (
              <>
                {formatTime(currentTime)}
                <span style={{ color: "#444", fontWeight: 400 }}> / {duration ? formatTime(duration) : "--:--"}</span>
              </>
            )}
          </div>
          <div style={{ flex: 1 }} />

          {/* Preview mode toggle */}
          {videoUrl && markers.some(m => m.type === "screen_cut" || m.type === "exhibit_screen") && (
            <button
              onClick={() => {
                if (isPreviewMode) {
                  if (sequencedHoldTimerRef.current) clearTimeout(sequencedHoldTimerRef.current);
                  setPreviewSeqIndex(null);
                  setPreviewOverlayMarkerId(null);
                  setIsPreviewMode(false);
                } else if (previewSequence.length > 0) {
                  // Organized order exists — play it as Exhibit → Clip → Exhibit → Clip
                  // instead of the raw video's own chronological order.
                  setIsPreviewMode(true);
                  playSequencedStep(0);
                } else {
                  previewTriggeredRef.current = new Set();
                  seek(0);
                  setIsPreviewMode(true);
                  setTimeout(() => {
                    const v = videoRef.current;
                    if (v) v.play().catch(() => {});
                  }, 150);
                }
              }}
              title={isPreviewMode ? "Exit preview" : previewSequence.length > 0 ? "Preview in your organized order" : "Preview with screen cuts"}
              style={{ background: isPreviewMode ? ORANGE : "#111", border: `1px solid ${isPreviewMode ? ORANGE : "#222"}`, borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 700, color: isPreviewMode ? "#000" : "#888", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
              {isPreviewMode ? <StopCircle size={12} /> : <PlayCircle size={12} />}
              {isPreviewMode ? "Stop Preview" : "Preview"}
            </button>
          )}

          {/* Split + delete-by-drag for the selected moment — both tucked in the
              toolbar (not on the segment itself) so neither can be fat-fingered. */}
          {selectedChunkId && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 10 }}>
              <button onClick={() => { splitChunk(selectedChunkId, currentTime); setSelectedChunkId(null); }}
                title="Split the selected moment at the playhead"
                style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: 7, padding: "4px 8px",
                  display: "flex", alignItems: "center", gap: 4, cursor: "pointer", color: "#ccc", fontSize: 10, fontWeight: 700 }}>
                <Scissors size={11} /> Split
              </button>
              <span style={{ fontSize: 9, color: "#7a6a5c", fontWeight: 700, whiteSpace: "nowrap" }}>Drag to delete</span>
              <div
                onDragOver={e => { e.preventDefault(); setTrashDragOver(true); }}
                onDragLeave={() => setTrashDragOver(false)}
                onDrop={e => {
                  e.preventDefault();
                  setTrashDragOver(false);
                  try {
                    const data = JSON.parse(e.dataTransfer.getData("text/plain")) as { chunkId?: string };
                    if (data.chunkId) { removeChunk(data.chunkId); setSelectedChunkId(null); }
                  } catch { /* ignore malformed payload */ }
                }}
                title="Drag a moment here to delete it"
                style={{
                  width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                  background: trashDragOver ? "#ef4444" : "#2a1010", border: `1.5px solid ${trashDragOver ? "#ff8080" : "#5a2020"}`,
                  boxShadow: trashDragOver ? "0 0 10px #ef444488" : "none", transition: "all 0.12s",
                }}>
                <Trash2 size={13} color={trashDragOver ? "#fff" : "#ef4444"} />
              </div>
            </div>
          )}

          {/* Unsplit — an actual little Band-Aid sitting in the toolbar. Grab it
              and drag it straight onto the split you want healed; drop it there
              and that one split merges. Do it again for another split. */}
          <div
            draggable
            onDragStart={e => {
              e.dataTransfer.effectAllowed = "move";
              // Distinct marker so the track can tell "the Band-Aid" apart from
              // a chunk segment being dragged (e.g. toward the trash can) — the
              // track's own drop zone must ignore anything that isn't this.
              e.dataTransfer.setData("text/plain", "unsplit-bandaid");
              if (transparentDragImgRef.current) e.dataTransfer.setDragImage(transparentDragImgRef.current, 0, 0);
              setUnsplitGhostPos({ x: e.clientX, y: e.clientY });
            }}
            onDrag={e => {
              if (e.clientX === 0 && e.clientY === 0) return; // browsers fire one bogus (0,0) event right before dragend
              setUnsplitGhostPos({ x: e.clientX, y: e.clientY });
            }}
            onDragEnd={() => setUnsplitGhostPos(null)}
            title="Unsplit — drag this onto a split to heal it"
            style={{
              width: 28, height: 12, borderRadius: 999, marginRight: 10, flexShrink: 0,
              background: `linear-gradient(180deg, ${ORANGE}bb, #a85f22)`,
              border: "1px solid #5c4630",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "grab",
              opacity: unsplitGhostPos ? 0.3 : 1,
            }}>
            <div style={{ width: 6, height: "60%", background: "#e8dcc8", border: "1px solid #b09872", borderRadius: 1.5, pointerEvents: "none" }} />
          </div>
          {unsplitGhostPos && (
            <div style={{ position: "fixed", left: unsplitGhostPos.x, top: unsplitGhostPos.y, transform: "translate(-50%, -50%)",
              width: 28, height: 12, borderRadius: 999, pointerEvents: "none", zIndex: 9999,
              background: `linear-gradient(180deg, ${ORANGE}bb, #a85f22)`, border: "1px solid #5c4630",
              display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 6, height: "60%", background: "#e8dcc8", border: "1px solid #b09872", borderRadius: 1.5 }} />
            </div>
          )}

          {/* Zoom */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => setZoom(z => Math.max(1, z - 3))} disabled={zoom <= 1}
              style={{ background: "none", border: "none", cursor: zoom > 1 ? "pointer" : "not-allowed", opacity: zoom > 1 ? 1 : 0.4 }}>
              <ZoomOut size={14} color="#666" />
            </button>
            <span style={{ fontSize: 10, color: "#555", fontWeight: 700, minWidth: 24, textAlign: "center" }}>{zoom}×</span>
            <button onClick={() => setZoom(z => Math.min(20, z + 3))} disabled={zoom >= 20}
              style={{ background: "none", border: "none", cursor: zoom < 20 ? "pointer" : "not-allowed", opacity: zoom < 20 ? 1 : 0.4 }}>
              <ZoomIn size={14} color="#666" />
            </button>
          </div>

          {/* Change video */}
          {videoUrl && (
            <button onClick={() => openFilePicker(fileInputRef)} title="Change video"
              style={{ background: "none", border: "1px solid #222", borderRadius: 7, padding: "4px 10px", fontSize: 11, color: "#555", cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
              <Upload size={11} /> Change
            </button>
          )}
        </div>

        {/* ── Timeline ──────────────────────────────────────────────── */}
        <VideoTimeline
          duration={duration}
          currentTime={currentTime}
          markers={sortedMarkers}
          onSeek={seek}
          activeMarkerId={activeMarkerId}
          onSelectMarker={id => { setActiveMarkerId(id); }}
          chunks={chunks}
          thumbnails={thumbnails}
          thumbsLoading={thumbsLoading}
          step={currentStep}
          zoom={zoom}
          selectedChunkId={selectedChunkId}
          setSelectedChunkId={setSelectedChunkId}
          healableBoundaries={healableBoundaries}
          onHealBoundary={healBoundary}
          isDraggingBandaid={!!unsplitGhostPos}
        />

        {/* ── Case photo picker — the barrel-screen photo defaults to this
            video's opening frame (see the auto-set in acceptFrame above) the
            first time a video loads; this lets the user pick a better frame
            from the same filmstrip they already scrub through, or swap in
            their own photo instead. Only shown once thumbnails exist. ── */}
        {thumbnails.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <input ref={casePhotoInputRef} type="file" accept="image/*" style={{ display: "none" }}
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) downscaleCasePhoto(f, dataUrl => {
                  onUpdateCase({ ...hlCase, photoDataUrl: dataUrl });
                  api.cases.savePhoto(hlCase.id, dataUrl).catch(() => {});
                }, e.currentTarget);
              }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0, overflow: "hidden",
                background: "#111", border: "1px solid #222",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {hlCase.photoDataUrl
                  ? <img key={hlCase.photoDataUrl.slice(-24)} src={hlCase.photoDataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <Film size={16} color="#444" />}
              </div>
              <div style={{ flex: 1, fontSize: 12, color: "#888", fontWeight: 700 }}>Case Photo</div>
              <button onClick={() => setShowCasePhotoPicker(v => !v)}
                style={{ background: "none", border: "1px solid #2a2a2a", borderRadius: 7, padding: "5px 12px", fontSize: 11, fontWeight: 700, color: "#999", cursor: "pointer" }}>
                {showCasePhotoPicker ? "Done" : "Change"}
              </button>
            </div>
            {showCasePhotoPicker && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 8 }}>
                  Tap a frame from your video, or add your own photo.
                </div>
                <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
                  <button onClick={() => casePhotoInputRef.current?.click()}
                    style={{
                      flexShrink: 0, width: 56, height: 56, borderRadius: 8, background: "#111",
                      border: `1px dashed ${ORANGE}66`, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                    title="Add your own photo">
                    <Camera size={18} color={ORANGE} />
                  </button>
                  {thumbnails.map((src, i) => (
                    <button key={i}
                      onClick={() => {
                        onUpdateCase({ ...hlCase, photoDataUrl: src });
                        api.cases.savePhoto(hlCase.id, src).catch(() => {});
                        showInsertToast("Case photo updated");
                        setShowCasePhotoPicker(false);
                      }}
                      style={{
                        flexShrink: 0, width: 56, height: 56, borderRadius: 8, padding: 0, overflow: "hidden",
                        border: hlCase.photoDataUrl === src ? `2px solid ${ORANGE}` : "1px solid #222",
                        cursor: "pointer", background: "none",
                      }}>
                      <img src={src} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Currently working on — floats right under the track so the
            moment a user just chunked is visible without scrolling past the
            step nav and Chunk It button. Stays floating for as long as this
            is the most recently chunked moment — NOT tied to whether it has
            a label yet. It used to also require an empty label, so typing or
            dictating even one character yanked the card out from under the
            user mid-sentence and dropped it into the list below. Only moves
            to the list once the user chunks the next moment. ────────────── */}
        {currentStep === 1 && videoUrl && (() => {
          const active = chunks.find(c => c.id === lastChunkedId);
          if (!active) return null;
          const activeIndex = chunks.findIndex(c => c.id === active.id);
          return (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: ORANGE, fontWeight: 800, letterSpacing: 0.5, marginBottom: 6, textTransform: "uppercase" }}>
                Currently working on
              </div>
              {renderMomentCard(active, activeIndex)}
            </div>
          );
        })()}

        {/* ── Step Navigation ───────────────────────────────────────── */}
        {videoUrl && (
          <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
            {(["Chunk & Label", "Organize", "Exhibit"] as const).map((label, i) => {
              const s = i + 1;
              const isActive = currentStep === s;
              return (
                <button key={s} onClick={() => {
                  setCurrentStep(s);
                  triggerAutosave(markers, chunks, organizedSlots, s);
                }}
                  style={{ flex: 1, background: isActive ? "#1a1200" : "#0d0d0d",
                    border: `1px solid ${isActive ? ORANGE + "66" : "#1e1e1e"}`,
                    borderRadius: 10, padding: "8px 4px",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                    cursor: "pointer", transition: "all 0.1s" }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%",
                    background: isActive ? ORANGE : "#181818",
                    border: `1.5px solid ${isActive ? ORANGE : "#2a2a2a"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, fontWeight: 900, color: isActive ? "#000" : "#444" }}>
                    {s}
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, color: isActive ? ORANGE : "#3a3a3a", letterSpacing: 0.3 }}>
                    {label.toUpperCase()}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Step 1: Chunk & Label ─────────────────────────────────── */}
        {currentStep === 1 && videoUrl && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: "#555", marginBottom: 12, lineHeight: 1.6 }}>
              {chunks.length === 0
                ? "Watch the video and chunk it into moments — tap the button each time you want to mark the end of one, then briefly label it and say what happened. Keep it short for now; you'll come back through each moment afterward to really sit with it and tell the full story."
                : `${chunks.length} moment${chunks.length !== 1 ? "s" : ""} chunked and labeled below.`}
            </div>
            <button
              onClick={markMoment}
              disabled={!duration}
              style={{ width: "100%", background: ORANGE, border: "none", borderRadius: 14,
                padding: "18px 12px", display: "flex", alignItems: "center", justifyContent: "center",
                gap: 10, cursor: "pointer", fontWeight: 900, fontSize: 16, color: "#000" }}>
              <Bookmark size={18} color="#000" strokeWidth={2.5} />
              Chunk It
            </button>

            {chunks.length > 0 && (
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                {chunks
                  .map((c, i) => ({ c, originalIndex: i }))
                  .filter(({ c }) => c.id !== lastChunkedId) // shown floating above instead
                  .sort((a, b) => Number(!!a.c.label) - Number(!!b.c.label))
                  .map(({ c, originalIndex: i }) => renderMomentCard(c, i))}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              {chunks.length > 0 && (
                <button onClick={copyAllMomentInfo}
                  style={{ flex: 1, background: "none", border: "1px solid #252525", borderRadius: 12,
                    padding: "12px 12px", display: "flex", alignItems: "center", justifyContent: "center",
                    gap: 8, cursor: "pointer", fontWeight: 800, fontSize: 13, color: "#999" }}>
                  <Copy size={14} color="#999" />
                  Copy All Moment Info
                </button>
              )}
              <button onClick={() => setShowPasteMoments(true)}
                style={{ flex: 1, background: "none", border: "1px solid #252525", borderRadius: 12,
                  padding: "12px 12px", display: "flex", alignItems: "center", justifyContent: "center",
                  gap: 8, cursor: "pointer", fontWeight: 800, fontSize: 13, color: "#999" }}>
                <ClipboardPaste size={14} color="#999" />
                Paste Moments
              </button>
            </div>

            {showPasteMoments && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 300, display: "flex", alignItems: "flex-end" }}
                onClick={() => setShowPasteMoments(false)}>
                <div onClick={e => e.stopPropagation()} style={{ background: "#161311", borderRadius: "20px 20px 0 0", width: "100%", padding: "24px 22px calc(24px + env(safe-area-inset-bottom))", borderTop: `2px solid ${ORANGE}33` }}>
                  <div style={{ width: 40, height: 4, background: "#2a2a2a", borderRadius: 2, margin: "0 auto 20px" }} />
                  <div style={{ fontSize: 17, fontWeight: 900, color: "#fff", marginBottom: 10 }}>Paste Moments</div>
                  <div style={{ fontSize: 13, color: "#aaa", lineHeight: 1.7, marginBottom: 16 }}>
                    Paste text you copied with "Copy All Moment Info" — it'll rebuild each moment with its exact original timestamp, short name, and label. Added alongside anything already here, not replacing it.
                  </div>
                  <textarea
                    autoFocus
                    value={pasteMomentsText}
                    onChange={e => setPasteMomentsText(e.target.value)}
                    placeholder={"Moment 1 — 0:00–0:12\nOfficer arrives\n..."}
                    style={{ width: "100%", minHeight: 140, background: "#111", border: "1px solid #252525",
                      borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "#ddd", fontFamily: "monospace",
                      outline: "none", boxSizing: "border-box", marginBottom: 14, resize: "vertical" }}
                  />
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setShowPasteMoments(false)}
                      style={{ flex: 1, background: "none", border: "1px solid #333", borderRadius: 10, padding: "12px", fontSize: 14, fontWeight: 700, color: "#999", cursor: "pointer" }}>
                      Cancel
                    </button>
                    <button onClick={importPastedMoments} disabled={!pasteMomentsText.trim()}
                      style={{ flex: 1, background: pasteMomentsText.trim() ? ORANGE : "#2a2a2a", border: "none", borderRadius: 10, padding: "12px", fontSize: 14, fontWeight: 800, color: pasteMomentsText.trim() ? "#000" : "#666", cursor: pasteMomentsText.trim() ? "pointer" : "default" }}>
                      Import
                    </button>
                  </div>
                </div>
              </div>
            )}

            {showDictationHelp && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 300, display: "flex", alignItems: "flex-end" }}
                onClick={() => setShowDictationHelp(false)}>
                <div onClick={e => e.stopPropagation()} style={{ background: "#161311", borderRadius: "20px 20px 0 0", width: "100%", padding: "24px 22px calc(24px + env(safe-area-inset-bottom))", borderTop: `2px solid ${ORANGE}33` }}>
                  <div style={{ width: 40, height: 4, background: "#2a2a2a", borderRadius: 2, margin: "0 auto 20px" }} />
                  <div style={{ fontSize: 17, fontWeight: 900, color: "#fff", marginBottom: 10 }}>🎙️ Mic not working?</div>
                  <div style={{ fontSize: 13, color: "#aaa", lineHeight: 1.7, marginBottom: 16 }}>
                    That's normal on some browsers — the dictate button only works in Chrome. Two easy options:
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                    <div style={{ background: "#0d0d0d", border: "1px solid #222", borderRadius: 12, padding: "12px 14px" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: ORANGE, marginBottom: 4 }}>Switch to Chrome</div>
                      <div style={{ fontSize: 12, color: "#888", lineHeight: 1.5 }}>Open this page in Chrome and the mic button will work directly.</div>
                    </div>
                    <div style={{ background: "#0d0d0d", border: "1px solid #222", borderRadius: 12, padding: "12px 14px" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: ORANGE, marginBottom: 4 }}>Or use your phone</div>
                      <div style={{ fontSize: 12, color: "#888", lineHeight: 1.5 }}>Speak into your phone's Notes app, then copy the text and paste it in here — easy, and you don't have to stop what you're doing.</div>
                    </div>
                  </div>
                  <button onClick={() => setShowDictationHelp(false)} style={{ width: "100%", padding: "13px", background: `linear-gradient(90deg, ${ORANGE}, #FF7A1A)`, border: "none", borderRadius: 12, color: "#0a0908", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                    Got it
                  </button>
                </div>
              </div>
            )}

            {framePickerChunk && videoUrl && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 300, display: "flex", alignItems: "flex-end" }}
                onClick={() => setFramePickerChunkId(null)}>
                <div onClick={e => e.stopPropagation()} style={{ background: "#161311", borderRadius: "20px 20px 0 0", width: "100%", padding: "20px 20px calc(20px + env(safe-area-inset-bottom))", borderTop: `2px solid ${ORANGE}33` }}>
                  <div style={{ width: 40, height: 4, background: "#2a2a2a", borderRadius: 2, margin: "0 auto 16px" }} />
                  <div style={{ fontSize: 15, fontWeight: 900, color: "#fff", marginBottom: 4 }}>Pick the frame</div>
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 14 }}>Drag to find the right moment, then capture it.</div>
                  <video
                    ref={framePickerVideoRef}
                    src={videoUrl}
                    muted
                    playsInline
                    onLoadedData={() => { if (framePickerVideoRef.current) framePickerVideoRef.current.currentTime = framePickerTime; }}
                    style={{ width: "100%", borderRadius: 12, background: "#000", display: "block", marginBottom: 14 }}
                  />
                  <input
                    type="range"
                    min={framePickerChunk.start}
                    max={Math.max(framePickerChunk.end, framePickerChunk.start + 0.1)}
                    step={0.03}
                    value={framePickerTime}
                    onChange={e => {
                      const t = Number(e.target.value);
                      setFramePickerTime(t);
                      if (framePickerVideoRef.current) framePickerVideoRef.current.currentTime = t;
                    }}
                    style={{ width: "100%", marginBottom: 16, accentColor: ORANGE }}
                  />
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setFramePickerChunkId(null)}
                      style={{ flex: 1, padding: "13px", background: "none", border: "1px solid #2a2a2a", borderRadius: 12, color: "#888", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                      Cancel
                    </button>
                    <button onClick={captureFramePickerFrame}
                      style={{ flex: 2, padding: "13px", background: `linear-gradient(90deg, ${ORANGE}, #FF7A1A)`, border: "none", borderRadius: 12, color: "#0a0908", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                      Use This Frame
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Organize ──────────────────────────────────────── */}
        {currentStep === 2 && videoUrl && (
          <div style={{ marginBottom: 20 }}>
            {chunks.length === 0 ? (
              <div style={{ background: "#0d0d0d", border: "1px dashed #222", borderRadius: 12,
                padding: "20px 16px", textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 10 }}>Mark and label moments first.</div>
                <button onClick={() => setCurrentStep(1)}
                  style={{ background: ORANGE, border: "none", borderRadius: 10, padding: "10px 20px",
                    fontSize: 12, fontWeight: 800, color: "#000", cursor: "pointer" }}>
                  Start at Step 1
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  <button
                    onClick={handleAIOrganize}
                    disabled={aiOrganizing}
                    style={{ flex: 2, background: ORANGE, border: "none", borderRadius: 10,
                      padding: "12px 10px", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                      cursor: aiOrganizing ? "default" : "pointer", opacity: aiOrganizing ? 0.7 : 1,
                      fontWeight: 800, fontSize: 13, color: "#000" }}>
                    {aiOrganizing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                    {aiOrganizing ? "Organizing…" : "Let AI Organize It"}
                  </button>
                  <button
                    onClick={() => showInsertToast("You're in control — drag moments below into the order you want.")}
                    disabled={aiOrganizing}
                    style={{ flex: 1, background: "none", border: "1px solid #2a2a2a", borderRadius: 10,
                      padding: "12px 10px", cursor: aiOrganizing ? "default" : "pointer",
                      fontWeight: 700, fontSize: 13, color: "#888" }}>
                    Myself
                  </button>
                </div>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 10, lineHeight: 1.6 }}>
                  Drag moments from the track above into story order.{" "}
                  {chunks.some(c => c.tag === "consistency") && (
                    <span style={{ color: "#3a6a3a" }}>💡 You have a consistent moment — consider opening with it.</span>
                  )}
                </div>
                {aiOrganizeReason && (
                  <div style={{ background: "#0d0d0d", border: `1px solid ${ORANGE}22`, borderRadius: 10,
                    padding: "10px 12px", marginBottom: 12, display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <Wand2 size={13} color={ORANGE} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={{ fontSize: 12, color: "#aaa", lineHeight: 1.55 }}>{aiOrganizeReason}</div>
                  </div>
                )}
                <div style={{ overflowX: "auto", paddingBottom: 4 }}>
                  <div style={{ display: "flex", gap: 6, minWidth: "max-content" }}>
                    {organizedSlots.map((chunkId, i) => {
                      const chunk = chunkId ? chunks.find(c => c.id === chunkId) ?? null : null;
                      return (
                        <SlotCell key={i} index={i} chunk={chunk}
                          onDrop={id => {
                            const newSlots = [...organizedSlots];
                            const prev = newSlots.indexOf(id);
                            if (prev !== -1) newSlots[prev] = null;
                            newSlots[i] = id;
                            // Auto-expand if last slot is filled
                            const lastFilled = newSlots.reduce((acc, s, idx) => s ? idx : acc, -1);
                            if (lastFilled >= newSlots.length - 1) { newSlots.push(null); newSlots.push(null); }
                            setOrganizedSlots(newSlots);
                            triggerAutosave(markers, chunks, newSlots, currentStep);
                          }}
                          onClear={() => {
                            const newSlots = organizedSlots.map((s, idx) => idx === i ? null : s);
                            setOrganizedSlots(newSlots);
                            triggerAutosave(markers, chunks, newSlots, currentStep);
                          }} />
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Step 3: Exhibit, Media, Mic ───────────────────────────── */}
        {currentStep === 3 && (
          <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
            <button
              onClick={() => {
                if (!videoUrl) return;
                if (videoRef.current && isPlaying) { videoRef.current.pause(); setIsPlaying(false); }
                setShowExhibitGenerator(true);
              }}
              disabled={!videoUrl}
              style={{ flex: 1, background: videoUrl ? ORANGE : "#1a1a1a", border: "none", borderRadius: 12,
                padding: "14px 12px", display: "flex", alignItems: "center", justifyContent: "center",
                gap: 7, cursor: videoUrl ? "pointer" : "not-allowed", fontWeight: 800, fontSize: 13,
                color: videoUrl ? "#000" : "#444", minWidth: 100 }}>
              <Wand2 size={15} /> Exhibit
            </button>

            {/* Media insert */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => { if (!videoUrl) return; setShowMediaPicker(v => !v); }}
                disabled={!videoUrl}
                title="Insert photo or clip"
                style={{ width: 50, height: 50, borderRadius: 12, background: showMediaPicker ? "#2a1a4a" : "#111",
                  border: `1px solid ${showMediaPicker ? "#a78bfa" : videoUrl ? "#a78bfa55" : "#222"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: videoUrl ? "pointer" : "not-allowed" }}>
                <ImageIcon size={18} color={videoUrl ? "#a78bfa" : "#444"} />
              </button>
              {showMediaPicker && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 49 }} onClick={() => setShowMediaPicker(false)} />
                  <div style={{ position: "absolute", bottom: "calc(100% + 6px)", right: 0, background: "#1a1a1a",
                    border: "1px solid #2a2a2a", borderRadius: 10, overflow: "hidden", zIndex: 50, minWidth: 148 }}>
                    <label htmlFor="studio-media-photo-input"
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px",
                        cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#ccc" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#252525")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <ImageIcon size={13} color="#a78bfa" /> Photo
                    </label>
                    <div style={{ height: 1, background: "#222" }} />
                    <label htmlFor="studio-media-clip-input"
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px",
                        cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#ccc" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#252525")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <Film size={13} color="#a78bfa" /> Video Clip
                    </label>
                  </div>
                </>
              )}
              <input id="studio-media-photo-input" type="file" accept="image/*" style={{ display: "none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) insertMediaMarker(f, "photo"); e.target.value = ""; }} />
              <input id="studio-media-clip-input" type="file" accept="video/*" style={{ display: "none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) insertMediaMarker(f, "clip"); e.target.value = ""; }} />
            </div>

            {/* Mic */}
            <button
              onClick={() => {
                if (activeMarkerId) {
                  const m = markers.find(x => x.id === activeMarkerId);
                  if (m && m.type !== "screen_cut" && m.type !== "video_cut" && !isDictating) startDictation(activeMarkerId);
                } else if (videoUrl) {
                  if (videoRef.current && isPlaying) { videoRef.current.pause(); setIsPlaying(false); }
                  setShowExhibitGenerator(true);
                }
              }}
              disabled={!videoUrl}
              style={{ width: 50, height: 50, borderRadius: 12, background: isDictating ? "#1a0000" : "#111",
                border: `1px solid ${isDictating ? "#ef4444" : "#2a2a2a"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: videoUrl ? "pointer" : "not-allowed", flexShrink: 0 }}>
              {isDictating ? <MicOff size={18} color="#ef4444" /> : <Mic size={18} color="#888" />}
            </button>
          </div>
        )}

      </div>

      {/* ── Dictation overlay ─────────────────────────────────────── */}
      {isDictating && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", zIndex: 800, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
          <div style={{ width: 80, height: 80, borderRadius: 40, background: "#1a0000", border: "2px solid #ef4444", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, boxShadow: "0 0 0 8px rgba(239,68,68,0.1), 0 0 0 16px rgba(239,68,68,0.05)" }}>
            <Mic size={36} color="#ef4444" />
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginBottom: 8 }}>Recording…</div>
          <div style={{ fontSize: 12, color: "#666", textAlign: "center", marginBottom: 24, maxWidth: 320, lineHeight: 1.6 }}>
            Describe exactly what happened in this moment. Include actions, statements, contradictions, and anything a judge or jury should notice.
          </div>
          {/* A real, editable textarea — not just a live-transcript display.
              window.SpeechRecognition doesn't exist on iOS Safari/WKWebView
              at all (it's never shipped the recognition side of the Web
              Speech API, only synthesis), so on iOS this was a dead end: a
              read-only div that stayed on "Listening…" forever with no way
              to actually get text in. Autofocusing this brings up the
              keyboard immediately, which has its own dictation mic button
              for real voice-to-text — and typing manually always works
              regardless of platform support. */}
          <textarea
            autoFocus
            value={dictationText}
            onChange={e => setDictationText(e.target.value)}
            placeholder={speechSupported ? "Listening… (or just type here)" : "Type here — tap the mic on your keyboard to dictate"}
            style={{ width: "100%", maxWidth: 380, background: "#111", borderRadius: 12, padding: "14px 16px", minHeight: 100, fontSize: 14, color: "#ccc", lineHeight: 1.6, marginBottom: 24, border: "1px solid #1e1e1e", boxSizing: "border-box", resize: "none", fontFamily: "inherit" }}
          />
          <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: 380 }}>
            <button onClick={() => stopDictation(false)}
              style={{ flex: 1, background: "#1a1a1a", border: "1px solid #333", borderRadius: 12, padding: "14px", fontSize: 14, fontWeight: 700, color: "#888", cursor: "pointer" }}>
              Cancel
            </button>
            <button onClick={() => stopDictation(true)}
              style={{ flex: 2, background: ORANGE, border: "none", borderRadius: 12, padding: "14px", fontSize: 14, fontWeight: 800, color: "#000", cursor: "pointer" }}>
              Done — Build Exhibit
            </button>
          </div>
        </div>
      )}

      {/* ── Exhibit Draft Sheet ────────────────────────────────────── */}
      {viewingDraftId && viewingMarker && (
        <ExhibitDraftSheet
          marker={viewingMarker}
          exhibitNumber={sortedMarkers.findIndex(m => m.id === viewingDraftId) + 1}
          onClose={() => setViewingDraftId(null)}
          onUpdateWhyItMatters={text => {
            const updated = markers.map(m => m.id === viewingDraftId ? { ...m, whyItMatters: text } : m);
            setMarkers(updated, false);
          }}
        />
      )}

      {/* ── Cut Screen Builder Modal ───────────────────────────────── */}
      {showCutBuilder && (
        <CutScreenBuilderModal
          initialTime={currentTime}
          duration={duration}
          existingMarkers={markers}
          onInsert={handleCutInsert}
          onCancel={() => setShowCutBuilder(false)}
        />
      )}

      {/* ── Preview Screen Overlay ─────────────────────────────────── */}
      {previewOverlayMarkerId && previewOverlayMarker && (
        <PreviewScreenOverlay
          marker={previewOverlayMarker}
          onDone={() => {
            if (previewSeqIndex !== null) {
              // Sequenced mode — manual "Skip" jumps straight to this step's clip.
              if (sequencedHoldTimerRef.current) { clearTimeout(sequencedHoldTimerRef.current); sequencedHoldTimerRef.current = null; }
              setPreviewOverlayMarkerId(null);
              playChunkClip(previewSeqIndex);
            } else {
              setPreviewOverlayMarkerId(null);
              const v = videoRef.current;
              if (v) v.play().catch(() => {});
            }
          }}
        />
      )}

      {/* ── Jurisdiction result sheet ──────────────────────────────── */}
      {showVerifResult && verification && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 700, display: "flex", alignItems: "flex-end" }}
          onClick={() => setShowVerifResult(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#111", borderRadius: "20px 20px 0 0", width: "100%", padding: "24px 24px calc(24px + env(safe-area-inset-bottom))", borderTop: `2px solid ${ORANGE}33` }}>
            <div style={{ width: 36, height: 3, background: "#2a2a2a", borderRadius: 2, margin: "0 auto 20px" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              {verification.verdict === "permitted"    && <><CheckCircle2 size={22} color="#22c55e" /><div style={{ fontSize: 18, fontWeight: 900, color: "#22c55e" }}>Generally permitted.</div></>}
              {verification.verdict === "limited"      && <><AlertCircle  size={22} color="#f59e0b" /><div style={{ fontSize: 18, fontWeight: 900, color: "#f59e0b" }}>Allowed with limitations.</div></>}
              {verification.verdict === "not_accepted" && <><XCircle      size={22} color="#ef4444" /><div style={{ fontSize: 18, fontWeight: 900, color: "#ef4444" }}>Not generally accepted.</div></>}
            </div>
            <p style={{ fontSize: 14, color: "#888", lineHeight: 1.6, margin: "0 0 16px" }}>{verification.explanation}</p>
            <div style={{ fontSize: 11, color: "#444", marginBottom: 20 }}>
              Verified {new Date(verification.verifiedAt).toLocaleDateString()}. Hold the Verify button to refresh.
            </div>
            <button onClick={() => setShowVerifResult(false)}
              style={{ width: "100%", background: "#1a1a1a", border: "none", borderRadius: 12, padding: 14, fontSize: 14, fontWeight: 700, color: "#888", cursor: "pointer" }}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── AI Exhibit Screen Generator ────────────────────────────── */}
      {showExhibitGenerator && (
        <ExhibitGeneratorPanel
          caseId={hlCase.id}
          currentTime={currentTime}
          videoRef={videoRef}
          videoUrl={videoUrl}
          existingExhibits={markers
            .filter(m => m.type === "exhibit_screen" && m.exhibitScreen)
            .map(m => `${m.label}: ${m.exhibitScreen!.selectedType.replace(/_/g, " ")}`)}
          onClose={() => setShowExhibitGenerator(false)}
          onApprove={insertExhibitScreenMarker}
        />
      )}

      {/* ── Export modal ───────────────────────────────────────────── */}
      {showExport && (
        <ExhibitVideoExportModal
          videoUrl={videoUrl}
          durationSec={duration}
          markers={markers}
          caseTitle={hlCase.title}
          onClose={() => setShowExport(false)}
          onUpdateHold={updateMarkerHold}
          initialResKey={exportSettings.resKey}
          initialFps={exportSettings.fps}
          initialFormat={exportSettings.format}
          initialIncludeAudio={exportSettings.includeAudio}
          onSettingsChange={s => { setExportSettings(s); triggerIndexedDBSave(); }}
          onExportComplete={() => { api.studioProject.clearExpiry(hlCase.id).catch(() => {}); }}
        />
      )}

      {/* ── "You already have saved moments" confirmation — marker timestamps
          are tied to the exact video they were made against, so loading a
          different (or even re-exported) video after moments already exist
          would silently desync every timestamp from what it actually points
          at. Shown before the picker ever opens once there's real progress
          to protect. ── */}
      {pendingFilePickerRef && (
        <div
          onClick={() => setPendingFilePickerRef(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 700,
            background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20, boxSizing: "border-box",
          }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 380, background: "#141414", border: "1px solid #2a2a2a",
              borderRadius: 16, padding: 20, boxSizing: "border-box",
            }}>
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <AlertCircle size={18} color={ORANGE} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>
                You already have {markers.length} saved moment{markers.length !== 1 ? "s" : ""}
              </div>
            </div>
            <div style={{ fontSize: 13, color: "#999", lineHeight: 1.6, marginBottom: 18 }}>
              Your moments are timed to this exact recording. If you load a different video (or a re-exported version of this one), those timestamps won't line up anymore. Only continue if you're reloading <em style={{ color: "#bbb" }}>the same</em> video file.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setPendingFilePickerRef(null)}
                style={{ flex: 1, background: "#1c1c1c", border: "1px solid #2a2a2a", borderRadius: 10, padding: "11px", fontSize: 13, fontWeight: 700, color: "#ccc", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={() => pendingFilePickerRef && openFilePickerConfirmed(pendingFilePickerRef)}
                style={{ flex: 1, background: ORANGE, border: "none", borderRadius: 10, padding: "11px", fontSize: 13, fontWeight: 800, color: "#000", cursor: "pointer" }}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Native Photos/Files source choice — the web <input type=file>
          sheet offers both in one dialog, but the native FilePicker plugin
          exposes them as two distinct pickers. ── */}
      {showNativeSourceChoice && (
        <div
          onClick={() => setShowNativeSourceChoice(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 700,
            background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 480, background: "#141414",
              borderTopLeftRadius: 18, borderTopRightRadius: 18,
              padding: "10px 16px calc(20px + env(safe-area-inset-bottom))",
              boxSizing: "border-box",
            }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "#333", margin: "6px auto 16px" }} />
            <button onClick={() => pickFromNativeSource("photos")}
              style={{ width: "100%", textAlign: "left", background: "#1c1c1c", border: "none", borderRadius: 12, padding: "14px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <ImageIcon size={18} color={ORANGE} />
              <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>Photo Library</span>
            </button>
            <button onClick={() => pickFromNativeSource("files")}
              style={{ width: "100%", textAlign: "left", background: "#1c1c1c", border: "none", borderRadius: 12, padding: "14px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <Upload size={18} color={ORANGE} />
              <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>Files</span>
            </button>
            <button onClick={() => setShowNativeSourceChoice(false)}
              style={{ width: "100%", textAlign: "center", background: "none", border: "none", padding: "12px 16px", cursor: "pointer" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#888" }}>Cancel</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Media insert toast — "Clip added to timeline" etc. Also reused for
          longer messages (e.g. video-save failures), so this can't assume a
          single short line — whiteSpace:nowrap with no width cap used to
          stretch long messages into one unreadable line running off both
          edges of the screen. ── */}
      {insertToast && (
        <div style={{
          position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)",
          background: "#111", border: "1px solid #2a2a2a", borderRadius: 16,
          padding: "10px 20px", fontSize: 13, fontWeight: 700, color: "#ddd",
          zIndex: 600, whiteSpace: "normal", textAlign: "center", lineHeight: 1.5,
          maxWidth: "calc(100vw - 40px)", boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
          pointerEvents: "none",
          animation: "hlConfirmFlash 0.25s ease-out",
        }}>
          {insertToast}
        </div>
      )}

      {/* ── Diagnostics pull-tab — always available (once there's anything
          logged) without covering the screen the way a fixed bottom overlay
          did. Tap to slide the sidebar out. ── */}
      {debugLog.length > 0 && !debugSidebarOpen && (
        <button
          onClick={() => setDebugSidebarOpen(true)}
          style={{
            position: "fixed", right: 0, top: "50%", transform: "translateY(-50%)", zIndex: 9998,
            background: "#0a0a0a", border: "1px solid #333", borderRight: "none",
            borderRadius: "8px 0 0 8px", padding: "10px 6px", cursor: "pointer",
            writingMode: "vertical-rl", fontFamily: "monospace", fontSize: 10, fontWeight: 700,
            color: "#0f0", letterSpacing: 1,
          }}>
          DEBUG ({debugLog.length})
        </button>
      )}

      {/* ── Diagnostics panel — a centered square, not a full-height sidebar
          (which stretched under the status bar and made Copy/X unreachable). ── */}
      {debugSidebarOpen && (
        <div
          onClick={() => setDebugSidebarOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: "min(320px, 85vw)", height: "min(320px, 85vw)",
              background: "rgba(0,0,0,0.94)", border: "1px solid #333", borderRadius: 14,
              display: "flex", flexDirection: "column",
              boxShadow: "0 8px 30px rgba(0,0,0,0.6)",
            }}>
            <div style={{
              flexShrink: 0, display: "flex", alignItems: "center", gap: 8,
              padding: "10px 10px", borderBottom: "1px solid #222",
            }}>
              <div style={{ flex: 1, fontWeight: 700, color: "#ff0", fontSize: 11, fontFamily: "monospace" }}>
                DIAGNOSTICS ({debugLog.length})
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(debugLog.join("\n")).then(() => {
                    setDebugCopied(true);
                    setTimeout(() => setDebugCopied(false), 1500);
                  });
                }}
                style={{ background: debugCopied ? "#1a3a1a" : "#1a1a1a", border: "1px solid #333", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 10, fontWeight: 700, color: debugCopied ? "#4ade80" : "#aaa", fontFamily: "monospace" }}>
                {debugCopied ? "Copied!" : "Copy all"}
              </button>
              <button
                onClick={() => {
                  // debugLogRef is what pushDebug actually appends onto — clearing
                  // only the displayed debugLog state and not this too would mean
                  // the very next log line resurrects everything "cleared" right
                  // alongside it, since pushDebug does [...debugLogRef.current, line].
                  debugLogRef.current = [];
                  setDebugLog([]);
                }}
                style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 10, fontWeight: 700, color: "#aaa", fontFamily: "monospace" }}>
                Clear
              </button>
              <button onClick={() => setDebugSidebarOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex" }}>
                <X size={14} color="#888" />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px", fontFamily: "monospace", fontSize: 10, color: "#0f0", lineHeight: 1.5 }}>
              {debugLog.map((line, i) => (
                <div key={i} style={{ color: line.startsWith("[4]") || line.startsWith("[ERR]") ? "#f55" : "#0f0", wordBreak: "break-all" }}>
                  {line}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft, Play, Pause, Plus, Mic, MicOff, Undo2, Redo2,
  Check, Film, Upload, X, AlertCircle, CheckCircle2, XCircle,
  Loader2, Eye, Shield, ZoomIn, ZoomOut, Info, Clapperboard, Download,
  Scissors, Monitor, PlayCircle, StopCircle, RotateCcw, ImageIcon, Wand2, Trash2, Bookmark,
} from "lucide-react";
import type { HLCase, ExhibitMarker, StudioProject, JurisdictionVerification, ScreenInsert, MediaInsert, ExhibitScreenData, VideoChunk } from "../../types";
import { aiApi } from "../../lib/aiApi";
import { api } from "../../lib/api";
import { ExhibitGeneratorPanel } from "./exhibits";
import ExhibitVideoExportModal from "./ExhibitVideoExportModal";
import { saveStudioSnapshot, loadStudioSnapshot, clearStudioSnapshot, saveVideoBlob, loadVideoBlob, clearVideoBlob, saveThumbnails } from "./studioIndexedDB";
import type { ExportSettings, StudioSnapshot } from "./studioIndexedDB";

const ORANGE = "#d9711f";
// Single source of truth for the studio project retention window — used for
// both the video's local blob and the server-side markers/exhibit data, so
// the two can never drift out of sync with each other.
const EXPIRY_DAYS = 30;
const EXPIRY_MS = EXPIRY_DAYS * 24 * 60 * 60 * 1000;

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
  chunks, onSplitChunk, onRemoveChunk,
  thumbnails, thumbsLoading, step, zoom,
}: {
  duration: number; currentTime: number;
  markers: ExhibitMarker[];
  onSeek: (t: number) => void;
  activeMarkerId: string | null;
  onSelectMarker: (id: string) => void;
  chunks: VideoChunk[];
  onSplitChunk: (id: string, at: number) => void;
  onRemoveChunk: (id: string) => void;
  thumbnails: string[];
  thumbsLoading: boolean;
  step: number;
  zoom: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(null);
  const [draggingChunkId, setDraggingChunkId] = useState<string | null>(null);
  const dragState = useRef<{ active: boolean; startX: number; moved: boolean }>(
    { active: false, startX: 0, moved: false }
  );

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
  function segThumbs(start: number, end: number): string[] {
    if (!NUM || !duration) return [];
    const dt = duration / Math.max(1, NUM - 1);
    const inRange = thumbnails.filter((_, i) => {
      const t = i * dt;
      return t >= start - dt * 0.55 && t <= end + dt * 0.55;
    });
    if (inRange.length > 0) return inRange;
    let best = 0, bestD = Infinity;
    thumbnails.forEach((_, i) => { const d = Math.abs(i * dt - (start + end) / 2); if (d < bestD) { bestD = d; best = i; } });
    return [thumbnails[best]];
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
        {/* ── Track ── */}
        <div ref={trackRef}
          style={{ flex: 1, height: 72, borderRadius: 10, position: "relative",
            cursor: "pointer", border: "1.5px solid #1e1e1e",
            overflow: "hidden", boxSizing: "border-box" }}
          onMouseDown={e => { if ((e.target as HTMLElement).closest("button")) return; startDrag(e.clientX); }}
          onTouchStart={e => {
            if ((e.target as HTMLElement).closest("button")) return;
            e.preventDefault();
            const tc = e.touches[0];
            dragState.current = { active: true, startX: tc.clientX, moved: false };
            onSeek(pctFromX(tc.clientX) * duration);
          }}
          onTouchMove={e => { e.preventDefault(); moveDrag(e.touches[0].clientX); }}
          onTouchEnd={() => endDrag()}>

          {/* Raw footage strip — shown before any chunks are marked */}
          {allSegs.length === 0 && duration > 0 && (
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
            const thumbs = segThumbs(seg.start, seg.end);
            const playedFrac = !seg.isDeleted && currentTime > seg.start
              ? Math.min(1, (Math.min(currentTime, seg.end) - seg.start) / (seg.end - seg.start))
              : 0;
            const tagColor = seg.tag ? TAG_COLORS[seg.tag] : null;
            return (
              <div key={seg.id}
                draggable={!seg.isDeleted && step === 3}
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
                  cursor: seg.isDeleted ? "default" : step === 3 ? "grab" : "pointer",
                  opacity: draggingChunkId === seg.id ? 0.35 : 1,
                  transition: "opacity 0.12s" }}>

                {seg.isDeleted ? (
                  <div style={{ position: "absolute", inset: 0, background: "#090909",
                    borderLeft: "1px solid #1a1a1a", borderRight: "1px solid #1a1a1a" }} />
                ) : (
                  <>
                    {/* Thumbnail strip */}
                    <div style={{ position: "absolute", inset: 0, display: "flex", overflow: "hidden" }}>
                      {thumbs.map((src, ti) => (
                        <img key={ti} src={src} alt="" draggable={false}
                          style={{ flex: 1, height: "100%", objectFit: "cover", display: "block", minWidth: 0 }} />
                      ))}
                      {thumbs.length === 0 && (
                        <div style={{ flex: 1, background: "repeating-linear-gradient(90deg,#111 0,#111 1px,#161616 1px,#161616 40px)" }} />
                      )}
                    </div>
                    {/* Played scrim */}
                    {playedFrac > 0 && (
                      <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
                        background: `linear-gradient(to right, rgba(0,0,0,0.48) ${playedFrac * 100}%, transparent ${playedFrac * 100}%)` }} />
                    )}
                    {/* Tag color bar */}
                    {tagColor && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: tagColor, zIndex: 3 }} />}
                    {/* Label overlay (step 2+) */}
                    {step >= 2 && seg.label && (
                      <div style={{ position: "absolute", bottom: tagColor ? 5 : 2, left: 3, right: 3, zIndex: 4,
                        fontSize: 8, fontWeight: 800, color: "#fff", textShadow: "0 1px 3px #000",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {seg.label}
                      </div>
                    )}
                    {/* Right divider */}
                    <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.18)", zIndex: 2 }} />
                    {/* Selected overlay — Split + Remove buttons */}
                    {isSelected && (
                      <div style={{ position: "absolute", inset: 0, border: "2px solid rgba(255,255,255,0.85)",
                        boxSizing: "border-box", background: "rgba(255,255,255,0.07)", zIndex: 6 }}>
                        <div style={{ position: "absolute", top: "50%", left: "50%",
                          transform: "translate(-50%,-50%)", display: "flex", gap: 4 }}>
                          <button onMouseDown={e => e.stopPropagation()}
                            onClick={e => { e.stopPropagation(); onSplitChunk(seg.id, currentTime); setSelectedChunkId(null); }}
                            style={{ background: "rgba(10,10,10,0.92)", border: "1px solid rgba(255,255,255,0.2)",
                              borderRadius: 7, padding: "4px 7px", display: "flex", alignItems: "center", gap: 3,
                              cursor: "pointer", color: "#eee", fontSize: 9, fontWeight: 800, whiteSpace: "nowrap" }}>
                            <Scissors size={9} /> Split
                          </button>
                          <button onMouseDown={e => e.stopPropagation()}
                            onClick={e => { e.stopPropagation(); onRemoveChunk(seg.id); setSelectedChunkId(null); }}
                            style={{ background: "rgba(10,10,10,0.92)", border: "1px solid rgba(239,68,68,0.35)",
                              borderRadius: 7, padding: "4px 7px", display: "flex", alignItems: "center", gap: 3,
                              cursor: "pointer", color: "#ef4444", fontSize: 9, fontWeight: 800, whiteSpace: "nowrap" }}>
                            <Trash2 size={9} /> Remove
                          </button>
                        </div>
                      </div>
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

// ── Preview Screen Overlay ────────────────────────────────────────────────────
function PreviewScreenOverlay({ marker, onDone }: { marker: ExhibitMarker; onDone: () => void }) {
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
}

export default function VideoWorkspaceView({ hlCase, onUpdateCase, onBack }: Props) {
  // ── Video state ────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement>(null); // dedicated thumbnail extractor
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const videoUrlRef = useRef<string | null>(null);
  const [videoFileName, setVideoFileName] = useState(hlCase.studioProject?.videoFileName ?? "");
  const [duration, setDuration] = useState(hlCase.studioProject?.videoDurationSec ?? 0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [largFileWarning, setLargeFileWarning] = useState(false);
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
  const [undoStack, setUndoStack] = useState<ExhibitMarker[][]>([]);
  const [redoStack, setRedoStack] = useState<ExhibitMarker[][]>([]);
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
  // ── Video thumbnails ───────────────────────────────────────────
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [thumbsLoading, setThumbsLoading] = useState(false);
  // Thumbnails cached from a previous session (loaded alongside the video
  // blob on mount) — if present, the extraction effect uses these directly
  // instead of re-running the whole seek-by-seek capture pass. Cleared after
  // being consumed once so a later "Change video" doesn't reuse stale frames.
  const cachedThumbsRef = useRef<string[] | null>(null);
  // ── On-screen debug log (thumbnail diagnostics) ────────────────
  // Flip THUMB_DEBUG to true to bring back the green on-screen diagnostic
  // overlay (the console [thumbs] logs always run regardless).
  const THUMB_DEBUG = false;
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const debugLogRef = useRef<string[]>([]);
  const pushDebug = useCallback((line: string) => {
    if (!THUMB_DEBUG) return;
    debugLogRef.current = [...debugLogRef.current, line];
    setDebugLog([...debugLogRef.current]);
  }, []);

  // ── Preview mode ───────────────────────────────────────────────
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [previewOverlayMarkerId, setPreviewOverlayMarkerId] = useState<string | null>(null);
  const previewTriggeredRef = useRef<Set<string>>(new Set());

  // ── Jurisdiction verification ──────────────────────────────────
  const [verifying, setVerifying] = useState(false);
  const [showVerifResult, setShowVerifResult] = useState(false);
  const verification = hlCase.studioProject?.jurisdictionVerification;

  // ── Autosave ───────────────────────────────────────────────────
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── AI Exhibit Screen ───────────────────────────────────────────
  const [showExhibitGenerator, setShowExhibitGenerator] = useState(false);

  // ── Media inserts ───────────────────────────────────────────────
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const mediaBlobUrlsRef = useRef<string[]>([]); // tracked for revocation on unmount
  const [insertToast, setInsertToast] = useState<string | null>(null);
  const insertToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function setMarkers(updated: ExhibitMarker[], pushUndo = true) {
    if (pushUndo) {
      setUndoStack(s => [...s.slice(-20), markers]);
      setRedoStack([]);
    }
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
    autosaveTimer.current = setTimeout(() => {
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
      onUpdateCase({ ...hlCase, studioProject: next });
      // Also update the dedicated DB column so the server can enforce cleanup
      api.studioProject.keepAlive(hlCase.id).catch(() => {/* non-fatal */});
      setAutosaveStatus("saved");
      autosaveTimer.current = setTimeout(() => setAutosaveStatus("idle"), 2500);
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
        timelinePosition: currentTimeRef.current,
        videoFileName: snapshotRef.current.videoFileName,
        exportSettings: snapshotRef.current.exportSettings,
      });
    }, 3000);
  }

  async function handleRestore() {
    if (!recoverySnapshot) return;
    setMarkersRaw(recoverySnapshot.markers);
    setExportSettings(recoverySnapshot.exportSettings);
    setRecoverySnapshot(null);
    await clearStudioSnapshot(hlCase.id);
    // Immediately persist restored markers to server
    triggerAutosave(recoverySnapshot.markers);
  }

  async function handleDiscard() {
    setRecoverySnapshot(null);
    await clearStudioSnapshot(hlCase.id);
  }

  function undo() {
    if (!undoStack.length) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack(s => [...s, markers]);
    setUndoStack(s => s.slice(0, -1));
    setMarkersRaw(prev);
    triggerAutosave(prev);
  }

  function redo() {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(s => [...s, markers]);
    setRedoStack(s => s.slice(0, -1));
    setMarkersRaw(next);
    triggerAutosave(next);
  }

  // ── Video controls ─────────────────────────────────────────────
  // cachedThumbnails: pass the previously-saved filmstrip when restoring a
  // video from local storage, so it doesn't get regenerated. Omit (or leave
  // undefined) for any fresh user-initiated pick (initial load, Relink,
  // Change video) — this always resets the ref, so a stale filmstrip from a
  // *different* video can never leak into a new one.
  function loadVideo(file: File, cachedThumbnails?: string[]) {
    cachedThumbsRef.current = cachedThumbnails?.length ? cachedThumbnails : null;
    setVideoError(null);
    // Show import loading state immediately — before any decoding happens
    setVideoLoading(true);
    setLoadingFileName(file.name);

    // Revoke previous blob URL to free memory
    if (videoUrlRef.current) {
      URL.revokeObjectURL(videoUrlRef.current);
      videoUrlRef.current = null;
    }
    const url = URL.createObjectURL(file);
    videoUrlRef.current = url;

    // Set state so React renders the <video> element
    setVideoUrl(url);
    setVideoFileName(file.name);
    setCurrentTime(0);
    setIsPlaying(false);

    // Also wire the ref directly — React may batch the state update and the
    // video element might already be mounted from a previous load
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = url;
      videoRef.current.load();
    }

    const gb2 = 2 * 1024 * 1024 * 1024;
    setLargeFileWarning(file.size > gb2);

    // Persist the filename immediately — snapshotRef will be updated on the
    // next render so the 800 ms debounce always captures the new value.
    snapshotRef.current.videoFileName = file.name;
    triggerAutosave(markers);

    // Save the video's actual bytes locally so this case reopens without
    // re-picking the file. Not awaited — playback shouldn't wait on it, and
    // failure (e.g. storage quota on a very large file) is recoverable: the
    // user just has to re-pick the file next time, same as it works today.
    saveVideoBlob(hlCase.id, file, file.name).catch(() => {
      showInsertToast("Couldn't save this video for next time — you'll need to re-add it if you close this case (may be too large for local storage).");
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) loadVideo(file);
    // Reset so same file can be picked again
    e.target.value = "";
  }

  function showInsertToast(msg: string) {
    if (insertToastTimer.current) clearTimeout(insertToastTimer.current);
    setInsertToast(msg);
    insertToastTimer.current = setTimeout(() => setInsertToast(null), 2500);
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) { v.pause(); setIsPlaying(false); }
    else { v.play().catch(() => {}); setIsPlaying(true); }
  }

  function seek(t: number) {
    const v = videoRef.current;
    if (v) { v.currentTime = t; setCurrentTime(t); }
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
    setChunks(updated);
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
    setChunks(updated);
    triggerAutosave(markers, updated, organizedSlots, currentStep);
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
    setMarkersRaw(newMarkers);
    setChunks(newChunks);
    setOrganizedSlots(newSlots);
    triggerAutosave(newMarkers, newChunks, newSlots, currentStep);
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
  useEffect(() => {
    if (!isPreviewMode || !isPlaying) return;
    const cuts = markers.filter(m => m.type === "screen_cut").sort((a, b) => a.timestamp - b.timestamp);
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
          if (vid) { vid.play().catch(() => {}); setIsPlaying(true); }
        }, hold);
        break;
      }
    }
  }, [currentTime, isPreviewMode, isPlaying, markers]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const THUMB_N = 80; // was 20 — at max zoom (8x) that's ~10 distinct frames
  // visible at once instead of ~2.5, so zooming in stops repeating the same
  // frame across a long stretch. Still Phase 1 (fixed count, not truly
  // dynamic per pixels-per-second) but a real, bounded improvement — and
  // now that it's cached, the one-time extraction cost is paid once ever
  // per video, not once per session.

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
        saveThumbnails(hlCase.id, results); // cache for next time — fire-and-forget, non-fatal if it fails
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
      if (!cancelled) setThumbsLoading(false);
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

  // ── Expiry check on mount — clean up server data AND the locally-saved
  // video for expired projects, together, so the two can't drift apart
  // (video surviving locally after the markers/exhibit work it belongs to
  // has already been wiped server-side would just be a confusing half-state).
  useEffect(() => {
    const sp = hlCase.studioProject;
    if (sp?.expiresAt && sp.expiresAt < Date.now()) {
      // Markers already cleared in initial state; remove the expired data from server too
      onUpdateCase({ ...hlCase, studioProject: undefined });
      clearVideoBlob(hlCase.id);
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
    const newMarker: ExhibitMarker = {
      id,
      timestamp: currentTime,
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
      if (snapshot.savedAt > serverUpdatedAt && JSON.stringify(snapshot.markers) !== serverMarkersJson) {
        setRecoverySnapshot(snapshot);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Restore a locally-saved video on mount, if this case has one ────
  // This is the whole point of saving the video's bytes locally instead of
  // just its filename: reopen the case and it's just there, no file picker,
  // no "Relink" prompt. Falls through to that prompt only if no local copy
  // exists (new case, or the browser evicted storage under space pressure).
  useEffect(() => {
    loadVideoBlob(hlCase.id).then(saved => {
      if (!saved || videoUrlRef.current) return; // nothing saved, or user already picked one in the meantime
      const file = new File([saved.blob], saved.fileName, { type: saved.blob.type || "video/mp4" });
      loadVideo(file, saved.thumbnails);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Cleanup ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      if (idbSaveTimer.current) clearTimeout(idbSaveTimer.current);
      if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; }
      mediaBlobUrlsRef.current.forEach(url => { try { URL.revokeObjectURL(url); } catch {} });
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
        {/* Autosave */}
        <div style={{ fontSize: 10, color: autosaveStatus === "saving" ? "#666" : autosaveStatus === "saved" ? "#22c55e" : "#333", fontWeight: 700, flexShrink: 0, display: "flex", alignItems: "center", gap: 4, transition: "color 0.3s" }}>
          {autosaveStatus === "saved" && <Check size={10} />}
          {autosaveStatus === "saving" ? "Saving…" : autosaveStatus === "saved" ? "Saved" : ""}
        </div>
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
              Switching between phone and laptop is fine — transfer the same video to the other device and tap <strong style={{ color: "#999" }}>Relink</strong> to reconnect it. Your edits and exhibit screens are always saved here; the video never leaves your device.
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

          {/* Large file notice */}
          {largFileWarning && (
            <>
              <div style={{ background: "#1a0e00", border: "1px solid #4a2800", borderRadius: 10, padding: "10px 12px", marginBottom: 14, display: "flex", gap: 9, alignItems: "flex-start" }}>
                <AlertCircle size={13} color="#cc6600" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 12, color: "#a05000", lineHeight: 1.6, flex: 1 }}>
                  <strong style={{ color: "#cc6600" }}>Large file detected.</strong> If playback is slow, trim unnecessary portions before loading.
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
                {recoverySnapshot.markers.length} marker{recoverySnapshot.markers.length !== 1 ? "s" : ""} from {relativeTime(recoverySnapshot.savedAt)} — restore to pick up where you left off.
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
            preload="metadata"
            style={{ width: "100%", borderRadius: 12, background: "#000", display: "block", maxHeight: 260, minHeight: 190, position: "relative", zIndex: 1 }}
            onTimeUpdate={e => {
              setCurrentTime(e.currentTarget.currentTime);
              currentTimeRef.current = e.currentTarget.currentTime;
            }}
            onDurationChange={e => {
              const d = e.currentTarget.duration;
              setDuration(d);
              snapshotRef.current.videoDurationSec = d;
              triggerAutosave(markers);
            }}
            onLoadedMetadata={() => setVideoLoading(false)}
            onCanPlay={() => setVideoLoading(false)}
            onLoadedData={() => setVideoLoading(false)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => { setIsPlaying(false); if (isPreviewMode) { setIsPreviewMode(false); } }}
            onError={e => {
              const v = e.currentTarget;
              const code = v.error?.code;
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
            <button onClick={() => fileInputRef.current?.click()} style={{ background: ORANGE, border: "none", borderRadius: 7, padding: "5px 12px", fontSize: 11, fontWeight: 800, color: "#000", cursor: "pointer", flexShrink: 0 }}>
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
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
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


        {/* ── Relink banner ─────────────────────────────────────────── */}
        {!videoUrl && videoFileName && (
          <div style={{ background: markers.length > 0 ? "#081020" : "#1a0e00", border: `1px solid ${markers.length > 0 ? "#1a3060" : "#4a2800"}`, borderRadius: 10, padding: "12px 14px", marginBottom: 12, display: "flex", alignItems: "flex-start", gap: 10, fontSize: 12, color: markers.length > 0 ? "#4a80c0" : "#cc6600" }}>
            <AlertCircle size={14} color={markers.length > 0 ? "#4a80c0" : "#cc6600"} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1, lineHeight: 1.55 }}>
              {markers.length > 0 ? (
                <>
                  <strong style={{ color: "#7ab0e0" }}>Your {markers.length} saved edit{markers.length !== 1 ? "s" : ""} are here.</strong>{" "}
                  Load <em style={{ color: "#aaa" }}>{videoFileName}</em> from this device to continue.
                  <div style={{ fontSize: 11, color: "#2d5080", marginTop: 5 }}>
                    Switching devices? The file can come from your phone, laptop, or any device — as long as it's the same recording. AirDrop or transfer it here, then tap Relink.
                  </div>
                </>
              ) : (
                <>Previously linked: <strong>{videoFileName}</strong> — tap Relink to continue.</>
              )}
            </div>
            <button onClick={() => fileInputRef.current?.click()}
              style={{ background: markers.length > 0 ? "#3b82f6" : ORANGE, border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 800, color: "#fff", cursor: "pointer", flexShrink: 0 }}>
              Relink
            </button>
          </div>
        )}

        {/* ── Controls ──────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
          <button onClick={togglePlay} disabled={!videoUrl}
            style={{ width: 42, height: 42, borderRadius: 21, background: videoUrl ? ORANGE : "#1a1a1a", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: videoUrl ? "pointer" : "not-allowed", flexShrink: 0 }}>
            {isPlaying ? <Pause size={16} color="#000" /> : <Play size={16} color={videoUrl ? "#000" : "#555"} />}
          </button>
          <div style={{ fontSize: 14, fontWeight: 800, color: videoUrl ? "#fff" : "#444", letterSpacing: 0.5, minWidth: 80, flexShrink: 0 }}>
            {formatTime(currentTime)}
            <span style={{ color: "#444", fontWeight: 400 }}> / {duration ? formatTime(duration) : "--:--"}</span>
          </div>
          <div style={{ flex: 1 }} />

          {/* Preview mode toggle */}
          {videoUrl && markers.some(m => m.type === "screen_cut") && (
            <button
              onClick={() => {
                if (isPreviewMode) {
                  setIsPreviewMode(false);
                } else {
                  previewTriggeredRef.current = new Set();
                  seek(0);
                  setIsPreviewMode(true);
                  setTimeout(() => {
                    const v = videoRef.current;
                    if (v) { v.play().catch(() => {}); setIsPlaying(true); }
                  }, 150);
                }
              }}
              title={isPreviewMode ? "Exit preview" : "Preview with screen cuts"}
              style={{ background: isPreviewMode ? ORANGE : "#111", border: `1px solid ${isPreviewMode ? ORANGE : "#222"}`, borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 700, color: isPreviewMode ? "#000" : "#888", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
              {isPreviewMode ? <StopCircle size={12} /> : <PlayCircle size={12} />}
              {isPreviewMode ? "Stop Preview" : "Preview"}
            </button>
          )}

          {/* Zoom */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => setZoom(z => Math.max(1, z - 1))} disabled={zoom <= 1}
              style={{ background: "none", border: "none", cursor: zoom > 1 ? "pointer" : "not-allowed", opacity: zoom > 1 ? 1 : 0.4 }}>
              <ZoomOut size={14} color="#666" />
            </button>
            <span style={{ fontSize: 10, color: "#555", fontWeight: 700, minWidth: 24, textAlign: "center" }}>{zoom}×</span>
            <button onClick={() => setZoom(z => Math.min(8, z + 1))} disabled={zoom >= 8}
              style={{ background: "none", border: "none", cursor: zoom < 8 ? "pointer" : "not-allowed", opacity: zoom < 8 ? 1 : 0.4 }}>
              <ZoomIn size={14} color="#666" />
            </button>
          </div>

          {/* Change video */}
          {videoUrl && (
            <button onClick={() => fileInputRef.current?.click()} title="Change video"
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
          onSplitChunk={splitChunk}
          onRemoveChunk={removeChunk}
          thumbnails={thumbnails}
          thumbsLoading={thumbsLoading}
          step={currentStep}
          zoom={zoom}
        />


        {/* ── Step Navigation ───────────────────────────────────────── */}
        {videoUrl && (
          <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
            {(["Chunk", "Label", "Organize", "Exhibit"] as const).map((label, i) => {
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

        {/* ── Step 1: Chunk ─────────────────────────────────────────── */}
        {currentStep === 1 && videoUrl && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: "#555", marginBottom: 12, lineHeight: 1.6 }}>
              {chunks.length === 0
                ? "Watch the video and chunk it into sections or moments — tap the button each time you want to mark the end of a section."
                : `${chunks.length} section${chunks.length !== 1 ? "s" : ""} chunked.${chunks.length < 3 ? " Keep going." : " Ready to label when you're done."}`}
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
              <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {chunks.map(c => (
                  <div key={c.id} style={{ background: "#111", border: "1px solid #1e1e1e",
                    borderRadius: 8, padding: "4px 9px", fontSize: 11, color: "#555", fontWeight: 700 }}>
                    {formatTime(c.start)}–{formatTime(c.end)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Label ─────────────────────────────────────────── */}
        {currentStep === 2 && videoUrl && (
          <div style={{ marginBottom: 20 }}>
            {chunks.length === 0 ? (
              <div style={{ background: "#0d0d0d", border: "1px dashed #222", borderRadius: 12,
                padding: "20px 16px", textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 10 }}>No sections chunked yet.</div>
                <button onClick={() => setCurrentStep(1)}
                  style={{ background: ORANGE, border: "none", borderRadius: 10, padding: "10px 20px",
                    fontSize: 12, fontWeight: 800, color: "#000", cursor: "pointer" }}>
                  Go chunk sections first
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {chunks.map((c, i) => (
                  <div key={c.id} style={{ background: "#0d0d0d", border: "1px solid #1e1e1e",
                    borderRadius: 12, padding: "12px 14px" }}>
                    <div style={{ fontSize: 10, color: "#3a3a3a", fontWeight: 700, marginBottom: 7 }}>
                      MOMENT {i + 1} · {formatTime(c.start)}–{formatTime(c.end)}
                    </div>
                    <input
                      type="text"
                      value={c.label}
                      placeholder="What happened here?"
                      onChange={e => {
                        const updated = chunks.map(x => x.id === c.id ? { ...x, label: e.target.value } : x);
                        setChunks(updated);
                        triggerAutosave(markers, updated, organizedSlots, currentStep);
                      }}
                      style={{ width: "100%", background: "#111", border: "1px solid #252525",
                        borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#ddd",
                        fontWeight: 600, outline: "none", boxSizing: "border-box", marginBottom: 8 }}
                    />
                    <div style={{ display: "flex", gap: 5 }}>
                      {(["consistency", "contradiction", "escalation", "no_cause"] as const).map(tag => {
                        const tagColors: Record<string, string> = {
                          consistency: "#22c55e", contradiction: "#ef4444",
                          escalation: "#f59e0b", no_cause: "#8b5cf6",
                        };
                        const tagLabels: Record<string, string> = {
                          consistency: "Consistent", contradiction: "Contradiction",
                          escalation: "Escalation", no_cause: "No Cause Given",
                        };
                        const active = c.tag === tag;
                        return (
                          <button key={tag} onClick={() => {
                            const updated = chunks.map(x => x.id === c.id ? { ...x, tag: active ? undefined : tag } : x);
                            setChunks(updated);
                            triggerAutosave(markers, updated, organizedSlots, currentStep);
                          }}
                            style={{ flex: 1, background: active ? tagColors[tag] + "22" : "#111",
                              border: `1px solid ${active ? tagColors[tag] + "77" : "#1e1e1e"}`,
                              borderRadius: 7, padding: "5px 3px", fontSize: 9, fontWeight: 800,
                              color: active ? tagColors[tag] : "#3a3a3a", cursor: "pointer",
                              textAlign: "center", lineHeight: 1.3 }}>
                            {tagLabels[tag]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Organize ──────────────────────────────────────── */}
        {currentStep === 3 && videoUrl && (
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
                <div style={{ fontSize: 12, color: "#555", marginBottom: 10, lineHeight: 1.6 }}>
                  Drag moments from the track above into story order.{" "}
                  {chunks.some(c => c.tag === "consistency") && (
                    <span style={{ color: "#3a6a3a" }}>💡 You have a consistent moment — consider opening with it.</span>
                  )}
                </div>
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

        {/* ── Step 4: Exhibit, Media, Mic ───────────────────────────── */}
        {currentStep === 4 && (
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
          <div style={{ width: "100%", maxWidth: 380, background: "#111", borderRadius: 12, padding: "14px 16px", minHeight: 80, fontSize: 14, color: "#ccc", lineHeight: 1.6, marginBottom: 24, border: "1px solid #1e1e1e" }}>
            {dictationText || <span style={{ color: "#444", fontStyle: "italic" }}>Listening…</span>}
          </div>
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
            setPreviewOverlayMarkerId(null);
            const v = videoRef.current;
            if (v) { v.play().catch(() => {}); setIsPlaying(true); }
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
        />
      )}

      {/* ── Media insert toast — "Clip added to timeline" etc. ── */}
      {insertToast && (
        <div style={{
          position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)",
          background: "#111", border: "1px solid #2a2a2a", borderRadius: 24,
          padding: "10px 20px", fontSize: 13, fontWeight: 700, color: "#ddd",
          zIndex: 600, whiteSpace: "nowrap", boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
          pointerEvents: "none",
          animation: "hlConfirmFlash 0.25s ease-out",
        }}>
          {insertToast}
        </div>
      )}

      {/* ── Thumbnail diagnostic overlay ── */}
      {debugLog.length > 0 && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.88)", maxHeight: 220, overflowY: "auto",
          padding: "8px 10px", boxSizing: "border-box",
          fontFamily: "monospace", fontSize: 10, color: "#0f0", lineHeight: 1.5,
          borderTop: "1px solid #333",
        }}>
          <div style={{ fontWeight: 700, color: "#ff0", marginBottom: 4, fontSize: 10 }}>
            THUMB DIAGNOSTICS ({debugLog.length} lines)
          </div>
          {debugLog.map((line, i) => (
            <div key={i} style={{ color: line.startsWith("[4]") || line.startsWith("[ERR]") ? "#f55" : "#0f0" }}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

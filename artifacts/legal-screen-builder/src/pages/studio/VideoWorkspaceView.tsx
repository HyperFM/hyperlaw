import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft, Play, Pause, Plus, Mic, MicOff, Undo2, Redo2,
  Check, Film, Upload, X, AlertCircle, CheckCircle2, XCircle,
  Loader2, Eye, Shield, ZoomIn, ZoomOut, Info, Clapperboard, Download,
  Scissors, Monitor, PlayCircle, StopCircle, RotateCcw, ImageIcon, Wand2,
} from "lucide-react";
import type { HLCase, ExhibitMarker, StudioProject, JurisdictionVerification, ScreenInsert, MediaInsert, ExhibitScreenData } from "../../types";
import { aiApi } from "../../lib/aiApi";
import { ExhibitGeneratorPanel } from "./exhibits";
import ExhibitVideoExportModal from "./ExhibitVideoExportModal";
import { saveStudioSnapshot, loadStudioSnapshot, clearStudioSnapshot } from "./studioIndexedDB";
import type { ExportSettings, StudioSnapshot } from "./studioIndexedDB";

const ORANGE = "#d9711f";

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
function VideoTimeline({ duration, currentTime, markers, zoom, onSeek, activeMarkerId, onSelectMarker }: {
  duration: number; currentTime: number;
  markers: ExhibitMarker[]; zoom: number;
  onSeek: (t: number) => void;
  activeMarkerId: string | null;
  onSelectMarker: (id: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  function seekFromEvent(e: React.MouseEvent | MouseEvent) {
    const el = trackRef.current;
    if (!el || !duration) return;
    const rect = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(pct * duration);
  }

  useEffect(() => {
    function onMove(e: MouseEvent) { if (isDragging.current) seekFromEvent(e); }
    function onUp() { isDragging.current = false; }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [duration]); // eslint-disable-line react-hooks/exhaustive-deps

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div style={{ padding: "8px 0 20px", position: "relative" }}>
      <div ref={trackRef}
        style={{ height: 44, background: "#111", borderRadius: 8, position: "relative", cursor: "pointer", border: "1px solid #1a1a1a", overflow: "visible" }}
        onMouseDown={e => { isDragging.current = true; seekFromEvent(e); }}
        onClick={e => { if (!isDragging.current) seekFromEvent(e); }}
        onTouchStart={e => {
          const touch = e.touches[0];
          const el = trackRef.current;
          if (!el || !duration) return;
          const rect = el.getBoundingClientRect();
          const pct = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
          onSeek(pct * duration);
        }}
        onTouchMove={e => {
          e.preventDefault();
          const touch = e.touches[0];
          const el = trackRef.current;
          if (!el || !duration) return;
          const rect = el.getBoundingClientRect();
          const pct = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
          onSeek(pct * duration);
        }}>

        {/* Filled portion */}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${progress}%`, background: "rgba(217,113,31,0.15)", borderRadius: "8px 0 0 8px", pointerEvents: "none" }} />

        {/* Playhead */}
        <div style={{ position: "absolute", left: `${progress}%`, top: 0, bottom: 0, width: 2, background: ORANGE, transform: "translateX(-50%)", pointerEvents: "none", zIndex: 4 }}>
          <div style={{ width: 10, height: 10, background: ORANGE, borderRadius: "50%", position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />
        </div>

        {/* Markers */}
        {duration > 0 && markers.map(m => {
          const pct = (m.timestamp / duration) * 100;
          const isActive = m.id === activeMarkerId;
          const isCut = m.type === "screen_cut";
          const isMedia = m.type === "media_insert";
          const isAIScreen = m.type === "exhibit_screen";
          const markerColor = isCut ? "#60a5fa" : isMedia ? "#a78bfa" : isAIScreen ? "#8b5cf6" : ORANGE;
          return (
            <div key={m.id} onClick={e => { e.stopPropagation(); onSelectMarker(m.id); }}
              style={{ position: "absolute", left: `${pct}%`, top: 0, bottom: 0, transform: "translateX(-50%)", zIndex: 3, display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer" }}>
              {/* Marker line */}
              <div style={{ width: (isCut || isMedia) ? 2 : 3, height: "100%", background: isActive ? "#fff" : markerColor + (!isCut && !isMedia ? "cc" : ""), borderRadius: 2 }} />
              {/* Screen-cut icon */}
              {isCut && (
                <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", width: 18, height: 18, background: isActive ? "#fff" : "#60a5fa", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Monitor size={10} color="#000" />
                </div>
              )}
              {/* Media-insert icon */}
              {isMedia && (
                <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", width: 18, height: 18, background: isActive ? "#fff" : "#a78bfa", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {m.mediaInsert?.kind === "clip" ? <Film size={10} color="#000" /> : <ImageIcon size={10} color="#000" />}
                </div>
              )}
              <div style={{ position: "absolute", bottom: -18, fontSize: 9, color: isActive ? "#fff" : markerColor, fontWeight: 700, whiteSpace: "nowrap", maxWidth: 60, overflow: "hidden", textOverflow: "ellipsis" }}>
                {m.label || (isCut ? "Screen" : isMedia ? (m.mediaInsert?.kind === "clip" ? "Clip" : "Photo") : `EX-${markers.indexOf(m) + 1}`)}
              </div>
            </div>
          );
        })}

        {/* Time labels */}
        {duration > 0 && [0, 0.25, 0.5, 0.75, 1].map(t => (
          <div key={t} style={{ position: "absolute", left: `${t * 100}%`, top: 2, fontSize: 8, color: "#333", transform: t === 1 ? "translateX(-100%)" : t === 0 ? "none" : "translateX(-50%)", userSelect: "none", pointerEvents: "none" }}>
            {formatTime(t * duration)}
          </div>
        ))}
      </div>
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

  // ── Markers ────────────────────────────────────────────────────
  const [markers, setMarkersRaw] = useState<ExhibitMarker[]>(() => hlCase.studioProject?.markers ?? []);
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
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    resKey: "1080", fps: 30, format: "mp4", includeAudio: true,
  });

  // ── IndexedDB recovery ─────────────────────────────────────────
  const [recoverySnapshot, setRecoverySnapshot] = useState<StudioSnapshot | null>(null);
  const idbSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTimeRef = useRef(0);
  // snapshotRef holds latest values so the debounced IDB write always sees fresh data
  const snapshotRef = useRef<{ markers: ExhibitMarker[]; videoFileName: string; exportSettings: ExportSettings }>({
    markers: hlCase.studioProject?.markers ?? [],
    videoFileName: hlCase.studioProject?.videoFileName ?? "",
    exportSettings: { resKey: "1080", fps: 30, format: "mp4", includeAudio: true },
  });
  // Keep snapshotRef current on every render (synchronous, safe)
  snapshotRef.current.markers = markers;
  snapshotRef.current.videoFileName = videoFileName;
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

  function triggerAutosave(updatedMarkers: ExhibitMarker[]) {
    setAutosaveStatus("saving");
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      const project = getOrCreateProject();
      const next: StudioProject = { ...project, videoFileName, videoDurationSec: duration, markers: updatedMarkers, updatedAt: Date.now() };
      onUpdateCase({ ...hlCase, studioProject: next });
      setAutosaveStatus("saved");
      autosaveTimer.current = setTimeout(() => setAutosaveStatus("idle"), 2500);
    }, 800);
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
  function loadVideo(file: File) {
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
      </div>

      {/* ── Jurisdiction strip ───────────────────────────────────── */}
      <div style={{ flexShrink: 0, background: "#0d0d0d", borderBottom: "1px solid #131313", padding: "8px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
          {verification ? (
            <>
              {verification.verdict === "permitted"    && <CheckCircle2 size={13} color="#22c55e" />}
              {verification.verdict === "limited"      && <AlertCircle  size={13} color="#f59e0b" />}
              {verification.verdict === "not_accepted" && <XCircle      size={13} color="#ef4444" />}
            </>
          ) : (
            <Shield size={13} color="#444" />
          )}
          <span style={{ fontSize: 12, color: "#555", fontWeight: 700 }}>Jurisdiction</span>
          <span style={{ fontSize: 12, color: court ? "#888" : "#3a3a3a", fontStyle: court ? "normal" : "italic" }}>
            {court ? `${court.state}${court.name ? ` · ${court.name}` : ""}` : "not set — add court in Case Profile"}
          </span>
        </div>
        {verification ? (
          <button onClick={() => setShowVerifResult(true)}
            style={{ background: "none", border: "1px solid #222", borderRadius: 7, padding: "4px 10px", fontSize: 11, color: verification.verdict === "permitted" ? "#22c55e" : verification.verdict === "limited" ? "#f59e0b" : "#ef4444", cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
            <Eye size={11} /> View
          </button>
        ) : (
          <JurisdictionVerifyButton onVerify={handleVerify} disabled={verifying || !court} />
        )}
      </div>

      {/* ── Evidence preservation reminder ───────────────────────── */}
      <div style={{ flexShrink: 0, background: "#0a0800", borderBottom: "1px solid #1a1500", padding: "6px 16px", fontSize: 11, color: "#6b5a00", display: "flex", alignItems: "center", gap: 6 }}>
        <AlertCircle size={11} color="#6b5a00" />
        Always preserve and retain the complete, unedited original recording for evidentiary purposes.
      </div>

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

        {/* ── Video area ────────────────────────────────────────────── */}
        {videoUrl && (
          <div style={{ marginBottom: 12, position: "relative" }}>
            <video
              ref={el => {
                (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
                // When the element first mounts, ensure src is set even if React
                // batched the state update and the element didn't see the prop yet
                if (el && videoUrlRef.current && el.src !== videoUrlRef.current) {
                  el.src = videoUrlRef.current;
                  el.load();
                }
              }}
              src={videoUrl ?? undefined}
              playsInline
              preload="metadata"
              style={{ width: "100%", borderRadius: 12, background: "#000", display: "block", maxHeight: 260 }}
              onTimeUpdate={e => { setCurrentTime(e.currentTarget.currentTime); currentTimeRef.current = e.currentTarget.currentTime; }}
              onDurationChange={e => setDuration(e.currentTarget.duration)}
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
                setIsPlaying(false);
              }}
            />
            {/* Preview mode badge */}
            {isPreviewMode && (
              <div style={{ position: "absolute", top: 10, left: 10, background: "rgba(217,113,31,0.9)", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 800, color: "#000" }}>
                ● PREVIEW
              </div>
            )}
          </div>
        )}

        {/* Video error banner */}
        {videoError && (
          <div style={{ background: "#1a0000", border: "1px solid #5a1a1a", borderRadius: 10, padding: "10px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#ef4444" }}>
            <AlertCircle size={13} color="#ef4444" />
            <div style={{ flex: 1 }}>{videoError} — try a different file or format.</div>
            <label htmlFor="studio-video-input" style={{ background: ORANGE, border: "none", borderRadius: 7, padding: "5px 12px", fontSize: 11, fontWeight: 800, color: "#000", cursor: "pointer", flexShrink: 0 }}>
              Try another
            </label>
          </div>
        )}

        {/* ── Importing overlay — shown immediately after file pick, cleared on canplay ── */}
        {videoLoading && (
          <div style={{
            width: "100%", background: "#0d0d0d", border: "1px solid #1e1e1e",
            borderRadius: 16, padding: "32px 24px", marginBottom: 16,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
            boxSizing: "border-box",
          }}>
            {/* Animated clapperboard icon */}
            <div style={{ position: "relative", width: 52, height: 52 }}>
              <Clapperboard size={52} color={ORANGE} style={{ opacity: 0.9 }} />
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#ddd", marginBottom: 4 }}>
                Importing video…
              </div>
              <div style={{ fontSize: 11, color: "#555", maxWidth: 240, lineHeight: 1.5, wordBreak: "break-all" }}>
                {loadingFileName}
              </div>
            </div>
            {/* Animated progress bar */}
            <div style={{ width: "100%", maxWidth: 260, height: 3, background: "#1e1e1e", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%", background: ORANGE, borderRadius: 2,
                animation: "hlImportScan 1.4s ease-in-out infinite",
              }} />
            </div>
            <div style={{ fontSize: 11, color: "#444" }}>
              Video stays on your device — nothing is uploaded
            </div>
          </div>
        )}

        {!videoError && !videoUrl && !videoLoading && (
          /* ── Upload drop zone — label-based for reliable mobile trigger ── */
          <label htmlFor="studio-video-input"
            style={{ width: "100%", background: "#0d0d0d", border: "2px dashed #1e1e1e", borderRadius: 16, padding: "44px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, cursor: "pointer", marginBottom: 16, boxSizing: "border-box" }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE + "55")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "#1e1e1e")}>
            <Film size={44} color="#333" />
            <div style={{ fontSize: 15, fontWeight: 700, color: "#555" }}>Tap to Load Video</div>
            <div style={{ fontSize: 12, color: "#444", textAlign: "center", maxWidth: 280, lineHeight: 1.55 }}>
              Any length supported — 30 minutes, 1 hour, or longer.
              <br />Videos stay on your device; nothing is uploaded to the server.
            </div>
          </label>
        )}

        {/* Hidden file input — accepts any video, no size limit enforced */}
        <input
          id="studio-video-input"
          ref={fileInputRef}
          type="file"
          accept="video/*"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        {/* Large file warning (non-blocking) */}
        {largFileWarning && (
          <div style={{ background: "#1a0e00", border: "1px solid #4a2800", borderRadius: 10, padding: "10px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#cc6600" }}>
            <AlertCircle size={13} color="#cc6600" />
            <div style={{ flex: 1 }}>Large file detected. If playback is slow, trim unnecessary portions of the video before loading.</div>
            <button onClick={() => setLargeFileWarning(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
              <X size={14} color="#cc6600" />
            </button>
          </div>
        )}

        {/* ── Relink banner ─────────────────────────────────────────── */}
        {!videoUrl && videoFileName && (
          <div style={{ background: "#1a0e00", border: "1px solid #4a2800", borderRadius: 10, padding: "10px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#cc6600" }}>
            <AlertCircle size={13} color="#cc6600" />
            <div style={{ flex: 1 }}>
              Previously linked: <strong>{videoFileName}</strong> — tap Relink to continue editing.
            </div>
            <label htmlFor="studio-video-input"
              style={{ background: ORANGE, border: "none", borderRadius: 7, padding: "5px 12px", fontSize: 11, fontWeight: 800, color: "#000", cursor: "pointer" }}>
              Relink
            </label>
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
            <label htmlFor="studio-video-input" title="Change video"
              style={{ background: "none", border: "1px solid #222", borderRadius: 7, padding: "4px 10px", fontSize: 11, color: "#555", cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
              <Upload size={11} /> Change
            </label>
          )}
        </div>

        {/* ── Timeline ──────────────────────────────────────────────── */}
        <VideoTimeline
          duration={duration}
          currentTime={currentTime}
          markers={sortedMarkers}
          zoom={zoom}
          onSeek={seek}
          activeMarkerId={activeMarkerId}
          onSelectMarker={id => { setActiveMarkerId(id); }}
        />

        {/* ── Legend ────────────────────────────────────────────────── */}
        {(sortedMarkers.some(m => m.type === "screen_cut") || sortedMarkers.some(m => m.type === "media_insert") || sortedMarkers.some(m => m.type === "exhibit_screen")) && (
          <div style={{ display: "flex", gap: 14, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#555" }}>
              <div style={{ width: 10, height: 3, background: ORANGE, borderRadius: 2 }} />
              Analysis
            </div>
            {sortedMarkers.some(m => m.type === "screen_cut") && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#555" }}>
                <div style={{ width: 10, height: 3, background: "#60a5fa", borderRadius: 2 }} />
                Screen cut
              </div>
            )}
            {sortedMarkers.some(m => m.type === "media_insert") && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#555" }}>
                <div style={{ width: 10, height: 3, background: "#a78bfa", borderRadius: 2 }} />
                Photo / Clip
              </div>
            )}
            {sortedMarkers.some(m => m.type === "exhibit_screen") && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#555" }}>
                <div style={{ width: 10, height: 3, background: "#8b5cf6", borderRadius: 2 }} />
                AI Screen
              </div>
            )}
          </div>
        )}

        {/* ── Action buttons ────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          {/* Analysis exhibit */}
          <button onClick={insertMarker} disabled={!videoUrl}
            style={{ flex: 1, background: videoUrl ? ORANGE : "#1a1a1a", border: "none", borderRadius: 12, padding: "14px 12px", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: videoUrl ? "pointer" : "not-allowed", fontWeight: 800, fontSize: 12, color: videoUrl ? "#000" : "#444" }}>
            <Plus size={15} /> Exhibit
          </button>

          {/* Cut + Build Screen */}
          <button
            onClick={() => {
              if (!videoUrl) return;
              if (videoRef.current && isPlaying) { videoRef.current.pause(); setIsPlaying(false); }
              setShowCutBuilder(true);
            }}
            disabled={!videoUrl}
            style={{ flex: 1, background: videoUrl ? "#111" : "#111", border: `1px solid ${videoUrl ? "#60a5fa55" : "#222"}`, borderRadius: 12, padding: "14px 12px", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: videoUrl ? "pointer" : "not-allowed", fontWeight: 800, fontSize: 12, color: videoUrl ? "#60a5fa" : "#444" }}
            onMouseEnter={e => { if (videoUrl) e.currentTarget.style.borderColor = "#60a5fa"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = videoUrl ? "#60a5fa55" : "#222"; }}>
            <Scissors size={14} /> Cut + Screen
          </button>

          {/* AI Exhibit Screen */}
          <button
            onClick={() => {
              if (!videoUrl) return;
              if (videoRef.current && isPlaying) { videoRef.current.pause(); setIsPlaying(false); }
              setShowExhibitGenerator(true);
            }}
            disabled={!videoUrl}
            style={{ flex: 1, background: "#111", border: `1px solid ${videoUrl ? "#8b5cf655" : "#222"}`, borderRadius: 12, padding: "14px 12px", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: videoUrl ? "pointer" : "not-allowed", fontWeight: 800, fontSize: 12, color: videoUrl ? "#8b5cf6" : "#444" }}
            onMouseEnter={e => { if (videoUrl) e.currentTarget.style.borderColor = "#8b5cf6"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = videoUrl ? "#8b5cf655" : "#222"; }}>
            <Wand2 size={14} /> AI Screen
          </button>

          {/* Media insert — photo or video clip */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => { if (!videoUrl) return; setShowMediaPicker(v => !v); }}
              disabled={!videoUrl}
              title="Insert photo or clip"
              style={{ width: 50, height: 50, borderRadius: 12, background: showMediaPicker ? "#2a1a4a" : "#111", border: `1px solid ${showMediaPicker ? "#a78bfa" : videoUrl ? "#a78bfa55" : "#222"}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: videoUrl ? "pointer" : "not-allowed" }}>
              <ImageIcon size={18} color={videoUrl ? "#a78bfa" : "#444"} />
            </button>
            {showMediaPicker && (
              <>
                {/* Transparent backdrop to close picker on outside click */}
                <div style={{ position: "fixed", inset: 0, zIndex: 49 }} onClick={() => setShowMediaPicker(false)} />
                <div style={{ position: "absolute", bottom: "calc(100% + 6px)", right: 0, background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 10, overflow: "hidden", zIndex: 50, minWidth: 148 }}>
                  <label htmlFor="studio-media-photo-input"
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#ccc" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#252525")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <ImageIcon size={13} color="#a78bfa" /> Photo
                  </label>
                  <div style={{ height: 1, background: "#222" }} />
                  <label htmlFor="studio-media-clip-input"
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#ccc" }}
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

          {/* Dictation mic */}
          <button
            onClick={() => {
              if (activeMarkerId) {
                const m = markers.find(x => x.id === activeMarkerId);
                if (m && m.type !== "screen_cut" && !isDictating) startDictation(activeMarkerId);
              } else if (videoUrl) {
                insertMarker();
              }
            }}
            disabled={!videoUrl}
            style={{ width: 50, height: 50, borderRadius: 12, background: isDictating ? "#1a0000" : "#111", border: `1px solid ${isDictating ? "#ef4444" : "#2a2a2a"}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: videoUrl ? "pointer" : "not-allowed" }}>
            {isDictating ? <MicOff size={18} color="#ef4444" /> : <Mic size={18} color="#888" />}
          </button>
        </div>

        {/* ── Export Exhibit Video ──────────────────────────────────── */}
        {sortedMarkers.length > 0 && (
          <button onClick={() => setShowExport(true)}
            style={{ width: "100%", background: "#111", border: `1px solid ${ORANGE}44`, borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", marginBottom: 20 }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE)}
            onMouseLeave={e => (e.currentTarget.style.borderColor = ORANGE + "44")}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "#1a1200", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Clapperboard size={18} color={ORANGE} />
            </div>
            <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>Export Exhibit Video</div>
              <div style={{ fontSize: 11, color: "#666", marginTop: 1 }}>
                {videoUrl
                  ? [
                      `${sortedMarkers.filter(m => !m.type || m.type === "analysis").length} exhibit${sortedMarkers.filter(m => !m.type || m.type === "analysis").length !== 1 ? "s" : ""}`,
                      sortedMarkers.some(m => m.type === "screen_cut") && `${sortedMarkers.filter(m => m.type === "screen_cut").length} screen cut${sortedMarkers.filter(m => m.type === "screen_cut").length !== 1 ? "s" : ""}`,
                      sortedMarkers.some(m => m.type === "media_insert") && `${sortedMarkers.filter(m => m.type === "media_insert").length} media insert${sortedMarkers.filter(m => m.type === "media_insert").length !== 1 ? "s" : ""}`,
                      sortedMarkers.some(m => m.type === "exhibit_screen") && `${sortedMarkers.filter(m => m.type === "exhibit_screen").length} AI screen${sortedMarkers.filter(m => m.type === "exhibit_screen").length !== 1 ? "s" : ""}`,
                    ].filter(Boolean).join(" + ")
                  : "Relink your video to export"}
              </div>
            </div>
            <Download size={16} color={ORANGE} style={{ flexShrink: 0 }} />
          </button>
        )}

        {/* ── Markers list ──────────────────────────────────────────── */}
        {sortedMarkers.length > 0 && (
          <>
            <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>TIMELINE ITEMS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sortedMarkers.map((m, i) => {
                const isCut = m.type === "screen_cut";
                const isMedia = m.type === "media_insert";
                const isAIScreen = m.type === "exhibit_screen";
                const isAnalysis = !isCut && !isMedia && !isAIScreen;
                const isActive = m.id === activeMarkerId;
                const accentColor = isCut ? "#60a5fa" : isMedia ? "#a78bfa" : isAIScreen ? "#8b5cf6" : ORANGE;
                return (
                  <div key={m.id}
                    style={{ background: isActive ? "#1a1a1a" : "#111", border: `1px solid ${isActive ? accentColor + "44" : "#1e1e1e"}`, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                    onClick={() => { setActiveMarkerId(m.id); seek(m.timestamp); }}>

                    {/* Marker icon — photo shows a small thumbnail */}
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: "#0d0d0d", border: `1px solid ${accentColor}33`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                      {isCut && <Monitor size={14} color="#60a5fa" />}
                      {isMedia && m.mediaInsert?.kind === "photo" && (
                        m.mediaInsert.blobUrl
                          ? <img src={m.mediaInsert.blobUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          : <ImageIcon size={14} color="#a78bfa" />
                      )}
                      {isMedia && m.mediaInsert?.kind === "clip" && <Film size={14} color="#a78bfa" />}
                      {isAIScreen && <Wand2 size={14} color="#8b5cf6" />}
                      {isAnalysis && <span style={{ fontSize: 11, fontWeight: 900, color: ORANGE }}>{i + 1}</span>}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#ddd", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</div>
                        {isCut && <div style={{ fontSize: 9, fontWeight: 700, color: "#60a5fa", background: "#60a5fa15", borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>SCREEN</div>}
                        {isMedia && m.mediaInsert && <div style={{ fontSize: 9, fontWeight: 700, color: "#a78bfa", background: "#a78bfa15", borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>{m.mediaInsert.kind.toUpperCase()}</div>}
                        {isAIScreen && <div style={{ fontSize: 9, fontWeight: 700, color: "#8b5cf6", background: "#8b5cf615", borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>AI</div>}
                      </div>
                      <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                        {formatTime(m.timestamp)}
                        {isCut && m.screenInsert && ` · "${m.screenInsert.title}"`}
                        {isMedia && m.mediaInsert && ` · ${m.mediaInsert.fileName.length > 28 ? m.mediaInsert.fileName.slice(0, 28) + "…" : m.mediaInsert.fileName}`}
                        {isAnalysis && m.dictation && ` · ${m.dictation.slice(0, 40)}${m.dictation.length > 40 ? "…" : ""}`}
                        {isMedia && m.mediaInsert?.kind === "photo" && m.holdSec && ` · holds ${m.holdSec}s`}
                        {isAIScreen && m.exhibitScreen && ` · ${m.exhibitScreen.selectedType.replace(/_/g, " ")}`}
                        {isAIScreen && m.holdSec && ` · ${m.holdSec}s`}
                      </div>
                    </div>

                    {/* Action */}
                    <div style={{ flexShrink: 0 }}>
                      {isAnalysis && m.status === "extracting" && <Loader2 size={15} color="#555" style={{ animation: "spin 1s linear infinite" }} />}
                      {isAnalysis && m.status === "ready" && (
                        <button onClick={e => { e.stopPropagation(); setViewingDraftId(m.id); }}
                          style={{ background: `${ORANGE}22`, border: `1px solid ${ORANGE}44`, borderRadius: 7, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: ORANGE, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                          <Eye size={11} /> View
                        </button>
                      )}
                      {isAnalysis && m.status === "error" && (
                        <button onClick={e => {
                          e.stopPropagation();
                          setMarkersRaw(prev => prev.map(x => x.id === m.id ? { ...x, status: "extracting" as const } : x));
                          extractAndDraft({ ...m, status: "extracting" as const });
                        }}
                          style={{ background: "none", border: "1px solid #444", borderRadius: 7, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: "#888", cursor: "pointer" }}>
                          Retry
                        </button>
                      )}
                      {isAnalysis && m.status === "draft" && m.dictation && (
                        <button onClick={e => {
                          e.stopPropagation();
                          setMarkersRaw(prev => prev.map(x => x.id === m.id ? { ...x, status: "extracting" as const } : x));
                          extractAndDraft({ ...m, status: "extracting" as const });
                        }}
                          style={{ background: ORANGE, border: "none", borderRadius: 7, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: "#000", cursor: "pointer" }}>
                          Build
                        </button>
                      )}
                      {(isCut || isMedia || isAIScreen) && (
                        <button onClick={e => {
                          e.stopPropagation();
                          setMarkers(markers.filter(x => x.id !== m.id));
                          if (activeMarkerId === m.id) setActiveMarkerId(null);
                        }}
                          title="Remove"
                          style={{ background: "none", border: "1px solid #333", borderRadius: 7, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: "#666", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
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
    </div>
  );
}

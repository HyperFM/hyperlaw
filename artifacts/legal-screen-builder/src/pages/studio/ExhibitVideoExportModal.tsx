import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Film, Download, Clock, AlertCircle, CheckCircle2, Loader2, Volume2, VolumeX } from "lucide-react";
import type { ExhibitMarker } from "../../types";
import type { ExportSettings } from "./studioIndexedDB";
import {
  RESOLUTIONS, FPS_OPTIONS, DEFAULT_HOLD_SEC, mp4Supported, exportExhibitVideo,
} from "./exhibitVideoExport";

const ORANGE = "#d9711f";

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface Props {
  videoUrl: string | null;
  durationSec: number;
  markers: ExhibitMarker[];
  caseTitle: string;
  onClose: () => void;
  onUpdateHold: (markerId: string, sec: number) => void;
  /** Optional initial values restored from IndexedDB snapshot */
  initialResKey?: string;
  initialFps?: number;
  initialFormat?: "mp4" | "webm";
  initialIncludeAudio?: boolean;
  /** Called whenever a setting changes so the workspace can persist it */
  onSettingsChange?: (s: ExportSettings) => void;
}

export default function ExhibitVideoExportModal({
  videoUrl, durationSec, markers, caseTitle, onClose, onUpdateHold,
  initialResKey, initialFps, initialFormat, initialIncludeAudio, onSettingsChange,
}: Props) {
  const canMp4 = useMemo(() => mp4Supported(), []);
  const [resKey, setResKey] = useState(initialResKey ?? "1080");
  const [fps, setFps] = useState<number>(initialFps ?? 30);

  // Derive aspect ratio from the selected resolution key — portrait keys end in "_v"
  const isPortraitMode = resKey.endsWith("_v");
  const portraitResolutions  = RESOLUTIONS.filter(r => r.portrait);
  const landscapeResolutions = RESOLUTIONS.filter(r => !r.portrait);

  function switchAspectRatio(toPortrait: boolean) {
    if (toPortrait === isPortraitMode) return;
    // Map current resolution label to the matching preset in the new orientation,
    // falling back to "1080" / "1080_v" when no match exists (e.g., 4K → 1440p portrait)
    const currentLabel = RESOLUTIONS.find(r => r.key === resKey)?.label ?? "1080p";
    const candidates = toPortrait ? portraitResolutions : landscapeResolutions;
    const match = candidates.find(r => r.label === currentLabel) ?? candidates.find(r => r.note === "Recommended");
    setResKey(match?.key ?? (toPortrait ? "1080_v" : "1080"));
  }
  const [format, setFormat] = useState<"mp4" | "webm">(initialFormat ?? (canMp4 ? "mp4" : "webm"));
  const [includeAudio, setIncludeAudio] = useState(initialIncludeAudio ?? true);

  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultExt, setResultExt] = useState("mp4");
  const cancelRef = useRef(false);
  const exportStartRef = useRef<number | null>(null);
  const lastReachedMarkerRef = useRef<{ index: number; total: number } | null>(null);
  const [timeRemainingStr, setTimeRemainingStr] = useState<string | null>(null);
  const [interruptedAt, setInterruptedAt] = useState<{ index: number; total: number } | null>(null);

  // Report setting changes back to parent for IndexedDB persistence
  useEffect(() => {
    onSettingsChange?.({ resKey, fps, format, includeAudio });
  }, [resKey, fps, format, includeAudio]); // eslint-disable-line react-hooks/exhaustive-deps

  // Revoke a previous export's object URL whenever it is replaced or the modal unmounts.
  useEffect(() => {
    return () => { if (resultUrl) URL.revokeObjectURL(resultUrl); };
  }, [resultUrl]);

  // Show a browser "leave page?" dialog while an export is running so users don't accidentally kill it.
  useEffect(() => {
    if (!exporting) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [exporting]);

  const sorted = useMemo(() => [...markers].sort((a, b) => a.timestamp - b.timestamp), [markers]);
  const res = RESOLUTIONS.find(r => r.key === resKey) || RESOLUTIONS[1];

  const totalHold = sorted.reduce((s, m) => s + (m.holdSec ?? DEFAULT_HOLD_SEC), 0);
  const estSeconds = Math.round(durationSec + totalHold);

  const fileBase = (caseTitle || "exhibits").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "exhibits";

  async function run() {
    if (!videoUrl) return;
    setError(null);
    setResultUrl(null);
    setInterruptedAt(null);
    setExporting(true);
    setProgress(0);
    setTimeRemainingStr(null);
    cancelRef.current = false;
    exportStartRef.current = Date.now();
    lastReachedMarkerRef.current = null;
    try {
      const result = await exportExhibitVideo({
        videoUrl,
        durationSec,
        markers: sorted,
        caseTitle,
        width: res.width,
        height: res.height,
        fps,
        prefer: format,
        includeAudio,
        onProgress: (fraction) => {
          setProgress(fraction);
          if (fraction > 0.001 && exportStartRef.current !== null) {
            const elapsed = (Date.now() - exportStartRef.current) / 1000;
            const remaining = Math.max(0, elapsed / fraction - elapsed);
            setTimeRemainingStr(
              remaining >= 10
                ? remaining < 90
                  ? `~${Math.round(remaining)}s remaining`
                  : `~${Math.round(remaining / 60)} min remaining`
                : null
            );
          }
        },
        onStage: setStage,
        shouldCancel: () => cancelRef.current,
        onReachMarker: (index, total) => { lastReachedMarkerRef.current = { index, total }; },
      });
      if (result.cancelled) {
        if (lastReachedMarkerRef.current) setInterruptedAt(lastReachedMarkerRef.current);
        return;
      }
      const url = URL.createObjectURL(result.blob);
      setResultUrl(url);
      setResultExt(result.ext);
      // Auto-download
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileBase}-exhibit-video.${result.ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      if (lastReachedMarkerRef.current) setInterruptedAt(lastReachedMarkerRef.current);
      setError(e instanceof Error ? e.message : "Export failed. Please try again.");
    } finally {
      setExporting(false);
      setStage("");
      setTimeRemainingStr(null);
    }
  }

  function close() {
    if (exporting) { cancelRef.current = true; return; }
    onClose(); // the effect above revokes resultUrl on unmount
  }

  const noVideo = !videoUrl;
  const noMarkers = sorted.length === 0;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.94)", zIndex: 720, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ flexShrink: 0, padding: "20px 20px 14px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid #161616" }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Film size={18} color={ORANGE} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#fff" }}>Export Exhibit Video</div>
          <div style={{ fontSize: 11, color: "#555", marginTop: 1 }}>Source clip + {sorted.length} exhibit hold{sorted.length !== 1 ? "s" : ""}</div>
        </div>
        <button onClick={close} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, flexShrink: 0 }}>
          <X size={20} color="#555" />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px 28px" }}>

        {/* ── Keep-alive banner — only visible while recording ── */}
        {exporting && (
          <div style={{ position: "sticky", top: 0, zIndex: 10, background: "#1a1000", border: "1px solid #6b4500", borderRadius: 10, padding: "11px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <AlertCircle size={14} color="#f59e0b" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: "#f59e0b", lineHeight: 1.45 }}>
              Keep this tab open — closing it will cancel the export.
              {timeRemainingStr && <span style={{ fontWeight: 400, color: "#b07800", marginLeft: 8 }}>{timeRemainingStr}</span>}
            </div>
          </div>
        )}

        {noVideo ? (
          <div style={{ background: "#1a0e00", border: "1px solid #4a2800", borderRadius: 12, padding: "16px", display: "flex", gap: 10, alignItems: "flex-start" }}>
            <AlertCircle size={16} color="#cc6600" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 13, color: "#cc9966", lineHeight: 1.55 }}>
              Relink your video first. The original file isn't stored between sessions — reopen it in the workspace, then export.
            </div>
          </div>
        ) : (
          <>
            {/* ── Aspect ratio ── */}
            <SectionLabel>ASPECT RATIO</SectionLabel>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <Chip active={!isPortraitMode} onClick={() => switchAspectRatio(false)} style={{ flex: 1 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    {/* Landscape icon */}
                    <span style={{
                      display: "inline-block", width: 22, height: 14,
                      border: `2px solid ${!isPortraitMode ? "#000" : "#555"}`,
                      borderRadius: 3, flexShrink: 0,
                    }} />
                    <span style={{ fontWeight: 800, fontSize: 14 }}>Landscape</span>
                  </div>
                  <div style={{ fontSize: 10, color: !isPortraitMode ? "#000a" : "#666", fontWeight: 700 }}>16:9 · Court / presentation</div>
                </div>
              </Chip>
              <Chip active={isPortraitMode} onClick={() => switchAspectRatio(true)} style={{ flex: 1 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    {/* Portrait icon */}
                    <span style={{
                      display: "inline-block", width: 14, height: 22,
                      border: `2px solid ${isPortraitMode ? "#000" : "#555"}`,
                      borderRadius: 3, flexShrink: 0,
                    }} />
                    <span style={{ fontWeight: 800, fontSize: 14 }}>Portrait</span>
                  </div>
                  <div style={{ fontSize: 10, color: isPortraitMode ? "#000a" : "#666", fontWeight: 700 }}>9:16 · AI screens fill frame</div>
                </div>
              </Chip>
            </div>

            {/* ── Resolution ── */}
            <SectionLabel>RESOLUTION</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
              {(isPortraitMode ? portraitResolutions : landscapeResolutions).map(r => (
                <Chip key={r.key} active={resKey === r.key} onClick={() => setResKey(r.key)}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{r.label}</div>
                  {r.note && <div style={{ fontSize: 10, color: resKey === r.key ? "#000a" : "#666", marginTop: 2, fontWeight: 700 }}>{r.note}</div>}
                </Chip>
              ))}
            </div>

            {/* ── Frame rate ── */}
            <SectionLabel>FRAME RATE</SectionLabel>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {FPS_OPTIONS.map(f => (
                <Chip key={f} active={fps === f} onClick={() => setFps(f)} style={{ flex: 1 }}>
                  <span style={{ fontWeight: 800, fontSize: 14 }}>{f} fps</span>
                  {f === 30 && <span style={{ fontSize: 10, marginLeft: 6, color: fps === f ? "#000a" : "#666", fontWeight: 700 }}>Recommended</span>}
                </Chip>
              ))}
            </div>

            {/* ── Format ── */}
            <SectionLabel>FORMAT</SectionLabel>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <Chip active={format === "mp4"} onClick={() => canMp4 && setFormat("mp4")} disabled={!canMp4} style={{ flex: 1 }}>
                <span style={{ fontWeight: 800, fontSize: 14 }}>MP4</span>
                <span style={{ fontSize: 10, marginLeft: 6, color: format === "mp4" ? "#000a" : "#666", fontWeight: 700 }}>{canMp4 ? "Recommended" : "Unavailable"}</span>
              </Chip>
              <Chip active={format === "webm"} onClick={() => setFormat("webm")} style={{ flex: 1 }}>
                <span style={{ fontWeight: 800, fontSize: 14 }}>WebM</span>
              </Chip>
            </div>
            {!canMp4 && (
              <div style={{ fontSize: 11, color: "#775", marginBottom: 16, lineHeight: 1.5 }}>
                This browser can't record MP4 directly — WebM will be produced (plays in most players; convert to MP4 later if your court requires it).
              </div>
            )}
            <div style={{ height: 4 }} />

            {/* ── Audio ── */}
            <button onClick={() => setIncludeAudio(v => !v)}
              style={{ width: "100%", background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, padding: "13px 14px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 20 }}>
              {includeAudio ? <Volume2 size={16} color={ORANGE} /> : <VolumeX size={16} color="#555" />}
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#ddd" }}>Include source audio</div>
                <div style={{ fontSize: 10, color: "#555", marginTop: 1 }}>Plays aloud while recording · silent during exhibit holds</div>
              </div>
              <div style={{ width: 40, height: 22, borderRadius: 11, background: includeAudio ? ORANGE : "#2a2a2a", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: includeAudio ? 20 : 2, transition: "left 0.2s" }} />
              </div>
            </button>

            {/* ── Exhibit hold durations ── */}
            <SectionLabel>EXHIBIT HOLD LENGTH</SectionLabel>
            {noMarkers ? (
              <div style={{ fontSize: 12, color: "#555", lineHeight: 1.6, marginBottom: 8 }}>
                No exhibits marked yet. Add exhibits on the timeline, then export — each holds on screen for its set number of seconds.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sorted.map((m, i) => (
                  <div key={m.id} style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 7, background: "#0d0d0d", border: `1px solid ${ORANGE}33`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 11, fontWeight: 900, color: ORANGE }}>{i + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label || `Exhibit ${i + 1}`}</div>
                      <div style={{ fontSize: 10, color: "#555" }}>at {formatTime(m.timestamp)}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <Clock size={12} color="#555" />
                      <input
                        type="number" min={1} max={120}
                        value={m.holdSec ?? DEFAULT_HOLD_SEC}
                        onChange={e => {
                          const n = Math.max(1, Math.min(120, Math.round(Number(e.target.value) || DEFAULT_HOLD_SEC)));
                          onUpdateHold(m.id, n);
                        }}
                        style={{ width: 52, background: "#0a0a0a", border: "1px solid #262626", borderRadius: 8, padding: "6px 8px", color: "#fff", fontSize: 13, fontWeight: 700, textAlign: "center", outline: "none" }}
                      />
                      <span style={{ fontSize: 11, color: "#555", fontWeight: 700 }}>sec</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Estimate ── */}
            <div style={{ marginTop: 18, fontSize: 11, color: "#555", lineHeight: 1.6, background: "#0d0d0d", border: "1px solid #161616", borderRadius: 10, padding: "12px 14px" }}>
              Output: <strong style={{ color: "#999" }}>{res.width}×{res.height}</strong> · {fps} fps · {format.toUpperCase()}<br />
              Recording runs in real time — about <strong style={{ color: "#999" }}>{formatTime(estSeconds)}</strong>{res.key === "2160" ? " (4K encodes slower — please be patient)" : ""}. Keep this screen open.
            </div>
          </>
        )}
      </div>

      {/* ── Footer / action ── */}
      <div style={{ flexShrink: 0, padding: "14px 20px calc(16px + env(safe-area-inset-bottom))", borderTop: "1px solid #161616" }}>
        {error && (
          <div style={{ fontSize: 12, color: "#ef8a8a", marginBottom: 10, display: "flex", gap: 6, alignItems: "flex-start" }}>
            <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
          </div>
        )}

        {exporting ? (
          <>
            <div style={{ height: 8, background: "#1a1a1a", borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
              <div style={{ height: "100%", width: `${Math.round(progress * 100)}%`, background: ORANGE, transition: "width 0.2s" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "#888", display: "flex", alignItems: "center", gap: 6 }}>
                <Loader2 size={13} color={ORANGE} style={{ animation: "spin 1s linear infinite" }} />
                {stage || "Working…"} · {Math.round(progress * 100)}%
              </div>
              <button onClick={() => { cancelRef.current = true; }}
                style={{ background: "none", border: "1px solid #333", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, color: "#888", cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </>
        ) : resultUrl ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, color: "#22c55e", fontSize: 13, fontWeight: 700 }}>
              <CheckCircle2 size={15} /> Exported — download started.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <a href={resultUrl} download={`${fileBase}-exhibit-video.${resultExt}`}
                style={{ flex: 1, background: "#141414", border: "1px solid #262626", borderRadius: 12, padding: "14px", textAlign: "center", color: "#ccc", fontWeight: 800, fontSize: 13, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Download size={15} /> Download again
              </a>
              <button onClick={close}
                style={{ flex: 1, background: ORANGE, border: "none", borderRadius: 12, padding: "14px", color: "#000", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Interrupted-export callout — shown when a previous run stopped mid-way */}
            {interruptedAt && (
              <div style={{ fontSize: 12, color: "#c47000", marginBottom: 10, background: "#1a1200", border: "1px solid #3a2800", borderRadius: 8, padding: "10px 12px", display: "flex", gap: 6, alignItems: "flex-start" }}>
                <AlertCircle size={13} color="#c47000" style={{ flexShrink: 0, marginTop: 1 }} />
                <span>Last export stopped at marker {interruptedAt.index} of {interruptedAt.total} — tap Export to start a fresh render.</span>
              </div>
            )}
            <button onClick={run} disabled={noVideo || noMarkers}
              style={{ width: "100%", background: noVideo || noMarkers ? "#1a1a1a" : ORANGE, border: "none", borderRadius: 12, padding: "15px", color: noVideo || noMarkers ? "#555" : "#000", fontWeight: 900, fontSize: 15, cursor: noVideo || noMarkers ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Film size={17} /> Export Video
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Small UI helpers ───────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>{children}</div>;
}

function Chip({ active, disabled, onClick, children, style }: {
  active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode; style?: React.CSSProperties;
}) {
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled}
      style={{
        background: active ? ORANGE : "#111",
        border: `1px solid ${active ? ORANGE : "#1e1e1e"}`,
        borderRadius: 12, padding: "12px 14px", cursor: disabled ? "not-allowed" : "pointer",
        color: active ? "#000" : "#bbb", textAlign: "left", opacity: disabled ? 0.4 : 1,
        display: "flex", alignItems: "center", ...style,
      }}>
      <div>{children}</div>
    </button>
  );
}

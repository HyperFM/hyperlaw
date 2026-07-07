import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft, Play, Pause, Plus, Mic, MicOff, Undo2, Redo2,
  Check, Film, Upload, X, AlertCircle, CheckCircle2, XCircle,
  Loader2, Eye, Shield, ZoomIn, ZoomOut, Info, Clapperboard, Download,
} from "lucide-react";
import type { HLCase, ExhibitMarker, StudioProject, JurisdictionVerification } from "../../types";
import { aiApi } from "../../lib/aiApi";
import ExhibitVideoExportModal from "./ExhibitVideoExportModal";

const ORANGE = "#d9711f";

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
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
      {/* Track */}
      <div ref={trackRef}
        style={{ height: 36, background: "#111", borderRadius: 8, position: "relative", cursor: "pointer", border: "1px solid #1a1a1a", overflow: "visible" }}
        onMouseDown={e => { isDragging.current = true; seekFromEvent(e); }}
        onClick={e => { if (!isDragging.current) seekFromEvent(e); }}>

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
          return (
            <div key={m.id} onClick={e => { e.stopPropagation(); onSelectMarker(m.id); }}
              style={{ position: "absolute", left: `${pct}%`, top: 0, bottom: 0, transform: "translateX(-50%)", zIndex: 3, display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer" }}>
              <div style={{ width: 3, height: "100%", background: isActive ? "#fff" : ORANGE + "cc", borderRadius: 2 }} />
              <div style={{ position: "absolute", bottom: -18, fontSize: 9, color: isActive ? "#fff" : ORANGE, fontWeight: 700, whiteSpace: "nowrap", maxWidth: 60, overflow: "hidden", textOverflow: "ellipsis" }}>
                {m.label || `EX-${markers.indexOf(m) + 1}`}
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
        {/* Header */}
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
            {/* Supporting Quote */}
            {draft.supportingQuote && (
              <div style={{ background: "#111", border: `1px solid ${ORANGE}33`, borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ fontSize: 10, color: ORANGE, fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>SUPPORTING QUOTE</div>
                <div style={{ fontSize: 14, color: "#ccc", lineHeight: 1.55, fontStyle: "italic" }}>"{draft.supportingQuote}"</div>
              </div>
            )}

            {/* Key Observations */}
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

            {/* Timeline Context */}
            {draft.timelineContext && (
              <div>
                <div style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>TIMELINE CONTEXT</div>
                <div style={{ fontSize: 13, color: "#888", lineHeight: 1.55 }}>{draft.timelineContext}</div>
              </div>
            )}

            {/* Parties + Evidence */}
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

            {/* Legal Authorities */}
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

            {/* Why This Moment Matters */}
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

            {/* Footer */}
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
  /** Always tracks the latest object URL so cleanup can revoke it reliably */
  const videoUrlRef = useRef<string | null>(null);
  const [videoFileName, setVideoFileName] = useState(hlCase.studioProject?.videoFileName ?? "");
  const [duration, setDuration] = useState(hlCase.studioProject?.videoDurationSec ?? 0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);

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
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // ── Jurisdiction verification ──────────────────────────────────
  const [verifying, setVerifying] = useState(false);
  const [showVerifResult, setShowVerifResult] = useState(false);
  const verification = hlCase.studioProject?.jurisdictionVerification;

  // ── Autosave ───────────────────────────────────────────────────
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Info panel ─────────────────────────────────────────────────
  const [showInfo, setShowInfo] = useState(false);

  // ── Video export ───────────────────────────────────────────────
  const [showExport, setShowExport] = useState(false);

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
  }

  /** Update how long an exhibit screen holds in the exported video (persists via autosave, no undo entry). */
  function updateMarkerHold(markerId: string, sec: number) {
    setMarkers(markers.map(m => (m.id === markerId ? { ...m, holdSec: sec } : m)), false);
  }

  function triggerAutosave(updatedMarkers: ExhibitMarker[]) {
    setAutosaveStatus("saving");
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      const project = getOrCreateProject();
      const next: StudioProject = {
        ...project,
        videoFileName,
        videoDurationSec: duration,
        markers: updatedMarkers,
        updatedAt: Date.now(),
      };
      onUpdateCase({ ...hlCase, studioProject: next });
      setAutosaveStatus("saved");
      autosaveTimer.current = setTimeout(() => setAutosaveStatus("idle"), 2500);
    }, 800);
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
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    const url = URL.createObjectURL(file);
    videoUrlRef.current = url;
    setVideoUrl(url);
    setVideoFileName(file.name);
    setCurrentTime(0);
    setIsPlaying(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const maxBytes = 60 * 60 * 1024 * 1024 * 2; // ~2 GB (hour of compressed video)
    if (file.size > maxBytes) { alert("File may be too large. Recommend trimming to the relevant sections."); }
    loadVideo(file);
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

  // ── Exhibit marker insertion ────────────────────────────────────
  function insertMarker() {
    const id = crypto.randomUUID();
    const exhibitNum = markers.length + 1;
    const newMarker: ExhibitMarker = {
      id, timestamp: currentTime,
      label: `Exhibit ${exhibitNum}`,
      dictation: "", whyItMatters: "",
      status: "draft", createdAt: Date.now(),
    };
    // Pause video
    if (videoRef.current && isPlaying) { videoRef.current.pause(); setIsPlaying(false); }
    setMarkers([...markers, newMarker].sort((a, b) => a.timestamp - b.timestamp));
    setActiveMarkerId(id);
    // Start dictation immediately
    startDictation(id);
  }

  // ── Dictation ──────────────────────────────────────────────────
  function startDictation(markerId: string) {
    const SpeechRecognition = (window as Window & { SpeechRecognition?: typeof window.SpeechRecognition; webkitSpeechRecognition?: typeof window.SpeechRecognition }).SpeechRecognition
      || (window as Window & { webkitSpeechRecognition?: typeof window.SpeechRecognition }).webkitSpeechRecognition;
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
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript + " ";
        else interim += e.results[i][0].transcript;
      }
      setDictationText(finalText + interim);
    };
    r.onend = () => { /* keep updating but don't auto-stop */ };
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

    if (!text) {
      // Nothing to extract — leave marker as draft so user can dictate again
      return;
    }

    // Mark as extracting and kick off the Builder Engine
    const updated = markers.map(m =>
      m.id === midId ? { ...m, dictation: text, status: "extracting" as const } : m
    );
    setMarkers(updated);
    const targetMarker = updated.find(m => m.id === midId);
    if (targetMarker) extractAndDraft(targetMarker);
  }

  // ── Claude Builder Engine ───────────────────────────────────────
  // Uses functional setMarkersRaw so in-flight updates never overwrite concurrent edits.
  async function extractAndDraft(marker: ExhibitMarker) {
    // Compute exhibit number from the current sorted position
    const exhibitNumber = markers.filter(m => m.timestamp <= marker.timestamp).length;
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
    // Show saved result on first tap; hold-to-verify fires with forceRefresh=true
    if (verification && !forceRefresh) { setShowVerifResult(true); return; }
    setVerifying(true);
    try {
      const result = await aiApi.jurisdictionVerify({
        state: hlCase.court.state,
        county: "",
        courtName: hlCase.court.name,
        caseId: hlCase.id,
      });
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

  // ── Cleanup ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      // Revoke via ref so the latest URL is always cleaned up, not the initial one
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      // Stop any in-progress speech recognition
      if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activeMarker = markers.find(m => m.id === activeMarkerId);
  const viewingMarker = markers.find(m => m.id === viewingDraftId);
  const sortedMarkers = [...markers].sort((a, b) => a.timestamp - b.timestamp);
  const court = hlCase.court;

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

      {/* ── Jurisdiction strip — always visible ──────────────────── */}
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
        {/* Verify button */}
        {verification ? (
          <button onClick={() => setShowVerifResult(true)}
            style={{ background: "none", border: "1px solid #222", borderRadius: 7, padding: "4px 10px", fontSize: 11, color: verification.verdict === "permitted" ? "#22c55e" : verification.verdict === "limited" ? "#f59e0b" : "#ef4444", cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
            <Eye size={11} /> View
          </button>
        ) : (
          <JurisdictionVerifyButton onVerify={handleVerify} disabled={verifying || !court} />
        )}
      </div>

      {/* ── Evidence preservation reminder ──────────────────────── */}
      <div style={{ flexShrink: 0, background: "#0a0800", borderBottom: "1px solid #1a1500", padding: "6px 16px", fontSize: 11, color: "#6b5a00", display: "flex", alignItems: "center", gap: 6 }}>
        <AlertCircle size={11} color="#6b5a00" />
        Always preserve and retain the complete, unedited original recording for evidentiary purposes.
      </div>

      {/* ── Scrollable content ────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 120px" }}>

        {/* ── Video area ────────────────────────────────────────────── */}
        {videoUrl ? (
          <div style={{ marginBottom: 12 }}>
            <video ref={videoRef} src={videoUrl} style={{ width: "100%", borderRadius: 12, background: "#000", display: "block", maxHeight: 240 }}
              onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
              onDurationChange={e => setDuration(e.currentTarget.duration)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
            />
          </div>
        ) : (
          <button onClick={() => fileInputRef.current?.click()}
            style={{ width: "100%", background: "#0d0d0d", border: "2px dashed #1e1e1e", borderRadius: 16, padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, cursor: "pointer", marginBottom: 16 }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE + "55")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "#1e1e1e")}>
            <Film size={40} color="#333" />
            <div style={{ fontSize: 15, fontWeight: 700, color: "#555" }}>Upload Video</div>
            <div style={{ fontSize: 12, color: "#444", textAlign: "center", maxWidth: 260, lineHeight: 1.5 }}>
              Tap to select a video file. Videos up to one hour are supported.
              <br />Trim unnecessary portions before uploading when possible.
            </div>
          </button>
        )}
        <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileChange} style={{ display: "none" }} />

        {/* ── Relink banner (video unlinked after session) ────────── */}
        {!videoUrl && videoFileName && (
          <div style={{ background: "#1a0e00", border: "1px solid #4a2800", borderRadius: 10, padding: "10px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#cc6600" }}>
            <AlertCircle size={13} color="#cc6600" />
            <div style={{ flex: 1 }}>
              Previously linked: <strong>{videoFileName}</strong> — relink to continue editing.
            </div>
            <button onClick={() => fileInputRef.current?.click()}
              style={{ background: ORANGE, border: "none", borderRadius: 7, padding: "5px 12px", fontSize: 11, fontWeight: 800, color: "#000", cursor: "pointer" }}>
              Relink
            </button>
          </div>
        )}

        {/* ── Controls ──────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
          <button onClick={togglePlay} disabled={!videoUrl}
            style={{ width: 40, height: 40, borderRadius: 20, background: videoUrl ? ORANGE : "#1a1a1a", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: videoUrl ? "pointer" : "not-allowed", flexShrink: 0 }}>
            {isPlaying ? <Pause size={16} color="#000" /> : <Play size={16} color={videoUrl ? "#000" : "#555"} />}
          </button>
          <div style={{ fontSize: 14, fontWeight: 800, color: videoUrl ? "#fff" : "#444", letterSpacing: 0.5, minWidth: 80, flexShrink: 0 }}>
            {formatTime(currentTime)}
            <span style={{ color: "#444", fontWeight: 400 }}> / {duration ? formatTime(duration) : "--:--"}</span>
          </div>
          <div style={{ flex: 1 }} />
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
          {/* Relink video */}
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
          zoom={zoom}
          onSeek={seek}
          activeMarkerId={activeMarkerId}
          onSelectMarker={id => { setActiveMarkerId(id); }}
        />

        {/* ── Action buttons ────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          <button onClick={insertMarker} disabled={!videoUrl}
            style={{ flex: 1, background: videoUrl ? ORANGE : "#1a1a1a", border: "none", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: videoUrl ? "pointer" : "not-allowed", fontWeight: 800, fontSize: 13, color: videoUrl ? "#000" : "#444" }}>
            <Plus size={16} /> Insert Exhibit
          </button>
          <button
            onClick={() => {
              if (activeMarkerId) {
                const m = markers.find(x => x.id === activeMarkerId);
                if (m && !isDictating) startDictation(activeMarkerId);
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
                  ? `Source clip + ${sortedMarkers.length} exhibit hold${sortedMarkers.length !== 1 ? "s" : ""}`
                  : "Relink your video to export"}
              </div>
            </div>
            <Download size={16} color={ORANGE} style={{ flexShrink: 0 }} />
          </button>
        )}

        {/* ── Exhibits list ─────────────────────────────────────────── */}
        {sortedMarkers.length > 0 && (
          <>
            <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>EXHIBITS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sortedMarkers.map((m, i) => (
                <div key={m.id}
                  style={{ background: m.id === activeMarkerId ? "#1a1a1a" : "#111", border: `1px solid ${m.id === activeMarkerId ? ORANGE + "44" : "#1e1e1e"}`, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                  onClick={() => { setActiveMarkerId(m.id); seek(m.timestamp); }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: "#0d0d0d", border: `1px solid ${ORANGE}33`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 900, color: ORANGE }}>{i + 1}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#ddd", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</div>
                    <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                      {formatTime(m.timestamp)}
                      {m.dictation && ` · ${m.dictation.slice(0, 40)}${m.dictation.length > 40 ? "…" : ""}`}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    {m.status === "extracting" && <Loader2 size={15} color="#555" style={{ animation: "spin 1s linear infinite" }} />}
                    {m.status === "ready" && (
                      <button onClick={e => { e.stopPropagation(); setViewingDraftId(m.id); }}
                        style={{ background: `${ORANGE}22`, border: `1px solid ${ORANGE}44`, borderRadius: 7, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: ORANGE, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                        <Eye size={11} /> View
                      </button>
                    )}
                    {m.status === "error" && (
                      <button onClick={e => {
                        e.stopPropagation();
                        setMarkersRaw(prev => prev.map(x => x.id === m.id ? { ...x, status: "extracting" as const } : x));
                        extractAndDraft({ ...m, status: "extracting" as const });
                      }}
                        style={{ background: "none", border: "1px solid #444", borderRadius: 7, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: "#888", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                        Retry
                      </button>
                    )}
                    {m.status === "draft" && m.dictation && (
                      <button onClick={e => {
                        e.stopPropagation();
                        setMarkersRaw(prev => prev.map(x => x.id === m.id ? { ...x, status: "extracting" as const } : x));
                        extractAndDraft({ ...m, status: "extracting" as const });
                      }}
                        style={{ background: ORANGE, border: "none", borderRadius: 7, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: "#000", cursor: "pointer" }}>
                        Build
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Dictation overlay ─────────────────────────────────────── */}
      {isDictating && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", zIndex: 800, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
          {/* Pulsing mic */}
          <div style={{ width: 80, height: 80, borderRadius: 40, background: "#1a0000", border: "2px solid #ef4444", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, boxShadow: "0 0 0 8px rgba(239,68,68,0.1), 0 0 0 16px rgba(239,68,68,0.05)" }}>
            <Mic size={36} color="#ef4444" />
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginBottom: 8 }}>Recording…</div>
          <div style={{ fontSize: 12, color: "#666", textAlign: "center", marginBottom: 24, maxWidth: 320, lineHeight: 1.6 }}>
            Describe exactly what happened in this moment. Include actions, statements, contradictions, and anything a judge or jury should notice.
          </div>
          {/* Live transcript */}
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

      {/* ── Jurisdiction result sheet ──────────────────────────────── */}
      {showVerifResult && verification && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 700, display: "flex", alignItems: "flex-end" }}
          onClick={() => setShowVerifResult(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#111", borderRadius: "20px 20px 0 0", width: "100%", padding: "24px 24px calc(24px + env(safe-area-inset-bottom))", borderTop: `2px solid ${ORANGE}33` }}>
            <div style={{ width: 36, height: 3, background: "#2a2a2a", borderRadius: 2, margin: "0 auto 20px" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              {verification.verdict === "permitted"    && <><CheckCircle2 size={22} color="#22c55e" /><div style={{ fontSize: 18, fontWeight: 900, color: "#22c55e" }}>✅ Generally permitted.</div></>}
              {verification.verdict === "limited"      && <><AlertCircle  size={22} color="#f59e0b" /><div style={{ fontSize: 18, fontWeight: 900, color: "#f59e0b" }}>⚠ Allowed with limitations.</div></>}
              {verification.verdict === "not_accepted" && <><XCircle      size={22} color="#ef4444" /><div style={{ fontSize: 18, fontWeight: 900, color: "#ef4444" }}>❌ Not generally accepted.</div></>}
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

      {/* ── Export Exhibit Video modal ─────────────────────────────── */}
      {showExport && (
        <ExhibitVideoExportModal
          videoUrl={videoUrl}
          durationSec={duration}
          markers={markers}
          caseTitle={hlCase.title}
          onClose={() => setShowExport(false)}
          onUpdateHold={updateMarkerHold}
        />
      )}
    </div>
  );
}

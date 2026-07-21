// ─── Exhibit video export ──────────────────────────────────────────────────────
// Composites the source video with full-screen "exhibit hold" slides (default 10s
// each) at every marker timestamp, and records the result to an MP4/WebM file
// entirely in the browser (canvas.captureStream + MediaRecorder).
//
// There is no server render pipeline and no ffmpeg dependency — recording runs in
// real time, so a 2-minute clip takes roughly 2 minutes (plus the hold seconds).

import html2canvas from "html2canvas";
import type { ExhibitMarker, MediaInsert } from "../../types";

const ORANGE = "#d9711f";

export const DEFAULT_HOLD_SEC = 10;

export interface ResolutionPreset {
  key: string;
  label: string;
  width: number;
  height: number;
  note?: string;
}

// All 16:9 so exhibit slides (designed at 1920×1080) fill the frame exactly.
export const RESOLUTIONS: ResolutionPreset[] = [
  { key: "720",  label: "720p",  width: 1280, height: 720,  note: "Fastest" },
  { key: "1080", label: "1080p", width: 1920, height: 1080, note: "Recommended" },
  { key: "1440", label: "1440p", width: 2560, height: 1440, note: "Sharper" },
  { key: "2160", label: "4K",    width: 3840, height: 2160, note: "Slowest — overkill for court" },
];

export const FPS_OPTIONS = [30, 60] as const;

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function escapeHtml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ── Codec / container selection ────────────────────────────────────────────────
function candidates(prefer: "mp4" | "webm", withAudio: boolean): string[] {
  const mp4 = withAudio
    ? ["video/mp4;codecs=avc1.640029,mp4a.40.2", "video/mp4;codecs=avc1.4d0028,mp4a.40.2", "video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4"]
    : ["video/mp4;codecs=avc1.640029", "video/mp4;codecs=avc1.42E01E", "video/mp4"];
  const webm = withAudio
    ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
    : ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return prefer === "webm" ? [...webm, ...mp4] : [...mp4, ...webm];
}

export function pickMimeType(prefer: "mp4" | "webm", withAudio: boolean): string {
  if (typeof MediaRecorder === "undefined") return "";
  return candidates(prefer, withAudio).find(c => {
    try { return MediaRecorder.isTypeSupported(c); } catch { return false; }
  }) || "";
}

/** True when the browser can record any MP4 (H.264) container. */
export function mp4Supported(): boolean {
  if (typeof MediaRecorder === "undefined") return false;
  return ["video/mp4;codecs=avc1.640029", "video/mp4;codecs=avc1.42E01E", "video/mp4"]
    .some(c => { try { return MediaRecorder.isTypeSupported(c); } catch { return false; } });
}

function bitrateFor(height: number, fps: number): number {
  const base = height <= 720 ? 5e6 : height <= 1080 ? 10e6 : height <= 1440 ? 18e6 : 40e6;
  return Math.round(base * (fps >= 60 ? 1.6 : 1));
}

// ── Exhibit slide rasterization ────────────────────────────────────────────────
async function renderExhibitSlide(
  marker: ExhibitMarker,
  num: number,
  caseTitle: string,
  scale: number,
): Promise<HTMLCanvasElement> {
  const draft = marker.draft;
  const headline = String(draft?.headline || marker.label || `Exhibit ${num}`);
  const quote = draft?.supportingQuote || "";
  const obs = (draft?.keyObservations || []).slice(0, 5);
  const why = marker.whyItMatters || draft?.whyItMatters || "";

  const node = document.createElement("div");
  node.style.cssText = "position:fixed;left:-10000px;top:0;width:1920px;height:1080px;background:#0a0a0a;color:#fff;font-family:Arial,Helvetica,sans-serif;box-sizing:border-box;overflow:hidden;";
  node.innerHTML = `
    <div style="position:absolute;left:0;top:0;bottom:0;width:14px;background:${ORANGE};"></div>
    <div style="padding:78px 108px;height:100%;box-sizing:border-box;display:flex;flex-direction:column;">
      <div style="display:flex;align-items:center;gap:26px;margin-bottom:36px;">
        <div style="background:${ORANGE};color:#000;font-weight:900;font-size:32px;letter-spacing:1px;padding:10px 22px;border-radius:10px;">EXHIBIT ${num}</div>
        ${caseTitle ? `<div style="color:#777;font-size:26px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:820px;">${escapeHtml(caseTitle)}</div>` : ""}
        <div style="flex:1;"></div>
        <div style="color:#555;font-size:24px;font-weight:700;">${formatTime(marker.timestamp)}</div>
      </div>
      <div style="font-family:'Arial Black',Arial,sans-serif;font-weight:900;font-size:70px;line-height:1.04;text-transform:uppercase;letter-spacing:-1px;margin-bottom:26px;">${escapeHtml(headline)}</div>
      ${quote ? `<div style="border-left:6px solid ${ORANGE};background:rgba(217,113,31,0.06);padding:24px 30px;font-size:38px;line-height:1.4;font-style:italic;color:#dedede;margin-bottom:28px;">&ldquo;${escapeHtml(quote)}&rdquo;</div>` : ""}
      ${obs.length ? `<div style="display:flex;flex-direction:column;gap:18px;margin-bottom:24px;">${obs.map(o => `<div style="display:flex;gap:20px;align-items:flex-start;"><div style="width:16px;height:16px;border-radius:50%;background:${ORANGE};margin-top:14px;flex-shrink:0;"></div><div style="font-size:33px;line-height:1.35;color:#ccc;">${escapeHtml(o)}</div></div>`).join("")}</div>` : ""}
      <div style="flex:1;"></div>
      ${why ? `<div style="border:2px solid ${ORANGE};border-radius:12px;padding:24px 30px;background:rgba(217,113,31,0.05);margin-bottom:22px;"><div style="color:${ORANGE};font-weight:800;font-size:23px;letter-spacing:1px;margin-bottom:10px;">WHY THIS MATTERS</div><div style="font-size:31px;line-height:1.4;font-weight:700;color:#fff;">${escapeHtml(why)}</div></div>` : ""}
      <div style="border-top:1px solid #222;padding-top:18px;display:flex;justify-content:space-between;color:#555;font-size:22px;">
        <span>HyperLaw · Exhibit ${num}</span>
        <span style="font-style:italic;">Factual observations only — no legal conclusions asserted</span>
      </div>
    </div>`;

  document.body.appendChild(node);
  try {
    return await html2canvas(node, {
      backgroundColor: "#0a0a0a",
      scale,
      width: 1920,
      height: 1080,
      windowWidth: 1920,
      windowHeight: 1080,
      logging: false,
    });
  } finally {
    try { document.body.removeChild(node); } catch { /* noop */ }
  }
}

// ── Screen-cut slide rasterization ────────────────────────────────────────────
// Renders a ScreenInsert (user-built insert screen) to a canvas at 1920×1080,
// matching the ScreenPreviewCard visual design but at full export resolution.
async function renderScreenCutSlide(
  si: import("../../types").ScreenInsert,
  scale: number,
): Promise<HTMLCanvasElement> {
  const isLight = si.bgColor === "#f0f0f0";
  const textColor = isLight ? "#111111" : "#ffffff";
  const mutedColor = isLight ? "#555555" : "#aaaaaa";
  const bodyLines = (si.bodyLines || []).filter(Boolean).slice(0, 5);

  const hasSubtitle = Boolean(si.subtitle);
  const hasBody = bodyLines.length > 0;

  const node = document.createElement("div");
  node.style.cssText = `position:fixed;left:-10000px;top:0;width:1920px;height:1080px;background:${si.bgColor};color:${textColor};font-family:Arial,Helvetica,sans-serif;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:100px 160px;`;
  node.innerHTML = `
    <div style="font-family:'Arial Black',Arial,sans-serif;font-weight:900;font-size:88px;line-height:1.08;color:${textColor};margin-bottom:${hasSubtitle || hasBody ? "30px" : "0"};">${escapeHtml(si.title)}</div>
    ${hasSubtitle ? `<div style="font-size:42px;line-height:1.4;color:${mutedColor};margin-bottom:${hasBody ? "48px" : "0"};">${escapeHtml(si.subtitle!)}</div>` : ""}
    ${hasBody ? `<div style="display:flex;flex-direction:column;gap:22px;text-align:left;width:100%;max-width:1400px;">${
      bodyLines.map(line => `<div style="display:flex;gap:28px;align-items:flex-start;"><div style="width:18px;height:18px;border-radius:50%;background:${ORANGE};margin-top:18px;flex-shrink:0;"></div><div style="font-size:38px;line-height:1.45;color:${mutedColor};">${escapeHtml(line)}</div></div>`).join("")
    }</div>` : ""}`;

  document.body.appendChild(node);
  try {
    return await html2canvas(node, {
      backgroundColor: si.bgColor,
      scale,
      width: 1920,
      height: 1080,
      windowWidth: 1920,
      windowHeight: 1080,
      logging: false,
    });
  } finally {
    try { document.body.removeChild(node); } catch { /* noop */ }
  }
}

// ── Photo slide rasterization ─────────────────────────────────────────────────
// Draws a photo full-frame at export resolution (letterbox, black bars).
// Uses native canvas — no html2canvas needed.
function renderPhotoSlide(blobUrl: string, w: number, h: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
      const s = Math.min(w / img.naturalWidth, h / img.naturalHeight);
      const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error("Could not load photo"));
    img.src = blobUrl;
  });
}

/** Placeholder canvas shown when a media file's blob URL has expired. */
function renderMissingMediaPlaceholder(fileName: string, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#0d0d0d"; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#555";
  const titleSize = Math.round(w * 0.022);
  const subSize = Math.round(w * 0.016);
  ctx.font = `bold ${titleSize}px Arial`; ctx.textAlign = "center";
  ctx.fillText("Media unavailable — relink required", w / 2, h / 2 - titleSize);
  ctx.font = `${subSize}px Arial`; ctx.fillStyle = "#3a3a3a";
  ctx.fillText(fileName, w / 2, h / 2 + subSize);
  return canvas;
}

/** Load a clip video off-screen and await metadata. Element is appended to DOM;
 *  caller must remove it via the clipVideos cleanup array. */
async function loadClipVideo(blobUrl: string): Promise<HTMLVideoElement> {
  const vid = document.createElement("video");
  vid.src = blobUrl; vid.crossOrigin = "anonymous";
  vid.playsInline = true; vid.preload = "auto"; vid.muted = true;
  vid.style.cssText = "position:fixed;left:-10000px;top:0;width:320px;height:180px;opacity:0;pointer-events:none;";
  document.body.appendChild(vid);
  await new Promise<void>((resolve, reject) => {
    vid.onloadedmetadata = () => resolve();
    vid.onerror = () => reject(new Error("Could not load clip"));
  });
  return vid;
}

// ── Slot type ─────────────────────────────────────────────────────────────────
// Phase 1 produces one Slot per sorted marker. The frame loop reads Slot.kind
// to decide whether to draw a static canvas (hold mode) or play a live video
// (clip mode) — it never branches on marker type itself.
type Slot =
  | { kind: "canvas"; canvas: HTMLCanvasElement }
  | { kind: "clip"; video: HTMLVideoElement; durationSec: number };

// ── Unified marker slot dispatcher ────────────────────────────────────────────
async function getMarkerSlot(
  marker: ExhibitMarker,
  index: number,
  caseTitle: string,
  scale: number,
  exportWidth: number,
  exportHeight: number,
): Promise<Slot> {
  if (marker.type === "media_insert" && marker.mediaInsert) {
    const mi: MediaInsert = marker.mediaInsert;
    if (mi.kind === "photo") {
      try {
        return { kind: "canvas", canvas: await renderPhotoSlide(mi.blobUrl, exportWidth, exportHeight) };
      } catch {
        return { kind: "canvas", canvas: renderMissingMediaPlaceholder(mi.fileName, exportWidth, exportHeight) };
      }
    } else {
      // clip — load video off-screen
      try {
        const vid = await loadClipVideo(mi.blobUrl);
        const durationSec = isFinite(vid.duration) && vid.duration > 0 ? vid.duration : (marker.holdSec ?? DEFAULT_HOLD_SEC);
        return { kind: "clip", video: vid, durationSec };
      } catch {
        return { kind: "canvas", canvas: renderMissingMediaPlaceholder(mi.fileName, exportWidth, exportHeight) };
      }
    }
  }
  if (marker.type === "screen_cut" && marker.screenInsert) {
    return { kind: "canvas", canvas: await renderScreenCutSlide(marker.screenInsert, scale) };
  }
  // "analysis" (and undefined — backward compat)
  return { kind: "canvas", canvas: await renderExhibitSlide(marker, index, caseTitle, scale) };
}

export interface ExportOptions {
  videoUrl: string;
  durationSec: number;
  markers: ExhibitMarker[];
  caseTitle: string;
  width: number;
  height: number;
  fps: number;
  prefer: "mp4" | "webm";
  includeAudio: boolean;
  onProgress?: (fraction: number) => void;
  onStage?: (label: string) => void;
  shouldCancel?: () => boolean;
}

export interface ExportResult {
  blob: Blob;
  ext: string;
  mimeType: string;
  cancelled: boolean;
}

export async function exportExhibitVideo(opts: ExportOptions): Promise<ExportResult> {
  const { videoUrl, markers, caseTitle, width, height, fps, prefer, includeAudio, onProgress, onStage, shouldCancel } = opts;

  if (typeof MediaRecorder === "undefined") throw new Error("This browser cannot record video.");
  const mimeType = pickMimeType(prefer, includeAudio);
  if (!mimeType) throw new Error("This browser has no supported video recording format.");

  const sorted = [...markers].sort((a, b) => a.timestamp - b.timestamp);

  // 1) Pre-render slides and load clip videos (first ~15% of progress)
  onStage?.("Preparing slides and clips…");
  const slideScale = height / 1080;
  const slots: Slot[] = [];
  const clipVideos: HTMLVideoElement[] = []; // tracked for cleanup in finally
  for (let i = 0; i < sorted.length; i++) {
    if (shouldCancel?.()) return emptyCancelled(mimeType);
    const slot = await getMarkerSlot(sorted[i], i + 1, caseTitle, slideScale, width, height);
    slots.push(slot);
    if (slot.kind === "clip") clipVideos.push(slot.video);
    onProgress?.(((i + 1) / Math.max(sorted.length, 1)) * 0.15);
  }

  // 2) Hidden source video element (separate from the preview player)
  const video = document.createElement("video");
  video.src = videoUrl;
  video.crossOrigin = "anonymous";
  video.playsInline = true;
  video.preload = "auto";
  video.muted = !includeAudio; // muting also mutes the captured audio track, so only mute when audio is off
  video.style.cssText = "position:fixed;left:-10000px;top:0;width:320px;height:180px;opacity:0;pointer-events:none;";
  document.body.appendChild(video);

  let canvasStream: MediaStream | null = null;
  let audioTracks: MediaStreamTrack[] = [];
  const cleanup = () => {
    try { video.pause(); } catch { /* noop */ }
    try { audioTracks.forEach(t => t.stop()); } catch { /* noop */ }
    try { canvasStream?.getTracks().forEach(t => t.stop()); } catch { /* noop */ }
    try { document.body.removeChild(video); } catch { /* noop */ }
    clipVideos.forEach(v => { try { v.pause(); v.src = ""; } catch {} try { document.body.removeChild(v); } catch {} });
  };

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Could not load the video for export."));
    });
    if (shouldCancel?.()) return emptyCancelled(mimeType);

    const duration = (isFinite(video.duration) && video.duration > 0) ? video.duration : opts.durationSec;

    // 3) Canvas + video stream
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available.");
    canvasStream = canvas.captureStream(fps);

    // 4) Begin playback BEFORE recording so audio tracks exist; fall back to muted if blocked
    try { video.currentTime = 0; } catch { /* noop */ }
    let playing = false;
    try { await video.play(); playing = true; }
    catch {
      video.muted = true; // audio will be dropped, but the export still succeeds
      try { await video.play(); playing = true; } catch { /* noop */ }
    }
    if (!playing) throw new Error("The browser blocked video playback, so it can't be recorded. Tap the video once, then try exporting again.");

    // 5) Capture source audio now that playback is live (only if still unmuted)
    if (includeAudio && !video.muted) {
      try {
        const v = video as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
        const vs = v.captureStream ? v.captureStream() : v.mozCaptureStream ? v.mozCaptureStream() : null;
        audioTracks = vs?.getAudioTracks?.() ?? [];
      } catch { /* audio best-effort */ }
    }

    // 6) Recorder over the composited canvas + captured audio
    const stream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrateFor(height, fps) });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise<void>(res => { recorder.onstop = () => res(); });
    recorder.start(250);
    onStage?.("Recording… (runs in real time)");

    // Use actual clip durations for totalHold (photos use holdSec as usual)
    const totalHold = slots.reduce((sum, slot, i) =>
      sum + (slot.kind === "clip" ? slot.durationSec : (sorted[i].holdSec ?? DEFAULT_HOLD_SEC)), 0);
    const totalDur = Math.max(0.001, duration + totalHold);
    const STALL_MS = 8000; // watchdog: if currentTime wedges, terminate rather than hang
    let cancelled = false;

    const drawVideoFrame = () => {
      ctx!.fillStyle = "#000"; ctx!.fillRect(0, 0, width, height);
      const vw = video.videoWidth || 16, vh = video.videoHeight || 9;
      const s = Math.min(width / vw, height / vh);
      ctx!.drawImage(video, (width - vw * s) / 2, (height - vh * s) / 2, vw * s, vh * s);
    };

    const drawClipFrame = (clipVid: HTMLVideoElement) => {
      ctx!.fillStyle = "#000"; ctx!.fillRect(0, 0, width, height);
      const cw = clipVid.videoWidth || 16, ch = clipVid.videoHeight || 9;
      const s = Math.min(width / cw, height / ch);
      ctx!.drawImage(clipVid, (width - cw * s) / 2, (height - ch * s) / 2, cw * s, ch * s);
    };

    await new Promise<void>((resolve) => {
      let idx = 0;
      let mode: "video" | "hold" | "clip" = "video";
      let holdStart = 0;
      let holdDoneSec = 0;
      let ended = false;
      let raf = 0;
      let lastT = -1;
      let lastAdvance = performance.now();
      // Clip-mode state
      let currentClip: Extract<Slot, { kind: "clip" }> | null = null;
      let clipEnded = false;
      let clipAudioTracks: MediaStreamTrack[] = [];

      const finish = () => {
        if (raf) cancelAnimationFrame(raf);
        try { recorder.stop(); } catch { /* noop */ }
      };

      /** Tear down clip mode and advance to next marker / resume main video. */
      const exitClip = () => {
        if (currentClip) {
          if (includeAudio) {
            clipAudioTracks.forEach(t => { try { stream.removeTrack(t); } catch {} });
            clipAudioTracks = [];
            audioTracks.forEach(t => { try { stream.addTrack(t); } catch {} });
            currentClip.video.muted = true;
          }
          try { currentClip.video.pause(); } catch {}
          holdDoneSec += currentClip.durationSec;
          currentClip = null; clipEnded = false;
        }
        idx++; mode = "video"; lastAdvance = performance.now();
        if (!ended) video.play().catch(() => {});
      };

      /** Transition from video mode into hold or clip depending on the slot type. */
      const enterHoldOrClip = () => {
        try { video.pause(); } catch {}
        holdStart = performance.now();
        const slot = slots[idx];
        if (slot.kind === "clip") {
          mode = "clip"; currentClip = slot; clipEnded = false;
          if (includeAudio) {
            audioTracks.forEach(t => { try { stream.removeTrack(t); } catch {} });
            try {
              const cv = slot.video as HTMLVideoElement & { captureStream?(): MediaStream; mozCaptureStream?(): MediaStream };
              const cs = cv.captureStream?.() ?? cv.mozCaptureStream?.() ?? null;
              clipAudioTracks = cs?.getAudioTracks?.() ?? [];
              clipAudioTracks.forEach(t => { try { stream.addTrack(t); } catch {} });
              slot.video.muted = false;
            } catch { /* audio best-effort */ }
          }
          slot.video.currentTime = 0;
          slot.video.onended = () => { clipEnded = true; };
          slot.video.play().catch(() => {});
        } else {
          mode = "hold";
        }
      };

      const frame = () => {
        if (shouldCancel?.()) { cancelled = true; finish(); return; }

        if (mode === "video") {
          drawVideoFrame();
          const t = video.currentTime;
          if (t > lastT + 0.001) { lastT = t; lastAdvance = performance.now(); }
          else if (!ended && performance.now() - lastAdvance > STALL_MS) { ended = true; }

          if (idx < sorted.length && (t >= sorted[idx].timestamp || ended)) {
            enterHoldOrClip();
          } else if (ended && idx >= sorted.length) { finish(); return; }
          onProgress?.(Math.min(0.999, 0.15 + (Math.min(t, duration) + holdDoneSec) / totalDur * 0.85));

        } else if (mode === "hold") {
          const slot = slots[idx] as Extract<Slot, { kind: "canvas" }>;
          ctx!.drawImage(slot.canvas, 0, 0, width, height);
          const holdSec = sorted[idx].holdSec ?? DEFAULT_HOLD_SEC;
          const elapsed = (performance.now() - holdStart) / 1000;
          if (elapsed >= holdSec) {
            holdDoneSec += holdSec; idx++; mode = "video";
            lastAdvance = performance.now();
            if (!ended) video.play().catch(() => {});
          }
          onProgress?.(Math.min(0.999, 0.15 + (Math.min(video.currentTime, duration) + holdDoneSec + Math.min(elapsed, holdSec)) / totalDur * 0.85));

        } else if (mode === "clip" && currentClip) {
          // Draw live clip frames; exit when clip fires onended or after 1 s grace past duration
          drawClipFrame(currentClip.video);
          const elapsed = (performance.now() - holdStart) / 1000;
          if (clipEnded || elapsed >= currentClip.durationSec + 1) { exitClip(); }
          onProgress?.(Math.min(0.999, 0.15 + (Math.min(video.currentTime, duration) + holdDoneSec + Math.min(elapsed, currentClip?.durationSec ?? 0)) / totalDur * 0.85));
        }
        raf = requestAnimationFrame(frame);
      };

      video.onended = () => {
        ended = true;
        if (mode === "video" && idx >= sorted.length) finish();
      };

      stopped.then(() => resolve());
      lastAdvance = performance.now();
      raf = requestAnimationFrame(frame);
    });

    await stopped;
    onProgress?.(1);
    const ext = mimeType.includes("mp4") ? "mp4" : "webm";
    return { blob: new Blob(chunks, { type: mimeType }), ext, mimeType, cancelled };
  } finally {
    cleanup();
  }
}

function emptyCancelled(mimeType: string): ExportResult {
  const ext = mimeType.includes("mp4") ? "mp4" : "webm";
  return { blob: new Blob([], { type: mimeType }), ext, mimeType, cancelled: true };
}

import React, { useRef, useState } from "react";
import { ChevronRight, ArrowLeft, FileAudio, Loader2, AlertCircle, Check, X, Play } from "lucide-react";
import type { HLCase, WitnessExamination, VideoChunk, TranscriptSegment, SuggestedMoment } from "../../types";
import { aiApi } from "../../lib/aiApi";
import { api } from "../../lib/api";

const ORANGE = "#d9711f";

// Source audio is chunked before ever reaching the transcription API, both
// to stay comfortably under OpenAI's 25MB per-request limit and so progress
// is visible (and a failed chunk doesn't waste everything before it). 20
// minutes of speech-only webm/opus at 96kbps is roughly 14MB — safe margin.
const CHUNK_SEC = 1200;
// Real-time-only capture is the actual browser constraint here (there's no
// way to pull audio out of a <video> element faster than it plays) — 4x is
// a conservative speed every mainstream browser supports reliably, traded
// against transcription quality holding up at higher speeds.
const PLAYBACK_RATE = 4;

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function saveCase(c: HLCase, onUpdateCase: (c: HLCase) => void) {
  onUpdateCase(c);
  api.cases.upsert(c.id, c.title, c.workflowStage, c as unknown as Record<string, unknown>).catch(() => {});
}

/** Records exactly [startSec, endSec) of a loaded video's audio track as a
 *  webm blob. Requires real (sped-up) playback — there's no way to extract
 *  audio from a <video> element instantly. */
function recordAudioSegment(video: HTMLVideoElement, startSec: number, endSec: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      const captureStream = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream;
      const stream = captureStream?.call(video);
      if (!stream) { reject(new Error("This browser can't capture audio from video playback.")); return; }
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) { reject(new Error("No audio track found in this video.")); return; }

      const recorder = new MediaRecorder(new MediaStream(audioTracks), { mimeType: "audio/webm", audioBitsPerSecond: 96_000 });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onerror = () => reject(new Error("Recording failed for this segment."));
      recorder.onstop = () => { video.pause(); resolve(new Blob(chunks, { type: "audio/webm" })); };

      recorder.start();
      video.playbackRate = PLAYBACK_RATE;
      video.play().catch(reject);

      const checkDone = () => {
        if (video.currentTime >= endSec || video.ended) {
          recorder.stop();
        } else {
          requestAnimationFrame(checkDone);
        }
      };
      requestAnimationFrame(checkDone);
    };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = startSec;
  });
}

interface Props {
  cases: HLCase[];
  onUpdateCase: (c: HLCase) => void;
  onBack: () => void;
}

type Phase = "setup" | "extracting" | "matching" | "review";

export default function TranscribeAndSuggestView({ cases, onUpdateCase, onBack }: Props) {
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [phase, setPhase] = useState<Phase>("setup");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [suggestedMoments, setSuggestedMoments] = useState<SuggestedMoment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const selectedCase = cases.find(c => c.id === selectedCaseId) ?? null;
  const examinationsWithAnswers = (selectedCase?.witnessExaminations ?? []).filter(e =>
    e.questions.some(q => q.yesNo || q.answerText?.trim()),
  );
  const selectedExam = examinationsWithAnswers.find(e => e.id === selectedExamId) ?? null;

  function handleVideoPick(file: File) {
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setError(null);
  }

  async function start() {
    if (!videoFile || !videoRef.current || !selectedCase || !selectedExam || duration === 0) return;
    const video = videoRef.current;
    setPhase("extracting");
    setError(null);
    const totalChunks = Math.max(1, Math.ceil(duration / CHUNK_SEC));
    setProgress({ done: 0, total: totalChunks });

    const allSegments: TranscriptSegment[] = [];
    try {
      for (let i = 0; i < totalChunks; i++) {
        const chunkStart = i * CHUNK_SEC;
        const chunkEnd = Math.min(duration, chunkStart + CHUNK_SEC);
        const blob = await recordAudioSegment(video, chunkStart, chunkEnd);
        const res = await aiApi.transcribeAudioChunk(blob, chunkStart, `chunk-${i}.webm`);
        allSegments.push(...res.segments);
        setProgress({ done: i + 1, total: totalChunks });
      }
      setSegments(allSegments);

      setPhase("matching");
      const matchRes = await aiApi.matchTranscriptMoments({
        witnessExaminationId: selectedExam.id,
        witnessName: selectedExam.witnessName,
        questions: selectedExam.questions,
        segments: allSegments,
      });
      setSuggestedMoments(matchRes.suggestedMoments);

      const project = selectedCase.studioProject ?? {
        id: crypto.randomUUID(), caseId: selectedCase.id, videoFileName: videoFile.name,
        markers: [], createdAt: Date.now(), updatedAt: Date.now(),
      };
      saveCase({
        ...selectedCase,
        studioProject: {
          ...project,
          transcript: {
            segments: allSegments,
            fullText: allSegments.map(s => s.text).join(" "),
            generatedAt: Date.now(),
            suggestedMoments: matchRes.suggestedMoments,
          },
          updatedAt: Date.now(),
        },
      }, onUpdateCase);

      setPhase("review");
    } catch (err) {
      setError((err as Error).message || "Something went wrong during transcription — try again.");
      setPhase("setup");
    }
  }

  function respondToMoment(moment: SuggestedMoment, status: "accepted" | "rejected") {
    if (!selectedCase || !selectedExam) return;
    setSuggestedMoments(prev => prev.map(m => (m.id === moment.id ? { ...m, status } : m)));

    if (status === "accepted") {
      const qa = selectedExam.questions.find(q => q.id === moment.qaEntryId);
      const label = qa ? [qa.question, qa.yesNo ? qa.yesNo.toUpperCase() : null, qa.answerText].filter(Boolean).join("\n") : "";
      const newChunk: VideoChunk = { id: crypto.randomUUID(), start: moment.start, end: moment.end, label };
      const project = selectedCase.studioProject;
      if (!project) return;
      saveCase({
        ...selectedCase,
        studioProject: {
          ...project,
          chunks: [...(project.chunks ?? []), newChunk],
          transcript: project.transcript
            ? { ...project.transcript, suggestedMoments: (project.transcript.suggestedMoments ?? []).map(m => (m.id === moment.id ? { ...m, status } : m)) }
            : project.transcript,
          updatedAt: Date.now(),
        },
      }, onUpdateCase);
    } else {
      const project = selectedCase.studioProject;
      if (!project) return;
      saveCase({
        ...selectedCase,
        studioProject: {
          ...project,
          transcript: project.transcript
            ? { ...project.transcript, suggestedMoments: (project.transcript.suggestedMoments ?? []).map(m => (m.id === moment.id ? { ...m, status } : m)) }
            : project.transcript,
        },
      }, onUpdateCase);
    }
  }

  function previewMoment(moment: SuggestedMoment) {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = 1;
    v.currentTime = moment.start;
    v.play().catch(() => {});
  }

  // ── Case list ──────────────────────────────────────────────────────────────
  if (!selectedCase) {
    const withExams = cases.filter(c => (c.witnessExaminations ?? []).some(e => e.questions.some(q => q.yesNo || q.answerText?.trim())));
    return (
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 20px 120px" }}>
          <button onClick={onBack}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 18, display: "flex", alignItems: "center", gap: 6, color: "#666", fontSize: 13, fontWeight: 700 }}>
            <ArrowLeft size={15} /> Tools
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: `${ORANGE}16`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <FileAudio size={19} color={ORANGE} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>Transcribe &amp; Suggest Moments</div>
          </div>
          <div style={{ color: "#666", fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>
            Feed in the real footage from an examination you already captured with Witness Examination — this transcribes it and finds where each answered question actually appears, instead of scrubbing hours of video by hand.
          </div>

          {withExams.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 12, paddingTop: 30 }}>
              <FileAudio size={40} color="#1e1e1e" />
              <div style={{ fontSize: 14, color: "#555", fontWeight: 700 }}>No answered examinations yet</div>
              <div style={{ fontSize: 12, color: "#444", maxWidth: 280, lineHeight: 1.5 }}>
                Capture at least one answered question with Witness Examination first — this tool needs something real to match against.
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>SELECT A CASE</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {withExams.map(c => (
                  <button key={c.id} onClick={() => setSelectedCaseId(c.id)}
                    style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, padding: "16px", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, width: "100%" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: "#fff" }}>{c.title}</div>
                    </div>
                    <ChevronRight size={16} color="#333" style={{ flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Examination picker ───────────────────────────────────────────────────────
  if (!selectedExam) {
    return (
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 20px 120px" }}>
          <button onClick={() => setSelectedCaseId(null)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 18, display: "flex", alignItems: "center", gap: 6, color: "#666", fontSize: 13, fontWeight: 700 }}>
            <ArrowLeft size={15} /> All cases
          </button>
          <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 18 }}>{selectedCase.title}</div>
          <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>SELECT AN EXAMINATION</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {examinationsWithAnswers.map(exam => {
              const answered = exam.questions.filter(q => q.yesNo || q.answerText?.trim()).length;
              return (
                <button key={exam.id} onClick={() => setSelectedExamId(exam.id)}
                  style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, padding: "16px", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, width: "100%" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: "#fff" }}>{exam.witnessName}</div>
                    <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{answered} answered question{answered !== 1 ? "s" : ""}</div>
                  </div>
                  <ChevronRight size={16} color="#333" style={{ flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Video pick + run + review ─────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "20px 20px 140px" }}>
        <button onClick={() => { if (phase === "setup") setSelectedExamId(null); }} disabled={phase !== "setup"}
          style={{ background: "none", border: "none", cursor: phase === "setup" ? "pointer" : "not-allowed", padding: 0, marginBottom: 18, display: "flex", alignItems: "center", gap: 6, color: "#666", fontSize: 13, fontWeight: 700, opacity: phase === "setup" ? 1 : 0.5 }}>
          <ArrowLeft size={15} /> {selectedCase.title}
        </button>

        <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 2 }}>{selectedExam.witnessName}</div>
        <div style={{ fontSize: 12, color: "#666", marginBottom: 18 }}>
          Matching against {selectedExam.questions.filter(q => q.yesNo || q.answerText?.trim()).length} answered question(s)
        </div>

        {videoUrl && (
          <video
            ref={videoRef}
            src={videoUrl}
            onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
            muted={phase === "extracting"}
            controls={phase === "review"}
            style={{ width: "100%", borderRadius: 12, marginBottom: 16, background: "#000", maxHeight: 240 }}
          />
        )}

        {phase === "setup" && (
          <>
            {!videoFile ? (
              <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "30px 20px", border: `1.5px dashed ${ORANGE}55`, borderRadius: 14, cursor: "pointer" }}>
                <FileAudio size={28} color={ORANGE} />
                <div style={{ fontSize: 13, color: "#999", fontWeight: 700 }}>Choose the video file</div>
                <input type="file" accept="video/*" style={{ display: "none" }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleVideoPick(f); }} />
              </label>
            ) : (
              <>
                <div style={{ fontSize: 13, color: "#999", marginBottom: 4 }}>{videoFile.name}</div>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 16 }}>{duration > 0 ? formatTime(duration) : "Loading…"}</div>
                {error && (
                  <div style={{ background: "#2a1010", border: "1px solid #4a1515", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#ff8080", marginBottom: 16 }}>
                    {error}
                  </div>
                )}
                <button onClick={start} disabled={duration === 0}
                  style={{ width: "100%", background: duration > 0 ? ORANGE : "#2a2a2a", border: "none", borderRadius: 14, padding: "14px", fontSize: 14, fontWeight: 800, color: duration > 0 ? "#000" : "#666", cursor: duration > 0 ? "pointer" : "default" }}>
                  Start Transcription
                </button>
                <div style={{ fontSize: 11, color: "#444", marginTop: 10, lineHeight: 1.5 }}>
                  This plays through the audio at 4x speed to extract it — a real recording, not instant. A {duration > 0 ? formatTime(duration) : "…"}-long video takes roughly {duration > 0 ? formatTime(duration / 4) : "…"} to process.
                </div>
              </>
            )}
          </>
        )}

        {phase === "extracting" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <Loader2 size={28} color={ORANGE} className="animate-spin" style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 14, color: "#ccc", fontWeight: 700, marginBottom: 6 }}>
              Transcribing chunk {progress.done + 1} of {progress.total}…
            </div>
            <div style={{ width: "100%", height: 6, background: "#1e1e1e", borderRadius: 3, overflow: "hidden", marginTop: 10 }}>
              <div style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%`, height: "100%", background: ORANGE, transition: "width 0.3s ease" }} />
            </div>
            <div style={{ fontSize: 11, color: "#555", marginTop: 10 }}>Stay on this screen — leaving now interrupts it.</div>
          </div>
        )}

        {phase === "matching" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <Loader2 size={28} color={ORANGE} className="animate-spin" style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 14, color: "#ccc", fontWeight: 700 }}>Matching questions to the transcript…</div>
          </div>
        )}

        {phase === "review" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
            <div style={{ fontSize: 13, color: "#999", marginBottom: 4 }}>
              {suggestedMoments.length === 0
                ? "No confident matches found — the transcript may not clearly contain these exchanges."
                : `${suggestedMoments.length} suggested moment${suggestedMoments.length !== 1 ? "s" : ""} — review each before it becomes a real moment.`}
            </div>
            {suggestedMoments.map(m => {
              const qa = selectedExam.questions.find(q => q.id === m.qaEntryId);
              return (
                <div key={m.id} style={{ background: "#0d0d0d", border: `1px solid ${m.status === "accepted" ? "#22c55e55" : m.status === "rejected" ? "#2a2a2a" : `${ORANGE}44`}`, borderRadius: 12, padding: 14, opacity: m.status === "rejected" ? 0.5 : 1 }}>
                  <div style={{ fontSize: 10, color: ORANGE, fontWeight: 800, marginBottom: 6 }}>
                    {formatTime(m.start)}–{formatTime(m.end)}
                  </div>
                  {qa && <div style={{ fontSize: 13.5, color: "#eee", lineHeight: 1.5, marginBottom: 6 }}>{qa.question}</div>}
                  <div style={{ fontSize: 12, color: "#7ab0e0", lineHeight: 1.5, marginBottom: 10 }}>{m.reason}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => previewMoment(m)}
                      style={{ flex: 1, background: "none", border: "1px solid #333", borderRadius: 10, padding: "8px", fontSize: 12, fontWeight: 700, color: "#999", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      <Play size={12} /> Preview
                    </button>
                    {m.status !== "accepted" && m.status !== "rejected" && (
                      <>
                        <button onClick={() => respondToMoment(m, "rejected")}
                          style={{ flex: 1, background: "none", border: "1px solid #333", borderRadius: 10, padding: "8px", fontSize: 12, fontWeight: 700, color: "#999", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                          <X size={12} /> Skip
                        </button>
                        <button onClick={() => respondToMoment(m, "accepted")}
                          style={{ flex: 1, background: ORANGE, border: "none", borderRadius: 10, padding: "8px", fontSize: 12, fontWeight: 800, color: "#000", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                          <Check size={12} /> Accept
                        </button>
                      </>
                    )}
                    {m.status === "accepted" && (
                      <div style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 700, color: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        <Check size={12} /> Added to moments
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {error && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#2a1010", border: "1px solid #4a1515", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#ff8080" }}>
                <AlertCircle size={13} /> {error}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

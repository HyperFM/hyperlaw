import { useState, useRef, useEffect, useCallback, MutableRefObject } from "react";
import { HLCase, StorySnapshot } from "../../types";
import { WorkflowStepper } from "../../components/WorkflowStepper";
import { WhyThisMatters } from "../../components/WhyThisMatters";
import { Mic, ChevronRight, Info, RotateCcw, X } from "lucide-react";

const ORANGE = "#f45d01";
const BG = "#0a0908";
const LINE = "#1e1e1e";
const PAPER = "#f4efe8";

const MAX_HISTORY = 10;
const SNAPSHOT_INTERVAL_MS = 30_000; // save a version snapshot every 30s

interface Props {
  hlCase: HLCase;
  onUpdate: (c: HLCase) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StoryView({ hlCase, onUpdate, onNext, onBack }: Props) {
  const [story, setStory] = useState(hlCase.story ?? "");
  const [isListening, setIsListening] = useState(false);
  const [micError, setMicError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Stable refs — always hold latest values without recreating callbacks
  const hlCaseRef = useRef(hlCase) as MutableRefObject<HLCase>;
  hlCaseRef.current = hlCase;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  // Refs for auto-save debounce + version snapshot throttle
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnapshotAt = useRef<number>(Date.now());
  const dictationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const history = hlCase.storyHistory ?? [];

  // Stable scheduler — reads latest hlCase/onUpdate via refs, no hlCase in deps
  const scheduleAutoSave = useCallback((newStory: string) => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      const currentCase = hlCaseRef.current;
      // No-op if story hasn't actually changed (avoids redundant saves)
      if (newStory === currentCase.story) return;
      const now = Date.now();
      const timeSinceSnapshot = now - lastSnapshotAt.current;
      const prevHistory = currentCase.storyHistory ?? [];

      let nextHistory = prevHistory;
      if (timeSinceSnapshot >= SNAPSHOT_INTERVAL_MS && newStory.trim().length > 0) {
        const snap: StorySnapshot = { snapshot: newStory, savedAt: now };
        nextHistory = [snap, ...prevHistory].slice(0, MAX_HISTORY);
        lastSnapshotAt.current = now;
      }

      onUpdateRef.current({
        ...currentCase,
        story: newStory,
        storyHistory: nextHistory,
        workflowStage: currentCase.workflowStage === "parties" || currentCase.workflowStage === "court" || currentCase.workflowStage === "story"
          ? "story" : currentCase.workflowStage,
      });
    }, 800);
  }, []); // intentionally stable — reads latest via refs

  useEffect(() => {
    scheduleAutoSave(story);
  }, [story, scheduleAutoSave]);

  // Cleanup: stop any active recognition, clear all timers on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      if (dictationTimeoutRef.current) clearTimeout(dictationTimeoutRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* ignore */ }
        recognitionRef.current = null;
      }
    };
  }, []);

  // ── Web Speech API ──────────────────────────────────────────────────────────
  const SpeechRecognition =
    typeof window !== "undefined"
      ? ((window as unknown as Record<string, unknown>).SpeechRecognition as SpeechRecognitionStatic | undefined) ??
        ((window as unknown as Record<string, unknown>).webkitSpeechRecognition as SpeechRecognitionStatic | undefined)
      : undefined;

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  function toggleDictation() {
    if (!SpeechRecognition) {
      setMicError("Your browser doesn't support speech recognition. Try Chrome on desktop or the built-in keyboard dictation on your phone.");
      return;
    }
    if (isListening) {
      try { recognitionRef.current?.stop(); } catch {}
      recognitionRef.current = null;
      setIsListening(false);
      return;
    }
    setMicError("");
    setIsListening(true);
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    let finalTranscript = story;
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) { finalTranscript += (finalTranscript ? " " : "") + result[0].transcript; }
        else { interim += result[0].transcript; }
      }
      setStory(finalTranscript + (interim ? " " + interim : ""));
    };
    recognition.onerror = () => {
      recognitionRef.current = null; setIsListening(false);
      setMicError("Speech recognition stopped. Tap the microphone to try again.");
    };
    recognition.onend = () => {
      recognitionRef.current = null; setIsListening(false);
      setStory(finalTranscript);
    };
    recognition.start();
    // Safety timeout: stop after 5 min to prevent accidental indefinite capture
    if (dictationTimeoutRef.current) clearTimeout(dictationTimeoutRef.current);
    dictationTimeoutRef.current = setTimeout(() => {
      try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    }, 300_000);
  }

  function handleSubmit() {
    const trimmed = story.trim();
    if (!trimmed) return;
    // Save final snapshot on submit
    const now = Date.now();
    const snap: StorySnapshot = { snapshot: trimmed, savedAt: now };
    const nextHistory = [snap, ...(hlCase.storyHistory ?? [])].slice(0, MAX_HISTORY);
    onUpdate({ ...hlCase, story: trimmed, storyHistory: nextHistory, workflowStage: "timeline" });
    onNext();
  }

  function restoreVersion(snap: StorySnapshot) {
    setStory(snap.snapshot);
    setShowHistory(false);
  }

  function formatSnapTime(ms: number) {
    return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  const nicknameHints = hlCase.parties.map(p => `${p.nicknameEmoji} ${p.nickname} = ${p.firstName} ${p.lastName}`);
  const wordCount = story.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: BG, color: PAPER, minHeight: 0 }}>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "28px 20px 16px" }}>

          {/* Back */}
          <button onClick={onBack} style={{ background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer", padding: "0 0 20px", display: "flex", alignItems: "center", gap: 6 }}>
            ← Back to Court Selection
          </button>

          {/* Progress stepper */}
          <WorkflowStepper current="story" />

          {/* Header */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.5, marginBottom: 8 }}>Tell your story</div>
            <div style={{ color: "#666", fontSize: 14, lineHeight: 1.65 }}>
              Describe what happened in your own words — use the nicknames you assigned. Don't worry about legal language or order. Just tell it like you'd tell a friend.
            </div>
          </div>

          {/* Why this matters */}
          <WhyThisMatters>
            Your narrative is the raw material for everything that follows — the timeline, the legal claims, and the complaint. Courts value specificity: who did what, in what order, and what was said. Writing it out now, uncensored and complete, gives the AI the best foundation to work from.
          </WhyThisMatters>

          {/* Nickname reference card — sticky during dictation */}
          {nicknameHints.length > 0 && (
            <div style={{ background: "#0f0d0c", border: `1px solid ${LINE}`, borderRadius: 12, padding: "12px 16px", marginBottom: 20,
              ...(isListening ? { position: "sticky", top: 8, zIndex: 10, borderColor: `${ORANGE}44` } : {}),
            }}>
              <div style={{ fontSize: 11, color: "#555", fontWeight: 700, letterSpacing: 0.5, marginBottom: 8, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5 }}>
                <Info size={11} /> Your Nicknames {isListening && <span style={{ color: ORANGE, marginLeft: 4 }}>— use these while dictating</span>}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
                {nicknameHints.map((h, i) => (
                  <span key={i} style={{ fontSize: 12, color: "#888" }}>{h}</span>
                ))}
              </div>
            </div>
          )}

          {/* Microphone button */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
            <button
              onClick={toggleDictation}
              style={{
                width: 80, height: 80, borderRadius: "50%",
                background: isListening ? `radial-gradient(circle, ${ORANGE}44, ${ORANGE}22)` : "#1a1815",
                border: `2px solid ${isListening ? ORANGE : "#2a2521"}`,
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: isListening ? `0 0 24px ${ORANGE}66, 0 0 48px ${ORANGE}33` : "none",
                transition: "all 0.3s ease",
                animation: isListening ? "micPulse 1.5s ease-in-out infinite" : "none",
              }}
              title={isListening ? "Tap to stop" : "Tap to start dictation"}
            >
              <Mic size={28} color={isListening ? ORANGE : "#555"} />
            </button>
          </div>

          <style>{`
            @keyframes micPulse {
              0%, 100% { box-shadow: 0 0 16px ${ORANGE}55, 0 0 32px ${ORANGE}22; }
              50% { box-shadow: 0 0 28px ${ORANGE}88, 0 0 56px ${ORANGE}44; }
            }
          `}</style>

          {isListening && (
            <div style={{ textAlign: "center", fontSize: 13, color: ORANGE, marginBottom: 16, fontWeight: 700 }}>
              🎤 Listening — speak naturally…
            </div>
          )}

          {micError && (
            <div style={{ color: "#f59e0b", fontSize: 13, marginBottom: 16, textAlign: "center", lineHeight: 1.5 }}>{micError}</div>
          )}

          {/* Text area */}
          <textarea
            ref={textareaRef}
            value={story}
            onChange={e => setStory(e.target.value)}
            placeholder={`Example: "Pickle grabbed my wrist while Fish stood nearby. Monster walked over and told Pickle to place me in handcuffs."\n\nWrite everything you remember. You can always edit later.`}
            style={{
              width: "100%", minHeight: 280, background: "#0f0d0c",
              border: `1px solid ${story.trim() ? "#2a3a2a" : "#1e1e1e"}`,
              borderRadius: 14, padding: "18px", color: PAPER,
              fontSize: 15, lineHeight: 1.75, fontFamily: "inherit",
              resize: "vertical", outline: "none", boxSizing: "border-box",
              transition: "border-color 0.2s",
            }}
          />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 12, color: "#333" }}>{wordCount} words</span>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {history.length > 0 && (
                <button onClick={() => setShowHistory(true)} style={{ background: "none", border: "none", color: "#555", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                  <RotateCcw size={12} /> Restore version
                </button>
              )}
              {story.trim() && (
                <button onClick={() => setStory("")} style={{ background: "none", border: "none", color: "#444", fontSize: 12, cursor: "pointer" }}>
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Tips */}
          <div style={{ background: "#0f0d0c", border: `1px solid ${LINE}`, borderRadius: 12, padding: "14px 16px", marginBottom: 8, fontSize: 13, color: "#555", lineHeight: 1.65 }}>
            <strong style={{ color: "#888", display: "block", marginBottom: 6 }}>Tips for a strong account:</strong>
            <ul style={{ margin: 0, padding: "0 0 0 18px" }}>
              <li>Use the nicknames you set up to refer to people</li>
              <li>Include what was said, by whom, and in what order</li>
              <li>Mention the date, time, and location if you remember them</li>
              <li>Don't edit yourself — include details that seem minor</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Sticky bottom buttons */}
      <div style={{
        background: BG, borderTop: `1px solid ${LINE}`,
        padding: "16px 20px",
        paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
        flexShrink: 0,
      }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <button
            onClick={handleSubmit}
            disabled={!story.trim()}
            style={{
              width: "100%",
              background: story.trim() ? `linear-gradient(90deg, ${ORANGE}, #ff8c00)` : "#1a1a1a",
              border: "none", borderRadius: 14, padding: "17px",
              color: story.trim() ? "#000" : "#444",
              fontSize: 16, fontWeight: 900, cursor: story.trim() ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "all 0.2s",
            }}>
            Build Timeline <ChevronRight size={18} />
          </button>
          <button onClick={onNext} style={{ width: "100%", background: "none", border: "none", color: "#444", fontSize: 13, cursor: "pointer", marginTop: 10, padding: "10px" }}>
            Skip for now
          </button>
        </div>
      </div>

      {/* Version history drawer */}
      {showHistory && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.85)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}
          onClick={e => { if (e.target === e.currentTarget) setShowHistory(false); }}>
          <div style={{ background: "#0f0d0c", borderRadius: "20px 20px 0 0", border: "1px solid #1e1e1e", borderBottom: "none", maxHeight: "70vh", display: "flex", flexDirection: "column", maxWidth: 600, width: "100%", margin: "0 auto" }}>
            <div style={{ padding: "18px 20px 12px", borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: ORANGE }}>Previous Versions</div>
              <button onClick={() => setShowHistory(false)} style={{ background: "none", border: "none", color: "#555", cursor: "pointer" }}><X size={18} /></button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 20px" }}>
              {history.map((snap, i) => (
                <div key={i} style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: "#555", fontWeight: 700, marginBottom: 6 }}>{formatSnapTime(snap.savedAt)}</div>
                  <div style={{ fontSize: 13, color: "#888", lineHeight: 1.6, marginBottom: 10 }}>
                    {snap.snapshot.slice(0, 200)}{snap.snapshot.length > 200 ? "…" : ""}
                  </div>
                  <button onClick={() => restoreVersion(snap)} style={{ background: ORANGE, border: "none", borderRadius: 8, padding: "8px 16px", color: "#000", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                    Restore this version
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Type stubs for Web Speech API (not in default TS lib)
interface SpeechRecognitionStatic { new(): SpeechRecognitionInstance; }
interface SpeechRecognitionInstance {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null;
  start(): void; stop(): void;
}
interface SpeechRecognitionEvent { resultIndex: number; results: SpeechRecognitionResultList; }
interface SpeechRecognitionResultList { length: number; [index: number]: SpeechRecognitionResult; }
interface SpeechRecognitionResult { isFinal: boolean; [index: number]: { transcript: string }; }

import { useState, useRef } from "react";
import { HLCase } from "../../types";
import { Mic, ChevronRight, Info } from "lucide-react";

const ORANGE = "#f45d01";
const BG = "#0a0908";
const LINE = "#1e1e1e";
const PAPER = "#f4efe8";

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Use Web Speech API if available (activates device's built-in dictation)
  const SpeechRecognition =
    typeof window !== "undefined"
      ? ((window as unknown as Record<string, unknown>).SpeechRecognition as SpeechRecognitionStatic | undefined) ??
        ((window as unknown as Record<string, unknown>).webkitSpeechRecognition as SpeechRecognitionStatic | undefined)
      : undefined;

  // Keep a ref to the active recognition instance so we can stop it on demand
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  function toggleDictation() {
    if (!SpeechRecognition) {
      setMicError("Your browser doesn't support speech recognition. Try Chrome on desktop or the built-in keyboard dictation on your phone.");
      return;
    }

    // Stop the active recognition instance
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
        if (result.isFinal) {
          finalTranscript += (finalTranscript ? " " : "") + result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      setStory(finalTranscript + (interim ? " " + interim : ""));
    };

    recognition.onerror = () => {
      recognitionRef.current = null;
      setIsListening(false);
      setMicError("Speech recognition stopped. Tap the microphone to try again.");
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
      setStory(finalTranscript);
    };

    recognition.start();

    // Safety stop after 5 minutes
    setTimeout(() => {
      try { recognitionRef.current?.stop(); } catch {}
    }, 300_000);
  }

  function handleSubmit() {
    const trimmed = story.trim();
    if (!trimmed) return;
    onUpdate({
      ...hlCase,
      story: trimmed,
      workflowStage: "timeline",
    });
    onNext();
  }

  // Party nickname hints
  const nicknameHints = hlCase.parties.map(p =>
    `${p.nicknameEmoji} ${p.nickname} = ${p.firstName} ${p.lastName}`
  );

  return (
    <div style={{ flex: 1, overflowY: "auto", background: BG, color: PAPER }}>
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "28px 20px 120px" }}>

        <button onClick={onBack} style={{ background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer", padding: "0 0 20px", display: "flex", alignItems: "center", gap: 6 }}>
          ← Back to Court Selection
        </button>

        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, color: ORANGE, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8, textTransform: "uppercase" }}>Phase 3 of 4</div>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.5, marginBottom: 8 }}>Tell your story</div>
          <div style={{ color: "#666", fontSize: 14, lineHeight: 1.65 }}>
            Describe what happened in your own words — use the nicknames you assigned. Don't worry about legal language or order. Just tell it like you'd tell a friend.
          </div>
        </div>

        {/* Nickname reference card */}
        {nicknameHints.length > 0 && (
          <div style={{ background: "#0f0d0c", border: `1px solid ${LINE}`, borderRadius: 12, padding: "12px 16px", marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: "#555", fontWeight: 700, letterSpacing: 0.5, marginBottom: 8, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5 }}>
              <Info size={11} /> Your Nicknames
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

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, marginBottom: 24 }}>
          <span style={{ fontSize: 12, color: "#333" }}>
            {story.trim().split(/\s+/).filter(Boolean).length} words
          </span>
          {story.trim() && (
            <button onClick={() => setStory("")} style={{ background: "none", border: "none", color: "#444", fontSize: 12, cursor: "pointer" }}>
              Clear
            </button>
          )}
        </div>

        {/* Instructions */}
        <div style={{ background: "#0f0d0c", border: `1px solid ${LINE}`, borderRadius: 12, padding: "14px 16px", marginBottom: 24, fontSize: 13, color: "#555", lineHeight: 1.65 }}>
          <strong style={{ color: "#888", display: "block", marginBottom: 6 }}>Tips for a strong account:</strong>
          <ul style={{ margin: 0, padding: "0 0 0 18px" }}>
            <li>Use the nicknames you set up to refer to people</li>
            <li>Include what was said, by whom, and in what order</li>
            <li>Mention the date, time, and location if you remember them</li>
            <li>Don't edit yourself — include details that seem minor</li>
          </ul>
        </div>

        {/* Submit */}
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

        <button onClick={onNext} style={{ width: "100%", background: "none", border: "none", color: "#444", fontSize: 13, cursor: "pointer", marginTop: 12, padding: "10px" }}>
          Skip for now
        </button>
      </div>
    </div>
  );
}

// Type stubs for Web Speech API (not in default TS lib)
interface SpeechRecognitionStatic {
  new(): SpeechRecognitionInstance;
}
interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: { transcript: string };
}

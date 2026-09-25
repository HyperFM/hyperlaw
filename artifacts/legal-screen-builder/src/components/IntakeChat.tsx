import { useEffect, useRef, useState } from "react";
import { X, Send, Loader2, ShieldCheck } from "lucide-react";
import { aiApi } from "../lib/aiApi";
import { mergeEvents, mergeParties } from "../lib/intakeDedupe";

const ORANGE = "#d9711f";

export interface IntakeParty { name: string; role?: string; isOfficial?: boolean; agency?: string | null }
export interface IntakeEvent { when?: string | null; what: string }
export interface IntakeResult { parties: IntakeParty[]; events: IntakeEvent[]; court: string | null; story: string }

type Msg = { role: "user" | "assistant"; content: string };
interface Draft { messages: Msg[]; parties: IntakeParty[]; events: IntakeEvent[]; court: string | null; savedAt: number }

const OPENING = "You can start by telling me everything that happened, in your own words. I'll follow up with questions as I need them to organize your case. Take your time.";
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const draftKey = (caseId: string) => `hl_intake_draft_${caseId}`;

function loadDraft(caseId: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(caseId));
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (Date.now() - d.savedAt > DRAFT_TTL_MS) { localStorage.removeItem(draftKey(caseId)); return null; }
    return d;
  } catch { return null; }
}

/**
 * Free intake chat. The transcript lives only in this browser (24h at most, wiped on finish);
 * what the AI captures is shown for confirmation and only confirmed items reach the case.
 */
export function IntakeChat({ caseId, onClose, onComplete }: {
  caseId: string;
  onClose: () => void;
  onComplete: (result: IntakeResult) => Promise<void>;
}) {
  const saved = loadDraft(caseId);
  const [accepted, setAccepted] = useState(!!saved);
  const [messages, setMessages] = useState<Msg[]>(saved?.messages ?? []);
  const [parties, setParties] = useState<IntakeParty[]>(saved?.parties ?? []);
  const [events, setEvents] = useState<IntakeEvent[]>(saved?.events ?? []);
  const [court, setCourt] = useState<string | null>(saved?.court ?? null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [ready, setReady] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [keepParty, setKeepParty] = useState<Record<number, boolean>>({});
  const [keepEvent, setKeepEvent] = useState<Record<number, boolean>>({});
  const [finishing, setFinishing] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, sending]);
  useEffect(() => {
    if (!accepted || messages.length === 0) return;
    try { localStorage.setItem(draftKey(caseId), JSON.stringify({ messages, parties, events, court, savedAt: Date.now() } satisfies Draft)); } catch { /* private mode */ }
  }, [accepted, messages, parties, events, court, caseId]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setError(null);
    setSending(true);
    try {
      // The opening prompt is the app's, not the AI's, so send only the real back-and-forth.
      const r = await aiApi.intakeChat(next, { parties: parties.map(p => p.name), events: events.map(e => e.what) });
      setMessages([...next, { role: "assistant", content: r.reply }]);
      if (r.new.parties.length) setParties(p => mergeParties(p, r.new.parties));
      if (r.new.events.length) setEvents(e => mergeEvents(e, r.new.events));
      if (r.new.court) setCourt(r.new.court);
      if (r.readyToWrapUp) setReady(true);
      if (r.messagesLeft === 0) setLimitReached(true);
    } catch (err) {
      const e = err as { code?: string; message?: string };
      if (e.code === "intake_limit") { setLimitReached(true); setError(e.message ?? null); }
      else setError(e.message || "Something went wrong — please try again.");
      setMessages(next); // keep what they wrote
    } finally {
      setSending(false);
    }
  }

  function startReview() {
    setKeepParty(Object.fromEntries(parties.map((_, i) => [i, true])));
    setKeepEvent(Object.fromEntries(events.map((_, i) => [i, true])));
    setReviewing(true);
  }

  async function confirm() {
    setFinishing(true);
    setError(null);
    try {
      const story = messages.filter(m => m.role === "user").map(m => m.content).join("\n\n");
      await onComplete({
        parties: parties.filter((_, i) => keepParty[i]),
        events: events.filter((_, i) => keepEvent[i]),
        court,
        story,
      });
      try { localStorage.removeItem(draftKey(caseId)); } catch { /* ignore */ }
    } catch (err) {
      setError((err as Error).message || "Couldn't save — please try again.");
      setFinishing(false);
    }
  }

  const shell = (children: React.ReactNode) => (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "#0a0a0a", display: "flex", flexDirection: "column", paddingTop: "env(safe-area-inset-top)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #161616", flexShrink: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: "#eee" }}>Tell us what happened</div>
        <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }}><X size={20} color="#777" /></button>
      </div>
      {children}
    </div>
  );

  // ── 1. Disclaimer first, before anything is typed ──
  if (!accepted) {
    return shell(
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 22px" }}>
        <ShieldCheck size={34} color={ORANGE} />
        <div style={{ fontSize: 20, fontWeight: 800, color: "#eee", margin: "14px 0 10px" }}>Before you start</div>
        <div style={{ fontSize: 14.5, color: "#bbb", lineHeight: 1.65 }}>
          This is free. You can tell your story in your own words, and I'll ask only the questions I need to organize your case.
          <br /><br />
          <b style={{ color: "#eee" }}>This chat won't be kept.</b> Once you finish, the messages are deleted. What I pull out of them — the people, the events, where it happened — is saved to your case only after you confirm it, and you'll find it all in your Index.
          <br /><br />
          I can't give legal advice, and I can't see your court's records. If this is hard to talk about, take breaks. If you're ever in crisis, you can call or text 988.
        </div>
        <button onClick={() => setAccepted(true)} style={{ marginTop: 26, width: "100%", background: ORANGE, color: "#0a0908", border: "none", borderRadius: 12, padding: "15px", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
          I understand — start
        </button>
      </div>
    );
  }

  // ── 3. Review what was captured ──
  if (reviewing) {
    const check = (on: boolean, set: () => void, label: string, sub?: string) => (
      <label style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 0", borderTop: "1px solid #1a1a1a", cursor: "pointer" }}>
        <input type="checkbox" checked={on} onChange={set} style={{ marginTop: 3, width: 18, height: 18, accentColor: ORANGE }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14.5, color: on ? "#eee" : "#666", lineHeight: 1.4, textDecoration: on ? "none" : "line-through" }}>{label}</div>
          {sub && <div style={{ fontSize: 12.5, color: "#777", marginTop: 2 }}>{sub}</div>}
        </div>
      </label>
    );
    return shell(
      <div style={{ flex: 1, overflowY: "auto", padding: "22px 20px 30px" }}>
        <div style={{ fontSize: 19, fontWeight: 800, color: "#eee", marginBottom: 6 }}>Is this right?</div>
        <div style={{ fontSize: 13.5, color: "#888", lineHeight: 1.55, marginBottom: 14 }}>Uncheck anything that's wrong. Only what's checked will be saved to your case.</div>

        {parties.length > 0 && <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: ORANGE, textTransform: "uppercase", marginTop: 8 }}>People</div>}
        {parties.map((p, i) => check(!!keepParty[i], () => setKeepParty(k => ({ ...k, [i]: !k[i] })), p.name, [p.role, p.agency].filter(Boolean).join(" · ") || undefined))}

        {events.length > 0 && <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: ORANGE, textTransform: "uppercase", marginTop: 18 }}>What happened</div>}
        {events.map((ev, i) => check(!!keepEvent[i], () => setKeepEvent(k => ({ ...k, [i]: !k[i] })), ev.what, ev.when || undefined))}

        {court && <div style={{ marginTop: 18, fontSize: 13.5, color: "#aaa" }}>Court / county mentioned: <b style={{ color: "#eee" }}>{court}</b></div>}
        {parties.length === 0 && events.length === 0 && <div style={{ fontSize: 14, color: "#777" }}>Nothing was captured yet. Your story is still saved to your case.</div>}

        {error && <div style={{ marginTop: 14, fontSize: 13, color: "#ef4444" }}>{error}</div>}
        <button onClick={confirm} disabled={finishing} style={{ marginTop: 22, width: "100%", background: ORANGE, color: "#0a0908", border: "none", borderRadius: 12, padding: "15px", fontWeight: 800, fontSize: 15, cursor: finishing ? "default" : "pointer", opacity: finishing ? 0.7 : 1 }}>
          {finishing ? "Building your case… this takes about a minute" : "Yes — build my case"}
        </button>
        {!finishing && <button onClick={() => setReviewing(false)} style={{ marginTop: 10, width: "100%", background: "none", color: "#888", border: "none", padding: 10, fontSize: 14, cursor: "pointer" }}>Back to the chat</button>}
      </div>
    );
  }

  // ── 2. The chat ──
  const captured = parties.length + events.length;
  return shell(
    <>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px" }}>
        {[{ role: "assistant" as const, content: OPENING }, ...messages].map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 10 }}>
            <div style={{
              maxWidth: "85%", padding: "11px 14px", borderRadius: 16, fontSize: 14.5, lineHeight: 1.5, whiteSpace: "pre-wrap",
              background: m.role === "user" ? `${ORANGE}26` : "#141414", color: m.role === "user" ? "#f0e2d4" : "#ddd",
              border: `1px solid ${m.role === "user" ? ORANGE + "44" : "#1e1e1e"}`,
            }}>{m.content}</div>
          </div>
        ))}
        {sending && <div style={{ display: "flex", gap: 6, alignItems: "center", color: "#666", fontSize: 13, padding: "4px 6px" }}><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> …</div>}
        {error && <div style={{ fontSize: 13, color: "#ef4444", padding: "6px 4px" }}>{error}</div>}
        <div ref={endRef} />
      </div>

      <div style={{ flexShrink: 0, borderTop: "1px solid #161616", padding: "10px 14px calc(12px + env(safe-area-inset-bottom))" }}>
        {(captured > 0 || ready || limitReached) && (
          <button onClick={startReview} style={{ width: "100%", marginBottom: 10, background: ready || limitReached ? ORANGE : "#141414", color: ready || limitReached ? "#0a0908" : "#ccc", border: ready || limitReached ? "none" : "1px solid #2a2a2a", borderRadius: 12, padding: "12px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
            {ready || limitReached ? "Review and finish" : `Review what I've captured (${captured})`}
          </button>
        )}
        {!limitReached ? (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
              placeholder="Type here…"
              rows={2}
              style={{ flex: 1, background: "#111", border: "1px solid #2a2a2a", borderRadius: 12, padding: "11px 13px", color: "#fff", fontSize: 15, outline: "none", resize: "none", fontFamily: "inherit" }}
            />
            <button onClick={() => void send()} disabled={!input.trim() || sending} aria-label="Send"
              style={{ width: 46, height: 46, borderRadius: "50%", border: "none", background: input.trim() && !sending ? ORANGE : "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", cursor: input.trim() && !sending ? "pointer" : "default" }}>
              <Send size={18} color={input.trim() && !sending ? "#0a0908" : "#555"} />
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "#888", textAlign: "center" }}>That's the end of the free intake. Everything you confirm is saved.</div>
        )}
      </div>
    </>
  );
}

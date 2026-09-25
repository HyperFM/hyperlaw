import { useEffect, useRef, useState } from "react";
import { X, Send, Loader2, AlertTriangle, MapPin, Camera, Zap } from "lucide-react";
import { aiApi } from "../lib/aiApi";
import { api } from "../lib/api";
import type { HLCase } from "../types";
import { addChatDeadline, mergeFactsIntoCase, type ConfirmedFacts } from "../lib/caseMerge";

const ORANGE = "#d9711f";
const STARTERS = ["I was served", "I received a response", "Check my status", "I need to file something"];
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const draftKey = (caseId: string) => `hl_case_chat_${caseId}`;

type Reply = Awaited<ReturnType<typeof aiApi.caseChat>>;
type Turn = { role: "user"; content: string } | { role: "assistant"; content: string; reply: Reply };
interface Draft { turns: Turn[]; savedAt: number }

function loadDraft(caseId: string): Turn[] {
  try {
    const raw = localStorage.getItem(draftKey(caseId));
    if (!raw) return [];
    const d = JSON.parse(raw) as Draft;
    if (Date.now() - d.savedAt > DRAFT_TTL_MS) { localStorage.removeItem(draftKey(caseId)); return []; }
    return d.turns;
  } catch { return []; }
}

const fmtDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

/**
 * Chat with bubbles, inside an open case. Short answers: what's happening, one next step and why, and a few
 * tap options. Deadlines are computed by the app from a rules table and shown in a bold caution line.
 * The transcript stays on this device (24h) — the case keeps only what the person confirms.
 */
export function CaseChat({ hlCase, onClose, onUpdateCase, onRequestCrop, onBuyCredits }: {
  hlCase: HLCase;
  onClose: () => void;
  onUpdateCase: (c: HLCase) => void;
  onRequestCrop: (file: File, onDone: (dataUrl: string) => void) => void;
  onBuyCredits?: () => void;
}) {
  const [turns, setTurns] = useState<Turn[]>(() => loadDraft(hlCase.id));
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[] | null>(null); // null = checking
  const [court, setCourt] = useState("");
  const [proposal, setProposal] = useState<ConfirmedFacts | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const caseRef = useRef(hlCase);
  caseRef.current = hlCase;

  const refreshGate = () => aiApi.caseChatGate(hlCase.id).then(r => setMissing(r.missing)).catch(() => setMissing([]));
  useEffect(() => { void refreshGate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [turns, sending, proposal]);
  useEffect(() => {
    try { localStorage.setItem(draftKey(hlCase.id), JSON.stringify({ turns, savedAt: Date.now() } satisfies Draft)); } catch { /* private mode */ }
  }, [turns, hlCase.id]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || sending) return;
    const next: Turn[] = [...turns, { role: "user", content: t }];
    setTurns(next);
    setInput("");
    setError(null);
    setSending(true);
    try {
      const r = await aiApi.caseChat(hlCase.id, next.map(x => ({ role: x.role, content: x.content })));
      const content = [r.happening, r.deadline?.text, r.next_step && `Next step: ${r.next_step}`, r.why].filter(Boolean).join(" ");
      setTurns([...next, { role: "assistant", content, reply: r }]);
      if (r.deadline?.flag && r.deadline.dueDate && r.deadline.filing) {
        // The deadline goes onto the Index's "Do next" list so it isn't lost when this chat is cleared.
        onUpdateCase(addChatDeadline(caseRef.current, { filing: r.deadline.filing, dueDate: r.deadline.dueDate, rule: r.deadline.rule }));
      }
      if (r.proposeFacts.parties.length || r.proposeFacts.events.length) setProposal({ parties: r.proposeFacts.parties, events: r.proposeFacts.events });
    } catch (err) {
      const e = err as { code?: string; message?: string; missing?: string[] };
      if (e.code === "chat_locked") { void refreshGate(); }
      else setError(e.message || "Something went wrong — please try again.");
      setTurns(next);
    } finally {
      setSending(false);
    }
  }

  function clearChat() {
    setTurns([]);
    setProposal(null);
    try { localStorage.removeItem(draftKey(hlCase.id)); } catch { /* ignore */ }
  }

  function saveCourt() {
    const v = court.trim();
    if (!v) return;
    onUpdateCase({ ...hlCase, jurisdiction: v });
    setCourt("");
    setTimeout(() => void refreshGate(), 400);
  }

  function pickPhoto(file: File | undefined) {
    if (!file) return;
    onRequestCrop(file, dataUrl => {
      onUpdateCase({ ...hlCase, photoDataUrl: dataUrl });
      api.cases.savePhoto(hlCase.id, dataUrl).catch(() => {}).finally(() => void refreshGate());
    });
  }

  const shell = (children: React.ReactNode) => (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "#0a0a0a", display: "flex", flexDirection: "column", paddingTop: "env(safe-area-inset-top)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #161616", flexShrink: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: "#eee" }}>Case chat</div>
          <div style={{ fontSize: 11.5, color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hlCase.title}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {turns.length > 0 && <button onClick={clearChat} style={{ background: "none", border: "1px solid #222", borderRadius: 8, padding: "5px 10px", fontSize: 12, color: "#888", cursor: "pointer" }}>Clear chat</button>}
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }}><X size={20} color="#777" /></button>
        </div>
      </div>
      {children}
    </div>
  );

  // ── Locked: fix one thing at a time ──
  if (missing === null) return shell(<div style={{ padding: 30, color: "#666", fontSize: 14 }}>One moment…</div>);
  if (missing.length > 0) {
    const step = missing[0];
    const box = { background: "#111", border: `1px solid ${ORANGE}44`, borderRadius: 14, padding: "20px 18px" } as const;
    return shell(
      <div style={{ flex: 1, overflowY: "auto", padding: "26px 20px" }}>
        <div style={{ fontSize: 12, color: ORANGE, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Before you chat · {missing.length} to go</div>
        {step === "jurisdiction" && (
          <div style={box}>
            <MapPin size={22} color={ORANGE} />
            <div style={{ fontSize: 17, fontWeight: 800, color: "#eee", margin: "10px 0 4px" }}>Which court or county is this in?</div>
            <div style={{ fontSize: 13.5, color: "#888", lineHeight: 1.5, marginBottom: 12 }}>The chat needs this to know which rules and deadlines apply. Example: "Fayette County, Kentucky" or "U.S. District Court, Eastern District of Kentucky".</div>
            <input value={court} onChange={e => setCourt(e.target.value)} onKeyDown={e => { if (e.key === "Enter") saveCourt(); }} placeholder="Court or county" style={{ width: "100%", boxSizing: "border-box", background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 10, padding: "12px 13px", color: "#fff", fontSize: 15, outline: "none" }} />
            <button onClick={saveCourt} disabled={!court.trim()} style={{ marginTop: 12, width: "100%", background: court.trim() ? ORANGE : "#1a1a1a", color: court.trim() ? "#0a0908" : "#555", border: "none", borderRadius: 10, padding: 13, fontWeight: 800, cursor: court.trim() ? "pointer" : "default" }}>Save</button>
          </div>
        )}
        {step === "photo" && (
          <div style={box}>
            <Camera size={22} color={ORANGE} />
            <div style={{ fontSize: 17, fontWeight: 800, color: "#eee", margin: "10px 0 4px" }}>Add a photo for this case</div>
            <div style={{ fontSize: 13.5, color: "#888", lineHeight: 1.5, marginBottom: 12 }}>Any photo that helps you recognize it — it's the picture on your case card.</div>
            <input ref={photoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { pickPhoto(e.target.files?.[0]); e.currentTarget.value = ""; }} />
            <button onClick={() => photoRef.current?.click()} style={{ width: "100%", background: ORANGE, color: "#0a0908", border: "none", borderRadius: 10, padding: 13, fontWeight: 800, cursor: "pointer" }}>Choose a photo</button>
          </div>
        )}
        {step === "topup" && (
          <div style={box}>
            <Zap size={22} color={ORANGE} />
            <div style={{ fontSize: 17, fontWeight: 800, color: "#eee", margin: "10px 0 4px" }}>Add credits to start chatting</div>
            <div style={{ fontSize: 13.5, color: "#888", lineHeight: 1.5, marginBottom: 12 }}>Each chat reply uses a little AI. Your Index, cases and timelines stay free.</div>
            <button onClick={() => onBuyCredits?.()} style={{ width: "100%", background: ORANGE, color: "#0a0908", border: "none", borderRadius: 10, padding: 13, fontWeight: 800, cursor: "pointer" }}>Add credits</button>
            <button onClick={() => void refreshGate()} style={{ marginTop: 8, width: "100%", background: "none", color: "#888", border: "none", padding: 10, fontSize: 13, cursor: "pointer" }}>I've added credits — continue</button>
          </div>
        )}
      </div>
    );
  }

  // ── The chat ──
  const lastAssistant = [...turns].reverse().find(t => t.role === "assistant") as Extract<Turn, { role: "assistant" }> | undefined;
  const bubbles = turns.length === 0 ? STARTERS : (lastAssistant?.reply.bubbles ?? []);

  return shell(
    <>
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px 8px" }}>
        <div style={{ fontSize: 11.5, color: "#666", lineHeight: 1.5, marginBottom: 12 }}>
          HyperLaw gives legal information, not legal advice. Deadlines come from published court rules — always confirm with your court clerk. This chat isn't kept; what you confirm is saved to your Index.
        </div>
        {turns.length === 0 && <div style={{ fontSize: 15, color: "#ccc", lineHeight: 1.5, margin: "6px 0 14px" }}>What's going on with your case? Tap one, or type below.</div>}

        {turns.map((t, i) => t.role === "user" ? (
          <div key={i} style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <div style={{ maxWidth: "85%", padding: "10px 14px", borderRadius: 16, fontSize: 14.5, lineHeight: 1.5, background: `${ORANGE}26`, color: "#f0e2d4", border: `1px solid ${ORANGE}44` }}>{t.content}</div>
          </div>
        ) : (
          <div key={i} style={{ marginBottom: 12, maxWidth: "92%" }}>
            <div style={{ background: "#141414", border: "1px solid #1e1e1e", borderRadius: 16, padding: "12px 14px" }}>
              <div style={{ fontSize: 14.5, color: "#ddd", lineHeight: 1.5 }}>{t.reply.happening}</div>
              {t.reply.deadline && (
                <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "flex-start", background: t.reply.deadline.flag ? "#2a1400" : "#141414", border: `1px solid ${t.reply.deadline.flag ? ORANGE : "#2a2a2a"}`, borderRadius: 10, padding: "9px 11px" }}>
                  <AlertTriangle size={16} color={t.reply.deadline.flag ? ORANGE : "#888"} style={{ marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: t.reply.deadline.flag ? "#ffb877" : "#bbb", lineHeight: 1.4 }}>
                      {t.reply.deadline.flag && t.reply.deadline.dueDate && t.reply.deadline.filing ? `${t.reply.deadline.filing} due ${fmtDate(t.reply.deadline.dueDate)}` : t.reply.deadline.text}
                    </div>
                    {t.reply.deadline.flag && <div style={{ fontSize: 11.5, color: "#a08060", marginTop: 3, lineHeight: 1.4 }}>{t.reply.deadline.rule} — confirm with your court clerk. Added to your Index.</div>}
                  </div>
                </div>
              )}
              {t.reply.next_step && (
                <div style={{ marginTop: 10, fontSize: 14, color: "#ddd", lineHeight: 1.5 }}>
                  <span style={{ color: ORANGE, fontWeight: 800 }}>Next step: </span>{t.reply.next_step}
                  {t.reply.why && <div style={{ fontSize: 12.5, color: "#888", marginTop: 3 }}>{t.reply.why}</div>}
                </div>
              )}
            </div>
          </div>
        ))}

        {proposal && (
          <div style={{ background: "#0f1410", border: "1px solid #1f3a26", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
            <div style={{ fontSize: 13.5, color: "#bfe3c8", fontWeight: 700, marginBottom: 6 }}>New details I heard — add to your case?</div>
            {proposal.parties.map((p, i) => <div key={`p${i}`} style={{ fontSize: 13.5, color: "#ddd", padding: "2px 0" }}>• {p.name}{p.role ? ` — ${p.role}` : ""}</div>)}
            {proposal.events.map((e, i) => <div key={`e${i}`} style={{ fontSize: 13.5, color: "#ddd", padding: "2px 0" }}>• {e.when ? `${e.when}: ` : ""}{e.what}</div>)}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={() => { onUpdateCase(mergeFactsIntoCase(caseRef.current, proposal)); setProposal(null); }} style={{ flex: 1, background: "#1f6b3a", color: "#fff", border: "none", borderRadius: 9, padding: 10, fontWeight: 800, cursor: "pointer" }}>Add to my case</button>
              <button onClick={() => setProposal(null)} style={{ flex: 1, background: "none", color: "#999", border: "1px solid #2a2a2a", borderRadius: 9, padding: 10, cursor: "pointer" }}>Not now</button>
            </div>
          </div>
        )}

        {sending && <div style={{ display: "flex", gap: 6, alignItems: "center", color: "#666", fontSize: 13, padding: "4px 6px" }}><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> …</div>}
        {error && <div style={{ fontSize: 13, color: "#ef4444", padding: "6px 4px" }}>{error}</div>}
        <div ref={endRef} />
      </div>

      <div style={{ flexShrink: 0, borderTop: "1px solid #161616", padding: "10px 14px calc(12px + env(safe-area-inset-bottom))" }}>
        {bubbles.length > 0 && !sending && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {bubbles.map(b => (
              <button key={b} onClick={() => void send(b)} style={{ background: "#141414", border: `1px solid ${ORANGE}55`, color: "#f0d3b6", borderRadius: 999, padding: "9px 15px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{b}</button>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
            placeholder="Or type here…"
            rows={2}
            style={{ flex: 1, background: "#111", border: "1px solid #2a2a2a", borderRadius: 12, padding: "11px 13px", color: "#fff", fontSize: 15, outline: "none", resize: "none", fontFamily: "inherit" }}
          />
          <button onClick={() => void send(input)} disabled={!input.trim() || sending} aria-label="Send"
            style={{ width: 46, height: 46, borderRadius: "50%", border: "none", background: input.trim() && !sending ? ORANGE : "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", cursor: input.trim() && !sending ? "pointer" : "default" }}>
            <Send size={18} color={input.trim() && !sending ? "#0a0908" : "#555"} />
          </button>
        </div>
      </div>
    </>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Baby, Plus, Send, Loader2, Calendar, Handshake, Calculator, Download, ChevronRight } from "lucide-react";
import { aiApi, type FamilyMessage } from "../../lib/aiApi";

const ORANGE = "#d9711f";
type Thread = Awaited<ReturnType<typeof aiApi.familyThreads>>[number];

const fmtTime = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * Expense split: each parent's share of a shared child expense, in proportion to their incomes.
 * This is a simple planning tool for splitting costs — it is NOT the state's child-support guideline amount.
 */
export function splitExpense(incomeA: number, incomeB: number, expense: number): { shareA: number; shareB: number; owedA: number; owedB: number } | null {
  const total = incomeA + incomeB;
  if (!(incomeA >= 0) || !(incomeB >= 0) || !(expense >= 0) || total <= 0) return null;
  const shareA = incomeA / total;
  return { shareA, shareB: 1 - shareA, owedA: expense * shareA, owedB: expense * (1 - shareA) };
}

export default function FamilyCourtView({ onBack }: { onBack: () => void }) {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<"list" | "new" | "join">("list");
  const [title, setTitle] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { aiApi.familyThreads().then(setThreads).catch(e => { setThreads([]); setErr((e as Error).message); }); }, []);
  useEffect(load, [load]);

  const back = (label: string, fn: () => void) => (
    <button onClick={fn} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 18, display: "flex", alignItems: "center", gap: 6, color: "#666", fontSize: 13, fontWeight: 700 }}>
      <ArrowLeft size={15} /> {label}
    </button>
  );

  if (openId) {
    const t = threads?.find(x => x.id === openId);
    return <ThreadView thread={t ?? null} threadId={openId} onBack={() => { setOpenId(null); load(); }} />;
  }

  const input = { width: "100%", boxSizing: "border-box", background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 10, padding: "12px 13px", color: "#fff", fontSize: 15, outline: "none", marginBottom: 10 } as const;
  const primary = { width: "100%", background: ORANGE, color: "#0a0908", border: "none", borderRadius: 12, padding: 14, fontWeight: 800, fontSize: 15, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 } as const;

  if (mode === "new") {
    return (
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 120px" }}>
        {back("Family Court", () => { setMode("list"); setErr(null); })}
        <div style={{ fontSize: 19, fontWeight: 900, marginBottom: 6 }}>Start a co-parenting chat</div>
        <div style={{ color: "#666", fontSize: 13, lineHeight: 1.6, marginBottom: 18 }}>Only the two of you will ever see it. You'll get a code to give the other parent — we can email it to them too.</div>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Name (optional), e.g. Custody schedule" style={input} />
        <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="Their email (optional)" type="email" style={input} />
        {err && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <button disabled={busy} style={primary} onClick={async () => {
          setBusy(true); setErr(null);
          try { const r = await aiApi.familyCreateThread({ title, inviteEmail: inviteEmail.trim() || undefined }); load(); setMode("list"); setOpenId(r.id); setTitle(""); setInviteEmail(""); }
          catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
        }}>Create chat</button>
      </div>
    );
  }

  if (mode === "join") {
    return (
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 120px" }}>
        {back("Family Court", () => { setMode("list"); setErr(null); })}
        <div style={{ fontSize: 19, fontWeight: 900, marginBottom: 6 }}>Join with a code</div>
        <div style={{ color: "#666", fontSize: 13, lineHeight: 1.6, marginBottom: 18 }}>Enter the 8-character code the other parent gave you.</div>
        <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="CODE" maxLength={8} style={{ ...input, letterSpacing: 3, fontSize: 20, textAlign: "center" }} />
        {err && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <button disabled={busy || code.trim().length < 4} style={primary} onClick={async () => {
          setBusy(true); setErr(null);
          try { const r = await aiApi.familyJoin(code); load(); setMode("list"); setCode(""); setOpenId(r.id); }
          catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
        }}>Join</button>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 120px" }}>
      {back("Tools", onBack)}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: `${ORANGE}16`, display: "flex", alignItems: "center", justifyContent: "center" }}><Baby size={19} color={ORANGE} /></div>
        <div style={{ fontSize: 20, fontWeight: 900 }}>Family Court</div>
      </div>
      <div style={{ color: "#666", fontSize: 13, lineHeight: 1.6, marginBottom: 18 }}>
        A private chat between you and the other parent, with custody and court dates that remind you both, and tools for making offers and splitting costs. Every message is kept as a record — it can't be edited or deleted, and either of you can export it.
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <button onClick={() => setMode("new")} style={{ flex: 1, background: ORANGE, color: "#0a0908", border: "none", borderRadius: 12, padding: 13, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Plus size={16} /> Start a chat</button>
        <button onClick={() => setMode("join")} style={{ flex: 1, background: "none", border: `1px solid ${ORANGE}66`, color: "#e8d9c8", borderRadius: 12, padding: 13, fontWeight: 700, cursor: "pointer" }}>Join with a code</button>
      </div>
      {threads === null && <div style={{ color: "#666", fontSize: 13 }}>Loading…</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {threads?.map(t => (
          <button key={t.id} onClick={() => setOpenId(t.id)} style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, padding: "14px 16px", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5, color: "#ddd" }}>{t.title}</div>
              <div style={{ fontSize: 12, color: t.status === "active" ? "#7fd39a" : "#a08060", marginTop: 2 }}>{t.status === "active" ? `With ${t.otherName}` : `Waiting for ${t.otherName}`}</div>
            </div>
            <ChevronRight size={15} color="#444" />
          </button>
        ))}
        {threads?.length === 0 && <div style={{ color: "#555", fontSize: 14 }}>No chats yet.</div>}
      </div>
      {err && <div style={{ color: "#ef4444", fontSize: 13, marginTop: 12 }}>{err}</div>}
      <div style={{ color: "#555", fontSize: 11.5, lineHeight: 1.55, marginTop: 22 }}>
        HyperLaw provides tools, not legal advice, and this chat doesn't replace a court order. If you or a child is in danger, call 911.
      </div>
    </div>
  );
}

function ThreadView({ thread, threadId, onBack }: { thread: Thread | null; threadId: string; onBack: () => void }) {
  const [messages, setMessages] = useState<FamilyMessage[]>([]);
  const [status, setStatus] = useState(thread?.status ?? "pending");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | "event" | "offer" | "split">(null);
  const [evTitle, setEvTitle] = useState("");
  const [evDate, setEvDate] = useState("");
  const [offerType, setOfferType] = useState<"schedule" | "expenses" | "other">("schedule");
  const [offerText, setOfferText] = useState("");
  const [inA, setInA] = useState(""); const [inB, setInB] = useState(""); const [exp, setExp] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const lastRef = useRef<string | undefined>(undefined);

  const refresh = useCallback(async (full = false) => {
    try {
      const r = await aiApi.familyMessages(threadId, full ? undefined : lastRef.current);
      setStatus(r.status);
      if (full) setMessages(r.messages);
      else if (r.messages.length) setMessages(prev => [...prev, ...r.messages.filter(m => !prev.some(p => p.id === m.id))]);
      if (r.messages.length) lastRef.current = r.messages[r.messages.length - 1].createdAt;
    } catch { /* keep what we have */ }
  }, [threadId]);

  useEffect(() => { void refresh(true); const iv = setInterval(() => void refresh(false), 8000); return () => clearInterval(iv); }, [refresh]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  // An offer being answered changes an EARLIER message, so re-read everything after any action.
  async function post(input: Parameters<typeof aiApi.familySend>[1]) {
    setSending(true); setErr(null);
    try { await aiApi.familySend(threadId, input); await refresh(true); return true; }
    catch (e) { setErr((e as Error).message); return false; }
    finally { setSending(false); }
  }

  function exportLog() {
    const lines = messages.map(m => `[${new Date(m.createdAt).toLocaleString()}] ${m.mine ? "Me" : (thread?.otherName ?? "Other parent")}: ${m.body}`);
    const blob = new Blob([`HyperLaw co-parenting record — ${thread?.title ?? ""}\nExported ${new Date().toLocaleString()}\n\n${lines.join("\n")}\n`], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "co-parenting-record.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const split = splitExpense(parseFloat(inA), parseFloat(inB), parseFloat(exp));
  const box = { background: "#111", border: "1px solid #222", borderRadius: 12, padding: 14, marginBottom: 10 } as const;
  const field = { width: "100%", boxSizing: "border-box", background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 9, padding: "10px 12px", color: "#fff", fontSize: 14.5, outline: "none", marginBottom: 8 } as const;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #161616", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#666", display: "flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 700 }}><ArrowLeft size={16} /> Back</button>
        <div style={{ flex: 1, minWidth: 0, textAlign: "center", fontWeight: 800, fontSize: 14, color: "#eee", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{thread?.title ?? "Chat"}</div>
        <button onClick={exportLog} title="Export the record" style={{ background: "none", border: "none", cursor: "pointer", color: "#888", padding: 6 }}><Download size={17} /></button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 8px" }}>
        {status === "pending" && (
          <div style={{ ...box, borderColor: `${ORANGE}55` }}>
            <div style={{ fontSize: 14, color: "#ddd", fontWeight: 700 }}>Waiting for the other parent</div>
            <div style={{ fontSize: 13, color: "#888", marginTop: 4, lineHeight: 1.5 }}>Give them this code: <b style={{ color: ORANGE, letterSpacing: 2, fontSize: 16 }}>{thread?.inviteCode ?? "—"}</b><br />They enter it under Tools → Family Court → Join with a code.</div>
          </div>
        )}
        {messages.map(m => m.kind === "note" ? (
          <div key={m.id} style={{ textAlign: "center", fontSize: 12, color: "#777", margin: "10px 6px" }}>{m.body} · {fmtTime(m.createdAt)}</div>
        ) : (
          <div key={m.id} style={{ display: "flex", justifyContent: m.mine ? "flex-end" : "flex-start", marginBottom: 10 }}>
            <div style={{ maxWidth: "84%", padding: "10px 13px", borderRadius: 16, fontSize: 14.5, lineHeight: 1.5, whiteSpace: "pre-wrap", background: m.mine ? `${ORANGE}26` : "#141414", color: m.mine ? "#f0e2d4" : "#ddd", border: `1px solid ${m.mine ? ORANGE + "44" : "#1e1e1e"}` }}>
              {m.kind === "event" && <div style={{ fontSize: 11, fontWeight: 800, color: ORANGE, letterSpacing: 0.8, marginBottom: 3 }}>DATE · REMINDER SET FOR BOTH OF YOU</div>}
              {m.kind === "offer" && <div style={{ fontSize: 11, fontWeight: 800, color: ORANGE, letterSpacing: 0.8, marginBottom: 3 }}>OFFER · {String(m.payload?.type ?? "").toUpperCase()}</div>}
              {m.body}
              {m.kind === "offer" && (
                <div style={{ marginTop: 8 }}>
                  {m.payload?.status === "open" && !m.mine && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={async () => { await aiApi.familyRespond(threadId, m.id, "accepted").catch(e => setErr((e as Error).message)); await refresh(true); }} style={{ flex: 1, background: "#1f6b3a", color: "#fff", border: "none", borderRadius: 8, padding: 8, fontWeight: 800, cursor: "pointer" }}>Accept</button>
                      <button onClick={async () => { await aiApi.familyRespond(threadId, m.id, "declined").catch(e => setErr((e as Error).message)); await refresh(true); }} style={{ flex: 1, background: "none", color: "#bbb", border: "1px solid #333", borderRadius: 8, padding: 8, cursor: "pointer" }}>Decline</button>
                    </div>
                  )}
                  {m.payload?.status === "open" && m.mine && <div style={{ fontSize: 12, color: "#a08060" }}>Waiting for their answer</div>}
                  {m.payload?.status === "accepted" && <div style={{ fontSize: 12, color: "#7fd39a", fontWeight: 700 }}>✓ Accepted</div>}
                  {m.payload?.status === "declined" && <div style={{ fontSize: 12, color: "#e08a8a", fontWeight: 700 }}>Declined — you can make a new offer</div>}
                </div>
              )}
              <div style={{ fontSize: 10.5, color: "#666", marginTop: 4 }}>{fmtTime(m.createdAt)}</div>
            </div>
          </div>
        ))}
        {err && <div style={{ color: "#ef4444", fontSize: 13, padding: "4px 6px" }}>{err}</div>}
        <div ref={endRef} />
      </div>

      {panel && (
        <div style={{ borderTop: "1px solid #161616", padding: "12px 14px", background: "#0c0c0c", flexShrink: 0, maxHeight: "55%", overflowY: "auto" }}>
          {panel === "event" && (
            <>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#ddd", marginBottom: 8 }}>Add a custody or court date — you'll both be reminded the day before and the day of.</div>
              <input value={evTitle} onChange={e => setEvTitle(e.target.value)} placeholder="What is it? e.g. Pickup, court hearing" style={field} />
              <input type="date" value={evDate} onChange={e => setEvDate(e.target.value)} style={field} />
              <button disabled={sending || !evTitle.trim() || !evDate} onClick={async () => { if (await post({ kind: "event", body: `${evTitle.trim()} — ${new Date(`${evDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`, payload: { title: evTitle.trim(), date: evDate } })) { setPanel(null); setEvTitle(""); setEvDate(""); } }} style={{ width: "100%", background: ORANGE, color: "#0a0908", border: "none", borderRadius: 10, padding: 12, fontWeight: 800, cursor: "pointer", opacity: sending || !evTitle.trim() || !evDate ? 0.5 : 1 }}>Add and remind us both</button>
            </>
          )}
          {panel === "offer" && (
            <>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#ddd", marginBottom: 8 }}>Make an offer — they can accept or decline, and it's recorded either way.</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                {(["schedule", "expenses", "other"] as const).map(t => <button key={t} onClick={() => setOfferType(t)} style={{ flex: 1, padding: "8px 4px", borderRadius: 9, border: `1px solid ${offerType === t ? ORANGE : "#2a2a2a"}`, background: offerType === t ? `${ORANGE}22` : "none", color: offerType === t ? "#ffb877" : "#888", fontSize: 12.5, fontWeight: 700, cursor: "pointer", textTransform: "capitalize" }}>{t}</button>)}
              </div>
              <textarea value={offerText} onChange={e => setOfferText(e.target.value)} rows={3} placeholder="Say exactly what you're offering…" style={{ ...field, resize: "none", fontFamily: "inherit" }} />
              <button disabled={sending || !offerText.trim()} onClick={async () => { if (await post({ kind: "offer", body: offerText.trim(), payload: { type: offerType, summary: offerText.trim() } })) { setPanel(null); setOfferText(""); } }} style={{ width: "100%", background: ORANGE, color: "#0a0908", border: "none", borderRadius: 10, padding: 12, fontWeight: 800, cursor: "pointer", opacity: sending || !offerText.trim() ? 0.5 : 1 }}>Send offer</button>
            </>
          )}
          {panel === "split" && (
            <>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#ddd", marginBottom: 4 }}>Split a shared cost by income</div>
              <div style={{ fontSize: 11.5, color: "#777", marginBottom: 8, lineHeight: 1.5 }}>Each parent pays a share in proportion to their income. This is a planning tool, not your state's child-support guideline amount.</div>
              <input inputMode="decimal" value={inA} onChange={e => setInA(e.target.value)} placeholder="Your monthly income" style={field} />
              <input inputMode="decimal" value={inB} onChange={e => setInB(e.target.value)} placeholder="Their monthly income" style={field} />
              <input inputMode="decimal" value={exp} onChange={e => setExp(e.target.value)} placeholder="The shared cost (e.g. daycare per month)" style={field} />
              {split && (
                <div style={{ ...box, marginBottom: 8 }}>
                  <div style={{ fontSize: 14, color: "#ddd" }}>You: <b>{(split.shareA * 100).toFixed(0)}%</b> → {money(split.owedA)}</div>
                  <div style={{ fontSize: 14, color: "#ddd" }}>Them: <b>{(split.shareB * 100).toFixed(0)}%</b> → {money(split.owedB)}</div>
                  <button onClick={() => { setOfferType("expenses"); setOfferText(`I'd like to split this cost by income — me ${(split.shareA * 100).toFixed(0)}% (${money(split.owedA)}), you ${(split.shareB * 100).toFixed(0)}% (${money(split.owedB)}).`); setPanel("offer"); }} style={{ marginTop: 8, background: "none", border: `1px solid ${ORANGE}66`, color: "#e8d9c8", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Turn this into an offer</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {status === "active" && (
        <div style={{ borderTop: "1px solid #161616", padding: "8px 12px calc(10px + env(safe-area-inset-bottom))", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            {([["event", Calendar, "Date"], ["offer", Handshake, "Offer"], ["split", Calculator, "Split costs"]] as const).map(([id, Icon, label]) => (
              <button key={id} onClick={() => setPanel(panel === id ? null : id)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: panel === id ? `${ORANGE}22` : "#111", border: `1px solid ${panel === id ? ORANGE : "#222"}`, color: panel === id ? "#ffb877" : "#aaa", borderRadius: 999, padding: "8px 6px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}><Icon size={14} /> {label}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (text.trim() && !sending) void post({ body: text.trim() }).then(ok => ok && setText("")); } }} rows={2} placeholder="Write a message…" style={{ flex: 1, background: "#111", border: "1px solid #2a2a2a", borderRadius: 12, padding: "10px 12px", color: "#fff", fontSize: 15, outline: "none", resize: "none", fontFamily: "inherit" }} />
            <button disabled={!text.trim() || sending} onClick={() => void post({ body: text.trim() }).then(ok => ok && setText(""))} aria-label="Send" style={{ width: 46, height: 46, borderRadius: "50%", border: "none", background: text.trim() && !sending ? ORANGE : "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", cursor: text.trim() && !sending ? "pointer" : "default" }}>
              {sending ? <Loader2 size={17} color="#555" style={{ animation: "spin 1s linear infinite" }} /> : <Send size={18} color={text.trim() ? "#0a0908" : "#555"} />}
            </button>
          </div>
          <div style={{ fontSize: 10.5, color: "#555", marginTop: 6 }}>Messages are kept as a record and can't be edited or deleted.</div>
        </div>
      )}
    </div>
  );
}

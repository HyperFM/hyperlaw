import { useState } from "react";
import { ChevronRight, ArrowLeft, Users, Loader2, Minus, Plus } from "lucide-react";
import type { HLCase, VoirDireSession } from "../../types";
import { api } from "../../lib/api";
import { aiApi } from "../../lib/aiApi";

const ORANGE = "#d9711f";
const RED = "#ef4444";
const GREEN = "#22c55e";

interface Props {
  cases: HLCase[];
  onUpdateCase: (c: HLCase) => void;
  onBack: () => void;
}

function saveCase(c: HLCase, onUpdateCase: (c: HLCase) => void) {
  onUpdateCase(c);
  api.cases.upsert(c.id, c.title, c.workflowStage, c as unknown as Record<string, unknown>).catch(() => {});
}

/** Score a seat across every question: greens minus reds. Only seats that were actually rated count. */
export function seatVerdict(session: VoirDireSession, seat: number): { greens: number; reds: number; verdict: "keep" | "strike" | "unrated" | "even" } {
  let greens = 0, reds = 0;
  for (const q of session.questions) {
    const r = session.ratings[q.id]?.[String(seat)];
    if (r === "g") greens++;
    else if (r === "r") reds++;
  }
  if (greens + reds === 0) return { greens, reds, verdict: "unrated" };
  if (reds > greens) return { greens, reds, verdict: "strike" };
  if (greens > reds) return { greens, reds, verdict: "keep" };
  return { greens, reds, verdict: "even" };
}

export default function VoirDireView({ cases, onUpdateCase, onBack }: Props) {
  const [caseId, setCaseId] = useState<string | null>(null);
  const [seatsSetup, setSeatsSetup] = useState(12);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);

  const hlCase = cases.find(c => c.id === caseId) ?? null;
  const session = hlCase?.voirDire ?? null;

  const back = (label: string, fn: () => void) => (
    <button onClick={fn} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 18, display: "flex", alignItems: "center", gap: 6, color: "#666", fontSize: 13, fontWeight: 700 }}>
      <ArrowLeft size={15} /> {label}
    </button>
  );

  function update(next: VoirDireSession) {
    if (!hlCase) return;
    saveCase({ ...hlCase, voirDire: { ...next, updatedAt: Date.now() } }, onUpdateCase);
  }

  // ── 1. Pick a case ──
  if (!hlCase) {
    const list = cases.filter(c => !c.exhibitOnly);
    return (
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 120px" }}>
        {back("Tools", onBack)}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: `${ORANGE}16`, display: "flex", alignItems: "center", justifyContent: "center" }}><Users size={19} color={ORANGE} /></div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>Voir Dire</div>
        </div>
        <div style={{ color: "#666", fontSize: 13, lineHeight: 1.6, marginBottom: 22 }}>
          Picking a jury, made simple. You get questions built from your case, what a good and a bad answer sounds like, and a chair for every juror. Tap red or green as they answer, and at the end you'll see who to keep and who to consider striking.
        </div>
        <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>SELECT A CASE</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {list.map(c => (
            <button key={c.id} onClick={() => { setCaseId(c.id); setShowResults(false); setError(null); }}
              style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, padding: "14px 16px", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#ddd" }}>{c.title}</div>
                {c.voirDire && <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{c.voirDire.questions.length} questions · {c.voirDire.seats} seats</div>}
              </div>
              <ChevronRight size={15} color="#444" />
            </button>
          ))}
          {list.length === 0 && <div style={{ color: "#555", fontSize: 14 }}>Make a case first — the questions are built from it.</div>}
        </div>
      </div>
    );
  }

  // ── 2. Set up: seats + generate questions ──
  if (!session) {
    async function generate() {
      if (!hlCase) return;
      setGenerating(true);
      setError(null);
      try {
        const r = await aiApi.voirDireQuestions(hlCase.id);
        saveCase({
          ...hlCase,
          voirDire: {
            seats: seatsSetup,
            questions: r.questions.map(q => ({ id: crypto.randomUUID(), ...q })),
            ratings: {}, seatNames: {}, currentIndex: 0, updatedAt: Date.now(),
          },
        }, onUpdateCase);
      } catch (e) {
        setError((e as Error).message || "Couldn't generate questions — please try again.");
      } finally {
        setGenerating(false);
      }
    }
    return (
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 120px" }}>
        {back("Cases", () => setCaseId(null))}
        <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 6 }}>{hlCase.title}</div>
        <div style={{ color: "#666", fontSize: 13, lineHeight: 1.6, marginBottom: 22 }}>How many jurors will be in the box? I'll write questions from your case, with what to listen for in each answer.</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
          <button onClick={() => setSeatsSetup(s => Math.max(4, s - 1))} style={{ width: 40, height: 40, borderRadius: 20, background: "#141414", border: "1px solid #2a2a2a", cursor: "pointer" }}><Minus size={16} color="#aaa" /></button>
          <div style={{ fontSize: 30, fontWeight: 900, minWidth: 48, textAlign: "center" }}>{seatsSetup}</div>
          <button onClick={() => setSeatsSetup(s => Math.min(16, s + 1))} style={{ width: 40, height: 40, borderRadius: 20, background: "#141414", border: "1px solid #2a2a2a", cursor: "pointer" }}><Plus size={16} color="#aaa" /></button>
          <div style={{ color: "#666", fontSize: 13 }}>seats</div>
        </div>
        {error && <div style={{ color: RED, fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <button onClick={generate} disabled={generating} style={{ width: "100%", background: ORANGE, color: "#0a0908", border: "none", borderRadius: 12, padding: 15, fontWeight: 800, fontSize: 15, cursor: generating ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: generating ? 0.7 : 1 }}>
          {generating ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Writing your questions…</> : "Build my questions"}
        </button>
        <div style={{ color: "#555", fontSize: 11.5, lineHeight: 1.55, marginTop: 14 }}>Legal information, not legal advice. Courts run jury selection differently — the judge may ask some questions or limit yours, so check the local rules and your judge's standing order.</div>
      </div>
    );
  }

  // ── 4. Results ──
  if (showResults) {
    const rows = Array.from({ length: session.seats }, (_, i) => i + 1).map(seat => ({ seat, ...seatVerdict(session, seat) }));
    const order = { strike: 0, even: 1, keep: 2, unrated: 3 } as const;
    rows.sort((a, b) => order[a.verdict] - order[b.verdict] || b.reds - a.reds);
    const label = { strike: "Consider striking", keep: "Keep", even: "Undecided", unrated: "Not rated" } as const;
    const color = { strike: RED, keep: GREEN, even: "#eab308", unrated: "#555" } as const;
    return (
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 120px" }}>
        {back("Back to the jury box", () => setShowResults(false))}
        <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 4 }}>Your jury</div>
        <div style={{ color: "#666", fontSize: 13, lineHeight: 1.55, marginBottom: 16 }}>Red means their answers leaned against your side, green means they leaned toward it. This is a starting point for your own judgment, not advice on who to strike.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map(r => (
            <div key={r.seat} style={{ display: "flex", alignItems: "center", gap: 12, background: "#111", border: `1px solid ${color[r.verdict]}44`, borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ width: 34, height: 34, borderRadius: 17, background: `${color[r.verdict]}22`, border: `1.5px solid ${color[r.verdict]}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: color[r.verdict], flexShrink: 0 }}>{r.seat}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#ddd" }}>{session.seatNames[String(r.seat)] || `Juror ${r.seat}`}</div>
                <div style={{ fontSize: 12, color: "#777" }}>{r.greens} green · {r.reds} red</div>
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: color[r.verdict] }}>{label[r.verdict]}</div>
            </div>
          ))}
        </div>
        <button onClick={() => { if (window.confirm("Start over? This clears every rating for this case.")) { update({ ...session, ratings: {}, currentIndex: 0 }); setShowResults(false); } }}
          style={{ marginTop: 20, width: "100%", background: "none", border: "1px solid #2a2a2a", color: "#999", borderRadius: 10, padding: 12, cursor: "pointer", fontSize: 14 }}>Start a new set</button>
      </div>
    );
  }

  // ── 3. The jury box ──
  const q = session.questions[Math.min(session.currentIndex, session.questions.length - 1)];
  const last = session.currentIndex >= session.questions.length - 1;
  const qRatings = session.ratings[q.id] ?? {};
  const rate = (seat: number, val: "g" | "r") => {
    const cur = qRatings[String(seat)];
    const nextQ = { ...qRatings };
    if (cur === val) delete nextQ[String(seat)]; else nextQ[String(seat)] = val;
    update({ ...session, ratings: { ...session.ratings, [q.id]: nextQ } });
  };
  const rename = (seat: number) => {
    const name = window.prompt(`Juror ${seat} — name or a note (optional)`, session.seatNames[String(seat)] ?? "");
    if (name === null) return;
    update({ ...session, seatNames: { ...session.seatNames, [String(seat)]: name.trim() } });
  };
  const seats = Array.from({ length: session.seats }, (_, i) => i + 1);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 130px" }}>
      {back("Cases", () => setCaseId(null))}
      <div style={{ fontSize: 11, color: "#555", fontWeight: 800, letterSpacing: 1, marginBottom: 6 }}>QUESTION {session.currentIndex + 1} OF {session.questions.length}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: "#eee", lineHeight: 1.4, marginBottom: 12 }}>{q.question}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
        <div style={{ background: "#1a0d0d", border: `1px solid ${RED}55`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: "#f0b4b4", lineHeight: 1.45 }}><b style={{ color: RED }}>Red — a bad answer sounds like:</b> {q.bad}</div>
        <div style={{ background: "#0d1a10", border: `1px solid ${GREEN}55`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: "#b4f0c4", lineHeight: 1.45 }}><b style={{ color: GREEN }}>Green — listen for:</b> {q.good}</div>
      </div>

      <div style={{ fontSize: 11, color: "#555", marginBottom: 8 }}>Tap the red or green side of each juror's chair. Tap a number to add a name.</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        {seats.map(seat => {
          const cur = qRatings[String(seat)];
          const name = session.seatNames[String(seat)];
          return (
            <div key={seat} style={{ position: "relative" }}>
              <button onClick={() => rename(seat)} style={{ display: "block", width: "100%", background: "none", border: "none", color: "#888", fontSize: 11, fontWeight: 700, marginBottom: 3, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {name || `Seat ${seat}`}
              </button>
              <div style={{ display: "flex", height: 62, borderRadius: 14, overflow: "hidden", border: "1.5px solid #2a2a2a" }}>
                <button aria-label={`Seat ${seat} bad answer`} onClick={() => rate(seat, "r")}
                  style={{ flex: 1, border: "none", cursor: "pointer", background: cur === "r" ? RED : cur === "g" ? "#2a1212" : `${RED}55`, transition: "background .12s" }} />
                <button aria-label={`Seat ${seat} good answer`} onClick={() => rate(seat, "g")}
                  style={{ flex: 1, border: "none", cursor: "pointer", background: cur === "g" ? GREEN : cur === "r" ? "#0f2416" : `${GREEN}55`, transition: "background .12s" }} />
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button disabled={session.currentIndex === 0} onClick={() => update({ ...session, currentIndex: session.currentIndex - 1 })}
          style={{ flex: 1, background: "none", border: "1px solid #2a2a2a", color: session.currentIndex === 0 ? "#444" : "#bbb", borderRadius: 12, padding: 13, cursor: session.currentIndex === 0 ? "default" : "pointer", fontWeight: 700 }}>Previous</button>
        {last ? (
          <button onClick={() => setShowResults(true)} style={{ flex: 2, background: ORANGE, color: "#0a0908", border: "none", borderRadius: 12, padding: 13, fontWeight: 800, cursor: "pointer" }}>See who to keep</button>
        ) : (
          <button onClick={() => update({ ...session, currentIndex: session.currentIndex + 1 })} style={{ flex: 2, background: ORANGE, color: "#0a0908", border: "none", borderRadius: 12, padding: 13, fontWeight: 800, cursor: "pointer" }}>Next question</button>
        )}
      </div>
      <button onClick={() => setShowResults(true)} style={{ marginTop: 10, width: "100%", background: "none", border: "none", color: "#777", fontSize: 13, padding: 8, cursor: "pointer" }}>Skip to results</button>
    </div>
  );
}

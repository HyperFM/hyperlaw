import { useRef, useState } from "react";
import { ChevronRight, ArrowLeft, Users, Loader2, Minus, Plus } from "lucide-react";
import type { HLCase, VoirDireSession } from "../../types";
import { api } from "../../lib/api";
import { aiApi } from "../../lib/aiApi";
import { clampPos, displayNumbers, ensureLayout, type Layout } from "../../lib/voirDireLayout";

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
            ratings: {}, seatNames: {}, currentIndex: 0, askMode: "group", layout: ensureLayout(undefined, seatsSetup), layoutLocked: false, updatedAt: Date.now(),
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

  // ── shared seat-map pieces ──
  const layout: Layout = ensureLayout(session.layout, session.seats);
  const numbers = displayNumbers(layout);
  const labelFor = (seat: number) => session.seatNames[String(seat)] || `Seat ${numbers[String(seat)]}`;

  async function rebuildQuestions() {
    if (!hlCase || !session) return;
    if (!window.confirm("Write a fresh set of questions? This clears the red/green ratings but keeps your chairs and names.")) return;
    setGenerating(true);
    setError(null);
    try {
      const r = await aiApi.voirDireQuestions(hlCase.id);
      update({ ...session, questions: r.questions.map(q => ({ id: crypto.randomUUID(), ...q })), ratings: {}, currentIndex: 0 });
      setShowResults(false);
    } catch (e) {
      setError((e as Error).message || "Couldn't write new questions — please try again.");
    } finally {
      setGenerating(false);
    }
  }

  // ── 4. Results ──
  if (showResults) {
    const rows = Array.from({ length: session.seats }, (_, i) => i + 1).map(seat => ({ seat, ...seatVerdict(session, seat) }));
    const order = { strike: 0, even: 1, keep: 2, unrated: 3 } as const;
    rows.sort((a, b) => order[a.verdict] - order[b.verdict] || b.reds - a.reds);
    const label = { strike: "Consider striking", keep: "Keep", even: "Undecided", unrated: "Not rated" } as const;
    const color = { strike: RED, keep: GREEN, even: "#eab308", unrated: "#555" } as const;
    const verdictBySeat = Object.fromEntries(rows.map(r => [r.seat, r.verdict]));
    return (
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 120px" }}>
        {back("Back to the jury box", () => setShowResults(false))}
        <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 4 }}>Your jury</div>
        <div style={{ color: "#666", fontSize: 13, lineHeight: 1.55, marginBottom: 14 }}>The chairs are laid out just as you arranged them. Red leaned against your side, green leaned toward it, yellow is undecided, grey wasn't rated. A starting point for your own judgment, not advice on who to strike.</div>
        <SeatMap layout={layout} height={250}>
          {seat => (
            <div style={{ width: 62, textAlign: "center" }}>
              <div style={{ height: 40, borderRadius: 12, background: `${color[verdictBySeat[seat] as keyof typeof color]}33`, border: `2px solid ${color[verdictBySeat[seat] as keyof typeof color]}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 16, color: "#fff" }}>{numbers[String(seat)]}</div>
              <div style={{ fontSize: 10.5, color: "#aaa", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.seatNames[String(seat)] || ""}</div>
            </div>
          )}
        </SeatMap>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
          {rows.map(r => (
            <div key={r.seat} style={{ display: "flex", alignItems: "center", gap: 12, background: "#111", border: `1px solid ${color[r.verdict]}44`, borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ width: 34, height: 34, borderRadius: 17, background: `${color[r.verdict]}22`, border: `1.5px solid ${color[r.verdict]}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: color[r.verdict], flexShrink: 0 }}>{numbers[String(r.seat)]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#ddd" }}>{labelFor(r.seat)}</div>
                <div style={{ fontSize: 12, color: "#777" }}>{r.greens} green · {r.reds} red</div>
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: color[r.verdict] }}>{label[r.verdict]}</div>
            </div>
          ))}
        </div>
        {error && <div style={{ color: RED, fontSize: 13, marginTop: 12 }}>{error}</div>}
        <button onClick={() => { if (window.confirm("Start over? This clears every rating for this case.")) { update({ ...session, ratings: {}, currentIndex: 0 }); setShowResults(false); } }}
          style={{ marginTop: 20, width: "100%", background: "none", border: "1px solid #2a2a2a", color: "#999", borderRadius: 10, padding: 12, cursor: "pointer", fontSize: 14 }}>Start a new set</button>
        <button onClick={rebuildQuestions} disabled={generating} style={{ marginTop: 10, width: "100%", background: "none", border: "none", color: "#777", fontSize: 13, padding: 8, cursor: "pointer" }}>{generating ? "Writing…" : "Write a fresh set of questions"}</button>
      </div>
    );
  }

  // ── 3. The jury box ──
  const q = session.questions[Math.min(session.currentIndex, session.questions.length - 1)];
  const last = session.currentIndex >= session.questions.length - 1;
  const qRatings = session.ratings[q.id] ?? {};
  const locked = !!session.layoutLocked;
  const askMode = session.askMode ?? "group";
  const shownQuestion = askMode === "individual" ? (q.individual || q.question) : q.question;
  const rate = (seat: number, val: "g" | "r") => {
    const cur = qRatings[String(seat)];
    const nextQ = { ...qRatings };
    if (cur === val) delete nextQ[String(seat)]; else nextQ[String(seat)] = val;
    update({ ...session, layout, ratings: { ...session.ratings, [q.id]: nextQ } });
  };
  const rename = (seat: number) => {
    const name = window.prompt(`${labelFor(seat)} — name or a note (optional)`, session.seatNames[String(seat)] ?? "");
    if (name === null) return;
    update({ ...session, layout, seatNames: { ...session.seatNames, [String(seat)]: name.trim() } });
  };
  const move = (seat: number, pos: { x: number; y: number }) => update({ ...session, layout: { ...layout, [String(seat)]: clampPos(pos) } });
  const setSeats = (n: number) => {
    const seats = Math.min(20, Math.max(2, n));
    const nextLayout = ensureLayout(layout, seats);
    if (seats < session.seats) for (let i = seats + 1; i <= session.seats; i++) delete nextLayout[String(i)];
    update({ ...session, seats, layout: nextLayout });
  };
  const seatIds = Array.from({ length: session.seats }, (_, i) => i + 1);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 130px" }}>
      {back("Cases", () => setCaseId(null))}
      <div style={{ fontSize: 11, color: "#555", fontWeight: 800, letterSpacing: 1, marginBottom: 6 }}>QUESTION {session.currentIndex + 1} OF {session.questions.length}</div>

      <div style={{ display: "flex", background: "#111", border: "1px solid #222", borderRadius: 999, padding: 3, marginBottom: 12, width: "fit-content" }}>
        {(["group", "individual"] as const).map(m => (
          <button key={m} onClick={() => update({ ...session, layout, askMode: m })}
            style={{ border: "none", borderRadius: 999, padding: "7px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", background: askMode === m ? ORANGE : "transparent", color: askMode === m ? "#0a0908" : "#888" }}>
            {m === "group" ? "Ask the group" : "Ask one by one"}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 18, fontWeight: 800, color: "#eee", lineHeight: 1.4, marginBottom: 6 }}>{shownQuestion}</div>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 12, lineHeight: 1.5 }}>
        {askMode === "group" ? "Ask the whole panel. Then tap red or green on each juror who answers — the others stay unrated." : "Ask each juror in turn, down the row, and tap red or green as each answers."}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        <div style={{ background: "#1a0d0d", border: `1px solid ${RED}55`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: "#f0b4b4", lineHeight: 1.45 }}><b style={{ color: RED }}>Red — a bad answer sounds like:</b> {q.bad}</div>
        <div style={{ background: "#0d1a10", border: `1px solid ${GREEN}55`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: "#b4f0c4", lineHeight: 1.45 }}><b style={{ color: GREEN }}>Green — listen for:</b> {q.good}</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1, fontSize: 11.5, color: "#666", lineHeight: 1.45 }}>
          {locked ? "Tap the red or green side of a chair. Tap its name to add who's sitting there." : "Drag each chair to where it really sits in the courtroom — any number of rows. Then lock the chairs."}
        </div>
        <button onClick={() => update({ ...session, layout, layoutLocked: !locked })}
          style={{ background: locked ? "#141414" : ORANGE, color: locked ? "#ccc" : "#0a0908", border: locked ? "1px solid #2a2a2a" : "none", borderRadius: 999, padding: "8px 14px", fontSize: 12.5, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>
          {locked ? "Move chairs" : "Lock chairs"}
        </button>
      </div>

      {!locked && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "#888" }}>Chairs:</span>
          <button onClick={() => setSeats(session.seats - 1)} style={{ width: 30, height: 30, borderRadius: 15, background: "#141414", border: "1px solid #2a2a2a", cursor: "pointer" }}><Minus size={13} color="#aaa" /></button>
          <b style={{ minWidth: 22, textAlign: "center" }}>{session.seats}</b>
          <button onClick={() => setSeats(session.seats + 1)} style={{ width: 30, height: 30, borderRadius: 15, background: "#141414", border: "1px solid #2a2a2a", cursor: "pointer" }}><Plus size={13} color="#aaa" /></button>
        </div>
      )}

      <SeatMap layout={layout} height={330} dashed={!locked} onMove={locked ? undefined : move}>
        {seat => {
          const cur = qRatings[String(seat)];
          const name = session.seatNames[String(seat)];
          return (
            <div style={{ width: 76 }}>
              <button onClick={locked ? () => rename(seat) : undefined} style={{ display: "block", width: "100%", background: "none", border: "none", color: "#aaa", fontSize: 11, fontWeight: 700, marginBottom: 3, cursor: locked ? "pointer" : "grab", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", touchAction: "none", pointerEvents: locked ? "auto" : "none" }}>
                <span style={{ color: "#fff", fontWeight: 900, fontSize: 13 }}>{numbers[String(seat)]}</span>{name ? ` · ${name}` : ""}
              </button>
              <div style={{ display: "flex", height: 54, borderRadius: 14, overflow: "hidden", border: `1.5px ${locked ? "solid" : "dashed"} ${locked ? "#2a2a2a" : ORANGE}`, opacity: locked ? 1 : 0.85 }}>
                <button aria-label={`Seat ${numbers[String(seat)]} bad answer`} onClick={() => { if (locked) rate(seat, "r"); }}
                  style={{ pointerEvents: locked ? "auto" : "none", flex: 1, border: "none", cursor: locked ? "pointer" : "grab", background: cur === "r" ? RED : cur === "g" ? "#2a1212" : `${RED}55`, transition: "background .12s", touchAction: "none" }} />
                <button aria-label={`Seat ${numbers[String(seat)]} good answer`} onClick={() => { if (locked) rate(seat, "g"); }}
                  style={{ pointerEvents: locked ? "auto" : "none", flex: 1, border: "none", cursor: locked ? "pointer" : "grab", background: cur === "g" ? GREEN : cur === "r" ? "#0f2416" : `${GREEN}55`, transition: "background .12s", touchAction: "none" }} />
              </div>
            </div>
          );
        }}
      </SeatMap>

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button disabled={session.currentIndex === 0} onClick={() => update({ ...session, layout, currentIndex: session.currentIndex - 1 })}
          style={{ flex: 1, background: "none", border: "1px solid #2a2a2a", color: session.currentIndex === 0 ? "#444" : "#bbb", borderRadius: 12, padding: 13, cursor: session.currentIndex === 0 ? "default" : "pointer", fontWeight: 700 }}>Previous</button>
        {last ? (
          <button onClick={() => setShowResults(true)} style={{ flex: 2, background: ORANGE, color: "#0a0908", border: "none", borderRadius: 12, padding: 13, fontWeight: 800, cursor: "pointer" }}>See who to keep</button>
        ) : (
          <button onClick={() => update({ ...session, layout, currentIndex: session.currentIndex + 1 })} style={{ flex: 2, background: ORANGE, color: "#0a0908", border: "none", borderRadius: 12, padding: 13, fontWeight: 800, cursor: "pointer" }}>Next question</button>
        )}
      </div>
      <button onClick={() => setShowResults(true)} style={{ marginTop: 10, width: "100%", background: "none", border: "none", color: "#777", fontSize: 13, padding: 8, cursor: "pointer" }}>Skip to results</button>
      <button onClick={rebuildQuestions} disabled={generating} style={{ width: "100%", background: "none", border: "none", color: "#666", fontSize: 12.5, padding: 6, cursor: "pointer" }}>{generating ? "Writing…" : "Write a fresh set of questions (group + one-by-one wording)"}</button>
      {error && <div style={{ color: RED, fontSize: 13, marginTop: 6, textAlign: "center" }}>{error}</div>}
      {void seatIds}
    </div>
  );
}

/**
 * The seating area. Chairs sit at the positions the person chose (fractions of the box), so any courtroom
 * shape works. With `onMove`, chairs can be dragged (touch or mouse) and snap to a light grid.
 */
function SeatMap({ layout, height, dashed, onMove, children }: {
  layout: Layout;
  height: number;
  dashed?: boolean;
  onMove?: (seat: number, pos: { x: number; y: number }) => void;
  children: (seat: number) => React.ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ seat: number } | null>(null);
  const [live, setLive] = useState<Record<string, { x: number; y: number }>>({});

  const pos = (e: React.PointerEvent) => {
    const r = boxRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  return (
    <div ref={boxRef} style={{ position: "relative", width: "100%", height, background: dashed ? "repeating-linear-gradient(0deg,#0d0d0d,#0d0d0d 19px,#141414 20px)" : "#0b0b0b", border: `1px ${dashed ? "dashed" : "solid"} ${dashed ? ORANGE + "66" : "#1a1a1a"}`, borderRadius: 14, overflow: "hidden", touchAction: onMove ? "none" : "auto" }}>
      {Object.keys(layout).map(id => {
        const seat = Number(id);
        const p = live[id] ?? layout[id];
        return (
          <div key={id}
            onPointerDown={onMove ? e => { dragRef.current = { seat }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } : undefined}
            onPointerMove={onMove ? e => { if (dragRef.current?.seat === seat) setLive(l => ({ ...l, [id]: pos(e) })); } : undefined}
            onPointerUp={onMove ? e => { if (dragRef.current?.seat === seat) { const np = pos(e); dragRef.current = null; setLive(l => { const n = { ...l }; delete n[id]; return n; }); onMove(seat, np); } } : undefined}
            onPointerCancel={onMove ? () => { dragRef.current = null; setLive({}); } : undefined}
            style={{ position: "absolute", left: `${p.x * 100}%`, top: `${p.y * 100}%`, transform: "translate(-50%, -50%)", cursor: onMove ? "grab" : "default", touchAction: onMove ? "none" : "auto", zIndex: live[id] ? 5 : 1 }}>
            {children(seat)}
          </div>
        );
      })}
    </div>
  );
}

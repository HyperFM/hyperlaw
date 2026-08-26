import React, { useState } from "react";
import { ChevronRight, ArrowLeft, SquareUser, Plus, Check, X, AlertCircle, Pencil, Trash2, Info } from "lucide-react";
import type { HLCase, WitnessExamination, WitnessQAEntry } from "../../types";
import { api } from "../../lib/api";

const ORANGE = "#d9711f";

interface Props {
  cases: HLCase[];
  onUpdateCase: (c: HLCase) => void;
  onBack: () => void;
}

function saveCase(c: HLCase, onUpdateCase: (c: HLCase) => void) {
  onUpdateCase(c);
  api.cases.upsert(c.id, c.title, c.workflowStage, c as unknown as Record<string, unknown>).catch(() => {});
}

export default function WitnessExaminationView({ cases, onUpdateCase, onBack }: Props) {
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [activeExamId, setActiveExamId] = useState<string | null>(null);

  const selectedCase = cases.find(c => c.id === selectedCaseId) ?? null;
  const examinations = selectedCase?.witnessExaminations ?? [];
  const activeExam = examinations.find(e => e.id === activeExamId) ?? null;

  function updateExaminations(caseObj: HLCase, updated: WitnessExamination[]) {
    saveCase({ ...caseObj, witnessExaminations: updated }, onUpdateCase);
  }

  // ── Case list ──────────────────────────────────────────────────────────────
  if (!selectedCase) {
    const sorted = [...cases].sort((a, b) => {
      const av = a.witnessExaminations?.[0]?.updatedAt ?? 0;
      const bv = b.witnessExaminations?.[0]?.updatedAt ?? 0;
      return bv - av;
    });
    return (
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 20px 120px" }}>
          <button onClick={onBack}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 18, display: "flex", alignItems: "center", gap: 6, color: "#666", fontSize: 13, fontWeight: 700 }}>
            <ArrowLeft size={15} /> Tools
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: `${ORANGE}16`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <SquareUser size={19} color={ORANGE} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>Witness Examination</div>
          </div>
          <div style={{ color: "#666", fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>
            Capture questions and answers live while a witness is on the stand — one tap for yes/no, type in anything more. Nothing gets lost, and unanswered questions stay flagged so you can circle back.
          </div>

          <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>SELECT A CASE</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sorted.map(c => {
              const count = c.witnessExaminations?.length ?? 0;
              return (
                <button key={c.id} onClick={() => setSelectedCaseId(c.id)}
                  style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, padding: "16px", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, width: "100%" }}>
                  <div style={{ width: 40, height: 40, background: "#1a1a1a", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <SquareUser size={18} color={ORANGE} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
                    <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
                      {count === 0 ? "No examinations yet" : `${count} examination${count !== 1 ? "s" : ""}`}
                    </div>
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

  // ── Examination list for the selected case ──────────────────────────────────
  if (!activeExam) {
    const parties = selectedCase.parties;
    const examinedPartyIds = new Set(examinations.filter(e => e.partyId).map(e => e.partyId));

    function startExamination(witnessName: string, opts: { partyId?: string; purpose?: string; examinationType?: "direct" | "cross" }) {
      const now = Date.now();
      const newExam: WitnessExamination = {
        id: crypto.randomUUID(), caseId: selectedCase!.id, witnessName,
        partyId: opts.partyId, purpose: opts.purpose, examinationType: opts.examinationType,
        questions: [], createdAt: now, updatedAt: now,
      };
      updateExaminations(selectedCase!, [...examinations, newExam]);
      setActiveExamId(newExam.id);
    }

    return (
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 20px 120px" }}>
          <button onClick={() => setSelectedCaseId(null)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 18, display: "flex", alignItems: "center", gap: 6, color: "#666", fontSize: 13, fontWeight: 700 }}>
            <ArrowLeft size={15} /> All cases
          </button>
          <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 12 }}>{selectedCase.title}</div>

          <div style={{ background: "#0d1a2a", border: "1px solid #1a3060", borderRadius: 12, padding: "12px 14px", marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Info size={14} color="#7ab0e0" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12.5, color: "#7ab0e0", lineHeight: 1.55 }}>
              This is for preparing beforehand — working out questions ahead of time, not something to fill out live in the courtroom during your actual court date.
            </div>
          </div>

          {parties.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>ALREADY IN THIS CASE</div>
              <div style={{ fontSize: 12, color: "#666", lineHeight: 1.5, marginBottom: 10 }}>
                Pick whoever's already been subpoenaed or is expected to testify — HyperLaw already knows their role and history on this case, so there's nothing extra to fill in.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {parties.map(p => {
                  const name = [p.firstName, p.lastName].filter(Boolean).join(" ") || "Unnamed party";
                  const already = examinedPartyIds.has(p.id);
                  return (
                    <button key={p.id} onClick={() => startExamination(name, { partyId: p.id })}
                      style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, padding: "12px 14px", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 14, color: "#fff" }}>{name}</div>
                        <div style={{ fontSize: 11.5, color: "#666", marginTop: 1 }}>
                          {[p.title, p.agency].filter(Boolean).join(", ") || p.type}
                          {already ? " · already has an examination" : ""}
                        </div>
                      </div>
                      <ChevronRight size={15} color="#333" style={{ flexShrink: 0 }} />
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <NewExaminationButton onCreate={(witnessName, purpose, examinationType) => startExamination(witnessName, { purpose, examinationType })} />

          {examinations.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
              <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 2 }}>EXAMINATIONS</div>
              {[...examinations].sort((a, b) => b.updatedAt - a.updatedAt).map(exam => {
                const unanswered = exam.questions.filter(q => !q.yesNo && !q.answerText?.trim()).length;
                return (
                  <button key={exam.id} onClick={() => setActiveExamId(exam.id)}
                    style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, padding: "16px", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, width: "100%" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: "#fff" }}>{exam.witnessName}</div>
                      <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
                        {exam.examinationType ? `${exam.examinationType === "direct" ? "Direct" : "Cross"} · ` : ""}
                        {exam.questions.length} question{exam.questions.length !== 1 ? "s" : ""}
                        {unanswered > 0 ? ` · ${unanswered} unanswered` : ""}
                      </div>
                    </div>
                    {unanswered > 0 && <AlertCircle size={15} color="#f59e0b" style={{ flexShrink: 0 }} />}
                    <ChevronRight size={16} color="#333" style={{ flexShrink: 0 }} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Active examination — the live Q&A capture flow ──────────────────────────
  const unansweredCount = activeExam.questions.filter(q => !q.yesNo && !q.answerText?.trim()).length;

  function saveEntry(entry: WitnessQAEntry) {
    if (!selectedCase || !activeExam) return;
    const exists = activeExam.questions.some(q => q.id === entry.id);
    const updatedQuestions = exists
      ? activeExam.questions.map(q => (q.id === entry.id ? entry : q))
      : [...activeExam.questions, entry];
    const updatedExam: WitnessExamination = { ...activeExam, questions: updatedQuestions, updatedAt: Date.now() };
    updateExaminations(selectedCase, examinations.map(e => (e.id === updatedExam.id ? updatedExam : e)));
  }

  function deleteEntry(id: string) {
    if (!selectedCase || !activeExam) return;
    const updatedExam: WitnessExamination = { ...activeExam, questions: activeExam.questions.filter(q => q.id !== id), updatedAt: Date.now() };
    updateExaminations(selectedCase, examinations.map(e => (e.id === updatedExam.id ? updatedExam : e)));
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "20px 20px 160px" }}>
        <button onClick={() => setActiveExamId(null)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 18, display: "flex", alignItems: "center", gap: 6, color: "#666", fontSize: 13, fontWeight: 700 }}>
          <ArrowLeft size={15} /> {selectedCase.title}
        </button>

        <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 2 }}>{activeExam.witnessName}</div>
        <div style={{ fontSize: 12, color: "#666", marginBottom: 18 }}>
          {activeExam.examinationType === "direct" ? "Direct examination" : activeExam.examinationType === "cross" ? "Cross examination" : "Examination"}
        </div>

        {unansweredCount > 0 && (
          <div style={{ background: "#1f1400", border: "1.5px solid #f59e0b", borderRadius: 12, padding: "10px 14px", marginBottom: 16, display: "flex", gap: 8, alignItems: "center" }}>
            <AlertCircle size={14} color="#f59e0b" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 12.5, color: "#ffcf7a" }}>
              {unansweredCount} question{unansweredCount !== 1 ? "s" : ""} still need{unansweredCount === 1 ? "s" : ""} an answer — ask again when you get the chance.
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
          {activeExam.questions.map((q, i) => (
            <QAEntryCard key={q.id} index={i} entry={q} onSave={saveEntry} onDelete={() => deleteEntry(q.id)} />
          ))}
        </div>

        <NewQuestionComposer onSave={entry => saveEntry(entry)} />
      </div>
    </div>
  );
}

function NewExaminationButton({ onCreate }: { onCreate: (witnessName: string, purpose: string, examinationType?: "direct" | "cross") => void }) {
  const [open, setOpen] = useState(false);
  const [witnessName, setWitnessName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [examinationType, setExaminationType] = useState<"direct" | "cross" | undefined>(undefined);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        style={{ width: "100%", background: ORANGE, border: "none", borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", fontWeight: 800, fontSize: 14, color: "#000" }}>
        <Plus size={16} /> Add New Examination Personnel
      </button>
    );
  }
  return (
    <div style={{ background: "#111", border: `1px solid ${ORANGE}55`, borderRadius: 14, padding: 16 }}>
      <div style={{ fontSize: 12, color: "#999", fontWeight: 700, marginBottom: 8 }}>NAME</div>
      <input autoFocus value={witnessName} onChange={e => setWitnessName(e.target.value)}
        placeholder="e.g. the clerk upstairs"
        style={{ width: "100%", background: "#0a0a0a", border: "1px solid #252525", borderRadius: 10, padding: "10px 12px", fontSize: 14, color: "#fff", boxSizing: "border-box", marginBottom: 14 }} />
      <div style={{ fontSize: 12, color: "#999", fontWeight: 700, marginBottom: 8 }}>WHY ARE THEY BEING EXAMINED?</div>
      <div style={{ fontSize: 11.5, color: "#666", lineHeight: 1.5, marginBottom: 8 }}>
        Not an existing party on this case, so there's nothing on file about them yet — what's their purpose, in your own words? e.g. "the clerk upstairs, never had an issue with me in two years, can speak to my good faith and that I only asked a question, never demanded or hollered."
      </div>
      <textarea value={purpose} onChange={e => setPurpose(e.target.value)}
        placeholder="What is their purpose?"
        style={{ width: "100%", minHeight: 70, background: "#0a0a0a", border: "1px solid #252525", borderRadius: 10, padding: "10px 12px", fontSize: 13.5, color: "#fff", lineHeight: 1.5, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", marginBottom: 14 }} />
      <div style={{ fontSize: 12, color: "#999", fontWeight: 700, marginBottom: 8 }}>TYPE (OPTIONAL)</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["direct", "cross"] as const).map(t => (
          <button key={t} onClick={() => setExaminationType(v => (v === t ? undefined : t))}
            style={{ flex: 1, background: examinationType === t ? ORANGE : "#0a0a0a", border: `1px solid ${examinationType === t ? ORANGE : "#252525"}`, borderRadius: 10, padding: "9px", fontSize: 13, fontWeight: 700, color: examinationType === t ? "#000" : "#999", cursor: "pointer", textTransform: "capitalize" }}>
            {t}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => setOpen(false)}
          style={{ flex: 1, background: "none", border: "1px solid #333", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 700, color: "#999", cursor: "pointer" }}>
          Cancel
        </button>
        <button onClick={() => { if (witnessName.trim()) onCreate(witnessName.trim(), purpose.trim(), examinationType); }} disabled={!witnessName.trim()}
          style={{ flex: 1, background: witnessName.trim() ? ORANGE : "#2a2a2a", border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 800, color: witnessName.trim() ? "#000" : "#666", cursor: witnessName.trim() ? "pointer" : "default" }}>
          Start
        </button>
      </div>
    </div>
  );
}

/** A single saved question. Answered ones show read-only with a tap-to-edit
 *  affordance; unanswered ones stay open in edit mode by default so they're
 *  impossible to miss in the list, not just flagged at the top. */
function QAEntryCard({ index, entry, onSave, onDelete }: { index: number; entry: WitnessQAEntry; onSave: (e: WitnessQAEntry) => void; onDelete: () => void }) {
  const isAnswered = !!entry.yesNo || !!entry.answerText?.trim();
  const [editing, setEditing] = useState(!isAnswered);
  const [question, setQuestion] = useState(entry.question);
  const [yesNo, setYesNo] = useState<"yes" | "no" | undefined>(entry.yesNo);
  const [answerText, setAnswerText] = useState(entry.answerText ?? "");

  function commit() {
    onSave({
      ...entry, question,
      yesNo, answerText: answerText.trim() || undefined,
      answeredAt: yesNo || answerText.trim() ? Date.now() : entry.answeredAt,
    });
    setEditing(false);
  }

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)}
        style={{ background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 12, padding: "12px 14px", textAlign: "left", cursor: "pointer", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ fontSize: 10, color: ORANGE, fontWeight: 800, flexShrink: 0, marginTop: 2 }}>Q{index + 1}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, color: "#eee", lineHeight: 1.5 }}>{entry.question}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              {entry.yesNo && (
                <span style={{ fontSize: 11, fontWeight: 800, color: entry.yesNo === "yes" ? "#22c55e" : "#ef4444", background: entry.yesNo === "yes" ? "#0f2a17" : "#2a0f0f", borderRadius: 6, padding: "2px 8px", textTransform: "uppercase" }}>
                  {entry.yesNo}
                </span>
              )}
              {entry.answerText && <span style={{ fontSize: 12.5, color: "#999", lineHeight: 1.5 }}>{entry.answerText}</span>}
            </div>
          </div>
          <Pencil size={13} color="#444" style={{ flexShrink: 0, marginTop: 2 }} />
        </div>
      </button>
    );
  }

  return (
    <div style={{ background: "#0d0d0d", border: `1.5px solid ${isAnswered ? "#2a2a2a" : "#f59e0b"}`, borderRadius: 12, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: ORANGE, fontWeight: 800 }}>Q{index + 1}</div>
        <button onClick={onDelete} title="Delete this question" style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex" }}>
          <Trash2 size={13} color="#5a3030" />
        </button>
      </div>
      <textarea value={question} onChange={e => setQuestion(e.target.value)}
        placeholder="What was asked?"
        style={{ width: "100%", minHeight: 44, background: "#111", border: "1px solid #252525", borderRadius: 8, padding: "8px 10px", fontSize: 13.5, color: "#fff", lineHeight: 1.5, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", marginBottom: 10 }} />
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button onClick={() => setYesNo(v => (v === "yes" ? undefined : "yes"))}
          style={{ flex: 1, background: yesNo === "yes" ? "#22c55e" : "#111", border: `1px solid ${yesNo === "yes" ? "#22c55e" : "#252525"}`, borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 800, color: yesNo === "yes" ? "#000" : "#999", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Check size={14} /> Yes
        </button>
        <button onClick={() => setYesNo(v => (v === "no" ? undefined : "no"))}
          style={{ flex: 1, background: yesNo === "no" ? "#ef4444" : "#111", border: `1px solid ${yesNo === "no" ? "#ef4444" : "#252525"}`, borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 800, color: yesNo === "no" ? "#000" : "#999", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <X size={14} /> No
        </button>
      </div>
      <textarea value={answerText} onChange={e => setAnswerText(e.target.value)}
        placeholder="Exactly what they said, if more than yes/no…"
        style={{ width: "100%", minHeight: 40, background: "#111", border: "1px solid #252525", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "#ccc", lineHeight: 1.5, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", marginBottom: 10 }} />
      <div style={{ display: "flex", gap: 8 }}>
        {isAnswered && (
          <button onClick={() => setEditing(false)}
            style={{ flex: 1, background: "none", border: "1px solid #333", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 700, color: "#999", cursor: "pointer" }}>
            Cancel
          </button>
        )}
        <button onClick={commit} disabled={!question.trim()}
          style={{ flex: 2, background: question.trim() ? ORANGE : "#2a2a2a", border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 800, color: question.trim() ? "#000" : "#666", cursor: question.trim() ? "pointer" : "default" }}>
          {yesNo || answerText.trim() ? "Save Answer" : "Save — Ask Again Later"}
        </button>
      </div>
    </div>
  );
}

/** The always-present composer for the next question — separate from
 *  QAEntryCard so typing a new question never fights with editing an
 *  existing one, and it always clears itself after a save. */
function NewQuestionComposer({ onSave }: { onSave: (entry: WitnessQAEntry) => void }) {
  const [question, setQuestion] = useState("");
  const [yesNo, setYesNo] = useState<"yes" | "no" | undefined>(undefined);
  const [answerText, setAnswerText] = useState("");

  function commit() {
    if (!question.trim()) return;
    const now = Date.now();
    onSave({
      id: crypto.randomUUID(), question: question.trim(),
      yesNo, answerText: answerText.trim() || undefined,
      askedAt: now, answeredAt: yesNo || answerText.trim() ? now : undefined,
    });
    setQuestion(""); setYesNo(undefined); setAnswerText("");
  }

  return (
    <div style={{ background: "#111", border: `1px solid ${ORANGE}55`, borderRadius: 14, padding: 16, position: "sticky", bottom: 16 }}>
      <div style={{ fontSize: 11, color: ORANGE, fontWeight: 800, letterSpacing: 0.5, marginBottom: 10 }}>NEXT QUESTION</div>
      <textarea value={question} onChange={e => setQuestion(e.target.value)}
        placeholder="Type the question as it's asked…"
        style={{ width: "100%", minHeight: 44, background: "#0a0a0a", border: "1px solid #252525", borderRadius: 8, padding: "8px 10px", fontSize: 13.5, color: "#fff", lineHeight: 1.5, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", marginBottom: 10 }} />
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button onClick={() => setYesNo(v => (v === "yes" ? undefined : "yes"))}
          style={{ flex: 1, background: yesNo === "yes" ? "#22c55e" : "#0a0a0a", border: `1px solid ${yesNo === "yes" ? "#22c55e" : "#252525"}`, borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 800, color: yesNo === "yes" ? "#000" : "#999", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Check size={14} /> Yes
        </button>
        <button onClick={() => setYesNo(v => (v === "no" ? undefined : "no"))}
          style={{ flex: 1, background: yesNo === "no" ? "#ef4444" : "#0a0a0a", border: `1px solid ${yesNo === "no" ? "#ef4444" : "#252525"}`, borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 800, color: yesNo === "no" ? "#000" : "#999", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <X size={14} /> No
        </button>
      </div>
      <textarea value={answerText} onChange={e => setAnswerText(e.target.value)}
        placeholder="Exactly what they said, if more than yes/no…"
        style={{ width: "100%", minHeight: 40, background: "#0a0a0a", border: "1px solid #252525", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "#ccc", lineHeight: 1.5, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", marginBottom: 10 }} />
      <button onClick={commit} disabled={!question.trim()}
        style={{ width: "100%", background: question.trim() ? ORANGE : "#2a2a2a", border: "none", borderRadius: 10, padding: "12px", fontSize: 14, fontWeight: 800, color: question.trim() ? "#000" : "#666", cursor: question.trim() ? "pointer" : "default" }}>
        {yesNo || answerText.trim() ? "Save & Next Question" : "Save Unanswered — Ask Again Later"}
      </button>
    </div>
  );
}

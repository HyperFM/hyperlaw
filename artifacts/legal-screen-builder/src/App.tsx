import React, { useState, useEffect, useRef } from "react";
import {
  Home, Folder, Plus, GraduationCap, User, ChevronRight, ChevronLeft,
  X, Edit3, Trash2, ArrowRight, Key, Clock, AlertCircle, BookOpen,
  Settings, Star, Brain, Sliders, History, Archive, Copy, Check,
  FileText, MessageSquare,
} from "lucide-react";
import { Incident, HLCase, AppData } from "./types";
import {
  loadData, saveData, addIncident, updateIncident, deleteIncident,
  addCase, updateCase, deleteCase, addIncidentToCase,
} from "./store";
import { staticTutorService, TutorAnalysis } from "./services/tutor";

// ─── Constants ────────────────────────────────────────────────────────────────
const ORANGE = "#d9711f";
const BG = "#0a0a0a";

// ─── Utility ──────────────────────────────────────────────────────────────────
function useWindowWidth() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return w;
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// ─── UI Primitives ────────────────────────────────────────────────────────────
interface TapBtnProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "orange" | "ghost" | "dim";
  style?: React.CSSProperties;
  disabled?: boolean;
}
function TapBtn({ children, onClick, variant = "ghost", style, disabled }: TapBtnProps) {
  const base: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 10,
    padding: "11px 16px", fontWeight: 700, fontSize: 14,
    cursor: disabled ? "not-allowed" : "pointer", border: "none",
    transition: "opacity 0.15s", WebkitTapHighlightColor: "transparent",
    touchAction: "manipulation", opacity: disabled ? 0.4 : 1,
  };
  const v = {
    orange: { background: ORANGE, color: "#000" },
    ghost: { background: "#1a1a1a", color: "#ccc", border: "1px solid #2a2a2a" } as React.CSSProperties,
    dim: { background: "transparent", color: "#555", border: "1px solid #222" } as React.CSSProperties,
  };
  return <button onClick={disabled ? undefined : onClick} style={{ ...base, ...v[variant], ...style }}>{children}</button>;
}

// ─── Error Boundary ───────────────────────────────────────────────────────────
interface EBState { error: Error | null }
class ErrorBoundary extends React.Component<{ children: React.ReactNode; onReset: () => void }, EBState> {
  constructor(props: { children: React.ReactNode; onReset: () => void }) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e: Error): EBState { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <AlertCircle size={40} color={ORANGE} style={{ marginBottom: 16 }} />
        <div style={{ color: "#ccc", marginBottom: 20 }}>Something went wrong.</div>
        <TapBtn variant="orange" onClick={() => { this.setState({ error: null }); this.props.onReset(); }}>Reset</TapBtn>
      </div>
    );
    return this.props.children;
  }
}

// ─── NEW INCIDENT OVERLAY ─────────────────────────────────────────────────────
function NewIncidentOverlay({ onSave, onClose }: {
  onSave: (title: string, description: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visible, setVisible] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 20);
    const t2 = setTimeout(() => textRef.current?.focus(), 150);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  function handleSave() {
    const t = title.trim() || description.trim().split("\n")[0].slice(0, 70) || "Untitled Incident";
    onSave(t, description.trim());
  }

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 300);
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: `rgba(0,0,0,${visible ? 0.97 : 0})`,
      transition: "background 0.3s",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        transform: `translateY(${visible ? 0 : 32}px)`,
        transition: "transform 0.3s ease",
        maxWidth: 720, width: "100%", margin: "0 auto",
      }}>
        <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #1a1a1a", flexShrink: 0 }}>
          <div style={{ fontWeight: 900, fontSize: 18, color: ORANGE }}>New Incident</div>
          <button onClick={handleClose} style={{ background: "#1a1a1a", border: "none", borderRadius: 20, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={18} color="#aaa" />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px" }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>TITLE <span style={{ color: "#333", fontWeight: 400 }}>(optional — auto-filled from description)</span></div>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Brief label for this incident"
              style={{ width: "100%", background: "#111", border: "1px solid #2a2a2a", borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 15, fontFamily: "Arial, sans-serif", outline: "none", boxSizing: "border-box" }}
              onFocus={e => (e.target.style.borderColor = ORANGE)}
              onBlur={e => (e.target.style.borderColor = "#2a2a2a")}
            />
          </div>

          <div>
            <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>DESCRIBE WHAT HAPPENED</div>
            <div style={{ fontSize: 13, color: "#444", marginBottom: 12, lineHeight: 1.6 }}>
              Write everything you remember — who was involved, what was said, what happened, and in what order. Include dates, locations, and names if you know them. You can always edit this later.
            </div>
            <textarea
              ref={textRef}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={"On [date], I was at [location] when [person] did [action]...\n\nBe as specific as possible. Include what was said, what order things happened, who else was there."}
              rows={12}
              style={{ width: "100%", background: "#111", border: "1px solid #2a2a2a", borderRadius: 10, padding: "14px", color: "#fff", fontSize: 15, fontFamily: "Georgia, serif", outline: "none", boxSizing: "border-box", resize: "vertical", lineHeight: 1.75 }}
              onFocus={e => (e.target.style.borderColor = ORANGE)}
              onBlur={e => (e.target.style.borderColor = "#2a2a2a")}
            />
            <div style={{ textAlign: "right", color: "#333", fontSize: 12, marginTop: 4 }}>
              {description.trim().split(/\s+/).filter(Boolean).length} words
            </div>
          </div>
        </div>

        <div style={{ padding: "16px 20px", borderTop: "1px solid #1a1a1a", display: "flex", gap: 10, flexShrink: 0, paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
          <TapBtn variant="dim" onClick={handleClose}>Cancel</TapBtn>
          <TapBtn variant="orange" onClick={handleSave} disabled={!description.trim()} style={{ flex: 1, justifyContent: "center" }}>
            Save Incident <ArrowRight size={16} />
          </TapBtn>
        </div>
      </div>
    </div>
  );
}

// ─── HOME VIEW ────────────────────────────────────────────────────────────────
function HomeView({ data, onOpenIncident, onOpenCase, onNewIncident }: {
  data: AppData;
  onOpenIncident: (i: Incident) => void;
  onOpenCase: (c: HLCase) => void;
  onNewIncident: () => void;
}) {
  const recentIncidents = [...data.incidents].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
  const recentCases = [...data.cases].sort((a, b) => b.createdAt - a.createdAt).slice(0, 3);
  const hasContent = data.incidents.length > 0 || data.cases.length > 0;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "28px 20px 120px" }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <img src="/hyperlaw-logo.png" alt="HL" style={{ width: 32, height: 32, borderRadius: 8 }} />
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.5 }}>HyperLaw</div>
        </div>
        <div style={{ color: "#444", fontSize: 14, lineHeight: 1.5 }}>Describe what happened. Organize it clearly. Build from it later.</div>
      </div>

      {!hasContent ? (
        <div style={{ textAlign: "center", paddingTop: 48 }}>
          <div style={{ fontSize: 48, marginBottom: 20 }}>📝</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 10, letterSpacing: -0.3 }}>Start by describing what happened</div>
          <div style={{ color: "#555", fontSize: 15, marginBottom: 36, lineHeight: 1.65, maxWidth: 340, margin: "0 auto 36px" }}>
            Create your first incident — write everything out in plain language. HyperLaw will help you organize it from there.
          </div>
          <TapBtn variant="orange" onClick={onNewIncident} style={{ fontSize: 16, padding: "14px 28px" }}>
            <Plus size={18} /> New Incident
          </TapBtn>
        </div>
      ) : (
        <>
          {recentIncidents.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 12 }}>RECENT INCIDENTS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {recentIncidents.map(incident => (
                  <button key={incident.id} onClick={() => onOpenIncident(incident)}
                    style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, padding: "14px 16px", textAlign: "left", cursor: "pointer", width: "100%", display: "flex", alignItems: "flex-start", gap: 12 }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE + "66")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "#1e1e1e")}>
                    <FileText size={16} color={ORANGE} style={{ flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{incident.title}</div>
                      <div style={{ color: "#555", fontSize: 13, lineHeight: 1.4 }}>{truncate(incident.description, 90)}</div>
                      <div style={{ color: "#333", fontSize: 11, marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
                        <Clock size={10} color="#333" /> {formatDate(incident.createdAt)}
                        {incident.caseId && data.cases.find(c => c.id === incident.caseId) && (
                          <><span style={{ color: "#2a2a2a" }}>·</span> <span style={{ color: ORANGE + "88" }}>{data.cases.find(c => c.id === incident.caseId)!.title}</span></>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={14} color="#333" style={{ flexShrink: 0, marginTop: 4 }} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {recentCases.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 12 }}>CASES</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {recentCases.map(c => (
                  <button key={c.id} onClick={() => onOpenCase(c)}
                    style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, padding: "14px 16px", textAlign: "left", cursor: "pointer", width: "100%", display: "flex", alignItems: "center", gap: 12 }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE + "66")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "#1e1e1e")}>
                    <Folder size={18} color={ORANGE} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{c.title}</div>
                      <div style={{ color: "#555", fontSize: 13 }}>{c.incidentIds.length} incident{c.incidentIds.length !== 1 ? "s" : ""}</div>
                    </div>
                    <ChevronRight size={14} color="#333" style={{ flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            </div>
          )}

          <TapBtn variant="orange" onClick={onNewIncident} style={{ width: "100%", justifyContent: "center" }}>
            <Plus size={16} /> New Incident
          </TapBtn>
        </>
      )}
    </div>
  );
}

// ─── INCIDENT DETAIL VIEW ─────────────────────────────────────────────────────
function IncidentDetailView({ incident, cases, onUpdate, onDelete, onConvertToCase, onAddToCase, onOpenInTutor, onBack }: {
  incident: Incident; cases: HLCase[];
  onUpdate: (i: Incident) => void; onDelete: (id: string) => void;
  onConvertToCase: (i: Incident) => void; onAddToCase: (incidentId: string, caseId: string) => void;
  onOpenInTutor: (i: Incident) => void; onBack: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(incident.title);
  const [editDesc, setEditDesc] = useState(incident.description);
  const [showCasePicker, setShowCasePicker] = useState(false);
  const linkedCase = cases.find(c => c.id === incident.caseId);
  const availableCases = cases.filter(c => c.id !== incident.caseId);

  function saveEdit() {
    onUpdate({ ...incident, title: editTitle.trim() || incident.title, description: editDesc });
    setEditing(false);
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#666", display: "flex", alignItems: "center", gap: 4, padding: "4px 0" }}>
          <ChevronLeft size={18} /><span style={{ fontSize: 13, fontWeight: 700 }}>Back</span>
        </button>
        <div style={{ flex: 1 }} />
        {!editing ? (
          <>
            <button onClick={() => { setEditTitle(incident.title); setEditDesc(incident.description); setEditing(true); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: 8 }}><Edit3 size={16} /></button>
            <button onClick={() => { if (window.confirm("Delete this incident?")) onDelete(incident.id); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: 8 }}><Trash2 size={16} /></button>
          </>
        ) : (
          <>
            <TapBtn variant="dim" onClick={() => setEditing(false)} style={{ padding: "8px 12px", fontSize: 12 }}>Cancel</TapBtn>
            <TapBtn variant="orange" onClick={saveEdit} style={{ padding: "8px 12px", fontSize: 12 }}>Save</TapBtn>
          </>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px 48px" }}>
        {editing ? (
          <>
            <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
              style={{ width: "100%", background: "#111", border: `1px solid ${ORANGE}`, borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 18, fontWeight: 800, outline: "none", boxSizing: "border-box", marginBottom: 16 }} />
            <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={16}
              style={{ width: "100%", background: "#111", border: `1px solid ${ORANGE}`, borderRadius: 10, padding: "14px", color: "#fff", fontSize: 15, fontFamily: "Georgia, serif", outline: "none", boxSizing: "border-box", resize: "vertical", lineHeight: 1.75 }} />
          </>
        ) : (
          <>
            <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 6, letterSpacing: -0.3, lineHeight: 1.2 }}>{incident.title}</div>
            <div style={{ color: "#444", fontSize: 13, marginBottom: 28, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Clock size={11} color="#444" /> {formatDate(incident.createdAt)}
              {linkedCase && <><span style={{ color: "#2a2a2a" }}>·</span><span style={{ color: ORANGE }}>In: {linkedCase.title}</span></>}
            </div>
            <div style={{ fontSize: 16, lineHeight: 1.85, color: "#ccc", fontFamily: "Georgia, serif", whiteSpace: "pre-wrap" }}>{incident.description}</div>

            <div style={{ marginTop: 40, borderTop: "1px solid #1a1a1a", paddingTop: 24 }}>
              <div style={{ fontSize: 11, color: "#333", fontWeight: 700, letterSpacing: 0.5, marginBottom: 12 }}>ACTIONS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <TapBtn variant="orange" onClick={() => onOpenInTutor(incident)} style={{ justifyContent: "center" }}>
                  <GraduationCap size={16} /> Open in Tutor
                </TapBtn>
                {!incident.caseId && (
                  <TapBtn variant="ghost" onClick={() => onConvertToCase(incident)} style={{ justifyContent: "center" }}>
                    <Folder size={16} /> Convert to New Case
                  </TapBtn>
                )}
                {availableCases.length > 0 && (
                  <TapBtn variant="ghost" onClick={() => setShowCasePicker(true)} style={{ justifyContent: "center" }}>
                    <Plus size={16} /> Add to Existing Case
                  </TapBtn>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {showCasePicker && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 150, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "#111", borderRadius: "20px 20px 0 0", width: "100%", padding: "20px 20px calc(20px + env(safe-area-inset-bottom))" }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 16 }}>Add to Case</div>
            {availableCases.map(c => (
              <button key={c.id} onClick={() => { onAddToCase(incident.id, c.id); setShowCasePicker(false); }}
                style={{ width: "100%", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 12, padding: "14px 16px", color: "#fff", fontSize: 15, fontWeight: 700, textAlign: "left", cursor: "pointer", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                <Folder size={16} color={ORANGE} /> {c.title}
              </button>
            ))}
            <button onClick={() => setShowCasePicker(false)}
              style={{ width: "100%", background: "none", border: "none", color: "#555", fontSize: 14, cursor: "pointer", padding: "12px 0" }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CASES VIEW ───────────────────────────────────────────────────────────────
function CasesView({ data, onOpenCase, onOpenIncident }: {
  data: AppData;
  onOpenCase: (c: HLCase) => void;
  onOpenIncident: (i: Incident) => void;
}) {
  const sorted = [...data.cases].sort((a, b) => b.createdAt - a.createdAt);

  if (sorted.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center" }}>
        <Folder size={52} color="#1e1e1e" style={{ marginBottom: 16 }} />
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>No cases yet</div>
        <div style={{ color: "#555", fontSize: 14, lineHeight: 1.6, maxWidth: 300 }}>
          Cases are created from incidents. Open an incident and tap "Convert to New Case" to get started.
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px 120px" }}>
      <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 16 }}>ALL CASES</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {sorted.map(c => {
          const incidents = data.incidents.filter(i => c.incidentIds.includes(i.id));
          return (
            <button key={c.id} onClick={() => onOpenCase(c)}
              style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 16, padding: "18px 16px", textAlign: "left", cursor: "pointer", width: "100%", display: "flex", gap: 14 }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE + "66")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "#1e1e1e")}>
              <Folder size={22} color={ORANGE} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>{c.title}</div>
                <div style={{ color: "#555", fontSize: 13, marginBottom: 8 }}>{incidents.length} incident{incidents.length !== 1 ? "s" : ""} · {formatDate(c.createdAt)}</div>
                {incidents.slice(0, 3).map(i => (
                  <div key={i.id} style={{ color: "#444", fontSize: 12, display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <FileText size={10} color="#333" /> {truncate(i.title, 50)}
                  </div>
                ))}
                {incidents.length > 3 && <div style={{ color: "#333", fontSize: 12, marginTop: 2 }}>+{incidents.length - 3} more</div>}
              </div>
              <ChevronRight size={16} color="#333" style={{ flexShrink: 0, marginTop: 4 }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── CASE DETAIL VIEW ─────────────────────────────────────────────────────────
function CaseDetailView({ hlCase, data, onUpdateCase, onDeleteCase, onOpenIncident, onOpenInTutor, onBack }: {
  hlCase: HLCase; data: AppData;
  onUpdateCase: (c: HLCase) => void; onDeleteCase: (id: string) => void;
  onOpenIncident: (i: Incident) => void; onOpenInTutor: (c: HLCase) => void;
  onBack: () => void;
}) {
  const [editTitle, setEditTitle] = useState(hlCase.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [notes, setNotes] = useState(hlCase.notes);
  const incidents = data.incidents.filter(i => hlCase.incidentIds.includes(i.id))
    .sort((a, b) => a.createdAt - b.createdAt);

  function saveTitle() {
    onUpdateCase({ ...hlCase, title: editTitle.trim() || hlCase.title });
    setEditingTitle(false);
  }

  function saveNotes() {
    onUpdateCase({ ...hlCase, notes });
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#666", display: "flex", alignItems: "center", gap: 4, padding: "4px 0" }}>
          <ChevronLeft size={18} /><span style={{ fontSize: 13, fontWeight: 700 }}>Cases</span>
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={() => { if (window.confirm("Delete this case?")) onDeleteCase(hlCase.id); }}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: 8 }}><Trash2 size={16} /></button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px 48px" }}>
        {editingTitle ? (
          <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
            <input value={editTitle} onChange={e => setEditTitle(e.target.value)} autoFocus
              onKeyDown={e => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setEditingTitle(false); }}
              style={{ flex: 1, background: "#111", border: `1px solid ${ORANGE}`, borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 20, fontWeight: 800, outline: "none", boxSizing: "border-box" }} />
            <TapBtn variant="orange" onClick={saveTitle} style={{ padding: "0 16px" }}><Check size={16} /></TapBtn>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
            <div style={{ fontSize: 22, fontWeight: 900, flex: 1, lineHeight: 1.2 }}>{hlCase.title}</div>
            <button onClick={() => { setEditTitle(hlCase.title); setEditingTitle(true); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: 6, marginTop: 2 }}><Edit3 size={15} /></button>
          </div>
        )}
        <div style={{ color: "#444", fontSize: 13, marginBottom: 32, display: "flex", alignItems: "center", gap: 4 }}>
          <Clock size={11} color="#444" /> {formatDate(hlCase.createdAt)} · {incidents.length} incident{incidents.length !== 1 ? "s" : ""}
        </div>

        <TapBtn variant="orange" onClick={() => onOpenInTutor(hlCase)} style={{ width: "100%", justifyContent: "center", marginBottom: 32 }}>
          <GraduationCap size={16} /> Analyze in Tutor
        </TapBtn>

        {/* Incidents */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 12 }}>INCIDENTS IN THIS CASE</div>
          {incidents.length === 0 ? (
            <div style={{ color: "#444", fontSize: 14, fontStyle: "italic" }}>No incidents linked yet. Open an incident and add it to this case.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {incidents.map(i => (
                <button key={i.id} onClick={() => onOpenIncident(i)}
                  style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, padding: "12px 14px", textAlign: "left", cursor: "pointer", width: "100%", display: "flex", gap: 10 }}>
                  <FileText size={15} color={ORANGE} style={{ flexShrink: 0, marginTop: 1 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.title}</div>
                    <div style={{ color: "#444", fontSize: 12, marginTop: 2 }}>{formatDate(i.createdAt)}</div>
                  </div>
                  <ChevronRight size={14} color="#333" style={{ flexShrink: 0, marginTop: 2 }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Timeline */}
        {incidents.length > 1 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 12 }}>TIMELINE</div>
            <div style={{ position: "relative", paddingLeft: 24 }}>
              <div style={{ position: "absolute", left: 7, top: 0, bottom: 0, width: 2, background: "#1a1a1a" }} />
              {incidents.map((i, idx) => (
                <div key={i.id} style={{ position: "relative", marginBottom: 20 }}>
                  <div style={{ position: "absolute", left: -20, top: 4, width: 10, height: 10, borderRadius: 5, background: idx === 0 ? ORANGE : "#2a2a2a", border: `2px solid ${idx === 0 ? ORANGE : "#333"}` }} />
                  <div style={{ fontSize: 11, color: "#444", marginBottom: 2 }}>{formatDate(i.createdAt)}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#ccc" }}>{i.title}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>NOTES</div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={6}
            placeholder="Add any notes about this case — context, questions, next steps..."
            style={{ width: "100%", background: "#111", border: "1px solid #2a2a2a", borderRadius: 10, padding: "12px 14px", color: "#ccc", fontSize: 14, fontFamily: "Georgia, serif", outline: "none", boxSizing: "border-box", resize: "vertical", lineHeight: 1.65 }}
            onFocus={e => (e.target.style.borderColor = ORANGE)}
            onBlur={e => { e.target.style.borderColor = "#2a2a2a"; saveNotes(); }}
          />
          <div style={{ textAlign: "right", marginTop: 6 }}>
            <TapBtn variant="dim" onClick={saveNotes} style={{ fontSize: 12, padding: "6px 12px" }}>Save Notes</TapBtn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TUTOR VIEW ───────────────────────────────────────────────────────────────
function TutorView({ data, initialIncident, initialCase, onOpenIncident, onOpenCase }: {
  data: AppData;
  initialIncident?: Incident | null;
  initialCase?: HLCase | null;
  onOpenIncident: (i: Incident) => void;
  onOpenCase: (c: HLCase) => void;
}) {
  type TutorTarget = { kind: "incident"; item: Incident } | { kind: "case"; item: HLCase } | null;
  const [target, setTarget] = useState<TutorTarget>(() => {
    if (initialIncident) return { kind: "incident", item: initialIncident };
    if (initialCase) return { kind: "case", item: initialCase };
    return null;
  });
  const [analysis, setAnalysis] = useState<TutorAnalysis | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (!target) { setAnalysis(null); return; }
    if (target.kind === "incident") {
      setAnalysis(staticTutorService.analyzeIncident(target.item));
    } else {
      const incidents = data.incidents.filter(i => target.item.incidentIds.includes(i.id));
      setAnalysis(staticTutorService.analyzeCase(target.item, incidents));
    }
  }, [target]);

  const insightColors: Record<string, string> = {
    summary: "#2a3a2a",
    key_point: "#1a2a3a",
    question: "#2a2a1a",
    notice: "#2a1a1a",
  };
  const insightBorders: Record<string, string> = {
    summary: "#3a6a3a",
    key_point: "#3a5a7a",
    question: "#6a5a3a",
    notice: "#7a3a3a",
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Selector bar */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #1a1a1a", flexShrink: 0 }}>
        <button onClick={() => setShowPicker(true)}
          style={{ width: "100%", background: "#111", border: `1px solid ${target ? ORANGE + "55" : "#2a2a2a"}`, borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", textAlign: "left" }}>
          {target ? (
            target.kind === "incident" ? <FileText size={16} color={ORANGE} /> : <Folder size={16} color={ORANGE} />
          ) : <BookOpen size={16} color="#555" />}
          <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: target ? "#fff" : "#555" }}>
            {target ? (target.kind === "incident" ? target.item.title : target.item.title) : "Select an incident or case…"}
          </span>
          <ChevronRight size={14} color="#555" />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px 80px" }}>
        {!target ? (
          <div style={{ textAlign: "center", paddingTop: 60 }}>
            <GraduationCap size={52} color="#1e1e1e" style={{ marginBottom: 16 }} />
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Tutor</div>
            <div style={{ color: "#555", fontSize: 15, lineHeight: 1.65, maxWidth: 320, margin: "0 auto" }}>
              Select an incident or case above. The Tutor will read what you described and help you think through it.
            </div>
          </div>
        ) : analysis ? (
          <>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>OVERVIEW</div>
              <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, padding: "16px 18px", fontSize: 15, color: "#ccc", lineHeight: 1.65, fontFamily: "Georgia, serif" }}>
                {analysis.overview}
              </div>
            </div>

            {analysis.insights.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>WHAT THE TUTOR SEES</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {analysis.insights.map((insight, i) => (
                    <div key={i} style={{ background: insightColors[insight.type] || "#111", border: `1px solid ${insightBorders[insight.type] || "#2a2a2a"}`, borderRadius: 12, padding: "14px 16px" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, color: "#777", marginBottom: 6, textTransform: "uppercase" }}>{insight.type.replace("_", " ")}</div>
                      <div style={{ fontSize: 14, color: "#ccc", lineHeight: 1.6 }}>{insight.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {analysis.guidingQuestions.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>QUESTIONS TO CONSIDER</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {analysis.guidingQuestions.map((q, i) => (
                    <div key={i} style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, padding: "14px 16px", display: "flex", gap: 12 }}>
                      <div style={{ color: ORANGE, fontWeight: 900, fontSize: 15, flexShrink: 0, lineHeight: 1.6 }}>{i + 1}</div>
                      <div style={{ fontSize: 14, color: "#bbb", lineHeight: 1.65 }}>{q}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* Picker modal */}
      {showPicker && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 150, display: "flex", flexDirection: "column" }}>
          <div style={{ background: "#0d0d0d", flex: 1, display: "flex", flexDirection: "column", maxWidth: 600, width: "100%", margin: "0 auto" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Select to analyze</div>
              <button onClick={() => setShowPicker(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#555" }}><X size={20} /></button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
              {data.incidents.length > 0 && (
                <>
                  <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>INCIDENTS</div>
                  {data.incidents.map(i => (
                    <button key={i.id} onClick={() => { setTarget({ kind: "incident", item: i }); setShowPicker(false); }}
                      style={{ width: "100%", background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, padding: "12px 14px", textAlign: "left", cursor: "pointer", marginBottom: 6, display: "flex", gap: 10 }}>
                      <FileText size={15} color={ORANGE} style={{ flexShrink: 0, marginTop: 1 }} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{i.title}</div>
                        <div style={{ color: "#555", fontSize: 12 }}>{formatDate(i.createdAt)}</div>
                      </div>
                    </button>
                  ))}
                </>
              )}
              {data.cases.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>CASES</div>
                  {data.cases.map(c => (
                    <button key={c.id} onClick={() => { setTarget({ kind: "case", item: c }); setShowPicker(false); }}
                      style={{ width: "100%", background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, padding: "12px 14px", textAlign: "left", cursor: "pointer", marginBottom: 6, display: "flex", gap: 10 }}>
                      <Folder size={15} color={ORANGE} style={{ flexShrink: 0, marginTop: 1 }} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{c.title}</div>
                        <div style={{ color: "#555", fontSize: 12 }}>{c.incidentIds.length} incident{c.incidentIds.length !== 1 ? "s" : ""}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {data.incidents.length === 0 && data.cases.length === 0 && (
                <div style={{ color: "#555", fontSize: 14, textAlign: "center", paddingTop: 40 }}>No incidents or cases yet. Create one first.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PROFILE VIEW ─────────────────────────────────────────────────────────────
function ProfileView({ onEasterEgg }: { onEasterEgg: () => void }) {
  const sections = [
    { label: "Account", icon: User, items: ["Email", "Display Name", "Plan"] },
    { label: "Subscription", icon: Star, items: ["Current Plan", "Upgrade", "Billing History"] },
    { label: "AI Preferences", icon: Brain, items: ["Tutor Style", "AI Engine (Coming)"] },
    { label: "Theme", icon: Sliders, items: ["Dark Mode", "Accent Color", "Font Size"] },
    { label: "Export History", icon: History, items: ["Recent Exports", "Saved Formats"] },
    { label: "Data & Backups", icon: Archive, items: ["Export Backup", "Restore from Backup", "Privacy"] },
    { label: "Settings", icon: Settings, items: ["Notifications"] },
  ];

  const [eggPressCount, setEggPressCount] = useState(0);
  const eggTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleEggPress() {
    setEggPressCount(c => {
      const next = c + 1;
      if (next >= 5) { onEasterEgg(); return 0; }
      if (eggTimer.current) clearTimeout(eggTimer.current);
      eggTimer.current = setTimeout(() => setEggPressCount(0), 3000);
      return next;
    });
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px 120px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
        <div style={{ width: 60, height: 60, borderRadius: 30, background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <User size={28} color="#000" />
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Your Profile</div>
          <div style={{ color: "#555", fontSize: 13 }}>HyperLaw</div>
        </div>
      </div>

      <div style={{ background: "#141414", border: "1px solid #2a2a2a", borderRadius: 14, padding: "16px 18px", marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <Key size={18} color={ORANGE} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Connect Claude API for AI Expansion</div>
            <div style={{ color: "#666", fontSize: 13, lineHeight: 1.5 }}>
              Adding your Anthropic API key will upgrade the Tutor from keyword analysis to live AI reasoning. Same interface — smarter engine.
            </div>
            <div style={{ marginTop: 10 }}>
              <div style={{ background: "#1e1e1e", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: "#555", display: "inline-block" }}>Add Key (Coming Soon)</div>
            </div>
          </div>
        </div>
      </div>

      {sections.map(section => {
        const Icon = section.icon;
        return (
          <div key={section.label} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Icon size={13} color={ORANGE} />
              <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5 }}>{section.label.toUpperCase()}</div>
            </div>
            <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, overflow: "hidden" }}>
              {section.items.map((item, i) => (
                <div key={item} style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: i < section.items.length - 1 ? "1px solid #1a1a1a" : "none" }}>
                  <span style={{ fontSize: 14, color: "#ccc" }}>{item}</span>
                  <ChevronRight size={14} color="#333" />
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 48, gap: 6 }}>
        <div style={{ color: "#1e1e1e", fontSize: 11, fontWeight: 700 }}>HYPERLAW</div>
        <button onClick={handleEggPress} style={{ background: "none", border: "none", cursor: "pointer", padding: 8, opacity: 0.15, WebkitTapHighlightColor: "transparent" }}>
          <img src="/hyperlaw-logo.png" alt="" style={{ width: 36, height: 36, borderRadius: 8, filter: "grayscale(100%)" }} />
        </button>
        {eggPressCount > 0 && eggPressCount < 5 && (
          <div style={{ color: "#2a2a2a", fontSize: 10 }}>{5 - eggPressCount} more…</div>
        )}
      </div>
    </div>
  );
}

// ─── EASTER EGG ───────────────────────────────────────────────────────────────
const EASTER_ITEMS = [
  {
    id: "tagline", label: "TAGLINE",
    content: `HyperLaw started as: "I need a faster way to make these orange screens."\n\nNow it's evolving into: "I want one place where someone can understand their evidence, organize it, build exhibits, learn legal concepts, and eventually analyze it with AI."`,
  },
  {
    id: "description", label: "FULL DESCRIPTION",
    content: `HyperLaw\n\nBuilt by Hyper Quency Modula — the same person behind ShortHop, EDGE, and a stack of federal civil rights cases filed pro se from an office in Lexington, Kentucky.\n\nHyperLaw didn't come from a legal background. It came from necessity. From building orange screens at 2 AM trying to make an argument that actually lands.\n\nIt's a tool for people who don't have a legal team — but have evidence, patience, and the ability to think clearly about what happened to them.\n\nThe goal is simple: give self-represented litigants the same visual clarity, organizational power, and eventually AI reasoning that law firms spend thousands getting from outside vendors.`,
  },
  {
    id: "vision", label: "WHERE THIS IS GOING",
    content: `The screens were phase one.\n\nPhase two is organization — incidents, cases, evidence vaults, timelines.\n\nPhase three is understanding — the Tutor, learning mode, AI-assisted reasoning.\n\nPhase four is analysis — Claude reads your transcript, finds contradictions, flags admissions, suggests legal issues.\n\nSame interface. Different engine.`,
  },
];

function EasterEggScreen({ onClose }: { onClose: () => void }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => { const t = setTimeout(() => setVisible(true), 50); return () => clearTimeout(t); }, []);

  function copy(id: string, text: string) {
    navigator.clipboard.writeText(text).then(() => { setCopied(id); setTimeout(() => setCopied(null), 2000); });
  }

  function handleClose() { setVisible(false); setTimeout(onClose, 400); }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: `rgba(255,255,255,${visible ? 1 : 0})`, transition: "background 0.4s ease", overflowY: "auto", display: "flex", flexDirection: "column" }}>
      <div style={{ opacity: visible ? 1 : 0, transition: "opacity 0.6s ease 0.2s", flex: 1 }}>
        <div style={{ padding: "20px 24px", display: "flex", justifyContent: "flex-end" }}>
          <button onClick={handleClose} style={{ background: "#f0f0f0", border: "none", borderRadius: 50, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={18} color="#333" />
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
          <img src="/hyperlaw-logo.png" alt="HyperLaw" style={{ width: 100, height: 100, borderRadius: 24, filter: "grayscale(100%) contrast(1.2)" }} />
        </div>
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 24px 60px" }}>
          {EASTER_ITEMS.map(item => (
            <div key={item.id} style={{ marginBottom: 32 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#999", letterSpacing: 1 }}>{item.label}</div>
                <button onClick={() => copy(item.id, item.content)}
                  style={{ background: copied === item.id ? "#e8f5e9" : "#f5f5f5", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, color: copied === item.id ? "#4caf50" : "#666", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                  <Copy size={12} /> {copied === item.id ? "Copied!" : "Copy"}
                </button>
              </div>
              <div style={{ background: "#fafafa", border: "1px solid #eee", borderRadius: 12, padding: "18px 20px", color: "#222", fontSize: 15, lineHeight: 1.7, whiteSpace: "pre-wrap", fontFamily: "Georgia, serif" }}>
                {item.content}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────
type NavTab = "home" | "cases" | "tutor" | "profile";

interface NavItem { id: NavTab; icon: React.ElementType; label: string; center?: boolean }
const NAV_ITEMS: NavItem[] = [
  { id: "home", icon: Home, label: "Home" },
  { id: "cases", icon: Folder, label: "Cases" },
  { id: "tutor", icon: GraduationCap, label: "Tutor", center: false },
  { id: "profile", icon: User, label: "Profile" },
];

function BottomNavBar({ active, onChange, onFab }: { active: NavTab; onChange: (t: NavTab) => void; onFab: () => void }) {
  const left = [NAV_ITEMS[0], NAV_ITEMS[1]];
  const right = [NAV_ITEMS[2], NAV_ITEMS[3]];

  return (
    <div style={{ borderTop: "1px solid #1e1e1e", background: "#0a0a0a", paddingBottom: "env(safe-area-inset-bottom)", flexShrink: 0, position: "relative" }}>
      <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: -26, zIndex: 10 }}>
        <button onClick={onFab}
          style={{ width: 54, height: 54, borderRadius: 27, background: ORANGE, border: "3px solid #0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: `0 4px 20px ${ORANGE}66`, WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}>
          <Plus size={26} color="#000" />
        </button>
      </div>
      <div style={{ display: "flex" }}>
        {left.map(item => {
          const Icon = item.icon;
          return (
            <button key={item.id} onClick={() => onChange(item.id)}
              style={{ flex: 1, background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, padding: "12px 4px", cursor: "pointer", color: active === item.id ? ORANGE : "#555", WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}>
              <Icon size={22} />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.3 }}>{item.label}</span>
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        {right.map(item => {
          const Icon = item.icon;
          return (
            <button key={item.id} onClick={() => onChange(item.id)}
              style={{ flex: 1, background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, padding: "12px 4px", cursor: "pointer", color: active === item.id ? ORANGE : "#555", WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}>
              <Icon size={22} />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.3 }}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DesktopSideNav({ active, onChange, onFab }: { active: NavTab; onChange: (t: NavTab) => void; onFab: () => void }) {
  return (
    <div style={{ width: 200, flexShrink: 0, background: "#0a0a0a", borderRight: "1px solid #1e1e1e", display: "flex", flexDirection: "column", padding: "20px 12px", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", marginBottom: 16 }}>
        <img src="/hyperlaw-logo.png" alt="HyperLaw" style={{ width: 30, height: 30, borderRadius: 8 }} />
        <span style={{ fontWeight: 900, fontSize: 15, letterSpacing: 0.3 }}>HyperLaw</span>
      </div>

      <button onClick={onFab}
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 10, background: ORANGE, border: "none", color: "#000", cursor: "pointer", fontWeight: 800, fontSize: 14, marginBottom: 8 }}>
        <Plus size={18} /> New Incident
      </button>

      {NAV_ITEMS.map(item => {
        const Icon = item.icon;
        const isActive = active === item.id;
        return (
          <button key={item.id} onClick={() => onChange(item.id)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 10, background: isActive ? `${ORANGE}18` : "transparent", border: `1px solid ${isActive ? ORANGE + "44" : "transparent"}`, color: isActive ? ORANGE : "#666", cursor: "pointer", fontWeight: 700, fontSize: 14, textAlign: "left", transition: "all 0.15s" }}
            onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "#111"; }}
            onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}>
            <Icon size={18} /> {item.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
type AppView =
  | { type: "home" }
  | { type: "incident_detail"; incident: Incident }
  | { type: "case_detail"; hlCase: HLCase }
  | { type: "tutor"; incident?: Incident; hlCase?: HLCase };

export default function App() {
  const w = useWindowWidth();
  const isMobile = w < 768;

  const [data, setDataRaw] = useState<AppData>(() => loadData());
  const [navTab, setNavTab] = useState<NavTab>("home");
  const [view, setView] = useState<AppView>({ type: "home" });
  const [showNewIncident, setShowNewIncident] = useState(false);
  const [showEasterEgg, setShowEasterEgg] = useState(false);

  function setData(d: AppData) { setDataRaw(d); saveData(d); }

  function handleSaveIncident(title: string, description: string) {
    const incident: Incident = {
      id: crypto.randomUUID(),
      title,
      description,
      createdAt: Date.now(),
      caseId: null,
    };
    setData(addIncident(data, incident));
    setShowNewIncident(false);
    setNavTab("home");
    setView({ type: "incident_detail", incident });
  }

  function handleConvertToCase(incident: Incident) {
    const title = `${incident.title} — Case`;
    const hlCase: HLCase = {
      id: crypto.randomUUID(),
      title,
      incidentIds: [incident.id],
      notes: "",
      createdAt: Date.now(),
    };
    const d1 = addCase(data, hlCase);
    const d2 = addIncidentToCase(d1, incident.id, hlCase.id);
    setData(d2);
    setNavTab("cases");
    setView({ type: "case_detail", hlCase });
  }

  function handleOpenIncident(incident: Incident) {
    // Always use fresh data reference
    const fresh = data.incidents.find(i => i.id === incident.id) ?? incident;
    setView({ type: "incident_detail", incident: fresh });
    if (navTab !== "tutor") setNavTab("home");
  }

  function handleOpenCase(hlCase: HLCase) {
    const fresh = data.cases.find(c => c.id === hlCase.id) ?? hlCase;
    setView({ type: "case_detail", hlCase: fresh });
    setNavTab("cases");
  }

  function handleNavChange(tab: NavTab) {
    setNavTab(tab);
    if (tab === "home") setView({ type: "home" });
    if (tab === "cases") setView({ type: "home" });
    if (tab === "tutor") setView({ type: "tutor" });
  }

  function currentContent() {
    if (view.type === "incident_detail") {
      const incident = data.incidents.find(i => i.id === view.incident.id) ?? view.incident;
      return (
        <IncidentDetailView
          incident={incident}
          cases={data.cases}
          onUpdate={i => setData(updateIncident(data, i))}
          onDelete={id => { setData(deleteIncident(data, id)); setNavTab("home"); setView({ type: "home" }); }}
          onConvertToCase={handleConvertToCase}
          onAddToCase={(incidentId, caseId) => setData(addIncidentToCase(data, incidentId, caseId))}
          onOpenInTutor={i => { setNavTab("tutor"); setView({ type: "tutor", incident: i }); }}
          onBack={() => { setView({ type: "home" }); setNavTab("home"); }}
        />
      );
    }

    if (navTab === "cases" && view.type === "case_detail") {
      const hlCase = data.cases.find(c => c.id === view.hlCase.id) ?? view.hlCase;
      return (
        <CaseDetailView
          hlCase={hlCase}
          data={data}
          onUpdateCase={c => setData(updateCase(data, c))}
          onDeleteCase={id => { setData(deleteCase(data, id)); setView({ type: "home" }); }}
          onOpenIncident={handleOpenIncident}
          onOpenInTutor={c => { setNavTab("tutor"); setView({ type: "tutor", hlCase: c }); }}
          onBack={() => setView({ type: "home" })}
        />
      );
    }

    if (navTab === "tutor") {
      return (
        <TutorView
          data={data}
          initialIncident={view.type === "tutor" ? view.incident : null}
          initialCase={view.type === "tutor" ? view.hlCase : null}
          onOpenIncident={handleOpenIncident}
          onOpenCase={handleOpenCase}
        />
      );
    }

    if (navTab === "profile") {
      return <ProfileView onEasterEgg={() => setShowEasterEgg(true)} />;
    }

    if (navTab === "cases") {
      return (
        <CasesView
          data={data}
          onOpenCase={handleOpenCase}
          onOpenIncident={handleOpenIncident}
        />
      );
    }

    return (
      <HomeView
        data={data}
        onOpenIncident={handleOpenIncident}
        onOpenCase={handleOpenCase}
        onNewIncident={() => setShowNewIncident(true)}
      />
    );
  }

  return (
    <div style={{ height: "100dvh", background: BG, color: "#fff", fontFamily: "Arial, sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
        {!isMobile && (
          <DesktopSideNav active={navTab} onChange={handleNavChange} onFab={() => setShowNewIncident(true)} />
        )}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <ErrorBoundary onReset={() => { setNavTab("home"); setView({ type: "home" }); }}>
            {currentContent()}
          </ErrorBoundary>
        </div>
      </div>

      {isMobile && (
        <BottomNavBar active={navTab} onChange={handleNavChange} onFab={() => setShowNewIncident(true)} />
      )}

      {showNewIncident && (
        <NewIncidentOverlay
          onSave={handleSaveIncident}
          onClose={() => setShowNewIncident(false)}
        />
      )}

      {showEasterEgg && <EasterEggScreen onClose={() => setShowEasterEgg(false)} />}
    </div>
  );
}

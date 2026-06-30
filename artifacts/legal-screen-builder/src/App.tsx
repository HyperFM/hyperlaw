import React, { useState, useRef, useEffect } from "react";
import {
  Plus, X, ChevronRight, ChevronLeft, ArrowRight, Lightbulb,
  Trash2, Edit3, ChevronUp, ChevronDown, FileSearch,
  Video, FileText, Mic, Image, File, BookOpen, Scale, Clock, XCircle,
  Quote, Check, Layers,
} from "lucide-react";
import { Block, BlockType, ChatEntry, DataMap, Evidence, EvidenceType, Project, Screen, ScreenType, BLOCK_FIELDS } from "./types";
import { loadProject, saveProject, addScreen, updateScreen, deleteScreen, updateBlock, addBlock, removeBlock, moveBlock, addEvidence, deleteEvidence, addCitation, deleteCitation } from "./store";
import { TREES, detectSuggestion, buildScreen, newBlock } from "./engine";
import { BlockCanvas } from "./BlockCanvas";

const ORANGE = "#d9711f";

// ─── Screen type definitions ──────────────────────────────────────────────────

const SCREEN_TYPES: { id: ScreenType; label: string; blurb: string; icon: React.ElementType }[] = [
  { id: "contradiction", label: "Contradiction", blurb: "Two statements that can't both be true", icon: XCircle },
  { id: "quote", label: "Quote Breakdown", blurb: "Why one quote matters", icon: Quote },
  { id: "prior_incident", label: "Prior Incident", blurb: "This wasn't the first time", icon: Clock },
  { id: "admission", label: "Admission", blurb: "They already knew — and said so", icon: Mic },
  { id: "policy_violation", label: "Policy Violation", blurb: "What policy required vs. what happened", icon: Scale },
];

const BLOCK_TYPES: { type: BlockType; label: string }[] = [
  { type: "eyebrow", label: "Eyebrow (Name / Tag)" },
  { type: "headline", label: "Headline" },
  { type: "subheadline", label: "Subheadline" },
  { type: "divider", label: "Divider" },
  { type: "quote_card", label: "Quote Card" },
  { type: "evidence_card", label: "Evidence Card" },
  { type: "comparison", label: "Comparison (A vs B)" },
  { type: "fact_list", label: "Fact List" },
  { type: "icon_bullets", label: "Icon Bullets" },
  { type: "legal_box", label: "Legal Box" },
  { type: "callout", label: "Callout" },
  { type: "policy_row", label: "Policy Row" },
  { type: "spacer", label: "Spacer" },
];

const EVIDENCE_ICONS: Record<EvidenceType, React.ElementType> = {
  bodycam: Video,
  report: FileText,
  statement: Mic,
  document: File,
  photo: Image,
  other: FileSearch,
};

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function Btn({ children, onClick, variant = "ghost", style: ext }: { children: React.ReactNode; onClick: () => void; variant?: "orange" | "ghost" | "danger"; style?: React.CSSProperties }) {
  const base: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, borderRadius: 7, padding: "9px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", border: "none" };
  const vars: Record<string, React.CSSProperties> = {
    orange: { background: ORANGE, color: "#0a0a0a" },
    ghost: { background: "transparent", border: "1px solid #444", color: "#ccc" },
    danger: { background: "transparent", border: "1px solid #7a2020", color: "#e06060" },
  };
  return <button onClick={onClick} style={{ ...base, ...vars[variant], ...ext }}>{children}</button>;
}

function Panel({ children, style: ext }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, ...ext }}>{children}</div>;
}

function FieldInput({ label, value, type = "text", onChange, evidenceItems, onInsertEvidence }: {
  label: string; value: string; type?: string;
  onChange: (v: string) => void;
  evidenceItems?: Evidence[];
  onInsertEvidence?: (e: Evidence) => void;
}) {
  const [showVault, setShowVault] = useState(false);
  const inputStyle: React.CSSProperties = { background: "#111", border: "1px solid #333", borderRadius: 6, padding: "8px 10px", color: "#fff", fontSize: 14, fontFamily: "Arial, sans-serif", outline: "none", width: "100%", boxSizing: "border-box" };
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <label style={{ fontSize: 12, color: "#888", fontWeight: 700, letterSpacing: 0.5 }}>{label.toUpperCase()}</label>
        {evidenceItems && evidenceItems.length > 0 && (
          <button onClick={() => setShowVault(v => !v)} style={{ background: "none", border: "none", color: ORANGE, fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: 0.3 }}>
            ⬆ FROM VAULT
          </button>
        )}
      </div>
      {type === "textarea" ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={4}
          style={{ ...inputStyle, resize: "vertical" }}
          onFocus={e => (e.target.style.borderColor = ORANGE)} onBlur={e => (e.target.style.borderColor = "#333")} />
      ) : (
        <input value={value} onChange={e => onChange(e.target.value)}
          style={inputStyle}
          onFocus={e => (e.target.style.borderColor = ORANGE)} onBlur={e => (e.target.style.borderColor = "#333")} />
      )}
      {showVault && evidenceItems && (
        <div style={{ marginTop: 6, background: "#111", border: `1px solid ${ORANGE}55`, borderRadius: 6, overflow: "hidden" }}>
          {evidenceItems.map(e => (
            <button key={e.id} onClick={() => { onInsertEvidence?.(e); setShowVault(false); }}
              style={{ width: "100%", background: "none", border: "none", borderBottom: "1px solid #222", padding: "8px 10px", textAlign: "left", color: "#ddd", cursor: "pointer", fontSize: 13 }}
              onMouseEnter={ev => (ev.currentTarget.style.background = "#1e1e1e")}
              onMouseLeave={ev => (ev.currentTarget.style.background = "none")}
            >
              <div style={{ fontWeight: 700, color: ORANGE, marginBottom: 2 }}>{e.label}</div>
              <div style={{ color: "#888", fontSize: 12 }}>{e.content.slice(0, 80)}{e.content.length > 80 ? "…" : ""}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Block editor panel ───────────────────────────────────────────────────────

function BlockEditorPanel({ screen, selectedId, evidence, onUpdateBlock, onSelectBlock, onAddBlock, onRemoveBlock, onMoveBlock }: {
  screen: Screen;
  selectedId: string | null;
  evidence: Evidence[];
  onUpdateBlock: (b: Block) => void;
  onSelectBlock: (id: string | null) => void;
  onAddBlock: (type: BlockType, afterId?: string) => void;
  onRemoveBlock: (id: string) => void;
  onMoveBlock: (id: string, dir: "up" | "down") => void;
}) {
  const selectedBlock = screen.blocks.find(b => b.id === selectedId) || null;
  const fields = selectedBlock ? BLOCK_FIELDS[selectedBlock.type] : [];
  const [showAddMenu, setShowAddMenu] = useState(false);

  function updateField(key: string, val: string) {
    if (!selectedBlock) return;
    onUpdateBlock({ ...selectedBlock, data: { ...selectedBlock.data, [key]: val } });
  }

  function getEvidenceForField(key: string): Evidence[] {
    if (!["quote", "content", "contentA", "contentB", "policyContent", "actualContent", "items"].includes(key)) return [];
    return evidence;
  }

  function insertEvidence(key: string, e: Evidence) {
    updateField(key, e.content + (e.timestamp ? ` [${e.timestamp}]` : ""));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto" }}>
      {/* Block list */}
      <div style={{ borderBottom: "1px solid #2a2a2a", padding: "16px 20px" }}>
        <div style={{ fontSize: 11, color: "#666", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>BLOCKS</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {screen.blocks.map((b, idx) => (
            <div key={b.id} onClick={() => onSelectBlock(b.id === selectedId ? null : b.id)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 6, background: b.id === selectedId ? "#d9711f22" : "#111", border: `1px solid ${b.id === selectedId ? ORANGE : "#2a2a2a"}`, cursor: "pointer" }}>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: b.id === selectedId ? ORANGE : "#bbb", letterSpacing: 0.3 }}>
                {BLOCK_TYPES.find(t => t.type === b.type)?.label || b.type}
              </span>
              <button onClick={ev => { ev.stopPropagation(); onMoveBlock(b.id, "up"); }} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", padding: 2 }} disabled={idx === 0}>
                <ChevronUp size={13} />
              </button>
              <button onClick={ev => { ev.stopPropagation(); onMoveBlock(b.id, "down"); }} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", padding: 2 }} disabled={idx === screen.blocks.length - 1}>
                <ChevronDown size={13} />
              </button>
              <button onClick={ev => { ev.stopPropagation(); onRemoveBlock(b.id); }} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", padding: 2 }}>
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
        <div style={{ position: "relative", marginTop: 8 }}>
          <button onClick={() => setShowAddMenu(v => !v)}
            style={{ width: "100%", background: "transparent", border: "1px dashed #444", borderRadius: 6, padding: "8px", color: "#777", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <Plus size={12} /> Add Block
          </button>
          {showAddMenu && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#111", border: `1px solid ${ORANGE}55`, borderRadius: 6, zIndex: 10, maxHeight: 220, overflowY: "auto", marginTop: 4 }}>
              {BLOCK_TYPES.map(t => (
                <button key={t.type} onClick={() => { onAddBlock(t.type, selectedId || undefined); setShowAddMenu(false); }}
                  style={{ width: "100%", background: "none", border: "none", borderBottom: "1px solid #1a1a1a", padding: "8px 12px", textAlign: "left", color: "#ccc", fontSize: 12, cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.color = ORANGE)}
                  onMouseLeave={e => (e.currentTarget.style.color = "#ccc")}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Field editor */}
      {selectedBlock && fields.length > 0 && (
        <div style={{ padding: "16px 20px" }}>
          <div style={{ fontSize: 11, color: "#666", fontWeight: 700, letterSpacing: 0.5, marginBottom: 12 }}>
            EDIT · {BLOCK_TYPES.find(t => t.type === selectedBlock.type)?.label?.toUpperCase()}
          </div>
          {fields.map(f => (
            <FieldInput
              key={f.key}
              label={f.label}
              value={selectedBlock.data[f.key] || ""}
              type={f.type === "textarea" ? "textarea" : "text"}
              onChange={v => updateField(f.key, v)}
              evidenceItems={getEvidenceForField(f.key)}
              onInsertEvidence={e => insertEvidence(f.key, e)}
            />
          ))}
        </div>
      )}

      {selectedBlock && fields.length === 0 && (
        <div style={{ padding: "16px 20px", color: "#555", fontSize: 13 }}>
          This block has no editable fields.
        </div>
      )}

      {!selectedBlock && (
        <div style={{ padding: "20px", color: "#555", fontSize: 13, lineHeight: 1.6 }}>
          Click any block on the canvas to edit it.
        </div>
      )}
    </div>
  );
}

// ─── Evidence Vault panel ─────────────────────────────────────────────────────

function EvidenceVaultPanel({ evidence, onAdd, onDelete }: { evidence: Evidence[]; onAdd: (e: Evidence) => void; onDelete: (id: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Partial<Evidence>>({ type: "bodycam" });

  function submit() {
    if (!form.label || !form.content) return;
    onAdd({ id: crypto.randomUUID(), type: form.type || "other", label: form.label, source: form.source || "", content: form.content, timestamp: form.timestamp });
    setForm({ type: "bodycam" });
    setAdding(false);
  }

  const EV_TYPES: { value: EvidenceType; label: string }[] = [
    { value: "bodycam", label: "Bodycam" }, { value: "report", label: "Report" }, { value: "statement", label: "Statement" },
    { value: "document", label: "Document" }, { value: "photo", label: "Photo" }, { value: "other", label: "Other" },
  ];

  return (
    <div style={{ padding: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Evidence Vault</div>
          <div style={{ color: "#777", fontSize: 12, marginTop: 2 }}>Import once — use anywhere.</div>
        </div>
        <Btn onClick={() => setAdding(v => !v)} variant="orange"><Plus size={14} /> Add</Btn>
      </div>

      {adding && (
        <Panel style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: "#888", fontWeight: 700, display: "block", marginBottom: 4 }}>TYPE</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as EvidenceType }))}
              style={{ background: "#111", border: "1px solid #333", borderRadius: 6, padding: "8px 10px", color: "#fff", fontSize: 13, width: "100%" }}>
              {EV_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <FieldInput label="Label (e.g. Bodycam – June 3)" value={form.label || ""} onChange={v => setForm(f => ({ ...f, label: v }))} />
          <FieldInput label="Source (officer name, report #, etc.)" value={form.source || ""} onChange={v => setForm(f => ({ ...f, source: v }))} />
          {form.type === "bodycam" && <FieldInput label="Timestamp" value={form.timestamp || ""} onChange={v => setForm(f => ({ ...f, timestamp: v }))} />}
          <FieldInput label="Content (quote, description, or excerpt)" value={form.content || ""} type="textarea" onChange={v => setForm(f => ({ ...f, content: v }))} />
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <Btn onClick={submit} variant="orange"><Check size={13} /> Save</Btn>
            <Btn onClick={() => setAdding(false)}>Cancel</Btn>
          </div>
        </Panel>
      )}

      {evidence.length === 0 && !adding && (
        <div style={{ color: "#555", fontSize: 13, lineHeight: 1.6 }}>
          No evidence yet. Add items from your bodycam footage, reports, and statements — then insert them directly into any screen while building.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {evidence.map(e => {
          const Icon = EVIDENCE_ICONS[e.type] || File;
          return (
            <Panel key={e.id} style={{ padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <Icon size={16} color={ORANGE} style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{e.label}</div>
                  {e.source && <div style={{ color: "#888", fontSize: 12 }}>{e.source}{e.timestamp ? ` · ${e.timestamp}` : ""}</div>}
                  <div style={{ color: "#bbb", fontSize: 13, marginTop: 4, lineHeight: 1.4 }}>{e.content.slice(0, 120)}{e.content.length > 120 ? "…" : ""}</div>
                </div>
                <button onClick={() => onDelete(e.id)} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", padding: 2 }}>
                  <Trash2 size={13} />
                </button>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

// ─── Citation Library panel ───────────────────────────────────────────────────

function CitationLibraryPanel({ citations, onAdd, onDelete, screenCitations, onToggle }: {
  citations: Project["citations"]; onAdd: (label: string) => void; onDelete: (id: string) => void;
  screenCitations?: string[]; onToggle?: (label: string) => void;
}) {
  const [newLabel, setNewLabel] = useState("");
  function submit() { if (!newLabel.trim()) return; onAdd(newLabel.trim()); setNewLabel(""); }

  return (
    <div style={{ padding: "20px" }}>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Citation Library</div>
      <div style={{ color: "#777", fontSize: 12, marginBottom: 16 }}>Save once — add to any screen footer.</div>

      {onToggle && screenCitations !== undefined && (
        <div style={{ fontSize: 11, color: ORANGE, fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>ACTIVE ON THIS SCREEN</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
        {citations.map(c => {
          const active = screenCitations?.includes(c.label);
          return (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: active ? "#d9711f15" : "#111", border: `1px solid ${active ? ORANGE : "#2a2a2a"}`, borderRadius: 6 }}>
              {onToggle && (
                <button onClick={() => onToggle(c.label)}
                  style={{ width: 18, height: 18, borderRadius: 3, border: `2px solid ${active ? ORANGE : "#444"}`, background: active ? ORANGE : "transparent", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {active && <Check size={11} color="#000" />}
                </button>
              )}
              <span style={{ flex: 1, fontSize: 13, color: active ? "#fff" : "#bbb" }}>{c.label}</span>
              {!c.builtin && (
                <button onClick={() => onDelete(c.id)} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", padding: 2 }}>
                  <X size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input value={newLabel} onChange={e => setNewLabel(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()}
          placeholder="Add custom citation…"
          style={{ flex: 1, background: "#111", border: "1px solid #333", borderRadius: 6, padding: "8px 10px", color: "#fff", fontSize: 13, outline: "none" }} />
        <button onClick={submit} style={{ background: "#2a2a2a", border: "1px solid #444", borderRadius: 6, padding: "0 12px", color: "#fff", cursor: "pointer" }}>
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}

// ─── Conversation view ────────────────────────────────────────────────────────

function ConversationView({ screenType, evidence, onComplete, onBack }: {
  screenType: ScreenType; evidence: Evidence[];
  onComplete: (data: DataMap) => void; onBack: () => void;
}) {
  const tree = TREES[screenType];
  const [currentNodeId, setCurrentNodeId] = useState("start");
  const [data, setData] = useState<DataMap>({});
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<ChatEntry[]>([]);
  const [suggestion, setSuggestion] = useState<ScreenType | null>(null);
  const [dismissed, setDismissed] = useState<ScreenType | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const node = tree[currentNodeId];
  const progress = Object.keys(tree).findIndex(k => k === currentNodeId) + 1;
  const total = Object.keys(tree).length;
  const typeDef = SCREEN_TYPES.find(t => t.id === screenType);

  useEffect(() => {
    if (historyRef.current) historyRef.current.scrollTop = historyRef.current.scrollHeight;
  }, [history]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [currentNodeId]);

  function submitAnswer(raw?: string) {
    const answer = (raw ?? input).trim();
    const newData = { ...data, [node.key]: answer };
    setData(newData);
    setHistory(h => [...h, { nodeId: node.id, question: node.question, answer }]);
    setInput("");

    const detected = detectSuggestion(newData, screenType);
    if (detected && detected !== dismissed) setSuggestion(detected);

    const nextId = typeof node.next === "function" ? node.next(answer, newData) : node.next;
    if (nextId === null) { onComplete(newData); }
    else setCurrentNodeId(nextId);
  }

  function choiceSubmit(label: string, value: string) {
    const newData = { ...data, [node.key]: value };
    setData(newData);
    setHistory(h => [...h, { nodeId: node.id, question: node.question, answer: label }]);
    setInput("");

    const detected = detectSuggestion(newData, screenType);
    if (detected && detected !== dismissed) setSuggestion(detected);

    const nextId = typeof node.next === "function" ? node.next(value, newData) : node.next;
    if (nextId === null) { onComplete(newData); }
    else setCurrentNodeId(nextId);
  }

  function goBack() {
    if (history.length === 0) { onBack(); return; }
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    const newData = { ...data };
    delete newData[prev.nodeId];
    setData(newData);
    setCurrentNodeId(prev.nodeId);
    setInput(prev.answer);
  }

  const sugDef = suggestion ? SCREEN_TYPES.find(t => t.id === suggestion) : null;
  const relevantEvidence = evidence.filter(e =>
    !node.evidenceTypes || node.evidenceTypes.length === 0 || node.evidenceTypes.includes(e.type)
  );

  // Build preview data from current conversation answers
  const previewData: DataMap = data;

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      {/* Left: conversation */}
      <div style={{ width: 460, flexShrink: 0, borderRight: "1px solid #2a2a2a", display: "flex", flexDirection: "column" }}>
        {/* Suggestion banner */}
        {suggestion && sugDef && (
          <div style={{ background: "#1a1400", borderBottom: `1px solid ${ORANGE}44`, padding: "10px 18px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <Lightbulb size={14} color={ORANGE} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: 12, lineHeight: 1.4 }}>
              <span style={{ color: ORANGE, fontWeight: 800 }}>This sounds like a {sugDef.label} screen.</span>
              <span style={{ color: "#aaa" }}> Switch?</span>
            </div>
            <button onClick={() => { setDismissed(suggestion); setSuggestion(null); }}
              style={{ background: "none", border: "none", color: "#555", cursor: "pointer" }}><X size={13} /></button>
          </div>
        )}

        {/* Progress */}
        <div style={{ height: 3, background: "#1a1a1a", flexShrink: 0 }}>
          <div style={{ width: `${(progress / total) * 100}%`, height: "100%", background: ORANGE, transition: "width 0.2s" }} />
        </div>

        {/* Chat history + current question */}
        <div ref={historyRef} style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
          {history.map((entry, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ fontSize: 12, color: "#555", lineHeight: 1.3 }}>{entry.question}</div>
              <div style={{ fontSize: 15, color: "#ddd", fontWeight: 700, lineHeight: 1.4, borderLeft: `3px solid ${ORANGE}`, paddingLeft: 8 }}>
                {entry.answer || <span style={{ color: "#444", fontStyle: "italic" }}>skipped</span>}
              </div>
            </div>
          ))}

          {/* Current question */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.3, marginBottom: 3 }}>{node.question}</div>
              {node.subtext && <div style={{ fontSize: 13, color: "#777", lineHeight: 1.4 }}>{node.subtext}</div>}
            </div>

            {/* Evidence vault quick-insert */}
            {relevantEvidence.length > 0 && (
              <div style={{ background: "#111", border: `1px solid ${ORANGE}33`, borderRadius: 6, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: ORANGE, fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 }}>EVIDENCE VAULT</div>
                {relevantEvidence.map(e => (
                  <button key={e.id} onClick={() => { setInput(e.content + (e.timestamp ? ` [${e.timestamp}]` : "")); inputRef.current?.focus(); }}
                    style={{ display: "block", width: "100%", background: "none", border: "none", textAlign: "left", color: "#bbb", fontSize: 12, cursor: "pointer", marginBottom: 4, padding: "2px 0" }}
                    onMouseEnter={ev => (ev.currentTarget.style.color = ORANGE)} onMouseLeave={ev => (ev.currentTarget.style.color = "#bbb")}
                  >
                    ↑ {e.label}
                  </button>
                ))}
              </div>
            )}

            {node.type === "choice" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {node.choices?.map(c => (
                  <button key={c.value} onClick={() => choiceSubmit(c.label, c.value)}
                    style={{ background: "#1d1d1d", border: "1px solid #333", borderRadius: 8, padding: "11px 14px", textAlign: "left", color: "#fff", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "#333")}
                  >
                    <ArrowRight size={13} color={ORANGE} style={{ flexShrink: 0 }} />
                    {c.label}
                  </button>
                ))}
              </div>
            ) : node.type === "textarea" ? (
              <textarea ref={inputRef as React.RefObject<HTMLTextAreaElement>} value={input} onChange={e => setInput(e.target.value)} rows={5}
                placeholder="Type your answer…"
                onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitAnswer(); }}
                style={{ background: "#1d1d1d", border: "1px solid #333", borderRadius: 8, padding: 12, color: "#fff", fontSize: 14, fontFamily: "Arial, sans-serif", resize: "vertical", outline: "none" }}
                onFocus={e => (e.target.style.borderColor = ORANGE)} onBlur={e => (e.target.style.borderColor = "#333")} />
            ) : (
              <input ref={inputRef as React.RefObject<HTMLInputElement>} value={input} onChange={e => setInput(e.target.value)}
                placeholder="Type your answer…"
                onKeyDown={e => e.key === "Enter" && submitAnswer()}
                style={{ background: "#1d1d1d", border: "1px solid #333", borderRadius: 8, padding: 12, color: "#fff", fontSize: 14, fontFamily: "Arial, sans-serif", outline: "none" }}
                onFocus={e => (e.target.style.borderColor = ORANGE)} onBlur={e => (e.target.style.borderColor = "#333")} />
            )}

            {node.type !== "choice" && (
              <div style={{ color: "#555", fontSize: 11 }}>{node.type === "textarea" ? "⌘ Enter to continue" : "Enter to continue"}</div>
            )}
          </div>
        </div>

        {/* Nav buttons */}
        {node.type !== "choice" && (
          <div style={{ borderTop: "1px solid #2a2a2a", padding: "14px 24px", display: "flex", gap: 8, flexShrink: 0 }}>
            <Btn onClick={goBack}><ChevronLeft size={14} /> Back</Btn>
            <Btn onClick={() => submitAnswer()} variant="orange" style={{ flex: 1, justifyContent: "center" }}>
              {node.next === null ? "Build Screen" : "Continue"} <ChevronRight size={14} />
            </Btn>
          </div>
        )}
        {node.type !== "choice" && (
          <div style={{ padding: "0 24px 10px", display: "flex", justifyContent: "center" }}>
            <button onClick={() => submitAnswer("")} style={{ background: "none", border: "none", color: "#444", fontSize: 11, cursor: "pointer" }}>Skip</button>
          </div>
        )}
      </div>

      {/* Right: answer summary */}
      <div style={{ flex: 1, minWidth: 0, background: "#0e0e0e", display: "flex", flexDirection: "column", overflowY: "auto", padding: "28px 32px" }}>
        <div style={{ fontSize: 11, color: "#555", fontWeight: 700, letterSpacing: 0.5, marginBottom: 16 }}>COLLECTED SO FAR</div>
        {history.length === 0 && (
          <div style={{ color: "#444", fontSize: 13, lineHeight: 1.6 }}>
            Your answers will appear here as you go. The screen assembles itself when you finish.
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {history.map((entry, i) => (
            <div key={i}>
              <div style={{ fontSize: 11, color: "#555", marginBottom: 3 }}>{entry.question}</div>
              <div style={{ fontSize: 14, color: "#ddd", fontWeight: 700, lineHeight: 1.45, borderLeft: `3px solid ${ORANGE}`, paddingLeft: 10 }}>
                {entry.answer || <span style={{ color: "#333", fontStyle: "italic" }}>—</span>}
              </div>
            </div>
          ))}
        </div>
        {history.length > 0 && (
          <div style={{ marginTop: 24, padding: "12px 14px", background: "#111", border: `1px solid ${ORANGE}22`, borderRadius: 6 }}>
            <div style={{ fontSize: 11, color: ORANGE, fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>SCREEN TYPE</div>
            <div style={{ fontSize: 14, color: "#bbb" }}>{SCREEN_TYPES.find(t => t.id === screenType)?.label}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Edit view ────────────────────────────────────────────────────────────────

function EditView({ screen, project, onUpdate, onBack, onUpdateProject }: {
  screen: Screen; project: Project;
  onUpdate: (s: Screen) => void; onBack: () => void;
  onUpdateProject: (p: Project) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidePanel, setSidePanel] = useState<"blocks" | "citations">("blocks");

  function handleUpdateBlock(b: Block) { onUpdate(updateBlock(screen, b)); }
  function handleAddBlock(type: BlockType, afterId?: string) { onUpdate(addBlock(screen, newBlock(type), afterId)); }
  function handleRemoveBlock(id: string) { onUpdate(removeBlock(screen, id)); if (selectedId === id) setSelectedId(null); }
  function handleMoveBlock(id: string, dir: "up" | "down") { onUpdate(moveBlock(screen, id, dir)); }
  function toggleCitation(label: string) {
    const fc = screen.footerCitations.includes(label)
      ? screen.footerCitations.filter(c => c !== label)
      : [...screen.footerCitations, label];
    onUpdate({ ...screen, footerCitations: fc });
  }

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      {/* Left panel */}
      <div style={{ width: 320, flexShrink: 0, borderRight: "1px solid #2a2a2a", display: "flex", flexDirection: "column" }}>
        {/* Panel tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #2a2a2a", flexShrink: 0 }}>
          {(["blocks", "citations"] as const).map(tab => (
            <button key={tab} onClick={() => setSidePanel(tab)}
              style={{ flex: 1, background: "none", border: "none", borderBottom: `2px solid ${sidePanel === tab ? ORANGE : "transparent"}`, padding: "12px 0", color: sidePanel === tab ? "#fff" : "#666", fontWeight: 700, fontSize: 12, letterSpacing: 0.5, cursor: "pointer", textTransform: "uppercase" }}>
              {tab}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {sidePanel === "blocks" && (
            <BlockEditorPanel
              screen={screen}
              selectedId={selectedId}
              evidence={project.evidence}
              onUpdateBlock={handleUpdateBlock}
              onSelectBlock={setSelectedId}
              onAddBlock={handleAddBlock}
              onRemoveBlock={handleRemoveBlock}
              onMoveBlock={handleMoveBlock}
            />
          )}
          {sidePanel === "citations" && (
            <CitationLibraryPanel
              citations={project.citations}
              onAdd={label => onUpdateProject(addCitation(project, label))}
              onDelete={id => onUpdateProject(deleteCitation(project, id))}
              screenCitations={screen.footerCitations}
              onToggle={toggleCitation}
            />
          )}
        </div>

        {/* Screen number */}
        <div style={{ borderTop: "1px solid #2a2a2a", padding: "12px 20px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: "#777", fontWeight: 700 }}>SCREEN #</span>
          <input value={screen.screenNumber} onChange={e => onUpdate({ ...screen, screenNumber: e.target.value })}
            style={{ width: 60, background: "#111", border: "1px solid #333", borderRadius: 6, padding: "6px 10px", color: "#fff", fontSize: 14, fontWeight: 800, outline: "none", textAlign: "center" }} />
          <button onClick={onBack}
            style={{ marginLeft: "auto", background: "none", border: "1px solid #444", color: "#aaa", borderRadius: 6, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            <ChevronLeft size={13} /> All Screens
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, minWidth: 0, background: "#0e0e0e", overflow: "hidden", position: "relative" }}>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%) scale(0.54)", transformOrigin: "center" }}>
          <BlockCanvas
            blocks={screen.blocks}
            screenNumber={screen.screenNumber}
            footerCitations={screen.footerCitations}
            selectedBlockId={selectedId || undefined}
            onBlockClick={setSelectedId}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Project view ─────────────────────────────────────────────────────────────

function ProjectView({ project, onNewScreen, onEditScreen, onDeleteScreen, onUpdateProject }: {
  project: Project; onNewScreen: () => void; onEditScreen: (s: Screen) => void;
  onDeleteScreen: (id: string) => void; onUpdateProject: (p: Project) => void;
}) {
  const [sidebar, setSidebar] = useState<"evidence" | "citations">("evidence");

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      {/* Left: Evidence / Citations */}
      <div style={{ width: 320, flexShrink: 0, borderRight: "1px solid #2a2a2a", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", borderBottom: "1px solid #2a2a2a", flexShrink: 0 }}>
          {(["evidence", "citations"] as const).map(tab => (
            <button key={tab} onClick={() => setSidebar(tab)}
              style={{ flex: 1, background: "none", border: "none", borderBottom: `2px solid ${sidebar === tab ? ORANGE : "transparent"}`, padding: "12px 0", color: sidebar === tab ? "#fff" : "#666", fontWeight: 700, fontSize: 12, letterSpacing: 0.5, cursor: "pointer", textTransform: "uppercase" }}>
              {tab}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {sidebar === "evidence" && (
            <EvidenceVaultPanel
              evidence={project.evidence}
              onAdd={e => onUpdateProject(addEvidence(project, e))}
              onDelete={id => onUpdateProject(deleteEvidence(project, id))}
            />
          )}
          {sidebar === "citations" && (
            <CitationLibraryPanel
              citations={project.citations}
              onAdd={label => onUpdateProject(addCitation(project, label))}
              onDelete={id => onUpdateProject(deleteCitation(project, id))}
            />
          )}
        </div>
      </div>

      {/* Right: Screen grid */}
      <div style={{ flex: 1, padding: "32px 36px", overflowY: "auto" }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 22, fontWeight: 900 }}>Screens</div>
          <div style={{ color: "#777", fontSize: 13, marginTop: 2 }}>{project.screens.length} screen{project.screens.length !== 1 ? "s" : ""}</div>
        </div>

        {project.screens.length === 0 && (
          <div style={{ textAlign: "center", paddingTop: 80 }}>
            <Layers size={48} color="#333" style={{ marginBottom: 16 }} />
            <div style={{ color: "#666", fontSize: 15, marginBottom: 20 }}>No screens yet. Start building your first one.</div>
            <Btn onClick={onNewScreen} variant="orange"><Plus size={15} /> Build First Screen</Btn>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
          {project.screens.map(screen => (
            <div key={screen.id}
              style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 10, overflow: "hidden", cursor: "pointer" }}
              onClick={() => onEditScreen(screen)}
              onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "#2a2a2a")}
            >
              {/* Mini preview */}
              <div style={{ height: 140, background: "#0a0a0a", overflow: "hidden", position: "relative" }}>
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%) scale(0.13)", transformOrigin: "center", pointerEvents: "none" }}>
                  <BlockCanvas blocks={screen.blocks} screenNumber={screen.screenNumber} footerCitations={screen.footerCitations} />
                </div>
              </div>
              <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{screen.title}</div>
                  <div style={{ color: "#666", fontSize: 11 }}>Screen {screen.screenNumber} · {screen.blocks.length} blocks</div>
                </div>
                <button onClick={e => { e.stopPropagation(); onDeleteScreen(screen.id); }}
                  style={{ background: "none", border: "none", color: "#555", cursor: "pointer", padding: 4, flexShrink: 0 }}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

type AppView = "project" | "pick_type" | "build" | "edit";

export default function App() {
  const [project, setProjectRaw] = useState<Project>(() => loadProject());
  const [view, setView] = useState<AppView>("project");
  const [buildType, setBuildType] = useState<ScreenType | null>(null);
  const [editScreen, setEditScreenState] = useState<Screen | null>(null);
  const [editingCaseName, setEditingCaseName] = useState(false);
  const [caseInput, setCaseInput] = useState(project.caseName);

  function setProject(p: Project) {
    setProjectRaw(p);
    saveProject(p);
  }

  function handleConversationComplete(data: DataMap) {
    if (!buildType) return;
    const screen = buildScreen(buildType, data);
    const updated = addScreen(project, screen);
    setProject(updated);
    setEditScreenState(screen);
    setView("edit");
  }

  function handleUpdateScreen(s: Screen) {
    setEditScreenState(s);
    setProject(updateScreen(project, s));
  }

  function handleDeleteScreen(id: string) {
    setProject(deleteScreen(project, id));
    if (editScreen?.id === id) { setEditScreenState(null); setView("project"); }
  }

  function saveCaseName() {
    setProject({ ...project, caseName: caseInput });
    setEditingCaseName(false);
  }

  const screenTypeDef = buildType ? SCREEN_TYPES.find(t => t.id === buildType) : null;

  return (
    <div style={{ height: "100vh", background: "#161616", color: "#fff", fontFamily: "Arial, sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid #2a2a2a", padding: "12px 24px", display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setView("project")}>
          <div style={{ width: 10, height: 10, background: ORANGE, borderRadius: 2 }} />
          <span style={{ fontWeight: 900, fontSize: 15, letterSpacing: 0.5 }}>LEGAL SCREEN BUILDER</span>
        </div>
        <div style={{ width: 1, height: 20, background: "#333" }} />
        {/* Case name */}
        {editingCaseName ? (
          <div style={{ display: "flex", gap: 6 }}>
            <input value={caseInput} onChange={e => setCaseInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") saveCaseName(); if (e.key === "Escape") setEditingCaseName(false); }}
              autoFocus style={{ background: "#111", border: `1px solid ${ORANGE}`, borderRadius: 5, padding: "4px 10px", color: "#fff", fontSize: 13, fontWeight: 700, outline: "none" }} />
            <button onClick={saveCaseName} style={{ background: ORANGE, border: "none", borderRadius: 5, padding: "4px 8px", cursor: "pointer" }}><Check size={13} color="#000" /></button>
          </div>
        ) : (
          <button onClick={() => { setEditingCaseName(true); setCaseInput(project.caseName); }}
            style={{ background: "none", border: "none", color: "#bbb", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
            <BookOpen size={13} color={ORANGE} />
            {project.caseName}
            <Edit3 size={11} color="#555" />
          </button>
        )}

        {/* Breadcrumbs */}
        {view === "build" && screenTypeDef && (
          <><span style={{ color: "#444" }}>/</span><span style={{ color: "#888", fontSize: 13 }}>{screenTypeDef.label}</span></>
        )}
        {view === "edit" && editScreen && (
          <><span style={{ color: "#444" }}>/</span><span style={{ color: "#888", fontSize: 13 }}>{editScreen.title}</span></>
        )}

        <div style={{ flex: 1 }} />

        {view !== "project" && (
          <Btn onClick={() => setView("project")}>
            <ChevronLeft size={13} /> Screens
          </Btn>
        )}
        {(view === "project" || view === "edit") && (
          <Btn onClick={() => setView("pick_type")} variant="orange">
            <Plus size={14} /> New Screen
          </Btn>
        )}
      </div>

      {/* Views */}
      {view === "project" && (
        <ProjectView
          project={project}
          onNewScreen={() => setView("pick_type")}
          onEditScreen={s => { setEditScreenState(s); setView("edit"); }}
          onDeleteScreen={handleDeleteScreen}
          onUpdateProject={setProject}
        />
      )}

      {view === "pick_type" && (
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "56px 24px", width: "100%" }}>
          <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 6 }}>What are you building?</h1>
          <p style={{ color: "#999", marginBottom: 32, fontSize: 15 }}>
            Choose a starting layout. I'll ask you about the evidence — your screen assembles itself as you answer.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 32 }}>
            {SCREEN_TYPES.map(t => {
              const Icon = t.icon;
              return (
                <button key={t.id} onClick={() => { setBuildType(t.id); setView("build"); }}
                  style={{ background: "#1d1d1d", border: "1px solid #333", borderRadius: 10, padding: 20, textAlign: "left", cursor: "pointer", color: "#fff" }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "#333")}
                >
                  <Icon size={22} color={ORANGE} style={{ marginBottom: 10 }} />
                  <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 3 }}>{t.label}</div>
                  <div style={{ color: "#999", fontSize: 12 }}>{t.blurb}</div>
                </button>
              );
            })}
          </div>
          <div style={{ padding: 16, border: "1px dashed #2a2a2a", borderRadius: 8, color: "#555", fontSize: 13 }}>
            More layouts coming — Timeline, Investigation Failure, Pattern of Conduct, Witness Impeachment, and more.
          </div>
        </div>
      )}

      {view === "build" && buildType && (
        <ConversationView
          screenType={buildType}
          evidence={project.evidence}
          onComplete={handleConversationComplete}
          onBack={() => setView("pick_type")}
        />
      )}

      {view === "edit" && editScreen && (
        <EditView
          screen={editScreen}
          project={project}
          onUpdate={handleUpdateScreen}
          onBack={() => setView("project")}
          onUpdateProject={setProject}
        />
      )}
    </div>
  );
}

import React, { useState, useRef, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  Plus, X, ChevronRight, ChevronLeft, ArrowRight, Lightbulb,
  Trash2, Edit3, ChevronUp, ChevronDown, FileSearch,
  Video, FileText, Mic, Image, File, BookOpen, Scale, Clock, XCircle,
  Quote, Check, Layers, Download, Share2, Search, LayoutGrid,
  Home, Wrench, GraduationCap, User, Brain, Zap, AlertTriangle,
  HelpCircle, TrendingUp, Shield, ChevronDown as ChevronDownIcon,
  Key, Settings, Star, Archive, Sliders, History, RefreshCw,
  FlipHorizontal, Copy,
} from "lucide-react";
import {
  Block, BlockType, DataMap, Evidence, EvidenceType,
  Project, Screen, ScreenType, BLOCK_FIELDS, LegalItem,
} from "./types";
import {
  loadProject, saveProject,
  addScreen, updateScreen, deleteScreen,
  updateBlock, addBlock, removeBlock, moveBlock,
  addEvidence, deleteEvidence, addCitation, deleteCitation,
} from "./store";
import { TREES, detectSuggestion, buildScreen, newBlock } from "./engine";
import { LEGAL_LIBRARY, searchLaws, recommendLaws } from "./laws";
import { BlockCanvas } from "./BlockCanvas";
import { staticTutorService, TutorInsight, LearningCard } from "./services/tutor";

const ORANGE = "#d9711f";
const BG = "#0c0c0c";

// ─── Conversation state ───────────────────────────────────────────────────────
interface ConvState {
  nodeId: string;
  data: DataMap;
  history: { nodeId: string; nodeKey: string; question: string; answer: string }[];
  input: string;
}
const FRESH_CONV: ConvState = { nodeId: "start", data: {}, history: [], input: "" };

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useWindowWidth() {
  const [w, setW] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1280));
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return w;
}

// ─── Error Boundary ───────────────────────────────────────────────────────────
interface EBState { error: string | null }
class ErrorBoundary extends React.Component<{ children: React.ReactNode; onReset?: () => void }, EBState> {
  state: EBState = { error: null };
  static getDerivedStateFromError(err: Error): EBState { return { error: err.message }; }
  componentDidCatch(err: Error, info: React.ErrorInfo) { console.error("[HL]", err.message, info.componentStack); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: ORANGE, marginBottom: 10 }}>Something went wrong</div>
          <pre style={{ fontFamily: "monospace", fontSize: 12, color: "#777", maxWidth: 480, textAlign: "center", whiteSpace: "pre-wrap", marginBottom: 24 }}>{this.state.error}</pre>
          <button onClick={() => { this.setState({ error: null }); this.props.onReset?.(); }}
            style={{ background: ORANGE, border: "none", borderRadius: 10, padding: "12px 24px", color: "#000", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
            Go Back
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Screen type definitions ──────────────────────────────────────────────────
const SCREEN_TYPES: { id: ScreenType; label: string; blurb: string; icon: React.ElementType }[] = [
  { id: "contradiction", label: "Contradiction", blurb: "Two statements that can't both be true", icon: XCircle },
  { id: "quote", label: "Quote Breakdown", blurb: "Why one exact quote matters", icon: Quote },
  { id: "prior_incident", label: "Prior Incident", blurb: "This wasn't the first time", icon: Clock },
  { id: "admission", label: "Admission", blurb: "They already knew — and said so", icon: Mic },
  { id: "policy_violation", label: "Policy Violation", blurb: "Policy required vs. what happened", icon: Scale },
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
  bodycam: Video, report: FileText, statement: Mic,
  document: File, photo: Image, other: FileSearch,
};

// ─── Export utilities ─────────────────────────────────────────────────────────
async function captureScreen(screen: Screen, scale = 1): Promise<HTMLCanvasElement> {
  const container = document.createElement("div");
  container.style.cssText = `position:fixed;left:-99999px;top:0;width:1080px;height:1080px;overflow:hidden;z-index:-9;`;
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(
    React.createElement(BlockCanvas, {
      blocks: screen.blocks,
      screenNumber: screen.screenNumber,
      footerCitations: screen.footerCitations,
    })
  );
  await new Promise(r => setTimeout(r, 450));
  const h2c = (await import("html2canvas")).default;
  const canvas = await h2c(container, {
    scale, backgroundColor: "#0a0a0a", useCORS: true,
    width: 1080, height: 1080, logging: false,
  });
  root.unmount();
  document.body.removeChild(container);
  return canvas;
}

function slug(screen: Screen) {
  return (screen.title || "screen").replace(/[^a-z0-9]/gi, "_").toLowerCase().slice(0, 40);
}

async function doExport(screen: Screen, format: "png1080" | "png4k" | "jpeg" | "pdf" | "share" | "copy") {
  const scale = format === "png4k" ? 4 : 1;
  const canvas = await captureScreen(screen, scale);
  const name = slug(screen);
  if (format === "pdf") {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [1080, 1080] });
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 1080, 1080);
    pdf.save(`${name}.pdf`); return;
  }
  if (format === "share" || format === "copy") {
    const blob = await new Promise<Blob>((res, rej) =>
      canvas.toBlob(b => (b ? res(b) : rej(new Error("Failed to create blob"))), "image/png")
    );
    if (format === "share" && navigator.share) {
      const file = new (window as any).File([blob], `${name}.png`, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
    }
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return;
  }
  const link = document.createElement("a");
  link.download = `${name}${format === "png4k" ? "_4k" : ""}${format === "jpeg" ? ".jpg" : ".png"}`;
  link.href = canvas.toDataURL(format === "jpeg" ? "image/jpeg" : "image/png", 0.95);
  link.click();
}

// ─── Export modal ─────────────────────────────────────────────────────────────
function ExportModal({ screen, onClose }: { screen: Screen; onClose: () => void }) {
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function run(format: "png1080" | "png4k" | "jpeg" | "pdf" | "share" | "copy") {
    setStatus("Rendering…"); setErr(null);
    try {
      await doExport(screen, format);
      setStatus(format === "copy" ? "Copied!" : format === "share" ? "Sharing…" : "Downloaded!");
      setTimeout(() => setStatus(null), 2200);
    } catch (e) { console.error(e); setErr("Export failed — try again."); setStatus(null); }
  }
  const formats: { id: "png1080" | "png4k" | "jpeg" | "pdf"; label: string; sub: string }[] = [
    { id: "png1080", label: "PNG", sub: "1080 × 1080" },
    { id: "png4k", label: "PNG 4K", sub: "4320 × 4320" },
    { id: "jpeg", label: "JPEG", sub: "Smaller size" },
    { id: "pdf", label: "PDF", sub: "Print-ready" },
  ];
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000b", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={onClose}>
      <div style={{ background: "#1a1a1a", borderRadius: "20px 20px 0 0", padding: "20px 20px calc(20px + env(safe-area-inset-bottom))", width: "100%", maxWidth: 500 }}
        onClick={e => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: "#444", borderRadius: 2, margin: "0 auto 20px" }} />
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Export Screen</div>
        <div style={{ color: "#666", fontSize: 13, marginBottom: 20 }}>{screen.title}</div>
        {status && <div style={{ background: `${ORANGE}22`, border: `1px solid ${ORANGE}55`, borderRadius: 8, padding: "10px 14px", marginBottom: 14, color: ORANGE, fontSize: 14, fontWeight: 700 }}>{status}</div>}
        {err && <div style={{ background: "#7a202022", borderRadius: 8, padding: "10px 14px", marginBottom: 14, color: "#e06060", fontSize: 13 }}>{err}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          {formats.map(f => (
            <button key={f.id} onClick={() => run(f.id)} disabled={!!status}
              style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: 12, padding: "16px 14px", textAlign: "left", cursor: "pointer", color: "#fff", opacity: status ? 0.6 : 1 }}>
              <Download size={18} color={ORANGE} style={{ marginBottom: 8 }} />
              <div style={{ fontWeight: 700, fontSize: 15 }}>{f.label}</div>
              <div style={{ color: "#666", fontSize: 12, marginTop: 2 }}>{f.sub}</div>
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <button onClick={() => run("share")} disabled={!!status}
            style={{ background: ORANGE, border: "none", borderRadius: 12, padding: "16px", color: "#000", fontWeight: 800, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Share2 size={18} /> Share
          </button>
          <button onClick={() => run("copy")} disabled={!!status}
            style={{ background: "#2a2a2a", border: "none", borderRadius: 12, padding: "16px", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            Copy Image
          </button>
        </div>
        <button onClick={onClose}
          style={{ width: "100%", background: "none", border: "1px solid #333", borderRadius: 12, padding: "14px", color: "#888", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
function TapBtn({ children, onClick, variant = "ghost", full = false, disabled = false, style: ext }: {
  children: React.ReactNode; onClick: () => void;
  variant?: "orange" | "ghost" | "dark"; full?: boolean; disabled?: boolean; style?: React.CSSProperties;
}) {
  const base: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    borderRadius: 12, padding: "14px 20px", fontWeight: 700, fontSize: 16,
    cursor: disabled ? "default" : "pointer", border: "none", fontFamily: "Arial, sans-serif",
    minHeight: 52, width: full ? "100%" : undefined, opacity: disabled ? 0.5 : 1,
    WebkitTapHighlightColor: "transparent", touchAction: "manipulation",
  };
  const vars: Record<string, React.CSSProperties> = {
    orange: { background: ORANGE, color: "#0a0a0a" },
    ghost: { background: "transparent", border: "1px solid #3a3a3a", color: "#ddd" },
    dark: { background: "#1d1d1d", border: "1px solid #2a2a2a", color: "#fff" },
  };
  return <button onClick={disabled ? undefined : onClick} style={{ ...base, ...vars[variant], ...ext }}>{children}</button>;
}

function SmBtn({ children, onClick, variant = "ghost", style: ext }: {
  children: React.ReactNode; onClick: () => void;
  variant?: "orange" | "ghost" | "danger"; style?: React.CSSProperties;
}) {
  const base: React.CSSProperties = { display: "flex", alignItems: "center", gap: 5, borderRadius: 8, padding: "8px 13px", fontWeight: 700, fontSize: 13, cursor: "pointer", border: "none", fontFamily: "Arial, sans-serif", WebkitTapHighlightColor: "transparent" };
  const vars: Record<string, React.CSSProperties> = {
    orange: { background: ORANGE, color: "#000" },
    ghost: { background: "transparent", border: "1px solid #3a3a3a", color: "#ccc" },
    danger: { background: "transparent", border: "1px solid #5a2020", color: "#d07070" },
  };
  return <button onClick={onClick} style={{ ...base, ...vars[variant], ...ext }}>{children}</button>;
}

function FieldInput({ label, value, type = "text", onChange, evidenceItems, onInsertEvidence }: {
  label: string; value: string; type?: string; onChange: (v: string) => void;
  evidenceItems?: Evidence[]; onInsertEvidence?: (e: Evidence) => void;
}) {
  const [showVault, setShowVault] = useState(false);
  const base: React.CSSProperties = { background: "#111", border: "1px solid #333", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 15, fontFamily: "Arial, sans-serif", outline: "none", width: "100%", boxSizing: "border-box" };
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
        <label style={{ fontSize: 12, color: "#777", fontWeight: 700, letterSpacing: 0.5 }}>{label.toUpperCase()}</label>
        {evidenceItems && evidenceItems.length > 0 && (
          <button onClick={() => setShowVault(v => !v)} style={{ background: "none", border: "none", color: ORANGE, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>⬆ VAULT</button>
        )}
      </div>
      {type === "textarea"
        ? <textarea value={value} onChange={e => onChange(e.target.value)} rows={3} style={{ ...base, resize: "vertical" }}
            onFocus={e => (e.target.style.borderColor = ORANGE)} onBlur={e => (e.target.style.borderColor = "#333")} />
        : <input value={value} onChange={e => onChange(e.target.value)} style={base}
            onFocus={e => (e.target.style.borderColor = ORANGE)} onBlur={e => (e.target.style.borderColor = "#333")} />
      }
      {showVault && evidenceItems && evidenceItems.map(e => (
        <button key={e.id} onClick={() => { onInsertEvidence?.(e); setShowVault(false); }}
          style={{ width: "100%", background: "#111", border: "1px solid #222", borderRadius: 6, padding: "8px 10px", textAlign: "left", cursor: "pointer", marginTop: 4 }}>
          <div style={{ color: ORANGE, fontWeight: 700, fontSize: 12 }}>{e.label}</div>
          <div style={{ color: "#777", fontSize: 12, marginTop: 1 }}>{e.content.slice(0, 60)}…</div>
        </button>
      ))}
    </div>
  );
}

// ─── Block editor panel ───────────────────────────────────────────────────────
function BlockEditorPanel({ screen, selectedId, evidence, onUpdateBlock, onSelectBlock, onAddBlock, onRemoveBlock, onMoveBlock }: {
  screen: Screen; selectedId: string | null; evidence: Evidence[];
  onUpdateBlock: (b: Block) => void; onSelectBlock: (id: string | null) => void;
  onAddBlock: (type: BlockType, afterId?: string) => void;
  onRemoveBlock: (id: string) => void; onMoveBlock: (id: string, dir: "up" | "down") => void;
}) {
  const selectedBlock = screen.blocks.find(b => b.id === selectedId) || null;
  const fields = selectedBlock ? (BLOCK_FIELDS[selectedBlock.type] ?? []) : [];
  const [showAddMenu, setShowAddMenu] = useState(false);

  function updateField(key: string, val: string) {
    if (!selectedBlock) return;
    onUpdateBlock({ ...selectedBlock, data: { ...selectedBlock.data, [key]: val } });
  }
  function evidenceFor(key: string): Evidence[] {
    return ["quote", "content", "contentA", "contentB", "policyContent", "actualContent", "items"].includes(key) ? evidence : [];
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", overflowY: "auto", flex: 1 }}>
      <div style={{ padding: "16px 16px 0" }}>
        <div style={{ fontSize: 11, color: "#555", fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>BLOCKS</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
          {screen.blocks.map((b, idx) => (
            <div key={b.id} onClick={() => onSelectBlock(b.id === selectedId ? null : b.id)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 10px", borderRadius: 8, background: b.id === selectedId ? `${ORANGE}18` : "#111", border: `1px solid ${b.id === selectedId ? ORANGE : "#222"}`, cursor: "pointer", minHeight: 44 }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: b.id === selectedId ? ORANGE : "#ccc" }}>
                {BLOCK_TYPES.find(t => t.type === b.type)?.label ?? b.type}
              </span>
              <button onClick={ev => { ev.stopPropagation(); onMoveBlock(b.id, "up"); }} disabled={idx === 0}
                style={{ background: "none", border: "none", color: "#555", cursor: "pointer", padding: 4, minWidth: 28 }}><ChevronUp size={14} /></button>
              <button onClick={ev => { ev.stopPropagation(); onMoveBlock(b.id, "down"); }} disabled={idx === screen.blocks.length - 1}
                style={{ background: "none", border: "none", color: "#555", cursor: "pointer", padding: 4, minWidth: 28 }}><ChevronDown size={14} /></button>
              <button onClick={ev => { ev.stopPropagation(); onRemoveBlock(b.id); }}
                style={{ background: "none", border: "none", color: "#555", cursor: "pointer", padding: 4, minWidth: 28 }}><X size={14} /></button>
            </div>
          ))}
        </div>
        <div style={{ position: "relative", marginBottom: 14 }}>
          <button onClick={() => setShowAddMenu(v => !v)}
            style={{ width: "100%", background: "none", border: "1px dashed #333", borderRadius: 8, padding: "10px", color: "#666", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
            <Plus size={13} /> Add Block
          </button>
          {showAddMenu && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#111", border: `1px solid ${ORANGE}55`, borderRadius: 8, zIndex: 10, maxHeight: 200, overflowY: "auto", marginTop: 4 }}>
              {BLOCK_TYPES.map(t => (
                <button key={t.type} onClick={() => { onAddBlock(t.type, selectedId || undefined); setShowAddMenu(false); }}
                  style={{ width: "100%", background: "none", border: "none", borderBottom: "1px solid #1a1a1a", padding: "10px 12px", textAlign: "left", color: "#ccc", fontSize: 13, cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.color = ORANGE)}
                  onMouseLeave={e => (e.currentTarget.style.color = "#ccc")}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {selectedBlock && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid #222" }}>
          <div style={{ fontSize: 11, color: "#555", fontWeight: 700, letterSpacing: 0.5, margin: "14px 0 10px" }}>
            EDIT · {BLOCK_TYPES.find(t => t.type === selectedBlock.type)?.label?.toUpperCase()}
          </div>
          {fields.length === 0 && <div style={{ color: "#555", fontSize: 13 }}>No editable fields.</div>}
          {fields.map(f => (
            <FieldInput key={f.key} label={f.label} value={selectedBlock.data[f.key] ?? ""}
              type={f.type === "textarea" ? "textarea" : "text"}
              onChange={v => updateField(f.key, v)}
              evidenceItems={evidenceFor(f.key)}
              onInsertEvidence={e => updateField(f.key, e.content + (e.timestamp ? ` [${e.timestamp}]` : ""))} />
          ))}
        </div>
      )}
      {!selectedBlock && (
        <div style={{ padding: "14px 16px", color: "#555", fontSize: 13 }}>Tap a block to select and edit it.</div>
      )}
    </div>
  );
}

// ─── Evidence Vault panel ─────────────────────────────────────────────────────
function EvidenceVaultPanel({ evidence, onAdd, onDelete }: {
  evidence: Evidence[]; onAdd: (e: Evidence) => void; onDelete: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Partial<Evidence>>({ type: "bodycam" });
  const EV_TYPES: { value: EvidenceType; label: string }[] = [
    { value: "bodycam", label: "Bodycam" }, { value: "report", label: "Report" },
    { value: "statement", label: "Statement" }, { value: "document", label: "Document" },
    { value: "photo", label: "Photo" }, { value: "other", label: "Other" },
  ];

  function submit() {
    if (!form.label?.trim() || !form.content?.trim()) return;
    onAdd({ id: crypto.randomUUID(), type: form.type ?? "other", label: form.label, source: form.source ?? "", content: form.content, timestamp: form.timestamp });
    setForm({ type: "bodycam" }); setAdding(false);
  }

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Evidence Vault</div>
          <div style={{ color: "#666", fontSize: 12, marginTop: 2 }}>Import once · use anywhere</div>
        </div>
        <SmBtn onClick={() => setAdding(v => !v)} variant="orange"><Plus size={14} /> Add</SmBtn>
      </div>
      {adding && (
        <div style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: "#777", fontWeight: 700, display: "block", marginBottom: 5 }}>TYPE</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as EvidenceType }))}
              style={{ background: "#0a0a0a", border: "1px solid #333", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 14, width: "100%" }}>
              {EV_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <FieldInput label="Label" value={form.label ?? ""} onChange={v => setForm(f => ({ ...f, label: v }))} />
          <FieldInput label="Source" value={form.source ?? ""} onChange={v => setForm(f => ({ ...f, source: v }))} />
          {form.type === "bodycam" && <FieldInput label="Timestamp" value={form.timestamp ?? ""} onChange={v => setForm(f => ({ ...f, timestamp: v }))} />}
          <FieldInput label="Content" value={form.content ?? ""} type="textarea" onChange={v => setForm(f => ({ ...f, content: v }))} />
          <div style={{ display: "flex", gap: 8 }}>
            <TapBtn onClick={submit} variant="orange" style={{ flex: 1, minHeight: 44, fontSize: 14 }}>Save</TapBtn>
            <TapBtn onClick={() => setAdding(false)} style={{ minHeight: 44, fontSize: 14 }}>Cancel</TapBtn>
          </div>
        </div>
      )}
      {evidence.length === 0 && !adding && (
        <div style={{ textAlign: "center", paddingTop: 32, color: "#444" }}>
          <FileSearch size={36} color="#222" style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 13 }}>No evidence yet. Add bodycam, reports, and statements here.</div>
        </div>
      )}
      {evidence.map(e => {
        const Icon = EVIDENCE_ICONS[e.type] ?? File;
        return (
          <div key={e.id} style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <Icon size={16} color={ORANGE} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{e.label}</div>
                {e.source && <div style={{ color: "#555", fontSize: 12, marginBottom: 4 }}>{e.source}</div>}
                {e.timestamp && <div style={{ color: ORANGE, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{e.timestamp}</div>}
                <div style={{ color: "#888", fontSize: 13, lineHeight: 1.4 }}>{e.content.slice(0, 120)}{e.content.length > 120 ? "…" : ""}</div>
              </div>
              <button onClick={() => onDelete(e.id)} style={{ background: "none", border: "none", color: "#444", cursor: "pointer", padding: 4, minWidth: 32, minHeight: 32 }}><Trash2 size={14} /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Legal Library panel ──────────────────────────────────────────────────────
function LegalLibraryPanel({ citations, onAddCitation }: { citations: string[]; onAddCitation: (label: string) => void }) {
  const [q, setQ] = useState("");
  const results = q.length >= 2 ? searchLaws(q) : LEGAL_LIBRARY.slice(0, 20);
  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Legal Library</div>
      <div style={{ color: "#666", fontSize: 12, marginBottom: 12 }}>Search precedents and standards</div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search cases, statutes, standards…"
        style={{ background: "#111", border: "1px solid #333", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 14, width: "100%", boxSizing: "border-box", marginBottom: 12, outline: "none" }} />
      {results.map((item: LegalItem) => (
        <div key={item.id} style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <Scale size={14} color={ORANGE} style={{ flexShrink: 0, marginTop: 3 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{item.citation}</div>
              {item.court && <div style={{ color: "#555", fontSize: 11, marginTop: 1 }}>{item.court}</div>}
              <div style={{ color: "#888", fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>{item.summary}</div>
            </div>
            <button onClick={() => onAddCitation(item.citation)} disabled={citations.includes(item.citation)}
              style={{ background: citations.includes(item.citation) ? "#1a1a1a" : ORANGE, border: "none", borderRadius: 6, padding: "6px 10px", color: citations.includes(item.citation) ? "#555" : "#000", fontSize: 11, fontWeight: 700, cursor: citations.includes(item.citation) ? "default" : "pointer", flexShrink: 0 }}>
              {citations.includes(item.citation) ? "Added" : "Add"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Citation Library panel ───────────────────────────────────────────────────
function CitationLibraryPanel({ citations, onAdd, onDelete }: { citations: string[]; onAdd: (label: string) => void; onDelete: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [custom, setCustom] = useState("");
  const filtered = q ? citations.filter(c => c.toLowerCase().includes(q.toLowerCase())) : citations;
  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>My Citations</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input value={custom} onChange={e => setCustom(e.target.value)} placeholder="Add custom citation…"
          style={{ flex: 1, background: "#111", border: "1px solid #333", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 13, outline: "none" }} />
        <button onClick={() => { if (custom.trim()) { onAdd(custom.trim()); setCustom(""); } }}
          style={{ background: ORANGE, border: "none", borderRadius: 8, padding: "8px 12px", color: "#000", fontWeight: 700, cursor: "pointer" }}><Plus size={16} /></button>
      </div>
      {citations.length > 4 && <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter…"
        style={{ background: "#111", border: "1px solid #222", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box", marginBottom: 10 }} />}
      {filtered.length === 0 && <div style={{ color: "#444", fontSize: 13 }}>No citations added yet. Use the Legal Library to find and add cases.</div>}
      {filtered.map((c, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "#111", border: "1px solid #1e1e1e", borderRadius: 8, padding: "10px 12px", marginBottom: 6 }}>
          <Scale size={13} color={ORANGE} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{c}</span>
          <button onClick={() => onDelete(c)} style={{ background: "none", border: "none", color: "#444", cursor: "pointer", padding: 4 }}><X size={13} /></button>
        </div>
      ))}
    </div>
  );
}

// ─── Conversation (Tutor build flow) view ─────────────────────────────────────
function ConversationView({ screenType, evidence, conv, onConvChange, onComplete, onBack, isMobile }: {
  screenType: ScreenType; evidence: Evidence[];
  conv: ConvState; onConvChange: (c: ConvState) => void;
  onComplete: (data: DataMap) => void; onBack: () => void; isMobile: boolean;
}) {
  const tree = TREES[screenType];
  const node = tree[conv.nodeId];
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => { setTimeout(() => (inputRef.current as HTMLElement | null)?.focus(), 100); }, [conv.nodeId]);

  const suggestion = detectSuggestion(conv.data, screenType);

  function submit(answer: string) {
    if (!answer.trim() || !node) return;
    const nextId = typeof node.next === "function" ? node.next(answer) : node.next;
    const newData = { ...conv.data, [node.key]: answer };
    const newHistory = [...conv.history, { nodeId: node.id, nodeKey: node.key, question: node.question, answer }];
    if (nextId === null) { onComplete(newData); return; }
    onConvChange({ nodeId: nextId, data: newData, history: newHistory, input: "" });
  }

  function goBack() {
    if (conv.history.length === 0) { onBack(); return; }
    const last = conv.history[conv.history.length - 1];
    onConvChange({ nodeId: last.nodeId, data: conv.data, history: conv.history.slice(0, -1), input: last.answer });
  }

  if (!node) return null;

  const vaultItems = node.evidenceTypes
    ? evidence.filter(e => node.evidenceTypes!.includes(e.type as EvidenceType))
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* Progress */}
      <div style={{ padding: "10px 16px", borderBottom: "1px solid #1a1a1a", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {conv.history.map((_, i) => <div key={i} style={{ flex: 1, height: 3, background: ORANGE, borderRadius: 2 }} />)}
          <div style={{ flex: 1, height: 3, background: "#1e1e1e", borderRadius: 2 }} />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" as never }}>
        {/* History */}
        {conv.history.length > 0 && (
          <div style={{ padding: "12px 16px 0" }}>
            {conv.history.slice(-3).map((h, i) => (
              <div key={i} style={{ marginBottom: 12, opacity: 0.5 }}>
                <div style={{ fontSize: 11, color: "#555", fontWeight: 700, marginBottom: 3 }}>{h.question}</div>
                <div style={{ fontSize: 14, color: "#888", background: "#0e0e0e", borderRadius: 8, padding: "8px 10px" }}>{h.answer.slice(0, 80)}{h.answer.length > 80 ? "…" : ""}</div>
              </div>
            ))}
          </div>
        )}

        {/* Suggestion nudge */}
        {suggestion && (
          <div style={{ margin: "0 16px 12px", background: `${ORANGE}14`, border: `1px solid ${ORANGE}33`, borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <Lightbulb size={14} color={ORANGE} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 13, color: "#ccc" }}>
                <span style={{ color: ORANGE, fontWeight: 700 }}>Noticed: </span>
                You might also build a {SCREEN_TYPES.find(t => t.id === suggestion)?.label} screen from this.
              </div>
            </div>
          </div>
        )}

        {/* Current question */}
        <div style={{ padding: "16px 16px 24px" }}>
          <div style={{ fontSize: isMobile ? 20 : 22, fontWeight: 900, lineHeight: 1.3, marginBottom: 6, letterSpacing: -0.3 }}>{node.question}</div>
          {node.subtext && <div style={{ color: "#666", fontSize: 14, lineHeight: 1.5, marginBottom: 20 }}>{node.subtext}</div>}

          {node.type === "choice" && node.choices && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {node.choices.map(ch => (
                <button key={ch.value} onClick={() => submit(ch.value)}
                  style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: 12, padding: "16px 18px", textAlign: "left", cursor: "pointer", color: "#fff", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 10, WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = ORANGE; (e.currentTarget as HTMLButtonElement).style.color = ORANGE; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#2a2a2a"; (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}>
                  <ChevronRight size={16} color={ORANGE} /> {ch.label}
                </button>
              ))}
            </div>
          )}

          {node.type !== "choice" && (
            <div>
              {vaultItems.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: "#555", fontWeight: 700, marginBottom: 6 }}>FROM VAULT</div>
                  {vaultItems.map(e => (
                    <button key={e.id} onClick={() => onConvChange({ ...conv, input: e.content + (e.timestamp ? ` [${e.timestamp}]` : "") })}
                      style={{ width: "100%", background: "#0e0e0e", border: `1px solid ${ORANGE}33`, borderRadius: 8, padding: "8px 10px", textAlign: "left", cursor: "pointer", marginBottom: 4 }}>
                      <div style={{ color: ORANGE, fontWeight: 700, fontSize: 12 }}>{e.label}</div>
                      <div style={{ color: "#777", fontSize: 12, marginTop: 1 }}>{e.content.slice(0, 60)}…</div>
                    </button>
                  ))}
                </div>
              )}

              {node.type === "textarea"
                ? <textarea ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                    value={conv.input} onChange={e => onConvChange({ ...conv, input: e.target.value })}
                    onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(conv.input); }}
                    rows={isMobile ? 4 : 5} placeholder="Type here…"
                    style={{ background: "#111", border: "1px solid #333", borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 15, fontFamily: "Arial, sans-serif", outline: "none", width: "100%", boxSizing: "border-box", resize: "vertical", lineHeight: 1.5 }}
                    onFocus={e => (e.target.style.borderColor = ORANGE)} onBlur={e => (e.target.style.borderColor = "#333")} />
                : <input ref={inputRef as React.RefObject<HTMLInputElement>}
                    value={conv.input} onChange={e => onConvChange({ ...conv, input: e.target.value })}
                    onKeyDown={e => { if (e.key === "Enter") submit(conv.input); }}
                    placeholder="Type here…"
                    style={{ background: "#111", border: "1px solid #333", borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 15, fontFamily: "Arial, sans-serif", outline: "none", width: "100%", boxSizing: "border-box" }}
                    onFocus={e => (e.target.style.borderColor = ORANGE)} onBlur={e => (e.target.style.borderColor = "#333")} />
              }
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <TapBtn onClick={() => submit(conv.input)} variant="orange" style={{ flex: 1, minHeight: 50 }} disabled={!conv.input.trim()}>
                  {node.next === null ? "Build Screen" : "Next"} <ArrowRight size={16} />
                </TapBtn>
              </div>
              {node.type === "textarea" && <div style={{ color: "#444", fontSize: 12, marginTop: 6, textAlign: "right" }}>⌘ + Enter to continue</div>}
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "10px 16px calc(10px + env(safe-area-inset-bottom))", borderTop: "1px solid #1a1a1a", flexShrink: 0 }}>
        <SmBtn onClick={goBack}><ChevronLeft size={13} /> {conv.history.length === 0 ? "Change Type" : "Back"}</SmBtn>
      </div>
    </div>
  );
}

// ─── Edit view (screen editor) ────────────────────────────────────────────────
function EditView({ screen, project, onUpdate, onBack, onUpdateProject, isMobile }: {
  screen: Screen; project: Project; onUpdate: (s: Screen) => void;
  onBack: () => void; onUpdateProject: (p: Project) => void; isMobile: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorTab, setEditorTab] = useState<"blocks" | "vault" | "laws">("blocks");
  const [showExport, setShowExport] = useState(false);
  const [showMobileEdit, setShowMobileEdit] = useState(false);

  function handleUpdateBlock(b: Block) { onUpdate(updateBlock(screen, b)); }
  function handleAddBlock(type: BlockType, afterId?: string) { onUpdate(addBlock(screen, newBlock(type), afterId)); }
  function handleRemoveBlock(id: string) { onUpdate(removeBlock(screen, id)); setSelectedId(null); }
  function handleMoveBlock(id: string, dir: "up" | "down") { onUpdate(moveBlock(screen, id, dir)); }
  const recomm = recommendLaws(screen).slice(0, 4);

  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid #1e1e1e", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <input value={screen.title} onChange={e => onUpdate({ ...screen, title: e.target.value })}
            style={{ flex: 1, background: "none", border: "none", color: "#fff", fontSize: 16, fontWeight: 800, outline: "none" }} />
          <input value={screen.screenNumber} onChange={e => onUpdate({ ...screen, screenNumber: e.target.value })}
            style={{ width: 56, background: "#111", border: "1px solid #2a2a2a", borderRadius: 6, padding: "6px 8px", color: "#fff", fontSize: 15, fontWeight: 800, outline: "none", textAlign: "center" }} />
          <button onClick={() => setShowExport(true)}
            style={{ background: ORANGE, border: "none", borderRadius: 8, padding: "8px 14px", color: "#000", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Download size={14} /> Export
          </button>
        </div>
        <div style={{ flex: 1, background: "#080808", overflow: "hidden", position: "relative" }}
          onClick={() => setShowMobileEdit(true)}>
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%) scale(0.33)", transformOrigin: "center" }}>
            <BlockCanvas blocks={screen.blocks} screenNumber={screen.screenNumber}
              footerCitations={screen.footerCitations}
              selectedBlockId={selectedId ?? undefined} onBlockClick={setSelectedId} />
          </div>
          <div style={{ position: "absolute", bottom: 12, right: 12, background: ORANGE, borderRadius: 8, padding: "6px 12px", color: "#000", fontWeight: 700, fontSize: 12 }}>
            Tap to edit blocks
          </div>
        </div>
        {showMobileEdit && (
          <div style={{ position: "fixed", inset: 0, background: "#0c0c0c", zIndex: 100, display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #1e1e1e", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Edit Blocks</div>
              <button onClick={() => setShowMobileEdit(false)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer" }}><X size={20} /></button>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              <BlockEditorPanel screen={screen} selectedId={selectedId} evidence={project.evidence}
                onUpdateBlock={handleUpdateBlock} onSelectBlock={setSelectedId}
                onAddBlock={handleAddBlock} onRemoveBlock={handleRemoveBlock} onMoveBlock={handleMoveBlock} />
            </div>
          </div>
        )}
        {showExport && <ExportModal screen={screen} onClose={() => setShowExport(false)} />}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      <div style={{ width: 300, flexShrink: 0, borderRight: "1px solid #1e1e1e", display: "flex", flexDirection: "column", overflowY: "auto" }}>
        <div style={{ display: "flex", borderBottom: "1px solid #1e1e1e", flexShrink: 0 }}>
          {(["blocks", "vault", "laws"] as const).map(tab => (
            <button key={tab} onClick={() => setEditorTab(tab)}
              style={{ flex: 1, background: "none", border: "none", borderBottom: `2px solid ${editorTab === tab ? ORANGE : "transparent"}`, padding: "11px 0", color: editorTab === tab ? "#fff" : "#555", fontWeight: 700, fontSize: 11, letterSpacing: 0.5, cursor: "pointer", textTransform: "uppercase" }}>
              {tab}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {editorTab === "blocks" && (
            <BlockEditorPanel screen={screen} selectedId={selectedId} evidence={project.evidence}
              onUpdateBlock={handleUpdateBlock} onSelectBlock={setSelectedId}
              onAddBlock={handleAddBlock} onRemoveBlock={handleRemoveBlock} onMoveBlock={handleMoveBlock} />
          )}
          {editorTab === "vault" && (
            <EvidenceVaultPanel evidence={project.evidence}
              onAdd={e => onUpdateProject(addEvidence(project, e))}
              onDelete={id => onUpdateProject(deleteEvidence(project, id))} />
          )}
          {editorTab === "laws" && (
            <LegalLibraryPanel citations={project.citations}
              onAddCitation={label => onUpdateProject(addCitation(project, label))} />
          )}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "10px 16px", borderBottom: "1px solid #1e1e1e", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <input value={screen.title} onChange={e => onUpdate({ ...screen, title: e.target.value })}
            style={{ flex: 1, background: "none", border: "none", color: "#fff", fontSize: 16, fontWeight: 800, outline: "none" }} />
          <input value={screen.screenNumber} onChange={e => onUpdate({ ...screen, screenNumber: e.target.value })}
            style={{ width: 56, background: "#111", border: "1px solid #2a2a2a", borderRadius: 6, padding: "6px 8px", color: "#fff", fontSize: 15, fontWeight: 800, outline: "none", textAlign: "center" }} />
          <div style={{ flex: 1 }} />
          <button onClick={() => setShowExport(true)}
            style={{ background: ORANGE, border: "none", borderRadius: 8, padding: "8px 14px", color: "#000", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Download size={14} /> Export
          </button>
          <SmBtn onClick={onBack}><ChevronLeft size={13} /> Screens</SmBtn>
        </div>
        <div style={{ flex: 1, minWidth: 0, background: "#080808", overflow: "hidden", position: "relative" }}>
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%) scale(0.54)", transformOrigin: "center" }}>
            <BlockCanvas blocks={screen.blocks} screenNumber={screen.screenNumber}
              footerCitations={screen.footerCitations}
              selectedBlockId={selectedId ?? undefined} onBlockClick={setSelectedId} />
          </div>
        </div>
        {showExport && <ExportModal screen={screen} onClose={() => setShowExport(false)} />}
      </div>
    </div>
  );
}

// ─── Project / screens list ───────────────────────────────────────────────────
type ProjectSubTab = "screens" | "vault" | "laws" | "citations";

function ProjectView({ project, onNewScreen, onEditScreen, onDeleteScreen, onUpdateProject, isMobile, activeTab, onTabChange }: {
  project: Project; onNewScreen: () => void; onEditScreen: (s: Screen) => void;
  onDeleteScreen: (id: string) => void; onUpdateProject: (p: Project) => void;
  isMobile: boolean; activeTab: ProjectSubTab; onTabChange: (t: ProjectSubTab) => void;
}) {
  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" as never }}>
          {activeTab === "screens" && (
            <div style={{ padding: "20px 16px" }}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 20, fontWeight: 900 }}>Screens</div>
                <div style={{ color: "#555", fontSize: 13 }}>{project.screens.length} screen{project.screens.length !== 1 ? "s" : ""}</div>
              </div>
              {project.screens.length === 0 && (
                <div style={{ textAlign: "center", paddingTop: 60 }}>
                  <Layers size={52} color="#222" style={{ marginBottom: 16 }} />
                  <div style={{ color: "#555", marginBottom: 24 }}>No screens yet.</div>
                  <TapBtn onClick={onNewScreen} variant="orange"><Plus size={17} /> Build First Screen</TapBtn>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {project.screens.map(screen => (
                  <div key={screen.id} onClick={() => onEditScreen(screen)}
                    style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, overflow: "hidden", cursor: "pointer" }}>
                    <div style={{ height: 120, background: "#080808", overflow: "hidden", position: "relative" }}>
                      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%) scale(0.11)", transformOrigin: "center", pointerEvents: "none" }}>
                        <BlockCanvas blocks={screen.blocks} screenNumber={screen.screenNumber} footerCitations={screen.footerCitations} />
                      </div>
                    </div>
                    <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ flex: 1, overflow: "hidden" }}>
                        <div style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{screen.title}</div>
                        <div style={{ color: "#555", fontSize: 11 }}>#{screen.screenNumber}</div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); onDeleteScreen(screen.id); }}
                        style={{ background: "none", border: "none", color: "#444", cursor: "pointer", padding: 6, minWidth: 36, minHeight: 36 }}><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {activeTab === "vault" && (
            <EvidenceVaultPanel evidence={project.evidence}
              onAdd={e => onUpdateProject(addEvidence(project, e))}
              onDelete={id => onUpdateProject(deleteEvidence(project, id))} />
          )}
          {activeTab === "laws" && (
            <LegalLibraryPanel citations={project.citations}
              onAddCitation={label => onUpdateProject(addCitation(project, label))} />
          )}
          {activeTab === "citations" && (
            <CitationLibraryPanel citations={project.citations}
              onAdd={label => onUpdateProject(addCitation(project, label))}
              onDelete={id => onUpdateProject(deleteCitation(project, id))} />
          )}
        </div>
      </div>
    );
  }

  const [sidebar, setSidebar] = useState<"vault" | "laws" | "citations">("vault");
  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      <div style={{ width: 320, flexShrink: 0, borderRight: "1px solid #1e1e1e", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", borderBottom: "1px solid #1e1e1e", flexShrink: 0 }}>
          {(["vault", "laws", "citations"] as const).map(tab => (
            <button key={tab} onClick={() => setSidebar(tab)}
              style={{ flex: 1, background: "none", border: "none", borderBottom: `2px solid ${sidebar === tab ? ORANGE : "transparent"}`, padding: "12px 0", color: sidebar === tab ? "#fff" : "#555", fontWeight: 700, fontSize: 11, letterSpacing: 0.5, cursor: "pointer", textTransform: "uppercase" }}>
              {tab === "vault" ? "Evidence" : tab}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {sidebar === "vault" && <EvidenceVaultPanel evidence={project.evidence} onAdd={e => onUpdateProject(addEvidence(project, e))} onDelete={id => onUpdateProject(deleteEvidence(project, id))} />}
          {sidebar === "laws" && <LegalLibraryPanel citations={project.citations} onAddCitation={label => onUpdateProject(addCitation(project, label))} />}
          {sidebar === "citations" && <CitationLibraryPanel citations={project.citations} onAdd={label => onUpdateProject(addCitation(project, label))} onDelete={id => onUpdateProject(deleteCitation(project, id))} />}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0, padding: "32px 36px", overflowY: "auto" }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 22, fontWeight: 900 }}>Screens</div>
          <div style={{ color: "#555", fontSize: 13, marginTop: 2 }}>{project.screens.length} screen{project.screens.length !== 1 ? "s" : ""}</div>
        </div>
        {project.screens.length === 0 && (
          <div style={{ textAlign: "center", paddingTop: 60 }}>
            <Layers size={52} color="#1e1e1e" style={{ marginBottom: 16 }} />
            <div style={{ color: "#555", marginBottom: 24, fontSize: 15 }}>No screens yet.</div>
            <SmBtn onClick={onNewScreen} variant="orange"><Plus size={14} /> Build First Screen</SmBtn>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 14 }}>
          {project.screens.map(screen => (
            <div key={screen.id} onClick={() => onEditScreen(screen)}
              style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, overflow: "hidden", cursor: "pointer" }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "#1e1e1e")}>
              <div style={{ height: 140, background: "#080808", overflow: "hidden", position: "relative" }}>
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%) scale(0.13)", transformOrigin: "center", pointerEvents: "none" }}>
                  <BlockCanvas blocks={screen.blocks} screenNumber={screen.screenNumber} footerCitations={screen.footerCitations} />
                </div>
              </div>
              <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{screen.title}</div>
                  <div style={{ color: "#555", fontSize: 11 }}>#{screen.screenNumber} · {screen.blocks.length} blocks</div>
                </div>
                <button onClick={e => { e.stopPropagation(); onDeleteScreen(screen.id); }}
                  style={{ background: "none", border: "none", color: "#444", cursor: "pointer", padding: 4 }}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── HOME VIEW ────────────────────────────────────────────────────────────────
function HomeView({ project, onGoToBuild, onEditScreen, onGoToTutor }: {
  project: Project;
  onGoToBuild: () => void;
  onEditScreen: (s: Screen) => void;
  onGoToTutor: () => void;
}) {
  const recent = project.screens.slice(-4).reverse();
  const insights = staticTutorService.getInsights(project);
  const topInsight = insights.find(i => i.type === "suggestion" || i.type === "question") ?? insights[0];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px 100px" }}>
      {/* Welcome */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.5 }}>HyperLaw</div>
        <div style={{ color: "#555", fontSize: 14, marginTop: 2 }}>{project.caseName}</div>
      </div>

      {/* Case Progress */}
      <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 16, padding: "18px 20px", marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: "#555", fontWeight: 700, letterSpacing: 0.5, marginBottom: 12 }}>CASE PROGRESS</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {[
            { label: "Screens", value: project.screens.length },
            { label: "Evidence", value: project.evidence.length },
            { label: "Citations", value: project.citations.length },
          ].map(stat => (
            <div key={stat.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: ORANGE }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: "#555", fontWeight: 700 }}>{stat.label.toUpperCase()}</div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Suggestion strip */}
      {topInsight && (
        <button onClick={onGoToTutor} style={{ width: "100%", background: `${ORANGE}12`, border: `1px solid ${ORANGE}33`, borderRadius: 14, padding: "14px 16px", textAlign: "left", cursor: "pointer", marginBottom: 20, display: "flex", alignItems: "flex-start", gap: 12 }}>
          <Lightbulb size={18} color={ORANGE} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontSize: 12, color: ORANGE, fontWeight: 700, marginBottom: 4 }}>TUTOR INSIGHT</div>
            <div style={{ fontSize: 14, color: "#ddd", fontWeight: 600, lineHeight: 1.4 }}>{topInsight.title}</div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Open Tutor →</div>
          </div>
        </button>
      )}

      {/* Quick actions */}
      <div style={{ fontSize: 12, color: "#555", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>QUICK ACTIONS</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
        <button onClick={onGoToBuild}
          style={{ background: ORANGE, border: "none", borderRadius: 14, padding: "18px 16px", textAlign: "left", cursor: "pointer", color: "#000" }}>
          <Wrench size={20} style={{ marginBottom: 8, display: "block" }} />
          <div style={{ fontWeight: 800, fontSize: 15 }}>Build Screen</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>Start a new one</div>
        </button>
        <button onClick={onGoToTutor}
          style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, padding: "18px 16px", textAlign: "left", cursor: "pointer", color: "#fff" }}>
          <GraduationCap size={20} color={ORANGE} style={{ marginBottom: 8, display: "block" }} />
          <div style={{ fontWeight: 800, fontSize: 15 }}>Open Tutor</div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>Learn from your case</div>
        </button>
      </div>

      {/* Recent screens */}
      {recent.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: "#555", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>RECENT SCREENS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
            {recent.map(screen => (
              <button key={screen.id} onClick={() => onEditScreen(screen)}
                style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, padding: "12px 14px", textAlign: "left", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 48, height: 48, background: "#080808", borderRadius: 8, overflow: "hidden", position: "relative", flexShrink: 0 }}>
                  <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%) scale(0.044)", transformOrigin: "center", pointerEvents: "none" }}>
                    <BlockCanvas blocks={screen.blocks} screenNumber={screen.screenNumber} footerCitations={screen.footerCitations} />
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{screen.title}</div>
                  <div style={{ color: "#555", fontSize: 12 }}>Screen #{screen.screenNumber} · {SCREEN_TYPES.find(t => t.id === screen.screenType)?.label}</div>
                </div>
                <ChevronRight size={16} color="#333" />
              </button>
            ))}
          </div>
        </>
      )}

      {project.screens.length === 0 && (
        <div style={{ textAlign: "center", paddingTop: 20 }}>
          <Layers size={48} color="#1e1e1e" style={{ marginBottom: 12 }} />
          <div style={{ color: "#444", fontSize: 14, marginBottom: 20 }}>No screens yet — tap Build to start your first one.</div>
        </div>
      )}
    </div>
  );
}

// ─── TUTOR VIEW ───────────────────────────────────────────────────────────────
const INSIGHT_ICONS: Record<string, React.ElementType> = {
  strength: TrendingUp, weakness: AlertTriangle, question: HelpCircle,
  suggestion: Lightbulb, concept: Brain,
};
const INSIGHT_COLORS: Record<string, string> = {
  strength: "#4caf7d", weakness: "#e06060", question: "#7cb9e8",
  suggestion: ORANGE, concept: "#b39ddb",
};
const CARD_LABELS: Record<string, string> = {
  fact: "FACT", concept: "CONCEPT", evidence: "EVIDENCE",
  question: "QUESTION", why: "WHY IT MATTERS", strengthen: "STRENGTHEN",
};
const CARD_COLORS: Record<string, string> = {
  fact: "#7cb9e8", concept: "#b39ddb", evidence: ORANGE,
  question: "#4caf7d", why: "#e06060", strengthen: "#ffd54f",
};

function TutorView({ project }: { project: Project }) {
  const [mode, setMode] = useState<"insights" | "learn">("insights");
  const insights = staticTutorService.getInsights(project);
  const cards = staticTutorService.getLearningCards(project);
  const [cardIdx, setCardIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const card = cards[cardIdx] ?? null;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Mode toggle */}
      <div style={{ display: "flex", padding: "12px 16px", borderBottom: "1px solid #1a1a1a", gap: 8, flexShrink: 0 }}>
        <button onClick={() => setMode("insights")}
          style={{ flex: 1, background: mode === "insights" ? ORANGE : "#111", border: `1px solid ${mode === "insights" ? ORANGE : "#2a2a2a"}`, borderRadius: 10, padding: "10px 0", color: mode === "insights" ? "#000" : "#777", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
          <GraduationCap size={15} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
          Insights
        </button>
        <button onClick={() => { setMode("learn"); setFlipped(false); }}
          style={{ flex: 1, background: mode === "learn" ? ORANGE : "#111", border: `1px solid ${mode === "learn" ? ORANGE : "#2a2a2a"}`, borderRadius: 10, padding: "10px 0", color: mode === "learn" ? "#000" : "#777", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
          <Brain size={15} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
          Learning Mode
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 100px" }}>
        {mode === "insights" && (
          <div>
            <div style={{ color: "#555", fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
              Tutor reads your case automatically — no setup needed. These insights are based on what you've built so far.
            </div>
            {insights.length === 0 && (
              <div style={{ textAlign: "center", paddingTop: 40, color: "#444" }}>
                <GraduationCap size={40} color="#222" style={{ marginBottom: 12 }} />
                <div>Add screens in the Build tab — Tutor will start reading them immediately.</div>
              </div>
            )}
            {insights.map(ins => {
              const Icon = INSIGHT_ICONS[ins.type] ?? Lightbulb;
              const color = INSIGHT_COLORS[ins.type] ?? ORANGE;
              const isOpen = expandedId === ins.id;
              return (
                <div key={ins.id}
                  style={{ background: "#111", border: `1px solid ${isOpen ? color + "66" : "#1e1e1e"}`, borderRadius: 14, marginBottom: 10, overflow: "hidden", cursor: "pointer" }}
                  onClick={() => setExpandedId(isOpen ? null : ins.id)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px" }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: color + "22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon size={16} color={color} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: color, fontWeight: 700, letterSpacing: 0.5, marginBottom: 2 }}>
                        {ins.type.toUpperCase()}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{ins.title}</div>
                    </div>
                    <ChevronDown size={16} color="#444" style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }} />
                  </div>
                  {isOpen && (
                    <div style={{ padding: "0 16px 16px", color: "#999", fontSize: 14, lineHeight: 1.6, borderTop: "1px solid #1a1a1a", paddingTop: 12 }}>
                      {ins.body}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {mode === "learn" && (
          <div>
            <div style={{ color: "#555", fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
              Study your own case with learning cards. Each card is built from your actual facts.
            </div>
            {cards.length === 0 ? (
              <div style={{ textAlign: "center", paddingTop: 40, color: "#444" }}>
                <Brain size={40} color="#222" style={{ marginBottom: 12 }} />
                <div>Add screens and evidence — cards will be generated from your case.</div>
              </div>
            ) : (
              <>
                {/* Card counter */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{ color: "#555", fontSize: 13 }}>Card {cardIdx + 1} of {cards.length}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => { setCardIdx(i => Math.max(0, i - 1)); setFlipped(false); }}
                      disabled={cardIdx === 0}
                      style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: 8, padding: "6px 10px", color: cardIdx === 0 ? "#333" : "#ccc", cursor: cardIdx === 0 ? "default" : "pointer" }}>
                      <ChevronLeft size={16} />
                    </button>
                    <button onClick={() => { setCardIdx(i => Math.min(cards.length - 1, i + 1)); setFlipped(false); }}
                      disabled={cardIdx === cards.length - 1}
                      style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: 8, padding: "6px 10px", color: cardIdx === cards.length - 1 ? "#333" : "#ccc", cursor: cardIdx === cards.length - 1 ? "default" : "pointer" }}>
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>

                {/* Flashcard */}
                {card && (
                  <div onClick={() => setFlipped(f => !f)}
                    style={{ background: flipped ? "#151515" : "#111", border: `2px solid ${CARD_COLORS[card.cardType] ?? ORANGE}44`, borderRadius: 20, padding: "28px 24px", minHeight: 220, cursor: "pointer", transition: "background 0.2s", display: "flex", flexDirection: "column", justifyContent: "space-between", marginBottom: 14, position: "relative" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: CARD_COLORS[card.cardType] ?? ORANGE, letterSpacing: 0.5, marginBottom: 12 }}>
                      {flipped ? "ANSWER" : CARD_LABELS[card.cardType] ?? "CARD"}
                    </div>
                    <div style={{ fontSize: 17, fontWeight: flipped ? 500 : 700, lineHeight: 1.5, color: flipped ? "#bbb" : "#fff", flex: 1 }}>
                      {flipped ? card.back : card.front}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 20 }}>
                      <FlipHorizontal size={14} color="#444" />
                      <span style={{ fontSize: 12, color: "#444" }}>Tap to {flipped ? "see question" : "reveal answer"}</span>
                    </div>
                  </div>
                )}

                {/* Card navigation dots */}
                <div style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
                  {cards.map((_, i) => (
                    <button key={i} onClick={() => { setCardIdx(i); setFlipped(false); }}
                      style={{ width: i === cardIdx ? 20 : 8, height: 8, borderRadius: 4, background: i === cardIdx ? ORANGE : "#2a2a2a", border: "none", cursor: "pointer", transition: "width 0.2s, background 0.2s" }} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── EASTER EGG SCREEN ────────────────────────────────────────────────────────
const EASTER_ITEMS = [
  {
    id: "tagline",
    label: "TAGLINE",
    content: `HyperLaw started as: "I need a faster way to make these orange screens."

Now it's evolving into: "I want one place where someone can understand their evidence, organize it, build exhibits, learn legal concepts, and eventually analyze it with AI."`,
  },
  {
    id: "description",
    label: "FULL DESCRIPTION",
    content: `HyperLaw

Built by Hyper Quency Modula — the same person behind ShortHop, EDGE, and a stack of federal civil rights cases filed pro se from an office in Lexington, Kentucky.

HyperLaw didn't come from a legal background. It came from necessity. From building orange screens at 2 AM trying to make an argument that actually lands.

It's a tool for people who don't have a legal team — but have evidence, patience, and the ability to think clearly about what happened to them.

The goal is simple: give self-represented litigants the same visual clarity, organizational power, and eventually AI reasoning that law firms spend thousands getting from outside vendors.`,
  },
  {
    id: "vision",
    label: "WHERE THIS IS GOING",
    content: `The screens were phase one.

Phase two is organization — evidence vaults, timelines, exhibit builders.

Phase three is understanding — the Tutor, learning mode, AI-assisted reasoning.

Phase four is analysis — Claude reads your transcript, finds contradictions, flags admissions, suggests legal issues.

Same interface. Different engine.`,
  },
];

function EasterEggScreen({ onClose }: { onClose: () => void }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  function copy(id: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 400);
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 300,
      background: `rgba(255,255,255,${visible ? 1 : 0})`,
      transition: "background 0.4s ease",
      overflowY: "auto",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ opacity: visible ? 1 : 0, transition: "opacity 0.6s ease 0.2s", flex: 1 }}>
        {/* Close */}
        <div style={{ padding: "20px 24px", display: "flex", justifyContent: "flex-end" }}>
          <button onClick={handleClose}
            style={{ background: "#f0f0f0", border: "none", borderRadius: 50, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={18} color="#333" />
          </button>
        </div>

        {/* Logo */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
          <img src="/hyperlaw-logo.png" alt="HyperLaw"
            style={{ width: 100, height: 100, borderRadius: 24, filter: "grayscale(100%) contrast(1.2)" }} />
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

// ─── PROFILE VIEW ─────────────────────────────────────────────────────────────
function ProfileView({ project, onUpdateProject, onEasterEgg }: {
  project: Project;
  onUpdateProject: (p: Project) => void;
  onEasterEgg: () => void;
}) {
  const sections = [
    { label: "Account", icon: User, items: ["Email", "Display Name", "Plan"] },
    { label: "Subscription", icon: Star, items: ["Current Plan", "Upgrade", "Billing History"] },
    { label: "AI Preferences", icon: Brain, items: ["Tutor Style", "Card Frequency", "AI Engine (Coming)"] },
    { label: "Theme", icon: Sliders, items: ["Dark Mode", "Accent Color", "Font Size"] },
    { label: "Export History", icon: History, items: ["Recent Exports", "Saved Formats"] },
    { label: "Case Backups", icon: Archive, items: ["Export Backup", "Restore from Backup"] },
    { label: "Settings", icon: Settings, items: ["Data & Privacy", "Notifications"] },
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
      {/* Avatar area */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
        <div style={{ width: 60, height: 60, borderRadius: 30, background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <User size={28} color="#000" />
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Your Profile</div>
          <div style={{ color: "#555", fontSize: 13 }}>HyperLaw · {project.caseName}</div>
        </div>
      </div>

      {/* Claude API Key reminder */}
      <div style={{ background: "#141414", border: "1px solid #2a2a2a", borderRadius: 14, padding: "16px 18px", marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <Key size={18} color={ORANGE} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Connect Claude API for AI Expansion</div>
            <div style={{ color: "#666", fontSize: 13, lineHeight: 1.5 }}>When you're ready, adding your Anthropic API key will upgrade the Tutor from question trees to live AI reasoning. Same interface — smarter engine.</div>
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <div style={{ background: "#1e1e1e", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: "#555" }}>Add Key (Coming Soon)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Sections */}
      {sections.map(section => {
        const Icon = section.icon;
        return (
          <div key={section.label} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Icon size={14} color={ORANGE} />
              <div style={{ fontSize: 12, color: "#555", fontWeight: 700, letterSpacing: 0.5 }}>{section.label.toUpperCase()}</div>
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

      {/* Hidden easter egg — subtle H logo at bottom */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 48, gap: 6 }}>
        <div style={{ color: "#222", fontSize: 11, fontWeight: 700 }}>HYPERLAW</div>
        <button onClick={handleEggPress}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 8, opacity: 0.15, WebkitTapHighlightColor: "transparent" }}>
          <img src="/hyperlaw-logo.png" alt="" style={{ width: 36, height: 36, borderRadius: 8, filter: "grayscale(100%)" }} />
        </button>
        {eggPressCount > 0 && eggPressCount < 5 && (
          <div style={{ color: "#2a2a2a", fontSize: 10 }}>{5 - eggPressCount} more…</div>
        )}
      </div>
    </div>
  );
}

// ─── API KEY BANNER ───────────────────────────────────────────────────────────
function ApiKeyBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div style={{ background: "#111", borderBottom: "1px solid #1e1e1e", padding: "8px 16px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
      <Key size={13} color={ORANGE} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: "#888", flex: 1, lineHeight: 1.4 }}>
        <span style={{ color: ORANGE, fontWeight: 700 }}>Connect your Claude API key</span> to unlock full AI expansion for HyperLaw.
      </span>
      <button onClick={onDismiss}
        style={{ background: "none", border: "none", color: "#444", cursor: "pointer", padding: 4, flexShrink: 0 }}>
        <X size={14} />
      </button>
    </div>
  );
}

// ─── MAIN NAV BAR (bottom mobile, left sidebar desktop) ───────────────────────
type NavTab = "home" | "build" | "tutor" | "profile";

// Extensible nav registry — add new tabs here without touching the nav render
interface NavItem {
  id: NavTab;
  icon: React.ElementType;
  label: string;
  center?: boolean; // render as FAB
}
const NAV_ITEMS: NavItem[] = [
  { id: "home", icon: Home, label: "Home" },
  { id: "build", icon: Wrench, label: "Build", center: true },
  { id: "tutor", icon: GraduationCap, label: "Tutor" },
  { id: "profile", icon: User, label: "Profile" },
  // Future tabs: add here — nav layout adapts automatically
];

function BottomNavBar({ active, onChange }: { active: NavTab; onChange: (t: NavTab) => void }) {
  const left = NAV_ITEMS.filter(n => !n.center && NAV_ITEMS.indexOf(n) < NAV_ITEMS.findIndex(n => n.center));
  const right = NAV_ITEMS.filter(n => !n.center && NAV_ITEMS.indexOf(n) > NAV_ITEMS.findIndex(n => n.center));
  const fab = NAV_ITEMS.find(n => n.center);

  return (
    <div style={{ borderTop: "1px solid #1e1e1e", background: "#0a0a0a", paddingBottom: "env(safe-area-inset-bottom)", flexShrink: 0, position: "relative" }}>
      {fab && (
        <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: -24, zIndex: 10 }}>
          <button onClick={() => onChange(fab.id)}
            style={{ width: 52, height: 52, borderRadius: 26, background: active === fab.id ? "#fff" : ORANGE, border: `3px solid #0a0a0a`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 16px #d9711f55", WebkitTapHighlightColor: "transparent", touchAction: "manipulation", transition: "background 0.2s" }}>
            <Wrench size={22} color={active === fab.id ? ORANGE : "#000"} />
          </button>
        </div>
      )}
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
        {/* Center gap for FAB */}
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

function DesktopSideNav({ active, onChange }: { active: NavTab; onChange: (t: NavTab) => void }) {
  return (
    <div style={{ width: 200, flexShrink: 0, background: "#0a0a0a", borderRight: "1px solid #1e1e1e", display: "flex", flexDirection: "column", padding: "20px 12px", gap: 4 }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", marginBottom: 12 }}>
        <img src="/hyperlaw-logo.png" alt="HyperLaw" style={{ width: 30, height: 30, borderRadius: 8 }} />
        <span style={{ fontWeight: 900, fontSize: 15, letterSpacing: 0.3 }}>HyperLaw</span>
      </div>
      {NAV_ITEMS.map(item => {
        const Icon = item.icon;
        const isActive = active === item.id;
        return (
          <button key={item.id} onClick={() => onChange(item.id)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 10, background: isActive ? `${ORANGE}18` : "transparent", border: `1px solid ${isActive ? ORANGE + "44" : "transparent"}`, color: isActive ? ORANGE : "#666", cursor: "pointer", fontWeight: 700, fontSize: 14, textAlign: "left", transition: "all 0.15s" }}
            onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "#111"; }}
            onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}>
            <Icon size={18} />
            {item.label}
            {item.center && <div style={{ marginLeft: "auto", width: 6, height: 6, background: ORANGE, borderRadius: 3 }} />}
          </button>
        );
      })}
    </div>
  );
}

// ─── BUILD SUB-VIEWS ──────────────────────────────────────────────────────────
type BuildView = "screens" | "pick_type" | "build_flow" | "edit";

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const w = useWindowWidth();
  const isMobile = w < 768;

  const [project, setProjectRaw] = useState<Project>(() => loadProject());
  const [navTab, setNavTab] = useState<NavTab>("home");
  const [buildView, setBuildView] = useState<BuildView>("screens");
  const [buildType, setBuildType] = useState<ScreenType | null>(null);
  const [editScreen, setEditScreenState] = useState<Screen | null>(null);
  const [editingCaseName, setEditingCaseName] = useState(false);
  const [caseInput, setCaseInput] = useState(project.caseName);
  const [conv, setConv] = useState<ConvState>(FRESH_CONV);
  const [projectSubTab, setProjectSubTab] = useState<ProjectSubTab>("screens");
  const [showBanner, setShowBanner] = useState(true);
  const [showEasterEgg, setShowEasterEgg] = useState(false);

  function setProject(p: Project) { setProjectRaw(p); saveProject(p); }

  function startBuild(type: ScreenType) {
    setBuildType(type);
    setConv(FRESH_CONV);
    setBuildView("build_flow");
  }

  function handleConversationComplete(data: DataMap) {
    if (!buildType) return;
    try {
      const screen = buildScreen(buildType, data);
      const updated = addScreen(project, screen);
      setProject(updated);
      setEditScreenState(screen);
      setConv(FRESH_CONV);
      setBuildView("edit");
    } catch (err) {
      console.error("[HL] buildScreen failed:", err);
    }
  }

  function handleUpdateScreen(s: Screen) { setEditScreenState(s); setProject(updateScreen(project, s)); }
  function handleDeleteScreen(id: string) {
    setProject(deleteScreen(project, id));
    if (editScreen?.id === id) { setEditScreenState(null); setBuildView("screens"); }
  }

  function switchNav(tab: NavTab) {
    setNavTab(tab);
    if (tab === "build" && buildView === "edit" && !editScreen) setBuildView("screens");
  }

  function goToBuildFromHome() {
    setNavTab("build");
    setBuildView("pick_type");
  }

  function editScreenFromHome(s: Screen) {
    setEditScreenState(s);
    setNavTab("build");
    setBuildView("edit");
  }

  const screenTypeDef = buildType ? SCREEN_TYPES.find(t => t.id === buildType) : null;

  // Header title for current context
  function headerTitle() {
    if (navTab === "home") return null;
    if (navTab === "tutor") return "Tutor";
    if (navTab === "profile") return "Profile";
    if (navTab === "build") {
      if (buildView === "pick_type") return "What are you building?";
      if (buildView === "build_flow") return screenTypeDef?.label ?? "Building…";
      if (buildView === "edit") return editScreen?.title ?? "Edit Screen";
      return "Build";
    }
    return null;
  }

  return (
    <div style={{ height: "100dvh", background: BG, color: "#fff", fontFamily: "Arial, sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #1e1e1e", padding: isMobile ? "12px 16px" : "11px 24px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0, background: "#0a0a0a" }}>
        {isMobile && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img src="/hyperlaw-logo.png" alt="HL" style={{ width: 26, height: 26, borderRadius: 6 }} />
            <span style={{ fontWeight: 900, fontSize: 14, letterSpacing: 0.5, color: ORANGE }}>HYPERLAW</span>
          </div>
        )}

        {/* Case name (mobile) */}
        {isMobile && editingCaseName ? (
          <div style={{ display: "flex", gap: 6, flex: 1 }}>
            <input value={caseInput} onChange={e => setCaseInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { setProject({ ...project, caseName: caseInput }); setEditingCaseName(false); } if (e.key === "Escape") setEditingCaseName(false); }}
              autoFocus style={{ background: "#111", border: `1px solid ${ORANGE}`, borderRadius: 8, padding: "6px 12px", color: "#fff", fontSize: 14, fontWeight: 700, outline: "none", flex: 1 }} />
            <button onClick={() => { setProject({ ...project, caseName: caseInput }); setEditingCaseName(false); }}
              style={{ background: ORANGE, border: "none", borderRadius: 8, padding: "0 10px", cursor: "pointer" }}><Check size={14} color="#000" /></button>
          </div>
        ) : isMobile ? (
          <button onClick={() => { setEditingCaseName(true); setCaseInput(project.caseName); }}
            style={{ background: "none", border: "none", color: "#777", fontWeight: 600, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, flex: 1, textAlign: "left", overflow: "hidden" }}>
            <BookOpen size={11} color="#444" />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.caseName}</span>
            <Edit3 size={10} color="#333" style={{ flexShrink: 0 }} />
          </button>
        ) : (
          // Desktop header — just show context label, nav is in sidebar
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
            {headerTitle() && <span style={{ fontWeight: 700, fontSize: 15, color: "#ccc" }}>{headerTitle()}</span>}
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Desktop quick actions */}
        {!isMobile && navTab === "build" && buildView === "screens" && (
          <SmBtn onClick={() => setBuildView("pick_type")} variant="orange"><Plus size={14} /> New Screen</SmBtn>
        )}
        {!isMobile && navTab === "build" && buildView !== "screens" && buildView !== "pick_type" && (
          <SmBtn onClick={() => setBuildView("screens")}><ChevronLeft size={13} /> Screens</SmBtn>
        )}
      </div>

      {/* API Key banner */}
      {showBanner && <ApiKeyBanner onDismiss={() => setShowBanner(false)} />}

      {/* Main content */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
        {/* Desktop sidebar nav */}
        {!isMobile && (
          <DesktopSideNav active={navTab} onChange={switchNav} />
        )}

        {/* Content area */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <ErrorBoundary onReset={() => { setNavTab("home"); setBuildView("screens"); }}>

            {/* HOME */}
            {navTab === "home" && (
              <HomeView
                project={project}
                onGoToBuild={goToBuildFromHome}
                onEditScreen={editScreenFromHome}
                onGoToTutor={() => setNavTab("tutor")}
              />
            )}

            {/* BUILD */}
            {navTab === "build" && buildView === "screens" && (
              <>
                <ProjectView
                  project={project}
                  onNewScreen={() => setBuildView("pick_type")}
                  onEditScreen={s => { setEditScreenState(s); setBuildView("edit"); }}
                  onDeleteScreen={handleDeleteScreen}
                  onUpdateProject={setProject}
                  isMobile={isMobile}
                  activeTab={projectSubTab}
                  onTabChange={setProjectSubTab}
                />
                {isMobile && (
                  <div style={{ borderTop: "1px solid #1e1e1e", background: "#0a0a0a", display: "flex", flexShrink: 0 }}>
                    {(["screens", "vault", "laws", "citations"] as const).map((tab, i) => {
                      const icons = [LayoutGrid, FileSearch, BookOpen, FileText];
                      const Icon = icons[i];
                      const labels = ["Screens", "Vault", "Laws", "Citations"];
                      return (
                        <button key={tab} onClick={() => setProjectSubTab(tab)}
                          style={{ flex: 1, background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "10px 4px", color: projectSubTab === tab ? ORANGE : "#555", cursor: "pointer" }}>
                          <Icon size={18} />
                          <span style={{ fontSize: 10, fontWeight: 700 }}>{labels[i]}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {navTab === "build" && buildView === "pick_type" && (
              <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" as never }}>
                <div style={{ maxWidth: 860, margin: "0 auto", padding: isMobile ? "36px 20px 120px" : "56px 28px" }}>
                  <h1 style={{ fontSize: isMobile ? 28 : 32, fontWeight: 900, marginBottom: 6 }}>What are you building?</h1>
                  <p style={{ color: "#777", marginBottom: 28, fontSize: 15, lineHeight: 1.55 }}>
                    Choose a layout — HyperLaw walks you through the evidence as the screen assembles.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: 28 }}>
                    {SCREEN_TYPES.map(t => {
                      const Icon = t.icon;
                      return (
                        <button key={t.id} onClick={() => startBuild(t.id)}
                          style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, padding: isMobile ? "20px 18px" : "20px", textAlign: "left", cursor: "pointer", color: "#fff", display: "flex", gap: isMobile ? 16 : 0, alignItems: isMobile ? "center" : "flex-start", flexDirection: isMobile ? "row" : "column", minHeight: isMobile ? 72 : undefined, WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE)}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = "#1e1e1e")}>
                          <Icon size={isMobile ? 24 : 22} color={ORANGE} style={{ marginBottom: isMobile ? 0 : 10, flexShrink: 0 }} />
                          <div>
                            <div style={{ fontWeight: 800, fontSize: isMobile ? 16 : 15, marginBottom: 3 }}>{t.label}</div>
                            <div style={{ color: "#777", fontSize: 13 }}>{t.blurb}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ padding: 14, border: "1px dashed #1e1e1e", borderRadius: 8, color: "#444", fontSize: 13 }}>
                    More layouts coming — Timeline, Investigation Failure, Pattern of Conduct, Witness Impeachment, and more.
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <SmBtn onClick={() => setBuildView("screens")}><ChevronLeft size={13} /> Back to Screens</SmBtn>
                  </div>
                </div>
              </div>
            )}

            {navTab === "build" && buildView === "build_flow" && buildType && (
              <ConversationView
                key={buildType}
                screenType={buildType}
                evidence={project.evidence}
                conv={conv}
                onConvChange={setConv}
                onComplete={handleConversationComplete}
                onBack={() => setBuildView("pick_type")}
                isMobile={isMobile}
              />
            )}

            {navTab === "build" && buildView === "edit" && editScreen && (
              <EditView
                screen={editScreen}
                project={project}
                onUpdate={handleUpdateScreen}
                onBack={() => setBuildView("screens")}
                onUpdateProject={setProject}
                isMobile={isMobile}
              />
            )}

            {/* TUTOR */}
            {navTab === "tutor" && <TutorView project={project} />}

            {/* PROFILE */}
            {navTab === "profile" && (
              <ProfileView
                project={project}
                onUpdateProject={setProject}
                onEasterEgg={() => setShowEasterEgg(true)}
              />
            )}

          </ErrorBoundary>
        </div>
      </div>

      {/* Mobile bottom nav */}
      {isMobile && (
        <BottomNavBar active={navTab} onChange={switchNav} />
      )}

      {/* Easter egg overlay */}
      {showEasterEgg && <EasterEggScreen onClose={() => setShowEasterEgg(false)} />}
    </div>
  );
}

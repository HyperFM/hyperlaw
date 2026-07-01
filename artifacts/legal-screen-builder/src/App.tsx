import React, { useState, useRef, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  Plus, X, ChevronRight, ChevronLeft, ArrowRight, Lightbulb,
  Trash2, Edit3, ChevronUp, ChevronDown, FileSearch,
  Video, FileText, Mic, Image, File, BookOpen, Scale, Clock, XCircle,
  Quote, Check, Layers, Download, Share2, Search, LayoutGrid,
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

const ORANGE = "#d9711f";
const BG = "#0c0c0c";

// ─── Conversation state (lifted to App so it survives re-renders) ─────────────
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
  componentDidCatch(err: Error, info: React.ErrorInfo) { console.error("[LSB]", err.message, info.componentStack); }
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
    scale,
    backgroundColor: "#0a0a0a",
    useCORS: true,
    width: 1080,
    height: 1080,
    logging: false,
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
    pdf.save(`${name}.pdf`);
    return;
  }

  if (format === "share" || format === "copy") {
    const blob = await new Promise<Blob>((res, rej) =>
      canvas.toBlob(b => (b ? res(b) : rej(new Error("Failed to create blob"))), "image/png")
    );
    if (format === "share" && navigator.share) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const file = new (window as any).File([blob], `${name}.png`, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
    }
    // Fallback: clipboard
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
    } catch (e) {
      console.error(e);
      setErr("Export failed — try again.");
      setStatus(null);
    }
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

        {status && (
          <div style={{ background: `${ORANGE}22`, border: `1px solid ${ORANGE}55`, borderRadius: 8, padding: "10px 14px", marginBottom: 14, color: ORANGE, fontSize: 14, fontWeight: 700 }}>
            {status}
          </div>
        )}
        {err && (
          <div style={{ background: "#7a202022", borderRadius: 8, padding: "10px 14px", marginBottom: 14, color: "#e06060", fontSize: 13 }}>
            {err}
          </div>
        )}

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
  return (
    <button onClick={disabled ? undefined : onClick} style={{ ...base, ...vars[variant], ...ext }}>{children}</button>
  );
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
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <SmBtn onClick={submit} variant="orange"><Check size={13} /> Save</SmBtn>
            <SmBtn onClick={() => setAdding(false)}>Cancel</SmBtn>
          </div>
        </div>
      )}

      {evidence.length === 0 && !adding && (
        <div style={{ color: "#555", fontSize: 13, lineHeight: 1.6 }}>No evidence yet. Add bodycam clips, reports, and statements — then pull them in while building.</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {evidence.map(e => {
          const Icon = EVIDENCE_ICONS[e.type] ?? File;
          return (
            <div key={e.id} style={{ background: "#111", border: "1px solid #222", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <Icon size={16} color={ORANGE} style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{e.label}</div>
                  {e.source && <div style={{ color: "#777", fontSize: 12 }}>{e.source}{e.timestamp ? ` · ${e.timestamp}` : ""}</div>}
                  <div style={{ color: "#bbb", fontSize: 13, marginTop: 4, lineHeight: 1.4 }}>{e.content.slice(0, 100)}{e.content.length > 100 ? "…" : ""}</div>
                </div>
                <button onClick={() => onDelete(e.id)} style={{ background: "none", border: "none", color: "#444", cursor: "pointer", padding: 4, minWidth: 32, minHeight: 32 }}><Trash2 size={14} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Citation library panel ───────────────────────────────────────────────────
function CitationLibraryPanel({ citations, onAdd, onDelete, screenCitations, onToggle }: {
  citations: Project["citations"]; onAdd: (label: string) => void; onDelete: (id: string) => void;
  screenCitations?: string[]; onToggle?: (label: string) => void;
}) {
  const [newLabel, setNewLabel] = useState("");
  function submit() { if (!newLabel.trim()) return; onAdd(newLabel.trim()); setNewLabel(""); }
  return (
    <div style={{ padding: "16px" }}>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Citation Library</div>
      <div style={{ color: "#666", fontSize: 12, marginBottom: 14 }}>Save once · add to any screen footer</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
        {citations.map(c => {
          const active = screenCitations?.includes(c.label);
          return (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: active ? `${ORANGE}18` : "#111", border: `1px solid ${active ? ORANGE : "#222"}`, borderRadius: 8, minHeight: 44 }}>
              {onToggle && (
                <button onClick={() => onToggle(c.label)}
                  style={{ width: 22, height: 22, borderRadius: 4, border: `2px solid ${active ? ORANGE : "#444"}`, background: active ? ORANGE : "transparent", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", minWidth: 22 }}>
                  {active && <Check size={12} color="#000" />}
                </button>
              )}
              <span style={{ flex: 1, fontSize: 13, color: active ? "#fff" : "#bbb" }}>{c.label}</span>
              {!c.builtin && (
                <button onClick={() => onDelete(c.id)} style={{ background: "none", border: "none", color: "#444", cursor: "pointer", padding: 4, minWidth: 32 }}><X size={13} /></button>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={newLabel} onChange={e => setNewLabel(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()}
          placeholder="Add citation…"
          style={{ flex: 1, background: "#111", border: "1px solid #333", borderRadius: 8, padding: "12px", color: "#fff", fontSize: 14, outline: "none" }} />
        <button onClick={submit} style={{ background: "#2a2a2a", border: "1px solid #3a3a3a", borderRadius: 8, padding: "0 14px", color: "#fff", cursor: "pointer" }}><Plus size={16} /></button>
      </div>
    </div>
  );
}

// ─── Legal Library panel ──────────────────────────────────────────────────────
function LegalLibraryPanel({ citations, onAddCitation }: {
  citations: Project["citations"]; onAddCitation: (label: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set(citations.map(c => c.label)));

  useEffect(() => {
    setAdded(new Set(citations.map(c => c.label)));
  }, [citations]);

  const results = searchLaws(query).filter(item => filter === "all" || item.category === filter);
  const cats = [
    { id: "all", label: "All" },
    { id: "federal", label: "Federal" },
    { id: "case_law", label: "Case Law" },
    { id: "agency", label: "Agency" },
  ];

  function addToCitations(item: LegalItem) {
    const label = `${item.name} — ${item.citation}`;
    onAddCitation(label);
    setAdded(prev => new Set([...prev, label]));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "16px 16px 0" }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Legal Library</div>
        <div style={{ color: "#666", fontSize: 12, marginBottom: 12 }}>Pre-loaded laws · cases · policies</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#111", border: "1px solid #2a2a2a", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
          <Search size={15} color="#555" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search laws, citations…"
            style={{ flex: 1, background: "none", border: "none", color: "#fff", fontSize: 14, outline: "none" }} />
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto", paddingBottom: 4 }}>
          {cats.map(c => (
            <button key={c.id} onClick={() => setFilter(c.id)}
              style={{ flexShrink: 0, background: filter === c.id ? ORANGE : "#1a1a1a", border: `1px solid ${filter === c.id ? ORANGE : "#2a2a2a"}`, borderRadius: 20, padding: "6px 12px", color: filter === c.id ? "#000" : "#aaa", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
        {results.length === 0 && <div style={{ color: "#555", fontSize: 13, paddingTop: 20 }}>No results for "{query}"</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {results.map(item => {
            const isOpen = expanded === item.id;
            const label = `${item.name} — ${item.citation}`;
            const alreadyAdded = added.has(label);
            return (
              <div key={item.id} style={{ background: "#111", border: "1px solid #222", borderRadius: 10, overflow: "hidden" }}>
                <button onClick={() => setExpanded(isOpen ? null : item.id)}
                  style={{ width: "100%", background: "none", border: "none", padding: "12px 14px", textAlign: "left", cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#fff", marginBottom: 2 }}>{item.name}</div>
                      <div style={{ fontSize: 12, color: ORANGE, fontWeight: 700 }}>{item.citation}</div>
                    </div>
                    <ChevronRight size={14} color="#555" style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.2s", flexShrink: 0, marginTop: 2 }} />
                  </div>
                </button>
                {isOpen && (
                  <div style={{ padding: "0 14px 14px", borderTop: "1px solid #1a1a1a" }}>
                    <div style={{ color: "#ccc", fontSize: 13, lineHeight: 1.55, marginBottom: 10, marginTop: 10 }}>{item.summary}</div>
                    {item.elements && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, color: "#555", fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>ELEMENTS</div>
                        {item.elements.map((el, i) => (
                          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                            <span style={{ color: ORANGE, fontWeight: 800, flexShrink: 0 }}>{i + 1}.</span>
                            <span style={{ color: "#bbb", fontSize: 13 }}>{el}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {item.notes && (
                      <div style={{ background: `${ORANGE}11`, borderRadius: 6, padding: "8px 10px", fontSize: 12, color: "#aaa", lineHeight: 1.5, marginBottom: 10 }}>{item.notes}</div>
                    )}
                    <button onClick={() => addToCitations(item)} disabled={alreadyAdded}
                      style={{ background: alreadyAdded ? "#1a2a1a" : ORANGE, border: "none", borderRadius: 8, padding: "10px 14px", color: alreadyAdded ? "#5a8a5a" : "#000", fontWeight: 700, fontSize: 13, cursor: alreadyAdded ? "default" : "pointer" }}>
                      {alreadyAdded ? "✓ Added to Citations" : "+ Add to Citations"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Conversation view ────────────────────────────────────────────────────────
function ConversationView({ screenType, evidence, conv, onConvChange, onComplete, onBack, isMobile }: {
  screenType: ScreenType; evidence: Evidence[];
  conv: ConvState; onConvChange: (c: ConvState) => void;
  onComplete: (data: DataMap) => void; onBack: () => void;
  isMobile: boolean;
}) {
  const tree = TREES[screenType];
  const node = tree[conv.nodeId] ?? tree["start"];
  const [suggestion, setSuggestion] = useState<ScreenType | null>(null);
  const [dismissed, setDismissed] = useState<ScreenType | null>(null);
  const [lawRecs, setLawRecs] = useState<LegalItem[]>([]);
  const historyRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const progress = Math.max(1, Object.keys(tree).findIndex(k => k === conv.nodeId) + 1);
  const total = Object.keys(tree).length;

  useEffect(() => {
    if (historyRef.current) historyRef.current.scrollTop = historyRef.current.scrollHeight;
  }, [conv.history]);

  useEffect(() => {
    const id = setTimeout(() => {
      if (node.type === "textarea") textareaRef.current?.focus();
      else if (node.type === "text") inputRef.current?.focus();
    }, 80);
    return () => clearTimeout(id);
  }, [conv.nodeId, node.type]);

  function advance(answer: string, nodeId: string, nodeKey: string, question: string) {
    const newData = { ...conv.data, [nodeKey]: answer };
    const newHistory = [...conv.history, { nodeId, nodeKey, question, answer }];

    const detected = detectSuggestion(newData, screenType);
    if (detected && detected !== dismissed) setSuggestion(detected);

    const recs = recommendLaws(Object.values(newData).join(" "));
    if (recs.length > 0) setLawRecs(recs);

    let nextId: string | null;
    try { nextId = typeof node.next === "function" ? node.next(answer, newData) : node.next; }
    catch { nextId = null; }

    if (nextId === null) {
      onConvChange({ ...conv, data: newData, history: newHistory, input: "" });
      onComplete(newData);
    } else {
      onConvChange({ nodeId: nextId, data: newData, history: newHistory, input: "" });
    }
  }

  function submitAnswer(raw?: string) {
    advance((raw !== undefined ? raw : conv.input).trim(), node.id, node.key, node.question);
  }

  function choiceAdvance(label: string, value: string) {
    const newData = { ...conv.data, [node.key]: value };
    const newHistory = [...conv.history, { nodeId: node.id, nodeKey: node.key, question: node.question, answer: label }];

    const detected = detectSuggestion(newData, screenType);
    if (detected && detected !== dismissed) setSuggestion(detected);

    let nextId: string | null;
    try { nextId = typeof node.next === "function" ? node.next(value, newData) : node.next; }
    catch { nextId = null; }

    if (nextId === null) {
      onConvChange({ ...conv, data: newData, history: newHistory, input: "" });
      onComplete(newData);
    } else {
      onConvChange({ nodeId: nextId, data: newData, history: newHistory, input: "" });
    }
  }

  function goBack() {
    if (conv.history.length === 0) { onBack(); return; }
    const prev = conv.history[conv.history.length - 1];
    const newData = { ...conv.data };
    delete newData[prev.nodeKey];
    onConvChange({ nodeId: prev.nodeId, data: newData, history: conv.history.slice(0, -1), input: prev.answer });
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }
  function handleTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    if (dy > 60 || node.type === "choice") return;
    if (dx > 80) goBack();
    else if (dx < -80) submitAnswer();
  }

  const sugDef = suggestion ? SCREEN_TYPES.find(t => t.id === suggestion) : null;
  const relevantEvidence = evidence.filter(e =>
    !node.evidenceTypes || node.evidenceTypes.length === 0 || node.evidenceTypes.includes(e.type)
  );
  const typeDef = SCREEN_TYPES.find(t => t.id === screenType);

  const conversationColumn = (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflowY: "auto" }}>
      {/* Suggestion banner */}
      {suggestion && sugDef && (
        <div style={{ background: "#1a1300", borderBottom: `1px solid ${ORANGE}44`, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <Lightbulb size={14} color={ORANGE} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: 13, lineHeight: 1.4 }}>
            <span style={{ color: ORANGE, fontWeight: 800 }}>This sounds like a {sugDef.label} screen.</span>
            <span style={{ color: "#888" }}> Finish this screen first, then build that one.</span>
          </div>
          <button onClick={() => { setDismissed(suggestion); setSuggestion(null); }}
            style={{ background: "none", border: "none", color: "#555", cursor: "pointer", minWidth: 32, minHeight: 32, display: "flex", alignItems: "center", justifyContent: "center" }}><X size={14} /></button>
        </div>
      )}

      <div ref={historyRef} style={{ flex: 1, overflowY: "auto", padding: isMobile ? "20px 20px 10px" : "24px 28px 10px", display: "flex", flexDirection: "column", gap: 18 }}>
        {conv.history.map((entry, i) => (
          <div key={i}>
            <div style={{ fontSize: 12, color: "#555", marginBottom: 3 }}>{entry.question}</div>
            <div style={{ fontSize: 15, color: "#ddd", fontWeight: 700, borderLeft: `3px solid ${ORANGE}`, paddingLeft: 10, lineHeight: 1.4 }}>
              {entry.answer || <span style={{ color: "#444", fontStyle: "italic" }}>—</span>}
            </div>
          </div>
        ))}

        {/* Current question */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ fontSize: isMobile ? 22 : 20, fontWeight: 800, lineHeight: 1.3, marginBottom: 4 }}>{node.question}</div>
            {node.subtext && <div style={{ fontSize: 14, color: "#666", lineHeight: 1.45 }}>{node.subtext}</div>}
          </div>

          {/* Evidence quick-insert */}
          {relevantEvidence.length > 0 && (
            <div style={{ background: "#0f0f0f", border: `1px solid ${ORANGE}33`, borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: ORANGE, fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 }}>FROM EVIDENCE VAULT</div>
              {relevantEvidence.map(e => (
                <button key={e.id}
                  onClick={() => onConvChange({ ...conv, input: e.content + (e.timestamp ? ` [${e.timestamp}]` : "") })}
                  style={{ display: "block", width: "100%", background: "none", border: "none", textAlign: "left", color: "#bbb", fontSize: 13, cursor: "pointer", padding: "4px 0", minHeight: 36, WebkitTapHighlightColor: "transparent" }}>
                  ↑ {e.label}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          {node.type === "choice" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(node.choices ?? []).map(c => (
                <button key={c.value} onClick={() => choiceAdvance(c.label, c.value)}
                  style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 12, padding: "14px 16px", textAlign: "left", color: "#fff", fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, minHeight: 52, WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "#2a2a2a")}>
                  <ArrowRight size={14} color={ORANGE} style={{ flexShrink: 0 }} />
                  {c.label}
                </button>
              ))}
            </div>
          ) : node.type === "textarea" ? (
            <textarea ref={textareaRef} value={conv.input}
              onChange={e => onConvChange({ ...conv, input: e.target.value })} rows={isMobile ? 4 : 5}
              placeholder="Type your answer…"
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitAnswer(); }}
              style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 12, padding: "14px", color: "#fff", fontSize: 15, fontFamily: "Arial, sans-serif", resize: "vertical", outline: "none" }}
              onFocus={e => (e.target.style.borderColor = ORANGE)} onBlur={e => (e.target.style.borderColor = "#2a2a2a")} />
          ) : (
            <input ref={inputRef} value={conv.input}
              onChange={e => onConvChange({ ...conv, input: e.target.value })}
              placeholder="Type your answer…"
              onKeyDown={e => e.key === "Enter" && submitAnswer()}
              style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 12, padding: "14px 16px", color: "#fff", fontSize: 15, fontFamily: "Arial, sans-serif", outline: "none" }}
              onFocus={e => (e.target.style.borderColor = ORANGE)} onBlur={e => (e.target.style.borderColor = "#2a2a2a")} />
          )}

          {node.type !== "choice" && (
            <div style={{ color: "#444", fontSize: 12 }}>{node.type === "textarea" ? "⌘ Enter · or tap Continue" : "Enter · or tap Continue"}</div>
          )}
        </div>
      </div>

      {/* Bottom action row */}
      {node.type !== "choice" && (
        <div style={{ borderTop: "1px solid #1e1e1e", padding: isMobile ? "14px 16px calc(14px + env(safe-area-inset-bottom))" : "14px 20px", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <TapBtn onClick={goBack} style={{ flex: "0 0 auto", minWidth: 80, padding: "14px 16px" }}>
              <ChevronLeft size={18} /> Back
            </TapBtn>
            <TapBtn onClick={() => submitAnswer()} variant="orange" full style={{ flex: 1 }}>
              {node.next === null ? "Finish Screen" : "Continue"} <ChevronRight size={18} />
            </TapBtn>
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
            <button onClick={() => submitAnswer("")} style={{ background: "none", border: "none", color: "#444", fontSize: 13, cursor: "pointer", padding: "4px 16px", minHeight: 36 }}>
              Skip
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // Law recs panel (desktop only right column)
  const lawPanel = lawRecs.length > 0 ? (
    <div style={{ width: 280, flexShrink: 0, borderLeft: "1px solid #1e1e1e", overflowY: "auto", padding: "20px 16px" }}>
      <div style={{ fontSize: 11, color: ORANGE, fontWeight: 700, letterSpacing: 0.5, marginBottom: 12 }}>RELEVANT LAWS</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {lawRecs.map(law => (
          <div key={law.id} style={{ background: "#0f0f0f", border: "1px solid #222", borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#fff", marginBottom: 2 }}>{law.name}</div>
            <div style={{ fontSize: 11, color: ORANGE, marginBottom: 4 }}>{law.citation}</div>
            <div style={{ fontSize: 12, color: "#777", lineHeight: 1.4 }}>{law.summary.slice(0, 80)}…</div>
          </div>
        ))}
      </div>

      {conv.history.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: "#555", fontWeight: 700, letterSpacing: 0.5, margin: "20px 0 10px" }}>COLLECTED SO FAR</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {conv.history.map((entry, i) => (
              <div key={i}>
                <div style={{ fontSize: 11, color: "#444", marginBottom: 2 }}>{entry.question}</div>
                <div style={{ fontSize: 13, color: "#ccc", fontWeight: 700, borderLeft: `2px solid ${ORANGE}`, paddingLeft: 8 }}>
                  {entry.answer || <span style={{ color: "#333", fontStyle: "italic" }}>—</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  ) : (
    conv.history.length > 0 ? (
      <div style={{ width: 260, flexShrink: 0, borderLeft: "1px solid #1e1e1e", overflowY: "auto", padding: "20px 16px" }}>
        <div style={{ fontSize: 11, color: "#555", fontWeight: 700, letterSpacing: 0.5, marginBottom: 12 }}>COLLECTED SO FAR</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {conv.history.map((entry, i) => (
            <div key={i}>
              <div style={{ fontSize: 11, color: "#444", marginBottom: 2 }}>{entry.question}</div>
              <div style={{ fontSize: 13, color: "#ccc", fontWeight: 700, borderLeft: `2px solid ${ORANGE}`, paddingLeft: 8 }}>
                {entry.answer || <span style={{ color: "#333", fontStyle: "italic" }}>—</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    ) : null
  );

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0 }}
      onTouchStart={isMobile ? handleTouchStart : undefined}
      onTouchEnd={isMobile ? handleTouchEnd : undefined}>
      {/* Progress bar */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        <div style={{ height: 3, background: "#1a1a1a", flexShrink: 0 }}>
          <div style={{ width: `${(progress / total) * 100}%`, height: "100%", background: ORANGE, transition: "width 0.25s" }} />
        </div>
        {conversationColumn}
      </div>
      {!isMobile && lawPanel}
    </div>
  );
}

// ─── Edit view ────────────────────────────────────────────────────────────────
function EditView({ screen, project, onUpdate, onBack, onUpdateProject, isMobile }: {
  screen: Screen; project: Project;
  onUpdate: (s: Screen) => void; onBack: () => void; onUpdateProject: (p: Project) => void;
  isMobile: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidePanel, setSidePanel] = useState<"blocks" | "citations" | "laws">("blocks");
  const [showExport, setShowExport] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(!isMobile);
  const w = useWindowWidth();

  // Scale for mobile canvas preview: fit to screen width with padding
  const mobilePreviewScale = Math.min((w - 32) / 1080, 0.35);
  const mobilePreviewHeight = previewExpanded ? 1080 * mobilePreviewScale : 120;

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

  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
        {/* Canvas preview (collapsible) */}
        <div style={{ background: "#080808", flexShrink: 0, overflow: "hidden", transition: "height 0.3s", height: previewExpanded ? 1080 * mobilePreviewScale + 28 : 56, position: "relative" }}>
          {/* Preview header */}
          <div style={{ display: "flex", alignItems: "center", padding: "10px 16px", gap: 10 }}>
            <button onClick={() => setPreviewExpanded(v => !v)}
              style={{ background: "none", border: "none", color: "#888", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, WebkitTapHighlightColor: "transparent" }}>
              {previewExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {previewExpanded ? "Collapse Preview" : "Show Preview"}
            </button>
            <div style={{ flex: 1 }} />
            <button onClick={() => setShowExport(true)}
              style={{ background: ORANGE, border: "none", borderRadius: 8, padding: "7px 14px", color: "#000", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, WebkitTapHighlightColor: "transparent" }}>
              <Download size={14} /> Export
            </button>
          </div>
          {previewExpanded && (
            <div style={{ position: "relative", height: 1080 * mobilePreviewScale, overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: "50%", transform: `translateX(-50%) scale(${mobilePreviewScale})`, transformOrigin: "top center" }}>
                <BlockCanvas blocks={screen.blocks} screenNumber={screen.screenNumber}
                  footerCitations={screen.footerCitations}
                  selectedBlockId={selectedId ?? undefined} onBlockClick={setSelectedId} />
              </div>
            </div>
          )}
        </div>

        {/* Tab strip */}
        <div style={{ display: "flex", borderBottom: "1px solid #1e1e1e", borderTop: "1px solid #1e1e1e", flexShrink: 0 }}>
          {(["blocks", "citations", "laws"] as const).map(tab => (
            <button key={tab} onClick={() => setSidePanel(tab)}
              style={{ flex: 1, background: "none", border: "none", borderBottom: `2px solid ${sidePanel === tab ? ORANGE : "transparent"}`, padding: "12px 0", color: sidePanel === tab ? "#fff" : "#555", fontWeight: 700, fontSize: 12, letterSpacing: 0.5, cursor: "pointer", textTransform: "uppercase" }}>
              {tab}
            </button>
          ))}
        </div>

        {/* Panel content */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {sidePanel === "blocks" && (
            <BlockEditorPanel screen={screen} selectedId={selectedId} evidence={project.evidence}
              onUpdateBlock={handleUpdateBlock} onSelectBlock={setSelectedId}
              onAddBlock={handleAddBlock} onRemoveBlock={handleRemoveBlock} onMoveBlock={handleMoveBlock} />
          )}
          {sidePanel === "citations" && (
            <CitationLibraryPanel citations={project.citations}
              onAdd={label => onUpdateProject(addCitation(project, label))}
              onDelete={id => onUpdateProject(deleteCitation(project, id))}
              screenCitations={screen.footerCitations} onToggle={toggleCitation} />
          )}
          {sidePanel === "laws" && (
            <LegalLibraryPanel citations={project.citations}
              onAddCitation={label => onUpdateProject(addCitation(project, label))} />
          )}
        </div>

        {/* Bottom bar */}
        <div style={{ borderTop: "1px solid #1e1e1e", padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <input value={screen.screenNumber} onChange={e => onUpdate({ ...screen, screenNumber: e.target.value })}
            style={{ width: 52, background: "#111", border: "1px solid #2a2a2a", borderRadius: 8, padding: "8px", color: "#fff", fontSize: 16, fontWeight: 800, outline: "none", textAlign: "center" }} />
          <span style={{ fontSize: 12, color: "#555" }}>Screen #</span>
          <div style={{ flex: 1 }} />
          <SmBtn onClick={onBack}><ChevronLeft size={13} /> Screens</SmBtn>
        </div>

        {showExport && <ExportModal screen={screen} onClose={() => setShowExport(false)} />}
      </div>
    );
  }

  // Desktop layout
  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      <div style={{ width: 320, flexShrink: 0, borderRight: "1px solid #1e1e1e", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", borderBottom: "1px solid #1e1e1e", flexShrink: 0 }}>
          {(["blocks", "citations", "laws"] as const).map(tab => (
            <button key={tab} onClick={() => setSidePanel(tab)}
              style={{ flex: 1, background: "none", border: "none", borderBottom: `2px solid ${sidePanel === tab ? ORANGE : "transparent"}`, padding: "12px 0", color: sidePanel === tab ? "#fff" : "#555", fontWeight: 700, fontSize: 11, letterSpacing: 0.5, cursor: "pointer", textTransform: "uppercase" }}>
              {tab}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {sidePanel === "blocks" && (
            <BlockEditorPanel screen={screen} selectedId={selectedId} evidence={project.evidence}
              onUpdateBlock={handleUpdateBlock} onSelectBlock={setSelectedId}
              onAddBlock={handleAddBlock} onRemoveBlock={handleRemoveBlock} onMoveBlock={handleMoveBlock} />
          )}
          {sidePanel === "citations" && (
            <CitationLibraryPanel citations={project.citations}
              onAdd={label => onUpdateProject(addCitation(project, label))}
              onDelete={id => onUpdateProject(deleteCitation(project, id))}
              screenCitations={screen.footerCitations} onToggle={toggleCitation} />
          )}
          {sidePanel === "laws" && (
            <LegalLibraryPanel citations={project.citations}
              onAddCitation={label => onUpdateProject(addCitation(project, label))} />
          )}
        </div>
        <div style={{ borderTop: "1px solid #1e1e1e", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: "#555" }}>SCREEN #</span>
          <input value={screen.screenNumber} onChange={e => onUpdate({ ...screen, screenNumber: e.target.value })}
            style={{ width: 56, background: "#111", border: "1px solid #2a2a2a", borderRadius: 6, padding: "6px 8px", color: "#fff", fontSize: 15, fontWeight: 800, outline: "none", textAlign: "center" }} />
          <div style={{ flex: 1 }} />
          <button onClick={() => setShowExport(true)}
            style={{ background: ORANGE, border: "none", borderRadius: 8, padding: "8px 14px", color: "#000", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Download size={14} /> Export
          </button>
          <SmBtn onClick={onBack}><ChevronLeft size={13} /> Screens</SmBtn>
        </div>
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
  );
}

// ─── Project view ─────────────────────────────────────────────────────────────
type ProjectTab = "screens" | "vault" | "laws" | "citations";

function ProjectView({ project, onNewScreen, onEditScreen, onDeleteScreen, onUpdateProject, isMobile, activeTab, onTabChange }: {
  project: Project; onNewScreen: () => void; onEditScreen: (s: Screen) => void;
  onDeleteScreen: (id: string) => void; onUpdateProject: (p: Project) => void;
  isMobile: boolean; activeTab: ProjectTab; onTabChange: (t: ProjectTab) => void;
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

  // Desktop
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
          {sidebar === "vault" && (
            <EvidenceVaultPanel evidence={project.evidence}
              onAdd={e => onUpdateProject(addEvidence(project, e))}
              onDelete={id => onUpdateProject(deleteEvidence(project, id))} />
          )}
          {sidebar === "laws" && (
            <LegalLibraryPanel citations={project.citations}
              onAddCitation={label => onUpdateProject(addCitation(project, label))} />
          )}
          {sidebar === "citations" && (
            <CitationLibraryPanel citations={project.citations}
              onAdd={label => onUpdateProject(addCitation(project, label))}
              onDelete={id => onUpdateProject(deleteCitation(project, id))} />
          )}
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

// ─── Bottom nav (mobile) ──────────────────────────────────────────────────────
function BottomNav({ activeTab, onTabChange, onNewScreen }: {
  activeTab: ProjectTab; onTabChange: (t: ProjectTab) => void; onNewScreen: () => void;
}) {
  const tabs: { id: ProjectTab; icon: React.ElementType; label: string }[] = [
    { id: "screens", icon: LayoutGrid, label: "Screens" },
    { id: "vault", icon: FileSearch, label: "Vault" },
    { id: "laws", icon: BookOpen, label: "Laws" },
    { id: "citations", icon: FileText, label: "Citations" },
  ];

  return (
    <div style={{ borderTop: "1px solid #1e1e1e", background: "#0c0c0c", paddingBottom: "env(safe-area-inset-bottom)", flexShrink: 0, position: "relative" }}>
      {/* FAB */}
      <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: -28, zIndex: 10 }}>
        <button onClick={onNewScreen}
          style={{ width: 56, height: 56, borderRadius: 28, background: ORANGE, border: "3px solid #0c0c0c", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 16px #d9711f66", WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}>
          <Plus size={24} color="#000" />
        </button>
      </div>

      <div style={{ display: "flex" }}>
        {tabs.map((tab, i) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          // Leave center gap for FAB
          const hasCenterGap = tabs.length === 4 && i === 1;
          return (
            <React.Fragment key={tab.id}>
              {hasCenterGap && <div style={{ flex: 1 }} />}
              <button onClick={() => onTabChange(tab.id)}
                style={{ flex: 1, background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, padding: "12px 4px", cursor: "pointer", color: isActive ? ORANGE : "#555", WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}>
                <Icon size={22} />
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.3 }}>{tab.label}</span>
              </button>
              {hasCenterGap && <div style={{ flex: 1 }} />}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
type AppView = "project" | "pick_type" | "build" | "edit";

export default function App() {
  const w = useWindowWidth();
  const isMobile = w < 768;

  const [project, setProjectRaw] = useState<Project>(() => loadProject());
  const [view, setView] = useState<AppView>("project");
  const [buildType, setBuildType] = useState<ScreenType | null>(null);
  const [editScreen, setEditScreenState] = useState<Screen | null>(null);
  const [editingCaseName, setEditingCaseName] = useState(false);
  const [caseInput, setCaseInput] = useState(project.caseName);
  const [conv, setConv] = useState<ConvState>(FRESH_CONV);
  const [projectTab, setProjectTab] = useState<ProjectTab>("screens");

  function setProject(p: Project) { setProjectRaw(p); saveProject(p); }

  function startBuild(type: ScreenType) {
    setBuildType(type);
    setConv(FRESH_CONV);
    setView("build");
  }

  function handleConversationComplete(data: DataMap) {
    if (!buildType) return;
    try {
      const screen = buildScreen(buildType, data);
      const updated = addScreen(project, screen);
      setProject(updated);
      setEditScreenState(screen);
      setConv(FRESH_CONV);
      setView("edit");
    } catch (err) {
      console.error("[LSB] buildScreen failed:", err);
    }
  }

  function handleUpdateScreen(s: Screen) { setEditScreenState(s); setProject(updateScreen(project, s)); }
  function handleDeleteScreen(id: string) {
    setProject(deleteScreen(project, id));
    if (editScreen?.id === id) { setEditScreenState(null); setView("project"); }
  }

  const screenTypeDef = buildType ? SCREEN_TYPES.find(t => t.id === buildType) : null;

  return (
    <div style={{ height: "100dvh", background: BG, color: "#fff", fontFamily: "Arial, sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid #1e1e1e", padding: isMobile ? "12px 16px" : "11px 24px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0, background: "#0a0a0a" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: view !== "build" ? "pointer" : "default" }}
          onClick={() => view !== "build" && setView("project")}>
          <div style={{ width: 9, height: 9, background: ORANGE, borderRadius: 2 }} />
          {!isMobile && <span style={{ fontWeight: 900, fontSize: 14, letterSpacing: 0.5 }}>LEGAL SCREEN BUILDER</span>}
        </div>

        {/* Case name */}
        {editingCaseName ? (
          <div style={{ display: "flex", gap: 6, flex: isMobile ? 1 : undefined }}>
            <input value={caseInput} onChange={e => setCaseInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { setProject({ ...project, caseName: caseInput }); setEditingCaseName(false); } if (e.key === "Escape") setEditingCaseName(false); }}
              autoFocus style={{ background: "#111", border: `1px solid ${ORANGE}`, borderRadius: 8, padding: "6px 12px", color: "#fff", fontSize: 14, fontWeight: 700, outline: "none", flex: 1 }} />
            <button onClick={() => { setProject({ ...project, caseName: caseInput }); setEditingCaseName(false); }}
              style={{ background: ORANGE, border: "none", borderRadius: 8, padding: "0 10px", cursor: "pointer" }}><Check size={14} color="#000" /></button>
          </div>
        ) : (
          <button onClick={() => { setEditingCaseName(true); setCaseInput(project.caseName); }}
            style={{ background: "none", border: "none", color: "#bbb", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, flex: isMobile ? 1 : undefined, textAlign: "left" }}>
            <BookOpen size={12} color={ORANGE} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: isMobile ? 180 : 240 }}>{project.caseName}</span>
            <Edit3 size={11} color="#444" style={{ flexShrink: 0 }} />
          </button>
        )}

        {view === "build" && screenTypeDef && !isMobile && (
          <><span style={{ color: "#333" }}>/</span><span style={{ color: "#666", fontSize: 13 }}>{screenTypeDef.label}</span></>
        )}
        {view === "edit" && editScreen && !isMobile && (
          <><span style={{ color: "#333" }}>/</span><span style={{ color: "#666", fontSize: 13 }}>{editScreen.title}</span></>
        )}

        <div style={{ flex: 1 }} />

        {view !== "project" && view !== "build" && (
          <SmBtn onClick={() => setView("project")}><ChevronLeft size={13} /> {isMobile ? "" : "Screens"}</SmBtn>
        )}
        {view === "build" && (
          <SmBtn onClick={() => setView("pick_type")}><ChevronLeft size={13} /> {isMobile ? "" : "Change Type"}</SmBtn>
        )}
        {!isMobile && (view === "project" || view === "edit") && (
          <SmBtn onClick={() => setView("pick_type")} variant="orange"><Plus size={14} /> New Screen</SmBtn>
        )}
      </div>

      {/* Views */}
      <ErrorBoundary onReset={() => setView("project")}>
        {view === "project" && (
          <ProjectView project={project}
            onNewScreen={() => setView("pick_type")}
            onEditScreen={s => { setEditScreenState(s); setView("edit"); }}
            onDeleteScreen={handleDeleteScreen}
            onUpdateProject={setProject}
            isMobile={isMobile}
            activeTab={projectTab}
            onTabChange={setProjectTab} />
        )}

        {view === "pick_type" && (
          <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" as never }}>
            <div style={{ maxWidth: 860, margin: "0 auto", padding: isMobile ? "36px 20px 120px" : "56px 28px" }}>
              <h1 style={{ fontSize: isMobile ? 28 : 32, fontWeight: 900, marginBottom: 6 }}>What are you building?</h1>
              <p style={{ color: "#777", marginBottom: 28, fontSize: 15, lineHeight: 1.55 }}>
                Choose a layout. I'll walk you through the evidence — the screen assembles as you answer.
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
            </div>
          </div>
        )}

        {view === "build" && buildType && (
          <ConversationView
            key={buildType}
            screenType={buildType}
            evidence={project.evidence}
            conv={conv}
            onConvChange={setConv}
            onComplete={handleConversationComplete}
            onBack={() => setView("pick_type")}
            isMobile={isMobile} />
        )}

        {view === "edit" && editScreen && (
          <EditView screen={editScreen} project={project}
            onUpdate={handleUpdateScreen}
            onBack={() => setView("project")}
            onUpdateProject={setProject}
            isMobile={isMobile} />
        )}
      </ErrorBoundary>

      {/* Mobile bottom nav — only in project view */}
      {isMobile && view === "project" && (
        <BottomNav
          activeTab={projectTab}
          onTabChange={setProjectTab}
          onNewScreen={() => setView("pick_type")} />
      )}
    </div>
  );
}

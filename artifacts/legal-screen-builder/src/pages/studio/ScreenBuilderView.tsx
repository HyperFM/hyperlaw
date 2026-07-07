import React, { useState, useRef, useLayoutEffect } from "react";
import {
  ArrowLeft, Download, RotateCcw, ChevronRight, ChevronLeft, Check,
  Scale, Quote, History, AlertTriangle, ShieldAlert, PencilRuler, Sparkles, Pencil,
} from "lucide-react";
import html2canvas from "html2canvas";
import { TREES, buildScreen, detectSuggestion } from "../../engine";
import { BlockCanvas } from "../../BlockCanvas";
import type { ScreenType, DataMap, Screen } from "../../types";

const ORANGE = "#d9711f";

// ── Screen-type catalog (friendly labels for the 5 engine trees) ───────────────
const TYPES: { type: ScreenType; label: string; desc: string; Icon: typeof Scale }[] = [
  { type: "contradiction",   label: "Contradiction",   desc: "Two statements that don't match",       Icon: Scale },
  { type: "quote",           label: "Key Quote",        desc: "A damaging thing someone said",         Icon: Quote },
  { type: "prior_incident",  label: "Prior Incident",   desc: "It had happened before",                Icon: History },
  { type: "admission",       label: "Admission",        desc: "They admitted what they knew",          Icon: AlertTriangle },
  { type: "policy_violation",label: "Policy Violation", desc: "A rule or procedure was broken",        Icon: ShieldAlert },
];
const LABELS: Record<ScreenType, string> = TYPES.reduce((a, t) => { a[t.type] = t.label; return a; }, {} as Record<ScreenType, string>);

type Stage = "type" | "q" | "preview";

interface Props {
  onBack: () => void;
}

export default function ScreenBuilderView({ onBack }: Props) {
  const [stage, setStage] = useState<Stage>("type");
  const [type, setType] = useState<ScreenType | null>(null);
  const [data, setData] = useState<DataMap>({});
  const [nodeId, setNodeId] = useState("start");
  const [history, setHistory] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [screen, setScreen] = useState<Screen | null>(null);
  const [downloading, setDownloading] = useState(false);

  const tree = type ? TREES[type] : null;
  const node = tree ? tree[nodeId] : null;

  // Count for a lightweight "step X of ~Y" indicator
  const totalNodes = tree ? Object.keys(tree).length : 0;

  function chooseType(t: ScreenType) {
    setType(t);
    setData({});
    setNodeId("start");
    setHistory([]);
    setDraft("");
    setScreen(null);
    setStage("q");
  }

  function advance(answer: string) {
    if (!node || !type) return;
    const nd = { ...data, [node.key]: answer };
    setData(nd);
    const nx = typeof node.next === "function" ? node.next(answer) : node.next;
    if (nx === null) {
      setScreen(buildScreen(type, nd));
      setStage("preview");
      return;
    }
    setHistory(h => [...h, nodeId]);
    setNodeId(nx);
    setDraft(tree && tree[nx] ? nd[tree[nx].key] || "" : "");
  }

  function goBack() {
    if (stage === "type") { onBack(); return; }
    if (stage === "preview") { setStage("q"); return; }
    if (history.length === 0) { setStage("type"); setType(null); return; }
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setNodeId(prev);
    setDraft(tree ? data[tree[prev].key] || "" : "");
  }

  function startOver() {
    setStage("type"); setType(null); setData({}); setNodeId("start"); setHistory([]); setDraft(""); setScreen(null);
  }

  const suggestion = stage === "preview" && type ? detectSuggestion(data, type) : null;

  return (
    <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", background: "#050505" }}>

      {/* ── Logo banner (kept from Exhibit Studio — user favourite) ── */}
      <img
        src="/exhibit-studio-banner.png"
        alt="Exhibit Studio"
        style={{ height: 110, width: "auto", display: "block", flexShrink: 0, alignSelf: "flex-start" }}
      />

      {/* ── Header row ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 16px 0" }}>
        <button onClick={goBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}>
          <ArrowLeft size={18} color="#666" />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: "#fff", display: "flex", alignItems: "center", gap: 7 }}>
            <PencilRuler size={15} color={ORANGE} /> Manual Screen Builder
          </div>
          <div style={{ fontSize: 11, color: "#555", marginTop: 1 }}>
            {stage === "type" && "Pick the kind of exhibit screen to build"}
            {stage === "q" && type && `${LABELS[type]} · answer a few questions`}
            {stage === "preview" && "Your exhibit screen is ready"}
          </div>
        </div>
      </div>

      <div style={{ padding: "18px 16px 120px", display: "flex", flexDirection: "column", flex: 1 }}>

        {/* ─────────────────────────── STAGE: TYPE ─────────────────────────── */}
        {stage === "type" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {TYPES.map(({ type: t, label, desc, Icon }) => (
              <button key={t} onClick={() => chooseType(t)}
                style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, padding: "16px 16px", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, width: "100%" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE + "55")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "#1e1e1e")}>
                <div style={{ width: 44, height: 44, background: "#1a1a1a", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={20} color={ORANGE} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: "#fff", marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 12, color: "#555" }}>{desc}</div>
                </div>
                <ChevronRight size={16} color="#333" style={{ flexShrink: 0 }} />
              </button>
            ))}
          </div>
        )}

        {/* ─────────────────────────── STAGE: QUESTIONS ─────────────────────── */}
        {stage === "q" && node && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            {/* progress */}
            <div style={{ height: 4, background: "#1a1a1a", borderRadius: 2, overflow: "hidden", marginBottom: 22 }}>
              <div style={{ height: "100%", width: `${Math.min(100, ((history.length + 1) / Math.max(totalNodes, 1)) * 100)}%`, background: ORANGE, transition: "width 0.25s" }} />
            </div>

            <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", lineHeight: 1.3, marginBottom: node.subtext ? 8 : 20 }}>
              {node.question}
            </div>
            {node.subtext && (
              <div style={{ fontSize: 13, color: "#666", lineHeight: 1.5, marginBottom: 20 }}>{node.subtext}</div>
            )}

            {node.type === "choice" && node.choices && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {node.choices.map(c => (
                  <button key={c.value} onClick={() => advance(c.value)}
                    style={{ background: "#111", border: "1px solid #222", borderRadius: 12, padding: "15px 16px", textAlign: "left", cursor: "pointer", fontSize: 15, fontWeight: 700, color: "#ddd", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE + "77")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "#222")}>
                    {c.label}
                    <ChevronRight size={16} color={ORANGE} style={{ flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            )}

            {node.type === "text" && (
              <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") advance(draft.trim()); }}
                placeholder="Type your answer…"
                style={{ width: "100%", background: "#111", border: "1px solid #222", borderRadius: 12, padding: "14px 16px", color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box" }}
                onFocus={e => (e.target.style.borderColor = ORANGE + "88")}
                onBlur={e => (e.target.style.borderColor = "#222")} />
            )}

            {node.type === "textarea" && (
              <textarea autoFocus value={draft} onChange={e => setDraft(e.target.value)}
                placeholder="Type your answer…" rows={5}
                style={{ width: "100%", background: "#111", border: "1px solid #222", borderRadius: 12, padding: "14px 16px", color: "#fff", fontSize: 15, lineHeight: 1.5, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }}
                onFocus={e => (e.target.style.borderColor = ORANGE + "88")}
                onBlur={e => (e.target.style.borderColor = "#222")} />
            )}

            {node.type !== "choice" && (
              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button onClick={goBack}
                  style={{ background: "#141414", border: "1px solid #222", borderRadius: 12, padding: "14px 18px", cursor: "pointer", color: "#888", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                  <ChevronLeft size={15} /> Back
                </button>
                <button onClick={() => advance(draft.trim())}
                  style={{ flex: 1, background: ORANGE, border: "none", borderRadius: 12, padding: "14px 18px", cursor: "pointer", color: "#000", fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  Continue <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ─────────────────────────── STAGE: PREVIEW ───────────────────────── */}
        {stage === "preview" && screen && (
          <PreviewStage
            screen={screen}
            downloading={downloading}
            onDownload={async () => {
              setDownloading(true);
              try { await downloadScreenPng(screen); } finally { setDownloading(false); }
            }}
            onEdit={() => setStage("q")}
            onStartOver={startOver}
            suggestion={suggestion}
            suggestionLabel={suggestion ? LABELS[suggestion] : ""}
            onBuildSuggestion={() => suggestion && chooseType(suggestion)}
          />
        )}
      </div>
    </div>
  );
}

// ── Preview + a scaled, live render of the built screen ────────────────────────
function PreviewStage({
  screen, downloading, onDownload, onEdit, onStartOver, suggestion, suggestionLabel, onBuildSuggestion,
}: {
  screen: Screen;
  downloading: boolean;
  onDownload: () => void;
  onEdit: () => void;
  onStartOver: () => void;
  suggestion: ScreenType | null;
  suggestionLabel: string;
  onBuildSuggestion: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(340);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = Math.min(w, 460) / 1080;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div ref={wrapRef} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
        {/* Scaled preview */}
        <div style={{ width: 1080 * scale, height: 1080 * scale, overflow: "hidden", borderRadius: 6 }}>
          <div style={{ width: 1080, height: 1080, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <BlockCanvas blocks={screen.blocks} screenNumber={screen.screenNumber} footerCitations={screen.footerCitations} />
          </div>
        </div>
      </div>

      {suggestion && (
        <button onClick={onBuildSuggestion}
          style={{ marginTop: 16, background: "#140d03", border: `1px solid ${ORANGE}44`, borderRadius: 12, padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, textAlign: "left" }}>
          <Sparkles size={16} color={ORANGE} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: "#caa", fontWeight: 600 }}>
            This also sounds like a <strong style={{ color: ORANGE }}>{suggestionLabel}</strong> screen — build one next?
          </span>
        </button>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button onClick={onEdit}
          style={{ background: "#141414", border: "1px solid #222", borderRadius: 12, padding: "14px", cursor: "pointer", color: "#888", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, flex: 1 }}>
          <Pencil size={14} /> Edit answers
        </button>
        <button onClick={onDownload} disabled={downloading}
          style={{ flex: 2, background: ORANGE, border: "none", borderRadius: 12, padding: "14px", cursor: downloading ? "wait" : "pointer", color: "#000", fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: downloading ? 0.7 : 1 }}>
          {downloading ? <><Check size={16} /> Rendering…</> : <><Download size={16} /> Download PNG</>}
        </button>
      </div>

      <button onClick={onStartOver}
        style={{ marginTop: 10, background: "none", border: "1px solid #1c1c1c", borderRadius: 12, padding: "12px", cursor: "pointer", color: "#666", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <RotateCcw size={14} /> Build another screen
      </button>

      {/* Hidden full-size render used for a crisp 1080×1080 PNG export */}
      <div aria-hidden style={{ position: "fixed", left: -99999, top: 0, width: 1080, height: 1080, pointerEvents: "none" }}>
        <div id={`sb-export-${screen.id}`}>
          <BlockCanvas blocks={screen.blocks} screenNumber={screen.screenNumber} footerCitations={screen.footerCitations} />
        </div>
      </div>
    </div>
  );
}

async function downloadScreenPng(screen: Screen) {
  const node = document.getElementById(`sb-export-${screen.id}`);
  if (!node) return;
  const canvas = await html2canvas(node, {
    backgroundColor: "#0a0a0a",
    scale: 1,
    width: 1080,
    height: 1080,
    windowWidth: 1080,
    windowHeight: 1080,
    logging: false,
    useCORS: true,
  });
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  const slug = (screen.title || "screen").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "screen";
  a.download = `${slug}-${screen.screenNumber || "01"}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

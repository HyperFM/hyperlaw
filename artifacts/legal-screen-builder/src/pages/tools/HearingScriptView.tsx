import React, { useEffect, useState } from "react";
import { ChevronRight, ArrowLeft, Gavel, Plus, AlertCircle, Sparkles, FileText, CheckCircle2, Presentation } from "lucide-react";
import type { HLCase, HearingScript, HearingScriptSection } from "../../types";
import { aiApi } from "../../lib/aiApi";
import HearingScriptReaderView from "./HearingScriptReaderView";

const ORANGE = "#d9711f";

interface Props {
  cases: HLCase[];
  onBack: () => void;
  /** Set when arriving via a "hearing_script_stale" notification's "Review
   *  script now" — jumps straight to that case+script instead of the
   *  case-picker/list screens. */
  initialSelection?: { caseId: string; scriptId: string };
  onInitialSelectionConsumed?: () => void;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "No date set";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function HearingScriptView({ cases, onBack, initialSelection, onInitialSelectionConsumed }: Props) {
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(initialSelection?.caseId ?? null);
  const [scripts, setScripts] = useState<HearingScript[]>([]);
  const [loadingScripts, setLoadingScripts] = useState(false);
  const [activeScriptId, setActiveScriptId] = useState<string | null>(null);
  const [readerMode, setReaderMode] = useState(false);

  // Once the scripts for the deep-linked case have loaded, jump straight to
  // the specific script and consume the pending selection so navigating away
  // and back doesn't re-trigger it.
  useEffect(() => {
    if (!initialSelection || loadingScripts) return;
    if (scripts.some(s => s.id === initialSelection.scriptId)) {
      setActiveScriptId(initialSelection.scriptId);
      onInitialSelectionConsumed?.();
    }
  }, [initialSelection, scripts, loadingScripts, onInitialSelectionConsumed]);

  const selectedCase = cases.find(c => c.id === selectedCaseId) ?? null;
  const activeScript = scripts.find(s => s.id === activeScriptId) ?? null;

  useEffect(() => {
    if (!selectedCaseId) return;
    setLoadingScripts(true);
    aiApi.hearingScripts.list(selectedCaseId)
      .then(rows => setScripts(rows))
      .catch(() => setScripts([]))
      .finally(() => setLoadingScripts(false));
  }, [selectedCaseId]);

  function refreshScript(updated: HearingScript) {
    setScripts(prev => prev.map(s => (s.id === updated.id ? updated : s)));
  }

  // ── Case picker ────────────────────────────────────────────────────────────
  if (!selectedCase) {
    return (
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 20px 120px" }}>
          <button onClick={onBack}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 18, display: "flex", alignItems: "center", gap: 6, color: "#666", fontSize: 13, fontWeight: 700 }}>
            <ArrowLeft size={15} /> Tools
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: `${ORANGE}16`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Gavel size={19} color={ORANGE} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>Hearing Script</div>
          </div>
          <div style={{ color: "#666", fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>
            Get a sectioned script for a specific hearing, built from your case's own filings — with a nudge if a new filing lands after you've marked it ready.
          </div>

          <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>SELECT A CASE</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {cases.map(c => (
              <button key={c.id} onClick={() => setSelectedCaseId(c.id)}
                style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, padding: "16px", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, width: "100%" }}>
                <div style={{ width: 40, height: 40, background: "#1a1a1a", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Gavel size={18} color={ORANGE} />
                </div>
                <div style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: 15, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
                <ChevronRight size={16} color="#333" style={{ flexShrink: 0 }} />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Script list for the case ───────────────────────────────────────────────
  if (!activeScript) {
    return (
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 20px 120px" }}>
          <button onClick={() => setSelectedCaseId(null)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 18, display: "flex", alignItems: "center", gap: 6, color: "#666", fontSize: 13, fontWeight: 700 }}>
            <ArrowLeft size={15} /> All cases
          </button>
          <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 18 }}>{selectedCase.title}</div>

          <NewScriptButton caseId={selectedCase.id} onCreated={s => { setScripts(prev => [s, ...prev]); setActiveScriptId(s.id); }} />

          {loadingScripts ? (
            <div style={{ color: "#555", fontSize: 13, marginTop: 20 }}>Loading…</div>
          ) : scripts.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
              <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 2 }}>HEARING SCRIPTS</div>
              {scripts.map(s => (
                <button key={s.id} onClick={() => setActiveScriptId(s.id)}
                  style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, padding: "16px", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, width: "100%" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: "#fff" }}>{s.title}</div>
                    <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
                      {fmtDate(s.hearingDate)} · {s.sections.length || 0} section{s.sections.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <StatusBadge status={s.status} />
                  <ChevronRight size={16} color="#333" style={{ flexShrink: 0 }} />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // ── Courtroom reader mode ──────────────────────────────────────────────────
  if (readerMode) {
    return (
      <HearingScriptReaderView
        script={activeScript}
        onBack={() => setReaderMode(false)}
        onUpdateSection={async (sectionId, changes) => {
          const updated = await aiApi.hearingScripts.updateSection(activeScript.id, sectionId, changes);
          refreshScript({
            ...activeScript,
            sections: activeScript.sections.map(sec => (sec.id === sectionId ? { ...sec, ...updated } : sec)),
          });
        }}
      />
    );
  }

  // ── Script detail ──────────────────────────────────────────────────────────
  return (
    <ScriptDetail
      caseId={selectedCase.id}
      script={activeScript}
      onBack={() => setActiveScriptId(null)}
      onUpdated={refreshScript}
      onOpenReader={() => setReaderMode(true)}
    />
  );
}

function StatusBadge({ status }: { status: HearingScript["status"] }) {
  const colors: Record<HearingScript["status"], { bg: string; fg: string }> = {
    draft: { bg: "#1a1a1a", fg: "#999" },
    ready: { bg: "#0f2a17", fg: "#22c55e" },
    delivered: { bg: "#0d1a2a", fg: "#7ab0e0" },
    archived: { bg: "#1a1a1a", fg: "#555" },
  };
  const c = colors[status];
  return (
    <span style={{ fontSize: 10.5, fontWeight: 800, color: c.fg, background: c.bg, borderRadius: 6, padding: "3px 8px", textTransform: "uppercase", letterSpacing: 0.4, flexShrink: 0 }}>
      {status}
    </span>
  );
}

function NewScriptButton({ caseId, onCreated }: { caseId: string; onCreated: (s: HearingScript) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [hearingDate, setHearingDate] = useState("");
  const [court, setCourt] = useState("");
  const [division, setDivision] = useState("");
  const [judge, setJudge] = useState("");
  const [creating, setCreating] = useState(false);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        style={{ width: "100%", background: ORANGE, border: "none", borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", fontWeight: 800, fontSize: 14, color: "#000" }}>
        <Plus size={16} /> New Hearing Script
      </button>
    );
  }

  async function create() {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const s = await aiApi.hearingScripts.create({
        caseId, title: title.trim(),
        hearingDate: hearingDate || null, court: court.trim() || null,
        division: division.trim() || null, judge: judge.trim() || null,
      });
      onCreated(s);
    } finally {
      setCreating(false);
    }
  }

  const inputStyle: React.CSSProperties = { width: "100%", background: "#0a0a0a", border: "1px solid #252525", borderRadius: 10, padding: "10px 12px", fontSize: 14, color: "#fff", boxSizing: "border-box", marginBottom: 12 };
  const labelStyle: React.CSSProperties = { fontSize: 11.5, color: "#999", fontWeight: 700, marginBottom: 6 };

  return (
    <div style={{ background: "#111", border: `1px solid ${ORANGE}55`, borderRadius: 14, padding: 16 }}>
      <div style={labelStyle}>TITLE</div>
      <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder='e.g. "Sept 18 CR 59.05 Hearing"' style={inputStyle} />
      <div style={labelStyle}>HEARING DATE</div>
      <input type="date" value={hearingDate} onChange={e => setHearingDate(e.target.value)} style={inputStyle} />
      <div style={labelStyle}>COURT</div>
      <input value={court} onChange={e => setCourt(e.target.value)} placeholder="e.g. Fayette Circuit Court" style={inputStyle} />
      <div style={labelStyle}>DIVISION</div>
      <input value={division} onChange={e => setDivision(e.target.value)} placeholder="optional" style={inputStyle} />
      <div style={labelStyle}>JUDGE</div>
      <input value={judge} onChange={e => setJudge(e.target.value)} placeholder="optional" style={{ ...inputStyle, marginBottom: 16 }} />
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => setOpen(false)} style={{ flex: 1, background: "none", border: "1px solid #333", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 700, color: "#999", cursor: "pointer" }}>Cancel</button>
        <button onClick={create} disabled={!title.trim() || creating}
          style={{ flex: 1, background: title.trim() ? ORANGE : "#2a2a2a", border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 800, color: title.trim() ? "#000" : "#666", cursor: title.trim() ? "pointer" : "default" }}>
          {creating ? "Creating…" : "Create"}
        </button>
      </div>
    </div>
  );
}

function ScriptDetail({ caseId, script, onBack, onUpdated, onOpenReader }: {
  caseId: string; script: HearingScript; onBack: () => void;
  onUpdated: (s: HearingScript) => void; onOpenReader: () => void;
}) {
  const [genDocs, setGenDocs] = useState<Array<{ id: string; title: string }>>([]);
  const [uploadedDocs, setUploadedDocs] = useState<Array<{ id: string; fileName: string }>>([]);
  const [selectedGenIds, setSelectedGenIds] = useState<string[]>(script.sourceGeneratedDocIds);
  const [selectedUploadIds, setSelectedUploadIds] = useState<string[]>(script.sourceUploadedDocIds);
  const [generating, setGenerating] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPostHearing, setShowPostHearing] = useState(false);

  useEffect(() => {
    aiApi.generatedDocs.list(caseId).then(docs => setGenDocs(docs.map(d => ({ id: d.id, title: d.title })))).catch(() => {});
    aiApi.documents(caseId).then(docs => setUploadedDocs(docs.map(d => ({ id: d.id, fileName: d.fileName })))).catch(() => {});
  }, [caseId]);

  const deliveredCount = script.sections.filter(s => s.delivered).length;
  const hasSections = script.sections.length > 0;

  async function runGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const updated = await aiApi.hearingScripts.generate(script.id, {
        sourceGeneratedDocIds: selectedGenIds,
        sourceUploadedDocIds: selectedUploadIds,
      });
      onUpdated(updated);
    } catch (err) {
      setError((err as Error).message || "Generation failed — try again.");
    } finally {
      setGenerating(false);
      setConfirmRegen(false);
    }
  }

  function handleGenerateClick() {
    if (hasSections && deliveredCount > 0) { setConfirmRegen(true); return; }
    if (hasSections) { setConfirmRegen(true); return; }
    void runGenerate();
  }

  async function setStatus(status: HearingScript["status"]) {
    const updated = await aiApi.hearingScripts.update(script.id, { status });
    onUpdated({ ...updated, sections: script.sections });
    if (status === "delivered") setShowPostHearing(true);
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "20px 20px 160px" }}>
        <button onClick={onBack}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 18, display: "flex", alignItems: "center", gap: 6, color: "#666", fontSize: 13, fontWeight: 700 }}>
          <ArrowLeft size={15} /> Scripts
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{ fontSize: 18, fontWeight: 900, flex: 1, minWidth: 0 }}>{script.title}</div>
          <StatusBadge status={script.status} />
        </div>
        <div style={{ fontSize: 12.5, color: "#666", marginBottom: 20 }}>
          {fmtDate(script.hearingDate)}
          {script.court ? ` · ${script.court}` : ""}{script.judge ? ` · Judge ${script.judge}` : ""}
        </div>

        {(genDocs.length > 0 || uploadedDocs.length > 0) && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>SOURCE DOCUMENTS FOR THIS SCRIPT</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {genDocs.map(d => (
                <DocCheckbox key={d.id} label={d.title} checked={selectedGenIds.includes(d.id)}
                  onToggle={() => setSelectedGenIds(prev => prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id])} />
              ))}
              {uploadedDocs.map(d => (
                <DocCheckbox key={d.id} label={d.fileName} checked={selectedUploadIds.includes(d.id)}
                  onToggle={() => setSelectedUploadIds(prev => prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id])} />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div style={{ background: "#2a0f0f", border: "1px solid #5a1a1a", borderRadius: 10, padding: "10px 14px", marginBottom: 14, color: "#ff9a8a", fontSize: 12.5 }}>{error}</div>
        )}

        <button onClick={handleGenerateClick} disabled={generating}
          style={{ width: "100%", background: generating ? "#2a2a2a" : ORANGE, border: "none", borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: generating ? "default" : "pointer", fontWeight: 800, fontSize: 14, color: generating ? "#666" : "#000", marginBottom: 20 }}>
          <Sparkles size={16} /> {generating ? "Generating…" : hasSections ? "Regenerate Script" : "Generate Script"}
        </button>

        {confirmRegen && (
          <ConfirmRegenModal
            deliveredCount={deliveredCount}
            onCancel={() => setConfirmRegen(false)}
            onConfirm={runGenerate}
          />
        )}

        {generating && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 500 }} />
        )}

        {hasSections && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              {script.sections.map((sec, i) => (
                <SectionCard key={sec.id} index={i} section={sec}
                  onSave={async changes => {
                    const updated = await aiApi.hearingScripts.updateSection(script.id, sec.id, changes);
                    onUpdated({ ...script, sections: script.sections.map(s => (s.id === sec.id ? { ...s, ...updated } : s)) });
                  }} />
              ))}
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              {script.status === "draft" && (
                <button onClick={() => setStatus("ready")}
                  style={{ flex: 1, background: "#0f2a17", border: "1px solid #22c55e55", borderRadius: 12, padding: "12px", fontSize: 13.5, fontWeight: 800, color: "#22c55e", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <CheckCircle2 size={15} /> Mark Ready
                </button>
              )}
              {(script.status === "ready" || script.status === "delivered") && (
                <button onClick={onOpenReader}
                  style={{ flex: 1, background: "#111", border: `1px solid ${ORANGE}55`, borderRadius: 12, padding: "12px", fontSize: 13.5, fontWeight: 800, color: ORANGE, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <Presentation size={15} /> Courtroom Mode
                </button>
              )}
              {script.status === "ready" && (
                <button onClick={() => setStatus("delivered")}
                  style={{ flex: 1, background: "#0d1a2a", border: "1px solid #1a3060", borderRadius: 12, padding: "12px", fontSize: 13.5, fontWeight: 800, color: "#7ab0e0", cursor: "pointer" }}>
                  Mark Delivered
                </button>
              )}
            </div>
          </>
        )}

        {(script.status === "delivered" || showPostHearing) && (
          <PostHearingCapture script={script} onSaved={onUpdated} />
        )}
      </div>
    </div>
  );
}

function DocCheckbox({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      style={{ display: "flex", alignItems: "center", gap: 10, background: checked ? "#1a1200" : "#111", border: `1px solid ${checked ? ORANGE : "#1e1e1e"}`, borderRadius: 10, padding: "10px 12px", cursor: "pointer", textAlign: "left", width: "100%" }}>
      <div style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${checked ? ORANGE : "#444"}`, background: checked ? ORANGE : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {checked && <CheckCircle2 size={12} color="#000" />}
      </div>
      <FileText size={13} color="#666" style={{ flexShrink: 0 }} />
      <div style={{ fontSize: 13, color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
    </button>
  );
}

function ConfirmRegenModal({ deliveredCount, onCancel, onConfirm }: { deliveredCount: number; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={onCancel} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.72)" }} />
      <div style={{ position: "relative", zIndex: 1, background: "#111", border: "1px solid #222", borderRadius: 16, width: "min(360px, 100%)", padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <AlertCircle size={16} color="#f59e0b" />
          <span style={{ fontWeight: 800, fontSize: 14 }}>Regenerate this script?</span>
        </div>
        <div style={{ fontSize: 13, color: "#999", lineHeight: 1.5, marginBottom: 18 }}>
          {deliveredCount > 0
            ? `This will replace all sections, including ${deliveredCount} you've already marked delivered.`
            : "This will replace all current sections with a fresh version."}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, background: "none", border: "1px solid #333", borderRadius: 10, padding: "11px", fontSize: 13, fontWeight: 700, color: "#999", cursor: "pointer" }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, background: ORANGE, border: "none", borderRadius: 10, padding: "11px", fontSize: 13, fontWeight: 800, color: "#000", cursor: "pointer" }}>Regenerate</button>
        </div>
      </div>
    </div>
  );
}

function SectionCard({ index, section, onSave }: { index: number; section: HearingScriptSection; onSave: (changes: { heading?: string; body?: string }) => void }) {
  const [heading, setHeading] = useState(section.heading);
  const [body, setBody] = useState(section.body);

  const triggerColors: Record<HearingScriptSection["triggerType"], string> = {
    opening: "#7ab0e0", responsive: ORANGE, closing: "#22c55e", conditional: "#f59e0b",
  };

  return (
    <div style={{ background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 12, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: triggerColors[section.triggerType], textTransform: "uppercase", letterSpacing: 0.4 }}>
          {section.triggerType}
        </span>
        {section.delivered && <CheckCircle2 size={13} color="#22c55e" />}
      </div>
      <input value={heading} onChange={e => setHeading(e.target.value)} onBlur={() => heading !== section.heading && onSave({ heading })}
        style={{ width: "100%", background: "transparent", border: "none", fontWeight: 800, fontSize: 14.5, color: "#fff", padding: 0, marginBottom: 8, boxSizing: "border-box" }} />
      {section.conditionNote && (
        <div style={{ fontSize: 11.5, color: "#f59e0b", background: "#1f1400", borderRadius: 6, padding: "6px 8px", marginBottom: 8, lineHeight: 1.4 }}>
          Only if: {section.conditionNote}
        </div>
      )}
      <textarea value={body} onChange={e => setBody(e.target.value)} onBlur={() => body !== section.body && onSave({ body })}
        style={{ width: "100%", minHeight: 80, background: "#111", border: "1px solid #252525", borderRadius: 8, padding: "8px 10px", fontSize: 13.5, color: "#eee", lineHeight: 1.55, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
    </div>
  );
}

function PostHearingCapture({ script, onSaved }: { script: HearingScript; onSaved: (s: HearingScript) => void }) {
  const [me, setMe] = useState(script.postHearingSummaryMe ?? "");
  const [judge, setJudge] = useState(script.postHearingSummaryJudge ?? "");
  const [opposing, setOpposing] = useState(script.postHearingSummaryOpposingCounsel ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const updated = await aiApi.hearingScripts.postHearing(script.id, { me, judge, opposingCounsel: opposing });
      onSaved({ ...updated, sections: script.sections });
    } finally {
      setSaving(false);
    }
  }

  const taStyle: React.CSSProperties = { width: "100%", minHeight: 60, background: "#0a0a0a", border: "1px solid #252525", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "#eee", lineHeight: 1.5, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", marginBottom: 12 };
  const labelStyle: React.CSSProperties = { fontSize: 11.5, color: "#999", fontWeight: 700, marginBottom: 6 };

  return (
    <div style={{ background: "#0d1a2a", border: "1px solid #1a3060", borderRadius: 14, padding: 16, marginTop: 10 }}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>What actually happened</div>
      <div style={{ fontSize: 12, color: "#7ab0e0", lineHeight: 1.5, marginBottom: 14 }}>
        A quick plain-text record — useful later if something gets mischaracterized in an order.
      </div>
      <div style={labelStyle}>WHAT YOU SAID</div>
      <textarea value={me} onChange={e => setMe(e.target.value)} style={taStyle} />
      <div style={labelStyle}>WHAT THE JUDGE SAID</div>
      <textarea value={judge} onChange={e => setJudge(e.target.value)} style={taStyle} />
      <div style={labelStyle}>WHAT OPPOSING COUNSEL SAID</div>
      <textarea value={opposing} onChange={e => setOpposing(e.target.value)} style={taStyle} />
      <button onClick={save} disabled={saving}
        style={{ width: "100%", background: ORANGE, border: "none", borderRadius: 10, padding: "11px", fontSize: 13.5, fontWeight: 800, color: "#000", cursor: "pointer" }}>
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

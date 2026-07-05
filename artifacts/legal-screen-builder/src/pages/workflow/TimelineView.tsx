import { useState, useRef, useEffect, useCallback, MutableRefObject } from "react";
import { HLCase, TimelineEvent, TimelineSnapshot } from "../../types";
import { aiApi } from "../../lib/aiApi";
import { WorkflowStepper } from "../../components/WorkflowStepper";
import { WhyThisMatters } from "../../components/WhyThisMatters";
import { ChevronRight, Plus, Trash2, Edit2, Check, X, Zap, RotateCcw } from "lucide-react";

const ORANGE = "#f45d01";
const BG = "#0a0908";
const PANEL = "#111";
const LINE = "#1e1e1e";
const PAPER = "#f4efe8";

const MAX_HISTORY = 10;
const SNAPSHOT_INTERVAL_MS = 30_000;

interface Props {
  hlCase: HLCase;
  onUpdate: (c: HLCase) => void;
  onNext: () => void;
  onBack: () => void;
}

export function TimelineView({ hlCase, onUpdate, onNext, onBack }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>(
    hlCase.timeline.length > 0 ? hlCase.timeline : []
  );
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [addingNew, setAddingNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  // Stable refs — always hold latest values without recreating callbacks
  const hlCaseRef = useRef(hlCase) as MutableRefObject<HLCase>;
  hlCaseRef.current = hlCase;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnapshotAt = useRef<number>(Date.now());

  const hasStory = (hlCase.story ?? "").trim().length > 0;
  const hasEvents = events.length > 0;
  const history = hlCase.timelineHistory ?? [];

  // Stable scheduler — reads latest hlCase/onUpdate via refs, no hlCase in deps
  const scheduleAutoSave = useCallback((nextEvents: TimelineEvent[]) => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      const currentCase = hlCaseRef.current;
      const now = Date.now();
      const timeSinceSnapshot = now - lastSnapshotAt.current;
      const prevHistory = currentCase.timelineHistory ?? [];

      let nextHistory = prevHistory;
      if (timeSinceSnapshot >= SNAPSHOT_INTERVAL_MS && nextEvents.length > 0) {
        const snap: TimelineSnapshot = { snapshot: nextEvents, savedAt: now };
        nextHistory = [snap, ...prevHistory].slice(0, MAX_HISTORY);
        lastSnapshotAt.current = now;
      }

      onUpdateRef.current({ ...currentCase, timeline: nextEvents, timelineHistory: nextHistory });
    }, 800);
  }, []); // intentionally stable — reads latest via refs

  // Trigger auto-save whenever events array changes (but not on initial mount sync)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    scheduleAutoSave(events);
  }, [events, scheduleAutoSave]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, []);

  // ── AI Build ────────────────────────────────────────────────────────────────
  async function buildTimeline() {
    if (!hasStory) return;
    setBuilding(true); setBuildError("");
    try {
      const result = await aiApi.buildTimeline(hlCase.story, hlCase.id);
      if (result.events.length === 0) {
        setBuildError("The AI couldn't parse distinct events from your story. Try adding more detail and try again.");
        return;
      }
      const built: TimelineEvent[] = result.events.map((e, i) => ({
        id: crypto.randomUUID(), title: e.title, description: e.description, order: i,
      }));
      setEvents(built);
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e?.code === "rate_limited") {
        setBuildError("Daily AI limit reached. Add events manually for now, or try again tomorrow.");
      } else {
        setBuildError("Couldn't build the timeline — please try again.");
      }
    } finally {
      setBuilding(false);
    }
  }

  function saveEdit() {
    if (!editTitle.trim()) return;
    setEvents(prev => prev.map(e => e.id === editingId
      ? { ...e, title: editTitle.trim(), description: editDesc.trim() } : e
    ));
    setEditingId(null);
  }

  function deleteEvent(id: string) {
    setEvents(prev => prev.filter(e => e.id !== id).map((e, i) => ({ ...e, order: i })));
  }

  function addEvent() {
    if (!newTitle.trim()) return;
    const event: TimelineEvent = {
      id: crypto.randomUUID(), title: newTitle.trim(), description: newDesc.trim(), order: events.length,
    };
    setEvents(prev => [...prev, event]);
    setNewTitle(""); setNewDesc(""); setAddingNew(false);
  }

  function handleContinue() {
    const ordered = events.map((e, i) => ({ ...e, order: i }));
    // Save final snapshot
    const now = Date.now();
    const snap: TimelineSnapshot = { snapshot: ordered, savedAt: now };
    const nextHistory = [snap, ...(hlCase.timelineHistory ?? [])].slice(0, MAX_HISTORY);
    onUpdate({ ...hlCase, timeline: ordered, timelineHistory: nextHistory, workflowStage: "documents" });
    onNext();
  }

  function restoreVersion(snap: TimelineSnapshot) {
    setEvents(snap.snapshot.map((e, i) => ({ ...e, order: i })));
    setShowHistory(false);
  }

  function formatSnapTime(ms: number) {
    return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "#1a1815", border: "1px solid #2a2521", borderRadius: 10,
    padding: "10px 14px", color: PAPER, fontSize: 14, fontFamily: "inherit",
    outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: BG, color: PAPER, minHeight: 0 }}>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "28px 20px 16px" }}>

          {/* Back */}
          <button onClick={onBack} style={{ background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer", padding: "0 0 20px", display: "flex", alignItems: "center", gap: 6 }}>
            ← Back to Story
          </button>

          {/* Progress stepper */}
          <WorkflowStepper current="timeline" />

          {/* Header */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.5, marginBottom: 8 }}>Review the timeline</div>
            <div style={{ color: "#666", fontSize: 14, lineHeight: 1.65 }}>
              The AI will separate your story into chronological events. Review, edit, and reorder them before continuing. These events become the foundation of your case.
            </div>
          </div>

          {/* Why this matters */}
          <WhyThisMatters>
            Courts think in chronology — complaints are organized around a sequence of events, each with a legal significance. A well-ordered timeline makes it easier to identify which constitutional rights were violated at each moment, and helps the AI draft a stronger complaint.
          </WhyThisMatters>

          {/* Story preview */}
          {hasStory && (
            <div style={{ background: "#0f0d0c", border: `1px solid ${LINE}`, borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 8, textTransform: "uppercase" }}>Your Story</div>
              <div style={{ fontSize: 13, color: "#666", lineHeight: 1.65, maxHeight: 80, overflow: "hidden" }}>
                {hlCase.story.slice(0, 200)}{hlCase.story.length > 200 ? "…" : ""}
              </div>
            </div>
          )}

          {/* Build button */}
          {hasStory && !hasEvents && !building && (
            <button
              onClick={buildTimeline}
              style={{ width: "100%", background: `${ORANGE}18`, border: `1px solid ${ORANGE}55`, borderRadius: 14, padding: "17px", color: ORANGE, fontSize: 15, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 20 }}>
              <Zap size={18} /> Build Timeline with AI
            </button>
          )}

          {/* Rebuild button — confirms before overwriting manual edits */}
          {hasStory && hasEvents && (
            <button
              onClick={() => {
                if (!building) {
                  const ok = window.confirm("Rebuilding will replace your current timeline events. Any manual edits will be lost. Continue?");
                  if (!ok) return;
                  buildTimeline();
                }
              }}
              disabled={building}
              style={{ width: "100%", background: "none", border: `1px solid ${LINE}`, borderRadius: 12, padding: "11px", color: "#555", fontSize: 13, cursor: building ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 20 }}>
              {building ? "Rebuilding…" : <><Zap size={13} /> Rebuild from Story</>}
            </button>
          )}

          {/* Building spinner */}
          {building && !hasEvents && (
            <div style={{ textAlign: "center", padding: "32px", color: "#555" }}>
              <div style={{ fontSize: 13 }}>Building timeline…</div>
            </div>
          )}

          {buildError && (
            <div style={{ color: "#f87171", fontSize: 13, marginBottom: 16, background: "#1a0e0e", border: "1px solid #3a1a1a", borderRadius: 10, padding: "12px 16px" }}>{buildError}</div>
          )}

          {/* Events list */}
          {events.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              {events.map((event, idx) => (
                editingId === event.id ? (
                  <div key={event.id} style={{ background: "#0f0d0c", border: `1px solid ${ORANGE}44`, borderRadius: 14, padding: "16px", marginBottom: 10 }}>
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 11, color: "#555", fontWeight: 700, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>Event Title</label>
                      <input style={inputStyle} value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Brief event name" />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 11, color: "#555", fontWeight: 700, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>Description</label>
                      <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="What happened during this event?" />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={saveEdit} style={{ flex: 1, background: ORANGE, border: "none", borderRadius: 10, padding: "11px", color: "#000", fontWeight: 800, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                        <Check size={14} /> Save
                      </button>
                      <button onClick={() => setEditingId(null)} style={{ background: "none", border: `1px solid ${LINE}`, borderRadius: 10, padding: "11px 14px", color: "#555", cursor: "pointer" }}>
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={event.id} style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 14, padding: "14px 16px", marginBottom: 8, display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, paddingTop: 2, flexShrink: 0 }}>
                      <div style={{ width: 24, height: 24, borderRadius: 12, background: `${ORANGE}18`, border: `1px solid ${ORANGE}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: ORANGE }}>
                        {idx + 1}
                      </div>
                      {idx < events.length - 1 && <div style={{ width: 1, height: 16, background: LINE }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: event.description ? 4 : 0, color: PAPER }}>{event.title}</div>
                      {event.description && <div style={{ fontSize: 13, color: "#888", lineHeight: 1.55 }}>{event.description}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => { setEditingId(event.id); setEditTitle(event.title); setEditDesc(event.description); }} style={{ background: "none", border: `1px solid ${LINE}`, borderRadius: 8, padding: "6px 9px", color: "#666", cursor: "pointer" }}>
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => deleteEvent(event.id)} style={{ background: "none", border: "1px solid #2a1a1a", borderRadius: 8, padding: "6px 9px", color: "#633", cursor: "pointer" }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )
              ))}
            </div>
          )}

          {/* Version history link */}
          {history.length > 0 && (
            <button onClick={() => setShowHistory(true)} style={{ background: "none", border: "none", color: "#555", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, marginBottom: 12 }}>
              <RotateCcw size={12} /> Restore previous timeline version
            </button>
          )}

          {/* Add event manually */}
          {addingNew ? (
            <div style={{ background: "#0f0d0c", border: `1px solid ${LINE}`, borderRadius: 14, padding: "16px", marginBottom: 16 }}>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: "#555", fontWeight: 700, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>Event Title</label>
                <input style={inputStyle} value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Brief event name" />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: "#555", fontWeight: 700, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>Description</label>
                <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="What happened during this event?" />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={addEvent} disabled={!newTitle.trim()} style={{ flex: 1, background: newTitle.trim() ? ORANGE : "#1a1a1a", border: "none", borderRadius: 10, padding: "11px", color: newTitle.trim() ? "#000" : "#444", fontWeight: 800, cursor: newTitle.trim() ? "pointer" : "default", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                  <Check size={14} /> Add Event
                </button>
                <button onClick={() => { setAddingNew(false); setNewTitle(""); setNewDesc(""); }} style={{ background: "none", border: `1px solid ${LINE}`, borderRadius: 10, padding: "11px 14px", color: "#555", cursor: "pointer" }}>
                  <X size={14} />
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAddingNew(true)} style={{ width: "100%", border: `1px dashed ${LINE}`, borderRadius: 12, padding: "13px", background: "transparent", color: "#444", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 16 }}>
              <Plus size={14} /> Add Event Manually
            </button>
          )}

          {!hasStory && !hasEvents && (
            <div style={{ textAlign: "center", padding: "24px", color: "#555", fontSize: 14, marginBottom: 16 }}>
              Go back and tell your story first — the AI needs your narrative to build a timeline.
            </div>
          )}
        </div>
      </div>

      {/* Sticky bottom buttons */}
      <div style={{
        background: BG, borderTop: `1px solid ${LINE}`,
        padding: "16px 20px",
        paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
        flexShrink: 0,
      }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <button
            onClick={handleContinue}
            disabled={events.length === 0}
            style={{
              width: "100%",
              background: events.length > 0 ? `linear-gradient(90deg, ${ORANGE}, #ff8c00)` : "#1a1a1a",
              border: "none", borderRadius: 14, padding: "17px",
              color: events.length > 0 ? "#000" : "#444",
              fontSize: 16, fontWeight: 900,
              cursor: events.length > 0 ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "all 0.2s",
            }}>
            Review & Continue <ChevronRight size={18} />
          </button>
          <button onClick={onNext} style={{ width: "100%", background: "none", border: "none", color: "#444", fontSize: 13, cursor: "pointer", marginTop: 10, padding: "10px" }}>
            Skip for now
          </button>
        </div>
      </div>

      {/* Version history drawer */}
      {showHistory && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.85)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}
          onClick={e => { if (e.target === e.currentTarget) setShowHistory(false); }}>
          <div style={{ background: "#0f0d0c", borderRadius: "20px 20px 0 0", border: "1px solid #1e1e1e", borderBottom: "none", maxHeight: "70vh", display: "flex", flexDirection: "column", maxWidth: 600, width: "100%", margin: "0 auto" }}>
            <div style={{ padding: "18px 20px 12px", borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: ORANGE }}>Previous Versions</div>
              <button onClick={() => setShowHistory(false)} style={{ background: "none", border: "none", color: "#555", cursor: "pointer" }}><X size={18} /></button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 20px" }}>
              {history.map((snap, i) => (
                <div key={i} style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: "#555", fontWeight: 700, marginBottom: 6 }}>
                    {formatSnapTime(snap.savedAt)} · {snap.snapshot.length} event{snap.snapshot.length !== 1 ? "s" : ""}
                  </div>
                  <div style={{ fontSize: 13, color: "#888", lineHeight: 1.6, marginBottom: 10 }}>
                    {snap.snapshot.slice(0, 3).map(e => e.title).join(" → ")}{snap.snapshot.length > 3 ? ` → +${snap.snapshot.length - 3} more` : ""}
                  </div>
                  <button onClick={() => restoreVersion(snap)} style={{ background: ORANGE, border: "none", borderRadius: 8, padding: "8px 16px", color: "#000", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                    Restore this version
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

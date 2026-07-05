import { useState } from "react";
import { HLCase, IntakeChecklistItem, IntakeChecklistKey } from "../../types";
import { ChevronDown, ChevronUp, Check } from "lucide-react";

const ORANGE = "#f45d01";
const LINE = "#1e1e1e";
const PANEL = "#111";
const PAPER = "#f4efe8";

const CHECKLIST_META: Record<IntakeChecklistKey, { label: string; description: string; emoji: string; prompt: string }> = {
  witnesses: {
    label: "Witnesses",
    description: "People who saw what happened",
    emoji: "👥",
    prompt: "Names, contact info, or descriptions of anyone who witnessed the incident",
  },
  photos: {
    label: "Photos",
    description: "Still images related to the incident",
    emoji: "📷",
    prompt: "Describe what photos you have or where to find them",
  },
  video: {
    label: "Video Footage",
    description: "Any video recordings of the incident",
    emoji: "🎥",
    prompt: "Describe video recordings — security cameras, cell phone footage, surveillance",
  },
  audio: {
    label: "Audio Recordings",
    description: "Voice recordings, 911 calls, radio dispatch",
    emoji: "🎙️",
    prompt: "Describe any audio recordings and how to obtain them",
  },
  medical_records: {
    label: "Medical Records",
    description: "Injuries, treatment, diagnoses",
    emoji: "🏥",
    prompt: "List any medical treatment sought, injuries documented, or providers involved",
  },
  police_reports: {
    label: "Police Reports",
    description: "Official incident reports filed",
    emoji: "📋",
    prompt: "Report number, date filed, department — notes on how to obtain",
  },
  body_camera: {
    label: "Body Camera Footage",
    description: "Officer-worn camera recordings",
    emoji: "📹",
    prompt: "Officer names/badge numbers — note whether you've submitted a public records request",
  },
  prior_incidents: {
    label: "Prior Incidents",
    description: "Related or pattern incidents",
    emoji: "📁",
    prompt: "Describe any prior incidents involving the same parties or similar conduct",
  },
  property_damage: {
    label: "Property Damage",
    description: "Damaged or seized property",
    emoji: "🔧",
    prompt: "Describe property lost or damaged — value estimates, photos, receipts",
  },
  financial_loss: {
    label: "Financial Loss",
    description: "Income lost or costs incurred",
    emoji: "💰",
    prompt: "Estimate financial impact — lost wages, medical bills, legal costs",
  },
  emotional_harm: {
    label: "Emotional Harm",
    description: "Psychological impact documented",
    emoji: "🧠",
    prompt: "Describe psychological or emotional impact — therapy, diagnosis, impact on daily life",
  },
  filing_deadlines: {
    label: "Filing Deadlines",
    description: "Statutes of limitations and deadlines",
    emoji: "📅",
    prompt: "Note any known deadlines — e.g. notice of claim requirements, statute of limitations",
  },
};

const ALL_KEYS = Object.keys(CHECKLIST_META) as IntakeChecklistKey[];

interface Props {
  hlCase: HLCase;
  onUpdate: (c: HLCase) => void;
}

export function IntakeChecklistView({ hlCase, onUpdate }: Props) {
  const [expandedKey, setExpandedKey] = useState<IntakeChecklistKey | null>(null);
  const [draftNotes, setDraftNotes] = useState<Partial<Record<IntakeChecklistKey, string>>>({});

  // Build a lookup from existing checklist
  const checklistMap: Partial<Record<IntakeChecklistKey, IntakeChecklistItem>> = {};
  for (const item of hlCase.intakeChecklist) {
    checklistMap[item.key] = item;
  }

  const completedCount = ALL_KEYS.filter(k => checklistMap[k]?.completed).length;
  const pct = Math.round((completedCount / ALL_KEYS.length) * 100);

  function getItem(key: IntakeChecklistKey): IntakeChecklistItem {
    return checklistMap[key] ?? { key, completed: false, notes: "" };
  }

  function updateItem(key: IntakeChecklistKey, changes: Partial<IntakeChecklistItem>) {
    const existing = getItem(key);
    const updated = { ...existing, ...changes };
    const others = hlCase.intakeChecklist.filter(i => i.key !== key);
    onUpdate({ ...hlCase, intakeChecklist: [...others, updated] });
  }

  function toggleCompleted(key: IntakeChecklistKey) {
    const item = getItem(key);
    updateItem(key, { completed: !item.completed });
  }

  function saveNotes(key: IntakeChecklistKey) {
    const notes = draftNotes[key] ?? getItem(key).notes;
    updateItem(key, { notes, completed: notes.trim().length > 0 || getItem(key).completed });
    setExpandedKey(null);
  }

  function handleExpand(key: IntakeChecklistKey) {
    if (expandedKey === key) {
      setExpandedKey(null);
    } else {
      setExpandedKey(key);
      setDraftNotes(prev => ({ ...prev, [key]: getItem(key).notes }));
    }
  }

  return (
    <div>
      {/* Progress bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: "#888", fontWeight: 700 }}>Evidence Checklist</span>
          <span style={{ fontSize: 12, color: pct === 100 ? "#4ade80" : ORANGE, fontWeight: 800 }}>{completedCount}/{ALL_KEYS.length} complete ({pct}%)</span>
        </div>
        <div style={{ height: 4, background: "#1a1815", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${ORANGE}, #ff8c00)`, borderRadius: 2, transition: "width 0.3s ease" }} />
        </div>
      </div>

      {/* Description */}
      <div style={{ fontSize: 13, color: "#555", lineHeight: 1.65, marginBottom: 20 }}>
        Check off the evidence types you've documented. Tap each item to add notes on where to find it or how to preserve it.
      </div>

      {/* Checklist items */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {ALL_KEYS.map(key => {
          const meta = CHECKLIST_META[key];
          const item = getItem(key);
          const isExpanded = expandedKey === key;
          const notes = draftNotes[key] ?? item.notes;

          return (
            <div key={key}>
              <div style={{ background: PANEL, border: `1px solid ${item.completed ? "#1e3a1a" : LINE}`, borderRadius: isExpanded ? "12px 12px 0 0" : 12, overflow: "hidden", transition: "border-color 0.2s" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" }}>
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleCompleted(key)}
                    style={{ width: 22, height: 22, borderRadius: 11, border: `2px solid ${item.completed ? "#4ade80" : "#333"}`, background: item.completed ? "#1a3a1a" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, transition: "all 0.2s" }}
                  >
                    {item.completed && <Check size={12} color="#4ade80" />}
                  </button>

                  {/* Emoji + label */}
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{meta.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: item.completed ? "#4ade80" : PAPER, lineHeight: 1.2 }}>{meta.label}</div>
                    <div style={{ fontSize: 12, color: "#555", marginTop: 1 }}>
                      {item.notes ? <span style={{ color: "#666" }}>{item.notes.slice(0, 50)}{item.notes.length > 50 ? "…" : ""}</span> : meta.description}
                    </div>
                  </div>

                  {/* Expand toggle */}
                  <button onClick={() => handleExpand(key)} style={{ background: "none", border: "none", color: "#444", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", flexShrink: 0 }}>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
              </div>

              {/* Expanded notes form */}
              {isExpanded && (
                <div style={{ background: "#0f0d0c", border: `1px solid ${LINE}`, borderTop: "none", borderRadius: "0 0 12px 12px", padding: "14px 16px" }}>
                  <label style={{ fontSize: 11, color: "#555", fontWeight: 700, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>
                    {meta.prompt}
                  </label>
                  <textarea
                    value={notes}
                    onChange={e => setDraftNotes(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder={`e.g. ${meta.prompt.toLowerCase()}`}
                    style={{ width: "100%", background: "#1a1815", border: `1px solid #2a2521`, borderRadius: 10, padding: "10px 14px", color: PAPER, fontSize: 13, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box", minHeight: 72, lineHeight: 1.6 }}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button onClick={() => saveNotes(key)} style={{ flex: 1, background: ORANGE, border: "none", borderRadius: 10, padding: "10px", color: "#000", fontWeight: 800, cursor: "pointer", fontSize: 13 }}>
                      Save Notes
                    </button>
                    <button onClick={() => setExpandedKey(null)} style={{ background: "none", border: `1px solid ${LINE}`, borderRadius: 10, padding: "10px 14px", color: "#555", cursor: "pointer", fontSize: 13 }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

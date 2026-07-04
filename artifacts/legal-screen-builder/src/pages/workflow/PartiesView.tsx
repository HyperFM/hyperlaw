import { useState } from "react";
import { HLCase, Party, PartyType } from "../../types";
import { assignNickname } from "../../lib/nicknames";
import { ChevronRight, Plus, Trash2, User, Shield, Edit2, Check, X } from "lucide-react";

const ORANGE = "#f45d01";
const BG = "#0a0908";
const PANEL = "#111";
const LINE = "#1e1e1e";
const PAPER = "#f4efe8";

interface Props {
  hlCase: HLCase;
  onUpdate: (c: HLCase) => void;
  onNext: () => void;
  onBack: () => void;
}

type FormState = {
  firstName: string;
  lastName: string;
  type: PartyType;
  agency: string;
  title: string;
  badge: string;
  officialLocation: string;
};

const BLANK_FORM: FormState = {
  firstName: "",
  lastName: "",
  type: "civilian",
  agency: "",
  title: "",
  badge: "",
  officialLocation: "",
};

const DOE_NAMES = ["John Doe", "Jane Doe"];

function isDoe(p: Party): boolean {
  const full = `${p.firstName} ${p.lastName}`.trim();
  return DOE_NAMES.some(d => d.toLowerCase() === full.toLowerCase());
}

export function PartiesView({ hlCase, onUpdate, onNext, onBack }: Props) {
  const [showForm, setShowForm] = useState(hlCase.parties.length === 0);
  const [form, setForm] = useState<FormState>(BLANK_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(BLANK_FORM);
  const [formError, setFormError] = useState("");

  const usedNicknames = hlCase.parties.map(p => p.nickname);

  function validateForm(f: FormState): string {
    if (!f.firstName.trim()) return "First name is required.";
    if (!f.lastName.trim()) return "Last name is required.";
    if (f.type === "official" && !f.agency.trim()) return "Agency is required for officials.";
    return "";
  }

  function saveNewParty() {
    const err = validateForm(form);
    if (err) { setFormError(err); return; }
    const { word, emoji } = assignNickname(usedNicknames);
    const party: Party = {
      id: crypto.randomUUID(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      type: form.type,
      ...(form.type === "official" ? {
        agency: form.agency.trim(),
        title: form.title.trim() || undefined,
        badge: form.badge.trim() || undefined,
        officialLocation: form.officialLocation.trim() || undefined,
      } : {}),
      nickname: word,
      nicknameEmoji: emoji,
    };
    onUpdate({ ...hlCase, parties: [...hlCase.parties, party] });
    setForm(BLANK_FORM);
    setFormError("");
    setShowForm(false);
  }

  function saveEdit(id: string) {
    const err = validateForm(editForm);
    if (err) { setFormError(err); return; }
    const updated = hlCase.parties.map(p => p.id !== id ? p : {
      ...p,
      firstName: editForm.firstName.trim(),
      lastName: editForm.lastName.trim(),
      type: editForm.type,
      agency: editForm.type === "official" ? editForm.agency.trim() : undefined,
      title: editForm.type === "official" ? editForm.title.trim() || undefined : undefined,
      badge: editForm.type === "official" ? editForm.badge.trim() || undefined : undefined,
      officialLocation: editForm.type === "official" ? editForm.officialLocation.trim() || undefined : undefined,
    });
    onUpdate({ ...hlCase, parties: updated });
    setEditingId(null);
    setFormError("");
  }

  function deleteParty(id: string) {
    onUpdate({ ...hlCase, parties: hlCase.parties.filter(p => p.id !== id) });
  }

  function startEdit(p: Party) {
    setEditingId(p.id);
    setEditForm({
      firstName: p.firstName,
      lastName: p.lastName,
      type: p.type,
      agency: p.agency ?? "",
      title: p.title ?? "",
      badge: p.badge ?? "",
      officialLocation: p.officialLocation ?? "",
    });
    setFormError("");
  }

  const hasDoe = hlCase.parties.some(isDoe);

  return (
    <div style={{ flex: 1, overflowY: "auto", background: BG, color: PAPER }}>
      <div style={{ maxWidth: 540, margin: "0 auto", padding: "28px 20px 120px" }}>

        {/* Header */}
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer", padding: "0 0 20px", display: "flex", alignItems: "center", gap: 6 }}>
          ← Back to Case
        </button>

        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, color: ORANGE, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8, textTransform: "uppercase" }}>Phase 1 of 4</div>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.5, marginBottom: 8 }}>Who was involved?</div>
          <div style={{ color: "#666", fontSize: 14, lineHeight: 1.65 }}>
            Add everyone involved in this matter — officers, witnesses, defendants, or any civilian. Each person gets a voice-friendly nickname to make dictation easier.
          </div>
        </div>

        {/* Existing parties */}
        {hlCase.parties.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            {hlCase.parties.map(p => (
              editingId === p.id ? (
                <PartyForm
                  key={p.id}
                  form={editForm}
                  onChange={setEditForm}
                  error={formError}
                  onSave={() => saveEdit(p.id)}
                  onCancel={() => { setEditingId(null); setFormError(""); }}
                  saveLabel="Save Changes"
                />
              ) : (
                <PartyCard key={p.id} party={p} onEdit={() => startEdit(p)} onDelete={() => deleteParty(p.id)} />
              )
            ))}
          </div>
        )}

        {/* Doe disclosure */}
        {hasDoe && (
          <div style={{ background: "#100e00", border: "1px solid #3a3000", borderRadius: 12, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#9c8c00", lineHeight: 1.6 }}>
            <strong>Note:</strong> Use Doe placeholders only when a person's identity is genuinely unknown. Officials can often be identified later through discovery. This is informational only and not legal advice.
          </div>
        )}

        {/* Add party form */}
        {showForm && editingId === null && (
          <PartyForm
            form={form}
            onChange={setForm}
            error={formError}
            onSave={saveNewParty}
            onCancel={hlCase.parties.length > 0 ? () => { setShowForm(false); setFormError(""); } : undefined}
            saveLabel="Add Person"
          />
        )}

        {/* Add person button */}
        {!showForm && editingId === null && (
          <button
            onClick={() => { setShowForm(true); setForm(BLANK_FORM); setFormError(""); }}
            style={{ width: "100%", border: `1px dashed ${ORANGE}55`, borderRadius: 14, padding: "16px", background: "transparent", color: ORANGE, fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 28 }}>
            <Plus size={16} /> Add Another Person
          </button>
        )}

        {/* Continue button */}
        {!showForm && editingId === null && hlCase.parties.length > 0 && (
          <button
            onClick={onNext}
            style={{ width: "100%", background: `linear-gradient(90deg, ${ORANGE}, #ff8c00)`, border: "none", borderRadius: 14, padding: "17px", color: "#000", fontSize: 16, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            Continue to Court Selection <ChevronRight size={18} />
          </button>
        )}

        {/* Skip for now */}
        {!showForm && editingId === null && hlCase.parties.length === 0 && (
          <button
            onClick={onNext}
            style={{ width: "100%", background: "none", border: `1px solid ${LINE}`, borderRadius: 14, padding: "14px", color: "#555", fontSize: 14, cursor: "pointer", marginTop: 12 }}>
            Skip for now
          </button>
        )}
      </div>
    </div>
  );
}

function PartyCard({ party, onEdit, onDelete }: { party: Party; onEdit: () => void; onDelete: () => void }) {
  const fullName = `${party.firstName} ${party.lastName}`;
  return (
    <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 14, padding: "16px", marginBottom: 10, display: "flex", alignItems: "flex-start", gap: 14 }}>
      <div style={{ width: 44, height: 44, borderRadius: 22, background: "#1a1a1a", border: `1px solid ${party.type === "official" ? "#2a3a4a" : "#2a2521"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
        {party.nicknameEmoji}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ fontWeight: 800, fontSize: 16, color: PAPER }}>{party.nickname}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: party.type === "official" ? "#3b82f6" : "#555", background: party.type === "official" ? "#0a1a2a" : "#111", border: `1px solid ${party.type === "official" ? "#2a4a6a" : "#2a2521"}`, borderRadius: 4, padding: "1px 6px", textTransform: "uppercase", letterSpacing: 0.5 }}>
            {party.type === "official" ? <><Shield size={9} style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }} />Official</> : <><User size={9} style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }} />Civilian</>}
          </span>
        </div>
        <div style={{ fontSize: 13, color: "#888", marginBottom: party.agency ? 2 : 0 }}>{fullName}</div>
        {party.agency && <div style={{ fontSize: 12, color: "#555" }}>{party.title ? `${party.title}, ` : ""}{party.agency}{party.badge ? ` · Badge ${party.badge}` : ""}</div>}
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button onClick={onEdit} style={{ background: "none", border: `1px solid ${LINE}`, borderRadius: 8, padding: "6px 10px", color: "#666", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
          <Edit2 size={13} />
        </button>
        <button onClick={onDelete} style={{ background: "none", border: "1px solid #2a1a1a", borderRadius: 8, padding: "6px 10px", color: "#633", cursor: "pointer", display: "flex", alignItems: "center" }}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

function PartyForm({ form, onChange, error, onSave, onCancel, saveLabel }: {
  form: FormState;
  onChange: (f: FormState) => void;
  error: string;
  onSave: () => void;
  onCancel?: () => void;
  saveLabel: string;
}) {
  const f = (field: keyof FormState, value: string) => onChange({ ...form, [field]: value });
  const inputStyle: React.CSSProperties = {
    width: "100%", background: "#1a1815", border: "1px solid #2a2521", borderRadius: 10,
    padding: "12px 14px", color: "#f4efe8", fontSize: 14, fontFamily: "inherit",
    outline: "none", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, color: "#666", fontWeight: 700, letterSpacing: 0.4, display: "block", marginBottom: 6, textTransform: "uppercase" };

  return (
    <div style={{ background: "#0f0d0c", border: `1px solid ${ORANGE}44`, borderRadius: 16, padding: "20px", marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: ORANGE, marginBottom: 18, letterSpacing: 0.3 }}>ADD PERSON</div>

      {/* Name row */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>First Name</label>
          <input style={inputStyle} value={form.firstName} onChange={e => f("firstName", e.target.value)} placeholder="First name or 'John'" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Last Name</label>
          <input style={inputStyle} value={form.lastName} onChange={e => f("lastName", e.target.value)} placeholder="Last name or 'Doe'" />
        </div>
      </div>

      {/* Type toggle */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Role</label>
        <div style={{ display: "flex", gap: 8 }}>
          {(["civilian", "official"] as PartyType[]).map(t => (
            <button key={t} onClick={() => f("type", t)} style={{
              flex: 1, padding: "10px", border: `1px solid ${form.type === t ? ORANGE : LINE}`,
              borderRadius: 10, background: form.type === t ? `${ORANGE}18` : "#111",
              color: form.type === t ? ORANGE : "#666", fontWeight: 700, fontSize: 13,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              {t === "official" ? <Shield size={14} /> : <User size={14} />}
              {t === "official" ? "Official" : "Civilian"}
            </button>
          ))}
        </div>
      </div>

      {/* Official fields */}
      {form.type === "official" && (
        <>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Agency <span style={{ color: ORANGE }}>*</span></label>
            <input style={inputStyle} value={form.agency} onChange={e => f("agency", e.target.value)} placeholder="e.g. Metro Police Department" />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Title (optional)</label>
            <input style={inputStyle} value={form.title} onChange={e => f("title", e.target.value)} placeholder="e.g. Officer, Sergeant, Detective" />
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Badge # (if known)</label>
              <input style={inputStyle} value={form.badge} onChange={e => f("badge", e.target.value)} placeholder="Optional" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Location (if known)</label>
              <input style={inputStyle} value={form.officialLocation} onChange={e => f("officialLocation", e.target.value)} placeholder="Optional" />
            </div>
          </div>
        </>
      )}

      {error && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onSave} style={{ flex: 1, background: ORANGE, border: "none", borderRadius: 10, padding: "13px", color: "#000", fontWeight: 800, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Check size={15} /> {saveLabel}
        </button>
        {onCancel && (
          <button onClick={onCancel} style={{ background: "none", border: `1px solid ${LINE}`, borderRadius: 10, padding: "13px 16px", color: "#555", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            <X size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

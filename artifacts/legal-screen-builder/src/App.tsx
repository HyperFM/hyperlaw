import React, { useState, useEffect, useRef, useCallback } from "react";
import { useClerk, useUser } from "@clerk/react";
import {
  Home, Folder, Plus, GraduationCap, User, ChevronRight, ChevronLeft,
  X, Edit3, Trash2, ArrowRight, Key, Clock, AlertCircle, BookOpen,
  Settings, Star, Brain, Sliders, History, Archive, Copy, Check,
  FileText, Calendar, MapPin, Bell, Tag, ExternalLink, CheckCircle2,
  Download, MessageSquare, Shield, Loader2, Send, Upload, Eye, Lock,
} from "lucide-react";
import { Incident, HLCase, AppData, Reminder, IncidentCategory, CaseStatus } from "./types";
import {
  loadData, saveData, addIncident, updateIncident, deleteIncident,
  addCase, updateCase, deleteCase, addIncidentToCase,
  addReminder, deleteReminder,
} from "./store";
import { staticTutorService, TutorAnalysis } from "./services/tutor";
import { aiApi, AiChatMessage, ServerGeneratedDoc, CreditProduct } from "./lib/aiApi";
import { COMPLIANCE } from "./lib/compliance";
import CreditShopModal from "./components/CreditShopModal";
import NotificationBell from "./components/NotificationBell";
import AdminPanel from "./components/AdminPanel";
import WelcomeModal from "./components/WelcomeModal";
import PreVerificationModal from "./components/PreVerificationModal";
import DocGenConfirmModal from "./components/DocGenConfirmModal";
import SupportModal from "./components/SupportModal";
import DocumentViewerModal from "./components/DocumentViewerModal";
import UserChatDrawer from "./components/UserChatDrawer";
import { exportIncidentPDF, exportCasePDF } from "./lib/pdfExport";

const ADMIN_EMAIL = "hyperlawcompliance@gmail.com";

// ─── Constants ────────────────────────────────────────────────────────────────
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const ORANGE = "#d9711f";
const BG = "#0a0a0a";

const CATEGORY_LABELS: Record<IncidentCategory, string> = {
  employment: "Employment",
  police: "Police / Law Enforcement",
  court: "Court / Appeals",
  other: "Other",
};

const CATEGORY_COLORS: Record<IncidentCategory, string> = {
  employment: "#3b82f6",
  police: "#ef4444",
  court: "#8b5cf6",
  other: "#6b7280",
};

const STATUS_LABELS: Record<CaseStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  closed: "Closed",
};

const STATUS_COLORS: Record<CaseStatus, string> = {
  open: ORANGE,
  in_progress: "#3b82f6",
  closed: "#555",
};

const TEMPLATES = [
  {
    id: "1983",
    title: "42 U.S.C. § 1983 Civil Rights Complaint",
    description: "General template for federal civil rights claims against state actors.",
    url: "https://www.uscourts.gov/forms/civil-forms",
    categories: ["police", "other"] as IncidentCategory[],
  },
  {
    id: "eeoc",
    title: "EEOC Charge of Discrimination",
    description: "File a formal charge with the Equal Employment Opportunity Commission.",
    url: "https://www.eeoc.gov/how-charge-filed",
    categories: ["employment"] as IncidentCategory[],
  },
  {
    id: "pro_se",
    title: "Pro Se Plaintiff's Packet",
    description: "Federal court packet for self-represented litigants including the civil cover sheet.",
    url: "https://www.uscourts.gov/forms",
    categories: ["police", "employment", "court", "other"] as IncidentCategory[],
  },
  {
    id: "appeal",
    title: "Notice of Appeal (Federal)",
    description: "Form to appeal a federal district court decision to the circuit court.",
    url: "https://www.uscourts.gov/forms/appellate-forms",
    categories: ["court"] as IncidentCategory[],
  },
];

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

function formatEventDate(d: string) {
  if (!d) return null;
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function daysUntil(dueDate: string): number {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + "T00:00:00");
  return Math.ceil((due.getTime() - now.getTime()) / 86400000);
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
interface NewIncidentSavePayload {
  title: string;
  description: string;
  dateOfEvent: string;
  location: string;
  category: IncidentCategory;
}

function NewIncidentOverlay({ onSave, onClose, preLinkedCaseName }: {
  onSave: (p: NewIncidentSavePayload) => void;
  onClose: () => void;
  preLinkedCaseName?: string;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dateOfEvent, setDateOfEvent] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState<IncidentCategory>("other");
  const [visible, setVisible] = useState(false);
  const [tab, setTab] = useState<"write" | "upload">("write");
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const dragCurrentY = useRef(0);
  const isDraggingSheet = useRef(false);
  const [sheetDragY, setSheetDragY] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 20);
    return () => clearTimeout(t);
  }, []);

  function handleSave() {
    const t = title.trim() || description.trim().split("\n")[0].slice(0, 70) || "Untitled Incident";
    onSave({ title: t, description: description.trim(), dateOfEvent, location: location.trim(), category });
  }

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 320);
  }

  function onHandlePointerDown(e: React.PointerEvent) {
    isDraggingSheet.current = true;
    dragStartY.current = e.clientY;
    dragCurrentY.current = e.clientY;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }
  function onHandlePointerMove(e: React.PointerEvent) {
    if (!isDraggingSheet.current) return;
    dragCurrentY.current = e.clientY;
    const dy = Math.max(0, e.clientY - dragStartY.current);
    setSheetDragY(dy);
  }
  function onHandlePointerUp() {
    if (!isDraggingSheet.current) return;
    isDraggingSheet.current = false;
    const dy = dragCurrentY.current - dragStartY.current;
    if (dy > 120) { handleClose(); } else { setSheetDragY(0); }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    if (!file.name.match(/\.(txt|md|rtf)$/i)) {
      setUploadError("Please upload a .txt file. PDF support coming soon.");
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      const text = (ev.target?.result as string) ?? "";
      setDescription(text);
      setUploadFileName(file.name);
      if (!title.trim()) {
        const firstLine = text.split("\n").find(l => l.trim().length > 4)?.trim().slice(0, 70) ?? "";
        if (firstLine) setTitle(firstLine);
      }
      setTab("write");
    };
    reader.readAsText(file);
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "#111", border: "1px solid #2a2a2a", borderRadius: 10,
    padding: "11px 14px", color: "#fff", fontSize: 15, fontFamily: "Arial, sans-serif",
    outline: "none", boxSizing: "border-box",
  };

  const sheetTranslate = visible ? sheetDragY : 600;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: `rgba(0,0,0,${visible && sheetDragY < 80 ? 0.85 : 0})`,
      transition: isDraggingSheet.current ? "none" : "background 0.32s ease",
    }} onClick={e => { if (e.target === e.currentTarget) handleClose(); }}>
      <div
        ref={sheetRef}
        style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          maxHeight: "92dvh", display: "flex", flexDirection: "column",
          background: "#0f0f0f", borderRadius: "22px 22px 0 0",
          border: "1px solid #1e1e1e", borderBottom: "none",
          transform: `translateY(${sheetTranslate}px)`,
          transition: isDraggingSheet.current ? "none" : "transform 0.32s cubic-bezier(.22,.9,.32,1)",
          maxWidth: 720, margin: "0 auto",
        }}
      >
        {/* Drag handle */}
        <div
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
          style={{ padding: "14px 20px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: "grab", flexShrink: 0, touchAction: "none" }}
        >
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "#2a2a2a" }} />
          <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 18, color: ORANGE }}>New Incident</div>
              {preLinkedCaseName && <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>Adding to: {preLinkedCaseName}</div>}
            </div>
            <button onClick={handleClose} style={{ background: "#1a1a1a", border: "none", borderRadius: 20, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <X size={16} color="#aaa" />
            </button>
          </div>
          {/* Tabs */}
          <div style={{ width: "100%", display: "flex", gap: 8, borderBottom: "1px solid #1a1a1a", paddingBottom: 0 }}>
            {([["write", "Write"], ["upload", "Upload Complaint"]] as const).map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: "none", border: "none", cursor: "pointer",
                padding: "6px 4px 10px", fontSize: 13, fontWeight: 700,
                color: tab === t ? ORANGE : "#444",
                borderBottom: `2px solid ${tab === t ? ORANGE : "transparent"}`,
                marginBottom: -1, transition: "all 0.15s",
              }}>{label}</button>
            ))}
            {uploadFileName && <span style={{ marginLeft: "auto", fontSize: 11, color: "#555", alignSelf: "center" }}>📄 {uploadFileName}</span>}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {tab === "upload" ? (
            <div>
              <div style={{ fontSize: 14, color: "#555", lineHeight: 1.6, marginBottom: 20 }}>
                Upload your complaint, statement, or any text document — the content will be loaded into the description field so you can review and save it as an incident.
              </div>
              <label style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                border: "2px dashed #2a2a2a", borderRadius: 14, padding: "36px 24px",
                cursor: "pointer", gap: 12, textAlign: "center",
                transition: "border-color 0.2s",
              }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE + "66")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "#2a2a2a")}
              >
                <FileText size={32} color="#333" />
                <div style={{ color: "#666", fontSize: 14 }}>Tap to choose a file</div>
                <div style={{ color: "#333", fontSize: 12 }}>.txt supported · PDF support coming soon</div>
                <input type="file" accept=".txt,.md,.rtf" onChange={handleFileUpload} style={{ display: "none" }} />
              </label>
              {uploadError && <div style={{ color: "#ef4444", fontSize: 13, marginTop: 12 }}>{uploadError}</div>}
            </div>
          ) : (
            <>
              {/* Category */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  <Tag size={11} color="#444" /> TYPE OF SITUATION
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {(["employment", "police", "court", "other"] as IncidentCategory[]).map(cat => (
                    <button key={cat} onClick={() => setCategory(cat)}
                      style={{ background: category === cat ? `${CATEGORY_COLORS[cat]}22` : "#111", border: `1px solid ${category === cat ? CATEGORY_COLORS[cat] : "#2a2a2a"}`, borderRadius: 10, padding: "10px 12px", color: category === cat ? "#fff" : "#666", fontWeight: 700, fontSize: 13, cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}>
                      {CATEGORY_LABELS[cat]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date + Location */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
                <div>
                  <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                    <Calendar size={11} color="#444" /> DATE <span style={{ color: "#333", fontWeight: 400 }}>(opt.)</span>
                  </div>
                  <input type="date" value={dateOfEvent} onChange={e => setDateOfEvent(e.target.value)}
                    style={{ ...inputStyle, colorScheme: "dark" }}
                    onFocus={e => (e.target.style.borderColor = ORANGE)}
                    onBlur={e => (e.target.style.borderColor = "#2a2a2a")} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                    <MapPin size={11} color="#444" /> LOCATION <span style={{ color: "#333", fontWeight: 400 }}>(opt.)</span>
                  </div>
                  <input value={location} onChange={e => setLocation(e.target.value)}
                    placeholder="City, state, or address"
                    style={inputStyle}
                    onFocus={e => (e.target.style.borderColor = ORANGE)}
                    onBlur={e => (e.target.style.borderColor = "#2a2a2a")} />
                </div>
              </div>

              {/* Title */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>
                  TITLE <span style={{ color: "#333", fontWeight: 400 }}>(opt.)</span>
                </div>
                <input value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="Brief label — auto-filled from description if left blank"
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = ORANGE)}
                  onBlur={e => (e.target.style.borderColor = "#2a2a2a")} />
              </div>

              {/* Description */}
              <div>
                <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>DESCRIBE WHAT HAPPENED</div>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder={"On [date], I was at [location] when [person] did [action]...\n\nBe as specific as possible. Include exact words said, the order things happened, who else was there."}
                  rows={9}
                  style={{ width: "100%", background: "#111", border: "1px solid #2a2a2a", borderRadius: 10, padding: "14px", color: "#fff", fontSize: 15, fontFamily: "Georgia, serif", outline: "none", boxSizing: "border-box", resize: "vertical", lineHeight: 1.75 }}
                  onFocus={e => (e.target.style.borderColor = ORANGE)}
                  onBlur={e => (e.target.style.borderColor = "#2a2a2a")}
                />
                <div style={{ textAlign: "right", color: "#333", fontSize: 12, marginTop: 4 }}>
                  {description.trim().split(/\s+/).filter(Boolean).length} words
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{ padding: "14px 20px", borderTop: "1px solid #1a1a1a", display: "flex", gap: 10, flexShrink: 0, paddingBottom: "calc(14px + env(safe-area-inset-bottom))" }}>
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

  // Upcoming reminders
  const upcoming = [...data.reminders]
    .filter(r => daysUntil(r.dueDate) >= 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 3);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "28px 20px 120px" }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <img src="/hyperlaw-logo.png" alt="HL" style={{ width: 32, height: 32, borderRadius: 8 }} />
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.5 }}>HyperLaw</div>
        </div>
        <div style={{ color: "#444", fontSize: 14, lineHeight: 1.5 }}>Describe what happened. Organize it clearly. Build from it later.</div>
      </div>

      {/* Upcoming reminders banner */}
      {upcoming.length > 0 && (
        <div style={{ background: "#141414", border: `1px solid ${ORANGE}44`, borderRadius: 14, padding: "14px 16px", marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: ORANGE, fontWeight: 700, letterSpacing: 0.5, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <Bell size={11} color={ORANGE} /> UPCOMING DEADLINES
          </div>
          {upcoming.map(r => {
            const days = daysUntil(r.dueDate);
            const hlCase = data.cases.find(c => c.id === r.caseId);
            return (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: 3, background: days <= 3 ? "#ef4444" : days <= 7 ? ORANGE : "#3b82f6", flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: 13, color: "#ccc" }}>{r.label}</div>
                <div style={{ fontSize: 12, color: days <= 3 ? "#ef4444" : "#666", fontWeight: 700 }}>
                  {days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days}d`}
                </div>
                {hlCase && <div style={{ fontSize: 11, color: "#444" }}>{truncate(hlCase.title, 20)}</div>}
              </div>
            );
          })}
        </div>
      )}

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
                    style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, padding: "13px 16px", textAlign: "left", cursor: "pointer", width: "100%", display: "flex", alignItems: "flex-start", gap: 12 }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE + "55")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "#1e1e1e")}>
                    <div style={{ width: 8, height: 8, borderRadius: 4, background: CATEGORY_COLORS[incident.category], flexShrink: 0, marginTop: 5 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{incident.title}</div>
                      <div style={{ color: "#555", fontSize: 13, lineHeight: 1.4 }}>{truncate(incident.description, 80)}</div>
                      <div style={{ color: "#333", fontSize: 11, marginTop: 5, display: "flex", alignItems: "center", gap: 8 }}>
                        {incident.dateOfEvent && <span>{formatEventDate(incident.dateOfEvent)}</span>}
                        {incident.location && <span>{truncate(incident.location, 24)}</span>}
                        <span style={{ color: CATEGORY_COLORS[incident.category] + "88" }}>{CATEGORY_LABELS[incident.category]}</span>
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
                    style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, padding: "13px 16px", textAlign: "left", cursor: "pointer", width: "100%", display: "flex", alignItems: "center", gap: 12 }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE + "55")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "#1e1e1e")}>
                    <Folder size={18} color={ORANGE} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{c.title}</div>
                      <div style={{ color: "#555", fontSize: 13 }}>{c.incidentIds.length} incident{c.incidentIds.length !== 1 ? "s" : ""}</div>
                    </div>
                    <div style={{ background: `${STATUS_COLORS[c.status]}22`, border: `1px solid ${STATUS_COLORS[c.status]}55`, borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700, color: STATUS_COLORS[c.status] }}>
                      {STATUS_LABELS[c.status]}
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
  const [editDate, setEditDate] = useState(incident.dateOfEvent);
  const [editLocation, setEditLocation] = useState(incident.location);
  const [editCategory, setEditCategory] = useState<IncidentCategory>(incident.category);
  const [showCasePicker, setShowCasePicker] = useState(false);
  const [showDocConfirm, setShowDocConfirm] = useState(false);
  const [pendingExport, setPendingExport] = useState<(() => void) | null>(null);
  const linkedCase = cases.find(c => c.id === incident.caseId);
  const availableCases = cases.filter(c => c.id !== incident.caseId);

  function saveEdit() {
    onUpdate({ ...incident, title: editTitle.trim() || incident.title, description: editDesc, dateOfEvent: editDate, location: editLocation.trim(), category: editCategory });
    setEditing(false);
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#666", display: "flex", alignItems: "center", gap: 4 }}>
          <ChevronLeft size={18} /><span style={{ fontSize: 13, fontWeight: 700 }}>Back</span>
        </button>
        <div style={{ flex: 1 }} />
        {!editing ? (
          <>
            <button onClick={() => { setPendingExport(() => () => exportIncidentPDF(incident).catch(() => {})); setShowDocConfirm(true); }} title="Export PDF"
              style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: 8 }}><Download size={16} /></button>
            <button onClick={() => { setEditTitle(incident.title); setEditDesc(incident.description); setEditDate(incident.dateOfEvent); setEditLocation(incident.location); setEditCategory(incident.category); setEditing(true); }}
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
            {/* Category picker */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              {(["employment", "police", "court", "other"] as IncidentCategory[]).map(cat => (
                <button key={cat} onClick={() => setEditCategory(cat)}
                  style={{ background: editCategory === cat ? `${CATEGORY_COLORS[cat]}22` : "#111", border: `1px solid ${editCategory === cat ? CATEGORY_COLORS[cat] : "#2a2a2a"}`, borderRadius: 10, padding: "9px 12px", color: editCategory === cat ? "#fff" : "#555", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                style={{ background: "#111", border: `1px solid ${ORANGE}`, borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 13, outline: "none", colorScheme: "dark", width: "100%", boxSizing: "border-box" }} />
              <input value={editLocation} onChange={e => setEditLocation(e.target.value)} placeholder="Location"
                style={{ background: "#111", border: `1px solid ${ORANGE}`, borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" }} />
            </div>
            <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
              style={{ width: "100%", background: "#111", border: `1px solid ${ORANGE}`, borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 18, fontWeight: 800, outline: "none", boxSizing: "border-box", marginBottom: 14 }} />
            <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={14}
              style={{ width: "100%", background: "#111", border: `1px solid ${ORANGE}`, borderRadius: 10, padding: "14px", color: "#fff", fontSize: 15, fontFamily: "Georgia, serif", outline: "none", boxSizing: "border-box", resize: "vertical", lineHeight: 1.75 }} />
          </>
        ) : (
          <>
            {/* Category + metadata */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <div style={{ background: `${CATEGORY_COLORS[incident.category]}22`, border: `1px solid ${CATEGORY_COLORS[incident.category]}55`, borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 700, color: CATEGORY_COLORS[incident.category] }}>
                {CATEGORY_LABELS[incident.category]}
              </div>
              {incident.dateOfEvent && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#555", fontSize: 12 }}>
                  <Calendar size={11} color="#555" /> {formatEventDate(incident.dateOfEvent)}
                </div>
              )}
              {incident.location && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#555", fontSize: 12 }}>
                  <MapPin size={11} color="#555" /> {incident.location}
                </div>
              )}
            </div>

            <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 6, letterSpacing: -0.3, lineHeight: 1.2 }}>{incident.title}</div>
            <div style={{ color: "#444", fontSize: 13, marginBottom: 28, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Clock size={11} color="#444" /> Added {formatDate(incident.createdAt)}
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
      {showDocConfirm && pendingExport && (
        <DocGenConfirmModal onConfirm={pendingExport} onClose={() => { setShowDocConfirm(false); setPendingExport(null); }} />
      )}
    </div>
  );
}

// ─── CASES VIEW ───────────────────────────────────────────────────────────────
function CasesView({ data, onOpenCase }: {
  data: AppData;
  onOpenCase: (c: HLCase) => void;
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
          const categories = [...new Set(incidents.map(i => i.category))];
          return (
            <button key={c.id} onClick={() => onOpenCase(c)}
              style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 16, padding: "18px 16px", textAlign: "left", cursor: "pointer", width: "100%", display: "flex", gap: 14 }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE + "55")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "#1e1e1e")}>
              <Folder size={22} color={ORANGE} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 800, fontSize: 16 }}>{c.title}</span>
                  <span style={{ background: `${STATUS_COLORS[c.status]}22`, border: `1px solid ${STATUS_COLORS[c.status]}55`, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700, color: STATUS_COLORS[c.status] }}>
                    {STATUS_LABELS[c.status]}
                  </span>
                </div>
                <div style={{ color: "#555", fontSize: 13, marginBottom: 8 }}>
                  {incidents.length} incident{incidents.length !== 1 ? "s" : ""} · {formatDate(c.createdAt)}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {categories.map(cat => (
                    <span key={cat} style={{ background: `${CATEGORY_COLORS[cat]}18`, borderRadius: 5, padding: "2px 7px", fontSize: 11, color: CATEGORY_COLORS[cat] }}>
                      {CATEGORY_LABELS[cat]}
                    </span>
                  ))}
                </div>
              </div>
              <ChevronRight size={16} color="#333" style={{ flexShrink: 0, marginTop: 4 }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── REMINDER SECTION ─────────────────────────────────────────────────────────
function ReminderSection({ caseId, reminders, onAdd, onDelete }: {
  caseId: string;
  reminders: Reminder[];
  onAdd: (r: Reminder) => void;
  onDelete: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [dueDate, setDueDate] = useState("");

  function handleAdd() {
    if (!label.trim() || !dueDate) return;
    onAdd({ id: crypto.randomUUID(), caseId, label: label.trim(), dueDate, createdAt: Date.now() });
    setLabel(""); setDueDate(""); setAdding(false);
  }

  const caseReminders = reminders.filter(r => r.caseId === caseId).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 6 }}>
          <Bell size={11} color="#444" /> DEADLINE REMINDERS
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)}
            style={{ background: "none", border: "none", color: ORANGE, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            <Plus size={12} /> Add Deadline
          </button>
        )}
      </div>

      {adding && (
        <div style={{ background: "#111", border: `1px solid ${ORANGE}44`, borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, marginBottom: 10 }}>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Filing deadline, Response due…"
              style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" }}
              onFocus={e => (e.target.style.borderColor = ORANGE)} onBlur={e => (e.target.style.borderColor = "#2a2a2a")} />
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13, outline: "none", colorScheme: "dark" }}
              onFocus={e => (e.target.style.borderColor = ORANGE)} onBlur={e => (e.target.style.borderColor = "#2a2a2a")} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <TapBtn variant="dim" onClick={() => { setAdding(false); setLabel(""); setDueDate(""); }} style={{ fontSize: 12, padding: "7px 12px" }}>Cancel</TapBtn>
            <TapBtn variant="orange" onClick={handleAdd} disabled={!label.trim() || !dueDate} style={{ fontSize: 12, padding: "7px 12px" }}>Save Reminder</TapBtn>
          </div>
        </div>
      )}

      {caseReminders.length === 0 && !adding ? (
        <div style={{ color: "#333", fontSize: 13, fontStyle: "italic" }}>No deadlines yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {caseReminders.map(r => {
            const days = daysUntil(r.dueDate);
            const urgent = days >= 0 && days <= 3;
            return (
              <div key={r.id} style={{ background: urgent ? "#1a0e0e" : "#111", border: `1px solid ${urgent ? "#ef444444" : "#1e1e1e"}`, borderRadius: 10, padding: "11px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                <Bell size={14} color={urgent ? "#ef4444" : "#555"} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#ccc" }}>{r.label}</div>
                  <div style={{ fontSize: 12, color: urgent ? "#ef4444" : "#555", marginTop: 2 }}>
                    {formatEventDate(r.dueDate)}
                    {" · "}
                    {days < 0 ? "Overdue" : days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days} days`}
                  </div>
                </div>
                <button onClick={() => onDelete(r.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#444", padding: 4 }}><Trash2 size={14} /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── CASE DETAIL VIEW ─────────────────────────────────────────────────────────
function CaseDetailView({ hlCase, data, onUpdateCase, onDeleteCase, onOpenIncident, onOpenInTutor, onAddIncident, onAddReminder, onDeleteReminder, onBack, genDocsRefreshKey, creditBalance, onBuyCredits, onDocGenerated, isAdmin }: {
  hlCase: HLCase; data: AppData;
  onUpdateCase: (c: HLCase) => void; onDeleteCase: (id: string) => void; genDocsRefreshKey?: number;
  onOpenIncident: (i: Incident) => void; onOpenInTutor: (c: HLCase) => void;
  onAddIncident: () => void;
  onAddReminder: (r: Reminder) => void; onDeleteReminder: (id: string) => void;
  onBack: () => void;
  creditBalance?: number;
  onBuyCredits?: () => void;
  onDocGenerated?: () => void;
  isAdmin?: boolean;
}) {
  const [editTitle, setEditTitle] = useState(hlCase.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [notes, setNotes] = useState(hlCase.notes);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [uploadResult, setUploadResult] = useState<{ fileName: string; extraction: ReturnType<typeof Object.create> } | null>(null);
  const [showCaseDocConfirm, setShowCaseDocConfirm] = useState(false);
  const [pendingCaseExport, setPendingCaseExport] = useState<(() => void) | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [jurisdiction, setJurisdiction] = useState(hlCase.jurisdiction ?? "");
  const [editingJurisdiction, setEditingJurisdiction] = useState(false);
  const [genDocs, setGenDocs] = useState<ServerGeneratedDoc[]>([]);
  const [genDocsLoading, setGenDocsLoading] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [generatingDocType, setGeneratingDocType] = useState<"complaint" | "motion" | "timeline" | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState<ServerGeneratedDoc | null>(null);

  useEffect(() => {
    setGenDocsLoading(true);
    aiApi.generatedDocs.list(hlCase.id)
      .then(setGenDocs)
      .catch(() => {})
      .finally(() => setGenDocsLoading(false));
  }, [hlCase.id, genDocsRefreshKey]); // genDocsRefreshKey increments when Tutor saves a doc

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadState("uploading");
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("caseId", hlCase.id);
      const result = await aiApi.upload(form);
      setUploadResult({ fileName: file.name, extraction: result.extraction });
      setUploadState("done");
    } catch (err: unknown) {
      setUploadError((err as Error).message || "Upload failed");
      setUploadState("error");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleGenerateDoc(docType: "complaint" | "motion" | "timeline") {
    setGeneratingDocType(docType);
    setGenerateError(null);
    const incidents = data.incidents.filter(i => hlCase.incidentIds.includes(i.id));
    try {
      const doc = await aiApi.generateDocument({
        caseId: hlCase.id,
        documentType: docType,
        caseData: {
          title: hlCase.title,
          notes: hlCase.notes,
          jurisdiction: hlCase.jurisdiction,
          incidents: incidents.map(i => ({
            title: i.title,
            description: i.description,
            category: i.category,
            dateOfEvent: i.dateOfEvent || undefined,
            location: i.location || undefined,
          })),
        },
      });
      setGenDocs(prev => [doc, ...prev]);
      setViewingDoc(doc); // auto-open preview so user can verify formatting
    } catch (err: unknown) {
      const e = err as { message?: string };
      setGenerateError(e.message || "Generation failed. Try again.");
    } finally {
      setGeneratingDocType(null);
    }
  }

  const incidents = data.incidents.filter(i => hlCase.incidentIds.includes(i.id))
    .sort((a, b) => (a.dateOfEvent || a.createdAt.toString()).localeCompare(b.dateOfEvent || b.createdAt.toString()));

  function saveTitle() {
    onUpdateCase({ ...hlCase, title: editTitle.trim() || hlCase.title });
    setEditingTitle(false);
  }

  function saveNotes(val: string) {
    onUpdateCase({ ...hlCase, notes: val });
  }

  // Relevant templates based on incident categories in this case
  const caseCategories = new Set(incidents.map(i => i.category));
  const relevantTemplates = TEMPLATES.filter(t => t.categories.some(c => caseCategories.has(c)));

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#666", display: "flex", alignItems: "center", gap: 4 }}>
          <ChevronLeft size={18} /><span style={{ fontSize: 13, fontWeight: 700 }}>Cases</span>
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={() => { setPendingCaseExport(() => () => exportCasePDF(hlCase, data.incidents).catch(() => {})); setShowCaseDocConfirm(true); }} title="Export PDF"
          style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: 8 }}><Download size={16} /></button>
        <button onClick={() => { if (window.confirm("Delete this case?")) onDeleteCase(hlCase.id); }}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: 8 }}><Trash2 size={16} /></button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px 48px" }}>
        {editingTitle ? (
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
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

        {/* Status badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
          <div style={{ color: "#444", fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
            <Clock size={11} color="#444" /> {formatDate(hlCase.createdAt)} · {incidents.length} incident{incidents.length !== 1 ? "s" : ""}
          </div>
          <button onClick={() => setShowStatusPicker(true)}
            style={{ background: `${STATUS_COLORS[hlCase.status]}22`, border: `1px solid ${STATUS_COLORS[hlCase.status]}55`, borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 700, color: STATUS_COLORS[hlCase.status], cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
            {STATUS_LABELS[hlCase.status]} ▾
          </button>
        </div>

        {/* Jurisdiction */}
        <div style={{ marginBottom: 20 }}>
          {editingJurisdiction ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={jurisdiction}
                onChange={e => setJurisdiction(e.target.value)}
                placeholder="e.g. Kentucky, Federal — 6th Circuit"
                autoFocus
                onKeyDown={e => {
                  if (e.key === "Enter") { onUpdateCase({ ...hlCase, jurisdiction: jurisdiction.trim() }); setEditingJurisdiction(false); }
                  if (e.key === "Escape") { setJurisdiction(hlCase.jurisdiction ?? ""); setEditingJurisdiction(false); }
                }}
                style={{ flex: 1, background: "#111", border: `1px solid ${ORANGE}`, borderRadius: 10, padding: "10px 14px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" }}
              />
              <TapBtn variant="orange" onClick={() => { onUpdateCase({ ...hlCase, jurisdiction: jurisdiction.trim() }); setEditingJurisdiction(false); }} style={{ padding: "0 14px" }}><Check size={15} /></TapBtn>
            </div>
          ) : (
            <button
              onClick={() => setEditingJurisdiction(true)}
              style={{ background: "none", border: "1px dashed #1e1e1e", borderRadius: 10, padding: "8px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left" }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE + "44")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "#1e1e1e")}
            >
              <MapPin size={13} color={hlCase.jurisdiction ? ORANGE : "#333"} />
              <span style={{ fontSize: 13, color: hlCase.jurisdiction ? "#888" : "#333" }}>
                {hlCase.jurisdiction || "Set jurisdiction — state or federal court"}
              </span>
              {hlCase.jurisdiction && <span style={{ fontSize: 11, color: "#555", marginLeft: "auto" }}>Edit</span>}
            </button>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 24 }}>
          <TapBtn variant="orange" onClick={() => onOpenInTutor(hlCase)} style={{ justifyContent: "center" }}>
            <GraduationCap size={15} /> Analyze in Tutor
          </TapBtn>
          <TapBtn variant="ghost" onClick={onAddIncident} style={{ justifyContent: "center" }}>
            <Plus size={15} /> Add Incident
          </TapBtn>
        </div>

        {/* Document Upload */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>DOCUMENTS</div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt,.rtf,.jpg,.jpeg,.png,.heic,image/*"
            style={{ display: "none" }}
            onChange={handleUpload}
          />
          {(uploadState === "idle" || uploadState === "error") && (
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ width: "100%", background: "#111", border: "1px dashed #2a2a2a", borderRadius: 12, padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, textAlign: "left" }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE + "55")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "#2a2a2a")}>
              <Upload size={16} color={ORANGE} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#ccc" }}>Upload Document</div>
                <div style={{ fontSize: 12, color: "#444", marginTop: 2 }}>PDF, DOCX, TXT, images · AI extracts case data</div>
              </div>
            </button>
          )}
          {uploadState === "uploading" && (
            <div style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
              <Loader2 size={16} color={ORANGE} style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} />
              <div style={{ fontSize: 14, color: "#888" }}>Processing document…</div>
            </div>
          )}
          {uploadState === "done" && uploadResult && (
            <div style={{ background: "#0d1a0d", border: "1px solid #1a3a1a", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <CheckCircle2 size={16} color="#22c55e" />
                <div style={{ fontWeight: 700, fontSize: 13, color: "#22c55e", flex: 1 }}>Document processed</div>
                <button onClick={() => { setUploadState("idle"); setUploadResult(null); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#444" }}><X size={14} /></button>
              </div>
              <div style={{ fontSize: 12, color: "#555", marginBottom: uploadResult.extraction ? 10 : 0 }}>{uploadResult.fileName}</div>
              {uploadResult.extraction && (
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {uploadResult.extraction.plaintiff && <div style={{ fontSize: 13, color: "#ccc" }}><span style={{ color: "#555" }}>Plaintiff: </span>{uploadResult.extraction.plaintiff}</div>}
                  {uploadResult.extraction.defendant && <div style={{ fontSize: 13, color: "#ccc" }}><span style={{ color: "#555" }}>Defendant: </span>{uploadResult.extraction.defendant}</div>}
                  {uploadResult.extraction.court && <div style={{ fontSize: 13, color: "#ccc" }}><span style={{ color: "#555" }}>Court: </span>{uploadResult.extraction.court}</div>}
                  {uploadResult.extraction.caseNumber && <div style={{ fontSize: 13, color: "#ccc" }}><span style={{ color: "#555" }}>Case No.: </span>{uploadResult.extraction.caseNumber}</div>}
                  {uploadResult.extraction.claims?.length > 0 && (
                    <div style={{ fontSize: 13, color: "#ccc" }}>
                      <span style={{ color: "#555" }}>Claims: </span>
                      {(uploadResult.extraction.claims as string[]).slice(0, 3).join(", ")}
                    </div>
                  )}
                  {uploadResult.extraction.summary && (
                    <div style={{ fontSize: 12, color: "#666", fontStyle: "italic", marginTop: 4, lineHeight: 1.5 }}>{uploadResult.extraction.summary}</div>
                  )}
                </div>
              )}
            </div>
          )}
          {uploadState === "error" && uploadError && (
            <div style={{ marginTop: 6, padding: "8px 12px", background: "#1a0d0d", border: "1px solid #3a1a1a", borderRadius: 8, fontSize: 13, color: "#ef4444" }}>{uploadError}</div>
          )}
        </div>

        {/* Generated Documents */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5 }}>GENERATED DOCUMENTS</div>
            {genDocsLoading && <Loader2 size={12} color="#444" style={{ animation: "spin 1s linear infinite" }} />}
          </div>
          {genDocs.length === 0 && !genDocsLoading ? (
            <div style={{ color: "#333", fontSize: 13, fontStyle: "italic", padding: "10px 0" }}>
              No saved documents yet. Use the Tutor to analyze your case and save AI-generated content here.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {genDocs.map(doc => {
                const statusColor = doc.status === "filed" ? "#22c55e" : doc.status === "verified" ? ORANGE : "#555";
                return (
                  <div key={doc.id} style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <FileText size={15} color="#444" style={{ flexShrink: 0, marginTop: 2 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.title}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#444", background: "#1a1a1a", borderRadius: 4, padding: "2px 6px" }}>{doc.documentType.replace("_", " ").toUpperCase()}</span>
                          {doc.paymentStatus === "paid"
                            ? <span style={{ fontSize: 10, fontWeight: 700, color: "#22c55e" }}>UNLOCKED</span>
                            : <span style={{ fontSize: 10, fontWeight: 700, color: ORANGE, display: "flex", alignItems: "center", gap: 2 }}><Lock size={9} /> PREVIEW</span>
                          }
                          <span style={{ fontSize: 11, color: "#444" }}>{new Date(doc.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                        <button
                          title={doc.paymentStatus === "paid" ? "View document" : "View preview"}
                          onClick={() => setViewingDoc(doc)}
                          style={{ background: "none", border: `1px solid ${doc.paymentStatus === "paid" ? "#2a3a2a" : "#2a2a1a"}`, borderRadius: 6, padding: "5px 7px", cursor: "pointer", color: doc.paymentStatus === "paid" ? "#22c55e" : ORANGE, display: "flex", alignItems: "center" }}
                        ><Eye size={13} /></button>
                        <button
                          title="Delete"
                          disabled={deletingDocId === doc.id}
                          onClick={async () => {
                            setDeletingDocId(doc.id);
                            await aiApi.generatedDocs.remove(doc.id).catch(() => {});
                            setGenDocs(prev => prev.filter(d => d.id !== doc.id));
                            setDeletingDocId(null);
                          }}
                          style={{ background: "none", border: "1px solid #2a2a2a", borderRadius: 6, padding: "5px 7px", cursor: "pointer", color: "#555", display: "flex", alignItems: "center" }}
                        ><Trash2 size={13} /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Generate Formal Documents */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5 }}>GENERATE FORMAL DOCUMENTS</div>
            {creditBalance !== undefined && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: creditBalance > 0 ? ORANGE : "#555", fontWeight: 700 }}>
                  {creditBalance} {creditBalance === 1 ? "credit" : "credits"}
                </span>
                <button
                  onClick={() => onBuyCredits?.()}
                  style={{ fontSize: 10, color: "#555", background: "#111", border: "1px solid #2a2a2a", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}
                >
                  + Buy
                </button>
              </div>
            )}
          </div>
          <div style={{ color: "#444", fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
            Generate a free preview — verify the formatting, then unlock the full document for 1 credit.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(["complaint", "timeline", "motion"] as const).map(docType => {
              const labels: Record<string, string> = { complaint: "Civil Rights Complaint", timeline: "Incident Timeline", motion: "Litigation Motion" };
              const isGenerating = generatingDocType === docType;
              const anyGenerating = !!generatingDocType;
              return (
                <button
                  key={docType}
                  disabled={anyGenerating}
                  onClick={() => handleGenerateDoc(docType)}
                  style={{
                    background: "#111", border: `1px solid ${isGenerating ? ORANGE : "#1e1e1e"}`,
                    borderRadius: 10, padding: "10px 14px", cursor: anyGenerating ? "not-allowed" : "pointer",
                    display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4,
                    opacity: anyGenerating && !isGenerating ? 0.4 : 1, flex: "1 1 120px",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#ccc", display: "flex", alignItems: "center", gap: 6 }}>
                    {isGenerating
                      ? <Loader2 size={13} color={ORANGE} style={{ animation: "spin 1s linear infinite" }} />
                      : <FileText size={13} color="#444" />
                    }
                    {labels[docType]}
                  </div>
                  <div style={{ fontSize: 10, color: "#555" }}>Free preview</div>
                </button>
              );
            })}
          </div>
          {generateError && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#ef4444", background: "#1a0d0d", border: "1px solid #3a1a1a", borderRadius: 8, padding: "8px 12px" }}>
              {generateError}
            </div>
          )}
        </div>

        {/* Incidents */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 12 }}>INCIDENTS IN THIS CASE</div>
          {incidents.length === 0 ? (
            <div style={{ color: "#444", fontSize: 14, fontStyle: "italic" }}>No incidents yet. Tap "Add Incident" above.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {incidents.map(i => (
                <button key={i.id} onClick={() => onOpenIncident(i)}
                  style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, padding: "12px 14px", textAlign: "left", cursor: "pointer", width: "100%", display: "flex", gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: CATEGORY_COLORS[i.category], flexShrink: 0, marginTop: 4 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.title}</div>
                    <div style={{ color: "#444", fontSize: 12, marginTop: 2, display: "flex", gap: 8 }}>
                      {i.dateOfEvent ? formatEventDate(i.dateOfEvent) : formatDate(i.createdAt)}
                      {i.location && <span>{truncate(i.location, 20)}</span>}
                    </div>
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
                <div key={i.id} style={{ position: "relative", marginBottom: 18 }}>
                  <div style={{ position: "absolute", left: -20, top: 4, width: 10, height: 10, borderRadius: 5, background: CATEGORY_COLORS[i.category], border: `2px solid #0a0a0a` }} />
                  <div style={{ fontSize: 11, color: "#444", marginBottom: 1 }}>{i.dateOfEvent ? formatEventDate(i.dateOfEvent) : formatDate(i.createdAt)}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#ccc" }}>{i.title}</div>
                  {i.location && <div style={{ fontSize: 11, color: "#444", marginTop: 1 }}>{i.location}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reminders */}
        <ReminderSection
          caseId={hlCase.id}
          reminders={data.reminders}
          onAdd={onAddReminder}
          onDelete={onDeleteReminder}
        />

        {/* Notes */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>NOTES</div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={6}
            placeholder="Add any notes about this case — context, questions, next steps..."
            style={{ width: "100%", background: "#111", border: "1px solid #2a2a2a", borderRadius: 10, padding: "12px 14px", color: "#ccc", fontSize: 14, fontFamily: "Georgia, serif", outline: "none", boxSizing: "border-box", resize: "vertical", lineHeight: 1.65 }}
            onFocus={e => (e.target.style.borderColor = ORANGE)}
            onBlur={e => { e.target.style.borderColor = "#2a2a2a"; saveNotes(notes); }}
          />
        </div>

        {/* Templates */}
        {relevantTemplates.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 12 }}>SUGGESTED RESOURCES</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {relevantTemplates.map(t => (
                <a key={t.id} href={t.url} target="_blank" rel="noopener noreferrer"
                  style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, padding: "14px 16px", textDecoration: "none", display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <FileText size={16} color={ORANGE} style={{ flexShrink: 0, marginTop: 1 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#fff", marginBottom: 3 }}>{t.title}</div>
                    <div style={{ fontSize: 13, color: "#555", lineHeight: 1.4 }}>{t.description}</div>
                  </div>
                  <ExternalLink size={13} color="#444" style={{ flexShrink: 0, marginTop: 2 }} />
                </a>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "#333", marginTop: 8 }}>These are official sources only. HyperLaw does not auto-fill or generate any documents.</div>
          </div>
        )}
      </div>

      {/* Document viewer / paywall / TTS / download */}
      {viewingDoc && (
        <DocumentViewerModal
          doc={viewingDoc}
          creditBalance={creditBalance}
          onBuyCredits={onBuyCredits}
          isAdmin={isAdmin}
          onClose={() => setViewingDoc(null)}
          onDocUnlocked={(updatedDoc) => {
            setGenDocs(prev => prev.map(d => d.id === updatedDoc.id ? updatedDoc : d));
            setViewingDoc(updatedDoc);
            onDocGenerated?.(); // refreshes credit balance in parent
          }}
        />
      )}

      {/* Status picker sheet */}
      {showStatusPicker && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 150, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "#111", borderRadius: "20px 20px 0 0", width: "100%", padding: "20px 20px calc(20px + env(safe-area-inset-bottom))" }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 16 }}>Case Status</div>
            {(["open", "in_progress", "closed"] as CaseStatus[]).map(s => (
              <button key={s} onClick={() => { onUpdateCase({ ...hlCase, status: s }); setShowStatusPicker(false); }}
                style={{ width: "100%", background: hlCase.status === s ? `${STATUS_COLORS[s]}22` : "#1a1a1a", border: `1px solid ${hlCase.status === s ? STATUS_COLORS[s] : "#2a2a2a"}`, borderRadius: 12, padding: "14px 16px", color: hlCase.status === s ? STATUS_COLORS[s] : "#ccc", fontSize: 15, fontWeight: 700, textAlign: "left", cursor: "pointer", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                {hlCase.status === s && <CheckCircle2 size={16} color={STATUS_COLORS[s]} />} {STATUS_LABELS[s]}
              </button>
            ))}
            <button onClick={() => setShowStatusPicker(false)}
              style={{ width: "100%", background: "none", border: "none", color: "#555", fontSize: 14, cursor: "pointer", padding: "12px 0" }}>Cancel</button>
          </div>
        </div>
      )}
      {showCaseDocConfirm && pendingCaseExport && (
        <DocGenConfirmModal onConfirm={pendingCaseExport} onClose={() => { setShowCaseDocConfirm(false); setPendingCaseExport(null); }} />
      )}
    </div>
  );
}

// ─── TUTOR VIEW ───────────────────────────────────────────────────────────────
function TutorView({ data, initialIncident, initialCase, onDocSaved }: {
  data: AppData;
  initialIncident?: Incident | null;
  initialCase?: HLCase | null;
  onDocSaved?: () => void;
}) {
  type TutorTarget = { kind: "incident"; item: Incident } | { kind: "case"; item: HLCase } | null;
  const [target, setTarget] = useState<TutorTarget>(() => {
    if (initialIncident) return { kind: "incident", item: initialIncident };
    if (initialCase) return { kind: "case", item: initialCase };
    return null;
  });
  const [analysis, setAnalysis] = useState<TutorAnalysis | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [chatMessages, setChatMessages] = useState<AiChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const forceRefreshRef = useRef(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showPreVerify, setShowPreVerify] = useState(false);
  const [savingDoc, setSavingDoc] = useState(false);
  // key = "${kind}:${id}" of the last successfully saved target; null = not saved yet
  const [savedTargetKey, setSavedTargetKey] = useState<string | null>(null);

  // Reset save state whenever the user changes what they're analyzing
  const currentTargetKey = target
    ? `${target.kind}:${target.item.id}`
    : null;
  useEffect(() => {
    setSavingDoc(false);
    setSavedTargetKey(null);
  }, [currentTargetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check AI status once on mount
  useEffect(() => {
    aiApi.status().then(s => setAiAvailable(s.configured)).catch(() => setAiAvailable(false));
  }, []);

  // Stable key representing the content of incidents relevant to the selected target.
  // Recalculated when target or incident descriptions change — avoids stale analysis
  // when the user edits an incident that belongs to the currently selected case.
  const relevantIncidentKey = (() => {
    if (!target) return "";
    if (target.kind === "incident") {
      const inc = target.item as Incident;
      return `${inc.id}::${inc.description}`;
    }
    const c = target.item as HLCase;
    return data.incidents
      .filter(i => c.incidentIds.includes(i.id))
      .map(i => `${i.id}::${i.description}`)
      .join("|");
  })();

  // Analyze whenever target, AI status, or relevant incident content changes
  useEffect(() => {
    if (!target) { setAnalysis(null); setChatMessages([]); return; }
    if (aiAvailable === null) return; // still loading status

    setChatMessages([]);
    setIsAnalyzing(true);

    // Consume the force-refresh flag for this run, then reset it
    const isForceRefresh = forceRefreshRef.current;
    forceRefreshRef.current = false;

    async function run() {
      try {
        let result: TutorAnalysis;
        if (aiAvailable) {
          if (target!.kind === "incident") {
            result = await aiApi.analyzeIncident(
              target!.item as Parameters<typeof aiApi.analyzeIncident>[0],
              { forceRefresh: isForceRefresh },
            );
          } else {
            const hlCase = target!.item as HLCase;
            const incs = data.incidents.filter(i => hlCase.incidentIds.includes(i.id));
            result = await aiApi.analyzeCase(hlCase, incs, {
              forceRefresh: isForceRefresh,
              caseId: hlCase.id,
            });
          }
        } else {
          if (target!.kind === "incident") {
            result = staticTutorService.analyzeIncident(target!.item as Incident);
          } else {
            const incs = data.incidents.filter(i => (target!.item as HLCase).incidentIds.includes(i.id));
            result = staticTutorService.analyzeCase(target!.item as HLCase, incs);
          }
        }
        setAnalysis(result);
      } catch {
        // Fall back to static on any error
        if (target!.kind === "incident") {
          setAnalysis(staticTutorService.analyzeIncident(target!.item as Incident));
        } else {
          const incs = data.incidents.filter(i => (target!.item as HLCase).incidentIds.includes(i.id));
          setAnalysis(staticTutorService.analyzeCase(target!.item as HLCase, incs));
        }
      } finally {
        setIsAnalyzing(false);
      }
    }

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, aiAvailable, relevantIncidentKey, refreshTrigger]);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  async function sendChat() {
    if (!chatInput.trim() || isSending) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setIsSending(true);
    try {
      const context = {
        incident: target?.kind === "incident" ? (target.item as Incident) : null,
        hlCase: target?.kind === "case" ? (target.item as HLCase) : null,
        incidents: target?.kind === "case"
          ? data.incidents.filter(i => (target.item as HLCase).incidentIds.includes(i.id))
          : undefined,
        history: chatMessages,
      };
      const { reply } = await aiApi.chat(userMsg, context);
      setChatMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setChatMessages(prev => [...prev, { role: "assistant", content: "Couldn't get a response — please try again." }]);
    } finally {
      setIsSending(false);
    }
  }

  const insightBg: Record<string, string> = { summary: "#1a2a1a", key_point: "#121e2a", question: "#211e0e", notice: "#2a1212" };
  const insightBorder: Record<string, string> = { summary: "#2a5a2a", key_point: "#2a4a6a", question: "#5a4a12", notice: "#6a2222" };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #1a1a1a", flexShrink: 0 }}>
        <button onClick={() => setShowPicker(true)}
          style={{ width: "100%", background: "#111", border: `1px solid ${target ? ORANGE + "55" : "#2a2a2a"}`, borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", textAlign: "left" }}>
          {target ? (target.kind === "incident" ? <FileText size={16} color={ORANGE} /> : <Folder size={16} color={ORANGE} />) : <BookOpen size={16} color="#555" />}
          <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: target ? "#fff" : "#555" }}>
            {target ? target.item.title : "Select an incident or case…"}
          </span>
          {isAnalyzing
            ? <Loader2 size={14} color={ORANGE} style={{ animation: "spin 1s linear infinite" }} />
            : <ChevronRight size={14} color="#555" />}
        </button>
        {aiAvailable !== null && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 7, paddingLeft: 2 }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: aiAvailable ? "#22c55e" : "#444", flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: aiAvailable ? "#22c55e" : "#444", fontWeight: 600 }}>
              {aiAvailable ? "Claude AI · Live Analysis" : "Pattern Analysis · Connect Claude in Profile for AI"}
            </span>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px 32px" }}>
        {!target ? (
          <div style={{ textAlign: "center", paddingTop: 60 }}>
            <GraduationCap size={52} color="#1e1e1e" style={{ marginBottom: 16 }} />
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Tutor</div>
            <div style={{ color: "#555", fontSize: 15, lineHeight: 1.65, maxWidth: 320, margin: "0 auto" }}>
              Select an incident or case above. The Tutor will read what you described and help you think through it.
            </div>
          </div>
        ) : isAnalyzing ? (
          <div style={{ textAlign: "center", paddingTop: 60 }}>
            <Loader2 size={36} color={ORANGE} style={{ animation: "spin 1s linear infinite", marginBottom: 16 }} />
            <div style={{ color: "#555", fontSize: 14 }}>{aiAvailable ? "Claude is reading your case…" : "Analyzing…"}</div>
          </div>
        ) : analysis ? (
          <>
            {/* AI Disclaimer Banner — shown whenever Claude generated this content */}
            {aiAvailable && (
              <div style={{
                background: "#0d0d0d", border: "1px solid #1a1a1a",
                borderRadius: 10, padding: "10px 14px", marginBottom: 20,
                display: "flex", alignItems: "flex-start", gap: 10,
              }}>
                <div style={{ width: 4, height: 4, borderRadius: 2, background: ORANGE, flexShrink: 0, marginTop: 5 }} />
                <p style={{ margin: 0, fontSize: 11, color: "#555", lineHeight: 1.6 }}>
                  <strong style={{ color: "#666" }}>HyperLaw AI Assistant</strong> — {COMPLIANCE.AI_ANALYSIS_BANNER}
                </p>
              </div>
            )}
            {/* Layer One disclaimer — shown when static / knowledge-library content is displayed.
                Per spec: Layer One educational content is NOT exempt from disclaimer requirements. */}
            {!aiAvailable && (
              <div style={{
                background: "#0d0d0d", border: "1px solid #1a1a1a",
                borderRadius: 10, padding: "10px 14px", marginBottom: 20,
                display: "flex", alignItems: "flex-start", gap: 10,
              }}>
                <div style={{ width: 4, height: 4, borderRadius: 2, background: "#555", flexShrink: 0, marginTop: 5 }} />
                <p style={{ margin: 0, fontSize: 11, color: "#555", lineHeight: 1.6 }}>
                  <strong style={{ color: "#666" }}>HyperLaw Legal Information</strong> — {COMPLIANCE.EDUCATIONAL_CONTENT}
                </p>
              </div>
            )}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5 }}>OVERVIEW</div>
                {aiAvailable && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {analysis.fromCache && (
                      <span style={{ fontSize: 10, color: "#555", background: "#111", border: "1px solid #1e1e1e", borderRadius: 4, padding: "2px 6px" }}>
                        Cached result
                      </span>
                    )}
                    <button
                      onClick={() => { forceRefreshRef.current = true; setRefreshTrigger(n => n + 1); }}
                      style={{
                        background: "none", border: `1px solid #2a2a2a`, borderRadius: 6,
                        padding: "3px 8px", cursor: "pointer", color: "#555",
                        fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", gap: 4,
                      }}
                      title="Run a fresh Claude analysis"
                    >
                      ↻ Regenerate
                    </button>
                    <button
                      onClick={() => setShowPreVerify(true)}
                      style={{
                        background: `${ORANGE}15`, border: `1px solid ${ORANGE}44`, borderRadius: 6,
                        padding: "3px 8px", cursor: "pointer", color: ORANGE,
                        fontSize: 10, fontWeight: 700,
                      }}
                      title="Pre-verify this analysis before using it"
                    >
                      Pre-Verify
                    </button>
                  </div>
                )}
              </div>
              <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, padding: "16px 18px", fontSize: 15, color: "#ccc", lineHeight: 1.65, fontFamily: "Georgia, serif" }}>
                {analysis.overview}
              </div>
            </div>
            {analysis.insights.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>WHAT THE TUTOR SEES</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {analysis.insights.map((insight, i) => (
                    <div key={i} style={{ background: insightBg[insight.type] || "#111", border: `1px solid ${insightBorder[insight.type] || "#2a2a2a"}`, borderRadius: 12, padding: "14px 16px" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, color: "#666", marginBottom: 6, textTransform: "uppercase" }}>{insight.type.replace("_", " ")}</div>
                      <div style={{ fontSize: 14, color: "#ccc", lineHeight: 1.6 }}>{insight.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {analysis.guidingQuestions.length > 0 && (
              <div style={{ marginBottom: aiAvailable ? 28 : 0 }}>
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

            {/* Save Analysis to Case */}
            {aiAvailable && analysis && (() => {
              const caseId = target?.kind === "case" ? target.item.id
                : target?.kind === "incident" && target.item.caseId ? target.item.caseId
                : null;
              if (!caseId) return null;
              const isAlreadySaved = savedTargetKey === currentTargetKey && savedTargetKey !== null;
              return (
                <div style={{ marginBottom: 24 }}>
                  <button
                    onClick={async () => {
                      if (savingDoc || isAlreadySaved) return;
                      setSavingDoc(true);
                      try {
                        const content = [
                          analysis.overview,
                          "KEY INSIGHTS:",
                          analysis.insights.map(i => `• ${i.type.replace("_", " ").toUpperCase()}: ${i.text}`).join("\n"),
                          "QUESTIONS TO CONSIDER:",
                          analysis.guidingQuestions.map((q, n) => `${n + 1}. ${q}`).join("\n"),
                        ].join("\n\n");
                        await aiApi.generatedDocs.create({
                          caseId,
                          title: `AI Analysis — ${target!.item.title}`,
                          documentType: "analysis",
                          content,
                        });
                        setSavedTargetKey(currentTargetKey);
                        onDocSaved?.();
                      } catch {}
                      setSavingDoc(false);
                    }}
                    disabled={savingDoc || isAlreadySaved}
                    style={{
                      width: "100%", padding: "11px 16px",
                      background: isAlreadySaved ? "#0d1a0d" : "#111",
                      border: `1px solid ${isAlreadySaved ? "#22c55e44" : "#2a2a2a"}`,
                      borderRadius: 10, cursor: savingDoc || isAlreadySaved ? "default" : "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      color: isAlreadySaved ? "#22c55e" : "#666", fontSize: 13, fontWeight: 700,
                      transition: "all 0.2s",
                    }}
                  >
                    {savingDoc
                      ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Saving…</>
                      : isAlreadySaved
                        ? <><CheckCircle2 size={14} /> Saved to Case</>
                        : <><FileText size={14} /> Save Analysis to Case</>
                    }
                  </button>
                </div>
              );
            })()}

            {/* AI Chat — only when Claude is active */}
            {aiAvailable && (
              <div>
                <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>ASK THE TUTOR</div>
                <div style={{ background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 14, overflow: "hidden" }}>
                  {chatMessages.length > 0 && (
                    <div style={{ maxHeight: 340, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                      {chatMessages.map((m, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                          <div style={{
                            maxWidth: "85%", padding: "10px 14px",
                            borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                            background: m.role === "user" ? ORANGE : "#1a1a1a",
                            color: m.role === "user" ? "#000" : "#ccc",
                            fontSize: 14, lineHeight: 1.55, fontWeight: m.role === "user" ? 600 : 400,
                          }}>
                            {m.content}
                          </div>
                        </div>
                      ))}
                      {isSending && (
                        <div style={{ display: "flex" }}>
                          <div style={{ background: "#1a1a1a", padding: "10px 16px", borderRadius: "14px 14px 14px 4px", display: "flex", gap: 4, alignItems: "center" }}>
                            {[0, 0.2, 0.4].map((delay, i) => (
                              <div key={i} style={{ width: 6, height: 6, borderRadius: 3, background: "#555", animation: `pulse 1.2s ease-in-out ${delay}s infinite` }} />
                            ))}
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderTop: chatMessages.length > 0 ? "1px solid #1a1a1a" : "none" }}>
                    <input
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                      placeholder="Ask about your case, rights, strategy…"
                      style={{ flex: 1, background: "#111", border: "1px solid #2a2a2a", borderRadius: 10, padding: "10px 14px", color: "#ccc", fontSize: 14, outline: "none", fontFamily: "Arial, sans-serif" }}
                      onFocus={e => (e.target.style.borderColor = ORANGE + "66")}
                      onBlur={e => (e.target.style.borderColor = "#2a2a2a")}
                    />
                    <button
                      onClick={sendChat}
                      disabled={!chatInput.trim() || isSending}
                      style={{
                        background: chatInput.trim() && !isSending ? ORANGE : "#1a1a1a",
                        border: "none", borderRadius: 10, width: 42, height: 42,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: chatInput.trim() && !isSending ? "pointer" : "default",
                        flexShrink: 0, transition: "background 0.15s",
                      }}>
                      {isSending
                        ? <Loader2 size={16} color="#555" style={{ animation: "spin 1s linear infinite" }} />
                        : <Send size={16} color={chatInput.trim() ? "#000" : "#444"} />}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>

      {showPreVerify && analysis && (
        <PreVerificationModal
          title={target?.item.title}
          text={[
            analysis.overview,
            analysis.insights.map(i => `${i.type.replace("_", " ").toUpperCase()}: ${i.text}`).join("\n"),
            "QUESTIONS TO CONSIDER:",
            analysis.guidingQuestions.map((q, n) => `${n + 1}. ${q}`).join("\n"),
          ].join("\n\n")}
          onClose={() => setShowPreVerify(false)}
        />
      )}

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
                      <div style={{ width: 8, height: 8, borderRadius: 4, background: CATEGORY_COLORS[i.category], flexShrink: 0, marginTop: 4 }} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#fff" }}>{i.title}</div>
                        <div style={{ color: "#555", fontSize: 12 }}>{CATEGORY_LABELS[i.category]} · {formatDate(i.createdAt)}</div>
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
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#fff" }}>{c.title}</div>
                        <div style={{ color: "#555", fontSize: 12 }}>{c.incidentIds.length} incident{c.incidentIds.length !== 1 ? "s" : ""}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {data.incidents.length === 0 && data.cases.length === 0 && (
                <div style={{ color: "#555", fontSize: 14, textAlign: "center", paddingTop: 40 }}>No incidents or cases yet.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PLANS OVERLAY ────────────────────────────────────────────────────────────
function PlansOverlay({ onClose, onBuyCredits }: { onClose: () => void; onBuyCredits?: () => void }) {
  const [visible, setVisible] = useState(false);
  const [activeIndex, setActiveIndex] = useState(1);
  const startXRef = useRef(0);
  const currentXRef = useRef(0);
  const isDraggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const ORANGE = "#F45D01";
  const ORANGE_HOT = "#FF7A1A";
  const PAPER = "#F4EFE8";
  const DIM = "#9C948A";
  const PANEL = "#141210";
  const PANEL2 = "#1b1815";
  const LINE = "#2a2521";

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const PLAN_ICONS = [
    `${basePath}/plan-icon-0.png`,
    `${basePath}/plan-icon-1.png`,
    `${basePath}/plan-icon-2.png`,
  ];

  const plans = [
    {
      id: "firstfiling", name: "First Filing", tagline: "You don't have to be fearless. Doing it afraid is just as brave.",
      price: "Pay As You Go", cycle: null as string | null, priceNote: "No subscription · 1 credit unlocks one full document",
      badge: null as string | null,
      quote: '"You\'ll make mistakes. That\'s not disqualifying — quitting is. Stay determined and the scale tips your way eventually, even when it doesn\'t look like it yet."',
      features: [
        { text: "<b>Cases, incidents & timelines — always free</b> — build and document everything at no cost", tbd: false },
        { text: "<b>AI document previews — always free</b> — generate any complaint, motion, or timeline and review it before spending a cent", tbd: false },
        { text: "<b>Unlock full documents à la carte</b> — spend 1 credit per document only when you're ready to download", tbd: false },
        { text: "Guided case tutor included — plain-English answers to your legal questions", tbd: false },
      ],
      ctaLabel: "Start Building Your Case", ctaStyle: "secondary" as const,
    },
    {
      id: "prosay", name: "Pro-Say Selection", tagline: "Say it right, every filing",
      price: "$25", cycle: "/ month" as string | null, priceNote: "Billed monthly · cancel anytime",
      badge: null as string | null,
      quote: '"The law rewards those who show up prepared. Pro-Say gives you every tool to make sure that person is you."',
      features: [
        { text: "<b>Unlimited cases</b> — build and track as many cases as your docket demands", tbd: false },
        { text: "<b>Priority tutor access</b> — no usage caps, full reasoning depth", tbd: false },
        { text: "<b>Document analysis</b> — upload evidence, get structured breakdowns", tbd: false },
        { text: "<b>Readiness engine</b> — know your case strength before you file", tbd: false },
        { text: "<b>Advanced reminders</b> — deadline tracking across all your cases", tbd: false },
      ],
      ctaLabel: "Select Pro-Say", ctaStyle: "primary" as const,
    },
    {
      id: "apex", name: "Apex Litigant", tagline: "THE MANEATER PACKAGE — NO CAP",
      price: "$100", cycle: "/ month" as string | null, priceNote: "Billed monthly · cancel anytime",
      badge: "Full Docket" as string | null,
      quote: '"For attorneys, power litigants, and anyone who refuses to leave anything on the table. Sink your teeth into the docket and don\'t let go."',
      features: [
        { text: "<b>Sink your teeth into the docket</b> — unlimited cases, zero throttle, zero apologies", tbd: false },
        { text: "<b>Built for attorneys & power litigants</b> — anyone going for the jugular", tbd: false },
        { text: "<b>Full AI reasoning engine</b> — no guardrails, no cap on depth", tbd: false },
        { text: "<b>Priority everything</b> — support, tutor, document analysis, front of the line", tbd: false },
        { text: "<b>Run your entire practice</b> — fight every battle at once, on your terms", tbd: false },
      ],
      ctaLabel: "Select Apex Litigant", ctaStyle: "primary" as const,
    },
  ];

  const goTo = useCallback((idx: number) => {
    setActiveIndex(Math.max(0, Math.min(plans.length - 1, idx)));
  }, [plans.length]);

  useEffect(() => { const t = setTimeout(() => setVisible(true), 20); return () => clearTimeout(t); }, []);

  function handleClose() { setVisible(false); setTimeout(onClose, 280); }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    isDraggingRef.current = true; setIsDragging(true);
    startXRef.current = e.clientX; currentXRef.current = e.clientX;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!isDraggingRef.current) return; currentXRef.current = e.clientX;
  }
  function onPointerUp() {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false; setIsDragging(false);
    const diff = currentXRef.current - startXRef.current;
    if (Math.abs(diff) > 50) goTo(activeIndex + (diff < 0 ? 1 : -1));
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 350, overflowY: "auto",
      background: `rgba(8,7,6,${visible ? 0.97 : 0})`, transition: "background 0.28s ease",
    }}>
      <style>{`@keyframes glowPulse{0%,100%{box-shadow:0 0 0 1px rgba(255,122,26,.28),0 0 30px -8px rgba(244,93,1,.4),0 20px 60px -18px rgba(244,93,1,.3);}50%{box-shadow:0 0 0 1px rgba(255,122,26,.55),0 0 54px -6px rgba(244,93,1,.75),0 20px 60px -18px rgba(244,93,1,.5);}}`}</style>
      <div onClick={handleClose} style={{ position: "fixed", inset: 0 }} />
      <div style={{
        position: "relative", zIndex: 1, maxWidth: 520, margin: "0 auto",
        padding: "20px 20px 60px",
        transform: `translateY(${visible ? 0 : 32}px)`,
        transition: "transform 0.32s cubic-bezier(.22,.9,.32,1)",
      }}>
        {/* Close */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
          <button onClick={handleClose} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 20, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={16} color="#aaa" />
          </button>
        </div>

        {/* Eyebrow */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center", textTransform: "uppercase", letterSpacing: "0.28em", fontSize: 11, color: ORANGE_HOT, fontWeight: 600, marginBottom: 14 }}>
          <span style={{ height: 1, width: 36, background: `linear-gradient(90deg,transparent,${ORANGE})`, opacity: 0.7, display: "block" }} />
          HyperLaw · Membership
          <span style={{ height: 1, width: 36, background: `linear-gradient(90deg,${ORANGE},transparent)`, opacity: 0.7, display: "block" }} />
        </div>
        <h2 style={{ fontWeight: 900, fontStyle: "italic", textTransform: "uppercase", textAlign: "center", fontSize: "clamp(28px, 8vw, 44px)", color: PAPER, margin: "0 0 10px" }}>
          Choose Your <span style={{ color: ORANGE_HOT }}>Standing</span>
        </h2>
        <p style={{ textAlign: "center", color: DIM, fontSize: 13, lineHeight: 1.6, marginBottom: 28 }}>
          Three ways to work the case — upgrade any time.
        </p>

        {/* Swoosh */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <svg viewBox="0 0 420 26" style={{ width: "100%", maxWidth: 420, height: 26, filter: "drop-shadow(0 0 6px rgba(244,93,1,.55))" }} preserveAspectRatio="none">
            <path d="M0,20 L360,20 L420,4" stroke={ORANGE} strokeWidth="2.5" fill="none" strokeLinecap="round" />
          </svg>
        </div>

        {/* Swipe hint */}
        <div style={{ textAlign: "center", color: DIM, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M9 18l6-6-6-6" /></svg>
          Swipe to browse plans
        </div>

        {/* Carousel */}
        <div style={{ position: "relative", maxWidth: 460, margin: "0 auto" }}>
          <div style={{ overflow: "hidden", borderRadius: 22 }}>
            <div
              onPointerDown={onPointerDown} onPointerMove={onPointerMove}
              onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
              style={{
                display: "flex",
                transform: `translateX(-${activeIndex * 100}%)`,
                transition: isDragging ? "none" : "transform 0.38s cubic-bezier(.22,.9,.32,1)",
                cursor: isDragging ? "grabbing" : "grab", userSelect: "none",
              }}
            >
              {plans.map((plan, i) => {
                const isActive = i === activeIndex;
                const glowStyle: React.CSSProperties = isActive
                  ? { borderColor: "rgba(255,122,26,.75)", animation: "glowPulse 2.4s ease-in-out infinite" }
                  : {};
                return (
                  <div key={plan.id} style={{ flex: "0 0 100%", maxWidth: "100%", padding: 6, display: "flex" }}>
                    <div style={{ position: "relative", width: "100%", background: `linear-gradient(180deg,${PANEL} 0%,${PANEL2} 100%)`, border: `1px solid ${plan.id === "apex" ? "rgba(244,93,1,.35)" : LINE}`, borderRadius: 22, padding: "34px 26px 30px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", transition: "border-color .25s ease,box-shadow .35s ease", ...glowStyle }}>
                      {plan.badge && (
                        <div style={{ position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)", background: `linear-gradient(90deg,${ORANGE},${ORANGE_HOT})`, color: "#0a0908", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", padding: "6px 16px", borderRadius: 999, boxShadow: "0 6px 18px -6px rgba(244,93,1,.7)", whiteSpace: "nowrap" }}>
                          {plan.badge}
                        </div>
                      )}
                      <div style={{ width: 128, height: 128, margin: "10px 0 20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <img src={PLAN_ICONS[i]} alt={plan.name} style={{ width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(0 0 20px rgba(244,93,1,.4))", userSelect: "none" }} draggable={false} />
                      </div>
                      <div style={{ fontWeight: 900, fontStyle: "italic", textTransform: "uppercase", fontSize: 24, letterSpacing: "0.01em", color: PAPER }}>{plan.name}</div>
                      <div style={{ color: ORANGE_HOT, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 600, marginTop: 6, minHeight: 16 }}>{plan.tagline}</div>
                      <div style={{ margin: "22px 0 4px", display: "flex", alignItems: "baseline", gap: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 40 }}>{plan.price}</span>
                        {plan.cycle && <span style={{ color: DIM, fontSize: 14 }}>{plan.cycle}</span>}
                      </div>
                      <div style={{ color: DIM, fontSize: 12, marginBottom: 20 }}>{plan.priceNote}</div>
                      <p style={{ fontStyle: "italic", fontSize: 12.5, color: "#DAD3C9", lineHeight: 1.55, padding: "12px 6px 16px", borderTop: `1px solid ${LINE}`, marginTop: 2, marginBottom: 6, width: "100%" }}>{plan.quote}</p>
                      <div style={{ width: "100%", height: 1, background: LINE, margin: "4px 0 20px" }} />
                      <ul style={{ listStyle: "none", width: "100%", textAlign: "left", display: "flex", flexDirection: "column", gap: 11, marginBottom: 26, flex: 1, padding: 0 }}>
                        {plan.features.map((f, fi) => (
                          <li key={fi} style={{ display: "flex", gap: 9, fontSize: 13.5, lineHeight: 1.42, color: "#DAD3C9" }}>
                            <span style={{ flexShrink: 0, color: ORANGE_HOT }}>✓</span>
                            <span dangerouslySetInnerHTML={{ __html: f.text.replace(/<b>/g, `<strong style="color:${PAPER};font-weight:600">`).replace(/<\/b>/g, "</strong>") }} />
                          </li>
                        ))}
                      </ul>
                      <button
                        onClick={() => {
                          handleClose();
                          onBuyCredits?.();
                        }}
                        style={{ width: "100%", padding: "14px 18px", borderRadius: 12, border: plan.ctaStyle === "primary" ? "none" : `1px solid ${LINE}`, cursor: "pointer", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 13.5, marginTop: "auto", background: plan.ctaStyle === "primary" ? `linear-gradient(90deg,${ORANGE},${ORANGE_HOT})` : "transparent", color: plan.ctaStyle === "primary" ? "#0a0908" : PAPER, boxShadow: plan.ctaStyle === "primary" ? "0 10px 30px -10px rgba(244,93,1,.75)" : "none" }}
                      >
                        {plan.ctaLabel}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Dots */}
          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 20 }}>
            {plans.map((p, i) => (
              <button key={p.id} onClick={() => goTo(i)} style={{ width: 9, height: 9, borderRadius: "50%", border: "none", cursor: "pointer", padding: 0, background: i === activeIndex ? `linear-gradient(90deg,${ORANGE},${ORANGE_HOT})` : LINE, transform: i === activeIndex ? "scale(1.3)" : "scale(1)", boxShadow: i === activeIndex ? "0 0 10px rgba(244,93,1,.7)" : "none", transition: "all 0.25s ease" }} />
            ))}
          </div>

          {/* Arrows */}
          <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 14 }}>
            <button onClick={() => goTo(activeIndex - 1)} disabled={activeIndex === 0} style={{ width: 38, height: 38, borderRadius: "50%", border: `1px solid ${LINE}`, background: PANEL, color: PAPER, cursor: activeIndex === 0 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: activeIndex === 0 ? 0.3 : 1, transition: "all 0.2s ease" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <button onClick={() => goTo(activeIndex + 1)} disabled={activeIndex === plans.length - 1} style={{ width: 38, height: 38, borderRadius: "50%", border: `1px solid ${LINE}`, background: PANEL, color: PAPER, cursor: activeIndex === plans.length - 1 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: activeIndex === plans.length - 1 ? 0.3 : 1, transition: "all 0.2s ease" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}><path d="M9 18l6-6-6-6" /></svg>
            </button>
          </div>
        </div>

        <p style={{ textAlign: "center", color: "#4a4542", fontSize: 11, marginTop: 32, lineHeight: 1.6 }}>
          No subscription required · Pay only for what you unlock · Cancel paid plans anytime
        </p>
      </div>
    </div>
  );
}

// ─── PROFILE VIEW ─────────────────────────────────────────────────────────────
function ProfileView({ data, onOpenCase, onEasterEgg, onBuyCredits }: {
  data: AppData;
  onOpenCase: (c: HLCase) => void;
  onEasterEgg: () => void;
  onBuyCredits?: () => void;
}) {
  const { signOut } = useClerk();
  const { user } = useUser();
  const displayName = user?.fullName || user?.firstName || user?.emailAddresses?.[0]?.emailAddress || "Your Profile";
  const email = user?.emailAddresses?.[0]?.emailAddress || "";
  const isAdmin = email === ADMIN_EMAIL;

  const [showPlans, setShowPlans] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    aiApi.status().then(s => setAiConfigured(s.configured)).catch(() => setAiConfigured(false));
  }, []);

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

  const allReminders = [...data.reminders].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const upcoming = allReminders.filter(r => daysUntil(r.dueDate) >= -1);
  const past = allReminders.filter(r => daysUntil(r.dueDate) < -1);

  const settingRows = [
    { label: "AI Preferences", icon: Brain, items: ["Tutor Style", "AI Engine (Coming)"] },
    { label: "Data & Backups", icon: Archive, items: ["Export Backup", "Restore from Backup"] },
    { label: "Settings", icon: Settings, items: ["Notifications"] },
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px 120px" }}>
      {/* User info */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <div style={{ width: 60, height: 60, borderRadius: 30, background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <User size={28} color="#000" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{displayName}</div>
          {email && <div style={{ color: "#555", fontSize: 12, marginBottom: 2 }}>{email}</div>}
          <div style={{ color: "#555", fontSize: 13 }}>HyperLaw · {data.incidents.length} incidents · {data.cases.length} cases</div>
        </div>
      </div>

      {/* Membership card */}
      <button
        onClick={() => setShowPlans(true)}
        style={{
          width: "100%", background: "#141414", border: "1px solid #2a2a2a",
          borderRadius: 14, padding: "14px 16px", marginBottom: 16, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 12, textAlign: "left",
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE + "55")}
        onMouseLeave={e => (e.currentTarget.style.borderColor = "#2a2a2a")}
      >
        <Star size={18} color={ORANGE} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#ccc" }}>Membership</div>
          <div style={{ color: "#555", fontSize: 12 }}>Pay As You Go · Buy credits to unlock documents</div>
        </div>
        <ChevronRight size={15} color="#333" />
      </button>

      {/* Claude AI status card */}
      <div style={{ background: aiConfigured ? "#0d1a0d" : "#141414", border: `1px solid ${aiConfigured ? "#1a3a1a" : "#2a2a2a"}`, borderRadius: 14, padding: "16px 18px", marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <Key size={18} color={aiConfigured ? "#22c55e" : ORANGE} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Claude AI</div>
              <div style={{
                background: aiConfigured ? "#14532d" : "#1e1e1e",
                borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700,
                color: aiConfigured ? "#22c55e" : "#555",
              }}>
                {aiConfigured === null ? "Checking…" : aiConfigured ? "Connected" : "Not Connected"}
              </div>
            </div>
            <div style={{ color: "#666", fontSize: 13, lineHeight: 1.5 }}>
              {aiConfigured
                ? "Live AI analysis is active. The Tutor uses Claude for intelligent case reasoning and chat."
                : "Set ANTHROPIC_API_KEY in your Replit project Secrets to activate live AI analysis and chat in the Tutor."}
            </div>
            {!aiConfigured && aiConfigured !== null && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#555", background: "#1a1a1a", borderRadius: 8, padding: "8px 12px", fontFamily: "monospace" }}>
                Replit → Secrets → ANTHROPIC_API_KEY → your key
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reminders section */}
      {allReminders.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Bell size={13} color={ORANGE} />
            <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5 }}>REMINDERS</div>
          </div>
          <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, overflow: "hidden" }}>
            {upcoming.map((r, i) => {
              const days = daysUntil(r.dueDate);
              const urgent = days >= 0 && days <= 3;
              const hlCase = data.cases.find(c => c.id === r.caseId);
              return (
                <div key={r.id} style={{ padding: "13px 16px", borderBottom: i < allReminders.length - 1 ? "1px solid #1a1a1a" : "none", display: "flex", alignItems: "center", gap: 10 }}>
                  <Bell size={14} color={urgent ? "#ef4444" : "#555"} style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: "#ccc", fontWeight: 600 }}>{r.label}</div>
                    {hlCase && (
                      <button onClick={() => onOpenCase(hlCase)}
                        style={{ background: "none", border: "none", color: ORANGE, fontSize: 12, cursor: "pointer", padding: 0, marginTop: 2 }}>
                        {truncate(hlCase.title, 30)}
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: urgent ? "#ef4444" : "#555", fontWeight: 700, flexShrink: 0 }}>
                    {formatEventDate(r.dueDate)}<br />
                    <span style={{ fontSize: 11 }}>{days < 0 ? "Overdue" : days === 0 ? "Today" : `${days}d`}</span>
                  </div>
                </div>
              );
            })}
            {past.length > 0 && upcoming.length > 0 && <div style={{ padding: "8px 16px", fontSize: 11, color: "#333", background: "#0d0d0d" }}>{past.length} past deadline{past.length !== 1 ? "s" : ""} not shown</div>}
            {upcoming.length === 0 && <div style={{ padding: "16px", fontSize: 14, color: "#444", textAlign: "center" }}>No upcoming deadlines.</div>}
          </div>
        </div>
      )}

      {/* Legal & Compliance */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Shield size={13} color={ORANGE} />
          <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5 }}>LEGAL & COMPLIANCE</div>
        </div>
        <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, overflow: "hidden" }}>
          {[
            { label: "Terms of Service", href: `${basePath}/legal.html` },
            { label: "Privacy Policy", href: `${basePath}/legal.html` },
            { label: "AI Use & Legal Disclaimer", href: `${basePath}/legal.html` },
          ].map(({ label, href }, i, arr) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
                borderBottom: i < arr.length - 1 ? "1px solid #1a1a1a" : "none",
                textDecoration: "none", color: "#ccc",
              }}
            >
              <span style={{ fontSize: 14 }}>{label}</span>
              <ExternalLink size={13} color="#333" />
            </a>
          ))}
        </div>
      </div>

      {/* Admin panel — above support */}
      {isAdmin && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <Shield size={11} color={ORANGE} />
            <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5 }}>ADMIN</div>
          </div>
          <AdminPanel onClose={() => {}} />
        </div>
      )}

      {/* Support / Feedback */}
      <div style={{ marginTop: 12 }}>
        <button
          onClick={() => setShowSupport(true)}
          style={{
            width: "100%", padding: "14px 16px", background: "#111",
            border: "1px solid #1e1e1e", borderRadius: 12, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 10, textAlign: "left",
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE + "55")}
          onMouseLeave={e => (e.currentTarget.style.borderColor = "#1e1e1e")}
        >
          <MessageSquare size={16} color={ORANGE} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#ccc" }}>Support & Feedback</div>
            <div style={{ fontSize: 12, color: "#555" }}>Improvement ideas, bugs, or need assistance?</div>
          </div>
          <ChevronRight size={14} color="#333" />
        </button>
      </div>

      {/* Sign out */}
      <div style={{ marginTop: 12, marginBottom: 8 }}>
        <button
          onClick={() => signOut({ redirectUrl: "/" })}
          style={{
            width: "100%", padding: "13px 16px", background: "transparent",
            border: "1px solid #2a2a2a", borderRadius: 12, color: "#666",
            fontSize: 14, fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          Sign Out
        </button>
      </div>

      {/* Danger Zone — Account Deletion */}
      <div style={{ marginTop: 24, marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Trash2 size={13} color="#555" />
          <div style={{ fontSize: 11, color: "#333", fontWeight: 700, letterSpacing: 0.5 }}>DANGER ZONE</div>
        </div>
        <button
          onClick={async () => {
            const confirmed = window.confirm(
              "Permanently delete your account?\n\nThis cannot be undone. All your cases, incidents, and saved documents will be removed. Type OK to confirm."
            );
            if (!confirmed) return;
            try {
              // Purge all server-side user data first, then delete the Clerk account
              await aiApi.deleteUserData().catch(() => {}); // best-effort
              await user?.delete();
            } catch (e) {
              alert("Failed to delete account. Please contact support at Hyperlawcompliance@gmail.com");
            }
          }}
          style={{
            width: "100%", padding: "12px 16px", background: "transparent",
            border: "1px solid #2a1a1a", borderRadius: 12, color: "#444",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#ff444444"; e.currentTarget.style.color = "#ff4444"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a1a1a"; e.currentTarget.style.color = "#444"; }}
        >
          Delete Account
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 40, gap: 6 }}>
        <div style={{ color: "#1e1e1e", fontSize: 11, fontWeight: 700 }}>HYPERLAW</div>
        <button onClick={handleEggPress} style={{ background: "none", border: "none", cursor: "pointer", padding: 8, opacity: 0.15, WebkitTapHighlightColor: "transparent" }}>
          <img src="/hyperlaw-logo.png" alt="" style={{ width: 36, height: 36, borderRadius: 8, filter: "grayscale(100%)" }} />
        </button>
        {eggPressCount > 0 && eggPressCount < 5 && (
          <div style={{ color: "#2a2a2a", fontSize: 10 }}>{5 - eggPressCount} more…</div>
        )}
      </div>

      {showPlans && <PlansOverlay onClose={() => setShowPlans(false)} onBuyCredits={onBuyCredits} />}
      {showSupport && <SupportModal onClose={() => setShowSupport(false)} />}
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

interface NavItem { id: NavTab; icon: React.ElementType; label: string }
const NAV_ITEMS: NavItem[] = [
  { id: "home", icon: Home, label: "Home" },
  { id: "cases", icon: Folder, label: "Cases" },
  { id: "tutor", icon: GraduationCap, label: "Tutor" },
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
              <Icon size={22} /><span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.3 }}>{item.label}</span>
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        {right.map(item => {
          const Icon = item.icon;
          return (
            <button key={item.id} onClick={() => onChange(item.id)}
              style={{ flex: 1, background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, padding: "12px 4px", cursor: "pointer", color: active === item.id ? ORANGE : "#555", WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}>
              <Icon size={22} /><span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.3 }}>{item.label}</span>
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
  const { user } = useUser();
  const isAdmin = (user?.emailAddresses?.[0]?.emailAddress || "") === ADMIN_EMAIL;

  const [data, setDataRaw] = useState<AppData>(() => loadData());
  const [navTab, setNavTab] = useState<NavTab>("home");
  const [view, setView] = useState<AppView>({ type: "home" });
  const [showNewIncident, setShowNewIncident] = useState(false);
  const [preLinkedCaseId, setPreLinkedCaseId] = useState<string | null>(null);
  const [showEasterEgg, setShowEasterEgg] = useState(false);
  const [genDocsRefreshKey, setGenDocsRefreshKey] = useState(0);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | undefined>(undefined);
  const [showCreditShop, setShowCreditShop] = useState(false);
  const [checkoutToast, setCheckoutToast] = useState<string | null>(null);

  function setData(d: AppData) { setDataRaw(d); saveData(d); }

  // Fetch credit balance on mount and after checkout success
  const fetchCreditBalance = useCallback(async () => {
    try {
      const { creditBalance: bal } = await aiApi.creditBalance();
      setCreditBalance(bal);
    } catch { /* silently ignore — user may not be signed in yet */ }
  }, []);

  useEffect(() => {
    fetchCreditBalance();
    // Handle Stripe checkout return URL params
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      const credits = parseInt(params.get("credits") ?? "0", 10);
      setCheckoutToast(credits > 0 ? `✓ ${credits} credit${credits === 1 ? "" : "s"} added to your account!` : "✓ Purchase successful! Credits added.");
      // Clean URL without reloading
      window.history.replaceState({}, "", window.location.pathname);
      // Refresh balance after a short delay to allow webhook to process
      setTimeout(() => fetchCreditBalance(), 2000);
      setTimeout(() => setCheckoutToast(null), 6000);
    }
  }, [fetchCreditBalance]);

  function handleSaveIncident(payload: NewIncidentSavePayload) {
    const incident: Incident = {
      id: crypto.randomUUID(),
      title: payload.title,
      description: payload.description,
      dateOfEvent: payload.dateOfEvent,
      location: payload.location,
      category: payload.category,
      createdAt: Date.now(),
      caseId: preLinkedCaseId,
    };
    let d = addIncident(data, incident);
    if (preLinkedCaseId) d = addIncidentToCase(d, incident.id, preLinkedCaseId);
    setData(d);
    setShowNewIncident(false);
    const cid = preLinkedCaseId;
    setPreLinkedCaseId(null);
    if (cid) {
      const hlCase = d.cases.find(c => c.id === cid) ?? null;
      if (hlCase) { setNavTab("cases"); setView({ type: "case_detail", hlCase }); }
    } else {
      setNavTab("home");
      setView({ type: "incident_detail", incident });
    }
  }

  function handleConvertToCase(incident: Incident) {
    const hlCase: HLCase = {
      id: crypto.randomUUID(),
      title: `${incident.title} — Case`,
      incidentIds: [incident.id],
      notes: "",
      status: "open",
      createdAt: Date.now(),
    };
    const d1 = addCase(data, hlCase);
    const d2 = addIncidentToCase(d1, incident.id, hlCase.id);
    setData(d2);
    setNavTab("cases");
    setView({ type: "case_detail", hlCase });
  }

  function handleOpenIncident(incident: Incident) {
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

  function openNewIncident(caseId?: string) {
    setPreLinkedCaseId(caseId ?? null);
    setShowNewIncident(true);
  }

  const preLinkedCase = preLinkedCaseId ? data.cases.find(c => c.id === preLinkedCaseId) : null;

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
          onAddIncident={() => openNewIncident(hlCase.id)}
          onAddReminder={r => setData(addReminder(data, r))}
          onDeleteReminder={id => setData(deleteReminder(data, id))}
          onBack={() => setView({ type: "home" })}
          genDocsRefreshKey={genDocsRefreshKey}
          creditBalance={creditBalance}
          isAdmin={isAdmin}
          onBuyCredits={() => setShowCreditShop(true)}
          onDocGenerated={() => {
            setGenDocsRefreshKey(k => k + 1);
            fetchCreditBalance();
          }}
        />
      );
    }

    if (navTab === "tutor") {
      return (
        <TutorView
          data={data}
          initialIncident={view.type === "tutor" ? view.incident : null}
          initialCase={view.type === "tutor" ? view.hlCase : null}
          onDocSaved={() => setGenDocsRefreshKey(k => k + 1)}
        />
      );
    }

    if (navTab === "profile") {
      return <ProfileView data={data} onOpenCase={handleOpenCase} onEasterEgg={() => setShowEasterEgg(true)} onBuyCredits={() => setShowCreditShop(true)} />;
    }

    if (navTab === "cases") {
      return <CasesView data={data} onOpenCase={handleOpenCase} />;
    }

    return (
      <HomeView
        data={data}
        onOpenIncident={handleOpenIncident}
        onOpenCase={handleOpenCase}
        onNewIncident={() => openNewIncident()}
      />
    );
  }

  return (
    <div style={{ height: "100dvh", background: BG, color: "#fff", fontFamily: "Arial, sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Notification bell — fixed top-right */}
      <div style={{ position: "fixed", top: 8, right: 8, zIndex: 300 }}>
        <NotificationBell onOpenChat={sid => setChatSessionId(sid)} />
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
        {!isMobile && (
          <DesktopSideNav active={navTab} onChange={handleNavChange} onFab={() => openNewIncident()} />
        )}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <ErrorBoundary onReset={() => { setNavTab("home"); setView({ type: "home" }); }}>
            {currentContent()}
          </ErrorBoundary>
        </div>
      </div>

      {/* Persistent footer */}
      <div style={{
        flexShrink: 0, padding: "4px 16px",
        background: "#050505", borderTop: "1px solid #0e0e0e",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 9, color: "#252525", letterSpacing: "0.03em", textAlign: "center" }}>
          HyperLaw AI Legal Assistant · Legal Information • Document Drafting • Case Organization · {COMPLIANCE.FOOTER_TAGLINE}
        </span>
      </div>

      {isMobile && (
        <BottomNavBar active={navTab} onChange={handleNavChange} onFab={() => openNewIncident()} />
      )}

      {showNewIncident && (
        <NewIncidentOverlay
          onSave={handleSaveIncident}
          onClose={() => { setShowNewIncident(false); setPreLinkedCaseId(null); }}
          preLinkedCaseName={preLinkedCase?.title}
        />
      )}

      {showEasterEgg && <EasterEggScreen onClose={() => setShowEasterEgg(false)} />}

      {showCreditShop && (
        <CreditShopModal
          onClose={() => setShowCreditShop(false)}
          onPurchaseStarted={() => setShowCreditShop(false)}
        />
      )}

      {/* Checkout success toast */}
      {checkoutToast && (
        <div style={{
          position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
          background: "#0e2d14", border: "1px solid #1a5c25", borderRadius: 12,
          padding: "12px 20px", color: "#4ade80", fontSize: 14, fontWeight: 700,
          zIndex: 500, whiteSpace: "nowrap", boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
        }}>
          {checkoutToast}
        </div>
      )}

      {/* First-time welcome screen — shown once after first login */}
      <WelcomeModal />

      {chatSessionId && (
        <UserChatDrawer sessionId={chatSessionId} onClose={() => setChatSessionId(null)} />
      )}
    </div>
  );
}

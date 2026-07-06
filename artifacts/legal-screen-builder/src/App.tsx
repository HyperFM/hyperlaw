import React, { useState, useEffect, useRef, useCallback } from "react";
import { useClerk, useUser } from "@clerk/react";
import {
  Home, Folder, Plus, User, ChevronRight, ChevronLeft,
  X, Edit3, Trash2, ArrowRight, Key, Clock, AlertCircle, BookOpen,
  Settings, Star, Brain, Sliders, History, Archive, Copy, Check,
  FileText, Calendar, MapPin, Bell, Tag, ExternalLink, CheckCircle2,
  Download, MessageSquare, Shield, Loader2, Send, Upload, Eye, Lock, WifiOff,
} from "lucide-react";
import {
  Incident, HLCase, AppData, Reminder, IncidentCategory, CaseStatus, WorkflowStage,
  computeCaseHealth, getNextStep, caseCompletionPct,
} from "./types";
import {
  loadData, saveData, addIncident, updateIncident, deleteIncident,
  addCase, updateCase, deleteCase, addIncidentToCase,
  addReminder, deleteReminder,
} from "./store";
import { staticTutorService, TutorAnalysis } from "./services/tutor";
import { aiApi, AiChatMessage, ServerGeneratedDoc, CreditProduct, IndexCloud } from "./lib/aiApi";
import { api } from "./lib/api";
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
import { CaseHealthBar } from "./components/CaseHealthBar";
import { PartiesView } from "./pages/workflow/PartiesView";
import { CourtSelectionView } from "./pages/workflow/CourtSelectionView";
import { StoryView } from "./pages/workflow/StoryView";
import { TimelineView } from "./pages/workflow/TimelineView";
import { CaseReviewView } from "./pages/workflow/CaseReviewView";
import { AssemblyView } from "./pages/workflow/AssemblyView";
import { LearningIndexView } from "./pages/workflow/LearningIndexView";
import { IntakeChecklistView } from "./pages/workflow/IntakeChecklistView";
import ConfirmDeleteButton from "./components/ConfirmDeleteButton";

const ADMIN_EMAIL = "hypermodula@gmail.com";

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
function HomeView({ data, onOpenIncident, onOpenCase, onNewIncident, onCreateCase, onContinueCase, onUploadForNewCase }: {
  data: AppData;
  onOpenIncident: (i: Incident) => void;
  onOpenCase: (c: HLCase) => void;
  onNewIncident: () => void;
  onCreateCase: () => void;
  onContinueCase: (c: HLCase, stage: WorkflowStage) => void;
  onUploadForNewCase?: (file: File) => void;
}) {
  const uploadNewRef = useRef<HTMLInputElement>(null);

  // Most recent active case for the "Continue Your Case" card
  const activeCases = [...data.cases]
    .filter(c => c.status !== "closed")
    .sort((a, b) => b.createdAt - a.createdAt);
  const primaryCase = activeCases[0] ?? null;
  const otherActiveCases = activeCases.slice(1);
  const closedCases = data.cases.filter(c => c.status === "closed");

  const recentIncidents = [...data.incidents].sort((a, b) => b.createdAt - a.createdAt).slice(0, 3);

  const upcoming = [...data.reminders]
    .filter(r => daysUntil(r.dueDate) >= 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 3);

  const hasCases = data.cases.length > 0;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "28px 20px 120px" }}>
      {/* Logo */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <img src="/hyperlaw-logo.png" alt="HL" style={{ width: 32, height: 32, borderRadius: 8 }} />
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.5 }}>HyperLaw</div>
        </div>
        <div style={{ color: "#444", fontSize: 14, lineHeight: 1.5 }}>Civil rights legal self-help platform.</div>
      </div>

      {!hasCases ? (
        /* ── Empty state ─────────────────────────────────────────────────────── */
        <div style={{ textAlign: "center", paddingTop: 40 }}>
          <div style={{ fontSize: 52, marginBottom: 20 }}>⚖️</div>
          <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 10, letterSpacing: -0.3 }}>Start Your First Case</div>
          <div style={{ color: "#555", fontSize: 15, marginBottom: 36, lineHeight: 1.65, maxWidth: 340, margin: "0 auto 36px" }}>
            Create a case and walk through each phase — identify who was involved, select a court, tell your story, and build your timeline.
          </div>
          <button onClick={onCreateCase} style={{
            background: `linear-gradient(90deg, ${ORANGE}, #ff8c00)`, border: "none",
            borderRadius: 14, padding: "16px 32px", color: "#000", fontSize: 16, fontWeight: 900,
            cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8,
          }}>
            <Plus size={18} /> New Case
          </button>
          {onUploadForNewCase && (
            <>
              <input
                ref={uploadNewRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt,.rtf,.jpg,.jpeg,.png"
                style={{ display: "none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) { onUploadForNewCase(f); e.target.value = ""; } }}
              />
              <div style={{ display: "flex", justifyContent: "center" }}>
                <button onClick={() => uploadNewRef.current?.click()} style={{
                  background: "none", border: "1px solid #2a2a2a", borderRadius: 10,
                  padding: "11px 22px", color: "#555", fontSize: 14, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 8, marginTop: 12,
                }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE + "55")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "#2a2a2a")}
                >
                  <Upload size={15} /> Start from a Document
                </button>
              </div>
            </>
          )}
          {data.incidents.length > 0 && (
            <div style={{ marginTop: 36, textAlign: "left" }}>
              <div style={{ fontSize: 11, color: "#333", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10, textTransform: "uppercase" }}>Your Incidents</div>
              {recentIncidents.map(incident => (
                <button key={incident.id} onClick={() => onOpenIncident(incident)}
                  style={{ background: "#0a0a0a", border: "1px solid #141414", borderRadius: 12, padding: "12px 16px", textAlign: "left", cursor: "pointer", width: "100%", display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 3, background: CATEGORY_COLORS[incident.category], flexShrink: 0, marginTop: 5 }} />
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{incident.title}</div>
                  <ChevronRight size={13} color="#333" style={{ flexShrink: 0 }} />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* ── Primary case ─────────────────────────────────────────────────── */}
          {primaryCase && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 12, textTransform: "uppercase" }}>Continue Your Case</div>
              <PrimaryCaseCard
                hlCase={primaryCase}
                onOpen={() => onOpenCase(primaryCase)}
                onContinue={(stage) => onContinueCase(primaryCase, stage)}
              />
            </div>
          )}

          {/* ── Upcoming deadlines ───────────────────────────────────────────── */}
          {upcoming.length > 0 && (
            <div style={{ background: "#141414", border: `1px solid ${ORANGE}44`, borderRadius: 14, padding: "14px 16px", marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: ORANGE, fontWeight: 700, letterSpacing: 0.5, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                <Bell size={11} color={ORANGE} /> UPCOMING DEADLINES
              </div>
              {upcoming.map(r => {
                const days = daysUntil(r.dueDate);
                const rCase = data.cases.find(c => c.id === r.caseId);
                return (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: 3, background: days <= 3 ? "#ef4444" : days <= 7 ? ORANGE : "#3b82f6", flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: 13, color: "#ccc" }}>{r.label}</div>
                    <div style={{ fontSize: 12, color: days <= 3 ? "#ef4444" : "#666", fontWeight: 700 }}>
                      {days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days}d`}
                    </div>
                    {rCase && <div style={{ fontSize: 11, color: "#444" }}>{truncate(rCase.title, 20)}</div>}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Other open cases ─────────────────────────────────────────────── */}
          {otherActiveCases.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10, textTransform: "uppercase" }}>Other Cases</div>
              {otherActiveCases.map(c => (
                <button key={c.id} onClick={() => onOpenCase(c)}
                  style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, padding: "14px 16px", textAlign: "left", cursor: "pointer", width: "100%", display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE + "44")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "#1e1e1e")}>
                  <Folder size={18} color="#444" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
                    <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{formatDate(c.createdAt)}</div>
                  </div>
                  <div style={{ background: `${STATUS_COLORS[c.status]}22`, border: `1px solid ${STATUS_COLORS[c.status]}55`, borderRadius: 5, padding: "2px 7px", fontSize: 10, fontWeight: 700, color: STATUS_COLORS[c.status], flexShrink: 0 }}>
                    {STATUS_LABELS[c.status]}
                  </div>
                  <ChevronRight size={14} color="#333" style={{ flexShrink: 0 }} />
                </button>
              ))}
            </div>
          )}

          {/* ── Closed cases ─────────────────────────────────────────────────── */}
          {closedCases.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: "#333", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10, textTransform: "uppercase" }}>Closed</div>
              {closedCases.map(c => (
                <button key={c.id} onClick={() => onOpenCase(c)}
                  style={{ background: "#0a0a0a", border: "1px solid #141414", borderRadius: 12, padding: "12px 16px", textAlign: "left", cursor: "pointer", width: "100%", display: "flex", alignItems: "center", gap: 12, marginBottom: 6, opacity: 0.7 }}>
                  <Folder size={16} color="#333" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
                  <ChevronRight size={13} color="#333" style={{ flexShrink: 0 }} />
                </button>
              ))}
            </div>
          )}

          {/* ── Recent incidents (backward compat) ───────────────────────────── */}
          {recentIncidents.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: "#333", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10, textTransform: "uppercase" }}>Recent Incidents</div>
              {recentIncidents.map(incident => (
                <button key={incident.id} onClick={() => onOpenIncident(incident)}
                  style={{ background: "#0a0a0a", border: "1px solid #141414", borderRadius: 12, padding: "12px 16px", textAlign: "left", cursor: "pointer", width: "100%", display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 3, background: CATEGORY_COLORS[incident.category], flexShrink: 0, marginTop: 5 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#888" }}>{incident.title}</div>
                    <div style={{ color: "#444", fontSize: 12, marginTop: 2 }}>{truncate(incident.description, 60)}</div>
                  </div>
                  <ChevronRight size={13} color="#333" style={{ flexShrink: 0, marginTop: 3 }} />
                </button>
              ))}
            </div>
          )}

          {/* ── New case button ───────────────────────────────────────────────── */}
          <button onClick={onCreateCase} style={{
            width: "100%", background: "none", border: `1px solid ${ORANGE}44`,
            borderRadius: 12, padding: "13px", color: ORANGE, fontSize: 14,
            fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center",
            justifyContent: "center", gap: 6,
          }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE + "88")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = ORANGE + "44")}
          >
            <Plus size={15} /> New Case
          </button>
        </>
      )}
    </div>
  );
}

// ── Primary case card (home screen) ───────────────────────────────────────────

const STAGE_LABELS: Record<import("./types").WorkflowStage, string> = {
  parties: "Step 1 — Parties",
  court: "Step 2 — Court",
  story: "Step 3 — Story",
  timeline: "Step 4 — Timeline",
  assembly: "Step 5 — AI Assembly",
  learning: "Step 6 — Learning",
  documents: "Step 7 — Documents",
};

function PrimaryCaseCard({ hlCase, onOpen, onContinue }: {
  hlCase: HLCase;
  onOpen: () => void;
  onContinue: (stage: WorkflowStage) => void;
}) {
  const health = computeCaseHealth(hlCase);
  const next = getNextStep(hlCase, health);

  const miniChecks = [
    { label: "Parties", done: health.parties },
    { label: "Court", done: health.court },
    { label: "Story", done: health.story },
    { label: "Timeline", done: health.timeline },
    { label: "Assembly", done: !!hlCase.assembly },
  ];
  const donePct = Math.round((miniChecks.filter(c => c.done).length / miniChecks.length) * 100);

  return (
    <div style={{ background: "#111", border: `1px solid ${ORANGE}33`, borderRadius: 16, padding: "20px" }}>
      {/* Title + stage badge + view all */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
        <Folder size={20} color={ORANGE} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 900, fontSize: 17, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hlCase.title}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 11, color: "#555" }}>
              {formatDate(hlCase.createdAt)}
              {hlCase.court ? ` · ${hlCase.court.shortName ?? hlCase.court.name}` : ""}
            </div>
            <div style={{ background: `${ORANGE}22`, border: `1px solid ${ORANGE}44`, borderRadius: 5, padding: "1px 7px", fontSize: 10, fontWeight: 800, color: ORANGE, flexShrink: 0 }}>
              {STAGE_LABELS[hlCase.workflowStage] ?? hlCase.workflowStage}
            </div>
          </div>
        </div>
        <button onClick={onOpen} style={{ background: "none", border: "1px solid #2a2521", borderRadius: 8, padding: "5px 10px", color: "#555", fontSize: 12, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>
          View All
        </button>
      </div>

      {/* Mini 5-item health checklist */}
      <div style={{ background: "#0d0d0d", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 10, color: "#444", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Case Progress</span>
          <span style={{ fontSize: 11, color: donePct === 100 ? "#4ade80" : ORANGE, fontWeight: 800 }}>{donePct}%</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {miniChecks.map(c => (
            <div key={c.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ width: "100%", height: 3, borderRadius: 2, background: c.done ? "#4ade80" : "#1e1e1e", transition: "background 0.3s" }} />
              <span style={{ fontSize: 9, color: c.done ? "#4ade80" : "#333", fontWeight: 700, textAlign: "center", letterSpacing: 0.2 }}>{c.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Next step CTA */}
      <button
        onClick={() => onContinue(next.stage)}
        style={{
          width: "100%",
          background: `linear-gradient(90deg, ${ORANGE}, #ff8c00)`,
          border: "none", borderRadius: 12, padding: "14px",
          color: "#000", fontSize: 15, fontWeight: 900, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
        {next.label} <ChevronRight size={16} />
      </button>
    </div>
  );
}

// ─── INCIDENT DETAIL VIEW ─────────────────────────────────────────────────────
function IncidentDetailView({ incident, cases, onDelete, onConvertToCase, onAddToCase, onOpenInTutor, onBack }: {
  incident: Incident; cases: HLCase[];
  onDelete: (id: string) => void;
  onConvertToCase: (i: Incident) => void; onAddToCase: (incidentId: string, caseId: string) => void;
  onOpenInTutor: (i: Incident) => void; onBack: () => void;
}) {
  const [showCasePicker, setShowCasePicker] = useState(false);
  const [showDocConfirm, setShowDocConfirm] = useState(false);
  const [pendingExport, setPendingExport] = useState<(() => void) | null>(null);
  const linkedCase = cases.find(c => c.id === incident.caseId);
  const availableCases = cases.filter(c => c.id !== incident.caseId);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ padding: "12px 16px 12px 16px", paddingRight: 52, borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#666", display: "flex", alignItems: "center", gap: 4 }}>
          <ChevronLeft size={18} /><span style={{ fontSize: 13, fontWeight: 700 }}>Back</span>
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={() => { setPendingExport(() => () => exportIncidentPDF(incident).catch(() => {})); setShowDocConfirm(true); }} title="Export PDF"
          style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: 8 }}><Download size={16} /></button>
        <div style={{ width: 1, height: 18, background: "#2a2a2a", flexShrink: 0 }} />
        <ConfirmDeleteButton onDelete={() => onDelete(incident.id)} iconSize={15} title="Delete incident" />
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px 48px" }}>
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
              <BookOpen size={16} /> Open in Index
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
function CasesView({ data, onOpenCase, onDeleteCase }: {
  data: AppData;
  onOpenCase: (c: HLCase) => void;
  onDeleteCase: (id: string) => void;
}) {
  const sorted = [...data.cases].sort((a, b) => b.createdAt - a.createdAt);

  if (sorted.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center" }}>
        <Folder size={52} color="#1e1e1e" style={{ marginBottom: 16 }} />
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>No cases yet</div>
        <div style={{ color: "#555", fontSize: 14, lineHeight: 1.6, maxWidth: 280 }}>
          Create a new case to get started.
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px 120px" }}>
      <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>ALL CASES</div>
      {/* Free-case quota indicator */}
      <div style={{ marginBottom: 16, fontSize: 11, display: "flex", alignItems: "center", gap: 5,
        color: sorted.length >= 2 ? "#f59e0b" : "#555" }}>
        {sorted.length >= 2 && <AlertCircle size={11} />}
        {sorted.length} / 2 free case{sorted.length !== 1 ? "s" : ""} used
        {sorted.length >= 2 && " — upgrade to a plan for unlimited cases"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {sorted.map(c => {
          const stageLabel = STAGE_LABELS[c.workflowStage] ?? c.workflowStage;
          return (
            <div key={c.id} style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 16, display: "flex", overflow: "hidden" }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE + "55")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "#1e1e1e")}>
              {/* Main tap area — opens case */}
              <button onClick={() => onOpenCase(c)}
                style={{ flex: 1, background: "none", border: "none", padding: "18px 16px", textAlign: "left", cursor: "pointer", display: "flex", gap: 14, minWidth: 0 }}>
                <Folder size={22} color={ORANGE} style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 800, fontSize: 16, color: "#fff" }}>{c.title}</span>
                    {c.structuredCase && (
                      <span style={{ background: `${ORANGE}22`, border: `1px solid ${ORANGE}44`, borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700, color: ORANGE, letterSpacing: 0.4 }}>
                        ORGANIZED
                      </span>
                    )}
                  </div>
                  <div style={{ color: "#555", fontSize: 13 }}>
                    {stageLabel} · {formatDate(c.createdAt)}
                  </div>
                </div>
                <ChevronRight size={16} color="#333" style={{ flexShrink: 0, marginTop: 4 }} />
              </button>
              {/* Delete button */}
              <div style={{ borderLeft: "1px solid #1a1a1a", padding: "0 14px", display: "flex", alignItems: "center" }}>
                <ConfirmDeleteButton onDelete={() => onDeleteCase(c.id)} iconSize={14} title={`Delete "${c.title}"`} />
              </div>
            </div>
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
                <ConfirmDeleteButton onDelete={() => onDelete(r.id)} iconSize={13} title="Delete reminder" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── CASE DETAIL VIEW ─────────────────────────────────────────────────────────
function CaseDetailView({ hlCase, data, onUpdateCase, onDeleteCase, onOpenIncident, onOpenInTutor, onAddIncident, onAddReminder, onDeleteReminder, onBack, genDocsRefreshKey, creditBalance, onBuyCredits, onDocGenerated, isAdmin, onGoToPhase }: {
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
  onGoToPhase?: (stage: WorkflowStage) => void;
}) {
  const [editTitle, setEditTitle] = useState(hlCase.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [notes, setNotes] = useState(hlCase.notes);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [uploadPct, setUploadPct] = useState(0);
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
  const [lastGenerateDocType, setLastGenerateDocType] = useState<"complaint" | "motion" | "timeline" | null>(null);
  const [viewingDoc, setViewingDoc] = useState<ServerGeneratedDoc | null>(null);
  const [caseDetailTab, setCaseDetailTab] = useState<"overview" | "checklist">("overview");

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
    setUploadPct(0);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("caseId", hlCase.id);
      const result = await aiApi.uploadWithProgress(form, setUploadPct);
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
    setLastGenerateDocType(docType);
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
      <div style={{ padding: "12px 16px 12px 16px", paddingRight: 52, borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#666", display: "flex", alignItems: "center", gap: 4 }}>
          <ChevronLeft size={18} /><span style={{ fontSize: 13, fontWeight: 700 }}>Cases</span>
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={() => { setPendingCaseExport(() => () => exportCasePDF(hlCase, data.incidents).catch(() => {})); setShowCaseDocConfirm(true); }} title="Export PDF"
          style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: 8 }}><Download size={16} /></button>
        <div style={{ width: 1, height: 18, background: "#2a2a2a", flexShrink: 0 }} />
        <ConfirmDeleteButton onDelete={() => onDeleteCase(hlCase.id)} iconSize={15} title="Delete case" />
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

        {/* Workflow stage-awareness banner */}
        {onGoToPhase && (() => {
          const missing: { stage: WorkflowStage; label: string; hint: string }[] = [];
          if (!hlCase.parties.length) missing.push({ stage: "parties", label: "Add Parties", hint: "Identify everyone involved" });
          if (!hlCase.court) missing.push({ stage: "court", label: "Select Court", hint: "Choose the filing court" });
          if (!(hlCase.story ?? "").trim()) missing.push({ stage: "story", label: "Tell Your Story", hint: "Describe what happened" });
          if (!hlCase.timeline.length) missing.push({ stage: "timeline", label: "Build Timeline", hint: "Create the event sequence" });
          if (!missing.length) return null;
          return (
            <div style={{ background: "#0f0d08", border: "1px solid #3a2a10", borderRadius: 14, padding: "14px 16px", marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: "#9c7a40", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10 }}>
                Complete Your Case Setup
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {missing.map(m => (
                  <div key={m.stage} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 6, height: 6, borderRadius: 3, background: "#9c7a40", flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: "#888" }}>{m.hint}</span>
                    </div>
                    <button
                      onClick={() => onGoToPhase(m.stage)}
                      style={{ background: "none", border: "1px solid #3a2a10", borderRadius: 8, padding: "5px 12px", color: "#9c7a40", fontSize: 12, cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}
                    >
                      {m.label}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Action buttons */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
          <TapBtn variant="orange" onClick={() => onOpenInTutor(hlCase)} style={{ justifyContent: "center" }}>
            <BookOpen size={15} /> Analyze in Index
          </TapBtn>
          <TapBtn variant="ghost" onClick={onAddIncident} style={{ justifyContent: "center" }}>
            <Plus size={15} /> Add Incident
          </TapBtn>
        </div>

        {/* Tab bar — Overview / Checklist */}
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #1a1a1a", marginBottom: 24 }}>
          {(["overview", "checklist"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setCaseDetailTab(tab)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: "8px 16px 10px",
                fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6,
                color: caseDetailTab === tab ? ORANGE : "#444",
                borderBottom: `2px solid ${caseDetailTab === tab ? ORANGE : "transparent"}`,
                marginBottom: -1, transition: "all 0.15s",
              }}
            >
              {tab === "overview" ? "Overview" : `Checklist (${hlCase.intakeChecklist.filter(i => i.completed).length}/${12})`}
            </button>
          ))}
        </div>

        {caseDetailTab === "checklist" && (
          <IntakeChecklistView hlCase={hlCase} onUpdate={onUpdateCase} />
        )}

        {caseDetailTab === "overview" && (<>

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
            <div style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <Loader2 size={16} color={ORANGE} style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} />
                <div style={{ fontSize: 14, color: "#888", flex: 1 }}>
                  {uploadPct < 100 ? `Uploading… ${uploadPct}%` : "Processing document…"}
                </div>
              </div>
              <div style={{ background: "#1a1a1a", borderRadius: 4, height: 4, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 4, background: ORANGE,
                  width: `${Math.min(uploadPct, 100)}%`,
                  transition: "width 0.2s ease",
                }} />
              </div>
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
              No saved documents yet. Use the Index to analyze your case and save AI-generated content here.
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
                        <ConfirmDeleteButton
                          onDelete={async () => {
                            setDeletingDocId(doc.id);
                            await aiApi.generatedDocs.remove(doc.id).catch(() => {});
                            setGenDocs(prev => prev.filter(d => d.id !== doc.id));
                            setDeletingDocId(null);
                          }}
                          iconSize={13} title="Delete document"
                        />
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
                  onClick={() => {
                    if (!hlCase.jurisdiction?.trim()) {
                      setGenerateError("Please add a jurisdiction first — enter it in the Jurisdiction field above.");
                      return;
                    }
                    handleGenerateDoc(docType);
                  }}
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
            <div style={{ marginTop: 8, fontSize: 12, color: "#ef4444", background: "#1a0d0d", border: "1px solid #3a1a1a", borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: 1 }}>{generateError}</span>
              {lastGenerateDocType && (
                <button
                  onClick={() => { setGenerateError(null); handleGenerateDoc(lastGenerateDocType); }}
                  style={{ background: "#2a1010", border: "1px solid #5a2020", borderRadius: 6, padding: "4px 10px", cursor: "pointer", color: "#ef4444", fontSize: 11, fontWeight: 700, flexShrink: 0 }}
                >
                  Try again
                </button>
              )}
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

        </>)}
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

  const CLOUD_COLORS: Record<string, string> = {
    amendment: "#3b82f6",
    statute: "#d9711f",
    evidence: "#22c55e",
    party: "#8b5cf6",
    violation: "#ef4444",
    deadline: "#9ca3af",
    concept: "#eab308",
  };
  const CLOUD_LABELS: Record<string, string> = {
    amendment: "Constitutional",
    statute: "Statutes",
    evidence: "Evidence",
    party: "Parties",
    violation: "Violations",
    deadline: "Deadlines",
    concept: "Concepts",
  };

  const [target, setTarget] = useState<TutorTarget>(() => {
    if (initialIncident) return { kind: "incident", item: initialIncident };
    if (initialCase) return { kind: "case", item: initialCase };
    return null;
  });
  const [analysis, setAnalysis] = useState<TutorAnalysis | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const forceRefreshRef = useRef(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showPreVerify, setShowPreVerify] = useState(false);
  const [savingDoc, setSavingDoc] = useState(false);
  const [savedTargetKey, setSavedTargetKey] = useState<string | null>(null);
  const [selectedCloud, setSelectedCloud] = useState<IndexCloud | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [overviewExpanded, setOverviewExpanded] = useState(true);

  const currentTargetKey = target ? `${target.kind}:${target.item.id}` : null;

  useEffect(() => {
    setSavingDoc(false);
    setSavedTargetKey(null);
    setSelectedCloud(null);
    setActiveCategory("all");
  }, [currentTargetKey]); // eslint-disable-line react-hooks/exhaustive-deps

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

  useEffect(() => {
    if (!target) { setAnalysis(null); return; }
    setIsAnalyzing(true);
    const isForceRefresh = forceRefreshRef.current;
    forceRefreshRef.current = false;

    async function run() {
      try {
        let result: TutorAnalysis;
        if (target!.kind === "incident") {
          result = await aiApi.analyzeIncident(
            target!.item as Parameters<typeof aiApi.analyzeIncident>[0],
            { forceRefresh: isForceRefresh },
          );
        } else {
          const hlCase = target!.item as HLCase;
          const incs = data.incidents.filter(i => hlCase.incidentIds.includes(i.id));
          // If the case already has Organization Engine output, use it directly — no extra Claude call
          if (!isForceRefresh && hlCase.structuredCase?.clouds?.length) {
            result = {
              overview: hlCase.structuredCase.executiveSummary,
              insights: [],
              guidingQuestions: hlCase.structuredCase.gapQuestions ?? [],
              clouds: hlCase.structuredCase.clouds as IndexCloud[],
              fromCache: true,
            };
          } else {
            result = await aiApi.analyzeCase(hlCase, incs, {
              forceRefresh: isForceRefresh,
              caseId: hlCase.id,
            });
          }
        }
        setAnalysis(result);
      } catch {
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
  }, [target, relevantIncidentKey, refreshTrigger]);

  const clouds = (analysis?.clouds ?? []).filter(c => c && c.label && c.category);
  const categories = Array.from(new Set(clouds.map(c => c.category)));
  const filteredClouds = activeCategory === "all" ? clouds : clouds.filter(c => c.category === activeCategory);
  const hasClouds = clouds.length > 0;

  const insightBg: Record<string, string> = { gap: "#1c1600", key_point: "#121e2a", question: "#211e0e", notice: "#2a1212" };
  const insightBorder: Record<string, string> = { gap: "#4a3800", key_point: "#2a4a6a", question: "#5a4a12", notice: "#6a2222" };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Picker button */}
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
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 120px" }}>
        {!target ? (
          <div style={{ textAlign: "center", paddingTop: 60 }}>
            <BookOpen size={52} color="#1e1e1e" style={{ marginBottom: 16 }} />
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Index</div>
            <div style={{ color: "#555", fontSize: 15, lineHeight: 1.65, maxWidth: 320, margin: "0 auto" }}>
              Select an incident or case above. The Index will map your case into an interactive concept cloud.
            </div>
          </div>
        ) : isAnalyzing ? (
          <div style={{ textAlign: "center", paddingTop: 60 }}>
            <Loader2 size={36} color={ORANGE} style={{ animation: "spin 1s linear infinite", marginBottom: 16 }} />
            <div style={{ color: "#555", fontSize: 14 }}>Building your case Index…</div>
          </div>
        ) : analysis ? (
          <>
            {/* AI Disclaimer */}
            <div style={{ background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 10, padding: "10px 14px", marginBottom: 18, display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ width: 4, height: 4, borderRadius: 2, background: ORANGE, flexShrink: 0, marginTop: 5 }} />
              <p style={{ margin: 0, fontSize: 11, color: "#555", lineHeight: 1.6 }}>
                <strong style={{ color: "#666" }}>HyperLaw AI Index</strong> — {COMPLIANCE.AI_ANALYSIS_BANNER}
              </p>
            </div>

            {/* Toolbar */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5 }}>CASE INDEX</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {analysis.fromCache && (
                  <span style={{ fontSize: 10, color: "#555", background: "#111", border: "1px solid #1e1e1e", borderRadius: 4, padding: "2px 6px" }}>Cached</span>
                )}
                <button
                  onClick={() => { forceRefreshRef.current = true; setRefreshTrigger(n => n + 1); }}
                  style={{ background: "none", border: "1px solid #2a2a2a", borderRadius: 6, padding: "3px 8px", cursor: "pointer", color: "#555", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}
                >↻ Regenerate</button>
                <button
                  onClick={() => setShowPreVerify(true)}
                  style={{ background: `${ORANGE}15`, border: `1px solid ${ORANGE}44`, borderRadius: 6, padding: "3px 8px", cursor: "pointer", color: ORANGE, fontSize: 10, fontWeight: 700 }}
                >Pre-Verify</button>
              </div>
            </div>

            {/* Overview card (collapsible) */}
            <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, marginBottom: 20, overflow: "hidden" }}>
              <button
                onClick={() => setOverviewExpanded(e => !e)}
                style={{ width: "100%", padding: "12px 16px", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: "#555", letterSpacing: 0.5 }}>OVERVIEW</span>
                <ChevronRight size={14} color="#444" style={{ transform: overviewExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
              </button>
              {overviewExpanded && (
                <div style={{ padding: "0 16px 16px", borderTop: "1px solid #1a1a1a" }}>
                  <div style={{ paddingTop: 12, fontSize: 14, color: "#ccc", lineHeight: 1.65, fontFamily: "Georgia, serif" }}>{analysis.overview}</div>
                </div>
              )}
            </div>

            {/* Concept clouds or fallback insights */}
            {hasClouds ? (
              <>
                {/* Color legend */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                  {Object.entries(CLOUD_LABELS).filter(([cat]) => categories.includes(cat as any)).map(([cat, label]) => (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(prev => prev === cat ? "all" : cat)}
                      style={{
                        padding: "4px 12px", borderRadius: 20,
                        border: `1.5px solid ${activeCategory === cat ? CLOUD_COLORS[cat] : "#2a2a2a"}`,
                        background: activeCategory === cat ? CLOUD_COLORS[cat] + "22" : "transparent",
                        color: activeCategory === cat ? CLOUD_COLORS[cat] : "#555",
                        fontSize: 11, fontWeight: 700, cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 5,
                      }}
                    >
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: CLOUD_COLORS[cat] }} />
                      {label}
                    </button>
                  ))}
                </div>

                {/* Cloud grid */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 24 }}>
                  {filteredClouds.map(cloud => (
                    <button
                      key={cloud.id}
                      onClick={() => setSelectedCloud(cloud)}
                      style={{
                        background: CLOUD_COLORS[cloud.category] + "18",
                        border: `1.5px solid ${CLOUD_COLORS[cloud.category]}50`,
                        borderRadius: 24,
                        padding: "9px 18px",
                        color: CLOUD_COLORS[cloud.category],
                        fontSize: 13, fontWeight: 700,
                        cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 8,
                        WebkitTapHighlightColor: "transparent",
                        transition: "all 0.15s",
                      }}
                    >
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: CLOUD_COLORS[cloud.category], flexShrink: 0 }} />
                      {cloud.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              /* Fallback: insights + questions when no clouds (old cached data) */
              <>
                {(() => { analysis.insights.forEach(ins => { if ((ins.type as string) === "summary") (ins as any).type = "gap"; }); })()}
                {analysis.insights.filter(ins => ins.type !== "gap").length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>KEY INSIGHTS</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {analysis.insights.filter(ins => ins.type !== "gap").map((insight, i) => (
                        <div key={i} style={{ background: insightBg[insight.type] || "#111", border: `1px solid ${insightBorder[insight.type] || "#2a2a2a"}`, borderRadius: 12, padding: "14px 16px" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, color: "#666", marginBottom: 6, textTransform: "uppercase" }}>{insight.type.replace("_", " ")}</div>
                          <div style={{ fontSize: 14, color: "#ccc", lineHeight: 1.6 }}>{insight.text}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {analysis.insights.filter(ins => ins.type === "gap").length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, color: "#4a3800", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                      <AlertCircle size={11} color="#f59e0b" />
                      <span style={{ color: "#f59e0b" }}>FACTUAL GAPS</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {analysis.insights.filter(ins => ins.type === "gap").map((insight, i) => (
                        <div key={i} style={{ background: "#1c1600", border: "1px solid #4a3800", borderRadius: 12, padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                          <div style={{ width: 16, height: 16, border: "1.5px solid #4a3800", borderRadius: 3, flexShrink: 0, marginTop: 2 }} />
                          <div style={{ fontSize: 14, color: "#bbb", lineHeight: 1.6 }}>{insight.text}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {analysis.guidingQuestions.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
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
            )}

            {/* Save Index to Case */}
            {analysis && (() => {
              const caseId = target?.kind === "case" ? target.item.id
                : target?.kind === "incident" && target.item.caseId ? target.item.caseId
                : null;
              if (!caseId) return null;
              const isAlreadySaved = savedTargetKey === currentTargetKey && savedTargetKey !== null;
              return (
                <div style={{ marginBottom: 16 }}>
                  <button
                    onClick={async () => {
                      if (savingDoc || isAlreadySaved) return;
                      setSavingDoc(true);
                      try {
                        const cloudSummary = clouds.length > 0
                          ? "CONCEPT INDEX:\n" + clouds.map(c => `• ${c.label} (${c.category}): ${c.description}`).join("\n")
                          : "";
                        const content = [
                          analysis.overview,
                          cloudSummary,
                          "KEY INSIGHTS:",
                          analysis.insights.map(i => `• ${i.type.replace("_", " ").toUpperCase()}: ${i.text}`).join("\n"),
                        ].filter(Boolean).join("\n\n");
                        await aiApi.generatedDocs.create({
                          caseId,
                          title: `AI Index — ${target!.item.title}`,
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
                        : <><FileText size={14} /> Save Index to Case</>
                    }
                  </button>
                </div>
              );
            })()}
          </>
        ) : null}
      </div>

      {/* Cloud detail bottom sheet */}
      {selectedCloud && (
        <div
          onClick={() => setSelectedCloud(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 200, display: "flex", alignItems: "flex-end" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#0d0d0d", width: "100%", maxWidth: 640, margin: "0 auto",
              borderRadius: "20px 20px 0 0", padding: "24px 20px 52px",
              maxHeight: "78vh", overflowY: "auto",
              border: `1.5px solid ${CLOUD_COLORS[selectedCloud.category]}30`,
              borderBottom: "none",
            }}
          >
            <div style={{ width: 40, height: 4, background: "#2a2a2a", borderRadius: 2, margin: "0 auto 22px" }} />

            {/* Category badge + close */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span style={{
                background: CLOUD_COLORS[selectedCloud.category] + "22",
                border: `1px solid ${CLOUD_COLORS[selectedCloud.category]}55`,
                color: CLOUD_COLORS[selectedCloud.category],
                fontSize: 10, fontWeight: 700, padding: "3px 10px",
                borderRadius: 20, letterSpacing: 0.5, textTransform: "uppercase",
              }}>
                {CLOUD_LABELS[selectedCloud.category] ?? selectedCloud.category}
              </span>
              <div style={{ flex: 1 }} />
              <button onClick={() => setSelectedCloud(null)} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <X size={14} color="#555" />
              </button>
            </div>

            {/* Title */}
            <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", marginBottom: 14 }}>{selectedCloud.label}</div>

            {/* Description */}
            <div style={{ fontSize: 14, color: "#bbb", lineHeight: 1.7, marginBottom: 20, fontFamily: "Georgia, serif" }}>
              {selectedCloud.description}
            </div>

            {/* Supporting facts */}
            {selectedCloud.facts && selectedCloud.facts.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#444", letterSpacing: 0.5, marginBottom: 10 }}>SUPPORTING FACTS IN YOUR CASE</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {selectedCloud.facts.map((fact, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, background: "#111", border: "1px solid #1e1e1e", borderRadius: 10, padding: "10px 14px" }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: CLOUD_COLORS[selectedCloud.category], flexShrink: 0, marginTop: 5 }} />
                      <div style={{ fontSize: 13, color: "#ccc", lineHeight: 1.6 }}>{fact}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Why it matters */}
            {selectedCloud.importance && (
              <div style={{
                background: CLOUD_COLORS[selectedCloud.category] + "10",
                border: `1px solid ${CLOUD_COLORS[selectedCloud.category]}30`,
                borderRadius: 12, padding: "14px 16px", marginBottom: 16,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: CLOUD_COLORS[selectedCloud.category], letterSpacing: 0.5, marginBottom: 6 }}>WHY THIS MATTERS IN YOUR CASE</div>
                <div style={{ fontSize: 13, color: "#ccc", lineHeight: 1.65 }}>{selectedCloud.importance}</div>
              </div>
            )}

            {/* Related items */}
            {selectedCloud.relatedItems && selectedCloud.relatedItems.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#444", letterSpacing: 0.5, marginBottom: 10 }}>RELATED</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {selectedCloud.relatedItems.map((item, i) => (
                    <span key={i} style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: 20, padding: "4px 12px", fontSize: 12, color: "#666" }}>{item}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showPreVerify && analysis && (
        <PreVerificationModal
          title={target?.item.title}
          text={[
            analysis.overview,
            analysis.insights.map(i => `${i.type.replace("_", " ").toUpperCase()}: ${i.text}`).join("\n"),
            analysis.guidingQuestions.length > 0 ? "QUESTIONS:\n" + analysis.guidingQuestions.map((q, n) => `${n + 1}. ${q}`).join("\n") : "",
          ].filter(Boolean).join("\n\n")}
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
        { text: "Guided case Index included — plain-English answers to your legal questions", tbd: false },
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
        { text: "<b>Priority Index access</b> — no usage caps, full reasoning depth", tbd: false },
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
        { text: "<b>Priority everything</b> — support, Index, document analysis, front of the line", tbd: false },
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

// ─── HOLD-TO-DELETE BUTTON ────────────────────────────────────────────────────
// Uses a native touchstart listener (passive:false) so preventDefault() actually
// blocks the parent scroll container from stealing the touch.
function HoldToDeleteButton({ onComplete }: { onComplete: () => void }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const isHoldingRef = useRef(false);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(false);
  const HOLD_MS = 5000;

  function begin() {
    if (isHoldingRef.current) return;
    isHoldingRef.current = true;
    setActive(true);
    setProgress(0);
    startTimeRef.current = performance.now();
    function tick(now: number) {
      if (!isHoldingRef.current) return;
      const p = Math.min(1, (now - (startTimeRef.current ?? now)) / HOLD_MS);
      setProgress(p);
      if (p >= 1) { isHoldingRef.current = false; setActive(false); onComplete(); return; }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  function cancel() {
    if (!isHoldingRef.current) return;
    isHoldingRef.current = false;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    startTimeRef.current = null;
    setProgress(0);
    setActive(false);
  }

  useEffect(() => {
    const el = btnRef.current;
    if (!el) return;
    function onTouchStart(e: TouchEvent) { e.preventDefault(); begin(); }
    function onTouchEnd() { cancel(); }
    function onTouchCancel() { cancel(); }
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchCancel);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchCancel);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const secsLeft = Math.max(0, Math.ceil((1 - progress) * (HOLD_MS / 1000)));
  const circ = 2 * Math.PI * 30;

  return (
    <button
      ref={btnRef}
      onMouseDown={begin}
      onMouseUp={cancel}
      onMouseLeave={cancel}
      style={{
        width: "100%", padding: active ? "18px 14px" : "14px",
        borderRadius: 10, background: active ? "#200a0a" : "#130606",
        border: `1px solid ${active ? "#8a2a2a" : "#4a1a1a"}`,
        color: active ? "#cc6666" : "#884444",
        fontSize: 13, fontWeight: 700, cursor: "pointer",
        userSelect: "none", WebkitUserSelect: "none",
        touchAction: "none", display: "block",
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      {!active ? (
        "Hold 5 seconds to permanently delete account"
      ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ position: "relative", width: 72, height: 72 }}>
            <svg width={72} height={72} style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }}>
              <circle cx={36} cy={36} r={30} fill="none" stroke="#2a1a1a" strokeWidth={4} />
              <circle cx={36} cy={36} r={30} fill="none" stroke="#d9711f" strokeWidth={4}
                strokeDasharray={circ} strokeDashoffset={circ * (1 - progress)}
                strokeLinecap="round" style={{ filter: "drop-shadow(0 0 5px #d9711f)" }} />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: "#d9711f" }}>
              {secsLeft}s
            </div>
          </div>
          <span style={{ fontSize: 12, color: "#553333" }}>Keep holding…</span>
        </div>
      )}
    </button>
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

  // Account deletion
  const [showDeleteSection, setShowDeleteSection] = useState(false);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [deleteDone, setDeleteDone] = useState(false);

  function handleDeleteScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 30) setScrolledToBottom(true);
  }

  async function handleDeleteComplete() {
    setDeleteDone(true);
    try {
      await aiApi.deleteUserData().catch(() => {});
      await user?.delete();
    } catch {
      alert("Failed to delete account. Please contact support at hypermodula@gmail.com");
      setDeleteDone(false);
    }
  }

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
    { label: "AI Preferences", icon: Brain, items: ["Index Style", "AI Engine (Coming)"] },
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
          <div style={{ color: "#555", fontSize: 13 }}>HyperLaw · {data.cases.length} cases</div>
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

      {/* Close Account — gated entry point */}
      <div style={{ marginTop: 24, marginBottom: 8 }}>
        {!showDeleteSection ? (
          <button
            onClick={() => { setShowDeleteSection(true); setScrolledToBottom(false); setDeleteDone(false); }}
            style={{ background: "none", border: "none", color: "#3a3a3a", fontSize: 13, cursor: "pointer", padding: "4px 0", textDecoration: "underline", textUnderlineOffset: 3 }}
          >
            Want to close your account?
          </button>
        ) : (
          <div style={{ border: "1px solid #2a1a1a", borderRadius: 12, overflow: "hidden" }}>
            {/* Scrollable info panel */}
            <div
              onScroll={handleDeleteScroll}
              style={{ maxHeight: 260, overflowY: "auto", padding: "20px 18px", display: "flex", flexDirection: "column", gap: 14 }}
            >
              <div style={{ fontSize: 15, fontWeight: 800, color: "#884444" }}>😔 We're sorry to see you go.</div>
              <div style={{ fontSize: 13, color: "#666", lineHeight: 1.6 }}>
                Before you delete your account, here's everything that will be permanently and irreversibly removed:
              </div>

              {[
                { icon: "📁", label: "All your cases", detail: "Every case you've built — titles, facts, timelines, notes — gone." },
                { icon: "📄", label: "Uploaded documents", detail: "All files you've uploaded or generated within HyperLaw." },
                { icon: "🧠", label: "AI history & analysis", detail: "Every AI response, strategy note, and legal analysis produced for your cases." },
                { icon: "📋", label: "Incidents & evidence logs", detail: "All incident records, categories, and linked case entries." },
                { icon: "🔔", label: "Reminders & deadlines", detail: "Every deadline and reminder you've set." },
                { icon: "💳", label: "Credits & purchase history", detail: "Any unused credits are forfeited. Purchases are non-refundable." },
              ].map(item => (
                <div key={item.label} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#555", marginBottom: 2 }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: "#3a3a3a", lineHeight: 1.5 }}>{item.detail}</div>
                  </div>
                </div>
              ))}

              <div style={{ fontSize: 12, color: "#2a2a2a", lineHeight: 1.6, borderTop: "1px solid #1e1e1e", paddingTop: 12 }}>
                This action cannot be undone. There is no recovery option, no grace period, and no way to restore your data after deletion. If you're having trouble with the app, please reach out to support before taking this step.
              </div>

              {/* Scroll sentinel — reaching here unlocks the button */}
              <div style={{ height: 1 }} />
            </div>

            {/* Hold-to-delete — only shown after scrolling to bottom */}
            <div style={{ borderTop: "1px solid #1e1e1e", padding: "16px 18px", background: "#0a0a0a" }}>
              {!scrolledToBottom && (
                <div style={{ fontSize: 11, color: "#2a2a2a", textAlign: "center" }}>↓ Scroll down to continue</div>
              )}

              {scrolledToBottom && !deleteDone && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <HoldToDeleteButton onComplete={handleDeleteComplete} />
                  <button
                    onClick={() => setShowDeleteSection(false)}
                    style={{ background: "none", border: "none", color: "#333", fontSize: 12, cursor: "pointer", textAlign: "center" }}
                  >
                    Never mind, keep my account
                  </button>
                </div>
              )}

              {deleteDone && (
                <div style={{ textAlign: "center", padding: "8px 0" }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>👋</div>
                  <div style={{ fontSize: 13, color: "#555" }}>Deleting your account…</div>
                </div>
              )}
            </div>
          </div>
        )}
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
    content: `The screens were phase one.\n\nPhase two is organization — incidents, cases, evidence vaults, timelines.\n\nPhase three is understanding — the Index, learning mode, AI-assisted reasoning.\n\nPhase four is analysis — Claude reads your transcript, finds contradictions, flags admissions, suggests legal issues.\n\nSame interface. Different engine.`,
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

/**
 * Revolver cylinder barrel icon.
 * - Idle: completely static (no wasted resources).
 * - On spin (spinKey changes): fast spin that eases to a stop like a physical
 *   cylinder; chambers fill progressively as the rotation decelerates.
 * - Uses the provided PNG asset + an SVG overlay for the filled chambers.
 */
function BarrelIcon({ size = 28, caseCount = 0, spinKey = 0 }: {
  size?: number; caseCount?: number; spinKey?: number;
}) {
  const [rotation, setRotation] = useState(0);
  const rafRef    = useRef<number | null>(null);
  const startRef  = useRef<number>(0);
  const didMountRef = useRef(false);

  const TOTAL_DEG = 1800; // 5 full spins — satisfying physical feel
  const DURATION  = 1600; // ms total

  // Quartic ease-out: screams fast then smoothly coasts to a stop
  function easeOut(t: number) { return 1 - Math.pow(1 - t, 4); }

  useEffect(() => {
    // Skip the very first mount so the icon starts in its resting state
    if (!didMountRef.current) { didMountRef.current = true; return; }
    if (spinKey === 0) return;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    startRef.current = performance.now();

    function tick(now: number) {
      const elapsed = now - startRef.current;
      const t       = Math.min(elapsed / DURATION, 1);
      const eased   = easeOut(t);

      setRotation(eased * TOTAL_DEG);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setRotation(0);
        rafRef.current = null;
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [spinKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  const excess = Math.max(0, caseCount - 6);

  const transform = `rotate(${rotation}deg)`;

  return (
    <div style={{ position: "relative", width: size, height: size, display: "inline-flex", flexShrink: 0 }}>
      {/* PNG barrel image — spins with the rotation */}
      <img
        src="/barrel-cylinder.png"
        alt=""
        draggable={false}
        style={{
          width: size, height: size,
          transform,
          willChange: rafRef.current ? "transform" : "auto",
          userSelect: "none",
          pointerEvents: "none",
          display: "block",
        }}
      />
      {/* +N badge when user has more than 6 cases */}
      {excess > 0 && (
        <div style={{
          position: "absolute", top: -4, right: -4,
          background: ORANGE, color: "#000",
          fontSize: 7, fontWeight: 900, lineHeight: 1,
          borderRadius: 7, padding: "2px 4px",
          pointerEvents: "none",
          boxShadow: "0 1px 4px #0008",
        }}>+{excess}</div>
      )}
    </div>
  );
}

/** Index tab — cloud PNG */
function IndexIcon({ size = 40 }: { size?: number }) {
  return (
    <img src="/index-cloud.png" alt="" draggable={false}
      style={{ width: size, height: "auto", display: "block", pointerEvents: "none", userSelect: "none", flexShrink: 0, transform: "translateY(3px)", maxWidth: "none" }} />
  );
}

function ProfileIcon({ size = 40 }: { size?: number }) {
  return (
    <img src="/profile-icon.jpeg" alt="" draggable={false}
      style={{ width: size, height: size, display: "block", pointerEvents: "none", userSelect: "none", flexShrink: 0 }} />
  );
}

/** Box outline with a solid orange bar on the left side — the Builder tab icon */
function BuilderIcon({ size = 22 }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Outer rectangle (screen / box) */}
      <rect x="1.75" y="2.5" width="18.5" height="17" rx="2" stroke="currentColor" strokeWidth="1.6" fill="none" />
      {/* Orange vertical bar on the left inside */}
      <rect x="1.75" y="2.5" width="5.5" height="17" rx="2" fill={ORANGE} />
      {/* Clip the right-side corners of the bar flush with the outer border */}
      <rect x="5.5" y="2.5" width="1.75" height="17" fill={ORANGE} />
    </svg>
  );
}

type NavTab = "home" | "builder" | "tutor" | "profile";

interface NavItem { id: NavTab; icon: React.ElementType; label: string }
const NAV_ITEMS: NavItem[] = [
  { id: "home", icon: Home, label: "Barrel" },
  { id: "builder", icon: BuilderIcon, label: "Builder" },
  { id: "tutor", icon: Home, label: "Index" },
  { id: "profile", icon: User, label: "Profile" },
];

function BottomNavBar({ active, onChange, onFab, caseCount }: { active: NavTab; onChange: (t: NavTab) => void; onFab: () => void; caseCount: number }) {
  const [barrelSpinKey,  setBarrelSpinKey]  = useState(0);
  const left  = [NAV_ITEMS[0], NAV_ITEMS[1]];
  const right = [NAV_ITEMS[2], NAV_ITEMS[3]];

  function handleItemClick(id: NavTab) {
    if (id === "home") setBarrelSpinKey(k => k + 1);
    onChange(id);
  }

  function renderIcon(item: NavItem) {
    if (item.id === "home")    return <BarrelIcon  size={34} caseCount={caseCount} spinKey={barrelSpinKey} />;
    if (item.id === "tutor")   return <IndexIcon   size={55} />;
    if (item.id === "profile") return <ProfileIcon size={28} />;
    return <item.icon size={28} />;
  }

  return (
    <div style={{ borderTop: "1px solid #1e1e1e", background: "#0a0a0a", paddingBottom: "env(safe-area-inset-bottom)", flexShrink: 0, position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100 }}>
      <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: -22, zIndex: 10 }}>
        <button onClick={onFab}
          style={{ width: 46, height: 46, borderRadius: 23, background: ORANGE, border: "3px solid #0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: `0 4px 20px ${ORANGE}66`, WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}>
          <Plus size={22} color="#000" />
        </button>
      </div>
      <div style={{ display: "flex" }}>
        {left.map(item => (
          <button key={item.id} onClick={() => handleItemClick(item.id)}
            style={{ flex: 1, background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, padding: "6px 4px", cursor: "pointer", color: active === item.id ? ORANGE : "#555", WebkitTapHighlightColor: "transparent", touchAction: "manipulation", overflow: "visible" }}>
            <div style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", overflow: "visible" }}>{renderIcon(item)}</div>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.3 }}>{item.label}</span>
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {right.map(item => (
          <button key={item.id} onClick={() => handleItemClick(item.id)}
            style={{ flex: 1, background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, padding: "6px 4px", cursor: "pointer", color: active === item.id ? ORANGE : "#555", WebkitTapHighlightColor: "transparent", touchAction: "manipulation", overflow: "visible" }}>
            <div style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", overflow: "visible" }}>{renderIcon(item)}</div>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.3 }}>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function DesktopSideNav({ active, onChange, onFab, caseCount }: { active: NavTab; onChange: (t: NavTab) => void; onFab: () => void; caseCount: number }) {
  const [barrelSpinKey,  setBarrelSpinKey]  = useState(0);
  function handleItemClick(id: NavTab) {
    if (id === "home") setBarrelSpinKey(k => k + 1);
    onChange(id);
  }

  function renderSideIcon(item: NavItem) {
    if (item.id === "home")    return <BarrelIcon  size={28} caseCount={caseCount} spinKey={barrelSpinKey} />;
    if (item.id === "tutor")   return <IndexIcon   size={28} />;
    if (item.id === "profile") return <ProfileIcon size={28} />;
    return <item.icon size={18} />;
  }

  return (
    <div style={{ width: 200, flexShrink: 0, background: "#0a0a0a", borderRight: "1px solid #1e1e1e", display: "flex", flexDirection: "column", padding: "20px 12px", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", marginBottom: 16 }}>
        <img src="/hyperlaw-logo.png" alt="HyperLaw" style={{ width: 30, height: 30, borderRadius: 8 }} />
        <span style={{ fontWeight: 900, fontSize: 15, letterSpacing: 0.3 }}>HyperLaw</span>
      </div>
      <button onClick={onFab}
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 10, background: ORANGE, border: "none", color: "#000", cursor: "pointer", fontWeight: 800, fontSize: 14, marginBottom: 8 }}>
        <Plus size={18} /> New Case
      </button>
      {NAV_ITEMS.map(item => {
        const isActive = active === item.id;
        return (
          <button key={item.id} onClick={() => handleItemClick(item.id)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 10, background: isActive ? `${ORANGE}18` : "transparent", border: `1px solid ${isActive ? ORANGE + "44" : "transparent"}`, color: isActive ? ORANGE : "#666", cursor: "pointer", fontWeight: 700, fontSize: 14, textAlign: "left", transition: "all 0.15s" }}
            onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "#111"; }}
            onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}>
            {renderSideIcon(item)} {item.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Case Switcher Bar ────────────────────────────────────────────────────────

function CaseSwitcherBar({ cases, activeCaseId, onSwitch }: {
  cases: HLCase[];
  activeCaseId: string | null;
  onSwitch: (caseId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const activeCase = cases.find(c => c.id === activeCaseId);
  if (!activeCaseId || cases.length <= 1) return null;

  return (
    <>
      <div style={{ background: "#080808", borderBottom: "1px solid #151515", padding: "5px 12px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <Folder size={11} color="#444" />
        <span style={{ flex: 1, fontSize: 11, color: "#555", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: 0.3 }}>
          {activeCase?.title ?? "Case"}
        </span>
        <button onClick={() => setOpen(true)}
          style={{ background: "none", border: "1px solid #222", borderRadius: 6, padding: "2px 8px", fontSize: 10, color: "#555", cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", gap: 3, flexShrink: 0, letterSpacing: 0.5 }}>
          SWITCH <ChevronRight size={9} />
        </button>
      </div>

      {open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 600, display: "flex", alignItems: "flex-end" }}
          onClick={() => setOpen(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#111", borderRadius: "20px 20px 0 0", width: "100%", padding: "20px 20px calc(20px + env(safe-area-inset-bottom))", borderTop: `2px solid ${ORANGE}33` }}>
            <div style={{ width: 36, height: 3, background: "#2a2a2a", borderRadius: 2, margin: "0 auto 20px" }} />
            <div style={{ fontWeight: 900, fontSize: 15, marginBottom: 14, color: "#ccc" }}>Switch Case</div>
            {cases.map(c => (
              <button key={c.id} onClick={() => { onSwitch(c.id); setOpen(false); }}
                style={{ width: "100%", background: c.id === activeCaseId ? "#1a1a1a" : "#0d0d0d", border: `1px solid ${c.id === activeCaseId ? ORANGE + "55" : "#1e1e1e"}`, borderRadius: 12, padding: "12px 14px", textAlign: "left", cursor: "pointer", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                <Folder size={15} color={c.id === activeCaseId ? ORANGE : "#444"} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: c.id === activeCaseId ? "#fff" : "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
                  <div style={{ fontSize: 11, color: "#444", marginTop: 2 }}>
                    {c.structuredCase ? "✦ Organized" : c.assembly ? "Assembly done" : c.story ? "Story added" : "In progress"}
                  </div>
                </div>
                {c.id === activeCaseId && <CheckCircle2 size={14} color={ORANGE} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
type AppView =
  | { type: "home" }
  | { type: "incident_detail"; incident: Incident }
  | { type: "case_detail"; hlCase: HLCase }
  | { type: "case_parties"; caseId: string }
  | { type: "case_court"; caseId: string }
  | { type: "case_story"; caseId: string }
  | { type: "case_timeline"; caseId: string }
  | { type: "case_review"; caseId: string }
  | { type: "case_assembly"; caseId: string }
  | { type: "case_learning"; caseId: string }
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
  const [newCaseUploading, setNewCaseUploading] = useState(false);
  const [newCaseUploadPct, setNewCaseUploadPct] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [creditBalance, setCreditBalance] = useState<number | undefined>(undefined);
  const [showCreditShop, setShowCreditShop] = useState(false);
  const [showUpgradeGate, setShowUpgradeGate] = useState(false);
  const [checkoutToast, setCheckoutToast] = useState<string | null>(null);

  // ── Server sync refs ────────────────────────────────────────────────────────
  const serverSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Tracks which cases have already had organize triggered to prevent double-firing */
  const organizingCasesRef = useRef<Set<string>>(new Set());

  function setData(d: AppData) {
    setDataRaw(d);
    saveData(d);
    // Debounce server sync — avoids flooding during rapid updates (e.g. StoryView auto-save)
    if (serverSyncTimeoutRef.current) clearTimeout(serverSyncTimeoutRef.current);
    serverSyncTimeoutRef.current = setTimeout(() => {
      d.cases.forEach(c => {
        api.cases.upsert(c.id, c.title, c.workflowStage, c as unknown as Record<string, unknown>).catch(() => {});
      });
    }, 1500);
  }

  // Fetch credit balance on mount and after checkout success
  const fetchCreditBalance = useCallback(async () => {
    try {
      const { creditBalance: bal } = await aiApi.creditBalance();
      setCreditBalance(bal);
    } catch { /* silently ignore — user may not be signed in yet */ }
  }, []);

  // Offline / online detection
  useEffect(() => {
    const onOnline  = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online",  onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online",  onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // ── Load cases from server on mount — merge with localStorage ────────────────
  // Merge policy: local always wins (user may have unsynced edits).
  // Server only fills in cases that don't exist locally, or adds structuredCase
  // (which is always server-generated and never exists in local-only state).
  useEffect(() => {
    api.cases.list().then(serverCases => {
      if (!serverCases.length) return;
      setDataRaw(prev => {
        const localMap = new Map(prev.cases.map(c => [c.id, c]));
        let changed = false;
        serverCases.forEach(sc => {
          const local = localMap.get(sc.id);
          if (!local) {
            // Case on server but not in localStorage — add it (opened on a new device)
            const caseData = sc.caseData as unknown as HLCase;
            if (sc.structuredCase && !caseData.structuredCase) {
              caseData.structuredCase = sc.structuredCase as unknown as HLCase["structuredCase"];
            }
            localMap.set(sc.id, caseData);
            changed = true;
          } else if (!local.structuredCase && sc.structuredCase) {
            // Local case lacks structuredCase — pull it in from server (server-generated only)
            localMap.set(sc.id, { ...local, structuredCase: sc.structuredCase as unknown as HLCase["structuredCase"] });
            changed = true;
          }
          // Otherwise: local wins — user may have unsynced edits
        });
        if (!changed) return prev;
        const next = { ...prev, cases: Array.from(localMap.values()) };
        saveData(next);
        return next;
      });
    }).catch(() => {}); // Silent failure — user stays on local data
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-trigger Organization Engine when assembly completes ─────────────────
  useEffect(() => {
    data.cases.forEach(c => {
      if (
        c.assembly &&
        !c.structuredCase &&
        !organizingCasesRef.current.has(c.id) &&
        isOnline
      ) {
        organizingCasesRef.current.add(c.id);
        aiApi.organizeCase({ hlCase: c as Parameters<typeof aiApi.organizeCase>[0]["hlCase"], caseId: c.id })
          .then(structured => {
            const fullStructured = { ...structured, organizedAt: Date.now() };
            setDataRaw(prev => {
              const target = prev.cases.find(x => x.id === c.id);
              if (!target) return prev;
              const next = updateCase(prev, { ...target, structuredCase: fullStructured, structuredCaseGeneratedAt: Date.now() });
              saveData(next);
              return next;
            });
            api.cases.saveStructured(c.id, fullStructured as unknown as Record<string, unknown>).catch(() => {});
          })
          .catch(() => {
            organizingCasesRef.current.delete(c.id); // Allow retry on next render
          });
      }
    });
  }, [data.cases, isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (hlCase) { setNavTab("builder"); setView({ type: "case_detail", hlCase }); }
    } else {
      setNavTab("home");
      setView({ type: "incident_detail", incident });
    }
  }

  function handleCreateNewCase() {
    if (data.cases.length >= 2) {
      setShowUpgradeGate(true);
      return;
    }
    const newCase: HLCase = {
      id: crypto.randomUUID(),
      title: "New Case",
      incidentIds: [],
      notes: "",
      status: "open",
      createdAt: Date.now(),
      parties: [],
      court: null,
      story: "",
      timeline: [],
      workflowStage: "parties",
      intakeChecklist: [],
    };
    const d = addCase(data, newCase);
    setData(d);
    setNavTab("builder");
    setView({ type: "case_parties", caseId: newCase.id });
  }

  function handleContinueCase(hlCase: HLCase, stage: WorkflowStage) {
    const fresh = data.cases.find(c => c.id === hlCase.id) ?? hlCase;
    setNavTab("builder");
    if (stage === "parties") setView({ type: "case_parties", caseId: fresh.id });
    else if (stage === "court") setView({ type: "case_court", caseId: fresh.id });
    else if (stage === "story") setView({ type: "case_story", caseId: fresh.id });
    else if (stage === "timeline") setView({ type: "case_timeline", caseId: fresh.id });
    else if (stage === "assembly") setView({ type: "case_assembly", caseId: fresh.id });
    else if (stage === "learning") setView({ type: "case_learning", caseId: fresh.id });
    else setView({ type: "case_detail", hlCase: fresh });
  }

  function handleConvertToCase(incident: Incident) {
    // After 2 free cases, require at least 1 credit to create more
    if (data.cases.length >= 2) {
      setShowUpgradeGate(true);
      return;
    }
    const hlCase: HLCase = {
      id: crypto.randomUUID(),
      title: `${incident.title} — Case`,
      incidentIds: [incident.id],
      notes: "",
      status: "open",
      createdAt: Date.now(),
      // New workflow fields — pre-fill story from incident description
      parties: [],
      court: null,
      story: incident.description,
      timeline: [],
      workflowStage: "parties",
      intakeChecklist: [],
    };
    const d1 = addCase(data, hlCase);
    const d2 = addIncidentToCase(d1, incident.id, hlCase.id);
    setData(d2);
    setNavTab("builder");
    setView({ type: "case_parties", caseId: hlCase.id });
  }

  async function handleUploadForNewCase(file: File) {
    // After 2 free cases, require at least 1 credit to create more
    if (data.cases.length >= 2) {
      setShowUpgradeGate(true);
      return;
    }
    setNewCaseUploading(true);
    setNewCaseUploadPct(0);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await aiApi.uploadWithProgress(form, pct => setNewCaseUploadPct(pct));
      const ex = result.extraction;
      let title = "New Case";
      if (ex?.plaintiff && ex?.defendant) {
        title = `${ex.plaintiff} v. ${ex.defendant}`;
      } else if (ex?.plaintiff) {
        title = `${ex.plaintiff} — Case`;
      } else {
        title = file.name.replace(/\.[^.]+$/, "") + " — Case";
      }
      const newCase: HLCase = {
        id: crypto.randomUUID(),
        title: title.slice(0, 100),
        incidentIds: [],
        notes: ex?.summary ?? "",
        status: "open",
        createdAt: Date.now(),
        // Upload cases skip the new workflow — they jump straight to case_detail
        parties: [],
        court: null,
        story: "",
        timeline: [],
        workflowStage: "documents",
        intakeChecklist: [],
      };
      setData(addCase(data, newCase));
      setNavTab("builder");
      setView({ type: "case_detail", hlCase: newCase });
    } catch {
      // Silent failure — user stays on HomeView; non-critical path
    } finally {
      setNewCaseUploading(false);
      setNewCaseUploadPct(0);
    }
  }

  function handleOpenIncident(incident: Incident) {
    const fresh = data.incidents.find(i => i.id === incident.id) ?? incident;
    setView({ type: "incident_detail", incident: fresh });
    if (navTab !== "tutor") setNavTab("home");
  }

  function handleOpenCase(hlCase: HLCase) {
    const fresh = data.cases.find(c => c.id === hlCase.id) ?? hlCase;
    setView({ type: "case_detail", hlCase: fresh });
    setNavTab("builder");
  }

  function handleDeleteCaseWithSync(id: string) {
    setData(deleteCase(data, id));
    api.cases.delete(id).catch(() => {});
    setView({ type: "home" });
  }

  function handleNavChange(tab: NavTab) {
    setNavTab(tab);
    if (tab === "home") setView({ type: "home" });
    if (tab === "builder") setView({ type: "home" });
    if (tab === "tutor") setView({ type: "tutor" });
  }

  function openNewIncident(caseId?: string) {
    setPreLinkedCaseId(caseId ?? null);
    setShowNewIncident(true);
  }

  const preLinkedCase = preLinkedCaseId ? data.cases.find(c => c.id === preLinkedCaseId) : null;

  function currentContent() {
    // ── New workflow phase screens ─────────────────────────────────────────────
    if (view.type === "case_parties") {
      const hlCase = data.cases.find(c => c.id === view.caseId);
      if (!hlCase) { setView({ type: "home" }); return null; }
      return (
        <PartiesView
          hlCase={hlCase}
          onUpdate={c => setData(updateCase(data, c))}
          onNext={() => setView({ type: "case_court", caseId: hlCase.id })}
          onBack={() => setView({ type: "case_detail", hlCase })}
        />
      );
    }

    if (view.type === "case_court") {
      const hlCase = data.cases.find(c => c.id === view.caseId);
      if (!hlCase) { setView({ type: "home" }); return null; }
      return (
        <CourtSelectionView
          hlCase={hlCase}
          onUpdate={c => setData(updateCase(data, c))}
          onNext={() => setView({ type: "case_story", caseId: hlCase.id })}
          onBack={() => setView({ type: "case_parties", caseId: hlCase.id })}
        />
      );
    }

    if (view.type === "case_story") {
      const hlCase = data.cases.find(c => c.id === view.caseId);
      if (!hlCase) { setView({ type: "home" }); return null; }
      return (
        <StoryView
          hlCase={hlCase}
          onUpdate={c => setData(updateCase(data, c))}
          onNext={() => setView({ type: "case_timeline", caseId: hlCase.id })}
          onBack={() => setView({ type: "case_court", caseId: hlCase.id })}
        />
      );
    }

    if (view.type === "case_timeline") {
      const hlCase = data.cases.find(c => c.id === view.caseId);
      if (!hlCase) { setView({ type: "home" }); return null; }
      return (
        <TimelineView
          hlCase={hlCase}
          onUpdate={c => setData(updateCase(data, c))}
          onNext={() => setView({ type: "case_review", caseId: hlCase.id })}
          onBack={() => setView({ type: "case_story", caseId: hlCase.id })}
        />
      );
    }

    if (view.type === "case_review") {
      const hlCase = data.cases.find(c => c.id === view.caseId);
      if (!hlCase) { setView({ type: "home" }); return null; }
      return (
        <CaseReviewView
          hlCase={hlCase}
          onBack={() => setView({ type: "case_timeline", caseId: hlCase.id })}
          onEditPhase={(stage) => {
            if (stage === "parties") setView({ type: "case_parties", caseId: hlCase.id });
            else if (stage === "court") setView({ type: "case_court", caseId: hlCase.id });
            else if (stage === "story") setView({ type: "case_story", caseId: hlCase.id });
            else setView({ type: "case_timeline", caseId: hlCase.id });
          }}
          onContinue={() => setView({ type: "case_assembly", caseId: view.caseId })}
        />
      );
    }

    if (view.type === "case_assembly") {
      const hlCase = data.cases.find(c => c.id === view.caseId);
      if (!hlCase) { setView({ type: "home" }); return null; }
      return (
        <AssemblyView
          hlCase={hlCase}
          onUpdate={c => setData(updateCase(data, c))}
          onNext={() => setView({ type: "case_learning", caseId: hlCase.id })}
          onBack={() => setView({ type: "case_review", caseId: hlCase.id })}
          onSkipToCase={() => {
            const updated = data.cases.find(c => c.id === view.caseId) ?? hlCase;
            setView({ type: "case_detail", hlCase: updated });
          }}
        />
      );
    }

    if (view.type === "case_learning") {
      const hlCase = data.cases.find(c => c.id === view.caseId);
      if (!hlCase) { setView({ type: "home" }); return null; }
      return (
        <LearningIndexView
          hlCase={hlCase}
          onUpdate={c => setData(updateCase(data, c))}
          onNext={() => {
            const updated = data.cases.find(c => c.id === view.caseId) ?? hlCase;
            setView({ type: "case_detail", hlCase: updated });
          }}
          onBack={() => setView({ type: "case_assembly", caseId: hlCase.id })}
        />
      );
    }

    if (view.type === "incident_detail") {
      const incident = data.incidents.find(i => i.id === view.incident.id) ?? view.incident;
      return (
        <IncidentDetailView
          incident={incident}
          cases={data.cases}
          onDelete={id => { setData(deleteIncident(data, id)); setNavTab("home"); setView({ type: "home" }); }}
          onConvertToCase={handleConvertToCase}
          onAddToCase={(incidentId, caseId) => setData(addIncidentToCase(data, incidentId, caseId))}
          onOpenInTutor={i => { setNavTab("tutor"); setView({ type: "tutor", incident: i }); }}
          onBack={() => { setView({ type: "home" }); setNavTab("home"); }}
        />
      );
    }

    if (navTab === "builder" && view.type === "case_detail") {
      const hlCase = data.cases.find(c => c.id === view.hlCase.id) ?? view.hlCase;
      return (
        <CaseDetailView
          hlCase={hlCase}
          data={data}
          onUpdateCase={c => setData(updateCase(data, c))}
          onDeleteCase={id => handleDeleteCaseWithSync(id)}
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
          onGoToPhase={(stage) => {
            if (stage === "parties") setView({ type: "case_parties", caseId: hlCase.id });
            else if (stage === "court") setView({ type: "case_court", caseId: hlCase.id });
            else if (stage === "story") setView({ type: "case_story", caseId: hlCase.id });
            else if (stage === "timeline") setView({ type: "case_timeline", caseId: hlCase.id });
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

    if (navTab === "builder") {
      return <CasesView data={data} onOpenCase={handleOpenCase} onDeleteCase={id => handleDeleteCaseWithSync(id)} />;
    }

    return (
      <HomeView
        data={data}
        onOpenIncident={handleOpenIncident}
        onOpenCase={handleOpenCase}
        onNewIncident={() => openNewIncident()}
        onCreateCase={handleCreateNewCase}
        onContinueCase={handleContinueCase}
        onUploadForNewCase={handleUploadForNewCase}
      />
    );
  }

  return (
    <div style={{ height: "100dvh", background: BG, color: "#fff", fontFamily: "Arial, sans-serif", display: "flex", flexDirection: "column", overflow: "hidden", paddingTop: "env(safe-area-inset-top)" }}>
      {/* Notification bell — fixed top-right (hidden on Tutor tab) */}
      {navTab !== "tutor" && (
        <div style={{ position: "fixed", top: "calc(env(safe-area-inset-top) + 8px)", right: 8, zIndex: 300 }}>
          <NotificationBell onOpenChat={sid => setChatSessionId(sid)} />
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
        {!isMobile && (
          <DesktopSideNav active={navTab} onChange={handleNavChange} onFab={handleCreateNewCase} caseCount={data.cases.length} />
        )}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {!isOnline && (
            <div style={{ background: "#1a1100", borderBottom: "1px solid #4a3500", padding: "8px 16px", display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#f59e0b", flexShrink: 0 }}>
              <WifiOff size={13} />
              <span>You're offline — AI features are unavailable until your connection is restored.</span>
            </div>
          )}
          {/* Case switcher — visible when inside any case workspace view with multiple cases */}
          {navTab === "builder" && (() => {
            const activeCaseId =
              view.type === "case_detail" ? view.hlCase.id :
              (view.type === "case_parties" || view.type === "case_court" || view.type === "case_story" ||
               view.type === "case_timeline" || view.type === "case_review" ||
               view.type === "case_assembly" || view.type === "case_learning") ? view.caseId : null;
            return activeCaseId ? (
              <CaseSwitcherBar
                cases={data.cases}
                activeCaseId={activeCaseId}
                onSwitch={caseId => {
                  const c = data.cases.find(x => x.id === caseId);
                  if (c) setView({ type: "case_detail", hlCase: c });
                }}
              />
            ) : null;
          })()}
          <ErrorBoundary onReset={() => { setNavTab("home"); setView({ type: "home" }); }}>
            {currentContent()}
          </ErrorBoundary>
        </div>
      </div>

      {/* Persistent footer — desktop only; on mobile the bottom nav fills this role */}
      {!isMobile && (
        <div style={{
          flexShrink: 0, padding: "4px 16px",
          background: "#050505", borderTop: "1px solid #0e0e0e",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: 9, color: "#252525", letterSpacing: "0.03em", textAlign: "center" }}>
            HyperLaw AI Legal Assistant · Legal Information • Document Drafting • Case Organization · {COMPLIANCE.FOOTER_TAGLINE}
          </span>
        </div>
      )}

      {isMobile && (
        <BottomNavBar active={navTab} onChange={handleNavChange} onFab={handleCreateNewCase} caseCount={data.cases.length} />
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

      {/* Upgrade gate — shown when free 2-case limit is hit */}
      {showUpgradeGate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 500, display: "flex", alignItems: "flex-end" }}
          onClick={() => setShowUpgradeGate(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#111", borderRadius: "20px 20px 0 0", width: "100%", padding: "28px 24px calc(28px + env(safe-area-inset-bottom))", borderTop: `2px solid ${ORANGE}33` }}>
            <div style={{ width: 40, height: 4, background: "#2a2a2a", borderRadius: 2, margin: "0 auto 24px" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: `${ORANGE}18`, border: `1px solid ${ORANGE}44`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <AlertCircle size={20} color={ORANGE} />
              </div>
              <div>
                <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 2 }}>Free Plan Limit Reached</div>
                <div style={{ color: "#555", fontSize: 13 }}>You've used both free cases</div>
              </div>
            </div>
            <p style={{ color: "#888", fontSize: 14, lineHeight: 1.65, margin: "0 0 24px" }}>
              The free plan includes <strong style={{ color: "#ccc" }}>2 cases</strong>. Upgrade to Basic, Pro, or Apex for unlimited cases, priority AI processing, and advanced document generation.
            </p>
            <p style={{ color: "#555", fontSize: 12, lineHeight: 1.5, margin: "0 0 24px" }}>
              💡 <strong style={{ color: "#666" }}>Tip:</strong> You can also delete an existing case to free up a slot.
            </p>
            <button
              onClick={() => { setShowUpgradeGate(false); setNavTab("profile"); setView({ type: "home" }); }}
              style={{ width: "100%", padding: "16px", borderRadius: 14, border: "none", cursor: "pointer", fontWeight: 800, fontSize: 15, background: `linear-gradient(90deg, ${ORANGE}, #f45d01)`, color: "#000", marginBottom: 10 }}>
              View Plans &amp; Upgrade
            </button>
            <button
              onClick={() => setShowUpgradeGate(false)}
              style={{ width: "100%", padding: "14px", borderRadius: 14, border: "1px solid #2a2a2a", cursor: "pointer", fontWeight: 700, fontSize: 14, background: "none", color: "#555" }}>
              Not Now
            </button>
          </div>
        </div>
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

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth, useLogout } from "./lib/auth";
import {
  Home, Folder, Plus, User, ChevronRight, ChevronLeft,
  X, Edit3, Trash2, ArrowRight, Key, Clock, AlertCircle, BookOpen,
  Settings, Star, Brain, Sliders, History, Archive, Copy, Check,
  FileText, Calendar, MapPin, Bell, Tag, ExternalLink, CheckCircle2,
  Download, MessageSquare, Shield, Loader2, Send, Upload, Eye, Lock, WifiOff,
  Camera, Sparkles, Swords, BadgeDollarSign, ChevronUp, ChevronDown, Wrench, Fingerprint, Users,
  HeartPlus, Phone, Baby,
} from "lucide-react";
import {
  Incident, HLCase, AppData, Reminder, IncidentCategory, CaseStatus, WorkflowStage,
  Party, TimelineEvent,
} from "./types";
import {
  loadData, saveData, addIncident, updateIncident, deleteIncident,
  addCase, updateCase, deleteCase, addIncidentToCase,
  addReminder, deleteReminder,
} from "./store";
import { staticTutorService, TutorAnalysis } from "./services/tutor";
import { aiApi, AiChatMessage, ServerGeneratedDoc, CreditProduct, IndexCloud, CaseMemory, type DocumentType } from "./lib/aiApi";
import { api } from "./lib/api";
import { assignNickname } from "./lib/nicknames";
import { downscaleCasePhoto } from "./lib/casePhoto";
import useEmblaCarousel from "embla-carousel-react";
import ExhibitStudioView from "./pages/studio/ExhibitStudioView";
import VideoWorkspaceView from "./pages/studio/VideoWorkspaceView";
import AboutCreatorView from "./pages/creator/AboutCreatorView";
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
import { searchJurisdictions } from "./data/courts";
import { StoryView } from "./pages/workflow/StoryView";
import { TimelineView } from "./pages/workflow/TimelineView";
import { CaseReviewView } from "./pages/workflow/CaseReviewView";
import { AssemblyView } from "./pages/workflow/AssemblyView";
import { LearningIndexView } from "./pages/workflow/LearningIndexView";
import { IntakeChecklistView } from "./pages/workflow/IntakeChecklistView";
import ConfirmDeleteButton from "./components/ConfirmDeleteButton";
import PinGateModal from "./components/PinGateModal";
import ManageCasesModal from "./components/ManageCasesModal";
import { isPasskeySupported, createPasskey, cachePin, clearCachedPin } from "./lib/webauthn";
import {
  registerLoginPasskey, listLoginPasskeys, removeLoginPasskey,
  browserSupportsWebAuthn, type PasskeyListItem,
} from "./lib/webauthnLogin";
import DraftDecisionModal from "./components/DraftDecisionModal";
import GuidanceSessionModal from "./components/GuidanceSessionModal";
import IfpWizard from "./components/IfpWizard";
import DefenseModal from "./components/DefenseModal";
import CreditHistoryModal from "./components/CreditHistoryModal";

// ─── Constants ────────────────────────────────────────────────────────────────
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const ORANGE = "#d9711f";
const MILK_BG = "#0e0b09";
const MILK_LABEL = "#7a6a5c";
const MILK_TEXT = "#c9b7a8";
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

// ─── TOOLS VIEW ───────────────────────────────────────────────────────────────
// Decorative sliding marquee above the "Tools" heading — the tool icons
// below, duplicated once so the strip can loop seamlessly, drifting left forever.
const TOOL_BUBBLES = [
  {
    id: "battle-prep",
    icon: Swords,
    title: "Battle Prep",
    tagline: "Get scripted for your next court date.",
    detail: "Walks you through what happened at your last hearing and what's coming next, pulling straight from your case history — so you walk in knowing exactly what to say.",
  },
  {
    id: "voir-dire",
    icon: Users,
    title: "Voir Dire",
    tagline: "Jury selection, simplified.",
    detail: "A guide for picking your jury — who's in the room, what to ask them, and who to strike, for when you're doing a jury trial.",
  },
  {
    id: "family-court",
    icon: Baby,
    title: "Family Court",
    tagline: "Divorce, custody, and support — organized.",
    detail: "Divorce & dissolution (asset division, spousal support, settlement agreements) · Child custody & visitation (parenting plans, custody schedules, best-interest-of-child documentation) · Child support calculations · Protective orders.",
  },
] as const;

const TOOLS_MARQUEE_BUBBLE_SIZE = 56;
const TOOLS_MARQUEE_GAP = 16;
const TOOLS_MARQUEE_SET_WIDTH = TOOL_BUBBLES.length * (TOOLS_MARQUEE_BUBBLE_SIZE + TOOLS_MARQUEE_GAP);
// Enough copies that the strip is always wider than the viewport at any
// scroll offset — with only a handful of tools, 2 copies runs out of
// content before one full loop, leaving a visible gap.
const TOOLS_MARQUEE_REPEATS = 8;
// The glow "chases" down the strip — each bubble's flash is delayed a bit
// more than the last, in reverse index order so the light visibly travels
// against the strip's own scroll direction rather than drifting with it.
const TOOLS_MARQUEE_GLOW_STAGGER = 0.35;
const TOOLS_MARQUEE_GLOW_CYCLE = 10 * TOOLS_MARQUEE_GLOW_STAGGER;

function ToolsView() {
  const [openId, setOpenId] = useState<string | null>(null);

  // Inject the marquee/glow keyframes once
  (() => {
    const id = "hl-tools-marquee-kf";
    if (typeof document !== "undefined" && !document.getElementById(id)) {
      const s = document.createElement("style");
      s.id = id;
      s.textContent = `
        @keyframes hlToolsMarquee {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-${TOOLS_MARQUEE_SET_WIDTH}px); }
        }
        @keyframes hlToolsBubbleGlow {
          0%   { opacity: 0; }
          8%   { opacity: 0.9; }
          20%  { opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes hlToolsBubbleShadow {
          0%   { box-shadow: 0 0 0 0 ${ORANGE}00; border-color: ${ORANGE}33; }
          8%   { box-shadow: 0 0 14px 2px ${ORANGE}66; border-color: ${ORANGE}aa; }
          20%  { box-shadow: 0 0 0 0 ${ORANGE}00; border-color: ${ORANGE}33; }
          100% { box-shadow: 0 0 0 0 ${ORANGE}00; border-color: ${ORANGE}33; }
        }
      `;
      document.head.appendChild(s);
    }
  })();

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "28px 20px 120px", textAlign: "center" }}>

      {/* Sliding tool-icon marquee — the actual tools, with a glow that chases down the strip */}
      <div style={{ overflow: "hidden", margin: "36px auto 24px", width: "100%" }}>
        <div style={{ display: "flex", gap: TOOLS_MARQUEE_GAP, width: "max-content", animation: `hlToolsMarquee ${TOOLS_MARQUEE_REPEATS * 7}s linear infinite` }}>
          {Array.from({ length: TOOLS_MARQUEE_REPEATS }, () => TOOL_BUBBLES).flat().map((tool, i) => {
            const Icon = tool.icon;
            const glowDelay = `${i * TOOLS_MARQUEE_GLOW_STAGGER}s`;
            return (
              <div
                key={`${tool.id}-${i}`}
                style={{
                  flexShrink: 0, position: "relative", overflow: "hidden",
                  width: TOOLS_MARQUEE_BUBBLE_SIZE, height: TOOLS_MARQUEE_BUBBLE_SIZE, borderRadius: TOOLS_MARQUEE_BUBBLE_SIZE / 2, display: "flex", alignItems: "center", justifyContent: "center",
                  border: `1.5px solid ${ORANGE}33`,
                  background: `${ORANGE}16`,
                  animation: `hlToolsBubbleShadow ${TOOLS_MARQUEE_GLOW_CYCLE}s ease-in-out ${glowDelay} infinite`,
                }}
              >
                <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: 0, animation: `hlToolsBubbleGlow ${TOOLS_MARQUEE_GLOW_CYCLE}s ease-in-out ${glowDelay} infinite` }} />
                <Icon size={22} color={ORANGE} style={{ position: "relative" }} />
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 10, letterSpacing: -0.3 }}>Tools</div>
      <div style={{ color: "#555", fontSize: 15, lineHeight: 1.65, maxWidth: 320, margin: "0 auto 28px" }}>
        Courtroom tools for pro se litigants, built right into your case.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 360, margin: "0 auto", textAlign: "left" }}>
        {TOOL_BUBBLES.map(tool => {
          const open = openId === tool.id;
          const Icon = tool.icon;
          return (
            <button
              key={tool.id}
              onClick={() => setOpenId(open ? null : tool.id)}
              style={{
                background: "#111", border: `1px solid ${open ? ORANGE + "55" : "#1e1e1e"}`,
                borderRadius: 14, padding: "14px 16px", cursor: "pointer", textAlign: "left",
                transition: "border-color 0.15s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 18, background: `${ORANGE}16`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={17} color={ORANGE} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{tool.title}</div>
                  <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{tool.tagline}</div>
                </div>
                {open ? <ChevronUp size={15} color="#444" style={{ flexShrink: 0 }} /> : <ChevronDown size={15} color="#444" style={{ flexShrink: 0 }} />}
              </div>
              {open && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #1e1e1e", fontSize: 13, color: "#888", lineHeight: 1.6 }}>
                  {tool.detail}
                  <div style={{ marginTop: 8, fontSize: 11, color: "#3a3a3a", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>Coming soon</div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── HOME VIEW ────────────────────────────────────────────────────────────────
function HomeView({ data, onOpenIncident, onOpenCase, onNewIncident, onCreateCase, onContinueCase, onUploadForNewCase, uploadError, onClearUploadError, onUpdateCase }: {
  data: AppData;
  onOpenIncident: (i: Incident) => void;
  onOpenCase: (c: HLCase) => void;
  onNewIncident: () => void;
  onCreateCase: () => void;
  onContinueCase: (c: HLCase, stage: WorkflowStage) => void;
  onUploadForNewCase?: (file: File) => void;
  uploadError?: string | null;
  onClearUploadError?: () => void;
  onUpdateCase: (c: HLCase) => void;
}) {
  const uploadNewRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // Most recent active case for the "Continue Your Case" card
  const activeCases = [...data.cases]
    .filter(c => c.status !== "closed")
    .sort((a, b) => b.createdAt - a.createdAt);
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
        <div style={{ color: "#444", fontSize: 14, lineHeight: 1.5 }}>Legal self-help platform.</div>
      </div>

      {!hasCases ? (
        /* ── Empty state ─────────────────────────────────────────────────────── */
        <div
          style={{ textAlign: "center", paddingTop: 40 }}
          onDragEnter={onUploadForNewCase ? e => { e.preventDefault(); dragDepthRef.current++; setIsDraggingFile(true); } : undefined}
          onDragOver={onUploadForNewCase ? e => e.preventDefault() : undefined}
          onDragLeave={onUploadForNewCase ? e => { e.preventDefault(); dragDepthRef.current = Math.max(0, dragDepthRef.current - 1); if (dragDepthRef.current === 0) setIsDraggingFile(false); } : undefined}
          onDrop={onUploadForNewCase ? e => {
            e.preventDefault();
            dragDepthRef.current = 0;
            setIsDraggingFile(false);
            const f = e.dataTransfer.files?.[0];
            if (f) { onClearUploadError?.(); onUploadForNewCase(f); }
          } : undefined}
        >
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
              <div
                onClick={() => { onClearUploadError?.(); uploadNewRef.current?.click(); }}
                style={{
                  margin: "20px auto 0", maxWidth: 340, cursor: "pointer",
                  border: `1.5px dashed ${isDraggingFile ? ORANGE : "#2a2a2a"}`,
                  background: isDraggingFile ? ORANGE + "0f" : "transparent",
                  borderRadius: 14, padding: "18px 20px",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => { if (!isDraggingFile) (e.currentTarget as HTMLDivElement).style.borderColor = ORANGE + "55"; }}
                onMouseLeave={e => { if (!isDraggingFile) (e.currentTarget as HTMLDivElement).style.borderColor = "#2a2a2a"; }}
              >
                <Upload size={17} color={isDraggingFile ? ORANGE : "#555"} />
                <div style={{ fontSize: 14, fontWeight: 800, color: isDraggingFile ? ORANGE : "#888" }}>
                  Drag &amp; drop your complaint here
                </div>
                <div style={{ fontSize: 12, color: "#444", lineHeight: 1.5 }}>
                  Or anything with your full case details — tap to browse instead.<br />
                  Missing something? HyperLaw will ask you for it after.
                </div>
              </div>
              {uploadError && (
                <div style={{ marginTop: 10, padding: "8px 14px", background: "#1a0a0a", border: "1px solid #3a1a1a", borderRadius: 8, fontSize: 13, color: "#ef4444", display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                  {uploadError}
                  <button onClick={onClearUploadError} style={{ background: "none", border: "none", cursor: "pointer", color: "#666", padding: 0 }}><X size={12} /></button>
                </div>
              )}
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
          {/* ── Your cases — stacked up to 5; roster slider beyond that ─────────── */}
          {activeCases.length > 5 ? (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 12, textTransform: "uppercase" }}>Your Cases</div>
              <CaseSlider cases={activeCases} onOpenCase={onOpenCase} onContinueCase={onContinueCase} onUpdateCase={onUpdateCase} />
            </div>
          ) : activeCases.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 12, textTransform: "uppercase" }}>
                {activeCases.length === 1 ? "Continue Your Case" : "Your Cases"}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                {activeCases.map(c => (
                  <PrimaryCaseCard
                    key={c.id}
                    hlCase={c}
                    onOpen={() => onOpenCase(c)}
                    onContinue={(stage) => onContinueCase(c, stage)}
                    onUpdateCase={onUpdateCase}
                  />
                ))}
              </div>
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

          {/* Active cases now live in the circular slider above. */}

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

// ── Circular case slider (home screen) — swipe / loop through active cases ────
function CaseSlider({ cases, onOpenCase, onContinueCase, onUpdateCase }: {
  cases: HLCase[];
  onOpenCase: (c: HLCase) => void;
  onContinueCase: (c: HLCase, stage: WorkflowStage) => void;
  onUpdateCase: (c: HLCase) => void;
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: cases.length > 1, align: "center" });
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!emblaApi) return;
    const onSel = () => setSelected(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSel);
    onSel();
    return () => { emblaApi.off("select", onSel); };
  }, [emblaApi]);

  return (
    <div style={{ position: "relative" }}>
      <div ref={emblaRef} style={{ overflow: "hidden" }}>
        <div style={{ display: "flex" }}>
          {cases.map(c => (
            <div key={c.id} style={{ flex: "0 0 100%", minWidth: 0, boxSizing: "border-box" }}>
              <PrimaryCaseCard
                hlCase={c}
                onOpen={() => onOpenCase(c)}
                onContinue={(stage) => onContinueCase(c, stage)}
                onUpdateCase={onUpdateCase}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Nav arrows */}
      {cases.length > 1 && (
        <>
          <button onClick={() => emblaApi?.scrollPrev()} aria-label="Previous case"
            style={{ position: "absolute", left: -8, top: 46, background: "#141414ee", border: "1px solid #2a2a2a", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <ChevronLeft size={16} color="#aaa" />
          </button>
          <button onClick={() => emblaApi?.scrollNext()} aria-label="Next case"
            style={{ position: "absolute", right: -8, top: 46, background: "#141414ee", border: "1px solid #2a2a2a", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <ChevronRight size={16} color="#aaa" />
          </button>
        </>
      )}

      {/* Dots */}
      {cases.length > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 14 }}>
          {cases.map((c, i) => (
            <button key={c.id} onClick={() => emblaApi?.scrollTo(i)} aria-label={`Go to case ${i + 1}`}
              style={{ width: i === selected ? 20 : 6, height: 6, borderRadius: 3, border: "none", padding: 0, cursor: "pointer",
                background: i === selected ? ORANGE : "#333", transition: "width 0.2s, background 0.2s" }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Floating case bubble bar (home screen) ─────────────────────────────────────
// Fixed strip that rises above the bottom nav on the home screen. Each case is
// a swipeable bubble: lock icon (or photo) + case name + orange open button.
// Slides up on mount; hides completely if the user has no active cases.
function CaseBubbleBar({ cases, onOpenCase }: {
  cases: HLCase[];
  onOpenCase: (c: HLCase) => void;
}) {
  // One bubble on screen at a time — swipe to switch, instead of a scrollable
  // row of several. loop so swiping past the last case wraps to the first.
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: cases.length > 1,
    align: "start",
  });
  const [selected, setSelected] = useState(0);
  const [visible, setVisible] = useState(false);

  // Slide-up entrance animation
  useEffect(() => { const t = setTimeout(() => setVisible(true), 80); return () => clearTimeout(t); }, []);

  useEffect(() => {
    if (!emblaApi) return;
    const onSel = () => setSelected(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSel);
    onSel();
    return () => { emblaApi.off("select", onSel); };
  }, [emblaApi]);

  if (cases.length === 0) return null;

  const BUBBLE_W = 84;

  return (
    <div style={{
      position: "fixed",
      // The bottom tab bar is a separate position:fixed element (~58px tall)
      // at zIndex 100 — 78px clearance plus a higher zIndex here keeps the
      // case name from ever rendering behind it.
      bottom: `calc(78px + env(safe-area-inset-bottom))`,
      left: 18,
      zIndex: 110,
      width: BUBBLE_W,
      pointerEvents: "none",
      transform: `translateY(${visible ? 0 : 24}px)`,
      opacity: visible ? 1 : 0,
      transition: "transform 0.4s cubic-bezier(.22,.9,.32,1), opacity 0.32s ease",
    }}>
      <div style={{ pointerEvents: "all" }}>
        {/* Swipeable — one bubble at a time, no panel behind it */}
        <div ref={emblaRef} style={{ overflow: "hidden" }}>
          <div style={{ display: "flex" }}>
            {cases.map((c, i) => {
              const photo = c.photoDataUrl;
              return (
                <button
                  key={c.id}
                  onClick={() => onOpenCase(c)}
                  style={{
                    flex: `0 0 ${BUBBLE_W}px`,
                    borderRadius: 16,
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 2px",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  {/* Photo — only shown once the user has actually added one */}
                  {photo && (
                    <div style={{
                      width: 52, height: 52, borderRadius: "50%", flexShrink: 0,
                      border: `1.5px solid ${ORANGE}`,
                      overflow: "hidden",
                      boxShadow: `0 0 14px ${ORANGE}55, 0 4px 14px rgba(0,0,0,0.5)`,
                    }}>
                      <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                  )}

                  {/* Case name — single slim line, no icon fallback */}
                  <div style={{
                    fontSize: 10, fontWeight: 800, letterSpacing: 0.1,
                    color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,0.8)",
                    textAlign: "center", lineHeight: 1.2, width: "100%",
                    overflow: "hidden", textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {c.title}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Indicator dots */}
        {cases.length > 1 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 5, marginTop: 6 }}>
            {cases.map((_, i) => (
              <button key={i} onClick={() => emblaApi?.scrollTo(i)}
                style={{
                  width: i === selected ? 14 : 5, height: 4, borderRadius: 2,
                  border: "none", padding: 0, cursor: "pointer",
                  background: i === selected ? ORANGE : "#3a3a3a",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.6)",
                  transition: "width 0.22s ease, background 0.22s",
                  WebkitTapHighlightColor: "transparent",
                }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Primary case card (home screen) ───────────────────────────────────────────

// ─── Per-case photo — server-persisted (casesTable.casePhotoDataUrl), same
// reasoning as the studio video: a photo living only in this device's
// localStorage is gone for good the moment storage gets evicted (WKWebView
// does this under memory pressure) or the app is reinstalled — matches
// reports of a case photo vanishing from the barrel screen with no way back.
// The actual downscale/save helper lives in lib/casePhoto.ts, shared with
// VideoWorkspaceView's "pick a frame from the video" photo picker.
function saveCasePhoto(_caseId: string, file: File, onSaved: (dataUrl: string) => void, inputEl?: HTMLInputElement | null) {
  downscaleCasePhoto(file, onSaved, inputEl);
}

// ─── Deadline notifications (browser Notification API) ────────────────────────
function notificationsSupported() { return typeof window !== "undefined" && "Notification" in window; }
function useDeadlineNotifications(reminders: Reminder[]) {
  useEffect(() => {
    if (!notificationsSupported()) return;
    let cancelled = false;
    const fireDue = () => {
      if (cancelled || Notification.permission !== "granted") return;
      // Local-day key (not UTC) so due/overdue + de-dupe match the user's calendar day.
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      let notified: Record<string, string> = {};
      try { notified = JSON.parse(localStorage.getItem("hl_reminder_notified") || "{}"); } catch { notified = {}; }
      let changed = false;
      for (const r of reminders) {
        const days = daysUntil(r.dueDate); // local-day aware (see daysUntil)
        if (days <= 0 && notified[r.id] !== todayStr) {
          try {
            new Notification("HyperLaw deadline", {
              body: `${days < 0 ? "Overdue" : "Due today"}: ${r.label}`,
              tag: `hl-reminder-${r.id}`,
            });
          } catch { /* notification failed — ignore */ }
          notified[r.id] = todayStr;
          changed = true;
        }
      }
      if (changed) { try { localStorage.setItem("hl_reminder_notified", JSON.stringify(notified)); } catch { /* ignore quota */ } }
    };
    fireDue();
    const interval = setInterval(fireDue, 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [reminders]);
}

// ─── Merge an AI document analysis into a case ────────────────────────────────
// Fills ONLY empty fields (notes append, jurisdiction, parties, timeline) so we
// never overwrite the user's own edits — or clobber server-merged data on sync.
function mergeAnalysisIntoCase(hlCase: HLCase, analysis: {
  caseSummary?: string;
  parties?: Array<{ name: string; role: string; details?: string }>;
  events?: Array<{ date: string; description: string; significance?: string }>;
  jurisdictionSuggestions?: string[];
}): HLCase {
  const patch: Partial<HLCase> = {};

  // Notes — append the AI case summary once (idempotent: skip if already present).
  const summary = analysis.caseSummary?.trim();
  if (summary && !(hlCase.notes || "").includes(summary)) {
    patch.notes = [hlCase.notes, summary].filter(Boolean).join("\n\n");
  }

  // Jurisdiction — only when the case has none yet.
  const suggestedJurisdiction = analysis.jurisdictionSuggestions?.[0]?.trim();
  if (!hlCase.jurisdiction?.trim() && suggestedJurisdiction) patch.jurisdiction = suggestedJurisdiction;

  // Parties — only when none captured yet.
  if (hlCase.parties.length === 0 && analysis.parties?.length) {
    const OFFICIAL_HINTS = /\b(officer|police|deputy|sheriff|detective|sergeant|trooper|department|agency|city|county|state|federal|government|court|judge|magistrate|prosecut|district attorney|marshal|correctional|jail|prison|warden|official)\b/i;
    const used: string[] = [];
    patch.parties = analysis.parties.slice(0, 20).map(p => {
      const name = (p.name || "").trim();
      const tokens = name.split(/\s+/).filter(Boolean);
      const firstName = tokens[0] || name || "Party";
      const lastName = tokens.slice(1).join(" ");
      const isOfficial = OFFICIAL_HINTS.test(`${p.role || ""} ${p.details || ""} ${name}`);
      const { word, emoji } = assignNickname(used);
      used.push(word);
      const party: Party = {
        id: crypto.randomUUID(),
        firstName,
        lastName,
        type: isOfficial ? "official" : "civilian",
        nickname: word,
        nicknameEmoji: emoji,
        ...(isOfficial ? { agency: (p.details || p.role || "").trim() || undefined, title: (p.role || "").trim() || undefined } : {}),
      };
      return party;
    });
  }

  // Timeline — only when empty.
  if (hlCase.timeline.length === 0 && analysis.events?.length) {
    patch.timeline = analysis.events.slice(0, 40).map((ev, i): TimelineEvent => ({
      id: crypto.randomUUID(),
      title: (ev.date || "").trim() || `Event ${i + 1}`,
      description: [ev.description, ev.significance].filter(Boolean).join(" — ").trim(),
      order: i,
    }));
  }

  return { ...hlCase, ...patch };
}

// App-icon style: a square photo (or camera placeholder until one's set) with
// the case name underneath — no card background/border wrapping it anymore.
function PrimaryCaseCard({ hlCase, onOpen, onUpdateCase }: {
  hlCase: HLCase;
  onOpen: () => void;
  onContinue: (stage: WorkflowStage) => void; // kept for call-site compat (unused)
  onUpdateCase: (c: HLCase) => void;
}) {
  const photo = hlCase.photoDataUrl;
  const cardPhotoInputRef = useRef<HTMLInputElement>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <input ref={cardPhotoInputRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) saveCasePhoto(hlCase.id, f, dataUrl => {
            onUpdateCase({ ...hlCase, photoDataUrl: dataUrl });
            api.cases.savePhoto(hlCase.id, dataUrl).catch(() => {});
          }, e.currentTarget);
        }} />
      {/* No photo yet → the camera icon IS the "add a photo" button. Once set,
          tapping opens the case, same as tapping any app icon. */}
      <button
        onClick={photo ? onOpen : () => cardPhotoInputRef.current?.click()}
        title={photo ? hlCase.title : "Add a photo for this case"}
        style={{
          width: "100%", aspectRatio: "1", borderRadius: 20, flexShrink: 0,
          background: photo ? "#100e0c" : `${ORANGE}14`,
          border: `1px solid ${ORANGE}33`,
          padding: 0, cursor: "pointer", overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
        {photo
          // key forces a fresh <img> node whenever the photo value changes
          // (or the card remounts) instead of React reusing the existing node
          // and mutating its src in place — WKWebView occasionally leaves a
          // reused node blank after the view was backgrounded/re-shown, which
          // matches reports of a case photo vanishing until leaving and
          // reopening the screen.
          ? <img key={photo.slice(-24)} src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          : <Camera size={28} color={ORANGE} />}
      </button>
      <div onClick={onOpen} style={{
        cursor: "pointer", fontWeight: 800, fontSize: 13, color: "#fff",
        textAlign: "center", width: "100%", lineHeight: 1.3,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {hlCase.title}
      </div>
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
  const [notifPerm, setNotifPerm] = useState<string>(() => notificationsSupported() ? Notification.permission : "unsupported");
  function enableAlerts() {
    if (!notificationsSupported()) return;
    Notification.requestPermission().then(p => {
      setNotifPerm(p);
      if (p === "granted") { try { new Notification("HyperLaw alerts on", { body: "You'll be reminded when deadlines are due." }); } catch { /* ignore */ } }
    });
  }

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

      {notifPerm !== "granted" && notifPerm !== "unsupported" && (
        <button onClick={enableAlerts} disabled={notifPerm === "denied"}
          style={{ width: "100%", background: notifPerm === "denied" ? "#140f0d" : `${ORANGE}14`, border: `1px solid ${notifPerm === "denied" ? "#2a2018" : ORANGE + "44"}`, borderRadius: 10, padding: "9px 12px", marginBottom: 10, cursor: notifPerm === "denied" ? "default" : "pointer", display: "flex", alignItems: "center", gap: 8, textAlign: "left" }}>
          <Bell size={13} color={notifPerm === "denied" ? "#555" : ORANGE} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: notifPerm === "denied" ? "#555" : "#d8c4b2", fontWeight: 600 }}>
            {notifPerm === "denied" ? "Deadline alerts are blocked — enable notifications in your browser settings." : "Enable deadline alerts so you're notified when dates are due."}
          </span>
        </button>
      )}

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

// Document types whose drafting REQUIRES a source document to respond to (Sections 10/11).
const NEEDS_SOURCE: DocumentType[] = ["strengthen", "answer", "opposition", "defense_response"];

// ─── CASE DETAIL VIEW ─────────────────────────────────────────────────────────
// ─── ASSEMBLY PROGRESS — milky-orange case-journey strip (Sections 1–3) ────────
// ─── VERIFY PANEL — pre-draft readiness + gap check (Section 3) ────────────────
function VerifyPanel({ hlCase, hasFacts }: {
  hlCase: HLCase;
  hasFacts: boolean;
}) {
  const [open, setOpen] = useState(false);
  const checks = [
    { label: "Jurisdiction set", done: !!hlCase.jurisdiction?.trim(), hint: "Required before drafting — set it below." },
    { label: "Facts captured", done: hasFacts, hint: "Add parties, a timeline, or your story so drafts have substance." },
  ];
  const gaps = hlCase.structuredCase?.gapQuestions ?? [];
  const readyCount = checks.filter(c => c.done).length;
  const allReady = readyCount === checks.length && gaps.length === 0;

  return (
    <div style={{
      background: allReady ? "linear-gradient(180deg, #10190f 0%, #0d130c 100%)" : "linear-gradient(180deg, #1b1613 0%, #120f0d 100%)",
      border: `1px solid ${allReady ? "#2f5a2a" : ORANGE + "33"}`, borderRadius: 16, padding: "14px 16px", marginBottom: 22,
    }}>
      <button onClick={() => setOpen(v => !v)} style={{ width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
        {allReady
          ? <CheckCircle2 size={18} color="#4ade80" style={{ flexShrink: 0 }} />
          : <AlertCircle size={18} color={ORANGE} style={{ flexShrink: 0 }} />}
        <div style={{ flex: 1, textAlign: "left" }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: allReady ? "#8ff0a0" : "#f0dcc9" }}>{allReady ? "Ready to draft" : "Verify before drafting"}</div>
          <div style={{ fontSize: 11, color: MILK_LABEL, marginTop: 1 }}>
            {allReady ? "All checks passed — your drafts will be well-grounded." : `${readyCount}/${checks.length} checks passed${gaps.length ? ` · ${gaps.length} open question${gaps.length !== 1 ? "s" : ""}` : ""}`}
          </div>
        </div>
        {open ? <ChevronUp size={15} color="#7a6a5c" /> : <ChevronDown size={15} color="#7a6a5c" />}
      </button>

      {open && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 9 }}>
          {checks.map(c => (
            <div key={c.label} style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
              {c.done
                ? <Check size={15} color="#4ade80" style={{ flexShrink: 0, marginTop: 1 }} />
                : <div style={{ width: 13, height: 13, borderRadius: "50%", border: `1.5px solid ${ORANGE}88`, flexShrink: 0, marginTop: 2 }} />}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: c.done ? "#cfc0b3" : "#f0dcc9" }}>{c.label}</div>
                {!c.done && <div style={{ fontSize: 11, color: MILK_LABEL, marginTop: 1, lineHeight: 1.45 }}>{c.hint}</div>}
              </div>
            </div>
          ))}
          {gaps.length > 0 && (
            <div style={{ marginTop: 4, borderTop: `1px solid ${ORANGE}22`, paddingTop: 11 }}>
              <div style={{ fontSize: 10.5, color: MILK_LABEL, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 9 }}>Open questions to strengthen your case</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {gaps.map((q, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: MILK_TEXT, lineHeight: 1.5 }}>
                    <span style={{ color: ORANGE, fontWeight: 800, flexShrink: 0 }}>{i + 1}.</span>
                    <span>{q}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CaseDetailView({ hlCase, data, onUpdateCase, onDeleteCase, onOpenIncident, onOpenInTutor, onAddIncident, onAddReminder, onDeleteReminder, onBack, genDocsRefreshKey, creditBalance, onBuyCredits, onDocGenerated, isAdmin, isApex, onGoToPhase }: {
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
  isApex?: boolean;
  onGoToPhase?: (stage: WorkflowStage) => void;
}) {
  const [editTitle, setEditTitle] = useState(hlCase.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [uploadState, setUploadState] = useState<"idle" | "receiving" | "received" | "intake" | "gate" | "analyzing" | "done" | "error">("idle");
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadResult, setUploadResult] = useState<{ fileName: string; analysis: CaseMemory } | null>(null);
  const [showConfirmedFlash, setShowConfirmedFlash] = useState(false);
  const casePhoto = hlCase.photoDataUrl;
  const casePhotoInputRef = useRef<HTMLInputElement>(null);
  const [showCaseDocConfirm, setShowCaseDocConfirm] = useState(false);
  const [pendingCaseExport, setPendingCaseExport] = useState<(() => void) | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingDocId, setPendingDocId] = useState<string | null>(null);
  const [intakeStep, setIntakeStep] = useState(0);
  const [intakeAnswers, setIntakeAnswers] = useState({ docType: "", preparedBy: "", hasParties: "", hasDates: "", additionalContext: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [jurisdiction, setJurisdiction] = useState(hlCase.jurisdiction ?? "");
  const [editingJurisdiction, setEditingJurisdiction] = useState(false);
  const [jurisdictionFocused, setJurisdictionFocused] = useState(false);
  const jurisdictionMatches = jurisdictionFocused ? searchJurisdictions(jurisdiction) : [];
  const [locationSearchState, setLocationSearchState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [locationResults, setLocationResults] = useState<Array<{ name: string; level: string; note: string }>>([]);

  async function searchByLocation() {
    if (!jurisdiction.trim()) return;
    setLocationSearchState("loading");
    setLocationResults([]);
    try {
      const { results } = await aiApi.findCourthouse(jurisdiction.trim(), hlCase.id);
      setLocationResults(results);
      setLocationSearchState("done");
    } catch {
      setLocationSearchState("error");
    }
  }
  const [genDocs, setGenDocs] = useState<ServerGeneratedDoc[]>([]);
  const [genDocsLoading, setGenDocsLoading] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [generatingDocType, setGeneratingDocType] = useState<DocumentType | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  type GenArgs = { docType: DocumentType; opts?: { draftContext?: string; sourceDocument?: { title?: string; content: string }; title?: string } };
  const [lastGenerateArgs, setLastGenerateArgs] = useState<GenArgs | null>(null);
  const [viewingDoc, setViewingDoc] = useState<ServerGeneratedDoc | null>(null);
  // Drafting / fee-waiver / defense flow modals (Sections 5, 6, 10, 11)
  // Decision layer → optional guidance session → confirm → draft (usage-based).
  const [decisionModal, setDecisionModal] = useState<{ docType: DocumentType; label: string; needsSource: boolean; guidanceJustCompleted?: boolean } | null>(null);
  const [guidanceModal, setGuidanceModal] = useState<{ docType: DocumentType; label: string; needsSource: boolean; topics: string[] } | null>(null);
  const [showIfp, setShowIfp] = useState(false);
  const [showDefense, setShowDefense] = useState(false);
  const [showMoreDocs, setShowMoreDocs] = useState(false);
  const [recentHistory, setRecentHistory] = useState<Array<{ source: "history" | "timeline"; id: string; date: string; label: string; summary: string; type: string }>>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  useEffect(() => {
    setGenDocsLoading(true);
    aiApi.generatedDocs.list(hlCase.id)
      .then(setGenDocs)
      .catch(() => {})
      .finally(() => setGenDocsLoading(false));
  }, [hlCase.id, genDocsRefreshKey]); // genDocsRefreshKey increments when Tutor saves a doc

  // Auto-dismiss the "Case details confirmed" flash after it plays (brief §2).
  useEffect(() => {
    if (!showConfirmedFlash) return;
    const t = setTimeout(() => setShowConfirmedFlash(false), 2600);
    return () => clearTimeout(t);
  }, [showConfirmedFlash]);

  // Fetch recent case activity for the history strip.
  useEffect(() => {
    aiApi.getCaseHistory(hlCase.id)
      .then(h => setRecentHistory(h))
      .catch(() => {});
  }, [hlCase.id]);

  // Step 1 — file selected → store immediately (no AI), show received screen
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = "";
    setPendingFile(file);
    setPendingDocId(null);
    setUploadError(null);
    setIntakeStep(0);
    setIntakeAnswers({ docType: "", preparedBy: "", hasParties: "", hasDates: "", additionalContext: "" });
    setUploadState("receiving");
    setUploadPct(0);
    const form = new FormData();
    form.append("file", file);
    form.append("caseId", hlCase.id);
    aiApi.uploadWithProgress(form, setUploadPct)
      .then(result => {
        if (!result.docId) {
          setUploadError("Document could not be stored. Please try again.");
          setUploadState("error");
          return;
        }
        setPendingDocId(result.docId);
        setUploadState("received");
      })
      .catch(err => { setUploadError((err as Error).message || "Upload failed"); setUploadState("error"); });
  }

  // Step 4 — user completed hold-to-analyze → deduct credit + deep Claude analysis
  async function handleAnalyzeDocument() {
    if (!pendingDocId) {
      setUploadError("Document was not stored — please upload the file again.");
      setUploadState("error");
      return;
    }
    setUploadState("analyzing");
    try {
      const result = await aiApi.buildCaseMemory({ docId: pendingDocId, caseId: hlCase.id, intakeAnswers });
      // Merge everything the AI extracted — summary → notes, plus jurisdiction,
      // parties, and timeline — filling only empty fields so we never clobber the
      // user's own edits (or the server-merged data on the next sync).
      const merged = mergeAnalysisIntoCase(hlCase, result.analysis);
      if (merged.jurisdiction && merged.jurisdiction !== hlCase.jurisdiction) setJurisdiction(merged.jurisdiction);
      onUpdateCase(merged);
      setUploadResult({ fileName: result.fileName, analysis: result.analysis });
      setUploadState("done");
      setShowConfirmedFlash(true); // brief §2 — brief "Case details confirmed" moment
    } catch (err: unknown) {
      setUploadError((err as Error).message || "Analysis failed");
      setUploadState("error");
    }
  }

  async function handleGenerateDoc(docType: DocumentType, opts?: GenArgs["opts"]) {
    setGeneratingDocType(docType);
    setLastGenerateArgs({ docType, opts });
    setGenerateError(null);
    const incidents = data.incidents.filter(i => hlCase.incidentIds.includes(i.id));
    try {
      const doc = await aiApi.generateDocument({
        caseId: hlCase.id,
        documentType: docType,
        title: opts?.title,
        draftContext: opts?.draftContext,
        sourceDocument: opts?.sourceDocument,
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
      setViewingDoc(doc); // auto-open so the user can verify formatting
      onDocGenerated?.(); // refresh credit balance after the usage-based charge
    } catch (err: unknown) {
      const e = err as { message?: string };
      setGenerateError(e.message || "Generation failed. Try again.");
    } finally {
      setGeneratingDocType(null);
    }
  }

  // Open the AI decision layer for a document type (Section 10), gating on jurisdiction.
  function openDraft(docType: DocumentType, label: string) {
    if (!hlCase.jurisdiction?.trim()) {
      setGenerateError("Please add a jurisdiction first — set it in the Jurisdiction field above.");
      return;
    }
    setGenerateError(null);
    setDecisionModal({ docType, label, needsSource: NEEDS_SOURCE.includes(docType) });
  }

  const incidents = data.incidents.filter(i => hlCase.incidentIds.includes(i.id))
    .sort((a, b) => (a.dateOfEvent || a.createdAt.toString()).localeCompare(b.dateOfEvent || b.createdAt.toString()));

  function saveTitle() {
    onUpdateCase({ ...hlCase, title: editTitle.trim() || hlCase.title });
    setEditingTitle(false);
  }

  // Relevant templates based on incident categories in this case
  const caseCategories = new Set(incidents.map(i => i.category));
  const relevantTemplates = TEMPLATES.filter(t => t.categories.some(c => caseCategories.has(c)));

  return (
    <div className="hl-assembly" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
      {/* Two thin glowing orange side lines framing the Assembly screen (brief §3) */}
      <div aria-hidden style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 2, background: `linear-gradient(180deg, transparent, ${ORANGE}, transparent)`, boxShadow: `0 0 8px ${ORANGE}, 0 0 16px ${ORANGE}55`, opacity: 0.4, animation: "hlSideGlow 4.5s ease-in-out infinite", pointerEvents: "none", zIndex: 3 }} />
      <div aria-hidden style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: 2, background: `linear-gradient(180deg, transparent, ${ORANGE}, transparent)`, boxShadow: `0 0 8px ${ORANGE}, 0 0 16px ${ORANGE}55`, opacity: 0.4, animation: "hlSideGlow 4.5s ease-in-out infinite", pointerEvents: "none", zIndex: 3 }} />
      {/* "Case details confirmed" — appears then fades after an upload is organized (brief §2) */}
      {showConfirmedFlash && (
        <div aria-hidden style={{ position: "absolute", top: 64, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 40, pointerEvents: "none" }}>
          <div style={{ animation: "hlConfirmFlash 2.6s ease forwards", background: "linear-gradient(180deg, #1b1613, #120f0d)", border: `1px solid ${ORANGE}66`, borderRadius: 999, padding: "9px 16px", display: "flex", alignItems: "center", gap: 8, boxShadow: `0 10px 30px rgba(0,0,0,0.55), 0 0 18px ${ORANGE}33` }}>
            <Check size={15} color={ORANGE} />
            <span style={{ fontSize: 12.5, fontWeight: 800, color: "#fff" }}>Case details confirmed</span>
          </div>
        </div>
      )}
      <div style={{ padding: "12px 16px 12px 16px", paddingRight: 52, borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#666", display: "flex", alignItems: "center", gap: 4 }}>
          <ChevronLeft size={18} /><span style={{ fontSize: 13, fontWeight: 700 }}>Cases</span>
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={() => { setPendingCaseExport(() => () => exportCasePDF(hlCase, data.incidents).catch(() => {})); setShowCaseDocConfirm(true); }} title="Export PDF"
          style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: 8 }}><Download size={16} /></button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px 48px", background: MILK_BG, backgroundImage: `radial-gradient(130% 55% at 50% 0%, ${ORANGE}14 0%, rgba(0,0,0,0) 62%)`, backgroundSize: "170% 150%", backgroundRepeat: "no-repeat", animation: "hlMilkDrift 16s ease-in-out infinite" }}>
        {editingTitle ? (
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input value={editTitle} onChange={e => setEditTitle(e.target.value)} autoFocus
              onKeyDown={e => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setEditingTitle(false); }}
              style={{ flex: 1, background: "#111", border: `1px solid ${ORANGE}`, borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 20, fontWeight: 800, outline: "none", boxSizing: "border-box" }} />
            <TapBtn variant="orange" onClick={saveTitle} style={{ padding: "0 16px" }}><Check size={16} /></TapBtn>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 10 }}>
            <input ref={casePhotoInputRef} type="file" accept="image/*" style={{ display: "none" }}
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) saveCasePhoto(hlCase.id, f, dataUrl => {
                  onUpdateCase({ ...hlCase, photoDataUrl: dataUrl });
                  api.cases.savePhoto(hlCase.id, dataUrl).catch(() => {});
                }, e.currentTarget);
              }} />
            <button onClick={() => casePhotoInputRef.current?.click()} title="Set a photo for this case"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0, borderRadius: 16, position: "relative" }}>
              {casePhoto
                ? <img key={casePhoto.slice(-24)} src={casePhoto} alt="" style={{ width: 92, height: 92, borderRadius: 16, objectFit: "cover", border: `1px solid ${ORANGE}66`, display: "block" }} />
                : <div style={{ width: 92, height: 92, borderRadius: 16, background: `${ORANGE}18`, border: `1px solid ${ORANGE}33`, display: "flex", alignItems: "center", justifyContent: "center" }}><Folder size={38} color={ORANGE} /></div>}
              <div style={{ position: "absolute", right: -3, bottom: -3, width: 26, height: 26, borderRadius: "50%", background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #0a0a0a" }}>
                <Camera size={13} color="#000" />
              </div>
            </button>
            <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
              <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1.6, color: ORANGE, textTransform: "uppercase", opacity: 0.75, marginBottom: 3 }}>Assembly</div>
              <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.2, marginBottom: 6 }}>{hlCase.title}</div>
              {hlCase.jurisdiction && !editingJurisdiction && (
                <button onClick={() => setEditingJurisdiction(true)}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                  <MapPin size={11} color="#888" />
                  <span style={{ fontSize: 12.5, color: "#eee", fontWeight: 600 }}>{hlCase.jurisdiction}</span>
                </button>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                <div style={{ color: "#444", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                  <Clock size={10} color="#444" /> {formatDate(hlCase.createdAt)}
                </div>
                <button onClick={() => setShowStatusPicker(true)}
                  style={{ background: `${STATUS_COLORS[hlCase.status]}18`, border: `1px solid ${STATUS_COLORS[hlCase.status]}44`, borderRadius: 6, padding: "2px 7px", fontSize: 10, fontWeight: 700, color: STATUS_COLORS[hlCase.status], cursor: "pointer" }}>
                  {STATUS_LABELS[hlCase.status]}
                </button>
              </div>
            </div>
            <button onClick={() => { setEditTitle(hlCase.title); setEditingTitle(true); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: 6, marginTop: 2 }}><Edit3 size={15} /></button>
          </div>
        )}

        {/* Recent activity strip */}
        {recentHistory.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "#444", textTransform: "uppercase", marginBottom: 8 }}>Recent Activity</div>
            {recentHistory.map((item, i) => (
              <div key={item.id}
                onClick={() => setExpandedHistoryId(prev => prev === item.id ? null : item.id)}
                style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: i < recentHistory.length - 1 ? "1px solid #141414" : "none", cursor: "pointer", alignItems: "flex-start" }}>
                <div style={{ color: "#444", fontSize: 11, minWidth: 54, paddingTop: 1, flexShrink: 0 }}>
                  {new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#bbb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: expandedHistoryId === item.id ? "normal" : "nowrap" }}>
                    {item.label}
                  </div>
                  {expandedHistoryId === item.id && item.summary && (
                    <div style={{ fontSize: 11, color: "#555", marginTop: 3, lineHeight: 1.4 }}>{item.summary}</div>
                  )}
                </div>
                <ChevronRight size={12} color="#333" style={{ marginTop: 2, flexShrink: 0, transform: expandedHistoryId === item.id ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
              </div>
            ))}
          </div>
        )}

        {/* Jurisdiction — editor when active; slim red warning only while unset
            (once set, it's shown compactly under the title above instead) */}
        {(editingJurisdiction || !hlCase.jurisdiction) && (
        <div style={{ marginBottom: 20, position: "relative" }}>
          {editingJurisdiction ? (
            <>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={jurisdiction}
                  onChange={e => { setJurisdiction(e.target.value); setLocationSearchState("idle"); setLocationResults([]); }}
                  onFocus={() => setJurisdictionFocused(true)}
                  onBlur={() => setJurisdictionFocused(false)}
                  placeholder="Search for your court — e.g. Kentucky, S.D.N.Y., Superior Court…"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === "Enter") { onUpdateCase({ ...hlCase, jurisdiction: jurisdiction.trim() }); setEditingJurisdiction(false); }
                    if (e.key === "Escape") { setJurisdiction(hlCase.jurisdiction ?? ""); setEditingJurisdiction(false); }
                  }}
                  style={{ flex: 1, background: "#111", border: `1px solid ${ORANGE}`, borderRadius: 10, padding: "10px 14px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                />
                <TapBtn variant="orange" onClick={() => { onUpdateCase({ ...hlCase, jurisdiction: jurisdiction.trim() }); setEditingJurisdiction(false); }} style={{ padding: "0 14px" }}><Check size={15} /></TapBtn>
              </div>
              {(jurisdictionFocused || locationSearchState !== "idle") && jurisdiction.trim() && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: "#161311", border: "1px solid #2a2a2a", borderRadius: 10, overflow: "hidden", zIndex: 20, boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
                  {jurisdictionMatches.map(match => (
                    <button
                      key={match}
                      onMouseDown={e => { e.preventDefault(); setJurisdiction(match); onUpdateCase({ ...hlCase, jurisdiction: match }); setEditingJurisdiction(false); }}
                      style={{ display: "block", width: "100%", background: "none", border: "none", borderBottom: "1px solid #201c18", padding: "10px 14px", textAlign: "left", color: "#ccc", fontSize: 13, cursor: "pointer" }}
                    >
                      {match}
                    </button>
                  ))}
                  {locationResults.map(r => (
                    <button
                      key={r.name}
                      onMouseDown={e => { e.preventDefault(); setJurisdiction(r.name); onUpdateCase({ ...hlCase, jurisdiction: r.name }); setEditingJurisdiction(false); setLocationSearchState("idle"); setLocationResults([]); }}
                      style={{ display: "block", width: "100%", background: "none", border: "none", borderBottom: "1px solid #201c18", padding: "10px 14px", textAlign: "left", cursor: "pointer" }}
                    >
                      <div style={{ color: "#ccc", fontSize: 13 }}>{r.name}</div>
                      <div style={{ color: "#555", fontSize: 11, marginTop: 2 }}>{r.note}</div>
                    </button>
                  ))}
                  {locationSearchState === "loading" ? (
                    <div style={{ padding: "10px 14px", fontSize: 12, color: "#888", display: "flex", alignItems: "center", gap: 8 }}>
                      <Loader2 size={13} color={ORANGE} style={{ animation: "spin 1s linear infinite" }} /> Searching for courthouses…
                    </div>
                  ) : locationSearchState === "error" ? (
                    <div style={{ padding: "10px 14px", fontSize: 12, color: "#ef4444" }}>Search failed — try again.</div>
                  ) : locationSearchState === "done" && locationResults.length === 0 ? (
                    <div style={{ padding: "10px 14px", fontSize: 12, color: "#555" }}>No courthouses found for that location.</div>
                  ) : (
                    <button
                      onMouseDown={e => { e.preventDefault(); searchByLocation(); }}
                      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none", border: "none", padding: "10px 14px", textAlign: "left", color: ORANGE, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                    >
                      <MapPin size={13} color={ORANGE} /> Search by location
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <button
              onClick={() => setEditingJurisdiction(true)}
              style={{ background: "#210a0a", border: "1px solid #ef4444", borderRadius: 8, padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left" }}
            >
              <AlertCircle size={13} color="#ff5c5c" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "#ff6b6b", fontWeight: 800 }}>
                Set jurisdiction first ❓
              </span>
            </button>
          )}
        </div>
        )}

        {/* Index — small optional shortcut, same cloud icon/behavior as the bottom nav tab */}
        <button onClick={() => onOpenInTutor(hlCase)} title="Open this case in the Index"
          style={{ background: "none", border: "1px solid #1e1e1e", borderRadius: 10, padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, width: "25%", marginBottom: 20 }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE + "44")}
          onMouseLeave={e => (e.currentTarget.style.borderColor = "#1e1e1e")}>
          <IndexIcon size={20} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#888" }}>Index</span>
        </button>

        {/* Checklist/Index tabs removed — Assembly is drafting-focused (Section 8) */}
        <>

        {/* ── Document Intake Workflow ───────────────────────────────── */}
        {(() => {
          const INTAKE_QUESTIONS = [
            {
              label: "What type of document is this?",
              key: "docType" as const,
              options: ["Draft Complaint", "Motion", "Court Order", "Police Report", "Medical Record", "Correspondence", "Evidence", "Other"],
              cols: 2,
            },
            {
              label: "Was this prepared by an attorney or by yourself?",
              key: "preparedBy" as const,
              options: ["Attorney", "Self Prepared", "Not Sure"],
              cols: 3,
            },
            {
              label: "Does this document identify the people involved?",
              key: "hasParties" as const,
              options: ["Yes", "No", "Partially"],
              cols: 3,
            },
            {
              label: "Does this document contain dates, times, and event details?",
              key: "hasDates" as const,
              options: ["Yes", "No", "Partially"],
              cols: 3,
            },
          ];
          const TOTAL_STEPS = 5;
          const currentQ = INTAKE_QUESTIONS[intakeStep];
          const canAdvanceIntake = intakeStep < 4
            ? !!intakeAnswers[currentQ?.key as keyof typeof intakeAnswers]
            : true; // step 4 (textarea) always allows continue

          return (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>DOCUMENTS</div>
              <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt,.rtf,.jpg,.jpeg,.png,.heic,image/*" style={{ display: "none" }} onChange={handleFileSelect} />

              {/* ── IDLE / ERROR — Upload button ── */}
              {(uploadState === "idle" || uploadState === "error") && (
                <>
                  <button onClick={() => fileInputRef.current?.click()}
                    style={{ width: "100%", background: "#111", border: "1px dashed #2a2a2a", borderRadius: 12, padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, textAlign: "left" }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE + "55")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "#2a2a2a")}>
                    <Upload size={16} color={ORANGE} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#ccc" }}>Upload Document</div>
                      <div style={{ fontSize: 12, color: "#444", marginTop: 2 }}>PDF, DOCX, TXT, images · Guided intake before AI analysis</div>
                    </div>
                  </button>
                  {uploadState === "error" && uploadError && (
                    <div style={{ marginTop: 8, padding: "8px 12px", background: "#1a0d0d", border: "1px solid #3a1a1a", borderRadius: 8, fontSize: 13, color: "#ef4444" }}>{uploadError}</div>
                  )}
                </>
              )}

              {/* ── RECEIVING — File uploading (store only) ── */}
              {uploadState === "receiving" && (
                <div style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <Loader2 size={16} color={ORANGE} style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} />
                    <div style={{ fontSize: 14, color: "#888", flex: 1 }}>
                      {uploadPct < 100 ? `Receiving document… ${uploadPct}%` : "Storing document…"}
                    </div>
                  </div>
                  <div style={{ background: "#1a1a1a", borderRadius: 4, height: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 4, background: ORANGE, width: `${Math.min(uploadPct, 100)}%`, transition: "width 0.2s ease" }} />
                  </div>
                </div>
              )}

              {/* ── RECEIVED — Success, start intake ── */}
              {uploadState === "received" && pendingFile && (
                <div style={{ background: "#0a120a", border: "1px solid #1a3a1a", borderRadius: 14, padding: "18px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                    <CheckCircle2 size={18} color="#22c55e" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 14, color: "#22c55e" }}>Document received successfully.</div>
                      <div style={{ fontSize: 12, color: "#444", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pendingFile.name}</div>
                    </div>
                    <button onClick={() => { setPendingFile(null); setPendingDocId(null); setUploadState("idle"); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#444", padding: 4 }}><X size={14} /></button>
                  </div>
                  <div style={{ fontSize: 13, color: "#555", lineHeight: 1.6, marginBottom: 16 }}>
                    No AI analysis has run yet. Before HyperLaw analyzes this document, answer a few quick questions so the AI has the full picture.
                  </div>
                  <button onClick={() => setUploadState("intake")}
                    style={{ width: "100%", background: `linear-gradient(135deg, ${ORANGE}22, ${ORANGE}0d)`, border: `1.5px solid ${ORANGE}55`, borderRadius: 10, padding: "12px 16px", cursor: "pointer", color: ORANGE, fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    Start Intake Questions <ChevronRight size={16} />
                  </button>
                </div>
              )}

              {/* ── INTAKE — 5-step wizard ── */}
              {uploadState === "intake" && (
                <div style={{ background: "#111", border: `1px solid ${ORANGE}33`, borderRadius: 14, padding: "20px 16px" }}>
                  {/* Step dots */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 22 }}>
                    {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                      <div key={i} style={{
                        width: i === intakeStep ? 20 : 7, height: 7, borderRadius: 4,
                        background: i < intakeStep ? "#22c55e" : i === intakeStep ? ORANGE : "#2a2a2a",
                        transition: "all 0.2s",
                      }} />
                    ))}
                  </div>

                  {/* Question */}
                  {intakeStep < 4 && currentQ ? (
                    <>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", marginBottom: 16, lineHeight: 1.4 }}>
                        {currentQ.label}
                      </div>
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: `repeat(${currentQ.cols}, 1fr)`,
                        gap: 8, marginBottom: 20,
                      }}>
                        {currentQ.options.map(opt => {
                          const selected = intakeAnswers[currentQ.key] === opt;
                          return (
                            <button key={opt}
                              onClick={() => setIntakeAnswers(a => ({ ...a, [currentQ.key]: opt }))}
                              style={{
                                padding: "10px 8px", borderRadius: 10, cursor: "pointer",
                                border: `1.5px solid ${selected ? ORANGE : "#2a2a2a"}`,
                                background: selected ? `${ORANGE}22` : "#0d0d0d",
                                color: selected ? ORANGE : "#666",
                                fontSize: 12, fontWeight: 700, textAlign: "center",
                                transition: "all 0.15s",
                              }}>
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    /* Step 4 — textarea */
                    <>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", marginBottom: 6, lineHeight: 1.4 }}>
                        Is there anything else HyperLaw should know before analyzing?
                      </div>
                      <div style={{ fontSize: 12, color: "#444", marginBottom: 12 }}>
                        Additional facts, missing context, witness info, evidence details — anything important.
                      </div>
                      <textarea
                        value={intakeAnswers.additionalContext}
                        onChange={e => setIntakeAnswers(a => ({ ...a, additionalContext: e.target.value }))}
                        placeholder="e.g. The officer's name is misspelled throughout. There were two witnesses present: Maria Santos and James Lee. The report omits what happened after I was handcuffed…"
                        rows={5}
                        style={{
                          width: "100%", background: "#0a0a0a", border: "1px solid #2a2a2a",
                          borderRadius: 10, padding: "12px 14px", color: "#ccc", fontSize: 13,
                          resize: "vertical", outline: "none", fontFamily: "inherit",
                          lineHeight: 1.6, boxSizing: "border-box", marginBottom: 4,
                        }}
                        onFocus={e => (e.target.style.borderColor = ORANGE + "88")}
                        onBlur={e => (e.target.style.borderColor = "#2a2a2a")}
                      />
                      <div style={{ fontSize: 11, color: "#333", marginBottom: 16 }}>Optional — leave blank if nothing to add</div>
                    </>
                  )}

                  {/* Nav buttons */}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => intakeStep === 0 ? setUploadState("received") : setIntakeStep(s => s - 1)}
                      style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid #2a2a2a", background: "none", color: "#555", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      ← Back
                    </button>
                    <button
                      disabled={!canAdvanceIntake}
                      onClick={() => {
                        if (intakeStep < 4) setIntakeStep(s => s + 1);
                        else setUploadState("gate");
                      }}
                      style={{
                        flex: 2, padding: "10px", borderRadius: 10, cursor: canAdvanceIntake ? "pointer" : "not-allowed",
                        border: `1.5px solid ${canAdvanceIntake ? ORANGE : "#2a2a2a"}`,
                        background: canAdvanceIntake ? `${ORANGE}22` : "transparent",
                        color: canAdvanceIntake ? ORANGE : "#333",
                        fontSize: 13, fontWeight: 800, transition: "all 0.15s",
                      }}>
                      {intakeStep < 4 ? "Next →" : "Continue to Analysis →"}
                    </button>
                  </div>
                </div>
              )}

              {/* ── GATE — Premium analysis screen ── */}
              {uploadState === "gate" && (
                <div style={{ background: "#0a0a0a", border: `1.5px solid ${ORANGE}55`, borderRadius: 16, padding: "22px 18px" }}>
                  {/* Header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${ORANGE}22`, border: `1.5px solid ${ORANGE}44`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Brain size={18} color={ORANGE} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 15, color: "#fff" }}>This document is ready for analysis.</div>
                      <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>HyperLaw AI · Deep Case Intake</div>
                    </div>
                  </div>

                  {/* What Claude will do */}
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#444", letterSpacing: 0.5, marginBottom: 10 }}>HYPERLAW WILL:</div>
                    {[
                      "Review the full uploaded document",
                      "Combine your intake answers as context",
                      "Extract all parties and their roles",
                      "Build a complete event timeline",
                      "Identify legal issues and violations",
                      "Detect missing information and gaps",
                      "Organize your case file automatically",
                    ].map(item => (
                      <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 7 }}>
                        <div style={{ width: 5, height: 5, borderRadius: "50%", background: ORANGE, flexShrink: 0, marginTop: 5 }} />
                        <div style={{ fontSize: 13, color: "#bbb" }}>{item}</div>
                      </div>
                    ))}
                  </div>

                  {/* Credit cost — admin sees it for verification; apex sees unlimited badge; others see 1 credit */}
                  {isApex ? (
                    <div style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: 10, padding: "10px 14px", marginBottom: 18, display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: ORANGE }} />
                      <div style={{ fontSize: 14, color: ORANGE, fontWeight: 800 }}>Apex Litigant · Unlimited</div>
                    </div>
                  ) : (
                    <div style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: 10, padding: "10px 14px", marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ fontSize: 13, color: "#666" }}>Credit cost</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ fontWeight: 900, fontSize: 15, color: ORANGE }}>1 credit</div>
                        {isAdmin && <div style={{ fontSize: 10, color: "#444", fontWeight: 700, background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 5, padding: "2px 6px" }}>not charged</div>}
                      </div>
                    </div>
                  )}

                  {/* Back link */}
                  <button onClick={() => { setIntakeStep(4); setUploadState("intake"); }}
                    style={{ background: "none", border: "none", color: "#444", fontSize: 12, cursor: "pointer", marginBottom: 12, padding: 0 }}>
                    ← Edit intake answers
                  </button>

                  {/* Hold-to-analyze */}
                  <HoldToAnalyzeButton onComplete={handleAnalyzeDocument} />
                </div>
              )}

              {/* ── ANALYZING — Claude working ── */}
              {uploadState === "analyzing" && (
                <div style={{ background: "#0a0a0a", border: `1px solid ${ORANGE}44`, borderRadius: 14, padding: "28px 20px", textAlign: "center" }}>
                  <div style={{ width: 56, height: 56, borderRadius: "50%", background: `${ORANGE}18`, border: `2px solid ${ORANGE}44`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                    <Brain size={24} color={ORANGE} style={{ filter: `drop-shadow(0 0 8px ${ORANGE})` }} />
                  </div>
                  <Loader2 size={20} color={ORANGE} style={{ animation: "spin 1s linear infinite", marginBottom: 12 }} />
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#ccc", marginBottom: 6 }}>HyperLaw is analyzing your case…</div>
                  <div style={{ fontSize: 12, color: "#444" }}>Reading document · Combining your answers · Building case memory</div>
                </div>
              )}

              {/* ── DONE — Analysis complete ── */}
              {uploadState === "done" && uploadResult && (
                <div style={{ background: "#0a120a", border: "1px solid #1a3a1a", borderRadius: 14, padding: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <CheckCircle2 size={16} color="#22c55e" />
                    <div style={{ fontWeight: 800, fontSize: 14, color: "#22c55e", flex: 1 }}>Case memory updated</div>
                    <button onClick={() => { setUploadState("idle"); setUploadResult(null); setPendingDocId(null); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#444" }}><X size={14} /></button>
                  </div>
                  <div style={{ fontSize: 12, color: "#555", marginBottom: 12 }}>{uploadResult.fileName}</div>
                  {uploadResult.analysis.caseSummary && (
                    <div style={{ fontSize: 13, color: "#bbb", lineHeight: 1.65, fontFamily: "Georgia, serif", marginBottom: 12, padding: "10px 12px", background: "#111", borderRadius: 8, borderLeft: `3px solid ${ORANGE}` }}>
                      {uploadResult.analysis.caseSummary}
                    </div>
                  )}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {(uploadResult.analysis.parties?.length ?? 0) > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#8b5cf6", background: "#8b5cf611", border: "1px solid #8b5cf633", borderRadius: 6, padding: "2px 8px" }}>
                        {uploadResult.analysis.parties.length} parties found
                      </span>
                    )}
                    {(uploadResult.analysis.events?.length ?? 0) > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", background: "#22c55e11", border: "1px solid #22c55e33", borderRadius: 6, padding: "2px 8px" }}>
                        {uploadResult.analysis.events!.length} events found
                      </span>
                    )}
                    {(uploadResult.analysis.claims?.length ?? 0) > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: ORANGE, background: `${ORANGE}11`, border: `1px solid ${ORANGE}33`, borderRadius: 6, padding: "2px 8px" }}>
                        {uploadResult.analysis.claims.length} claims found
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

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
                          <span style={{ fontSize: 11, color: "#444" }}>{new Date(doc.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                        <button
                          title="View document"
                          onClick={() => setViewingDoc(doc)}
                          style={{ background: "none", border: "1px solid #2a3a2a", borderRadius: 6, padding: "5px 7px", cursor: "pointer", color: "#22c55e", display: "flex", alignItems: "center" }}
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

        {/* Verify readiness before drafting (Section 3) */}
        <VerifyPanel hlCase={hlCase} hasFacts={hlCase.parties.length > 0 || hlCase.timeline.length > 0 || hlCase.story.trim().length > 0 || hlCase.notes.trim().length > 0 || !!hlCase.structuredCase} />

        {/* Draft Documents (Sections 5, 6, 9, 10, 11) — locked (grayed out, unclickable) until jurisdiction is set */}
        <div id="draft-documents-section" style={{ marginBottom: 28, position: "relative" }}>
          {!hlCase.jurisdiction && (
            <div style={{ fontSize: 11, color: "#ff6b6b", fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
              <AlertCircle size={12} color="#ff6b6b" /> Locked until jurisdiction is set
            </div>
          )}
          <div style={{ opacity: hlCase.jurisdiction ? 1 : 0.35, pointerEvents: hlCase.jurisdiction ? "auto" : "none" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5 }}>DRAFT DOCUMENTS</div>
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
          <div style={{ color: "#444", fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
            We'll check if your case is ready, then show a credit estimate before drafting. You're only charged for what's generated — never more than the estimate.
          </div>

          {/* Primary group of four */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            {([
              { dt: "complaint" as DocumentType, label: "Draft Complaint", full: "Complaint" },
              { dt: "motion" as DocumentType, label: "Draft Motion", full: "Motion" },
              { dt: "discovery" as DocumentType, label: "Draft Discovery", full: "Discovery Requests" },
              { dt: "judgment_summary" as DocumentType, label: "Draft Judgment Summary", full: "Judgment Summary" },
            ]).map(({ dt, label, full }) => {
              const busy = generatingDocType === dt;
              return (
                <button
                  key={dt}
                  disabled={!!generatingDocType}
                  onClick={() => openDraft(dt, full)}
                  style={{
                    background: "linear-gradient(180deg, #161311 0%, #0f0d0c 100%)",
                    border: `1px solid ${busy ? ORANGE : "#221c17"}`, borderRadius: 12, padding: "14px 12px",
                    cursor: generatingDocType ? "not-allowed" : "pointer", display: "flex", flexDirection: "column",
                    alignItems: "flex-start", gap: 6, opacity: generatingDocType && !busy ? 0.4 : 1, textAlign: "left",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)", transition: "transform 0.08s ease, border-color 0.15s ease",
                  }}
                  onMouseDown={e => { if (!generatingDocType) e.currentTarget.style.transform = "scale(0.97)"; }}
                  onMouseUp={e => (e.currentTarget.style.transform = "scale(1)")}
                  onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
                  onTouchStart={e => { if (!generatingDocType) e.currentTarget.style.transform = "scale(0.97)"; }}
                  onTouchEnd={e => (e.currentTarget.style.transform = "scale(1)")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {busy
                      ? <Loader2 size={14} color={ORANGE} style={{ animation: "spin 1s linear infinite" }} />
                      : <FileText size={14} color={ORANGE} />}
                    <span style={{ fontWeight: 800, fontSize: 13, color: "#eee" }}>{label}</span>
                  </div>
                  <span style={{ fontSize: 10, color: "#6a5c50" }}>{dt === "complaint" ? "1 credit" : "Estimate shown first"}</span>
                </button>
              );
            })}
          </div>

          {/* Strengthen — separate, needs a source document */}
          <button
            disabled={!!generatingDocType}
            onClick={() => openDraft("strengthen", "Strengthen My Case")}
            style={{
              width: "100%", background: `${ORANGE}0d`, border: `1px solid ${ORANGE}44`, borderRadius: 12,
              padding: "12px 14px", cursor: generatingDocType ? "not-allowed" : "pointer", display: "flex",
              alignItems: "center", gap: 10, marginBottom: 8,
              opacity: generatingDocType && generatingDocType !== "strengthen" ? 0.4 : 1,
              transition: "transform 0.08s ease",
            }}
            onMouseDown={e => { if (!generatingDocType) e.currentTarget.style.transform = "scale(0.98)"; }}
            onMouseUp={e => (e.currentTarget.style.transform = "scale(1)")}
            onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
          >
            {generatingDocType === "strengthen"
              ? <Loader2 size={16} color={ORANGE} style={{ animation: "spin 1s linear infinite" }} />
              : <Sparkles size={16} color={ORANGE} />}
            <div style={{ textAlign: "left", flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: ORANGE }}>Strengthen a Document</div>
              <div style={{ fontSize: 10, color: "#8a7566" }}>
                Paste an existing filing to sharpen it · <span style={{ fontSize: 13, fontWeight: 900, color: ORANGE }}>0.25</span> credit
              </div>
            </div>
          </button>

          {/* Respond to opposing filing (Section 11) + Fee waiver (Section 6) */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <button
              onClick={() => { setGenerateError(null); setShowDefense(true); }}
              style={{ background: "#111", border: "1px solid #221c17", borderRadius: 12, padding: "12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
            >
              <Swords size={16} color="#ef6a4a" />
              <div style={{ textAlign: "left" }}>
                <div style={{ fontWeight: 800, fontSize: 12, color: "#eee" }}>Respond to filing</div>
                <div style={{ fontSize: 10, color: "#6a5c50" }}>Uses your case docs</div>
              </div>
            </button>
            <button
              onClick={() => {
                if (!hlCase.jurisdiction?.trim()) { setGenerateError("Please add a jurisdiction first — set it in the Jurisdiction field above."); return; }
                setGenerateError(null); setShowIfp(true);
              }}
              style={{ background: "#111", border: "1px solid #221c17", borderRadius: 12, padding: "12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
            >
              <BadgeDollarSign size={16} color={ORANGE} />
              <div style={{ textAlign: "left" }}>
                <div style={{ fontWeight: 800, fontSize: 12, color: "#eee" }}>Fee waiver</div>
                <div style={{ fontSize: 10, color: "#6a5c50" }}>Find form · 1 credit</div>
              </div>
            </button>
          </div>

          {/* More documents */}
          <button
            onClick={() => setShowMoreDocs(v => !v)}
            style={{ width: "100%", background: "none", border: "1px dashed #1e1e1e", borderRadius: 10, padding: "9px 12px", cursor: "pointer", color: "#888", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12, fontWeight: 700 }}
          >
            {showMoreDocs ? <ChevronUp size={13} /> : <ChevronDown size={13} />} More documents
          </button>
          {showMoreDocs && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {([
                { dt: "motion_summary_judgment" as DocumentType, full: "Motion for Summary Judgment" },
                { dt: "motion_compel_discovery" as DocumentType, full: "Motion to Compel Discovery" },
                { dt: "motion_dismiss" as DocumentType, full: "Motion to Dismiss" },
                { dt: "answer" as DocumentType, full: "Answer" },
                { dt: "opposition" as DocumentType, full: "Opposition" },
                { dt: "declaration" as DocumentType, full: "Declaration" },
                { dt: "demand_letter" as DocumentType, full: "Demand Letter" },
              ]).map(({ dt, full }) => (
                <button
                  key={dt}
                  disabled={!!generatingDocType}
                  onClick={() => openDraft(dt, full)}
                  style={{ background: "#111", border: `1px solid ${generatingDocType === dt ? ORANGE : "#1e1e1e"}`, borderRadius: 8, padding: "8px 12px", cursor: generatingDocType ? "not-allowed" : "pointer", color: "#ccc", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, opacity: generatingDocType && generatingDocType !== dt ? 0.4 : 1 }}
                >
                  {generatingDocType === dt
                    ? <Loader2 size={12} color={ORANGE} style={{ animation: "spin 1s linear infinite" }} />
                    : <FileText size={12} color="#555" />}
                  {full}
                </button>
              ))}
            </div>
          )}
          </div>

          {generateError && (
            <div style={{ marginTop: 10, fontSize: 12, color: "#ef4444", background: "#1a0d0d", border: "1px solid #3a1a1a", borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: 1 }}>{generateError}</span>
              {lastGenerateArgs && (
                <button
                  onClick={() => { setGenerateError(null); handleGenerateDoc(lastGenerateArgs.docType, lastGenerateArgs.opts); }}
                  style={{ background: "#2a1010", border: "1px solid #5a2020", borderRadius: 6, padding: "4px 10px", cursor: "pointer", color: "#ef4444", fontSize: 11, fontWeight: 700, flexShrink: 0 }}
                >
                  Try again
                </button>
              )}
            </div>
          )}
        </div>

        {/* Incidents & incident-timeline sections removed — the case now uses
            parties / court / story / timeline + AI organization instead. */}

        {/* Reminders */}
        <ReminderSection
          caseId={hlCase.id}
          reminders={data.reminders}
          onAdd={onAddReminder}
          onDelete={onDeleteReminder}
        />

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
        </>
      </div>

      {/* AI decision layer — ready / guidance-recommended / guidance-required (Sections 3, 10) */}
      {decisionModal && (
        <DraftDecisionModal
          open
          documentType={decisionModal.docType}
          documentLabel={decisionModal.label}
          caseId={hlCase.id}
          needsSource={decisionModal.needsSource}
          creditBalance={creditBalance}
          waived={isAdmin || isApex}
          guidanceJustCompleted={decisionModal.guidanceJustCompleted}
          onBuyCredits={onBuyCredits}
          onClose={() => setDecisionModal(null)}
          onStartGuidance={(topics) => {
            const dm = decisionModal;
            setDecisionModal(null);
            if (dm) setGuidanceModal({ docType: dm.docType, label: dm.label, needsSource: dm.needsSource, topics });
          }}
          onConfirmDraft={({ sourceDocument }) => {
            const dm = decisionModal;
            setDecisionModal(null);
            if (dm) handleGenerateDoc(dm.docType, { sourceDocument, title: dm.label });
          }}
        />
      )}
      {/* Guidance Session — conversational, mascot-led context gathering (Sections 1, 2, 7) */}
      {guidanceModal && (
        <GuidanceSessionModal
          open
          caseId={hlCase.id}
          action={guidanceModal.docType}
          documentLabel={guidanceModal.label}
          topics={guidanceModal.topics}
          creditBalance={creditBalance}
          onBuyCredits={onBuyCredits}
          onClose={() => setGuidanceModal(null)}
          onCompleted={() => {
            const gm = guidanceModal;
            setGuidanceModal(null);
            onDocGenerated?.(); // refresh balance after the session charge
            // Re-open the decision — now enriched by the session — ready to draft.
            if (gm) setDecisionModal({ docType: gm.docType, label: gm.label, needsSource: gm.needsSource, guidanceJustCompleted: true });
          }}
        />
      )}
      {/* Fee waiver / IFP (Section 6) */}
      <IfpWizard
        open={showIfp}
        caseId={hlCase.id}
        jurisdiction={hlCase.jurisdiction ?? ""}
        caseData={{
          court: hlCase.court?.name ?? hlCase.court?.shortName ?? undefined,
          state: hlCase.jurisdiction || undefined,
        }}
        creditBalance={creditBalance}
        onBuyCredits={onBuyCredits}
        onClose={() => setShowIfp(false)}
        onGenerated={(doc) => { setGenDocs(prev => [doc, ...prev]); setViewingDoc(doc); onDocGenerated?.(); }}
      />
      {/* Respond to opposing filing — crossed swords (Section 11) */}
      <DefenseModal
        open={showDefense}
        caseId={hlCase.id}
        caseTitle={hlCase.title}
        jurisdiction={hlCase.jurisdiction}
        creditBalance={creditBalance}
        onBuyCredits={onBuyCredits}
        onClose={() => setShowDefense(false)}
        onDrafted={(doc) => { setGenDocs(prev => [doc, ...prev]); setViewingDoc(doc); onDocGenerated?.(); }}
      />

      {/* Document viewer — full content, TTS, download */}
      {viewingDoc && (
        <DocumentViewerModal
          doc={viewingDoc}
          onClose={() => setViewingDoc(null)}
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

      {/* Persistent status bar — pinned to the bottom of the case screen, always visible */}
      <div style={{ position: "sticky", bottom: 0, background: "#0a0a0a", borderTop: "1px solid #181818", padding: "10px 16px calc(10px + env(safe-area-inset-bottom))", display: "flex", alignItems: "center", gap: 10, zIndex: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hlCase.title}</div>
        </div>
        <button onClick={() => setShowStatusPicker(true)}
          style={{ background: `${STATUS_COLORS[hlCase.status]}22`, border: `1px solid ${STATUS_COLORS[hlCase.status]}55`, borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: STATUS_COLORS[hlCase.status], cursor: "pointer", flexShrink: 0 }}>
          {STATUS_LABELS[hlCase.status]}
        </button>
      </div>
    </div>
  );
}

// ─── TUTOR VIEW ───────────────────────────────────────────────────────────────
// ── HoldCloud — press-and-hold to "unlock" an Index concept; glows orange as it fills ──
function HoldCloud({ cloud, color, idx, onUnlock }: {
  cloud: IndexCloud;
  color: string;
  idx: number;
  onUnlock: () => void;
}) {
  const HOLD_MS = 800;
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const doneRef = useRef(false);

  const stop = () => {
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  };
  const reset = () => {
    stop();
    originRef.current = null;
    setHolding(false);
    if (!doneRef.current) setProgress(0);
  };
  const tick = (now: number) => {
    const p = Math.min(1, (now - startRef.current) / HOLD_MS);
    setProgress(p);
    if (p >= 1) {
      doneRef.current = true;
      stop();
      onUnlock();
      window.setTimeout(() => { doneRef.current = false; setProgress(0); setHolding(false); }, 180);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  };
  const begin = (e: React.PointerEvent) => {
    doneRef.current = false;
    originRef.current = { x: e.clientX, y: e.clientY };
    startRef.current = performance.now();
    setHolding(true);
    stop();
    rafRef.current = requestAnimationFrame(tick);
  };
  const onMove = (e: React.PointerEvent) => {
    const o = originRef.current;
    if (!o) return;
    // If the pointer travels (a scroll gesture), abandon the hold.
    if (Math.abs(e.clientX - o.x) > 10 || Math.abs(e.clientY - o.y) > 10) reset();
  };
  useEffect(() => () => stop(), []);

  const p = progress;
  return (
    <button
      onPointerDown={begin}
      onPointerUp={reset}
      onPointerLeave={reset}
      onPointerCancel={reset}
      onPointerMove={onMove}
      onContextMenu={e => e.preventDefault()}
      className="hl-cloud-shape"
      style={{
        background: color + "18",
        border: `1.5px solid ${holding ? ORANGE : color + "55"}`,
        padding: "10px 22px",
        color: holding ? ORANGE : color,
        fontSize: 14, fontWeight: 700,
        cursor: "pointer",
        display: "flex", alignItems: "center", gap: 8,
        WebkitTapHighlightColor: "transparent",
        userSelect: "none",
        animation: holding ? "none" : `cloudFloat ${2.8 + (idx % 5) * 0.35}s ease-in-out ${(idx % 7) * 0.28}s infinite`,
        boxShadow: holding ? `0 0 ${10 + p * 26}px ${p * 7}px rgba(217,113,31,${0.18 + p * 0.5})` : "0 0 0 0 rgba(217,113,31,0)",
        transform: holding ? `scale(${1 + p * 0.05})` : "scale(1)",
        transition: "border-color 0.12s, color 0.12s, transform 0.08s",
      }}
    >
      <div style={{ width: 7, height: 7, borderRadius: "50%", background: holding ? ORANGE : color, flexShrink: 0 }} />
      {cloud.label}
      {holding && p < 1 && (
        <div style={{ position: "absolute", left: 10, right: 10, bottom: 5, height: 2, background: "rgba(217,113,31,0.22)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${p * 100}%`, height: "100%", background: ORANGE, borderRadius: 2 }} />
        </div>
      )}
    </button>
  );
}

// Thumb-sized floating button, bottom-right of the Index screen. Hold 3s to
// spend 1 credit and rebuild the case's clouds from the latest case details.
function HoldToRebuildIndexButton({ onComplete, disabled }: { onComplete: () => void; disabled?: boolean }) {
  const HOLD_MS = 3000;
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const doneRef = useRef(false);

  const stop = () => { if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } };
  const reset = () => {
    stop();
    originRef.current = null;
    setHolding(false);
    if (!doneRef.current) setProgress(0);
  };
  const tick = (now: number) => {
    const p = Math.min(1, (now - startRef.current) / HOLD_MS);
    setProgress(p);
    if (p >= 1) {
      doneRef.current = true;
      stop();
      onComplete();
      window.setTimeout(() => { doneRef.current = false; setProgress(0); setHolding(false); }, 220);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  };
  const begin = (e: React.PointerEvent) => {
    if (disabled) return;
    doneRef.current = false;
    originRef.current = { x: e.clientX, y: e.clientY };
    startRef.current = performance.now();
    setHolding(true);
    stop();
    rafRef.current = requestAnimationFrame(tick);
  };
  const onMove = (e: React.PointerEvent) => {
    const o = originRef.current;
    if (!o) return;
    if (Math.abs(e.clientX - o.x) > 10 || Math.abs(e.clientY - o.y) > 10) reset();
  };
  useEffect(() => () => stop(), []);

  const p = progress;
  const R = 24; // radius of the progress ring, sized to a 56px thumb-tip button
  const CIRC = 2 * Math.PI * R;

  return (
    <button
      onPointerDown={begin}
      onPointerUp={reset}
      onPointerLeave={reset}
      onPointerCancel={reset}
      onPointerMove={onMove}
      onContextMenu={e => e.preventDefault()}
      title="Hold 3s to rebuild the Index (1 credit)"
      disabled={disabled}
      style={{
        // 176px clears the floating case bubble bar + fixed bottom nav, both of
        // which sit fixed at the very bottom of the screen on the Tutor tab.
        position: "absolute", right: 16, bottom: 176, zIndex: 95,
        width: 56, height: 56, borderRadius: "50%",
        background: "#0e0b06",
        border: `1.5px solid ${holding ? ORANGE : ORANGE + "55"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        WebkitTapHighlightColor: "transparent",
        userSelect: "none",
        boxShadow: holding
          ? `0 0 ${14 + p * 30}px ${p * 8}px rgba(217,113,31,${0.3 + p * 0.5}), 0 0 0 1px ${ORANGE}33`
          : `0 0 14px 2px rgba(217,113,31,0.28)`,
        animation: holding ? "none" : "hlBrainPulse 2.6s ease-in-out infinite",
        transform: holding ? `scale(${1 + p * 0.08})` : "scale(1)",
        transition: "border-color 0.12s, transform 0.08s",
      }}
    >
      <svg width={56} height={56} style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }}>
        <circle cx={28} cy={28} r={R} fill="none" stroke="rgba(217,113,31,0.15)" strokeWidth={2.5} />
        {holding && (
          <circle
            cx={28} cy={28} r={R} fill="none" stroke={ORANGE} strokeWidth={2.5}
            strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - p)} strokeLinecap="round"
          />
        )}
      </svg>
      <Brain size={22} color={ORANGE} style={{ filter: `drop-shadow(0 0 ${holding ? 10 + p * 8 : 6}px ${ORANGE})` }} />
    </button>
  );
}

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
  const [showCrisisSupport, setShowCrisisSupport] = useState(false);
  // Case selection now happens only via the floating case bubble bar (bottom of
  // the screen) — no in-screen picker anymore. When the bar hands us a new case
  // (via the initialCase prop changing) while this view is already mounted,
  // follow it.
  useEffect(() => {
    if (initialIncident) { setTarget({ kind: "incident", item: initialIncident }); return; }
    if (initialCase) { setTarget({ kind: "case", item: initialCase }); return; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialIncident?.id, initialCase?.id]);
  const [analysis, setAnalysis] = useState<TutorAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const forceRefreshRef = useRef(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showPreVerify, setShowPreVerify] = useState(false);
  const [savingDoc, setSavingDoc] = useState(false);
  const [savedTargetKey, setSavedTargetKey] = useState<string | null>(null);
  const [selectedCloud, setSelectedCloud] = useState<IndexCloud | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [overviewExpanded, setOverviewExpanded] = useState(true);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [rebuildError, setRebuildError] = useState<string | null>(null);

  async function handleRebuildIndex() {
    if (!target || target.kind !== "case" || isRebuilding) return;
    setRebuildError(null);
    setIsRebuilding(true);
    try {
      const hlCase = target.item as HLCase;
      const incs = data.incidents.filter(i => hlCase.incidentIds.includes(i.id));
      const result = await aiApi.analyzeCase(hlCase, incs, { forceRefresh: true, billableRebuild: true, caseId: hlCase.id });
      setAnalysis(result);
    } catch (err) {
      const e = err as { code?: string; message?: string };
      setRebuildError(e.code === "insufficient_credits" ? "Not enough credits to rebuild the Index." : (e.message || "Rebuild failed. Please try again."));
    } finally {
      setIsRebuilding(false);
    }
  }

  const currentTargetKey = target ? `${target.kind}:${target.item.id}` : null;

  useEffect(() => {
    setSavingDoc(false);
    setSavedTargetKey(null);
    setSelectedCloud(null);
    setActiveCategory("all");
    setRebuildError(null);
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

  // Inject float keyframes once
  (() => {
    const id = "hl-cloud-float-kf";
    if (typeof document !== "undefined" && !document.getElementById(id)) {
      const s = document.createElement("style");
      s.id = id;
      s.textContent = `
        @keyframes cloudFloat {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-5px); }
        }
        @keyframes hlBrainPulse {
          0%, 100% { box-shadow: 0 0 14px 2px rgba(217,113,31,0.28); }
          50%       { box-shadow: 0 0 22px 5px rgba(217,113,31,0.48); }
        }
        .hl-cloud-shape {
          position: relative;
          overflow: visible;
          border-radius: 50% 50% 45% 45% / 65% 65% 35% 35%;
        }
        .hl-cloud-shape::before, .hl-cloud-shape::after {
          content: "";
          position: absolute;
          background: inherit;
          border-radius: 50%;
          z-index: 0;
        }
        .hl-cloud-shape::before {
          width: 44%; height: 78%;
          top: -34%; left: 4%;
        }
        .hl-cloud-shape::after {
          width: 36%; height: 62%;
          top: -24%; right: 10%;
        }
        .hl-cloud-shape > * { position: relative; z-index: 1; }
      `;
      document.head.appendChild(s);
    }
  })();

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, background: "#0a0a0a", position: "relative" }}>

      {/* ── Minimal top bar: current target + refresh (selection lives in the bottom case bar) ── */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #111", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 9, padding: "9px 13px" }}>
          {target
            ? (target.kind === "incident" ? <FileText size={14} color={ORANGE} /> : <Folder size={14} color={ORANGE} />)
            : <BookOpen size={14} color="#333" />}
          <span style={{ flex: 1, fontWeight: 700, fontSize: 13, color: target ? "#ccc" : "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {target ? target.item.title : "Pick a case from the bar below"}
          </span>
          {isAnalyzing && <Loader2 size={13} color={ORANGE} style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} />}
        </div>
        {/* Refresh icon — only when results are loaded */}
        {target && !isAnalyzing && analysis && (
          <button
            onClick={() => { forceRefreshRef.current = true; setRefreshTrigger(n => n + 1); }}
            title="Regenerate Index"
            style={{ background: "none", border: "1px solid #1e1e1e", borderRadius: 8, padding: "8px 10px", cursor: "pointer", color: "#444", display: "flex", alignItems: "center", flexShrink: 0 }}
          >
            <span style={{ fontSize: 15, lineHeight: 1 }}>↻</span>
          </button>
        )}
      </div>

      {/* ── Crisis-support heart button — small, bottom-right of the Index ─── */}
      <button
        onClick={() => setShowCrisisSupport(true)}
        aria-label="Feeling overwhelmed? Tap for support"
        title="Feeling overwhelmed?"
        style={{
          position: "absolute",
          // The bottom tab bar is a separate position:fixed element (~58px
          // tall) layered on top at zIndex 100 — this needs enough offset
          // to clear it, not just safe-area-inset-bottom.
          bottom: "calc(78px + env(safe-area-inset-bottom))",
          right: 18,
          zIndex: 20,
          width: 52, height: 52,
          borderRadius: "50%",
          border: "none",
          background: `linear-gradient(145deg, ${ORANGE}, #b5540f)`,
          boxShadow: "0 6px 16px -4px rgba(217,113,31,0.6), 0 2px 4px rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer",
        }}
      >
        <HeartPlus size={24} color="#0a0908" strokeWidth={2.25} />
      </button>

      {showCrisisSupport && (
        <div
          onClick={() => setShowCrisisSupport(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            background: "rgba(0,0,0,0.68)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "24px 12px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "104%",
              maxWidth: 380,
              background: "linear-gradient(160deg, #1c1210 0%, #140d0b 60%, #1a0f0d 100%)",
              border: "1px solid rgba(217,113,31,0.35)",
              borderRadius: 36,
              padding: "30px 26px 26px",
              boxShadow: "0 24px 60px -12px rgba(0,0,0,0.7), 0 0 0 1px rgba(217,113,31,0.08), inset 0 1px 0 rgba(255,255,255,0.05)",
              textAlign: "center",
              position: "relative",
            }}
          >
            <button
              onClick={() => setShowCrisisSupport(false)}
              aria-label="Close"
              style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", color: "#6d6a63", cursor: "pointer", padding: 6, fontSize: 12.5, fontWeight: 700 }}
            >
              Wait it out
            </button>

            <div style={{
              width: 60, height: 60, borderRadius: "50%", margin: "0 auto 16px",
              background: `linear-gradient(145deg, ${ORANGE}, #b5540f)`,
              boxShadow: "0 8px 20px -6px rgba(217,113,31,0.65)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <HeartPlus size={28} color="#0a0908" strokeWidth={2.25} />
            </div>

            <h3 style={{ fontSize: 19, fontWeight: 800, color: "#f4efe8", margin: "0 0 12px" }}>
              Overwhelmed?
            </h3>
            <p style={{ fontSize: 13.5, lineHeight: 1.7, color: "#b8ada2", margin: "0 0 10px" }}>
              You're not alone in this. Whatever's weighing on you right now — legal or otherwise — reach out to someone. If it feels like there's no one, trust me, I get it. That's exactly why this is here.
            </p>
            <p style={{ fontSize: 13.5, lineHeight: 1.7, color: "#b8ada2", margin: "0 0 22px" }}>
              It won't always feel this heavy. It gets easier, one moment at a time, no matter what happens next.
            </p>

            <a
              href="tel:988"
              onClick={() => setShowCrisisSupport(false)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                background: `linear-gradient(90deg, ${ORANGE}, #f45d01)`,
                color: "#0a0908", fontWeight: 800, fontSize: 14,
                borderRadius: 14, padding: "13px", textDecoration: "none",
                marginBottom: 14,
              }}
            >
              <Phone size={16} />
              Call or Text 988 — Always Available
            </a>
            <span
              onClick={() => setShowCrisisSupport(false)}
              style={{ fontSize: 12.5, color: "#6d6a63", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}
            >
              I'll be patient with myself
            </span>
          </div>
        </div>
      )}

      {/* ── Cloud canvas ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 18px 140px" }}>

        {/* Empty state */}
        {!target && (
          <div style={{ textAlign: "center", paddingTop: 80 }}>
            {/* Ghost cloud bubbles hint */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginBottom: 36, opacity: 0.12 }}>
              {["4th Amendment", "Excessive Force", "Due Process", "Evidence", "Timeline"].map((label, i) => (
                <div key={label} style={{
                  background: "#fff", borderRadius: 24, padding: "9px 18px",
                  fontSize: 13, fontWeight: 700, color: "#fff",
                  animation: `cloudFloat ${2.5 + i * 0.3}s ease-in-out ${i * 0.4}s infinite`,
                }}>{label}</div>
              ))}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#333", marginBottom: 8 }}>Your experience, integrated</div>
            <div style={{ color: "#2a2a2a", fontSize: 13, lineHeight: 1.7, maxWidth: 280, margin: "0 auto" }}>
              I'm here to help you turn even the hardest parts of what happened into something clear. Select a case or incident above, and every key concept will surface — floating, colour-coded, and organized for you to see and reference.
            </div>
          </div>
        )}

        {/* Loading */}
        {target && isAnalyzing && (
          <div style={{ textAlign: "center", paddingTop: 80 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginBottom: 32, opacity: 0.25 }}>
              {["…", "…", "…", "…", "…"].map((_, i) => (
                <div key={i} style={{
                  background: "#333", borderRadius: 24, padding: "9px 32px",
                  animation: `cloudFloat ${2 + i * 0.25}s ease-in-out ${i * 0.3}s infinite`,
                }} />
              ))}
            </div>
            <Loader2 size={28} color={ORANGE} style={{ animation: "spin 1s linear infinite", marginBottom: 12 }} />
            <div style={{ color: "#444", fontSize: 13 }}>Mapping your case…</div>
          </div>
        )}

        {/* Clouds */}
        {target && !isAnalyzing && analysis && (
          <>
            {hasClouds ? (
              <>
                {/* Category filter chips — only if multiple categories */}
                {categories.length > 1 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
                    <button
                      onClick={() => setActiveCategory("all")}
                      style={{
                        padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer",
                        border: `1.5px solid ${activeCategory === "all" ? "#666" : "#1e1e1e"}`,
                        background: activeCategory === "all" ? "#222" : "transparent",
                        color: activeCategory === "all" ? "#bbb" : "#333",
                      }}
                    >All</button>
                    {Object.entries(CLOUD_LABELS).filter(([cat]) => categories.includes(cat as any)).map(([cat, label]) => (
                      <button
                        key={cat}
                        onClick={() => setActiveCategory(prev => prev === cat ? "all" : cat)}
                        style={{
                          padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer",
                          border: `1.5px solid ${activeCategory === cat ? CLOUD_COLORS[cat] : "#1e1e1e"}`,
                          background: activeCategory === cat ? CLOUD_COLORS[cat] + "22" : "transparent",
                          color: activeCategory === cat ? CLOUD_COLORS[cat] : "#333",
                          display: "flex", alignItems: "center", gap: 5,
                        }}
                      >
                        <div style={{ width: 5, height: 5, borderRadius: "50%", background: CLOUD_COLORS[cat] }} />
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Hold-to-unlock hint */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, color: "#5a5750", fontSize: 11.5 }}>
                  <Lock size={11} color="#5a5750" />
                  Press &amp; hold a concept to unlock it
                </div>

                {/* Floating cloud bubbles — hold to unlock (glows orange as it fills) */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                  {filteredClouds.map((cloud, idx) => (
                    <HoldCloud
                      key={cloud.id}
                      cloud={cloud}
                      color={CLOUD_COLORS[cloud.category]}
                      idx={idx}
                      onUnlock={() => setSelectedCloud(cloud)}
                    />
                  ))}
                </div>
              </>
            ) : (
              /* No clouds — clean prompt to regenerate */
              <div style={{ textAlign: "center", paddingTop: 60 }}>
                <div style={{ fontSize: 14, color: "#333", marginBottom: 16 }}>No concepts mapped yet.</div>
                <button
                  onClick={() => { forceRefreshRef.current = true; setRefreshTrigger(n => n + 1); }}
                  style={{ background: "none", border: `1px solid ${ORANGE}44`, borderRadius: 10, padding: "10px 20px", cursor: "pointer", color: ORANGE, fontSize: 13, fontWeight: 700 }}
                >↻ Build Index</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Cloud detail bottom sheet ──────────────────────────────────────── */}
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

            <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", marginBottom: 14 }}>{selectedCloud.label}</div>

            <div style={{ fontSize: 14, color: "#bbb", lineHeight: 1.7, marginBottom: 20, fontFamily: "Georgia, serif" }}>
              {selectedCloud.description}
            </div>

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

      {/* ── Hold-to-rebuild Index button — bottom-right, thumb-sized, 1 credit ──
          Positioned above the floating case bubble bar + bottom nav (both fixed,
          ~150px tall together) so it never renders hidden behind them. ── */}
      {target?.kind === "case" && !isAnalyzing && (
        <>
          {rebuildError && (
            <div style={{
              position: "absolute", right: 16, bottom: 242, left: 16, zIndex: 95,
              background: "#1a0d0d", border: "1px solid #4a1a1a", borderRadius: 10,
              padding: "9px 12px", fontSize: 12, color: "#f0a0a0", textAlign: "right",
            }}>
              {rebuildError}
            </div>
          )}
          <HoldToRebuildIndexButton onComplete={handleRebuildIndex} disabled={isRebuilding} />
        </>
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
      price: "Pay As You Go", cycle: null as string | null, priceNote: "No subscription · credits are spent only as you draft",
      badge: null as string | null,
      quote: '"You\'ll make mistakes. That\'s not disqualifying — quitting is. Stay determined and the scale tips your way eventually, even when it doesn\'t look like it yet."',
      features: [
        { text: "<b>Cases, incidents & timelines — always free</b> — build and document everything at no cost", tbd: false },
        { text: "<b>See the price before you draft</b> — every AI document shows a clear credit estimate up front, so you decide before anything is generated", tbd: false },
        { text: "<b>Pay only for what you generate</b> — credits are spent by usage, and never above the estimate we show first", tbd: false },
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
          No subscription required · Pay only for what you use · Cancel paid plans anytime
        </p>
      </div>
    </div>
  );
}

// ─── HOLD-TO-DELETE BUTTON ────────────────────────────────────────────────────
// Uses a native touchstart listener (passive:false) so preventDefault() actually
// blocks the parent scroll container from stealing the touch.
// ─── HOLD-TO-ANALYZE BUTTON ───────────────────────────────────────────────────
function HoldToAnalyzeButton({ onComplete }: { onComplete: () => void }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const isHoldingRef = useRef(false);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(false);
  const [done, setDone] = useState(false);
  const HOLD_MS = 3000;

  function begin() {
    if (isHoldingRef.current || done) return;
    isHoldingRef.current = true;
    setActive(true);
    setProgress(0);
    startTimeRef.current = performance.now();
    function tick(now: number) {
      if (!isHoldingRef.current) return;
      const p = Math.min(1, (now - (startTimeRef.current ?? now)) / HOLD_MS);
      setProgress(p);
      if (p >= 1) {
        isHoldingRef.current = false;
        setDone(true);
        setActive(false);
        onComplete();
        return;
      }
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
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const secsLeft = Math.max(0, Math.ceil((1 - progress) * (HOLD_MS / 1000)));
  const R = 32;
  const circ = 2 * Math.PI * R;

  return (
    <button
      ref={btnRef}
      onMouseDown={begin}
      onMouseUp={cancel}
      onMouseLeave={cancel}
      style={{
        width: "100%",
        padding: active ? "20px 14px" : "15px 14px",
        borderRadius: 14,
        background: active
          ? `radial-gradient(circle at 50% 50%, ${ORANGE}33 0%, #0d0d0d 70%)`
          : `linear-gradient(135deg, ${ORANGE}22 0%, ${ORANGE}0d 100%)`,
        border: `2px solid ${active ? ORANGE : ORANGE + "55"}`,
        cursor: done ? "default" : "pointer",
        userSelect: "none",
        WebkitUserSelect: "none",
        touchAction: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        transition: "background 0.2s, padding 0.2s",
        boxShadow: active
          ? `0 0 24px ${ORANGE}66, 0 0 48px ${ORANGE}22`
          : `0 0 8px ${ORANGE}22`,
        animation: active ? "none" : undefined,
      }}
    >
      {!active && !done && (
        <>
          {/* Idle ring hint */}
          <div style={{
            width: 56, height: 56,
            borderRadius: "50%",
            border: `2px solid ${ORANGE}44`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 0 12px ${ORANGE}33`,
          }}>
            <Brain size={22} color={ORANGE} />
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: ORANGE, letterSpacing: 0.3 }}>
            Hold to Analyze Document
          </div>
          <div style={{ fontSize: 11, color: "#444" }}>Press and hold for 3 seconds to begin</div>
        </>
      )}
      {active && (
        <>
          <div style={{ position: "relative", width: 76, height: 76 }}>
            {/* Glow ring */}
            <svg width={76} height={76} style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }}>
              <circle cx={38} cy={38} r={R} fill="none" stroke={`${ORANGE}22`} strokeWidth={4} />
              <circle cx={38} cy={38} r={R} fill="none" stroke={ORANGE} strokeWidth={4}
                strokeDasharray={circ} strokeDashoffset={circ * (1 - progress)}
                strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 6px ${ORANGE}) drop-shadow(0 0 12px ${ORANGE}88)` }}
              />
            </svg>
            {/* Center */}
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexDirection: "column", gap: 2,
            }}>
              <Brain size={18} color={ORANGE} style={{ filter: `drop-shadow(0 0 6px ${ORANGE})` }} />
              <div style={{ fontSize: 13, fontWeight: 900, color: ORANGE, lineHeight: 1 }}>{secsLeft}s</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: ORANGE + "cc", fontWeight: 700 }}>Analyzing…</div>
        </>
      )}
      {done && (
        <div style={{ fontSize: 13, fontWeight: 800, color: "#22c55e" }}>✓ Starting analysis…</div>
      )}
    </button>
  );
}

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

// ─── DOCUMENT INTAKE VIEW ─────────────────────────────────────────────────────
// Full-screen guided intake wizard. Used when a user starts a new case from a document.
// The document has already been stored (docId present). This view collects context
// (5 questions) then spends 1 credit to run deep Claude analysis.
function DocumentIntakeView({
  docId, caseId, fileName, onComplete, onCancel, isAdmin, isApex,
}: {
  docId: string;
  caseId: string;
  fileName: string;
  onComplete: (analysis: CaseMemory) => void;
  onCancel: () => void;
  isAdmin?: boolean;
  isApex?: boolean;
}) {
  const INTAKE_QUESTIONS = [
    { label: "What type of document is this?", key: "docType" as const, options: ["Draft Complaint", "Motion", "Court Order", "Police Report", "Medical Record", "Correspondence", "Evidence", "Other"], cols: 2 },
    { label: "Was this prepared by an attorney or by yourself?", key: "preparedBy" as const, options: ["Attorney", "Self Prepared", "Not Sure"], cols: 3 },
    { label: "Does this document identify the people involved?", key: "hasParties" as const, options: ["Yes", "No", "Partially"], cols: 3 },
    { label: "Does this document contain dates, times, and event details?", key: "hasDates" as const, options: ["Yes", "No", "Partially"], cols: 3 },
  ];
  const TOTAL_STEPS = 5;

  const [phase, setPhase] = useState<"intake" | "gate" | "analyzing" | "success" | "error">("intake");
  const [caseMemory, setCaseMemory] = useState<CaseMemory | null>(null);
  const [intakeStep, setIntakeStep] = useState(0);
  const [intakeAnswers, setIntakeAnswers] = useState({ docType: "", preparedBy: "", hasParties: "", hasDates: "", additionalContext: "" });
  const [error, setError] = useState<string | null>(null);

  const currentQ = INTAKE_QUESTIONS[intakeStep];
  const canAdvance = intakeStep < 4 ? !!intakeAnswers[currentQ?.key as keyof typeof intakeAnswers] : true;

  async function runAnalysis() {
    setPhase("analyzing");
    try {
      const result = await aiApi.buildCaseMemory({ docId, caseId, intakeAnswers });
      setCaseMemory(result.analysis);
      setPhase("success");
    } catch (err: unknown) {
      setError((err as Error).message || "Analysis failed. Please try again.");
      setPhase("error");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "#0a0a0a", position: "relative" }}>
      {/* ── Header ── */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #151515", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#333", letterSpacing: 1, marginBottom: 4, textTransform: "uppercase" }}>Document Intake</div>
          <div style={{ fontSize: 13, color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileName}</div>
        </div>
        <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "#333", padding: 6, flexShrink: 0 }}>
          <X size={18} />
        </button>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 120px" }}>

        {/* "Document stored" receipt */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#0a150a", border: "1px solid #1a321a", borderRadius: 10, marginBottom: 28 }}>
          <CheckCircle2 size={14} color="#22c55e" style={{ flexShrink: 0 }} />
          <div style={{ fontSize: 13, color: "#4ade80" }}>Document received · No AI analysis yet</div>
        </div>

        {/* ── INTAKE: 5-step questions ── */}
        {phase === "intake" && (
          <>
            {/* Step progress dots */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 32 }}>
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <div key={i} style={{
                  width: i === intakeStep ? 24 : 8, height: 8, borderRadius: 4,
                  background: i < intakeStep ? "#22c55e" : i === intakeStep ? ORANGE : "#1c1c1c",
                  transition: "all 0.25s ease",
                }} />
              ))}
            </div>

            {/* Q0-Q3 — pill options */}
            {intakeStep < 4 && currentQ && (
              <>
                <div style={{ fontSize: 17, fontWeight: 900, color: "#f0f0f0", lineHeight: 1.4, marginBottom: 22 }}>
                  {currentQ.label}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${currentQ.cols}, 1fr)`, gap: 10 }}>
                  {currentQ.options.map(opt => {
                    const selected = intakeAnswers[currentQ.key] === opt;
                    return (
                      <button key={opt} onClick={() => {
                        setIntakeAnswers(a => ({ ...a, [currentQ.key]: opt }));
                        // Auto-advance after a brief pause so the selection flash is visible
                        setTimeout(() => {
                          if (intakeStep < 3) setIntakeStep(s => s + 1);
                          else if (intakeStep === 3) setIntakeStep(4); // move to textarea step
                        }, 180);
                      }}
                        style={{
                          padding: "16px 8px", borderRadius: 14, cursor: "pointer",
                          border: `1.5px solid ${selected ? ORANGE : "#222"}`,
                          background: selected ? ORANGE : "#111",
                          color: selected ? "#000" : "#555",
                          fontSize: 13, fontWeight: 800, textAlign: "center", lineHeight: 1.3,
                          transition: "all 0.15s",
                          WebkitTapHighlightColor: "transparent",
                        }}>
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Q4 — free text */}
            {intakeStep === 4 && (
              <>
                <div style={{ fontSize: 17, fontWeight: 900, color: "#f0f0f0", lineHeight: 1.4, marginBottom: 8 }}>
                  Is there anything else HyperLaw should know before analyzing?
                </div>
                <div style={{ fontSize: 13, color: "#444", lineHeight: 1.6, marginBottom: 16 }}>
                  Additional facts, missing context, witness names, evidence details — anything important the document doesn't capture.
                </div>
                <textarea
                  value={intakeAnswers.additionalContext}
                  onChange={e => setIntakeAnswers(a => ({ ...a, additionalContext: e.target.value }))}
                  placeholder="e.g. The officer's name is misspelled throughout. There were two witnesses: Maria Santos and James Lee. The incident occurred at 2:45 AM, not 3 PM as stated in the report…"
                  rows={7}
                  style={{
                    width: "100%", background: "#111", border: "1px solid #222",
                    borderRadius: 12, padding: "14px 16px", color: "#ccc", fontSize: 14,
                    resize: "none", outline: "none", fontFamily: "inherit",
                    lineHeight: 1.6, boxSizing: "border-box",
                  }}
                  onFocus={e => (e.target.style.borderColor = ORANGE + "88")}
                  onBlur={e => (e.target.style.borderColor = "#222")}
                />
                <div style={{ fontSize: 12, color: "#2a2a2a", marginTop: 8 }}>Optional — leave blank if nothing to add</div>
              </>
            )}
          </>
        )}

        {/* ── GATE: Premium analysis screen ── */}
        {phase === "gate" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
              <div style={{ width: 50, height: 50, borderRadius: "50%", background: `${ORANGE}16`, border: `1.5px solid ${ORANGE}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Brain size={24} color={ORANGE} />
              </div>
              <div>
                <div style={{ fontWeight: 900, fontSize: 18, color: "#fff" }}>Ready for Analysis</div>
                <div style={{ fontSize: 13, color: "#444", marginTop: 3 }}>HyperLaw AI · Deep Case Intake</div>
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#2a2a2a", letterSpacing: 1, marginBottom: 14, textTransform: "uppercase" }}>HyperLaw will:</div>
              {["Read the entire uploaded document", "Combine all 5 of your intake answers as context", "Extract every named party and their role", "Build a complete event timeline", "Identify legal claims, violations, and statutes", "Detect gaps and missing information", "Organize your case memory automatically"].map(item => (
                <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: ORANGE, flexShrink: 0, marginTop: 7 }} />
                  <div style={{ fontSize: 14, color: "#c0c0c0", lineHeight: 1.5 }}>{item}</div>
                </div>
              ))}
            </div>

            {/* Credit row — admin sees it for verification; apex sees none; others see "1 credit" */}
            {isApex ? (
              <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, padding: "14px 18px", marginBottom: 24, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: ORANGE }} />
                <div style={{ fontSize: 14, color: ORANGE, fontWeight: 800 }}>Apex Litigant · Unlimited</div>
              </div>
            ) : (
              <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, padding: "16px 20px", marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 14, color: "#444" }}>Credit cost</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontWeight: 900, fontSize: 20, color: ORANGE }}>1 credit</div>
                  {isAdmin && <div style={{ fontSize: 11, color: "#444", fontWeight: 700, background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, padding: "2px 7px" }}>admin — not charged</div>}
                </div>
              </div>
            )}

            <button onClick={() => setPhase("intake")}
              style={{ background: "none", border: "none", color: "#444", fontSize: 13, cursor: "pointer", marginBottom: 20, padding: 0, display: "block" }}>
              ← Review intake answers
            </button>

            <HoldToAnalyzeButton onComplete={runAnalysis} />
          </>
        )}

        {/* ── ANALYZING: Claude working ── */}
        {phase === "analyzing" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 60, textAlign: "center" }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", background: `${ORANGE}12`, border: `2px solid ${ORANGE}30`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
              <Brain size={36} color={ORANGE} style={{ filter: `drop-shadow(0 0 14px ${ORANGE})` }} />
            </div>
            <Loader2 size={26} color={ORANGE} style={{ animation: "spin 1s linear infinite", marginBottom: 18 }} />
            <div style={{ fontWeight: 900, fontSize: 19, color: "#e0e0e0", marginBottom: 12 }}>HyperLaw is building your case…</div>
            <div style={{ fontSize: 14, color: "#333", lineHeight: 1.9 }}>
              Reading document<br />
              Applying your intake context<br />
              Extracting parties and timeline<br />
              Building case memory
            </div>
          </div>
        )}

        {/* ── SUCCESS ── */}
        {phase === "success" && caseMemory && (
          <div>
            {/* Organized badge */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", background: "#071207", border: "1px solid #1a3a1a", borderRadius: 14, marginBottom: 28 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#0d2b0d", border: "1.5px solid #22c55e55", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <CheckCircle2 size={18} color="#22c55e" />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 900, color: "#22c55e" }}>Case Organized</div>
                <div style={{ fontSize: 12, color: "#4ade8066", marginTop: 2 }}>Case Memory saved to database</div>
              </div>
            </div>

            {/* Counts */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
              {[
                { label: "Parties Found", value: caseMemory.parties?.length ?? 0 },
                { label: "Events Found", value: caseMemory.events?.length ?? 0 },
                { label: "Evidence Items", value: caseMemory.evidence?.length ?? 0 },
                { label: "Potential Claims", value: caseMemory.claims?.length ?? 0 },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: ORANGE }}>{value}</div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 3, fontWeight: 700 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Summary */}
            {caseMemory.caseSummary && (
              <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, padding: "14px 16px", marginBottom: 24 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "#333", letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" }}>Case Summary</div>
                <div style={{ fontSize: 13, color: "#888", lineHeight: 1.6 }}>{caseMemory.caseSummary}</div>
              </div>
            )}

            {/* Claims found */}
            {(caseMemory.claims?.length ?? 0) > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "#333", letterSpacing: 1, marginBottom: 10, textTransform: "uppercase" }}>Potential Claims</div>
                {caseMemory.claims.map((claim, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: ORANGE, marginTop: 6, flexShrink: 0 }} />
                    <div style={{ fontSize: 13, color: "#aaa", lineHeight: 1.5 }}>{claim}</div>
                  </div>
                ))}
              </div>
            )}

            {/* CTA */}
            <button
              onClick={() => caseMemory && onComplete(caseMemory)}
              style={{ width: "100%", padding: "18px", borderRadius: 14, border: "none", background: ORANGE, color: "#000", fontSize: 16, fontWeight: 900, cursor: "pointer", letterSpacing: 0.3, WebkitTapHighlightColor: "transparent" }}>
              Open Case →
            </button>
          </div>
        )}

        {/* ── ERROR ── */}
        {phase === "error" && (
          <div style={{ padding: "20px", background: "#140a0a", border: "1px solid #331a1a", borderRadius: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#ef4444", marginBottom: 10 }}>Analysis failed</div>
            <div style={{ fontSize: 13, color: "#666", marginBottom: 20, lineHeight: 1.5 }}>{error}</div>
            <button onClick={() => setPhase("gate")}
              style={{ background: `${ORANGE}1a`, border: `1.5px solid ${ORANGE}55`, borderRadius: 10, padding: "11px 22px", color: ORANGE, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
              Try again
            </button>
          </div>
        )}
      </div>

      {/* ── Sticky bottom navigation (intake phase only) ── */}
      {phase === "intake" && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "14px 20px calc(14px + env(safe-area-inset-bottom))", background: "#0a0a0a", borderTop: "1px solid #222", display: "flex", gap: 10, zIndex: 50 }}>
          <button
            onClick={() => intakeStep === 0 ? onCancel() : setIntakeStep(s => s - 1)}
            style={{ flex: 1, padding: "18px 10px", borderRadius: 14, border: "1px solid #1e1e1e", background: "none", color: "#444", fontSize: 15, fontWeight: 700, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
            {intakeStep === 0 ? "Cancel" : "← Back"}
          </button>
          <button
            disabled={!canAdvance}
            onClick={() => intakeStep < 4 ? setIntakeStep(s => s + 1) : setPhase("gate")}
            style={{
              flex: 3, padding: "18px 10px", borderRadius: 14, cursor: canAdvance ? "pointer" : "not-allowed",
              border: "none",
              background: canAdvance ? ORANGE : "#181818",
              color: canAdvance ? "#000" : "#2a2a2a",
              fontSize: 16, fontWeight: 900, transition: "background 0.15s, color 0.15s",
              WebkitTapHighlightColor: "transparent",
            }}>
            {intakeStep < 4 ? "Next →" : "Continue →"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── PROFILE VIEW ─────────────────────────────────────────────────────────────
function ProfileView({ data, onOpenCase, onEasterEgg, onBuyCredits, onAboutCreator, onCasesDeleted, openPlansSignal }: {
  data: AppData;
  onOpenCase: (c: HLCase) => void;
  onEasterEgg: () => void;
  onBuyCredits?: () => void;
  onAboutCreator: () => void;
  onCasesDeleted: (ids: string[]) => void;
  /** Bumped by a parent to force-open the Plans overlay (e.g. from the upgrade gate). */
  openPlansSignal?: number;
}) {
  const logout = useLogout();
  const signOut = (opts: { redirectUrl: string }) => {
    logout.mutate(undefined, { onSuccess: () => { window.location.href = opts.redirectUrl; } });
  };
  const { user } = useAuth();
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "Your Profile";
  const email = user?.email || "";
  const isAdmin = user?.isAdmin ?? false;

  const [showPlans, setShowPlans] = useState(false);
  useEffect(() => { if (openPlansSignal) setShowPlans(true); }, [openPlansSignal]);
  const [showSupport, setShowSupport] = useState(false);
  const [showCreditHistory, setShowCreditHistory] = useState(false);

  // Security — PIN status + passkey (Face ID / Touch ID) enrollment
  const [secStatus, setSecStatus] = useState<{ hasPin: boolean; webauthnEnabled: boolean } | null>(null);
  const [showEnablePasskeyPin, setShowEnablePasskeyPin] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);

  useEffect(() => {
    aiApi.security.status().then(s => setSecStatus(s)).catch(() => {});
  }, []);

  async function finishEnablingPasskey(pin: string) {
    setShowEnablePasskeyPin(false);
    if (!user?.id) return;
    setPasskeyBusy(true);
    setPasskeyError(null);
    try {
      const { challenge, credentialIds } = await aiApi.security.webauthnChallenge();
      const credentialId = await createPasskey(user.id, challenge, credentialIds);
      await aiApi.security.webauthnEnroll(credentialId);
      cachePin(user.id, pin);
      setSecStatus({ hasPin: true, webauthnEnabled: true });
    } catch (e) {
      setPasskeyError((e as Error).message || "Couldn't set up Face ID / Touch ID");
    } finally {
      setPasskeyBusy(false);
    }
  }

  async function disablePasskey() {
    if (!user?.id) return;
    setPasskeyBusy(true);
    setPasskeyError(null);
    try {
      await aiApi.security.webauthnDisable();
      clearCachedPin(user.id);
      setSecStatus(s => s ? { ...s, webauthnEnabled: false } : s);
    } catch (e) {
      setPasskeyError((e as Error).message || "Couldn't turn off Face ID / Touch ID");
    } finally {
      setPasskeyBusy(false);
    }
  }

  // Real login passkey — separate credential/toggle from the PIN-unlock one
  // above. Enabling this lets Face ID / Touch ID sign into the account
  // directly (a real WebAuthn ceremony, server-verified); it has nothing to
  // do with whether PIN-unlock is also on. Either can be turned on or off
  // independently.
  const [loginPasskeys, setLoginPasskeys] = useState<PasskeyListItem[]>([]);
  const [loginPasskeyBusy, setLoginPasskeyBusy] = useState(false);
  const [loginPasskeyError, setLoginPasskeyError] = useState<string | null>(null);

  useEffect(() => {
    listLoginPasskeys().then(setLoginPasskeys).catch(() => {});
  }, []);

  async function enableLoginPasskey() {
    setLoginPasskeyBusy(true);
    setLoginPasskeyError(null);
    try {
      await registerLoginPasskey();
      setLoginPasskeys(await listLoginPasskeys());
    } catch (e) {
      setLoginPasskeyError((e as Error).message || "Couldn't set up passkey sign-in");
    } finally {
      setLoginPasskeyBusy(false);
    }
  }

  async function disableLoginPasskeys() {
    setLoginPasskeyBusy(true);
    setLoginPasskeyError(null);
    try {
      await Promise.all(loginPasskeys.map(p => removeLoginPasskey(p.id)));
      setLoginPasskeys([]);
    } catch (e) {
      setLoginPasskeyError((e as Error).message || "Couldn't turn off passkey sign-in");
    } finally {
      setLoginPasskeyBusy(false);
    }
  }

  // Profile photo
  const [profilePhoto, setProfilePhoto] = useState<string | null>(() => localStorage.getItem("hl_profile_photo"));
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  function handlePhotoFile(file: File | undefined | null, inputEl?: HTMLInputElement | null) {
    if (!file) return;
    // Reset input value so selecting the same file again reliably retriggers onChange
    if (inputEl) inputEl.value = "";
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      try {
        localStorage.setItem("hl_profile_photo", dataUrl);
      } catch {
        alert("Photo is too large to save. Please choose a smaller image.");
        return;
      }
      setProfilePhoto(dataUrl);
      window.dispatchEvent(new Event("profilePhotoChanged"));
    };
    reader.readAsDataURL(file);
    setShowPhotoOptions(false);
  }

  // Account deletion
  const [showDeleteSection, setShowDeleteSection] = useState(false);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [deleteDone, setDeleteDone] = useState(false);
  const [showDeletePin, setShowDeletePin] = useState(false);
  const [showManageCases, setShowManageCases] = useState(false);

  function handleDeleteScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 30) setScrolledToBottom(true);
  }

  async function handleDeleteComplete(pin: string) {
    setDeleteDone(true);
    try {
      // /user/delete purges every row (including the account itself) and ends
      // the server-side session in one PIN-guarded call — a wrong PIN throws
      // here and aborts, so the account is never left half-deleted.
      await aiApi.deleteUserData(pin);
      await logout.mutateAsync();
    } catch (err) {
      const msg = ((err as Error)?.message ?? "").toLowerCase();
      alert(msg.includes("pin")
        ? "Incorrect PIN. Your account was not deleted."
        : "Failed to delete account. Please contact support at hypermodula@gmail.com");
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
      {/* Hidden file inputs */}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="user" style={{ display: "none" }}
        onChange={e => handlePhotoFile(e.target.files?.[0], e.target)} />
      <input ref={galleryInputRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={e => handlePhotoFile(e.target.files?.[0], e.target)} />

      {/* Photo options sheet */}
      {showPhotoOptions && (
        <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.7)" }}
          onClick={() => setShowPhotoOptions(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              background: "#111", borderRadius: "20px 20px 0 0",
              padding: "20px 20px calc(20px + env(safe-area-inset-bottom))",
              borderTop: `2px solid ${ORANGE}33`,
            }}>
            <div style={{ width: 36, height: 4, background: "#2a2a2a", borderRadius: 2, margin: "0 auto 20px" }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: "#888", marginBottom: 14, textAlign: "center" }}>Update Profile Photo</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={() => { cameraInputRef.current?.click(); }}
                style={{ padding: "14px 16px", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 12, color: "#ccc", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                <Camera size={16} color={ORANGE} /> Take Photo
              </button>
              <button onClick={() => { galleryInputRef.current?.click(); }}
                style={{ padding: "14px 16px", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 12, color: "#ccc", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                <User size={16} color={ORANGE} /> Choose from Library
              </button>
              {profilePhoto && (
                <button onClick={() => { localStorage.removeItem("hl_profile_photo"); setProfilePhoto(null); window.dispatchEvent(new Event("profilePhotoChanged")); setShowPhotoOptions(false); }}
                  style={{ padding: "12px 16px", background: "transparent", border: "1px solid #2a1a1a", borderRadius: 12, color: "#555", fontSize: 13, cursor: "pointer" }}>
                  Remove Photo
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* User info */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div style={{
            width: 60, height: 60, borderRadius: 30, overflow: "hidden",
            background: ORANGE,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: profilePhoto ? `2px solid ${ORANGE}` : "none",
          }}>
            {profilePhoto
              ? <img src={profilePhoto} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <User size={28} color="#000" />
            }
          </div>
          <button
            onClick={() => setShowPhotoOptions(true)}
            style={{
              position: "absolute", bottom: -2, right: -2,
              width: 22, height: 22, borderRadius: 11,
              background: ORANGE, border: "2px solid #0d0d0d",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", padding: 0,
            }}
          >
            <Camera size={11} color="#000" />
          </button>
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
          <div style={{ color: "#555", fontSize: 12 }}>Pay As You Go · Buy credits, spend as you draft</div>
        </div>
        <ChevronRight size={15} color="#333" />
      </button>


      {/* Credit history */}
      <button
        onClick={() => setShowCreditHistory(true)}
        style={{
          width: "100%", background: "#111", border: "1px solid #1e1e1e",
          borderRadius: 14, padding: "14px 16px", marginBottom: 16, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 12, textAlign: "left",
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE + "55")}
        onMouseLeave={e => (e.currentTarget.style.borderColor = "#1e1e1e")}
      >
        <Clock size={16} color="#888" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#ccc" }}>Credit History</div>
          <div style={{ fontSize: 12, color: "#555" }}>View every credit spent and what it was for</div>
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

      {/* Manage */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>MANAGE</div>
        <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, overflow: "hidden" }}>
          <button onClick={() => setShowManageCases(true)}
            style={{ width: "100%", background: "none", border: "none", cursor: "pointer", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, textAlign: "left" }}>
            <FileText size={15} color="#666" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, color: "#ccc", fontWeight: 600 }}>Manage Cases</div>
              <div style={{ fontSize: 12, color: "#555" }}>Select and delete cases · {data.cases.length} total</div>
            </div>
            <ChevronRight size={15} color="#333" />
          </button>
        </div>
      </div>

      {/* Security */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>SECURITY</div>
        <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, overflow: "hidden" }}>
          <button
            onClick={() => {
              setPasskeyError(null);
              if (secStatus?.webauthnEnabled) disablePasskey();
              else if (!isPasskeySupported()) setPasskeyError("Face ID / Touch ID isn't available on this device or browser.");
              else setShowEnablePasskeyPin(true);
            }}
            disabled={passkeyBusy}
            style={{ width: "100%", background: "none", border: "none", cursor: passkeyBusy ? "default" : "pointer", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, textAlign: "left", opacity: passkeyBusy ? 0.6 : 1 }}>
            <Fingerprint size={16} color={secStatus?.webauthnEnabled ? ORANGE : "#666"} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, color: "#ccc", fontWeight: 600 }}>Unlock PIN with Face ID / Touch ID</div>
              <div style={{ fontSize: 12, color: "#555" }}>
                {passkeyBusy ? "Working…" : secStatus?.webauthnEnabled ? "Enabled — tap to turn off" : "Unlock your PIN with a fingerprint or face scan"}
              </div>
            </div>
            <div style={{ width: 38, height: 22, borderRadius: 11, background: secStatus?.webauthnEnabled ? ORANGE : "#2a2a2a", position: "relative", flexShrink: 0, transition: "background 0.15s" }}>
              <div style={{ width: 18, height: 18, borderRadius: 9, background: "#fff", position: "absolute", top: 2, left: secStatus?.webauthnEnabled ? 18 : 2, transition: "left 0.15s" }} />
            </div>
          </button>
          {passkeyError && (
            <div style={{ padding: "0 16px 14px", fontSize: 12, color: "#ef4444" }}>{passkeyError}</div>
          )}

          <div style={{ borderTop: "1px solid #1e1e1e" }} />

          {/* Separate toggle from the one above — this is a real, server-verified
              WebAuthn credential that signs into the account directly, independent
              of whether PIN-unlock passkey is also enabled. */}
          <button
            onClick={() => {
              setLoginPasskeyError(null);
              if (loginPasskeys.length > 0) disableLoginPasskeys();
              else if (!browserSupportsWebAuthn()) setLoginPasskeyError("Passkeys aren't available on this device or browser.");
              else enableLoginPasskey();
            }}
            disabled={loginPasskeyBusy}
            style={{ width: "100%", background: "none", border: "none", cursor: loginPasskeyBusy ? "default" : "pointer", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, textAlign: "left", opacity: loginPasskeyBusy ? 0.6 : 1 }}>
            <Fingerprint size={16} color={loginPasskeys.length > 0 ? ORANGE : "#666"} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, color: "#ccc", fontWeight: 600 }}>Sign in with Face ID / Touch ID</div>
              <div style={{ fontSize: 12, color: "#555" }}>
                {loginPasskeyBusy ? "Working…" : loginPasskeys.length > 0 ? "Enabled — tap to turn off" : "Sign into your account without a password"}
              </div>
            </div>
            <div style={{ width: 38, height: 22, borderRadius: 11, background: loginPasskeys.length > 0 ? ORANGE : "#2a2a2a", position: "relative", flexShrink: 0, transition: "background 0.15s" }}>
              <div style={{ width: 18, height: 18, borderRadius: 9, background: "#fff", position: "absolute", top: 2, left: loginPasskeys.length > 0 ? 18 : 2, transition: "left 0.15s" }} />
            </div>
          </button>
          {loginPasskeyError && (
            <div style={{ padding: "0 16px 14px", fontSize: 12, color: "#ef4444" }}>{loginPasskeyError}</div>
          )}
        </div>
      </div>

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
                  <HoldToDeleteButton onComplete={() => setShowDeletePin(true)} />
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

      {/* Security + Manage modals */}
      <PinGateModal
        open={showDeletePin}
        title="Confirm account deletion"
        description="Enter your PIN to permanently delete your account and all associated data."
        confirmLabel="Delete everything"
        userId={user?.id}
        onClose={() => setShowDeletePin(false)}
        onSuccess={(pin) => { setShowDeletePin(false); handleDeleteComplete(pin); }}
      />
      <ManageCasesModal
        open={showManageCases}
        cases={data.cases.map(c => ({ id: c.id, title: c.title }))}
        userId={user?.id}
        onClose={() => setShowManageCases(false)}
        onDeleted={(ids) => onCasesDeleted(ids)}
      />
      <PinGateModal
        open={showEnablePasskeyPin}
        title="Confirm your PIN"
        description="Enter your PIN once to enable Face ID / Touch ID unlock."
        confirmLabel="Enable"
        userId={user?.id}
        onClose={() => setShowEnablePasskeyPin(false)}
        onSuccess={finishEnablingPasskey}
      />

      {/* ── Creator button ─────────────────────────────────────────────── */}
      <div style={{ marginTop: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#2a2a2a", letterSpacing: 1 }}>CREATOR</div>
        <button
          onClick={onAboutCreator}
          style={{
            background: "none", border: "none", cursor: "pointer",
            padding: 0, WebkitTapHighlightColor: "transparent",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
          }}
          onMouseEnter={e => { const btn = e.currentTarget; const img = btn.querySelector("img") as HTMLImageElement; if (img) img.style.boxShadow = `0 0 28px ${ORANGE}88, 0 0 56px ${ORANGE}33`; }}
          onMouseLeave={e => { const btn = e.currentTarget; const img = btn.querySelector("img") as HTMLImageElement; if (img) img.style.boxShadow = `0 0 18px ${ORANGE}44, 0 0 36px ${ORANGE}22`; }}
        >
          <img
            src="/creator-logo.jpeg"
            alt="Creator"
            style={{
              width: 72, height: 72, borderRadius: "50%",
              objectFit: "cover",
              border: `2px solid ${ORANGE}44`,
              boxShadow: `0 0 18px ${ORANGE}44, 0 0 36px ${ORANGE}22`,
              transition: "box-shadow 0.2s ease",
              filter: "contrast(1.05) brightness(1.02)",
            }}
          />
          <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5 }}>About the Creator</div>
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 32, gap: 6 }}>
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
      {showCreditHistory && <CreditHistoryModal onClose={() => setShowCreditHistory(false)} />}
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
  const [photo, setPhoto] = useState<string | null>(() => localStorage.getItem("hl_profile_photo"));
  useEffect(() => {
    const handler = () => setPhoto(localStorage.getItem("hl_profile_photo"));
    window.addEventListener("profilePhotoChanged", handler);
    return () => window.removeEventListener("profilePhotoChanged", handler);
  }, []);
  if (photo) {
    return (
      <img src={photo} alt="" draggable={false}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", display: "block", pointerEvents: "none", userSelect: "none", flexShrink: 0 }} />
    );
  }
  return (
    <img src="/profile-icon.jpeg" alt="" draggable={false}
      style={{ width: size, height: size, display: "block", pointerEvents: "none", userSelect: "none", flexShrink: 0 }} />
  );
}

/** Studio icon — orange square with a centered white ► play triangle */
function BuilderIcon({ size = 22 }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Outer rectangle (screen / box) */}
      <rect x="1.75" y="2.5" width="18.5" height="17" rx="2" stroke="currentColor" strokeWidth="1.6" fill="none" />
      {/* Orange vertical bar on the left inside */}
      <rect x="1.75" y="2.5" width="5.5" height="17" rx="2" fill={ORANGE} />
      {/* Clip right-side corners of the bar flush with the outer border */}
      <rect x="5.5" y="2.5" width="1.75" height="17" fill={ORANGE} />
      {/* Small white play triangle centered in the right portion */}
      <polygon points="10.5,9 15,11 10.5,13" fill="currentColor" opacity="0.75" />
    </svg>
  );
}

type NavTab = "home" | "builder" | "tutor" | "profile" | "tools";

interface NavItem { id: NavTab; icon: React.ElementType; label: string }
const NAV_ITEMS: NavItem[] = [
  { id: "home", icon: Home, label: "Barrel" },
  { id: "tools", icon: Wrench, label: "Tools" },
  { id: "builder", icon: BuilderIcon, label: "Studio" },
  { id: "tutor", icon: Home, label: "Index" },
  { id: "profile", icon: User, label: "Profile" },
];
const TOOLS_ITEM   = NAV_ITEMS[1];
const BUILDER_ITEM = NAV_ITEMS[2];
const TUTOR_ITEM   = NAV_ITEMS[3];
const PROFILE_ITEM = NAV_ITEMS[4];

function BottomNavBar({ active, onChange, caseCount }: { active: NavTab; onChange: (t: NavTab) => void; caseCount: number }) {
  const [barrelSpinKey,  setBarrelSpinKey]  = useState(0);
  const left  = [TOOLS_ITEM, BUILDER_ITEM];
  const right = [TUTOR_ITEM, PROFILE_ITEM];

  function handleItemClick(id: NavTab) {
    onChange(id);
  }

  function handleBarrelClick() {
    setBarrelSpinKey(k => k + 1);
    onChange("home");
  }

  function renderIcon(item: NavItem) {
    if (item.id === "tools") {
      const on = active === "tools";
      return <Wrench size={26} color={ORANGE} fill={on ? "#fff" : "none"} />;
    }
    if (item.id === "tutor")   return <IndexIcon   size={55} />;
    if (item.id === "profile") return <ProfileIcon size={28} />;
    return <item.icon size={28} />;
  }

  const barrelActive = active === "home";

  return (
    <div style={{ borderTop: "1px solid #1e1e1e", background: "#0a0a0a", paddingBottom: "env(safe-area-inset-bottom)", flexShrink: 0, position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100 }}>
      <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: -30, zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        <button onClick={handleBarrelClick}
          style={{ width: 56, height: 56, borderRadius: 28, background: "#141414", border: "3px solid #0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: `0 4px 20px ${ORANGE}44`, WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}>
          <BarrelIcon size={40} caseCount={caseCount} spinKey={barrelSpinKey} />
        </button>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.3, color: barrelActive ? ORANGE : "#555" }}>Barrel</span>
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
    if (item.id === "tools") {
      const on = active === "tools";
      return <Wrench size={18} color={ORANGE} fill={on ? "#fff" : "none"} />;
    }
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
  | { type: "tutor"; incident?: Incident; hlCase?: HLCase }
  | { type: "studio" }
  | { type: "studio_workspace"; caseId: string }
  | { type: "about_creator" }
  | { type: "document_intake"; docId: string; caseId: string; fileName: string };

export default function App() {
  const w = useWindowWidth();
  const isMobile = w < 768;
  const { user } = useAuth();
  const isAdmin = user?.isAdmin ?? false;
  const isTester = user?.isTester ?? false;
  // Tester accounts bypass paywalls/tier limits exactly like admin, but don't
  // get admin's account-management powers — kept as its own flag rather than
  // folded into isAdmin so those two things can't be confused anywhere.
  const bypassPaywalls = isAdmin || isTester;

  const [data, setDataRaw] = useState<AppData>(() => loadData());
  useDeadlineNotifications(data.reminders);
  const [navTab, setNavTab] = useState<NavTab>("home");
  const [view, setView] = useState<AppView>({ type: "home" });
  const [showNewIncident, setShowNewIncident] = useState(false);
  const [preLinkedCaseId, setPreLinkedCaseId] = useState<string | null>(null);
  const [showEasterEgg, setShowEasterEgg] = useState(false);
  const [genDocsRefreshKey, setGenDocsRefreshKey] = useState(0);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [newCaseUploading, setNewCaseUploading] = useState(false);
  const [newCaseUploadPct, setNewCaseUploadPct] = useState(0);
  const [newCaseUploadError, setNewCaseUploadError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [creditBalance, setCreditBalance] = useState<number | undefined>(undefined);
  const [planTier, setPlanTier] = useState<string>("free");
  const [showCreditShop, setShowCreditShop] = useState(false);
  const [showUpgradeGate, setShowUpgradeGate] = useState(false);
  const [openPlansSignal, setOpenPlansSignal] = useState(0);
  const [checkoutToast, setCheckoutToast] = useState<string | null>(null);

  // ── Server sync refs ────────────────────────────────────────────────────────
  const serverSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Tracks which cases have already had organize triggered to prevent double-firing */
  const organizingCasesRef = useRef<Set<string>>(new Set());
  // Mirrors `data` outside React state so the visibility/pagehide flush below
  // (registered once, empty deps) always sees the latest cases instead of
  // whatever was current when the listener was attached.
  const dataRef = useRef(data);

  function syncCasesToServer(cases: AppData["cases"]) {
    cases.forEach(c => {
      api.cases.upsert(c.id, c.title, c.workflowStage, c as unknown as Record<string, unknown>).catch(() => {});
    });
  }

  function setData(d: AppData) {
    setDataRaw(d);
    dataRef.current = d;
    saveData(d);
    // Debounce server sync — avoids flooding during rapid updates (e.g. StoryView auto-save)
    if (serverSyncTimeoutRef.current) clearTimeout(serverSyncTimeoutRef.current);
    serverSyncTimeoutRef.current = setTimeout(() => syncCasesToServer(d.cases), 1500);
  }

  // A phone closed/backgrounded within that 1500ms window loses the pending
  // sync outright — the debounced timeout never fires, so whatever was typed
  // right before switching apps or locking the screen never reaches the
  // server, even though the UI already showed it as saved locally. Flushing
  // immediately on the tab/app actually going hidden (not just unmounting)
  // closes that gap without waiting the full debounce on every keystroke.
  useEffect(() => {
    function flushPendingSync() {
      if (!serverSyncTimeoutRef.current) return;
      clearTimeout(serverSyncTimeoutRef.current);
      serverSyncTimeoutRef.current = null;
      syncCasesToServer(dataRef.current.cases);
    }
    function onVisibilityChange() {
      if (document.hidden) flushPendingSync();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", flushPendingSync);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", flushPendingSync);
    };
  }, []);

  // Fetch credit balance + plan tier on mount and after checkout success
  const fetchCreditBalance = useCallback(async () => {
    try {
      const { creditBalance: bal, planTier: tier } = await aiApi.creditBalance();
      setCreditBalance(bal);
      if (tier) setPlanTier(tier);
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

  // Prevent the browser's default "navigate to dropped file" behavior anywhere
  // outside an explicit drop zone — without this, a file dropped even slightly
  // off-target replaces the whole app with the raw file.
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  // ── Load cases from server on mount — merge with localStorage ────────────────
  // Merge policy: local always wins (user may have unsynced edits).
  // Server only fills in cases that don't exist locally, or adds structuredCase
  // (which is always server-generated and never exists in local-only state).
  useEffect(() => {
    if (!user?.id) return; // wait for the session to finish loading before syncing
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
            // casePhotoDataUrl lives in its own DB column, not caseData (same
            // reasoning as studioProjectExpiresAt) — pull it in explicitly.
            if (sc.casePhotoDataUrl) caseData.photoDataUrl = sc.casePhotoDataUrl;
            localMap.set(sc.id, caseData);
            changed = true;
          } else {
            // Local exists — pull server-side fields ONLY where local is still empty,
            // so AI-extracted data (parties/timeline/jurisdiction/structuredCase) merged
            // on another session/device isn't lost to "local wins". Non-empty local
            // fields always win (user edits are never overwritten).
            const serverCase = sc.caseData as unknown as HLCase;
            const patch: Partial<HLCase> = {};
            if (!local.structuredCase && sc.structuredCase) {
              patch.structuredCase = sc.structuredCase as unknown as HLCase["structuredCase"];
            }
            if (local.parties.length === 0 && serverCase?.parties?.length) patch.parties = serverCase.parties;
            if (local.timeline.length === 0 && serverCase?.timeline?.length) patch.timeline = serverCase.timeline;
            if (!local.jurisdiction?.trim() && serverCase?.jurisdiction?.trim()) patch.jurisdiction = serverCase.jurisdiction;
            // Restores a photo that vanished locally (storage eviction, reinstall,
            // new device) from the server's authoritative copy. Doesn't overwrite
            // a photo the user just picked locally — local wins whenever present.
            if (!local.photoDataUrl && sc.casePhotoDataUrl) patch.photoDataUrl = sc.casePhotoDataUrl;
            if (Object.keys(patch).length > 0) {
              localMap.set(sc.id, { ...local, ...patch });
              changed = true;
            }
          }
        });
        if (!changed) return prev;
        const next = { ...prev, cases: Array.from(localMap.values()) };
        saveData(next);
        return next;
      });
    }).catch(() => {}); // Silent failure — user stays on local data
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!user?.id) return; // don't call before the session is ready
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
  }, [fetchCreditBalance, user?.id]);

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
      if (hlCase) { setNavTab("home"); setView({ type: "case_detail", hlCase }); }
    } else {
      setNavTab("home");
      setView({ type: "incident_detail", incident });
    }
  }

  function handleCreateNewCase() {
    if (data.cases.length >= 1 && !bypassPaywalls) {
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
    // Stay on current tab — workflow views render under any navTab
    setView({ type: "case_parties", caseId: newCase.id });
  }

  function handleContinueCase(hlCase: HLCase, stage: WorkflowStage) {
    const fresh = data.cases.find(c => c.id === hlCase.id) ?? hlCase;
    setNavTab("home");
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
    if (data.cases.length >= 1 && !bypassPaywalls) {
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
    setNavTab("home");
    setView({ type: "case_parties", caseId: hlCase.id });
  }

  async function handleUploadForNewCase(file: File) {
    // After 2 free cases, require at least 1 credit to create more
    if (data.cases.length >= 1 && !bypassPaywalls) {
      setShowUpgradeGate(true);
      return;
    }
    setNewCaseUploading(true);
    setNewCaseUploadPct(0);
    try {
      // Step 1: Store the file only — no AI extraction, no credit cost
      const form = new FormData();
      form.append("file", file);
      const result = await aiApi.uploadWithProgress(form, pct => setNewCaseUploadPct(pct));

      if (!result.docId) throw new Error("Document could not be stored. Please try again.");

      // Step 2: Create a minimal case shell (title updated after AI analysis)
      const caseTitle = (file.name.replace(/\.[^.]+$/, "") + " — Case").slice(0, 100);
      const newCase: HLCase = {
        id: crypto.randomUUID(),
        title: caseTitle,
        incidentIds: [],
        notes: "",
        status: "open",
        createdAt: Date.now(),
        parties: [],
        court: null,
        story: "",
        timeline: [],
        workflowStage: "documents",
        intakeChecklist: [],
      };
      setData(addCase(data, newCase));

      // Step 3: Route to the intake wizard — NOT directly to case_detail
      setNavTab("home");
      setView({ type: "document_intake", docId: result.docId, caseId: newCase.id, fileName: file.name });
    } catch (err: unknown) {
      setNewCaseUploadError((err as Error).message || "Upload failed. Please try again.");
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
    setNavTab("home");
  }

  // Tutor tab's floating case bubble bar: pick a case to map in the Index
  // WITHOUT navigating away to the case detail/builder screen.
  function handleSelectTutorCase(hlCase: HLCase) {
    const fresh = data.cases.find(c => c.id === hlCase.id) ?? hlCase;
    setView({ type: "tutor", hlCase: fresh });
  }

  function goHome() {
    setView({ type: "home" });
    setNavTab("home");
  }

  function handleDeleteCaseWithSync(id: string) {
    setData(deleteCase(data, id));
    api.cases.delete(id).catch(() => {});
    goHome();
  }

  function handleNavChange(tab: NavTab) {
    setNavTab(tab);
    if (tab === "home") setView({ type: "home" });
    if (tab === "builder") setView({ type: "home" });
    if (tab === "tutor") setView({ type: "tutor" });
    if (tab === "tools") setView({ type: "home" });
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
      if (!hlCase) { goHome(); return null; }
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
      if (!hlCase) { goHome(); return null; }
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
      if (!hlCase) { goHome(); return null; }
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
      if (!hlCase) { goHome(); return null; }
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
      if (!hlCase) { goHome(); return null; }
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
      if (!hlCase) { goHome(); return null; }
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
      if (!hlCase) { goHome(); return null; }
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

    if (view.type === "document_intake") {
      const hlCase = data.cases.find(c => c.id === view.caseId);
      if (!hlCase) { goHome(); return null; }
      return (
        <DocumentIntakeView
          docId={view.docId}
          caseId={view.caseId}
          fileName={view.fileName}
          isAdmin={isAdmin}
          isApex={planTier === "apex" || isTester}
          onComplete={(analysis) => {
            // Merge the AI's extraction (summary, jurisdiction, parties, timeline) into the case.
            const updated = mergeAnalysisIntoCase(hlCase, analysis);
            setData(updateCase(data, updated));
            fetchCreditBalance();
            setView({ type: "case_detail", hlCase: updated });
          }}
          onCancel={() => {
            // Remove the placeholder case and go home
            handleDeleteCaseWithSync(view.caseId);
          }}
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

    if (view.type === "case_detail") {
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
          onBack={() => { setView({ type: "home" }); setNavTab("home"); }}
          genDocsRefreshKey={genDocsRefreshKey}
          creditBalance={creditBalance}
          isAdmin={isAdmin}
          isApex={planTier === "apex" || isTester}
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

    if (view.type === "about_creator") {
      return <AboutCreatorView onBack={() => setView({ type: "home" })} />;
    }

    if (navTab === "tools") {
      return <ToolsView />;
    }

    if (navTab === "profile") {
      return (
        <ProfileView
          data={data}
          onOpenCase={handleOpenCase}
          onEasterEgg={() => setShowEasterEgg(true)}
          onBuyCredits={() => setShowCreditShop(true)}
          onAboutCreator={() => setView({ type: "about_creator" })}
          onCasesDeleted={ids => setData(ids.reduce((acc, id) => deleteCase(acc, id), data))}
          openPlansSignal={openPlansSignal}
        />
      );
    }

    if (navTab === "builder") {
      if (view.type === "studio_workspace") {
        const studioCase = data.cases.find(c => c.id === view.caseId);
        if (!studioCase) return <ExhibitStudioView cases={data.cases} onOpenStudio={caseId => setView({ type: "studio_workspace", caseId })} onCreateCase={handleCreateNewCase} />;
        return (
          <VideoWorkspaceView
            hlCase={studioCase}
            onUpdateCase={c => setData(updateCase(data, c))}
            onBack={() => setView({ type: "home" })}
          />
        );
      }
      return <ExhibitStudioView cases={data.cases} onOpenStudio={caseId => setView({ type: "studio_workspace", caseId })} onCreateCase={handleCreateNewCase} />;
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
        uploadError={newCaseUploadError}
        onClearUploadError={() => setNewCaseUploadError(null)}
        onUpdateCase={c => setData(updateCase(data, c))}
      />
    );
  }

  return (
    <div style={{ height: "100dvh", background: BG, color: "#fff", fontFamily: "Arial, sans-serif", display: "flex", flexDirection: "column", overflow: "hidden", paddingTop: "env(safe-area-inset-top)" }}>
      {/* Notification bell — fixed top-right (hidden on Tutor tab and Studio workspace, which has its own ⓘ button) */}
      {navTab !== "tutor" && !(navTab === "builder" && view.type === "studio_workspace") && (
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

      {/* Floating case bubble strip — Index (tutor) tab only, mobile, when active cases exist */}
      {isMobile && navTab === "tutor" && (() => {
        const bubbleCases = [...data.cases]
          .filter(c => c.status !== "closed")
          .sort((a, b) => b.createdAt - a.createdAt);
        return bubbleCases.length > 0
          ? <CaseBubbleBar cases={bubbleCases} onOpenCase={handleSelectTutorCase} />
          : null;
      })()}

      {isMobile && view.type !== "document_intake" && (
        <BottomNavBar active={navTab} onChange={handleNavChange} caseCount={data.cases.length} />
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

      {/* Upgrade gate — shown when the free 1-case limit is hit */}
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
                <div style={{ color: "#555", fontSize: 13 }}>You've used your free case</div>
              </div>
            </div>
            <p style={{ color: "#888", fontSize: 14, lineHeight: 1.65, margin: "0 0 24px" }}>
              The free plan includes <strong style={{ color: "#ccc" }}>1 case</strong>. Upgrade to Pro-Say or Apex for unlimited cases, priority AI processing, and advanced document generation.
            </p>
            <p style={{ color: "#555", fontSize: 12, lineHeight: 1.5, margin: "0 0 24px" }}>
              💡 <strong style={{ color: "#666" }}>Tip:</strong> You can also delete an existing case to free up a slot.
            </p>
            <button
              onClick={() => { setShowUpgradeGate(false); setOpenPlansSignal(k => k + 1); setNavTab("profile"); setView({ type: "home" }); }}
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

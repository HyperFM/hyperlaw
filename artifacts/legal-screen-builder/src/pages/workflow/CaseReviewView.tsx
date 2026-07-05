import React from "react";
import { HLCase, WorkflowStage } from "../../types";
import { WorkflowStepper } from "../../components/WorkflowStepper";
import {
  ChevronRight, Edit2, Users, Scale, BookOpen, Clock,
  CheckCircle2, AlertCircle, ArrowLeft,
} from "lucide-react";

const ORANGE = "#f45d01";
const BG = "#0a0908";
const PANEL = "#111";
const LINE = "#1e1e1e";
const PAPER = "#f4efe8";

interface Props {
  hlCase: HLCase;
  onBack: () => void;
  onEditPhase: (stage: WorkflowStage) => void;
  onContinue: () => void;
}

export function CaseReviewView({ hlCase, onBack, onEditPhase, onContinue }: Props) {
  const hasParties = hlCase.parties.length > 0;
  const hasCourt = hlCase.court !== null;
  const hasStory = (hlCase.story ?? "").trim().length > 0;
  const hasTimeline = hlCase.timeline.length > 0;
  const allComplete = hasParties && hasCourt && hasStory && hasTimeline;
  const wordCount = hasStory
    ? hlCase.story.trim().split(/\s+/).filter(Boolean).length
    : 0;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: BG, color: PAPER, minHeight: 0 }}>
      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "28px 20px 12px" }}>

          {/* Back */}
          <button
            onClick={onBack}
            style={{ background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer", padding: "0 0 20px", display: "flex", alignItems: "center", gap: 6 }}
          >
            <ArrowLeft size={14} /> Back to Timeline
          </button>

          {/* Stepper */}
          <WorkflowStepper current="timeline" />

          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, color: ORANGE, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8, textTransform: "uppercase" }}>
              Case Review
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.5, marginBottom: 8 }}>
              {hlCase.title}
            </div>
            <div style={{ color: "#666", fontSize: 14, lineHeight: 1.65 }}>
              Review everything before continuing. Tap <strong style={{ color: "#888" }}>Edit</strong> on any section to go back and make changes.
            </div>
          </div>

          {/* ── Parties ──────────────────────────────────────────────────────── */}
          <ReviewSection
            icon={<Users size={16} color={hasParties ? "#4ade80" : "#555"} />}
            title="Parties"
            done={hasParties}
            onEdit={() => onEditPhase("parties")}
          >
            {hasParties ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {hlCase.parties.map(p => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 18 }}>{p.nicknameEmoji}</span>
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 700, color: PAPER, fontSize: 13 }}>{p.nickname}</span>
                      <span style={{ color: "#666", fontSize: 12 }}> — {p.firstName} {p.lastName}</span>
                      {p.agency && (
                        <span style={{ color: "#444", fontSize: 12 }}> · {p.title ? `${p.title}, ` : ""}{p.agency}{p.badge ? ` (Badge ${p.badge})` : ""}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <MissingHint label="Add parties to identify everyone involved" />
            )}
          </ReviewSection>

          {/* ── Court ────────────────────────────────────────────────────────── */}
          <ReviewSection
            icon={<Scale size={16} color={hasCourt ? "#4ade80" : "#555"} />}
            title="Court"
            done={hasCourt}
            onEdit={() => onEditPhase("court")}
          >
            {hasCourt ? (
              <div>
                <div style={{ fontWeight: 700, color: PAPER, fontSize: 14, marginBottom: 2 }}>
                  {hlCase.court!.name}
                </div>
                <div style={{ fontSize: 12, color: "#555" }}>
                  {hlCase.court!.state} · {hlCase.court!.level === "federal" ? "Federal District Court" : "State Trial Court"}
                  {hlCase.court!.shortName ? ` (${hlCase.court!.shortName})` : ""}
                </div>
              </div>
            ) : (
              <MissingHint label="Select the court where this matter may be filed" />
            )}
          </ReviewSection>

          {/* ── Story ────────────────────────────────────────────────────────── */}
          <ReviewSection
            icon={<BookOpen size={16} color={hasStory ? "#4ade80" : "#555"} />}
            title="Your Story"
            done={hasStory}
            onEdit={() => onEditPhase("story")}
          >
            {hasStory ? (
              <div>
                <div style={{ color: "#888", fontSize: 13, lineHeight: 1.7, marginBottom: 6 }}>
                  {hlCase.story.slice(0, 320)}{hlCase.story.length > 320 ? "…" : ""}
                </div>
                <div style={{ fontSize: 11, color: "#555" }}>
                  {wordCount.toLocaleString()} word{wordCount !== 1 ? "s" : ""}
                </div>
              </div>
            ) : (
              <MissingHint label="Write out what happened in your own words" />
            )}
          </ReviewSection>

          {/* ── Timeline ─────────────────────────────────────────────────────── */}
          <ReviewSection
            icon={<Clock size={16} color={hasTimeline ? "#4ade80" : "#555"} />}
            title="Timeline"
            done={hasTimeline}
            onEdit={() => onEditPhase("timeline")}
          >
            {hasTimeline ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {hlCase.timeline.slice(0, 4).map((event, i) => (
                  <div key={event.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: 10,
                      background: `${ORANGE}18`, border: `1px solid ${ORANGE}44`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 800, color: ORANGE, flexShrink: 0, marginTop: 2,
                    }}>
                      {i + 1}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#ccc" }}>{event.title}</div>
                      {event.description && (
                        <div style={{ fontSize: 12, color: "#555", marginTop: 2, lineHeight: 1.5 }}>
                          {event.description.slice(0, 80)}{event.description.length > 80 ? "…" : ""}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {hlCase.timeline.length > 4 && (
                  <div style={{ fontSize: 12, color: "#555", paddingLeft: 30 }}>
                    +{hlCase.timeline.length - 4} more event{hlCase.timeline.length - 4 !== 1 ? "s" : ""}
                  </div>
                )}
              </div>
            ) : (
              <MissingHint label="Build the chronological timeline from your story" />
            )}
          </ReviewSection>

          {/* Bottom spacer for sticky bar */}
          <div style={{ height: 8 }} />
        </div>
      </div>

      {/* ── Sticky bottom CTA ────────────────────────────────────────────────── */}
      <div style={{
        background: BG, borderTop: `1px solid ${LINE}`,
        padding: "16px 20px",
        paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
        flexShrink: 0,
      }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          {!allComplete && (
            <div style={{
              background: "#1a1200", border: "1px solid #3a2a00", borderRadius: 10,
              padding: "10px 14px", marginBottom: 12,
              display: "flex", alignItems: "flex-start", gap: 8,
              fontSize: 13, color: "#aa8800", lineHeight: 1.55,
            }}>
              <AlertCircle size={14} color="#aa8800" style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                Some sections are incomplete. You can still continue — come back to fill in missing information anytime.
              </span>
            </div>
          )}
          <button
            onClick={onContinue}
            style={{
              width: "100%",
              background: `linear-gradient(90deg, ${ORANGE}, #ff8c00)`,
              border: "none", borderRadius: 14, padding: "17px",
              color: "#000", fontSize: 16, fontWeight: 900, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "opacity 0.15s",
            }}
          >
            {allComplete ? <CheckCircle2 size={18} /> : <ChevronRight size={18} />}
            Continue to Case
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ReviewSection({ icon, title, done, onEdit, children }: {
  icon: React.ReactNode;
  title: string;
  done: boolean;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: PANEL,
      border: `1px solid ${done ? "#1e3a1a" : LINE}`,
      borderRadius: 16, padding: "18px", marginBottom: 14,
      transition: "border-color 0.2s",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {icon}
          <span style={{ fontWeight: 800, fontSize: 14, color: done ? PAPER : "#666" }}>{title}</span>
          {done
            ? <span style={{ fontSize: 10, background: "#1a3a1a", border: "1px solid #2a6a22", borderRadius: 4, padding: "2px 7px", color: "#4ade80", fontWeight: 700 }}>✓ Done</span>
            : <span style={{ fontSize: 10, background: "#1a1a1a", border: `1px solid ${LINE}`, borderRadius: 4, padding: "2px 7px", color: "#555", fontWeight: 700 }}>Incomplete</span>
          }
        </div>
        <button
          onClick={onEdit}
          style={{
            background: "none", border: `1px solid ${LINE}`, borderRadius: 8,
            padding: "6px 12px", color: "#666", fontSize: 12, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 4, fontWeight: 700,
            transition: "border-color 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE + "55")}
          onMouseLeave={e => (e.currentTarget.style.borderColor = LINE)}
        >
          <Edit2 size={11} /> Edit
        </button>
      </div>
      {children}
    </div>
  );
}

function MissingHint({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#555", fontSize: 13 }}>
      <AlertCircle size={13} color="#444" />
      {label}
    </div>
  );
}

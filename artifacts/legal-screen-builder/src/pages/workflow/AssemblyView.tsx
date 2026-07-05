import { useState, useEffect } from "react";
import { HLCase, Party } from "../../types";
import { aiApi } from "../../lib/aiApi";
import { ChevronRight, Zap, AlertCircle, Edit2, CheckCircle2, Info, ArrowLeft } from "lucide-react";

const ORANGE = "#f45d01";
const BG = "#0a0908";
const PANEL = "#111";
const LINE = "#1e1e1e";
const PAPER = "#f4efe8";

interface PotentialClaim {
  claim: string;
  supportingFacts: string[];
  missingFacts: string[];
}

interface AssemblyResult {
  organizedFacts: string;
  draftComplaint: string;
  potentialClaims: PotentialClaim[];
}

interface Props {
  hlCase: HLCase;
  onUpdate: (c: HLCase) => void;
  onNext: () => void;
  onBack: () => void;
  onSkipToCase: () => void;
}

/** Replace nickname words with legal names before sending to AI */
function substituteNicknames(text: string, parties: Party[]): string {
  let result = text;
  for (const p of parties) {
    if (!p.nickname) continue;
    const legalName = `${p.firstName} ${p.lastName}`.trim();
    // Word-boundary replacement, case-insensitive
    try {
      result = result.replace(new RegExp(`\\b${p.nickname}\\b`, "gi"), legalName);
    } catch {
      // If nickname has special regex chars, skip
    }
  }
  return result;
}

export function AssemblyView({ hlCase, onUpdate, onNext, onBack, onSkipToCase }: Props) {
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState("");
  const [result, setResult] = useState<AssemblyResult | null>(
    hlCase.assembly ?? null
  );
  const [editingComplaint, setEditingComplaint] = useState(false);
  const [complaintDraft, setComplaintDraft] = useState("");
  const [expandedClaim, setExpandedClaim] = useState<number | null>(null);

  const hasStory = (hlCase.story ?? "").trim().length > 0;
  const hasTimeline = hlCase.timeline.length > 0;
  const canAssemble = hasStory || hasTimeline;

  // Auto-trigger if no result yet and we have enough data
  useEffect(() => {
    if (!result && canAssemble) runAssembly();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function runAssembly() {
    setBuilding(true);
    setBuildError("");
    try {
      // Substitute nicknames so AI sees legal names
      const storyWithNames = substituteNicknames(hlCase.story ?? "", hlCase.parties);
      const timelineWithNames = hlCase.timeline.map(e => ({
        title: substituteNicknames(e.title, hlCase.parties),
        description: substituteNicknames(e.description, hlCase.parties),
      }));

      const data = await aiApi.assembleCase({
        caseId: hlCase.id,
        parties: hlCase.parties.map(p => ({
          name: `${p.firstName} ${p.lastName}`,
          role: p.type === "official" ? `Official — ${p.agency ?? "unknown agency"}${p.title ? `, ${p.title}` : ""}` : "Civilian",
          badge: p.badge,
        })),
        court: hlCase.court ? {
          name: hlCase.court.name,
          level: hlCase.court.level,
          state: hlCase.court.state,
        } : null,
        story: storyWithNames,
        timeline: timelineWithNames,
      });

      const assembled: AssemblyResult = {
        organizedFacts: data.organizedFacts,
        draftComplaint: data.draftComplaint,
        potentialClaims: data.potentialClaims,
      };
      setResult(assembled);
      setComplaintDraft(assembled.draftComplaint);
      // Persist to case
      onUpdate({
        ...hlCase,
        assembly: { ...assembled, assembledAt: Date.now() },
        workflowStage: "assembly",
      });
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e?.code === "rate_limited") {
        setBuildError("Daily AI limit reached. Your case info is saved — try assembly again tomorrow, or skip to your case.");
      } else {
        setBuildError("Assembly failed. Your case info is saved — tap 'Try Again' or skip to your case.");
      }
    } finally {
      setBuilding(false);
    }
  }

  function saveComplaint() {
    if (!result) return;
    const updated: AssemblyResult = { ...result, draftComplaint: complaintDraft };
    setResult(updated);
    onUpdate({
      ...hlCase,
      assembly: { ...updated, assembledAt: hlCase.assembly?.assembledAt ?? Date.now() },
    });
    setEditingComplaint(false);
  }

  function handleContinue() {
    onNext(); // → case_learning
  }

  const textareaStyle: React.CSSProperties = {
    width: "100%", background: "#1a1815", border: `1px solid ${ORANGE}44`, borderRadius: 12,
    padding: "16px", color: PAPER, fontSize: 13, lineHeight: 1.75, fontFamily: "inherit",
    resize: "vertical", outline: "none", boxSizing: "border-box", minHeight: 300,
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: BG, color: PAPER, minHeight: 0 }}>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "28px 20px 16px" }}>

          {/* Back */}
          <button onClick={onBack} style={{ background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer", padding: "0 0 20px", display: "flex", alignItems: "center", gap: 6 }}>
            <ArrowLeft size={14} /> Back to Review
          </button>

          {/* Header */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, color: ORANGE, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 }}>AI Assembly</div>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.5, marginBottom: 8 }}>Assembling Your Case</div>
            <div style={{ color: "#666", fontSize: 14, lineHeight: 1.65 }}>
              The AI reads your parties, court, story, and timeline to organize the facts, draft a complaint, and identify potential legal claims.
            </div>
          </div>

          {/* Disclaimer */}
          <div style={{ background: "#0f0d0c", border: `1px solid #2a2521`, borderRadius: 12, padding: "12px 16px", marginBottom: 24, display: "flex", alignItems: "flex-start", gap: 8 }}>
            <Info size={13} color="#555" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 12, color: "#555", lineHeight: 1.6 }}>
              AI suggestions are not legal conclusions or advice. Potential claims are identified based on the facts you provided — they may not apply to your jurisdiction or situation. Verify with a licensed attorney.
            </div>
          </div>

          {/* Loading state */}
          {building && (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <div style={{ width: 52, height: 52, borderRadius: 26, background: `${ORANGE}22`, border: `2px solid ${ORANGE}44`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", animation: "pulse 1.5s ease-in-out infinite" }}>
                <Zap size={24} color={ORANGE} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Assembling case…</div>
              <div style={{ color: "#555", fontSize: 13 }}>Reading your story, parties, and timeline</div>
              <style>{`@keyframes pulse { 0%,100%{opacity:0.6} 50%{opacity:1} }`}</style>
            </div>
          )}

          {/* Error state */}
          {buildError && !building && (
            <div style={{ background: "#1a0e0e", border: "1px solid #3a1a1a", borderRadius: 14, padding: "20px", marginBottom: 20, textAlign: "center" }}>
              <AlertCircle size={28} color="#f87171" style={{ marginBottom: 12 }} />
              <div style={{ color: "#f87171", fontSize: 14, marginBottom: 16, lineHeight: 1.6 }}>{buildError}</div>
              <button onClick={runAssembly} style={{ background: ORANGE, border: "none", borderRadius: 10, padding: "12px 24px", color: "#000", fontWeight: 800, cursor: "pointer", fontSize: 14 }}>
                Try Again
              </button>
            </div>
          )}

          {/* Results */}
          {result && !building && (
            <>
              {/* Organized Facts */}
              <Section title="Organized Facts" icon="📋">
                <div style={{ fontSize: 13, color: "#888", lineHeight: 1.75, whiteSpace: "pre-wrap" }}>
                  {result.organizedFacts}
                </div>
              </Section>

              {/* Potential Claims */}
              <Section title="Potential Legal Claims" icon="⚖️" subtitle="AI suggestions — not legal conclusions">
                {result.potentialClaims.length === 0 ? (
                  <div style={{ color: "#555", fontSize: 13 }}>No specific claims identified from the provided facts.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {result.potentialClaims.map((claim, i) => (
                      <div key={i}>
                        <button
                          onClick={() => setExpandedClaim(expandedClaim === i ? null : i)}
                          style={{ width: "100%", background: "#1a1815", border: `1px solid ${expandedClaim === i ? ORANGE + "44" : LINE}`, borderRadius: 12, padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, textAlign: "left" }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                            <div style={{ width: 6, height: 6, borderRadius: 3, background: ORANGE, flexShrink: 0 }} />
                            <span style={{ fontSize: 14, fontWeight: 700, color: PAPER }}>{claim.claim}</span>
                          </div>
                          <span style={{ fontSize: 18, flexShrink: 0, color: "#555" }}>{expandedClaim === i ? "▲" : "▼"}</span>
                        </button>
                        {expandedClaim === i && (
                          <div style={{ background: "#0f0d0c", border: `1px solid ${LINE}`, borderRadius: "0 0 12px 12px", padding: "14px 16px", borderTop: "none", marginTop: -1 }}>
                            {claim.supportingFacts.length > 0 && (
                              <div style={{ marginBottom: 10 }}>
                                <div style={{ fontSize: 11, color: "#4ade80", fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6 }}>Supporting Facts</div>
                                {claim.supportingFacts.map((f, j) => (
                                  <div key={j} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 4 }}>
                                    <span style={{ color: "#4ade80", fontSize: 13, flexShrink: 0, marginTop: 2 }}>✓</span>
                                    <span style={{ fontSize: 13, color: "#888", lineHeight: 1.55 }}>{f}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {claim.missingFacts.length > 0 && (
                              <div>
                                <div style={{ fontSize: 11, color: "#f59e0b", fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6 }}>Missing / Unclear</div>
                                {claim.missingFacts.map((f, j) => (
                                  <div key={j} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 4 }}>
                                    <span style={{ color: "#f59e0b", fontSize: 13, flexShrink: 0, marginTop: 2 }}>?</span>
                                    <span style={{ fontSize: 13, color: "#888", lineHeight: 1.55 }}>{f}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Draft Complaint */}
              <Section title="Draft Complaint" icon="📄" subtitle="Editable — review carefully before use">
                {editingComplaint ? (
                  <div>
                    <textarea
                      style={textareaStyle}
                      value={complaintDraft}
                      onChange={e => setComplaintDraft(e.target.value)}
                    />
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button onClick={saveComplaint} style={{ flex: 1, background: ORANGE, border: "none", borderRadius: 10, padding: "12px", color: "#000", fontWeight: 800, cursor: "pointer", fontSize: 14 }}>
                        Save Draft
                      </button>
                      <button onClick={() => { setComplaintDraft(result.draftComplaint); setEditingComplaint(false); }} style={{ background: "none", border: `1px solid ${LINE}`, borderRadius: 10, padding: "12px 16px", color: "#555", cursor: "pointer" }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 13, color: "#888", lineHeight: 1.75, whiteSpace: "pre-wrap", marginBottom: 12, maxHeight: 320, overflow: "hidden", position: "relative" }}>
                      {result.draftComplaint}
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 60, background: `linear-gradient(transparent, ${PANEL})` }} />
                    </div>
                    <button onClick={() => { setComplaintDraft(result.draftComplaint); setEditingComplaint(true); }} style={{ background: "none", border: `1px solid ${LINE}`, borderRadius: 10, padding: "10px 16px", color: "#666", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700 }}>
                      <Edit2 size={13} /> Edit Draft
                    </button>
                  </div>
                )}
              </Section>

              {/* Reassemble */}
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <button onClick={runAssembly} style={{ background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Zap size={13} /> Reassemble from updated story
                </button>
              </div>
            </>
          )}

          {/* No content yet and not loading */}
          {!result && !building && !buildError && !canAssemble && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#555" }}>
              <div style={{ fontSize: 14, marginBottom: 16 }}>Go back and complete your story and timeline before assembling.</div>
              <button onClick={onBack} style={{ background: "none", border: `1px solid ${LINE}`, borderRadius: 10, padding: "12px 20px", color: "#666", cursor: "pointer", fontSize: 14 }}>
                Back to Review
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sticky bottom */}
      <div style={{ background: BG, borderTop: `1px solid ${LINE}`, padding: "16px 20px", paddingBottom: "calc(16px + env(safe-area-inset-bottom))", flexShrink: 0 }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <button
            onClick={handleContinue}
            disabled={!result || building}
            style={{
              width: "100%",
              background: (result && !building) ? `linear-gradient(90deg, ${ORANGE}, #ff8c00)` : "#1a1a1a",
              border: "none", borderRadius: 14, padding: "17px",
              color: (result && !building) ? "#000" : "#444",
              fontSize: 16, fontWeight: 900,
              cursor: (result && !building) ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "all 0.2s",
            }}>
            <CheckCircle2 size={18} /> View Learning Index <ChevronRight size={18} />
          </button>
          <button onClick={onSkipToCase} style={{ width: "100%", background: "none", border: "none", color: "#444", fontSize: 13, cursor: "pointer", marginTop: 10, padding: "10px" }}>
            Skip to Case
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon, subtitle, children }: {
  title: string; icon: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 16, padding: "18px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: subtitle ? 4 : 14 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontWeight: 800, fontSize: 15, color: PAPER }}>{title}</span>
      </div>
      {subtitle && (
        <div style={{ fontSize: 11, color: "#555", fontWeight: 600, marginBottom: 14, letterSpacing: 0.2 }}>{subtitle}</div>
      )}
      {children}
    </div>
  );
}

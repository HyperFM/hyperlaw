import { useState, useEffect } from "react";
import { HLCase, LearningAuthority } from "../../types";
import { aiApi } from "../../lib/aiApi";
import { ChevronRight, RefreshCw, BookOpen, Scale, ScrollText, ArrowLeft, Info } from "lucide-react";

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

function typeIcon(type: LearningAuthority["type"]) {
  if (type === "statute") return <ScrollText size={14} color="#3b82f6" />;
  if (type === "constitution") return <Scale size={14} color="#8b5cf6" />;
  return <BookOpen size={14} color="#f59e0b" />;
}

function typeLabel(type: LearningAuthority["type"]) {
  return type === "statute" ? "Statute" : type === "constitution" ? "Constitutional" : "Case Law";
}

function typeColor(type: LearningAuthority["type"]) {
  return type === "statute" ? "#3b82f6" : type === "constitution" ? "#8b5cf6" : "#f59e0b";
}

export function LearningIndexView({ hlCase, onUpdate, onNext, onBack }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [authorities, setAuthorities] = useState<LearningAuthority[]>(
    hlCase.learningAuthorities ?? []
  );
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const hasAssembly = !!hlCase.assembly;
  const hasCachedResult = authorities.length > 0;

  // Auto-fetch if no result yet and assembly is done
  useEffect(() => {
    if (!hasCachedResult && hasAssembly) fetchLearning();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchLearning() {
    setLoading(true);
    setError("");
    try {
      const data = await aiApi.buildLearning({
        caseId: hlCase.id,
        organizedFacts: hlCase.assembly?.organizedFacts ?? hlCase.story ?? "",
        potentialClaims: (hlCase.assembly?.potentialClaims ?? []).map(c => ({
          claim: c.claim,
          supportingFacts: c.supportingFacts,
        })),
        court: hlCase.court ? {
          name: hlCase.court.name,
          level: hlCase.court.level,
          state: hlCase.court.state,
        } : null,
      });

      const fetched = data.authorities;
      setAuthorities(fetched);
      onUpdate({
        ...hlCase,
        learningAuthorities: fetched,
        learningGeneratedAt: Date.now(),
        workflowStage: "learning",
      });
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e?.code === "rate_limited") {
        setError("Daily AI limit reached. Your saved learning index will appear when available.");
      } else {
        setError("Couldn't generate the learning index. Tap 'Regenerate' to try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: BG, color: PAPER, minHeight: 0 }}>

      {/* Scrollable */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "28px 20px 16px" }}>

          {/* Back */}
          <button onClick={onBack} style={{ background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer", padding: "0 0 20px", display: "flex", alignItems: "center", gap: 6 }}>
            <ArrowLeft size={14} /> Back to Assembly
          </button>

          {/* Header */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, color: ORANGE, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 }}>Learning Index</div>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.5, marginBottom: 8 }}>Relevant Law</div>
            <div style={{ color: "#666", fontSize: 14, lineHeight: 1.65 }}>
              Statutes, constitutional provisions, and precedent that may be relevant to the facts in your case — each explained in plain English.
            </div>
          </div>

          {/* Disclaimer */}
          <div style={{ background: "#0f0d0c", border: `1px solid #2a2521`, borderRadius: 12, padding: "12px 16px", marginBottom: 24, display: "flex", alignItems: "flex-start", gap: 8 }}>
            <Info size={13} color="#555" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 12, color: "#555", lineHeight: 1.6 }}>
              This is a general legal reference, not legal advice. Laws vary by jurisdiction and fact pattern. Verify with your local court rules or a licensed attorney before relying on any authority listed here.
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <div style={{ width: 52, height: 52, borderRadius: 26, background: "#1a1a2a", border: "2px solid #3b82f644", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", animation: "pulse 1.5s ease-in-out infinite" }}>
                <BookOpen size={22} color="#3b82f6" />
              </div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Building learning index…</div>
              <div style={{ color: "#555", fontSize: 13 }}>Finding relevant statutes, case law, and constitutional provisions</div>
              <style>{`@keyframes pulse { 0%,100%{opacity:0.6} 50%{opacity:1} }`}</style>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div style={{ background: "#1a0e0e", border: "1px solid #3a1a1a", borderRadius: 14, padding: "20px", marginBottom: 20, textAlign: "center" }}>
              <div style={{ color: "#f87171", fontSize: 14, marginBottom: 16, lineHeight: 1.6 }}>{error}</div>
              <button onClick={fetchLearning} style={{ background: ORANGE, border: "none", borderRadius: 10, padding: "12px 24px", color: "#000", fontWeight: 800, cursor: "pointer", fontSize: 14 }}>
                Try Again
              </button>
            </div>
          )}

          {/* Authorities list */}
          {authorities.length > 0 && !loading && (
            <div>
              {/* Group by type */}
              {(["constitution", "statute", "case"] as Array<LearningAuthority["type"]>).map(type => {
                const group = authorities.filter(a => a.type === type);
                if (!group.length) return null;
                return (
                  <div key={type} style={{ marginBottom: 24 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      {typeIcon(type)}
                      <span style={{ fontSize: 12, fontWeight: 700, color: typeColor(type), letterSpacing: 0.5, textTransform: "uppercase" }}>{typeLabel(type)}</span>
                      <span style={{ fontSize: 12, color: "#333" }}>({group.length})</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {group.map((auth, i) => {
                        const key = authorities.indexOf(auth);
                        const isExpanded = expandedId === key;
                        return (
                          <div key={i}>
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : key)}
                              style={{ width: "100%", background: PANEL, border: `1px solid ${isExpanded ? typeColor(type) + "44" : LINE}`, borderRadius: isExpanded ? "12px 12px 0 0" : 12, padding: "14px 16px", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}
                            >
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 800, fontSize: 14, color: PAPER, marginBottom: 2 }}>{auth.citation}</div>
                                <div style={{ fontSize: 12, color: "#555", lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: isExpanded ? "normal" : "nowrap" }}>
                                  {auth.plainEnglish.slice(0, 80)}{auth.plainEnglish.length > 80 && !isExpanded ? "…" : ""}
                                </div>
                              </div>
                              <span style={{ fontSize: 14, color: "#444", flexShrink: 0 }}>{isExpanded ? "▲" : "▼"}</span>
                            </button>
                            {isExpanded && (
                              <div style={{ background: "#0f0d0c", border: `1px solid ${LINE}`, borderTop: "none", borderRadius: "0 0 12px 12px", padding: "14px 16px" }}>
                                <div style={{ fontSize: 11, color: typeColor(type), fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>Plain English</div>
                                <div style={{ fontSize: 13, color: "#888", lineHeight: 1.7, marginBottom: 14 }}>{auth.plainEnglish}</div>
                                {auth.relevance && (
                                  <>
                                    <div style={{ fontSize: 11, color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>Relevance to Your Case</div>
                                    <div style={{ fontSize: 13, color: "#666", lineHeight: 1.7 }}>{auth.relevance}</div>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Regenerate */}
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <button onClick={fetchLearning} style={{ background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <RefreshCw size={12} /> Regenerate learning index
                </button>
              </div>
            </div>
          )}

          {/* No content, no loading */}
          {!authorities.length && !loading && !error && !hasAssembly && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#555" }}>
              <div style={{ fontSize: 14, marginBottom: 12 }}>Complete the AI Assembly step first to generate a learning index.</div>
              <button onClick={onBack} style={{ background: "none", border: `1px solid ${LINE}`, borderRadius: 10, padding: "12px 20px", color: "#666", cursor: "pointer" }}>
                Back to Assembly
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sticky bottom */}
      <div style={{ background: BG, borderTop: `1px solid ${LINE}`, padding: "16px 20px", paddingBottom: "calc(16px + env(safe-area-inset-bottom))", flexShrink: 0 }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <button
            onClick={onNext}
            style={{ width: "100%", background: `linear-gradient(90deg, ${ORANGE}, #ff8c00)`, border: "none", borderRadius: 14, padding: "17px", color: "#000", fontSize: 16, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            Continue to Case <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

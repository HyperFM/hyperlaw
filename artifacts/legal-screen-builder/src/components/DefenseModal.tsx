import React, { useEffect, useState } from "react";
import { X, Loader2, Upload, AlertTriangle, Trash2 } from "lucide-react";
import { aiApi, type ServerGeneratedDoc, type DocumentType, type DefenseAnalysis } from "../lib/aiApi";
import { COMPLIANCE } from "../lib/compliance";

const ORANGE = "#d9711f";

/**
 * DefenseModal — upload the opposing party's filing (documents and/or photos),
 * extract their identity + substance (1 credit), then draft a responsive motion.
 * Three steps: upload → review → draft.
 */
export default function DefenseModal(props: {
  open: boolean;
  caseId?: string;
  caseTitle: string;
  jurisdiction?: string;
  creditBalance?: number;
  onBuyCredits?: () => void;
  onClose: () => void;
  onDrafted: (doc: ServerGeneratedDoc) => void;
}): React.JSX.Element | null {
  const {
    open, caseId, caseTitle, jurisdiction,
    onBuyCredits, onClose, onDrafted,
  } = props;

  const RESPONSE_TYPES: Array<{ value: DocumentType; label: string }> = [
    { value: "opposition", label: "Opposition" },
    { value: "answer", label: "Answer" },
    { value: "motion_dismiss", label: "Motion to Dismiss" },
    { value: "defense_response", label: "Responsive Motion" },
  ];

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [files, setFiles] = useState<File[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [analysis, setAnalysis] = useState<DefenseAnalysis | null>(null);
  const [responseType, setResponseType] = useState<DocumentType>("opposition");
  const [error, setError] = useState<string | null>(null);
  const [outOfCredits, setOutOfCredits] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setFiles([]);
    setAnalyzing(false);
    setGenerating(false);
    setAnalysis(null);
    setResponseType("opposition");
    setError(null);
    setOutOfCredits(false);
  }, [open]);

  if (!open) return null;

  const overlayStyle: React.CSSProperties = {
    position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.9)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "24px 20px", fontFamily: "Arial, sans-serif",
  };
  const cardStyle: React.CSSProperties = {
    background: "#111", border: "1px solid #2a2a2a", borderRadius: 20,
    maxWidth: 440, width: "100%", padding: "28px 24px",
    maxHeight: "90vh", overflowY: "auto",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5,
    textTransform: "uppercase", display: "block", marginBottom: 8,
  };
  const bodyStyle: React.CSSProperties = {
    fontSize: 13, color: "#888", lineHeight: 1.6,
  };
  const primaryBtn: React.CSSProperties = {
    background: `linear-gradient(90deg, ${ORANGE}, #FF7A1A)`,
    border: "none", borderRadius: 12, color: "#0a0908",
    fontWeight: 800, fontSize: 14, padding: "14px", cursor: "pointer",
    width: "100%", fontFamily: "Arial, sans-serif",
  };
  const secondaryBtn: React.CSSProperties = {
    background: "none", border: "1px solid #2a2a2a", borderRadius: 12,
    color: "#888", fontWeight: 600, padding: "12px", cursor: "pointer",
    fontFamily: "Arial, sans-serif",
  };

  function chip(active: boolean): React.CSSProperties {
    return {
      background: active ? `linear-gradient(90deg, ${ORANGE}, #FF7A1A)` : "#0d0d0d",
      border: active ? "none" : "1px solid #2a2a2a",
      borderRadius: 999,
      color: active ? "#0a0908" : "#888",
      fontWeight: 700,
      fontSize: 13,
      padding: "8px 16px",
      cursor: "pointer",
    };
  }

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files ? Array.from(e.target.files) : [];
    if (selected.length) setFiles(prev => [...prev, ...selected]);
    // Allow re-selecting the same file later.
    e.target.value = "";
  }

  function removeFile(index: number) {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }

  function handleError(err: unknown) {
    if ((err as { creditBalance?: number }).creditBalance !== undefined) {
      setOutOfCredits(true);
      setError("Not enough credits");
    } else {
      setError((err as Error).message || "Something went wrong");
    }
  }

  async function handleAnalyze() {
    if (!files.length) return;
    setError(null);
    setOutOfCredits(false);
    setAnalyzing(true);
    try {
      const form = new FormData();
      for (const file of files) form.append("files", file);
      form.append("caseTitle", caseTitle);
      const result = await aiApi.defenseAnalyze(form);
      setAnalysis(result);
      const suggested = result.suggestedResponse?.documentType;
      const match = RESPONSE_TYPES.find(t => t.value === suggested);
      setResponseType(match ? match.value : "opposition");
      setStep(2);
    } catch (err: unknown) {
      handleError(err);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleDraft() {
    if (!analysis) return;
    setError(null);
    setOutOfCredits(false);
    setGenerating(true);
    try {
      const label = RESPONSE_TYPES.find(t => t.value === responseType)?.label || "Responsive Motion";
      const {
        filingType, substanceSummary, keyArguments, factsDisputed, deadlinesMentioned,
      } = analysis;
      const doc = await aiApi.generateDocument({
        caseId,
        documentType: responseType,
        title: label + " — " + caseTitle,
        draftContext:
          "Responding to opposing party's " + filingType +
          ". Their substance: " + substanceSummary +
          ". Their key arguments: " + keyArguments.join("; ") +
          ". Facts they dispute: " + factsDisputed.join("; ") +
          ". Deadlines mentioned: " + deadlinesMentioned.join("; "),
        sourceDocument: {
          title: filingType || "Opposing filing",
          content: substanceSummary + "\n\nKey arguments:\n- " + keyArguments.join("\n- "),
        },
        caseData: {
          title: caseTitle,
          notes: "",
          jurisdiction: jurisdiction || "",
          incidents: [],
        },
      });
      onDrafted(doc);
      onClose();
    } catch (err: unknown) {
      handleError(err);
    } finally {
      setGenerating(false);
    }
  }

  const errorBlock = error && (
    <div style={{ marginTop: 14 }}>
      <div style={{ color: "#ef4444", fontSize: 13, lineHeight: 1.6, display: "flex", alignItems: "center", gap: 6 }}>
        <AlertTriangle size={15} />
        <span>{error}</span>
      </div>
      {outOfCredits && (
        <button
          type="button"
          onClick={() => onBuyCredits?.()}
          style={{ ...primaryBtn, marginTop: 12 }}
        >
          Buy credits
        </button>
      )}
    </div>
  );

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: "#fff", margin: 0, paddingRight: 12 }}>
            Respond to the Other Side
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: "none", border: "none", color: "#888", cursor: "pointer", padding: 2, lineHeight: 0 }}
          >
            <X size={20} />
          </button>
        </div>

        {/* STEP 1 — upload */}
        {step === 1 && (
          <div>
            <label style={labelStyle}>Upload the other side's filing</label>
            <p style={{ ...bodyStyle, marginTop: 0, marginBottom: 14 }}>
              Add the documents or photos of the filing you received. We'll read them and pull out
              who filed, what they're arguing, and any deadlines.
            </p>

            <label
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                background: "#0d0d0d", border: "1px dashed #2a2a2a", borderRadius: 12,
                color: "#888", fontSize: 14, fontWeight: 600, padding: "18px 14px",
                cursor: "pointer", boxSizing: "border-box",
              }}
            >
              <Upload size={16} />
              <span>Choose files</span>
              <input
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.txt"
                onChange={handleFilesSelected}
                style={{ display: "none" }}
              />
            </label>

            {files.length > 0 && (
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                {files.map((f, i) => (
                  <div
                    key={`${f.name}-${i}`}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                      background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: 12,
                      padding: "10px 12px",
                    }}
                  >
                    <span style={{ color: "#ccc", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      aria-label={`Remove ${f.name}`}
                      style={{ background: "none", border: "none", color: "#888", cursor: "pointer", padding: 2, lineHeight: 0, flexShrink: 0 }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={handleAnalyze}
              disabled={!files.length || analyzing}
              style={{ ...primaryBtn, marginTop: 18, opacity: !files.length || analyzing ? 0.6 : 1 }}
            >
              {analyzing ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                  Analyzing…
                </span>
              ) : "Analyze filing (1 credit)"}
            </button>

            <p style={{ ...bodyStyle, marginTop: 14, color: "#444", fontSize: 12 }}>
              {COMPLIANCE.REVIEW_ALL_CONTENT}
            </p>

            {errorBlock}
          </div>
        )}

        {/* STEP 2 — review */}
        {step === 2 && analysis && (
          <div>
            <label style={labelStyle}>Review what we found</label>

            <div style={{ background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 12, padding: "14px 16px", marginTop: 4, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }}>
                Opposing party
              </div>
              <div style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>
                {analysis.defendantName || "Not identified"}
              </div>
              {analysis.defendantEmail && (
                <div style={{ ...bodyStyle, marginTop: 4 }}>{analysis.defendantEmail}</div>
              )}
              {analysis.defendantAddress && (
                <div style={{ ...bodyStyle, marginTop: 4 }}>{analysis.defendantAddress}</div>
              )}
              {analysis.filingType && (
                <div style={{ ...bodyStyle, marginTop: 8, color: "#ccc" }}>
                  <span style={{ color: "#666" }}>Filing type: </span>{analysis.filingType}
                </div>
              )}
            </div>

            {analysis.substanceSummary && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Summary</label>
                <p style={{ ...bodyStyle, color: "#ccc", margin: 0 }}>{analysis.substanceSummary}</p>
              </div>
            )}

            {analysis.keyArguments.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Key arguments</label>
                <ul style={{ margin: 0, paddingLeft: 18, ...bodyStyle }}>
                  {analysis.keyArguments.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            )}

            {analysis.factsDisputed.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Facts they dispute</label>
                <ul style={{ margin: 0, paddingLeft: 18, ...bodyStyle }}>
                  {analysis.factsDisputed.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </div>
            )}

            {analysis.deadlinesMentioned.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Deadlines mentioned</label>
                <ul style={{ margin: 0, paddingLeft: 18, color: ORANGE, fontSize: 13, lineHeight: 1.6 }}>
                  {analysis.deadlinesMentioned.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>How do you want to respond?</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {RESPONSE_TYPES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setResponseType(t.value)}
                    style={chip(responseType === t.value)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {analysis.suggestedResponse?.rationale && (
                <p style={{ ...bodyStyle, marginTop: 10, marginBottom: 0 }}>
                  {analysis.suggestedResponse.rationale}
                </p>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button type="button" onClick={() => setStep(1)} style={{ ...secondaryBtn, flex: "0 0 auto" }}>
                Back
              </button>
              <button type="button" onClick={() => setStep(3)} style={{ ...primaryBtn, flex: 1 }}>
                Continue
              </button>
            </div>

            {errorBlock}
          </div>
        )}

        {/* STEP 3 — draft */}
        {step === 3 && analysis && (
          <div>
            <label style={labelStyle}>Draft response</label>
            <p style={{ ...bodyStyle, marginTop: 0, marginBottom: 14, color: "#ccc" }}>
              We'll draft a{" "}
              <strong style={{ color: "#fff" }}>
                {RESPONSE_TYPES.find(t => t.value === responseType)?.label}
              </strong>{" "}
              responding to the opposing party's {analysis.filingType || "filing"}.
            </p>

            <p style={{ ...bodyStyle, marginBottom: 14, color: "#444", fontSize: 12 }}>
              {COMPLIANCE.REVIEW_BEFORE_FILING}
            </p>

            <button
              type="button"
              onClick={handleDraft}
              disabled={generating}
              style={{ ...primaryBtn, opacity: generating ? 0.6 : 1 }}
            >
              {generating ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                  Drafting…
                </span>
              ) : "Draft my response"}
            </button>

            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={generating}
                style={{ ...secondaryBtn, width: "100%", opacity: generating ? 0.6 : 1 }}
              >
                Back
              </button>
            </div>

            {errorBlock}
          </div>
        )}

        <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
      </div>
    </div>
  );
}

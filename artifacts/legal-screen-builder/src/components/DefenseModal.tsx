import React, { useEffect, useState } from "react";
import { X, Loader2, Upload, AlertTriangle, Trash2, FileText } from "lucide-react";
import {
  aiApi,
  type ServerGeneratedDoc,
  type DocumentType,
  type DefenseAnalysis,
  type CaseExtraction,
  type EstimateResult,
} from "../lib/aiApi";
import { COMPLIANCE } from "../lib/compliance";

const ORANGE = "#d9711f";

type CaseDoc = {
  id: string;
  fileName: string;
  mimeType: string;
  caseExtraction: CaseExtraction | null;
  createdAt: string;
};

/** Normalized brief the review + draft steps read from, whatever the source was. */
interface FilingBrief {
  source: "existing" | "upload";
  heading: string;
  opposingParty: string | null;
  filingType: string;
  summary: string;
  keyArguments: string[];
  factsDisputed: string[];
  deadlines: string[];
  suggestedType?: DocumentType;
  suggestionRationale?: string;
  sourceTitle: string;
  sourceContent: string;
}

/**
 * DefenseModal — respond to the other side.
 *
 * Two sources: (1) reuse a document already in the case — free, using the
 * extraction we already pulled from it — or (2) upload the filing (1 credit to
 * analyze). Both normalize into a single brief; we then show a credit estimate
 * (the enforced spend cap) and draft the response with usage-based billing.
 * Steps: source → review → draft.
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

  // Source selection
  const [sourceMode, setSourceMode] = useState<"existing" | "upload">("existing");
  const [caseDocs, setCaseDocs] = useState<CaseDoc[] | null>(null);
  const [docsLoading, setDocsLoading] = useState(false);

  // Upload path
  const [files, setFiles] = useState<File[]>([]);
  const [analyzing, setAnalyzing] = useState(false);

  // Normalized brief (from either source)
  const [brief, setBrief] = useState<FilingBrief | null>(null);

  // Draft
  const [responseType, setResponseType] = useState<DocumentType>("opposition");
  const [generating, setGenerating] = useState(false);

  // Credit estimate (shown before the billable draft; server enforces it as the cap)
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [outOfCredits, setOutOfCredits] = useState(false);

  // Reset whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setSourceMode("existing");
    setCaseDocs(null);
    setDocsLoading(false);
    setFiles([]);
    setAnalyzing(false);
    setBrief(null);
    setResponseType("opposition");
    setGenerating(false);
    setEstimate(null);
    setEstimateLoading(false);
    setError(null);
    setOutOfCredits(false);
  }, [open]);

  // Load the case's already-analyzed documents so they can be reused for free.
  useEffect(() => {
    if (!open || !caseId) { setSourceMode("upload"); return; }
    let cancelled = false;
    setDocsLoading(true);
    aiApi.documents(caseId)
      .then(docs => {
        if (cancelled) return;
        const withExtraction = docs.filter(d => d.caseExtraction);
        setCaseDocs(withExtraction);
        setSourceMode(withExtraction.length ? "existing" : "upload");
      })
      .catch(() => { if (!cancelled) { setCaseDocs([]); setSourceMode("upload"); } })
      .finally(() => { if (!cancelled) setDocsLoading(false); });
    return () => { cancelled = true; };
  }, [open, caseId]);

  // Fetch the credit estimate on the draft step and whenever the response type changes.
  useEffect(() => {
    if (!open || step !== 3) return;
    let cancelled = false;
    setEstimateLoading(true);
    setEstimate(null);
    aiApi.estimate({ kind: "document", documentType: responseType })
      .then(res => { if (!cancelled) setEstimate(res); })
      .catch(() => { if (!cancelled) setEstimate(null); })
      .finally(() => { if (!cancelled) setEstimateLoading(false); });
    return () => { cancelled = true; };
  }, [open, step, responseType]);

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

  // ── Normalize each source into a single brief ────────────────────────────────

  function briefFromExtraction(d: CaseDoc): FilingBrief {
    const ex = d.caseExtraction as CaseExtraction;
    const partyBits = [
      ex.plaintiff ? `Plaintiff: ${ex.plaintiff}` : "",
      ex.defendant ? `Defendant: ${ex.defendant}` : "",
    ].filter(Boolean).join(" · ");

    const contentParts: string[] = [];
    if (ex.summary) contentParts.push(ex.summary);
    if (ex.claims.length) contentParts.push("Claims:\n- " + ex.claims.join("\n- "));
    if (ex.deadlines.length) contentParts.push("Deadlines:\n- " + ex.deadlines.join("\n- "));
    if (ex.importantNames.length) contentParts.push("Names: " + ex.importantNames.join(", "));

    return {
      source: "existing",
      heading: d.fileName || "Case document",
      opposingParty: partyBits || null,
      filingType: "a filing already in your case",
      summary: ex.summary || "",
      keyArguments: ex.claims,
      factsDisputed: [],
      deadlines: ex.deadlines,
      sourceTitle: d.fileName || "Case document",
      sourceContent: contentParts.join("\n\n") || ex.summary || (d.fileName || "Case document"),
    };
  }

  function briefFromAnalysis(a: DefenseAnalysis): FilingBrief {
    const suggested = RESPONSE_TYPES.find(t => t.value === a.suggestedResponse?.documentType)?.value;
    const contentParts: string[] = [];
    if (a.substanceSummary) contentParts.push(a.substanceSummary);
    if (a.keyArguments.length) contentParts.push("Key arguments:\n- " + a.keyArguments.join("\n- "));

    return {
      source: "upload",
      heading: a.defendantName || "Opposing party",
      opposingParty: a.defendantName,
      filingType: a.filingType || "filing",
      summary: a.substanceSummary,
      keyArguments: a.keyArguments,
      factsDisputed: a.factsDisputed,
      deadlines: a.deadlinesMentioned,
      suggestedType: suggested,
      suggestionRationale: a.suggestedResponse?.rationale,
      sourceTitle: a.filingType || "Opposing filing",
      sourceContent: contentParts.join("\n\n") || a.substanceSummary || "Opposing filing",
    };
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  function chooseExisting(d: CaseDoc) {
    const b = briefFromExtraction(d);
    setBrief(b);
    setResponseType("opposition");
    setError(null);
    setOutOfCredits(false);
    setStep(2);
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
      const b = briefFromAnalysis(result);
      setBrief(b);
      setResponseType(b.suggestedType || "opposition");
      setStep(2);
    } catch (err: unknown) {
      handleError(err);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleDraft() {
    if (!brief) return;
    setError(null);
    setOutOfCredits(false);
    setGenerating(true);
    try {
      const label = RESPONSE_TYPES.find(t => t.value === responseType)?.label || "Responsive Motion";
      const contextParts: string[] = [
        `Responding to ${brief.opposingParty ? brief.opposingParty + " — " : ""}${brief.filingType}.`,
      ];
      if (brief.summary) contextParts.push(`Their substance: ${brief.summary}`);
      if (brief.keyArguments.length) contextParts.push(`Their key arguments: ${brief.keyArguments.join("; ")}`);
      if (brief.factsDisputed.length) contextParts.push(`Facts they dispute: ${brief.factsDisputed.join("; ")}`);
      if (brief.deadlines.length) contextParts.push(`Deadlines mentioned: ${brief.deadlines.join("; ")}`);

      const doc = await aiApi.generateDocument({
        caseId,
        documentType: responseType,
        title: label + " — " + caseTitle,
        draftContext: contextParts.join(" "),
        sourceDocument: { title: brief.sourceTitle, content: brief.sourceContent },
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

  const canReuse = !!caseId && (docsLoading || (caseDocs?.length ?? 0) > 0);
  const estimateInsufficient = !!estimate && !estimate.waived && !estimate.sufficient;

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

        {/* STEP 1 — choose the source */}
        {step === 1 && (
          <div>
            <label style={labelStyle}>What are you responding to?</label>
            <p style={{ ...bodyStyle, marginTop: 0, marginBottom: 14 }}>
              Respond using a document already in your case, or upload the filing you just received.
            </p>

            {/* Mode toggle — only when there are reusable case documents */}
            {canReuse && (
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <button type="button" onClick={() => setSourceMode("existing")} style={chip(sourceMode === "existing")}>
                  From your case
                </button>
                <button type="button" onClick={() => setSourceMode("upload")} style={chip(sourceMode === "upload")}>
                  Upload filing
                </button>
              </div>
            )}

            {/* Existing-document source */}
            {sourceMode === "existing" && (
              <div>
                {docsLoading ? (
                  <div style={{ ...bodyStyle, display: "flex", alignItems: "center", gap: 8, padding: "18px 0" }}>
                    <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                    Loading your case documents…
                  </div>
                ) : (caseDocs && caseDocs.length > 0) ? (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {caseDocs.map(d => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => chooseExisting(d)}
                          style={{
                            display: "flex", alignItems: "flex-start", gap: 10, textAlign: "left",
                            background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: 12,
                            padding: "12px 14px", cursor: "pointer", width: "100%",
                          }}
                        >
                          <FileText size={18} color={ORANGE} style={{ flexShrink: 0, marginTop: 2 }} />
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: "block", color: "#eee", fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {d.fileName || "Case document"}
                            </span>
                            {d.caseExtraction?.summary && (
                              <span style={{ display: "block", color: "#888", fontSize: 12, lineHeight: 1.5, marginTop: 3, maxHeight: 54, overflow: "hidden" }}>
                                {d.caseExtraction.summary}
                              </span>
                            )}
                          </span>
                        </button>
                      ))}
                    </div>
                    <p style={{ ...bodyStyle, marginTop: 12, color: "#4a7", fontSize: 12 }}>
                      Free — we reuse what we already pulled from this document.
                    </p>
                  </>
                ) : (
                  <p style={{ ...bodyStyle, padding: "14px 0" }}>
                    No analyzed documents in this case yet. Upload the filing instead.
                  </p>
                )}
              </div>
            )}

            {/* Upload source */}
            {sourceMode === "upload" && (
              <div>
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
              </div>
            )}

            <p style={{ ...bodyStyle, marginTop: 14, color: "#444", fontSize: 12 }}>
              {COMPLIANCE.REVIEW_ALL_CONTENT}
            </p>

            {errorBlock}
          </div>
        )}

        {/* STEP 2 — review */}
        {step === 2 && brief && (
          <div>
            <label style={labelStyle}>Review what we found</label>

            <div style={{ background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 12, padding: "14px 16px", marginTop: 4, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }}>
                {brief.source === "existing" ? "Case document" : "Opposing party"}
              </div>
              <div style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>
                {brief.heading}
              </div>
              {brief.opposingParty && brief.source === "existing" && (
                <div style={{ ...bodyStyle, marginTop: 4 }}>{brief.opposingParty}</div>
              )}
              {brief.filingType && (
                <div style={{ ...bodyStyle, marginTop: 8, color: "#ccc" }}>
                  <span style={{ color: "#666" }}>Filing type: </span>{brief.filingType}
                </div>
              )}
            </div>

            {brief.summary && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Summary</label>
                <p style={{ ...bodyStyle, color: "#ccc", margin: 0 }}>{brief.summary}</p>
              </div>
            )}

            {brief.keyArguments.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>{brief.source === "existing" ? "Claims" : "Key arguments"}</label>
                <ul style={{ margin: 0, paddingLeft: 18, ...bodyStyle }}>
                  {brief.keyArguments.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            )}

            {brief.factsDisputed.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Facts they dispute</label>
                <ul style={{ margin: 0, paddingLeft: 18, ...bodyStyle }}>
                  {brief.factsDisputed.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </div>
            )}

            {brief.deadlines.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Deadlines mentioned</label>
                <ul style={{ margin: 0, paddingLeft: 18, color: ORANGE, fontSize: 13, lineHeight: 1.6 }}>
                  {brief.deadlines.map((d, i) => <li key={i}>{d}</li>)}
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
              {brief.suggestionRationale && (
                <p style={{ ...bodyStyle, marginTop: 10, marginBottom: 0 }}>
                  {brief.suggestionRationale}
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

        {/* STEP 3 — estimate + draft */}
        {step === 3 && brief && (
          <div>
            <label style={labelStyle}>Draft response</label>
            <p style={{ ...bodyStyle, marginTop: 0, marginBottom: 14, color: "#ccc" }}>
              We'll draft a{" "}
              <strong style={{ color: "#fff" }}>
                {RESPONSE_TYPES.find(t => t.value === responseType)?.label}
              </strong>{" "}
              responding to {brief.filingType || "the filing"}.
            </p>

            {/* Credit estimate / spend cap */}
            <div style={{ background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
              {estimateLoading ? (
                <div style={{ ...bodyStyle, display: "flex", alignItems: "center", gap: 8 }}>
                  <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
                  Estimating cost…
                </div>
              ) : estimate ? (
                <>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>
                      Estimated cost
                    </span>
                    <span style={{ color: "#fff", fontSize: 15, fontWeight: 800 }}>
                      {estimate.waived ? "Free with your plan" : `~${estimate.estimatedCredits} credit${estimate.estimatedCredits !== 1 ? "s" : ""}`}
                    </span>
                  </div>
                  {estimate.note && (
                    <p style={{ ...bodyStyle, margin: "8px 0 0" }}>{estimate.note}</p>
                  )}
                  {!estimate.waived && (
                    <p style={{ ...bodyStyle, margin: "8px 0 0", color: "#4a7", fontSize: 12 }}>
                      You won't be charged more than this. You have {estimate.creditBalance} credit{estimate.creditBalance !== 1 ? "s" : ""}.
                    </p>
                  )}
                </>
              ) : (
                <div style={{ ...bodyStyle }}>
                  We'll confirm the exact cost when you draft — you're only charged for what's generated.
                </div>
              )}
            </div>

            <p style={{ ...bodyStyle, marginBottom: 14, color: "#444", fontSize: 12 }}>
              {COMPLIANCE.REVIEW_BEFORE_FILING}
            </p>

            {estimateInsufficient ? (
              <button type="button" onClick={() => onBuyCredits?.()} style={primaryBtn}>
                Buy credits to continue
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDraft}
                disabled={generating || estimateLoading}
                style={{ ...primaryBtn, opacity: generating || estimateLoading ? 0.6 : 1 }}
              >
                {generating ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                    <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                    Drafting…
                  </span>
                ) : "Draft my response"}
              </button>
            )}

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

import React, { useState, useEffect } from "react";
import { X, Loader2, Search, ExternalLink } from "lucide-react";
import { aiApi, type ServerGeneratedDoc, type IfpFindResult, type IfpTemplate } from "../lib/aiApi";
import SignaturePad from "./SignaturePad";

const ORANGE = "#d9711f";

type Field = { key: string; label: string };

const ALWAYS_FIELDS: Field[] = [
  { key: "fullName", label: "Your full legal name" },
  { key: "address", label: "Your mailing address" },
  { key: "monthlyIncome", label: "Total monthly income ($)" },
  { key: "dependents", label: "Number of dependents" },
  { key: "monthlyExpenses", label: "Total monthly expenses ($)" },
  { key: "reason", label: "Why you cannot afford the filing fee" },
];

export default function IfpWizard(props: {
  open: boolean;
  caseId?: string;
  jurisdiction: string;
  caseData?: { court?: string; caseNumber?: string; plaintiff?: string; state?: string; county?: string };
  creditBalance?: number;
  onBuyCredits?: () => void;
  onClose: () => void;
  onGenerated: (doc: ServerGeneratedDoc) => void;
}): React.JSX.Element | null {
  const { open, caseId, jurisdiction, caseData, onBuyCredits, onClose, onGenerated } = props;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [result, setResult] = useState<IfpFindResult | null>(null);
  const [template, setTemplate] = useState<IfpTemplate | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [signature, setSignature] = useState<string | null>(null);

  const [searching, setSearching] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needCredits, setNeedCredits] = useState(false);

  // Reset all wizard state whenever it (re)opens so stale answers/results never leak into a new draft.
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setResult(null);
    setTemplate(null);
    setAnswers({});
    setSignature(null);
    setError(null);
    setNeedCredits(false);
    setSearching(false);
    setGenerating(false);
  }, [open]);

  if (!open) return null;

  const handleError = (err: unknown) => {
    const withBalance = err as { creditBalance?: number };
    if (withBalance.creditBalance !== undefined) {
      setNeedCredits(true);
      setError("Not enough credits");
    } else {
      setNeedCredits(false);
      setError((err as Error).message);
    }
  };

  const runSearch = async () => {
    setSearching(true);
    setError(null);
    setNeedCredits(false);
    try {
      const found = await aiApi.ifpFindForm({ jurisdiction, caseData, caseId });
      setResult(found);
      const matched = await aiApi.ifp.match(jurisdiction);
      setTemplate(matched.template);
      setStep(2);
    } catch (err) {
      handleError(err);
    } finally {
      setSearching(false);
    }
  };

  // Build the list of fields for step 2 (dedupe by key, ALWAYS fields appended).
  const fieldList: Field[] = (() => {
    const base: Field[] =
      result?.found && result.fields?.length
        ? result.fields.map((f) => ({ key: f.key, label: f.label }))
        : (template?.fields ?? []).map((f) => ({ key: f.key, label: f.label }));
    const seen = new Set<string>();
    const out: Field[] = [];
    for (const f of [...base, ...ALWAYS_FIELDS]) {
      if (seen.has(f.key)) continue;
      seen.add(f.key);
      out.push(f);
    }
    return out;
  })();

  const fullNameFilled = (answers.fullName ?? "").trim().length > 0;

  const generate = async () => {
    setGenerating(true);
    setError(null);
    setNeedCredits(false);
    try {
      const formName = result?.found && result.formName ? result.formName : "generic Appendix A template";
      const sourceLine = result?.found && result.sourceUrl ? `Source URL: ${result.sourceUrl}` : "";
      const answerLines = fieldList
        .map((f) => `${f.label}: ${(answers[f.key] ?? "").trim()}`)
        .join("\n");
      const draftContext = [
        `Form: ${formName}`,
        sourceLine,
        answerLines,
        "Do NOT include a judge's order/ruling section and do NOT include a notary block. The applicant has captured a signature separately.",
      ]
        .filter(Boolean)
        .join("\n");

      const doc = await aiApi.generateDocument({
        caseId,
        documentType: "fee_waiver",
        title: "Fee Waiver Application",
        draftContext,
        sourceDocument: template?.body
          ? { title: template.title || template.formName || "Fee waiver form template", content: template.body }
          : undefined,
        caseData: { title: "Fee Waiver Application", notes: "", jurisdiction, incidents: [] },
      });
      onGenerated(doc);
      onClose();
    } catch (err) {
      handleError(err);
    } finally {
      setGenerating(false);
    }
  };

  // ── Styles ────────────────────────────────────────────────────────────────
  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: "#444",
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  };
  const inputStyle: React.CSSProperties = {
    background: "#0d0d0d",
    border: "1px solid #2a2a2a",
    borderRadius: 12,
    color: "#fff",
    padding: "12px 14px",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    width: "100%",
  };
  const primaryBtn: React.CSSProperties = {
    background: `linear-gradient(90deg, ${ORANGE}, #FF7A1A)`,
    border: "none",
    borderRadius: 12,
    color: "#0a0908",
    fontWeight: 800,
    fontSize: 14,
    padding: "14px",
    cursor: "pointer",
    width: "100%",
  };
  const secondaryBtn: React.CSSProperties = {
    background: "none",
    border: "1px solid #2a2a2a",
    borderRadius: 12,
    color: "#888",
    fontWeight: 600,
    padding: "12px",
    cursor: "pointer",
  };

  const errorBlock =
    error != null ? (
      <div style={{ marginTop: 12 }}>
        <p style={{ color: "#ef4444", fontSize: 13, lineHeight: 1.6, margin: 0 }}>{error}</p>
        {needCredits && (
          <button
            type="button"
            style={{ ...primaryBtn, marginTop: 10 }}
            onClick={() => onBuyCredits?.()}
          >
            Buy credits
          </button>
        )}
      </div>
    ) : null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.9)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 20px",
        fontFamily: "Arial, sans-serif",
        zIndex: 300,
      }}
    >
      <div
        style={{
          background: "#111",
          border: "1px solid #2a2a2a",
          borderRadius: 20,
          maxWidth: 440,
          width: "100%",
          padding: "28px 24px",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, color: "#fff", fontSize: 18, fontWeight: 800 }}>Fee Waiver Application</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: "none", border: "none", color: "#888", cursor: "pointer", padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>

        <p style={{ ...labelStyle, marginTop: 14, marginBottom: 4 }}>Step {step} of 3</p>

        {/* ── STEP 1 ───────────────────────────────────────────────────────── */}
        {step === 1 && (
          <div>
            <h3 style={{ color: "#fff", fontSize: 15, fontWeight: 700, margin: "8px 0 6px" }}>Find your form</h3>
            <p style={{ color: "#888", fontSize: 13, lineHeight: 1.6, margin: "0 0 16px" }}>
              We'll search for the official fee-waiver form for your court. This uses 1 credit.
            </p>
            <button type="button" style={primaryBtn} onClick={runSearch} disabled={searching}>
              {searching ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                  <Loader2 size={16} className="spin" /> Searching…
                </span>
              ) : (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                  <Search size={16} /> Search for the official fee-waiver form (1 credit)
                </span>
              )}
            </button>
            {errorBlock}
          </div>
        )}

        {/* ── STEP 2 ───────────────────────────────────────────────────────── */}
        {step === 2 && (
          <div>
            <h3 style={{ color: "#fff", fontSize: 15, fontWeight: 700, margin: "8px 0 6px" }}>Fill it out</h3>
            <p style={{ ...labelStyle, marginBottom: 8 }}>Free</p>

            {result?.found ? (
              <div style={{ marginBottom: 16 }}>
                <p style={{ color: "#ccc", fontSize: 13, lineHeight: 1.6, margin: "0 0 6px", fontWeight: 700 }}>
                  {result.formName}
                </p>
                {result.sourceUrl && (
                  <a
                    href={result.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: ORANGE, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    View official form <ExternalLink size={13} />
                  </a>
                )}
                {result.summary && (
                  <p style={{ color: "#888", fontSize: 13, lineHeight: 1.6, margin: "8px 0 0" }}>{result.summary}</p>
                )}
              </div>
            ) : (
              <p style={{ color: "#888", fontSize: 13, lineHeight: 1.6, margin: "0 0 16px" }}>
                No official form located — we'll prepare a general fee-waiver application you can adapt.
              </p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {fieldList.map((f) => (
                <div key={f.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={labelStyle} htmlFor={`ifp-${f.key}`}>
                    {f.label}
                  </label>
                  <input
                    id={`ifp-${f.key}`}
                    type="text"
                    style={inputStyle}
                    value={answers[f.key] ?? ""}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>

            {!fullNameFilled && (
              <p style={{ color: "#888", fontSize: 12, lineHeight: 1.6, margin: "10px 0 0" }}>
                Your full legal name is required to continue.
              </p>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button type="button" style={{ ...secondaryBtn, flex: 1 }} onClick={() => setStep(1)}>
                Back
              </button>
              <button
                type="button"
                style={{ ...primaryBtn, flex: 2, opacity: fullNameFilled ? 1 : 0.6 }}
                disabled={!fullNameFilled}
                onClick={() => setStep(3)}
              >
                Continue
              </button>
            </div>
            {errorBlock}
          </div>
        )}

        {/* ── STEP 3 ───────────────────────────────────────────────────────── */}
        {step === 3 && (
          <div>
            <h3 style={{ color: "#fff", fontSize: 15, fontWeight: 700, margin: "8px 0 6px" }}>Sign &amp; generate</h3>
            <p style={{ ...labelStyle, marginBottom: 10 }}>Your signature</p>
            <SignaturePad value={signature} onChange={setSignature} />

            <p style={{ color: "#888", fontSize: 13, lineHeight: 1.6, margin: "16px 0 0" }}>
              By signing, you affirm the financial information you provided is true and complete to the best of your
              knowledge. Review the generated application carefully before filing it with any court.
            </p>

            <button
              type="button"
              style={{ ...primaryBtn, marginTop: 18, opacity: fullNameFilled && !generating ? 1 : 0.6 }}
              disabled={!fullNameFilled || generating}
              onClick={generate}
            >
              {generating ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                  <Loader2 size={16} className="spin" /> Generating…
                </span>
              ) : (
                "Generate fee-waiver application"
              )}
            </button>

            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button
                type="button"
                style={{ ...secondaryBtn, flex: 1 }}
                onClick={() => setStep(2)}
                disabled={generating}
              >
                Back
              </button>
            </div>
            {errorBlock}
          </div>
        )}
      </div>
    </div>
  );
}

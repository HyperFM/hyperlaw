import React, { useState, useEffect } from "react";
import { X, Loader2, Search, ExternalLink, Check } from "lucide-react";
import { aiApi, type ServerGeneratedDoc, type IfpFindResult, type IfpTemplate } from "../lib/aiApi";
import SignaturePad from "./SignaturePad";

const ORANGE = "#d9711f";

type Field = { key: string; label: string; wide?: boolean };
type Group = { title: string; note?: string; fields: Field[] };

// Full Appendix A financial-affidavit question set, grouped like the federal
// AO 240 "Application to Proceed In Forma Pauperis." Only "fullName" is required;
// everything else is optional so the applicant can move quickly and refine later.
const GROUPS: Group[] = [
  {
    title: "About you (the affiant)",
    fields: [
      { key: "fullName", label: "Your full legal name" },
      { key: "dob", label: "Date of birth" },
      { key: "phone", label: "Phone number" },
      { key: "address", label: "Mailing address", wide: true },
    ],
  },
  {
    title: "Employment",
    fields: [
      { key: "employmentStatus", label: "Are you employed? (employed / unemployed / self-employed)", wide: true },
      { key: "employerName", label: "Employer name" },
      { key: "employerAddress", label: "Employer address", wide: true },
      { key: "takeHomePay", label: "Monthly take-home pay ($)" },
      { key: "lastEmployed", label: "If not employed, date last employed" },
    ],
  },
  {
    title: "Household",
    fields: [
      { key: "maritalStatus", label: "Marital status" },
      { key: "spouseName", label: "Spouse's name (if any)" },
      { key: "spouseIncome", label: "Spouse's monthly income ($)" },
      { key: "dependents", label: "Number of dependents" },
      { key: "dependentsDetail", label: "Dependents — names, relationship, ages", wide: true },
    ],
  },
  {
    title: "Monthly income",
    note: "Enter 0 for anything that doesn't apply.",
    fields: [
      { key: "incWages", label: "Wages / salary ($)" },
      { key: "incSelfEmployment", label: "Business / self-employment ($)" },
      { key: "incRentInterest", label: "Rent, interest, or dividends ($)" },
      { key: "incPensions", label: "Pensions / annuities / Social Security ($)" },
      { key: "incDisability", label: "Disability / unemployment / workers' comp ($)" },
      { key: "incPublicAssistance", label: "Public assistance — SNAP, TANF, etc. ($)" },
      { key: "incOther", label: "Gifts / other income ($)" },
    ],
  },
  {
    title: "Monthly expenses",
    note: "Enter 0 for anything that doesn't apply.",
    fields: [
      { key: "expHousing", label: "Rent / mortgage ($)" },
      { key: "expUtilities", label: "Utilities — gas, electric, water, phone ($)" },
      { key: "expFood", label: "Food / groceries ($)" },
      { key: "expTransport", label: "Transportation / car payment ($)" },
      { key: "expInsurance", label: "Insurance ($)" },
      { key: "expMedical", label: "Medical / childcare ($)" },
      { key: "expOther", label: "Other regular expenses ($)" },
    ],
  },
  {
    title: "Cash & assets",
    fields: [
      { key: "cashOnHand", label: "Cash on hand ($)" },
      { key: "bankBalance", label: "Checking / savings balance ($)" },
      { key: "realEstate", label: "Real estate you own (value)", wide: true },
      { key: "vehicle", label: "Vehicle — make/year, value, amount owed", wide: true },
      { key: "otherProperty", label: "Other valuable property", wide: true },
    ],
  },
  {
    title: "Debts you owe",
    fields: [{ key: "debts", label: "Creditors and amounts owed", wide: true }],
  },
  {
    title: "Anything else",
    fields: [
      { key: "reason", label: "Why you cannot afford the filing fee", wide: true },
      { key: "additional", label: "Anything else the court should know", wide: true },
    ],
  },
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

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [result, setResult] = useState<IfpFindResult | null>(null);
  const [template, setTemplate] = useState<IfpTemplate | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [signature, setSignature] = useState<string | null>(null);
  const [genDoc, setGenDoc] = useState<ServerGeneratedDoc | null>(null);

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
    setGenDoc(null);
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

  // A successfully generated doc must always reach the parent — even if the user
  // dismisses via the header X on the done screen — or it's lost until a reload.
  const handleClose = () => {
    if (genDoc) onGenerated(genDoc);
    onClose();
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

  // Any form-specific fields the located form/template asks for that aren't already
  // covered by the standard Appendix A groups get their own extra section.
  const knownKeys = new Set(GROUPS.flatMap((g) => g.fields.map((f) => f.key)));
  const seenExtra = new Set<string>();
  const extraFields: Field[] = (
    result?.found && result.fields?.length ? result.fields : template?.fields ?? []
  )
    .map((f) => ({ key: f.key, label: f.label, wide: true }))
    .filter((f) => {
      // Drop keys already covered by the standard groups, and de-dupe any repeats
      // the form/template metadata itself returns (avoids React key collisions).
      if (knownKeys.has(f.key) || seenExtra.has(f.key)) return false;
      seenExtra.add(f.key);
      return true;
    });
  const allGroups: Group[] = extraFields.length
    ? [...GROUPS, { title: "Form-specific questions", fields: extraFields }]
    : GROUPS;

  // Caption pulled straight from the case — shown read-only so we don't re-ask.
  const captionRows = [
    caseData?.court && { label: "Court", value: caseData.court },
    caseData?.county && { label: "County", value: caseData.county },
    caseData?.state && { label: "State", value: caseData.state },
    caseData?.plaintiff && { label: "Plaintiff", value: caseData.plaintiff },
    caseData?.caseNumber && { label: "Case No.", value: caseData.caseNumber },
  ].filter(Boolean) as { label: string; value: string }[];

  const fullNameFilled = (answers.fullName ?? "").trim().length > 0;

  const generate = async () => {
    setGenerating(true);
    setError(null);
    setNeedCredits(false);
    try {
      const formName = result?.found && result.formName ? result.formName : "generic Appendix A template";
      const sourceLine = result?.found && result.sourceUrl ? `Source URL: ${result.sourceUrl}` : "";

      const sections: string[] = [];
      if (captionRows.length) {
        sections.push("CASE CAPTION\n" + captionRows.map((r) => `${r.label}: ${r.value}`).join("\n"));
      }
      for (const g of allGroups) {
        const lines = g.fields
          .map((f) => {
            const v = (answers[f.key] ?? "").trim();
            return v ? `${f.label}: ${v}` : "";
          })
          .filter(Boolean);
        if (lines.length) sections.push(g.title.toUpperCase() + "\n" + lines.join("\n"));
      }

      const draftContext = [
        `Form: ${formName}`,
        sourceLine,
        sections.join("\n\n"),
        "The applicant has reviewed the information and signed the application. Do NOT include a judge's order/ruling section and do NOT include a notary block.",
      ]
        .filter(Boolean)
        .join("\n\n");

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
      setGenDoc(doc);
      setStep(4);
    } catch (err) {
      handleError(err);
    } finally {
      setGenerating(false);
    }
  };

  // ── Styles ────────────────────────────────────────────────────────────────
  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: "#8a7566",
    fontWeight: 700,
    letterSpacing: 0.3,
  };
  const sectionTitle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 800,
    color: ORANGE,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    margin: "6px 0 2px",
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
    fontFamily: "Arial, sans-serif",
  };
  const disclaimerBox: React.CSSProperties = {
    background: `${ORANGE}0f`,
    border: `1px solid ${ORANGE}33`,
    borderRadius: 12,
    padding: "12px 14px",
    color: "#cbb8a8",
    fontSize: 12.5,
    lineHeight: 1.6,
    margin: "0 0 16px",
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
          <button type="button" style={{ ...primaryBtn, marginTop: 10 }} onClick={() => onBuyCredits?.()}>
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
            onClick={handleClose}
            aria-label="Close"
            style={{ background: "none", border: "none", color: "#888", cursor: "pointer", padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>

        {step <= 3 && (
          <p style={{ ...labelStyle, marginTop: 14, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Step {step} of 3
          </p>
        )}

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
            <p style={{ ...labelStyle, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Free</p>

            {/* Disclaimer BEFORE the questions */}
            <div style={disclaimerBox}>
              This is a sworn financial statement. Answer truthfully and completely — when you sign it, you are
              declaring under penalty of perjury that everything here is true. HyperLaw is not a law firm and can't give
              legal advice.
            </div>

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

            {/* Caption pre-filled from the case (read-only) */}
            {captionRows.length > 0 && (
              <div
                style={{
                  background: "#0d0d0d",
                  border: "1px solid #222",
                  borderRadius: 12,
                  padding: "12px 14px",
                  marginBottom: 16,
                }}
              >
                <p style={{ ...labelStyle, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Case caption — from your case
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {captionRows.map((r) => (
                    <div key={r.label} style={{ fontSize: 13, color: "#cbb8a8" }}>
                      <span style={{ color: "#777" }}>{r.label}: </span>
                      {r.value}
                    </div>
                  ))}
                </div>
                <p style={{ color: "#666", fontSize: 11, margin: "8px 0 0" }}>
                  Pulled in automatically — no need to re-enter.
                </p>
              </div>
            )}

            {/* Grouped questions */}
            {allGroups.map((g) => (
              <div key={g.title} style={{ marginBottom: 10 }}>
                <p style={sectionTitle}>{g.title}</p>
                {g.note && <p style={{ color: "#777", fontSize: 11.5, margin: "0 0 6px" }}>{g.note}</p>}
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
                  {g.fields.map((f) => (
                    <div key={f.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={labelStyle} htmlFor={`ifp-${f.key}`}>
                        {f.label}
                      </label>
                      {f.wide ? (
                        <textarea
                          id={`ifp-${f.key}`}
                          rows={2}
                          style={{ ...inputStyle, resize: "vertical", minHeight: 44 }}
                          value={answers[f.key] ?? ""}
                          onChange={(e) => setAnswers((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        />
                      ) : (
                        <input
                          id={`ifp-${f.key}`}
                          type="text"
                          style={inputStyle}
                          value={answers[f.key] ?? ""}
                          onChange={(e) => setAnswers((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

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
            <p style={{ ...labelStyle, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Your signature
            </p>
            <SignaturePad value={signature} onChange={setSignature} />

            {/* Disclaimer AFTER the intake, before generating */}
            <div style={{ ...disclaimerBox, margin: "16px 0 0" }}>
              By signing, you affirm the financial information you provided is true and complete to the best of your
              knowledge. Review the generated application carefully before filing it with any court — HyperLaw is not a
              law firm and this is not legal advice.
            </div>

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

        {/* ── STEP 4 — done ────────────────────────────────────────────────── */}
        {step === 4 && (
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: `${ORANGE}1a`,
                border: `1px solid ${ORANGE}55`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "8px auto 14px",
              }}
            >
              <Check size={26} color={ORANGE} />
            </div>
            <h3 style={{ color: "#fff", fontSize: 18, fontWeight: 800, margin: "0 0 8px" }}>You're doing a good job.</h3>
            <p style={{ color: "#cbb8a8", fontSize: 13, lineHeight: 1.65, margin: "0 auto 18px", maxWidth: 340 }}>
              Your fee-waiver application is ready. Read it over carefully before filing — check every number and make
              sure it matches your records. HyperLaw is not a law firm and this isn't legal advice.
            </p>
            <button type="button" style={primaryBtn} onClick={handleClose}>
              View my application
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

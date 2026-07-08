import React, { useEffect, useState } from "react";
import { X, Loader2, Upload } from "lucide-react";
import { aiApi, type ProceduralInfo, type DocumentType } from "../lib/aiApi";
import { COMPLIANCE } from "../lib/compliance";

const ORANGE = "#d9711f";

type FiledAnswer = "yes" | "no" | null;
type ConferredAnswer = "yes" | "no" | "not_required" | null;

/**
 * Gathers ALL upfront drafting answers in a single modal before the parent makes
 * one generate call. Shows free jurisdiction-aware procedural notes, then compiles
 * the answers into a labeled context string handed back via onReady.
 */
export default function DraftQuestionsModal(props: {
  open: boolean;
  documentType: DocumentType;
  documentLabel: string;
  jurisdiction?: string;
  caseId?: string;
  needsSource: boolean;
  onClose: () => void;
  onReady: (payload: { draftContext: string; sourceDocument?: { title?: string; content: string } }) => void;
  onBuyCredits?: () => void;
}): React.JSX.Element | null {
  const {
    open, documentType, documentLabel, jurisdiction, caseId, needsSource,
    onClose, onReady, onBuyCredits,
  } = props;

  const [procLoading, setProcLoading] = useState(false);
  const [proc, setProc] = useState<ProceduralInfo | null>(null);

  const [relief, setRelief] = useState("");
  const [disputedFacts, setDisputedFacts] = useState("");
  const [filed, setFiled] = useState<FiledAnswer>(null);
  const [deadline, setDeadline] = useState("");
  const [conferred, setConferred] = useState<ConferredAnswer>(null);

  const [sourceContent, setSourceContent] = useState("");
  const [fileNote, setFileNote] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [creditError, setCreditError] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Reset transient state on open.
    setProc(null);
    setRelief("");
    setDisputedFacts("");
    setFiled(null);
    setDeadline("");
    setConferred(null);
    setSourceContent("");
    setFileNote(null);
    setError(null);
    setCreditError(false);

    setProcLoading(true);
    aiApi.proceduralInfo(documentType, jurisdiction, caseId)
      .then(setProc)
      .catch(() => { /* silently skip procedural guidance on failure */ })
      .finally(() => setProcLoading(false));
  }, [open, documentType, jurisdiction, caseId]);

  if (!open) return null;

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    const isTextual = file.type.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md");
    if (isTextual) {
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === "string" ? reader.result : "";
        setSourceContent(prev => (prev ? `${prev}\n\n${text}` : text));
        setFileNote(`Loaded: ${file.name}`);
      };
      reader.onerror = () => setFileNote(`Could not read: ${file.name}`);
      reader.readAsText(file);
    } else {
      setFileNote(`Attached file noted (not auto-read): ${file.name} — paste its text below if needed.`);
    }
    e.target.value = "";
  }

  function handleContinue() {
    setError(null);
    if (!relief.trim()) { setError("Please describe the outcome you're asking the court for."); return; }
    if (!disputedFacts.trim()) { setError("Please list the key facts you dispute or want to establish."); return; }
    if (needsSource && !sourceContent.trim()) { setError("Please paste the document you're responding to."); return; }

    const filedText = filed === "yes" ? "Yes" : filed === "no" ? "No" : "unanswered";
    const conferredText =
      conferred === "yes" ? "Yes" :
      conferred === "no" ? "No" :
      conferred === "not_required" ? "Not required" : "unanswered";

    const draftContext =
      "UPFRONT DRAFTING ANSWERS\n" +
      `Document: ${documentLabel}\n` +
      `Jurisdiction: ${jurisdiction || "unspecified"}\n` +
      `Relief sought: ${relief.trim()}\n` +
      `Disputed/target facts: ${disputedFacts.trim()}\n` +
      `Already filed: ${filedText}\n` +
      `Known deadline: ${deadline.trim() || "none provided"}\n` +
      `Met-and-conferred: ${conferredText}`;

    onReady({
      draftContext,
      sourceDocument: needsSource
        ? { title: `${documentLabel} — source`, content: sourceContent.trim() }
        : undefined,
    });
  }

  const inputStyle: React.CSSProperties = {
    background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: 12, color: "#fff",
    padding: "12px 14px", fontSize: 14, outline: "none", boxSizing: "border-box", width: "100%",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 0.5,
    textTransform: "uppercase", display: "block", marginBottom: 8,
  };

  const chip = (active: boolean): React.CSSProperties => ({
    background: active ? `linear-gradient(90deg, ${ORANGE}, #FF7A1A)` : "#0d0d0d",
    border: active ? "none" : "1px solid #2a2a2a",
    borderRadius: 12, color: active ? "#0a0908" : "#888",
    fontWeight: 700, fontSize: 13, padding: "10px 16px", cursor: "pointer",
  });

  const fieldWrap: React.CSSProperties = { marginBottom: 18 };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: "24px 20px",
      fontFamily: "Arial, sans-serif", zIndex: 300,
    }}>
      <div style={{
        background: "#111", border: "1px solid #2a2a2a", borderRadius: 20,
        maxWidth: 440, width: "100%", padding: "28px 24px", maxHeight: "90vh", overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: "#fff", margin: 0 }}>{documentLabel}</h3>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "#888", cursor: "pointer", padding: 4,
            display: "flex", alignItems: "center",
          }} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* Procedural guidance */}
        {procLoading ? (
          <div style={{
            display: "flex", alignItems: "center", gap: 10, color: "#888",
            fontSize: 13, lineHeight: 1.6, marginBottom: 18,
          }}>
            <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
            Loading procedural guidance…
            <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
          </div>
        ) : proc ? (
          <div style={{
            background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 12,
            padding: "14px 16px", marginBottom: 20,
          }}>
            <div style={{ fontWeight: 800, color: "#fff", fontSize: 14, marginBottom: 8 }}>{proc.title}</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: "#ccc", fontSize: 13, lineHeight: 1.6 }}>
              {proc.notes.map((n, i) => <li key={i} style={{ marginBottom: 4 }}>{n}</li>)}
            </ul>
          </div>
        ) : null}

        {/* Questions */}
        <div style={fieldWrap}>
          <label style={labelStyle}>What outcome are you asking the court for?</label>
          <textarea
            value={relief}
            onChange={e => setRelief(e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: "vertical" }}
            placeholder="e.g. dismissal of the claim, an order compelling discovery…"
          />
        </div>

        <div style={fieldWrap}>
          <label style={labelStyle}>List the key facts you dispute or want to establish.</label>
          <textarea
            value={disputedFacts}
            onChange={e => setDisputedFacts(e.target.value)}
            rows={4}
            style={{ ...inputStyle, resize: "vertical" }}
            placeholder="One fact per line is fine…"
          />
        </div>

        <div style={fieldWrap}>
          <label style={labelStyle}>Has this case already been filed with the court?</label>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={chip(filed === "yes")} onClick={() => setFiled("yes")}>Yes</button>
            <button style={chip(filed === "no")} onClick={() => setFiled("no")}>No</button>
          </div>
        </div>

        <div style={fieldWrap}>
          <label style={labelStyle}>Any known filing deadline? (date or leave blank)</label>
          <input
            value={deadline}
            onChange={e => setDeadline(e.target.value)}
            style={inputStyle}
            placeholder="e.g. 2025-06-15"
          />
        </div>

        <div style={fieldWrap}>
          <label style={labelStyle}>Have you conferred with the other party (if your court requires it)?</label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button style={chip(conferred === "yes")} onClick={() => setConferred("yes")}>Yes</button>
            <button style={chip(conferred === "no")} onClick={() => setConferred("no")}>No</button>
            <button style={chip(conferred === "not_required")} onClick={() => setConferred("not_required")}>Not required</button>
          </div>
        </div>

        {needsSource && (
          <div style={fieldWrap}>
            <label style={labelStyle}>Paste the document you're responding to</label>
            <textarea
              value={sourceContent}
              onChange={e => setSourceContent(e.target.value)}
              rows={7}
              style={{ ...inputStyle, resize: "vertical", marginBottom: 10 }}
              placeholder="Paste the full text here…"
            />
            <label style={{
              display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer",
              background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: 12,
              color: "#888", fontWeight: 600, fontSize: 13, padding: "10px 14px",
            }}>
              <Upload size={15} />
              Attach a file
              <input
                type="file"
                accept=".txt,.md,.pdf,.doc,.docx"
                onChange={handleFile}
                style={{ display: "none" }}
              />
            </label>
            {fileNote && (
              <div style={{ color: "#888", fontSize: 12, lineHeight: 1.6, marginTop: 8 }}>{fileNote}</div>
            )}
          </div>
        )}

        {error && (
          <div style={{ color: "#ef4444", fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>{error}</div>
        )}

        {creditError && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ color: "#ef4444", fontSize: 13, lineHeight: 1.6, marginBottom: 8 }}>Not enough credits</div>
            <button onClick={() => onBuyCredits?.()} style={{
              background: `linear-gradient(90deg, ${ORANGE}, #FF7A1A)`, border: "none", borderRadius: 12,
              color: "#0a0908", fontWeight: 800, fontSize: 14, padding: "12px 16px", cursor: "pointer",
            }}>
              Buy credits
            </button>
          </div>
        )}

        {/* Actions */}
        <button onClick={handleContinue} style={{
          width: "100%", background: `linear-gradient(90deg, ${ORANGE}, #FF7A1A)`, border: "none",
          borderRadius: 12, color: "#0a0908", fontWeight: 800, fontSize: 14, padding: "14px",
          cursor: "pointer", marginBottom: 10,
        }}>
          Continue to draft
        </button>
        <button onClick={onClose} style={{
          width: "100%", background: "none", border: "1px solid #2a2a2a", borderRadius: 12,
          color: "#888", fontWeight: 600, padding: "12px", cursor: "pointer",
        }}>
          Cancel
        </button>

        <div style={{ color: "#888", fontSize: 12, lineHeight: 1.6, marginTop: 16 }}>
          {COMPLIANCE.AI_GENERATED_SHORT}
        </div>
      </div>
    </div>
  );
}

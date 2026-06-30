import React, { useState, useRef, useEffect } from "react";
import {
  ChevronRight, ChevronLeft, AlertTriangle, Quote, Clock, User, Shield,
  CheckCircle, XCircle, MessageSquare, FileSearch, Camera, Plus, X,
  RotateCcw, Lightbulb, ArrowRight, Scale, FileText, Mic,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type ScreenType = "contradiction" | "quote" | "prior_incident" | "admission" | "policy_violation";
type DataMap = Record<string, string>;

interface QNode {
  id: string;
  question: string;
  subtext?: string;
  type: "text" | "textarea" | "choice";
  key: string;
  choices?: { label: string; value: string }[];
  next: string | null | ((answer: string, data: DataMap) => string | null);
}

interface ChatEntry {
  nodeId: string;
  question: string;
  answer: string;
}

interface ScreenDef {
  id: ScreenType;
  label: string;
  blurb: string;
  icon: React.ElementType;
  color: string;
}

// ─── Screen type registry ─────────────────────────────────────────────────────

const SCREEN_TYPES: ScreenDef[] = [
  { id: "contradiction", label: "Contradiction", blurb: "Two statements that can't both be true", icon: XCircle, color: "#d9711f" },
  { id: "quote", label: "Quote Breakdown", blurb: "Why one quote matters", icon: Quote, color: "#d9711f" },
  { id: "prior_incident", label: "Prior Incident", blurb: "This wasn't the first time", icon: Clock, color: "#d9711f" },
  { id: "admission", label: "Admission", blurb: "They already knew — and said so", icon: Mic, color: "#d9711f" },
  { id: "policy_violation", label: "Policy Violation", blurb: "What policy required vs. what happened", icon: Scale, color: "#d9711f" },
];

const FOOTER_PRESETS = [
  "COUNT 1 • FIRST AMENDMENT",
  "COUNT 4 • MONELL",
  "COUNT 8 • FALSE REPORTING",
  "42 U.S.C. § 1983",
  "KRS 519.040(1)(d)",
  "AGENCY POLICY",
];

// ─── Question Trees ───────────────────────────────────────────────────────────

const TREES: Record<ScreenType, Record<string, QNode>> = {

  contradiction: {
    start: {
      id: "start", key: "_context",
      question: "What did you just notice or hear?",
      subtext: "Describe the moment — what caught your attention.",
      type: "textarea",
      next: "who",
    },
    who: {
      id: "who", key: "_person",
      question: "Who made this statement or claim?",
      subtext: "Name, title, or role — whoever produced it.",
      type: "text",
      next: "source_type",
    },
    source_type: {
      id: "source_type", key: "_sourceType",
      question: "Where does this come from?",
      subtext: "Pick the type of evidence.",
      type: "choice",
      choices: [
        { label: "Bodycam footage", value: "bodycam" },
        { label: "Police / agency report", value: "report" },
        { label: "Verbal statement", value: "statement" },
        { label: "Written document", value: "document" },
        { label: "Other", value: "other" },
      ],
      next: (answer) => {
        if (answer === "bodycam") return "bodycam_ts";
        if (answer === "report") return "report_id";
        return "source_detail";
      },
    },
    bodycam_ts: {
      id: "bodycam_ts", key: "_sourceTimestamp",
      question: "What timestamp on the footage?",
      type: "text",
      next: "exact_quote",
    },
    report_id: {
      id: "report_id", key: "_reportId",
      question: "Which report? Name or case number.",
      type: "text",
      next: "exact_quote",
    },
    source_detail: {
      id: "source_detail", key: "_sourceDetail",
      question: "Any additional context for this source?",
      subtext: "Date, setting, or identifying details.",
      type: "text",
      next: "exact_quote",
    },
    exact_quote: {
      id: "exact_quote", key: "statementA",
      question: "Exact words or description — what was said or documented?",
      subtext: "Use their actual language if you have it.",
      type: "textarea",
      next: "contra_type",
    },
    contra_type: {
      id: "contra_type", key: "_contraType",
      question: "What evidence contradicts this?",
      subtext: "What proves it's wrong or inconsistent?",
      type: "choice",
      choices: [
        { label: "Bodycam footage", value: "bodycam" },
        { label: "A report or record", value: "report" },
        { label: "GPS / location data", value: "gps" },
        { label: "Agency policy", value: "policy" },
        { label: "Another person's statement", value: "statement" },
        { label: "Physical evidence", value: "physical" },
      ],
      next: (answer) => {
        if (answer === "bodycam") return "contra_bodycam_ts";
        if (answer === "report") return "contra_report_id";
        if (answer === "policy") return "contra_policy_name";
        if (answer === "statement") return "contra_who";
        return "contra_detail";
      },
    },
    contra_bodycam_ts: {
      id: "contra_bodycam_ts", key: "_contraTimestamp",
      question: "What timestamp shows the contradiction?",
      type: "text",
      next: "contra_detail",
    },
    contra_report_id: {
      id: "contra_report_id", key: "_contraReportId",
      question: "Which report contradicts it?",
      type: "text",
      next: "contra_detail",
    },
    contra_policy_name: {
      id: "contra_policy_name", key: "_contraPolicy",
      question: "Which policy or procedure applies?",
      type: "text",
      next: "contra_detail",
    },
    contra_who: {
      id: "contra_who", key: "_contraWho",
      question: "Who made the contradicting statement?",
      type: "text",
      next: "contra_detail",
    },
    contra_detail: {
      id: "contra_detail", key: "statementB",
      question: "What exactly does the contradicting evidence show or say?",
      subtext: "Use precise language. This is Statement B.",
      type: "textarea",
      next: "why_conflict",
    },
    why_conflict: {
      id: "why_conflict", key: "whyConflict",
      question: "In one sharp sentence — why do these two things conflict?",
      type: "textarea",
      next: "proof",
    },
    proof: {
      id: "proof", key: "proof",
      question: "What's the hard proof that closes this argument?",
      subtext: "The fact that makes denial impossible.",
      type: "textarea",
      next: "legal",
    },
    legal: {
      id: "legal", key: "legalSignificance",
      question: "What does this contradiction mean legally?",
      type: "textarea",
      next: "headline",
    },
    headline: {
      id: "headline", key: "headline",
      question: "Give this a headline — the hook.",
      subtext: "A question or statement that grabs attention.",
      type: "text",
      next: "violation",
    },
    violation: {
      id: "violation", key: "violation",
      question: "What violation or issue does this fall under?",
      subtext: "e.g. Real-Time Fabrication, False Reporting, Prejudgment",
      type: "text",
      next: "screen_num",
    },
    screen_num: {
      id: "screen_num", key: "screenNumber",
      question: "Screen number for this slide.",
      subtext: "e.g. 01, 02, 05",
      type: "text",
      next: null,
    },
  },

  quote: {
    start: {
      id: "start", key: "_context",
      question: "What quote caught your attention?",
      subtext: "Describe the moment — who was speaking, what were they responding to.",
      type: "textarea",
      next: "person",
    },
    person: {
      id: "person", key: "person",
      question: "Who said it?",
      subtext: "Name or role.",
      type: "text",
      next: "quote_text",
    },
    quote_text: {
      id: "quote_text", key: "quote",
      question: "Exact words — what did they say?",
      type: "textarea",
      next: "when",
    },
    when: {
      id: "when", key: "when",
      question: "When was this said, and what was the context?",
      subtext: "Before or after what happened? What did they already know?",
      type: "text",
      next: "lead_in_check",
    },
    lead_in_check: {
      id: "lead_in_check", key: "_hasLeadIn",
      question: "Was this quote a response to something specific?",
      type: "choice",
      choices: [
        { label: "Yes — someone said something first", value: "yes" },
        { label: "No — they said it unprompted", value: "no" },
      ],
      next: (answer) => answer === "yes" ? "lead_in" : "facts",
    },
    lead_in: {
      id: "lead_in", key: "leadInQuote",
      question: "What was said right before this quote? (exact words if you have them)",
      type: "text",
      next: "facts",
    },
    facts: {
      id: "facts", key: "facts",
      question: "List the facts that make this quote hard to defend.",
      subtext: "One per line. Each becomes a bullet point on the screen.",
      type: "textarea",
      next: "significance",
    },
    significance: {
      id: "significance", key: "significance",
      question: "Why does this quote matter legally?",
      subtext: "What does it prove or imply?",
      type: "textarea",
      next: "headline",
    },
    headline: {
      id: "headline", key: "headline",
      question: "Headline — the first hook (usually the quote itself or a short setup).",
      type: "text",
      next: "subheadline_check",
    },
    subheadline_check: {
      id: "subheadline_check", key: "_hasSubheadline",
      question: "Do you want a follow-up headline in orange — a question it raises?",
      type: "choice",
      choices: [
        { label: "Yes", value: "yes" },
        { label: "No, one headline is enough", value: "no" },
      ],
      next: (answer) => answer === "yes" ? "subheadline" : "violation",
    },
    subheadline: {
      id: "subheadline", key: "subheadline",
      question: "What's the follow-up question this raises?",
      subtext: "This appears in orange below the headline.",
      type: "text",
      next: "violation",
    },
    violation: {
      id: "violation", key: "violation",
      question: "What violation or issue does this fall under?",
      type: "text",
      next: "screen_num",
    },
    screen_num: {
      id: "screen_num", key: "screenNumber",
      question: "Screen number?",
      type: "text",
      next: null,
    },
  },

  prior_incident: {
    start: {
      id: "start", key: "date",
      question: "When did the prior incident happen?",
      subtext: "Date and a short tag — e.g. May 7, 2026 • Same Safety Issue",
      type: "text",
      next: "label",
    },
    label: {
      id: "label", key: "label",
      question: "What's the eyebrow label for this screen?",
      subtext: "Usually: PRIOR DOCUMENTED INCIDENT",
      type: "text",
      next: "headline",
    },
    headline: {
      id: "headline", key: "headline",
      question: "Headline — what's the argument in one sentence?",
      subtext: "e.g. \"This wasn't the first time.\"",
      type: "text",
      next: "points",
    },
    points: {
      id: "points", key: "points",
      question: "Describe what happened. One bullet per line.",
      subtext: "Each line becomes an icon bullet on the screen.",
      type: "textarea",
      next: "connection",
    },
    connection: {
      id: "connection", key: "_connection",
      question: "How does this connect to the current case?",
      subtext: "What does the pattern prove?",
      type: "textarea",
      next: "resolution",
    },
    resolution: {
      id: "resolution", key: "resolution",
      question: "How did the prior incident end?",
      subtext: "Who responded? Any reports? Any recordings preserved?",
      type: "textarea",
      next: "screen_num",
    },
    screen_num: {
      id: "screen_num", key: "screenNumber",
      question: "Screen number?",
      type: "text",
      next: null,
    },
  },

  admission: {
    start: {
      id: "start", key: "_context",
      question: "What did they say that amounts to an admission?",
      subtext: "Describe what was said — even if you don't have the exact quote yet.",
      type: "textarea",
      next: "person",
    },
    person: {
      id: "person", key: "person",
      question: "Who made the admission?",
      subtext: "Name and role.",
      type: "text",
      next: "when",
    },
    when: {
      id: "when", key: "when",
      question: "When did they say it, and what was the setting?",
      subtext: "e.g. During investigation, June 3 — 3 days after the incident",
      type: "text",
      next: "exact_words",
    },
    exact_words: {
      id: "exact_words", key: "admissionQuote",
      question: "Exact words — what did they say?",
      subtext: "If you don't have verbatim, describe as closely as possible.",
      type: "textarea",
      next: "what_they_knew",
    },
    what_they_knew: {
      id: "what_they_knew", key: "whatTheyKnew",
      question: "What were they admitting knowledge of?",
      subtext: "What fact, event, or condition did this statement reveal they knew?",
      type: "textarea",
      next: "when_they_knew",
    },
    when_they_knew: {
      id: "when_they_knew", key: "whenTheyKnew",
      question: "When did they first know this — and how do you know?",
      subtext: "This establishes the timeline of knowledge.",
      type: "textarea",
      next: "legal",
    },
    legal: {
      id: "legal", key: "legalSignificance",
      question: "Why does this admission matter legally?",
      subtext: "What does \"they already knew\" prove in your case?",
      type: "textarea",
      next: "headline",
    },
    headline: {
      id: "headline", key: "headline",
      question: "Headline — what's the damaging takeaway?",
      subtext: "e.g. \"He Already Knew.\" or \"They Had Notice.\"",
      type: "text",
      next: "violation",
    },
    violation: {
      id: "violation", key: "violation",
      question: "What violation or claim does this support?",
      type: "text",
      next: "screen_num",
    },
    screen_num: {
      id: "screen_num", key: "screenNumber",
      question: "Screen number?",
      type: "text",
      next: null,
    },
  },

  policy_violation: {
    start: {
      id: "start", key: "policyName",
      question: "Which policy or procedure applies here?",
      subtext: "Name, section number, or description.",
      type: "text",
      next: "policy_says",
    },
    policy_says: {
      id: "policy_says", key: "policySays",
      question: "What does the policy require?",
      subtext: "Exact language if you have it, or a clear description.",
      type: "textarea",
      next: "what_happened",
    },
    what_happened: {
      id: "what_happened", key: "whatHappened",
      question: "What actually happened instead?",
      subtext: "Describe the violation — what they did or failed to do.",
      type: "textarea",
      next: "who_violated",
    },
    who_violated: {
      id: "who_violated", key: "person",
      question: "Who is responsible for following this policy?",
      subtext: "Name and role.",
      type: "text",
      next: "evidence_type",
    },
    evidence_type: {
      id: "evidence_type", key: "_evidenceType",
      question: "What evidence proves the violation?",
      type: "choice",
      choices: [
        { label: "Bodycam footage", value: "bodycam" },
        { label: "Report or record", value: "report" },
        { label: "Witness statement", value: "witness" },
        { label: "Their own words", value: "admission" },
        { label: "Multiple sources", value: "multiple" },
      ],
      next: "evidence_detail",
    },
    evidence_detail: {
      id: "evidence_detail", key: "evidenceDetail",
      question: "Describe the evidence that proves the violation.",
      type: "textarea",
      next: "consequence",
    },
    consequence: {
      id: "consequence", key: "consequence",
      question: "What is the consequence of this violation?",
      subtext: "What did the failure cause or enable?",
      type: "textarea",
      next: "legal",
    },
    legal: {
      id: "legal", key: "legalSignificance",
      question: "What's the legal significance?",
      subtext: "How does this policy violation support your claim?",
      type: "textarea",
      next: "headline",
    },
    headline: {
      id: "headline", key: "headline",
      question: "Headline — what's the violation in plain terms?",
      type: "text",
      next: "screen_num",
    },
    screen_num: {
      id: "screen_num", key: "screenNumber",
      question: "Screen number?",
      type: "text",
      next: null,
    },
  },
};

// ─── Keyword detection ────────────────────────────────────────────────────────

function detectSuggestion(data: DataMap, current: ScreenType): ScreenType | null {
  const text = Object.values(data).join(" ").toLowerCase();
  if (current !== "admission" && /already knew|was aware|had notice|knew about|they knew|he knew|she knew/.test(text)) return "admission";
  if (current !== "policy_violation" && /policy|procedure|protocol|required by|supposed to|mandated/.test(text)) return "policy_violation";
  if (current !== "prior_incident" && /\bearlier\b|prior incident|before this|weeks before|months before|same issue|pattern of/.test(text)) return "prior_incident";
  if (current !== "quote" && /\bquote\b|\bverbatim\b|exact words|he said|she said|they said/.test(text) && !text.includes("contradicts")) return "quote";
  return null;
}

// ─── Data mapper ──────────────────────────────────────────────────────────────

interface ScreenData {
  [key: string]: string | string[] | undefined;
  footerTags: string[];
}

function mapData(type: ScreenType, raw: DataMap, footerTags: string[]): ScreenData {
  const base = { footerTags, screenNumber: raw.screenNumber || "01" };

  if (type === "contradiction") {
    const person = raw._person || "PERSON";
    let statementASource = person;
    if (raw._sourceType === "bodycam") statementASource = `${person}, bodycam ${raw._sourceTimestamp || ""}`.trim();
    else if (raw._sourceType === "report") statementASource = `${person}, ${raw._reportId || "report"}`;
    else if (raw._sourceDetail) statementASource = `${person} — ${raw._sourceDetail}`;
    else statementASource = person;

    let statementBSource = "";
    if (raw._contraType === "bodycam") statementBSource = `Bodycam footage${raw._contraTimestamp ? ", " + raw._contraTimestamp : ""}`;
    else if (raw._contraType === "report") statementBSource = raw._contraReportId || "Report";
    else if (raw._contraType === "gps") statementBSource = "GPS / location data";
    else if (raw._contraType === "policy") statementBSource = raw._contraPolicy || "Agency policy";
    else if (raw._contraType === "statement") statementBSource = raw._contraWho || "Witness";
    else statementBSource = "Physical evidence";

    return { ...base, person, violation: raw.violation || "", headline: raw.headline || raw._context || "THE STATEMENTS DON'T MATCH.", statementA: raw.statementA || "", statementASource, statementB: raw.statementB || "", statementBSource, whyConflict: raw.whyConflict || "", proof: raw.proof || "", legalSignificance: raw.legalSignificance || "" };
  }

  if (type === "quote") {
    const leadIn = raw._hasLeadIn === "yes" ? "Plaintiff ended the exchange by saying:" : "";
    return { ...base, person: raw.person || "PERSON", violation: raw.violation || "", headline: raw.headline || "", subheadline: raw.subheadline || "", leadIn, leadInQuote: raw.leadInQuote || "", quote: raw.quote || "", when: raw.when || "", facts: raw.facts || "", significance: raw.significance || "" };
  }

  if (type === "prior_incident") {
    return { ...base, label: raw.label || "PRIOR DOCUMENTED INCIDENT", date: raw.date || "", headline: raw.headline || "This wasn't the first time.", points: raw.points || "", resolution: raw.resolution || "" };
  }

  if (type === "admission") {
    return { ...base, person: raw.person || "PERSON", violation: raw.violation || "", headline: raw.headline || "", when: raw.when || "", admissionQuote: raw.admissionQuote || raw._context || "", whatTheyKnew: raw.whatTheyKnew || "", whenTheyKnew: raw.whenTheyKnew || "", legalSignificance: raw.legalSignificance || "" };
  }

  if (type === "policy_violation") {
    return { ...base, person: raw.person || "PERSON", policyName: raw.policyName || "", policySays: raw.policySays || "", whatHappened: raw.whatHappened || "", evidenceDetail: raw.evidenceDetail || "", consequence: raw.consequence || "", legalSignificance: raw.legalSignificance || "", headline: raw.headline || "" };
  }

  return base;
}

// ─── Shared canvas chrome ─────────────────────────────────────────────────────

const ORANGE = "#d9711f";

function ScreenFrame({ children, footer, screenNumber }: { children: React.ReactNode; footer: string[]; screenNumber?: string }) {
  return (
    <div style={{ width: 1080, height: 1080, background: "#0a0a0a", border: `3px solid ${ORANGE}`, position: "relative", padding: "44px 48px 36px 48px", boxSizing: "border-box", fontFamily: "'Arial Black', Arial, sans-serif", color: "#fff", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ position: "absolute", left: 28, top: 28, bottom: 80, width: 5, background: ORANGE }} />
      <div style={{ position: "absolute", top: 36, right: 44, fontSize: 40, fontWeight: 900, color: "#8a8a8a", fontFamily: "Arial, sans-serif" }}>{screenNumber || "01"}</div>
      <div style={{ flex: 1, paddingLeft: 24, display: "flex", flexDirection: "column" }}>{children}</div>
      {footer.length > 0 && (
        <div style={{ borderTop: `1px solid ${ORANGE}88`, paddingTop: 14, marginLeft: 24, display: "flex", flexWrap: "wrap", gap: 10, fontFamily: "Arial, sans-serif", fontSize: 16, fontWeight: 700, color: ORANGE, letterSpacing: 0.5 }}>
          {footer.map((f, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {i > 0 && <span style={{ color: "#666" }}>•</span>}
              {f}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Reusable canvas blocks ───────────────────────────────────────────────────

function Eyebrow({ person, violation }: { person: string; violation?: string }) {
  return (
    <div style={{ marginBottom: 14, fontFamily: "Arial, sans-serif" }}>
      <div style={{ color: ORANGE, fontWeight: 800, fontSize: 22, letterSpacing: 0.5 }}>{person}</div>
      {violation && <div style={{ color: "#aaa", fontWeight: 700, fontSize: 15, letterSpacing: 1.5, marginTop: 2 }}>{violation.toUpperCase()}</div>}
    </div>
  );
}

function BigHeadline({ children, color = "#fff", size = 52 }: { children: React.ReactNode; color?: string; size?: number }) {
  return (
    <div style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: size, lineHeight: 1.04, color, textTransform: "uppercase", letterSpacing: -0.5 }}>
      {children}
    </div>
  );
}

function Divider({ mt = 18, mb = 18 }: { mt?: number; mb?: number }) {
  return <div style={{ height: 2, background: ORANGE, marginTop: mt, marginBottom: mb }} />;
}

function QuotedText({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: 23, lineHeight: 1.3, textTransform: "uppercase" }}>
      "{children}"
    </div>
  );
}

function EvidenceBlock({ icon: Icon, label, sub, children }: { icon: React.ElementType; label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <Icon size={20} color={ORANGE} />
        <span style={{ fontFamily: "Arial, sans-serif", fontWeight: 800, fontSize: 14, color: ORANGE, letterSpacing: 0.5 }}>{label}</span>
        {sub && <span style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: "#888" }}>— {sub}</span>}
      </div>
      {children}
    </div>
  );
}

function LegalBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ border: `1.5px solid ${ORANGE}`, borderRadius: 4, padding: "14px 16px", background: "#d9711f0d", fontFamily: "Arial, sans-serif" }}>
      <div style={{ color: ORANGE, fontWeight: 800, fontSize: 14, marginBottom: 6, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 17, lineHeight: 1.4, fontWeight: 700 }}>{children}</div>
    </div>
  );
}

function FactList({ items }: { items: string[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {items.map((f, i) => (
        <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", fontFamily: "Arial, sans-serif" }}>
          <CheckCircle size={22} color={ORANGE} style={{ flexShrink: 0, marginTop: 2 }} />
          <span style={{ fontSize: 18, lineHeight: 1.3 }}>{f}</span>
        </div>
      ))}
    </div>
  );
}

const ICONS_CYCLE = [User, MessageSquare, Shield, CheckCircle, XCircle, FileSearch, Clock, AlertTriangle];
function pickIcon(i: number) { return ICONS_CYCLE[i % ICONS_CYCLE.length]; }

function IconBullets({ items }: { items: string[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {items.map((p, i) => {
        const Icon = pickIcon(i);
        return (
          <div key={i} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            <div style={{ width: 46, height: 46, borderRadius: "50%", border: `2px solid ${ORANGE}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: ORANGE }}>
              <Icon size={22} />
            </div>
            <div style={{ fontFamily: "Arial, sans-serif", fontSize: 19, lineHeight: 1.4, paddingTop: 8 }}>{p}</div>
          </div>
        );
      })}
    </div>
  );
}

function PolicyRow({ label, content, accent }: { label: string; content: string; accent?: boolean }) {
  return (
    <div style={{ border: `1.5px solid ${accent ? ORANGE : "#333"}`, borderRadius: 4, padding: "14px 16px", background: accent ? "#d9711f0d" : "#1a1a1a", fontFamily: "Arial, sans-serif" }}>
      <div style={{ color: accent ? ORANGE : "#888", fontWeight: 800, fontSize: 13, marginBottom: 6, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 18, lineHeight: 1.4, fontWeight: accent ? 700 : 400 }}>{content}</div>
    </div>
  );
}

// ─── Screen renderers ─────────────────────────────────────────────────────────

function ContradictionScreen({ data }: { data: ScreenData }) {
  return (
    <ScreenFrame footer={data.footerTags} screenNumber={data.screenNumber as string}>
      <Eyebrow person={(data.person as string) || "PERSON"} violation={data.violation as string} />
      <BigHeadline size={46}>{(data.headline as string) || "THE STATEMENTS DON'T MATCH."}</BigHeadline>
      <Divider mt={20} mb={22} />
      <div style={{ display: "flex", gap: 28, flex: 1 }}>
        <div style={{ flex: 1.3, display: "flex", flexDirection: "column", gap: 16 }}>
          <EvidenceBlock icon={User} label="STATEMENT A" sub={data.statementASource as string}>
            <QuotedText>{(data.statementA as string) || "—"}</QuotedText>
          </EvidenceBlock>
          <div style={{ display: "flex", justifyContent: "center", color: ORANGE }}>
            <ChevronRight size={26} style={{ transform: "rotate(90deg)" }} />
          </div>
          <EvidenceBlock icon={MessageSquare} label="STATEMENT B" sub={data.statementBSource as string}>
            <QuotedText>{(data.statementB as string) || "—"}</QuotedText>
          </EvidenceBlock>
          {data.proof && (
            <div style={{ fontFamily: "Arial, sans-serif", fontSize: 17, color: "#fff", marginTop: 6 }}>
              <span style={{ color: ORANGE, fontWeight: 800 }}>PROOF: </span>{data.proof as string}
            </div>
          )}
        </div>
        <div style={{ width: 2, background: "#d9711f55" }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, fontFamily: "Arial, sans-serif" }}>
          {data.whyConflict && (
            <div>
              <div style={{ color: ORANGE, fontWeight: 800, fontSize: 16, marginBottom: 6 }}>WHY THIS CONFLICTS</div>
              <div style={{ fontSize: 18, lineHeight: 1.4 }}>{data.whyConflict as string}</div>
            </div>
          )}
          {data.legalSignificance && (
            <LegalBox label="LEGAL SIGNIFICANCE">{data.legalSignificance as string}</LegalBox>
          )}
        </div>
      </div>
    </ScreenFrame>
  );
}

function QuoteScreen({ data }: { data: ScreenData }) {
  const facts = ((data.facts as string) || "").split("\n").map(f => f.trim()).filter(Boolean);
  return (
    <ScreenFrame footer={data.footerTags} screenNumber={data.screenNumber as string}>
      <Eyebrow person={(data.person as string) || "PERSON"} violation={data.violation as string} />
      <BigHeadline size={42} color="#fff">{data.headline as string}</BigHeadline>
      {data.subheadline && <BigHeadline size={42} color={ORANGE}>{data.subheadline as string}</BigHeadline>}
      <Divider mt={18} mb={18} />
      {(data.leadIn || data.leadInQuote) && (
        <div style={{ fontFamily: "Arial, sans-serif", fontSize: 19, marginBottom: 10 }}>
          {data.leadIn as string} <span style={{ fontWeight: 800 }}>{data.leadInQuote as string}</span>
        </div>
      )}
      {data.quote && (
        <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
          <Quote size={36} color={ORANGE} style={{ flexShrink: 0, marginTop: 4 }} />
          <div style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: 28, lineHeight: 1.25, textTransform: "uppercase" }}>{data.quote as string}</div>
        </div>
      )}
      {data.when && <div style={{ fontFamily: "Arial, sans-serif", fontSize: 15, color: "#aaa", marginBottom: 18 }}>{data.when as string}</div>}
      <Divider mt={0} mb={18} />
      <div style={{ flex: 1 }}><FactList items={facts} /></div>
      {data.significance && <LegalBox label="WHY THIS MATTERS">{data.significance as string}</LegalBox>}
    </ScreenFrame>
  );
}

function PriorIncidentScreen({ data }: { data: ScreenData }) {
  const points = ((data.points as string) || "").split("\n").map(p => p.trim()).filter(Boolean);
  return (
    <ScreenFrame footer={data.footerTags} screenNumber={data.screenNumber as string}>
      <div style={{ fontFamily: "Arial, sans-serif", marginBottom: 14 }}>
        <div style={{ color: ORANGE, fontWeight: 800, fontSize: 20, letterSpacing: 0.5 }}>{(data.label as string) || "PRIOR DOCUMENTED INCIDENT"}</div>
        {data.date && <div style={{ color: "#aaa", fontWeight: 700, fontSize: 15, marginTop: 2 }}>{data.date as string}</div>}
      </div>
      <BigHeadline size={48}>{(data.headline as string) || "This wasn't the first time."}</BigHeadline>
      <Divider mt={20} mb={26} />
      <div style={{ flex: 1 }}><IconBullets items={points} /></div>
      {data.resolution && <div style={{ fontFamily: "Arial, sans-serif", fontSize: 17, lineHeight: 1.4, marginTop: 14, color: "#ddd" }}>{data.resolution as string}</div>}
    </ScreenFrame>
  );
}

function AdmissionScreen({ data }: { data: ScreenData }) {
  return (
    <ScreenFrame footer={data.footerTags} screenNumber={data.screenNumber as string}>
      <Eyebrow person={(data.person as string) || "PERSON"} violation={data.violation as string} />
      <BigHeadline size={50}>{(data.headline as string) || "THEY ALREADY KNEW."}</BigHeadline>
      <Divider mt={20} mb={24} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20, fontFamily: "Arial, sans-serif" }}>
        {data.when && (
          <div style={{ color: "#aaa", fontSize: 17, lineHeight: 1.4 }}>{data.when as string}</div>
        )}
        {data.admissionQuote && (
          <div style={{ display: "flex", gap: 14 }}>
            <Mic size={36} color={ORANGE} style={{ flexShrink: 0, marginTop: 4 }} />
            <div style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: 26, lineHeight: 1.25, textTransform: "uppercase" }}>
              {data.admissionQuote as string}
            </div>
          </div>
        )}
        <Divider mt={4} mb={4} />
        {data.whatTheyKnew && (
          <div>
            <div style={{ color: ORANGE, fontWeight: 800, fontSize: 15, marginBottom: 8 }}>WHAT THEY ADMITTED KNOWING</div>
            <div style={{ fontSize: 19, lineHeight: 1.4 }}>{data.whatTheyKnew as string}</div>
          </div>
        )}
        {data.whenTheyKnew && (
          <div>
            <div style={{ color: ORANGE, fontWeight: 800, fontSize: 15, marginBottom: 8 }}>WHEN THEY KNEW IT</div>
            <div style={{ fontSize: 18, lineHeight: 1.4 }}>{data.whenTheyKnew as string}</div>
          </div>
        )}
        {data.legalSignificance && <LegalBox label="LEGAL SIGNIFICANCE">{data.legalSignificance as string}</LegalBox>}
      </div>
    </ScreenFrame>
  );
}

function PolicyViolationScreen({ data }: { data: ScreenData }) {
  return (
    <ScreenFrame footer={data.footerTags} screenNumber={data.screenNumber as string}>
      <Eyebrow person={(data.person as string) || "PERSON"} violation="POLICY VIOLATION" />
      <BigHeadline size={44}>{(data.headline as string) || "POLICY REQUIRED IT. THEY IGNORED IT."}</BigHeadline>
      <Divider mt={20} mb={22} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>
        {data.policyName && (
          <div style={{ fontFamily: "Arial, sans-serif", color: "#aaa", fontSize: 16, fontWeight: 700, letterSpacing: 0.5 }}>
            {(data.policyName as string).toUpperCase()}
          </div>
        )}
        <div style={{ display: "flex", gap: 20, flex: 1 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
            {data.policySays && <PolicyRow label="POLICY REQUIRED" content={data.policySays as string} />}
            {data.whatHappened && <PolicyRow label="WHAT ACTUALLY HAPPENED" content={data.whatHappened as string} accent />}
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
            {data.evidenceDetail && (
              <div style={{ fontFamily: "Arial, sans-serif" }}>
                <div style={{ color: ORANGE, fontWeight: 800, fontSize: 14, marginBottom: 6 }}>EVIDENCE OF VIOLATION</div>
                <div style={{ fontSize: 17, lineHeight: 1.4 }}>{data.evidenceDetail as string}</div>
              </div>
            )}
            {data.consequence && (
              <div style={{ fontFamily: "Arial, sans-serif" }}>
                <div style={{ color: ORANGE, fontWeight: 800, fontSize: 14, marginBottom: 6 }}>CONSEQUENCE</div>
                <div style={{ fontSize: 17, lineHeight: 1.4 }}>{data.consequence as string}</div>
              </div>
            )}
            {data.legalSignificance && <LegalBox label="LEGAL SIGNIFICANCE">{data.legalSignificance as string}</LegalBox>}
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

const RENDERERS: Record<ScreenType, React.ComponentType<{ data: ScreenData }>> = {
  contradiction: ContradictionScreen,
  quote: QuoteScreen,
  prior_incident: PriorIncidentScreen,
  admission: AdmissionScreen,
  policy_violation: PolicyViolationScreen,
};

// ─── App ──────────────────────────────────────────────────────────────────────

type Stage = "select" | "convo" | "result";

export default function App() {
  const [stage, setStage] = useState<Stage>("select");
  const [screenType, setScreenType] = useState<ScreenType | null>(null);
  const [currentNodeId, setCurrentNodeId] = useState<string>("start");
  const [data, setData] = useState<DataMap>({});
  const [input, setInput] = useState<string>("");
  const [history, setHistory] = useState<ChatEntry[]>([]);
  const [footerTags, setFooterTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [suggestion, setSuggestion] = useState<ScreenType | null>(null);
  const [dismissedSuggestion, setDismissedSuggestion] = useState<ScreenType | null>(null);

  const historyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // Scroll chat history to bottom on new message
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [history]);

  useEffect(() => {
    if (stage === "convo") {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [stage, currentNodeId]);

  function startType(id: ScreenType) {
    setScreenType(id);
    setCurrentNodeId("start");
    setData({});
    setInput("");
    setHistory([]);
    setFooterTags([]);
    setSuggestion(null);
    setDismissedSuggestion(null);
    setStage("convo");
  }

  function currentNode(): QNode | null {
    if (!screenType) return null;
    return TREES[screenType][currentNodeId] || null;
  }

  function submitAnswer() {
    const node = currentNode();
    if (!node) return;
    const answer = input.trim();

    const newData: DataMap = { ...data, [node.key]: answer };
    setData(newData);

    const newHistory: ChatEntry[] = [...history, { nodeId: node.id, question: node.question, answer }];
    setHistory(newHistory);
    setInput("");

    // Check for keyword-based suggestion
    if (screenType) {
      const detected = detectSuggestion(newData, screenType);
      if (detected && detected !== dismissedSuggestion) {
        setSuggestion(detected);
      }
    }

    // Advance to next node
    const nextId = typeof node.next === "function" ? node.next(answer, newData) : node.next;
    if (nextId === null) {
      setStage("result");
    } else {
      setCurrentNodeId(nextId);
    }
  }

  function goBack() {
    if (history.length === 0) {
      setStage("select");
      return;
    }
    const prev = history[history.length - 1];
    const newHistory = history.slice(0, -1);
    setHistory(newHistory);
    const newData = { ...data };
    delete newData[prev.nodeId]; // remove last answer
    setData(newData);
    setCurrentNodeId(prev.nodeId);
    setInput(prev.answer);
  }

  function switchType(newType: ScreenType) {
    setSuggestion(null);
    setDismissedSuggestion(null);
    const keepData = { ...data };
    setScreenType(newType);
    setData(keepData);
    setHistory([]);
    setCurrentNodeId("start");
    setInput("");
    setStage("convo");
  }

  function resetAll() {
    setStage("select");
    setScreenType(null);
    setData({});
    setInput("");
    setHistory([]);
    setFooterTags([]);
    setSuggestion(null);
    setDismissedSuggestion(null);
  }

  function toggleFooterTag(tag: string) {
    setFooterTags(tags => tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag]);
  }

  function addCustomTag() {
    if (customTag.trim()) {
      setFooterTags(tags => [...tags, customTag.trim().toUpperCase()]);
      setCustomTag("");
    }
  }

  const node = currentNode();
  const Renderer = screenType ? RENDERERS[screenType] : null;
  const screenData = screenType ? mapData(screenType, data, footerTags) : null;
  const progress = node && screenType ? Object.values(TREES[screenType]).findIndex(n => n.id === currentNodeId) + 1 : 0;
  const total = screenType ? Object.keys(TREES[screenType]).length : 0;
  const suggestedDef = suggestion ? SCREEN_TYPES.find(s => s.id === suggestion) : null;

  return (
    <div style={{ minHeight: "100vh", background: "#161616", color: "#fff", fontFamily: "Arial, sans-serif", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #2a2a2a", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 10, height: 10, background: ORANGE, borderRadius: 2 }} />
          <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: 0.5 }}>LEGAL SCREEN BUILDER</span>
          {screenType && stage !== "select" && (
            <span style={{ color: "#555", fontSize: 13, fontWeight: 600 }}>
              / {SCREEN_TYPES.find(t => t.id === screenType)?.label}
            </span>
          )}
        </div>
        {stage !== "select" && (
          <button onClick={resetAll} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "1px solid #444", color: "#aaa", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            <RotateCcw size={14} /> New Screen
          </button>
        )}
      </div>

      {/* Select stage */}
      {stage === "select" && (
        <div style={{ maxWidth: 920, margin: "0 auto", padding: "60px 24px", width: "100%" }}>
          <h1 style={{ fontSize: 34, fontWeight: 900, marginBottom: 8 }}>What are you building?</h1>
          <p style={{ color: "#999", marginBottom: 36, fontSize: 16 }}>
            Choose a screen type. I'll ask you about the evidence — your screen assembles itself as you answer.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            {SCREEN_TYPES.map(t => {
              const Icon = t.icon;
              return (
                <button key={t.id} onClick={() => startType(t.id)}
                  style={{ background: "#1d1d1d", border: "1px solid #333", borderRadius: 10, padding: 22, textAlign: "left", cursor: "pointer", color: "#fff", transition: "border-color 0.15s" }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "#333")}
                >
                  <Icon size={24} color={ORANGE} style={{ marginBottom: 12 }} />
                  <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>{t.label}</div>
                  <div style={{ color: "#999", fontSize: 13 }}>{t.blurb}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Conversation stage */}
      {stage === "convo" && node && Renderer && screenData && (
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

          {/* Left: conversation panel */}
          <div style={{ width: 460, flexShrink: 0, borderRight: "1px solid #2a2a2a", display: "flex", flexDirection: "column" }}>

            {/* Suggestion banner */}
            {suggestion && suggestedDef && (
              <div style={{ background: "#1a1400", borderBottom: `1px solid ${ORANGE}44`, padding: "12px 20px", display: "flex", alignItems: "center", gap: 10 }}>
                <Lightbulb size={16} color={ORANGE} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: 13, lineHeight: 1.4 }}>
                  <span style={{ color: ORANGE, fontWeight: 800 }}>This sounds like a {suggestedDef.label} screen.</span>
                  <span style={{ color: "#aaa" }}> Want to switch?</span>
                </div>
                <button onClick={() => switchType(suggestion)}
                  style={{ background: ORANGE, border: "none", color: "#000", borderRadius: 5, padding: "5px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>
                  Switch
                </button>
                <button onClick={() => { setDismissedSuggestion(suggestion); setSuggestion(null); }}
                  style={{ background: "transparent", border: "none", color: "#666", cursor: "pointer", padding: 4 }}>
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Progress bar */}
            <div style={{ height: 3, background: "#1a1a1a", flexShrink: 0 }}>
              <div style={{ width: `${(progress / total) * 100}%`, height: "100%", background: ORANGE, transition: "width 0.2s" }} />
            </div>

            {/* Chat history */}
            <div ref={historyRef} style={{ flex: 1, overflowY: "auto", padding: "20px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
              {history.map((entry, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: 13, color: "#555", lineHeight: 1.3 }}>{entry.question}</div>
                  <div style={{ fontSize: 16, color: "#ddd", fontWeight: 700, lineHeight: 1.4, borderLeft: `3px solid ${ORANGE}`, paddingLeft: 10 }}>
                    {entry.answer || <span style={{ color: "#555", fontStyle: "italic" }}>skipped</span>}
                  </div>
                </div>
              ))}

              {/* Current question */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: history.length > 0 ? 8 : 0 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.3, marginBottom: 4 }}>{node.question}</div>
                  {node.subtext && <div style={{ fontSize: 14, color: "#777", lineHeight: 1.4 }}>{node.subtext}</div>}
                </div>

                {node.type === "choice" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {node.choices?.map(c => (
                      <button key={c.value} onClick={() => { setInput(c.label); setTimeout(() => { setInput(c.label); const synth = { ...data, [node.key]: c.value }; setData(synth); const newH = [...history, { nodeId: node.id, question: node.question, answer: c.label }]; setHistory(newH); setInput(""); const detected = screenType ? detectSuggestion(synth, screenType) : null; if (detected && detected !== dismissedSuggestion) setSuggestion(detected); const nextId = typeof node.next === "function" ? node.next(c.value, synth) : node.next; if (nextId === null) setStage("result"); else setCurrentNodeId(nextId); }, 0); }}
                        style={{ background: "#1d1d1d", border: "1px solid #333", borderRadius: 8, padding: "12px 16px", textAlign: "left", color: "#fff", fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, transition: "border-color 0.1s" }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = ORANGE)}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = "#333")}
                      >
                        <ArrowRight size={14} color={ORANGE} style={{ flexShrink: 0 }} />
                        {c.label}
                      </button>
                    ))}
                  </div>
                ) : node.type === "textarea" ? (
                  <textarea
                    ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder={node.subtext || "Type your answer…"}
                    rows={5}
                    onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitAnswer(); }}
                    style={{ background: "#1d1d1d", border: "1px solid #333", borderRadius: 8, padding: 14, color: "#fff", fontSize: 15, fontFamily: "Arial, sans-serif", resize: "vertical", outline: "none" }}
                    onFocus={e => (e.target.style.borderColor = ORANGE)}
                    onBlur={e => (e.target.style.borderColor = "#333")}
                  />
                ) : (
                  <input
                    ref={inputRef as React.RefObject<HTMLInputElement>}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder={node.subtext || "Type your answer…"}
                    onKeyDown={e => e.key === "Enter" && submitAnswer()}
                    style={{ background: "#1d1d1d", border: "1px solid #333", borderRadius: 8, padding: 14, color: "#fff", fontSize: 15, fontFamily: "Arial, sans-serif", outline: "none" }}
                    onFocus={e => (e.target.style.borderColor = ORANGE)}
                    onBlur={e => (e.target.style.borderColor = "#333")}
                  />
                )}

                {node.type !== "choice" && (
                  <div style={{ color: "#555", fontSize: 12 }}>
                    {node.type === "textarea" ? "⌘ Enter to continue" : "Enter to continue"}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom nav */}
            {node.type !== "choice" && (
              <div style={{ borderTop: "1px solid #2a2a2a", padding: "16px 28px", display: "flex", gap: 10, flexShrink: 0 }}>
                <button onClick={goBack}
                  style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "1px solid #444", color: "#ccc", borderRadius: 8, padding: "11px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                  <ChevronLeft size={16} /> Back
                </button>
                <button onClick={submitAnswer}
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: ORANGE, border: "none", color: "#0a0a0a", borderRadius: 8, padding: "11px 18px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                  {node.next === null ? "Build Screen" : "Continue"} <ChevronRight size={16} />
                </button>
              </div>
            )}
            {node.type !== "choice" && (
              <div style={{ padding: "0 28px 12px", display: "flex", justifyContent: "center" }}>
                <button onClick={() => { setInput(""); submitAnswer(); }}
                  style={{ background: "transparent", border: "none", color: "#444", fontSize: 12, cursor: "pointer" }}>
                  Skip this question
                </button>
              </div>
            )}
          </div>

          {/* Right: live preview */}
          <div style={{ flex: 1, background: "#111", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            <div style={{ transform: "scale(0.44)", transformOrigin: "center" }}>
              <Renderer data={screenData} />
            </div>
          </div>
        </div>
      )}

      {/* Result stage */}
      {stage === "result" && Renderer && screenData && (
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <div style={{ width: 360, flexShrink: 0, borderRight: "1px solid #2a2a2a", padding: "28px 24px", overflowY: "auto" }}>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>Legal footer tags</div>
            <div style={{ color: "#999", fontSize: 13, marginBottom: 18 }}>Select the counts/statutes that apply to this screen.</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
              {FOOTER_PRESETS.map(tag => (
                <label key={tag} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 14 }}>
                  <input type="checkbox" checked={footerTags.includes(tag)} onChange={() => toggleFooterTag(tag)} style={{ accentColor: ORANGE, width: 16, height: 16 }} />
                  {tag}
                </label>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <input value={customTag} onChange={e => setCustomTag(e.target.value)} placeholder="Custom tag" onKeyDown={e => e.key === "Enter" && addCustomTag()}
                style={{ flex: 1, background: "#1d1d1d", border: "1px solid #333", borderRadius: 6, padding: "9px 10px", color: "#fff", fontSize: 13, outline: "none" }} />
              <button onClick={addCustomTag} style={{ background: "#2a2a2a", border: "1px solid #444", borderRadius: 6, padding: "0 12px", color: "#fff", cursor: "pointer" }}>
                <Plus size={16} />
              </button>
            </div>

            {footerTags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 24 }}>
                {footerTags.map(t => (
                  <span key={t} onClick={() => toggleFooterTag(t)}
                    style={{ background: "#d9711f22", border: `1px solid ${ORANGE}`, color: ORANGE, borderRadius: 4, padding: "4px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                    {t} <X size={11} />
                  </span>
                ))}
              </div>
            )}

            <button onClick={() => { setStage("convo"); setCurrentNodeId(history[history.length - 1]?.nodeId || "start"); }}
              style={{ width: "100%", background: "transparent", border: "1px solid #444", color: "#ccc", borderRadius: 8, padding: "12px", fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 10 }}>
              Edit Answers
            </button>

            <div style={{ marginTop: 16, padding: 14, background: "#1d1d1d", border: "1px solid #333", borderRadius: 8, color: "#999", fontSize: 13, lineHeight: 1.5 }}>
              <Camera size={16} color={ORANGE} style={{ marginBottom: 6 }} />
              <br />
              Screenshot the screen at right and trim to the orange border for a clean 1:1 capture.
            </div>
          </div>

          <div style={{ flex: 1, background: "#111", display: "flex", alignItems: "center", justifyContent: "center", overflow: "auto" }}>
            <div style={{ transform: "scale(0.6)", transformOrigin: "center" }}>
              <Renderer data={screenData} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

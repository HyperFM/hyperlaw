import { Block, DataMap, QNode, Screen, ScreenType } from "./types";

// ─── Question trees ───────────────────────────────────────────────────────────

export const TREES: Record<ScreenType, Record<string, QNode>> = {
  contradiction: {
    start: { id: "start", key: "_context", question: "What did you just notice or hear?", subtext: "Describe the moment — what caught your attention.", type: "textarea", next: "who" },
    who: { id: "who", key: "_person", question: "Who made this statement or claim?", subtext: "Name, title, or role.", type: "text", next: "source_type" },
    source_type: {
      id: "source_type", key: "_sourceType", question: "What type of evidence is this from?", type: "choice",
      choices: [{ label: "Bodycam footage", value: "bodycam" }, { label: "Police / agency report", value: "report" }, { label: "Verbal statement", value: "statement" }, { label: "Written document", value: "document" }, { label: "Other", value: "other" }],
      next: (a) => a === "bodycam" ? "bodycam_ts" : a === "report" ? "report_id" : "source_detail",
    },
    bodycam_ts: { id: "bodycam_ts", key: "_sourceTimestamp", question: "What timestamp on the footage?", type: "text", next: "exact_quote" },
    report_id: { id: "report_id", key: "_reportId", question: "Which report? Name or case number.", type: "text", next: "exact_quote" },
    source_detail: { id: "source_detail", key: "_sourceDetail", question: "Any identifying detail for this source?", type: "text", next: "exact_quote" },
    exact_quote: { id: "exact_quote", key: "statementA", question: "Exact words — what was said or documented?", subtext: "Use their actual language if available.", type: "textarea", next: "contra_type", evidenceTypes: ["bodycam", "report", "statement"] },
    contra_type: {
      id: "contra_type", key: "_contraType", question: "What evidence contradicts this?", type: "choice",
      choices: [{ label: "Bodycam footage", value: "bodycam" }, { label: "A report or record", value: "report" }, { label: "GPS / location data", value: "gps" }, { label: "Agency policy", value: "policy" }, { label: "Another person's statement", value: "statement" }, { label: "Physical evidence", value: "physical" }],
      next: (a) => a === "bodycam" ? "contra_bodycam_ts" : a === "report" ? "contra_report_id" : a === "policy" ? "contra_policy_name" : a === "statement" ? "contra_who" : "contra_detail",
    },
    contra_bodycam_ts: { id: "contra_bodycam_ts", key: "_contraTimestamp", question: "What timestamp shows the contradiction?", type: "text", next: "contra_detail" },
    contra_report_id: { id: "contra_report_id", key: "_contraReportId", question: "Which report contradicts it?", type: "text", next: "contra_detail" },
    contra_policy_name: { id: "contra_policy_name", key: "_contraPolicy", question: "Which policy or procedure?", type: "text", next: "contra_detail" },
    contra_who: { id: "contra_who", key: "_contraWho", question: "Who made the contradicting statement?", type: "text", next: "contra_detail" },
    contra_detail: { id: "contra_detail", key: "statementB", question: "What exactly does the contradicting evidence show or say?", subtext: "Precise language — this becomes Statement B.", type: "textarea", next: "why_conflict", evidenceTypes: ["bodycam", "report", "statement", "document"] },
    why_conflict: { id: "why_conflict", key: "whyConflict", question: "In one sharp sentence — why do these two things conflict?", type: "textarea", next: "proof" },
    proof: { id: "proof", key: "proof", question: "What's the hard proof that closes this argument?", subtext: "The fact that makes denial impossible.", type: "textarea", next: "legal" },
    legal: { id: "legal", key: "legalSignificance", question: "What does this contradiction mean legally?", type: "textarea", next: "headline" },
    headline: { id: "headline", key: "headline", question: "Give this a headline — the hook.", subtext: "A question or statement that grabs attention.", type: "text", next: "violation" },
    violation: { id: "violation", key: "violation", question: "What violation or issue does this fall under?", subtext: "e.g. Real-Time Fabrication, Prejudgment", type: "text", next: "screen_num" },
    screen_num: { id: "screen_num", key: "screenNumber", question: "Screen number?", subtext: "e.g. 01, 05, 12", type: "text", next: null },
  },

  quote: {
    start: { id: "start", key: "_context", question: "What quote caught your attention?", subtext: "Describe the moment — who was speaking, what were they responding to.", type: "textarea", next: "person" },
    person: { id: "person", key: "person", question: "Who said it?", type: "text", next: "quote_text" },
    quote_text: { id: "quote_text", key: "quote", question: "Exact words — what did they say?", type: "textarea", evidenceTypes: ["bodycam", "report", "statement"], next: "when" },
    when: { id: "when", key: "when", question: "When was this said, and what was the context?", subtext: "Before or after what happened? What did they already know?", type: "text", next: "lead_in_check" },
    lead_in_check: {
      id: "lead_in_check", key: "_hasLeadIn", question: "Was this quote a response to something specific?", type: "choice",
      choices: [{ label: "Yes — someone said something first", value: "yes" }, { label: "No — they said it unprompted", value: "no" }],
      next: (a) => a === "yes" ? "lead_in" : "facts",
    },
    lead_in: { id: "lead_in", key: "leadInQuote", question: "What was said right before? (exact words if possible)", type: "text", next: "facts" },
    facts: { id: "facts", key: "facts", question: "List the facts that make this quote hard to defend.", subtext: "One per line — each becomes a bullet on the screen.", type: "textarea", next: "significance" },
    significance: { id: "significance", key: "significance", question: "Why does this quote matter legally?", type: "textarea", next: "headline" },
    headline: { id: "headline", key: "headline", question: "Headline — the first hook.", subtext: "Usually the quote itself or a short setup.", type: "text", next: "subheadline_check" },
    subheadline_check: {
      id: "subheadline_check", key: "_hasSub", question: "Add a follow-up headline in orange?", type: "choice",
      choices: [{ label: "Yes — add the question it raises", value: "yes" }, { label: "No", value: "no" }],
      next: (a) => a === "yes" ? "subheadline" : "violation",
    },
    subheadline: { id: "subheadline", key: "subheadline", question: "What's the follow-up question this raises?", type: "text", next: "violation" },
    violation: { id: "violation", key: "violation", question: "What violation or issue does this fall under?", type: "text", next: "screen_num" },
    screen_num: { id: "screen_num", key: "screenNumber", question: "Screen number?", type: "text", next: null },
  },

  prior_incident: {
    start: { id: "start", key: "date", question: "When did the prior incident happen?", subtext: "Date + a short tag — e.g. May 7, 2026 • Same Safety Issue", type: "text", next: "label" },
    label: { id: "label", key: "label", question: "Eyebrow label for this screen?", subtext: "Default: PRIOR DOCUMENTED INCIDENT", type: "text", next: "headline" },
    headline: { id: "headline", key: "headline", question: "Headline — what's the argument in one sentence?", subtext: 'e.g. "This wasn\'t the first time."', type: "text", next: "points" },
    points: { id: "points", key: "points", question: "Describe what happened. One bullet per line.", subtext: "Each line becomes an icon bullet on the screen.", type: "textarea", next: "resolution" },
    resolution: { id: "resolution", key: "resolution", question: "How did the prior incident end?", subtext: "Who responded? Any reports? Any recordings preserved?", type: "textarea", next: "screen_num" },
    screen_num: { id: "screen_num", key: "screenNumber", question: "Screen number?", type: "text", next: null },
  },

  admission: {
    start: { id: "start", key: "_context", question: "What did they say that amounts to an admission?", subtext: "Describe what was said — even if you don't have the exact quote yet.", type: "textarea", next: "person" },
    person: { id: "person", key: "person", question: "Who made the admission?", subtext: "Name and role.", type: "text", next: "when" },
    when: { id: "when", key: "when", question: "When did they say it, and what was the setting?", subtext: "e.g. During investigation, June 3 — 3 days after the incident", type: "text", next: "exact_words" },
    exact_words: { id: "exact_words", key: "admissionQuote", question: "Exact words — what did they say?", subtext: "If not verbatim, describe as closely as possible.", type: "textarea", evidenceTypes: ["bodycam", "report", "statement"], next: "what_they_knew" },
    what_they_knew: { id: "what_they_knew", key: "whatTheyKnew", question: "What were they admitting knowledge of?", subtext: "What fact, event, or condition did this reveal they knew?", type: "textarea", next: "when_they_knew" },
    when_they_knew: { id: "when_they_knew", key: "whenTheyKnew", question: "When did they first know this — and how do you know?", type: "textarea", next: "legal" },
    legal: { id: "legal", key: "legalSignificance", question: "Why does this admission matter legally?", type: "textarea", next: "headline" },
    headline: { id: "headline", key: "headline", question: "Headline — the damaging takeaway.", subtext: 'e.g. "He Already Knew." or "They Had Notice."', type: "text", next: "violation" },
    violation: { id: "violation", key: "violation", question: "What violation or claim does this support?", type: "text", next: "screen_num" },
    screen_num: { id: "screen_num", key: "screenNumber", question: "Screen number?", type: "text", next: null },
  },

  policy_violation: {
    start: { id: "start", key: "policyName", question: "Which policy or procedure applies here?", subtext: "Name, section number, or description.", type: "text", next: "policy_says" },
    policy_says: { id: "policy_says", key: "policySays", question: "What does the policy require?", subtext: "Exact language if available, or a clear description.", type: "textarea", next: "what_happened" },
    what_happened: { id: "what_happened", key: "whatHappened", question: "What actually happened instead?", subtext: "Describe the violation — what they did or failed to do.", type: "textarea", next: "who_violated" },
    who_violated: { id: "who_violated", key: "person", question: "Who is responsible for following this policy?", type: "text", next: "evidence_detail" },
    evidence_detail: { id: "evidence_detail", key: "evidenceDetail", question: "What evidence proves the violation?", type: "textarea", evidenceTypes: ["bodycam", "report", "statement", "document"], next: "consequence" },
    consequence: { id: "consequence", key: "consequence", question: "What did this failure cause or enable?", type: "textarea", next: "legal" },
    legal: { id: "legal", key: "legalSignificance", question: "What's the legal significance?", type: "textarea", next: "headline" },
    headline: { id: "headline", key: "headline", question: "Headline — the violation in plain terms.", type: "text", next: "screen_num" },
    screen_num: { id: "screen_num", key: "screenNumber", question: "Screen number?", type: "text", next: null },
  },
};

// ─── Keyword detection ────────────────────────────────────────────────────────

export function detectSuggestion(data: DataMap, current: ScreenType): ScreenType | null {
  const text = Object.values(data).join(" ").toLowerCase();
  if (current !== "admission" && /already knew|was aware|had notice|knew about/.test(text)) return "admission";
  if (current !== "policy_violation" && /\bpolicy\b|procedure|protocol|required by|supposed to/.test(text)) return "policy_violation";
  if (current !== "prior_incident" && /\bprior\b|earlier|before this|weeks before|months before|same issue|not the first/.test(text)) return "prior_incident";
  if (current !== "quote" && /\bquote\b|exact words|he said|she said|they said/.test(text)) return "quote";
  return null;
}

// ─── Block generator ─────────────────────────────────────────────────────────

function uid() { return crypto.randomUUID(); }

function blk(type: Block["type"], data: Record<string, string>, flex?: number): Block {
  return { id: uid(), type, data, ...(flex !== undefined ? { flex } : {}) };
}

export function generateBlocks(type: ScreenType, raw: DataMap): Block[] {
  const blocks: Block[] = [];

  if (type === "contradiction") {
    const person = raw._person || "";
    let sourceA = person;
    if (raw._sourceType === "bodycam") sourceA = `${person}, bodycam ${raw._sourceTimestamp || ""}`.trim();
    else if (raw._sourceType === "report") sourceA = `${person}, ${raw._reportId || "report"}`;
    else if (raw._sourceDetail) sourceA = `${person} — ${raw._sourceDetail}`;

    let sourceB = "";
    if (raw._contraType === "bodycam") sourceB = `Bodycam${raw._contraTimestamp ? " " + raw._contraTimestamp : ""}`;
    else if (raw._contraType === "report") sourceB = raw._contraReportId || "Report";
    else if (raw._contraType === "gps") sourceB = "GPS / location data";
    else if (raw._contraType === "policy") sourceB = raw._contraPolicy || "Agency policy";
    else if (raw._contraType === "statement") sourceB = raw._contraWho || "Witness";
    else sourceB = "Physical evidence";

    if (person || raw.violation) blocks.push(blk("eyebrow", { person, violation: raw.violation || "" }));
    if (raw.headline) blocks.push(blk("headline", { text: raw.headline }));
    blocks.push(blk("divider", {}));
    if (raw.statementA || raw.statementB) blocks.push(blk("comparison", { labelA: "STATEMENT A", sourceA, contentA: raw.statementA || "", labelB: "STATEMENT B", sourceB, contentB: raw.statementB || "" }, 1));
    if (raw.whyConflict) blocks.push(blk("legal_box", { label: "WHY THIS CONFLICTS", content: raw.whyConflict }));
    if (raw.proof) blocks.push(blk("callout", { label: "PROOF", content: raw.proof }));
    if (raw.legalSignificance) blocks.push(blk("legal_box", { label: "LEGAL SIGNIFICANCE", content: raw.legalSignificance }));
  }

  if (type === "quote") {
    const person = raw.person || "";
    if (person || raw.violation) blocks.push(blk("eyebrow", { person, violation: raw.violation || "" }));
    if (raw.headline) blocks.push(blk("headline", { text: raw.headline, size: "42" }));
    if (raw.subheadline) blocks.push(blk("subheadline", { text: raw.subheadline, orange: "true" }));
    blocks.push(blk("divider", {}));
    if (raw._hasLeadIn === "yes" && raw.leadInQuote) blocks.push(blk("callout", { label: "PRIOR EXCHANGE", content: raw.leadInQuote }));
    if (raw.quote) blocks.push(blk("quote_card", { label: "QUOTE", source: raw.when || "", quote: raw.quote }));
    if (raw.facts) blocks.push(blk("fact_list", { items: raw.facts }, 1));
    if (raw.significance) blocks.push(blk("legal_box", { label: "WHY THIS MATTERS", content: raw.significance }));
  }

  if (type === "prior_incident") {
    blocks.push(blk("eyebrow", { person: raw.label || "PRIOR DOCUMENTED INCIDENT", violation: raw.date || "" }));
    if (raw.headline) blocks.push(blk("headline", { text: raw.headline, size: "48" }));
    blocks.push(blk("divider", {}));
    if (raw.points) blocks.push(blk("icon_bullets", { items: raw.points }, 1));
    if (raw.resolution) blocks.push(blk("callout", { label: "OUTCOME", content: raw.resolution }));
  }

  if (type === "admission") {
    const person = raw.person || "";
    if (person || raw.violation) blocks.push(blk("eyebrow", { person, violation: raw.violation || "" }));
    if (raw.headline) blocks.push(blk("headline", { text: raw.headline, size: "50" }));
    blocks.push(blk("divider", {}));
    if (raw.when) blocks.push(blk("subheadline", { text: raw.when, orange: "false" }));
    if (raw.admissionQuote) blocks.push(blk("quote_card", { label: "THE ADMISSION", source: raw.when || "", quote: raw.admissionQuote }));
    blocks.push(blk("divider", {}));
    if (raw.whatTheyKnew) blocks.push(blk("evidence_card", { label: "WHAT THEY ADMITTED KNOWING", source: "", content: raw.whatTheyKnew }));
    if (raw.whenTheyKnew) blocks.push(blk("evidence_card", { label: "WHEN THEY KNEW IT", source: "", content: raw.whenTheyKnew }));
    if (raw.legalSignificance) blocks.push(blk("legal_box", { label: "LEGAL SIGNIFICANCE", content: raw.legalSignificance }));
  }

  if (type === "policy_violation") {
    const person = raw.person || "";
    if (person) blocks.push(blk("eyebrow", { person, violation: "POLICY VIOLATION" }));
    if (raw.headline) blocks.push(blk("headline", { text: raw.headline, size: "44" }));
    if (raw.policyName) blocks.push(blk("subheadline", { text: raw.policyName, orange: "false" }));
    blocks.push(blk("divider", {}));
    if (raw.policySays || raw.whatHappened) blocks.push(blk("policy_row", { policyLabel: "POLICY REQUIRED", policyContent: raw.policySays || "", actualLabel: "WHAT ACTUALLY HAPPENED", actualContent: raw.whatHappened || "" }, 1));
    if (raw.evidenceDetail) blocks.push(blk("evidence_card", { label: "EVIDENCE OF VIOLATION", source: "", content: raw.evidenceDetail }));
    if (raw.consequence) blocks.push(blk("callout", { label: "CONSEQUENCE", content: raw.consequence }));
    if (raw.legalSignificance) blocks.push(blk("legal_box", { label: "LEGAL SIGNIFICANCE", content: raw.legalSignificance }));
  }

  return blocks;
}

export function buildScreen(type: ScreenType, raw: DataMap): Screen {
  return {
    id: crypto.randomUUID(),
    title: raw.headline || raw._context?.slice(0, 40) || "Untitled Screen",
    screenType: type,
    screenNumber: raw.screenNumber || "01",
    footerCitations: [],
    blocks: generateBlocks(type, raw),
    createdAt: Date.now(),
  };
}

// ─── New blank block factory ──────────────────────────────────────────────────

export function newBlock(type: Block["type"]): Block {
  const defaults: Record<Block["type"], Record<string, string>> = {
    eyebrow: { person: "Name / Role", violation: "" },
    headline: { text: "HEADLINE TEXT", size: "52" },
    subheadline: { text: "Subheadline text", orange: "false" },
    divider: {},
    quote_card: { label: "STATEMENT", source: "", quote: "Quote text here." },
    evidence_card: { label: "EVIDENCE", source: "", content: "Description of evidence." },
    comparison: { labelA: "STATEMENT A", sourceA: "", contentA: "", labelB: "STATEMENT B", sourceB: "", contentB: "" },
    fact_list: { items: "First fact\nSecond fact\nThird fact" },
    icon_bullets: { items: "First bullet\nSecond bullet\nThird bullet" },
    legal_box: { label: "LEGAL SIGNIFICANCE", content: "Legal meaning here." },
    callout: { label: "NOTE", content: "Callout content here." },
    policy_row: { policyLabel: "POLICY REQUIRED", policyContent: "", actualLabel: "WHAT HAPPENED", actualContent: "" },
    spacer: { height: "20" },
  };
  return { id: uid(), type, data: defaults[type] || {} };
}

import Anthropic from "@anthropic-ai/sdk";

// ── Shared types (mirrored on frontend via aiApi.ts) ─────────────────────────

export interface TutorInsight {
  type: "gap" | "key_point" | "question" | "notice";
  text: string;
}

export interface IndexCloud {
  id: string;
  label: string;
  category: "amendment" | "statute" | "evidence" | "party" | "violation" | "deadline" | "concept";
  description: string;
  facts?: string[];
  relatedItems?: string[];
  importance?: string;
}

export interface TutorAnalysis {
  overview: string;
  insights: TutorInsight[];
  guidingQuestions: string[];
  clouds?: IndexCloud[];
}

export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface DocumentIntakeAnalysis {
  title: string;
  summary: string;
  parties: Array<{ name: string; role: string; details?: string }>;
  timeline: Array<{ date: string; description: string; significance?: string }>;
  evidence: Array<{ description: string; type: string; strength?: string }>;
  legalIssues: string[];
  openQuestions: string[];
  notes?: string;
}

/** Case Memory — the structured source-of-truth built from a document + intake answers */
export interface CaseMemory {
  caseSummary: string;
  factPattern: string;
  parties: Array<{ name: string; role: string; details?: string }>;
  events: Array<{ date: string; description: string; significance?: string }>;
  evidence: Array<{ description: string; type: string; strength?: string }>;
  witnesses: Array<{ name: string; relevance?: string }>;
  agencies: Array<{ name: string; role?: string }>;
  claims: string[];
  locations: string[];
  openQuestions: string[];
  jurisdictionSuggestions: string[];
}

export interface CaseExtraction {
  plaintiff?: string | null;
  defendant?: string | null;
  court?: string | null;
  caseNumber?: string | null;
  filingDate?: string | null;
  claims: string[];
  deadlines: string[];
  importantNames: string[];
  evidenceReferences: string[];
  summary: string;
}

// ── Usage / cost metadata returned with every AI call ─────────────────────────

export const MODEL = "claude-sonnet-5";
// Pricing: $3/MTok input, $15/MTok output → expressed as micro-USD per token
const INPUT_MICRO_USD_PER_TOKEN = 3;
const OUTPUT_MICRO_USD_PER_TOKEN = 15;

export interface AiCallMeta {
  inputTokens: number;
  outputTokens: number;
  model: string;
  responseTimeMs: number;
  estimatedCostMicroUsd: number; // divide by 1_000_000 for dollars
}

export interface AiResult<T> {
  data: T;
  meta: AiCallMeta;
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are HyperLaw AI Assistant — an AI-powered legal self-help tool built specifically for pro se civil rights litigants. You help people organize legal information, understand procedures, draft documents, and prepare for legal matters. You are not a law firm, not an attorney, and you do not provide legal representation.

Your role:
- Help users ORGANIZE their legal information clearly
- Identify legal issues and rights that may apply based on what they describe
- Point out evidence they may have overlooked or need to preserve immediately
- Ask targeted questions that reveal legally important details
- Explain legal concepts in plain, accessible language
- Be specific to the actual content — never give generic, boilerplate advice

Language rules — ALWAYS follow:
- Begin responses with phrases like "Based on the information you've shared…", "From what you've described…", or "The details you've provided suggest…"
- Use "you may wish to consider", "this may suggest", "it's worth exploring" rather than absolute statements
- Never state or imply: "I am your lawyer", "You will win", "You should definitely sue", "You have no risk", "This guarantees success", or "We know better than attorneys"
- Never use outcome-predictive or strategy-directive language — this explicitly includes: "I recommend", "you should file", "you should sue", "this is a strong case", "you have a strong claim", "you will likely win", "file this", "do this", "your best move is", or any phrasing that directs a legal strategy or predicts a legal outcome
- Never imply an attorney-client relationship exists
- Do not create any impression of a relationship of trust or reliance regarding the accuracy or applicability of your output — the user is responsible for every legal decision
- For well-established procedural facts, be direct. For legal strategy or outcomes, use measured language
- When relevant, remind the user: "Laws and procedures vary by jurisdiction — verify these details with your local court rules or a licensed attorney in your area."
- End every analysis or substantive response with a one-sentence disclaimer noting that HyperLaw provides legal information and drafting assistance, not legal advice or representation

Tone: Direct, clear, empowering, respectful. Like a knowledgeable legal self-help resource — not a cautious institution, but not a guarantor of outcomes either.`;

// ── Retry helper ──────────────────────────────────────────────────────────────
// Retries Claude API calls on rate-limit (429) or server errors (5xx).
// Three attempts with exponential back-off; fails fast on all other errors.
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const status = (err as { status?: number }).status;
      // Only retry on explicit rate-limit (429) or server errors (5xx).
      // Fail fast on all other cases: client errors, undefined status (unexpected throws), etc.
      const isRetryable = status === 429 || (status !== undefined && status >= 500);
      if (!isRetryable) throw err;
      if (attempt < RETRY_DELAYS_MS.length) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
    }
  }
  throw lastError;
}

// ── AI Service ────────────────────────────────────────────────────────────────

export class AiService {
  private _client: Anthropic | null = null;

  isConfigured(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  private get client(): Anthropic {
    if (!this._client) {
      if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
      this._client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    return this._client;
  }

  resetClient(): void {
    this._client = null;
  }

  private buildMeta(usage: { input_tokens: number; output_tokens: number }, responseTimeMs: number): AiCallMeta {
    return {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      model: MODEL,
      responseTimeMs,
      estimatedCostMicroUsd:
        usage.input_tokens * INPUT_MICRO_USD_PER_TOKEN +
        usage.output_tokens * OUTPUT_MICRO_USD_PER_TOKEN,
    };
  }

  async analyzeIncident(
    incident: {
      title: string;
      description: string;
      category: string;
      dateOfEvent?: string;
      location?: string;
    },
    opts?: { libraryContext?: string },
  ): Promise<AiResult<TutorAnalysis>> {
    const libBlock = opts?.libraryContext
      ? `${opts.libraryContext}\n\n---\n\n`
      : "";
    const prompt = `${libBlock}Analyze this civil rights incident and return ONLY valid JSON (no markdown, no explanation):

Title: ${incident.title}
Category: ${incident.category}
Date: ${incident.dateOfEvent || "Not specified"}
Location: ${incident.location || "Not specified"}
Description:
${incident.description}

Return JSON with this exact shape:
{
  "overview": "2-3 sentence overview of what happened and why it may be legally significant. Reference the specific facts described.",
  "insights": [
    { "type": "notice", "text": "specific legal right or protection that applies to this situation" },
    { "type": "key_point", "text": "most important legally relevant fact already documented in the description" },
    { "type": "gap", "text": "a specific factual detail that is missing, unclear, or not yet documented — something that would need to be established for any legal proceeding" }
  ],
  "guidingQuestions": [
    "Specific question about a detail that would strengthen or clarify the legal claim",
    "Question about evidence that needs to be preserved",
    "Question about witnesses or documentation",
    "Question about prior incidents or patterns",
    "Question about the outcome the person sought"
  ],
  "clouds": [
    {
      "id": "c1",
      "label": "Concept or entity name (e.g. Fourth Amendment, Officer Smith, Body Camera)",
      "category": "one of: amendment | statute | evidence | party | violation | deadline | concept",
      "description": "Plain-language explanation of what this is and how it applies to civil rights law",
      "facts": ["Specific fact from the described incident that connects to this concept", "Another specific supporting fact"],
      "relatedItems": ["Name or label of a related cloud concept"],
      "importance": "One sentence: why this specific concept matters in this specific case"
    }
  ]
}

Cloud guidelines:
- Generate 4-10 clouds covering the most important concepts in this incident
- Use all relevant categories: constitutional amendments implicated, specific statutes, named parties, key evidence items, alleged violations, any deadlines, and key legal concepts
- Every cloud must reference specific details from the described incident — no generic text
- category must be exactly one of: amendment, statute, evidence, party, violation, deadline, concept
- Return only the JSON object`;

    const start = Date.now();
    const response = await withRetry(() => this.client.messages.create({
      model: MODEL,
      max_tokens: 2500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }));

    return {
      data: this.parseJsonResponse<TutorAnalysis>(response),
      meta: this.buildMeta(response.usage, Date.now() - start),
    };
  }

  async analyzeCase(
    hlCase: { title: string; notes: string },
    incidents: Array<{ title: string; description: string; category: string; dateOfEvent?: string; location?: string }>,
    opts?: { libraryContext?: string },
  ): Promise<AiResult<TutorAnalysis>> {
    const libBlock = opts?.libraryContext
      ? `${opts.libraryContext}\n\n---\n\n`
      : "";
    const incidentText = incidents.map((inc, idx) =>
      `--- Incident ${idx + 1}: "${inc.title}" (${inc.category}${inc.dateOfEvent ? ", " + inc.dateOfEvent : ""}) ---\n${inc.description}`,
    ).join("\n\n");

    const prompt = `${libBlock}Analyze this civil rights case with ${incidents.length} incident(s) and return ONLY valid JSON:

Case Title: ${hlCase.title}
Case Notes: ${hlCase.notes || "None"}

${incidentText}

Return JSON with this exact shape:
{
  "overview": "2-3 sentences covering the overall pattern of the case, what connects the incidents, and the combined legal significance.",
  "insights": [
    { "type": "gap", "text": "a factual detail or piece of documentation that is missing or unclear across these incidents — something undocumented, ambiguous, or not yet preserved" },
    { "type": "notice", "text": "most important combined legal issue across the incidents" },
    { "type": "key_point", "text": "the most significant legally relevant fact that is already documented across these incidents" },
    { "type": "gap", "text": "another documentation gap — a specific item of evidence, date, name, or record that has not yet been captured in any of the incident descriptions" }
  ],
  "guidingQuestions": [
    "Strategic question about building the combined case",
    "Question about establishing pattern or intent across incidents",
    "Question about the relationship between incidents and defendants",
    "Question about documenting the cumulative harm",
    "Question about the overall timeline and how it reads to a fact-finder"
  ],
  "clouds": [
    {
      "id": "c1",
      "label": "Concept or entity name (e.g. Fourth Amendment, Officer Smith, Pattern of Conduct)",
      "category": "one of: amendment | statute | evidence | party | violation | deadline | concept",
      "description": "Plain-language explanation of what this is and how it applies to civil rights law",
      "facts": ["Specific fact from the described incidents that connects to this concept", "Another supporting fact"],
      "relatedItems": ["Name or label of a related cloud concept"],
      "importance": "One sentence: why this specific concept matters in this specific case"
    }
  ]
}

Cloud guidelines:
- Generate 5-12 clouds covering the most important concepts across all incidents in this case
- Use all relevant categories: constitutional amendments implicated, specific statutes, named parties, key evidence items, alleged violations, any deadlines, and key legal concepts
- Every cloud must reference specific details from the described incidents — no generic text
- Prioritize concepts that span multiple incidents (patterns, recurring parties, repeated violations)
- category must be exactly one of: amendment, statute, evidence, party, violation, deadline, concept
- Return only the JSON object`;

    const start = Date.now();
    const response = await withRetry(() => this.client.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }));

    return {
      data: this.parseJsonResponse<TutorAnalysis>(response),
      meta: this.buildMeta(response.usage, Date.now() - start),
    };
  }

  async chat(
    message: string,
    context: {
      incident?: { title: string; description: string; category: string } | null;
      hlCase?: { title: string; notes: string } | null;
      incidents?: Array<{ title: string; description: string; category: string }>;
      // Structured case data from uploaded documents — avoids re-sending raw text
      caseContext?: {
        plaintiff?: string | null;
        defendant?: string | null;
        claims?: string[];
        summary?: string;
      } | null;
      history: AiChatMessage[];
    },
  ): Promise<AiResult<string>> {
    let contextBlock = "";
    if (context.incident) {
      contextBlock = `\n\nContext — Current Incident:\nTitle: ${context.incident.title}\nCategory: ${context.incident.category}\n${context.incident.description}`;
    } else if (context.hlCase) {
      // Prefer structured extraction over raw incident text when available
      if (context.caseContext) {
        const cc = context.caseContext;
        contextBlock = `\n\nContext — Current Case: ${context.hlCase.title}
Plaintiff: ${cc.plaintiff ?? "unknown"}
Defendant: ${cc.defendant ?? "unknown"}
Claims: ${(cc.claims ?? []).join(", ") || "none identified"}
Summary: ${cc.summary ?? "none"}`;
      } else {
        const incList = (context.incidents || [])
          .map((i, n) => `${n + 1}. "${i.title}" (${i.category}): ${i.description.slice(0, 300)}`)
          .join("\n");
        contextBlock = `\n\nContext — Current Case: ${context.hlCase.title}\nIncidents:\n${incList}`;
      }
    }

    const messages: Anthropic.MessageParam[] = [
      ...context.history.slice(-12).map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: message },
    ];

    const start = Date.now();
    const response = await withRetry(() => this.client.messages.create({
      model: MODEL,
      max_tokens: 800,
      system: SYSTEM_PROMPT + contextBlock,
      messages,
    }));

    const text = this.firstText(
      response,
      "I couldn't generate a response. Please try again.",
    );

    return {
      data: text,
      meta: this.buildMeta(response.usage, Date.now() - start),
    };
  }

  async extractFromDocument(text: string): Promise<AiResult<CaseExtraction>> {
    const prompt = `Extract legal case information from this document. Return ONLY valid JSON.

Document:
${text.slice(0, 10000)}

Return JSON with this exact shape:
{
  "plaintiff": "plaintiff name(s) or null if not found",
  "defendant": "defendant name(s) or null if not found",
  "court": "court name or null if not found",
  "caseNumber": "case number or null if not found",
  "filingDate": "filing date or null if not found",
  "claims": ["legal claim or cause of action"],
  "deadlines": ["deadline description with date if present"],
  "importantNames": ["name of judge, attorney, witness, or other key person"],
  "evidenceReferences": ["document, exhibit, or piece of evidence mentioned"],
  "summary": "2-3 sentence plain-language summary of what this document is and what it establishes"
}

Use null for missing string fields, [] for missing arrays. Return only the JSON.`;

    const start = Date.now();
    const response = await withRetry(() => this.client.messages.create({
      model: MODEL,
      max_tokens: 1000,
      system: "You are a precise legal document parser. Extract structured information accurately from legal documents.",
      messages: [{ role: "user", content: prompt }],
    }));

    return {
      data: this.parseJsonResponse<CaseExtraction>(response),
      meta: this.buildMeta(response.usage, Date.now() - start),
    };
  }

  async ocrImage(buffer: Buffer, mimeType: string): Promise<AiResult<string>> {
    const base64 = buffer.toString("base64");
    const mediaType = mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

    const start = Date.now();
    const response = await withRetry(() => this.client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          {
            type: "text",
            text: "This is a legal document or scan. Extract all text exactly as it appears, preserving structure and formatting. Return only the extracted text.",
          },
        ],
      }],
    }));

    const text = this.firstText(response);
    return {
      data: text,
      meta: this.buildMeta(response.usage, Date.now() - start),
    };
  }

  /**
   * Generate a formal legal document (complaint, motion, or timeline).
   * Returns the full document text — NOT JSON.
   */
  async generateLegalDocument(
    documentType: 'complaint' | 'motion' | 'timeline',
    caseData: {
      title: string;
      notes?: string;
      plaintiff?: string;
      defendant?: string;
      court?: string;
      caseNumber?: string;
      jurisdiction?: string;
      incidents?: Array<{
        title: string;
        description: string;
        category: string;
        dateOfEvent?: string;
        location?: string;
      }>;
    },
    opts?: { libraryContext?: string },
  ): Promise<AiResult<string>> {
    const libBlock = opts?.libraryContext ? `${opts.libraryContext}\n\n---\n\n` : '';
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const incidentBlock = (caseData.incidents ?? [])
      .map((inc, i) =>
        `Incident ${i + 1}: "${inc.title}" — ${inc.category}` +
        (inc.dateOfEvent ? `, ${inc.dateOfEvent}` : '') +
        (inc.location ? ` at ${inc.location}` : '') +
        `\n${inc.description}`,
      )
      .join('\n\n');

    const header = `Case: ${caseData.title}
Plaintiff: ${caseData.plaintiff ?? '[PLAINTIFF NAME]'}
Defendant: ${caseData.defendant ?? '[DEFENDANT NAME]'}
Court: ${caseData.court ?? '[COURT NAME]'}
Case Number: ${caseData.caseNumber ?? '[CASE NUMBER]'}
Jurisdiction: ${caseData.jurisdiction ?? 'Federal / State'}
Date: ${today}`;

    let prompt = '';

    if (documentType === 'complaint') {
      prompt = `${libBlock}You are a civil rights legal document drafter. Draft a formal pro se civil rights complaint letter based on the case information below.

${header}

Case Notes: ${caseData.notes || 'None'}

${incidentBlock ? `Incidents:\n${incidentBlock}` : ''}

Format the complaint with these sections:
1. INTRODUCTION (1 paragraph — who the plaintiff is, who the defendant is, what this complaint is about)
2. PARTIES (identify plaintiff and defendant with available details)
3. JURISDICTION AND VENUE (explain why this court/body has jurisdiction)
4. STATEMENT OF FACTS (numbered paragraphs, each covering a distinct factual allegation drawn directly from the incidents described)
5. LEGAL CLAIMS / CAUSES OF ACTION (identify the specific rights allegedly violated — e.g., 42 U.S.C. § 1983, Title VII, ADA, 4th/14th Amendment, etc. — based on the incident categories)
6. RELIEF REQUESTED (list specific remedies: injunctive relief, compensatory damages, declaratory relief, attorney fees where applicable)
7. CERTIFICATION / SIGNATURE BLOCK (pro se self-representation statement)

Important rules:
- Use formal, professional legal language
- Fill in real content from the case data — no generic placeholders for the facts
- Where specific information is missing (case number, court), use bracketed placeholders like [COURT NAME]
- Do not add a disclaimer at the end
- Return only the document text, no meta-commentary`;
    } else if (documentType === 'motion') {
      prompt = `${libBlock}You are a civil rights legal document drafter. Draft a formal pro se motion document based on the case information below.

${header}

Case Notes: ${caseData.notes || 'None'}

${incidentBlock ? `Incidents:\n${incidentBlock}` : ''}

Draft a Motion for Preliminary Relief (or appropriate motion based on the facts). Format with:
1. CAPTION (case name, court, case number)
2. NOTICE OF MOTION (brief statement of what the moving party requests)
3. INTRODUCTION (1-2 paragraphs)
4. STATEMENT OF FACTS (numbered paragraphs)
5. LEGAL ARGUMENT (with subsections for each legal ground; cite relevant statutes, constitutional provisions, or case law where applicable)
6. CONCLUSION AND RELIEF REQUESTED
7. CERTIFICATION / SIGNATURE BLOCK

Important rules:
- Use formal, professional legal language
- Base the motion content directly on the incidents and facts provided
- Where court or case info is missing, use bracketed placeholders
- Return only the document text`;
    } else {
      // timeline
      prompt = `${libBlock}You are a civil rights legal document drafter. Create a formal chronological incident timeline document based on the case information below.

${header}

Case Notes: ${caseData.notes || 'None'}

${incidentBlock ? `Incidents:\n${incidentBlock}` : ''}

Format the timeline document as follows:
1. HEADER (case name, parties, date prepared)
2. INTRODUCTION (1 paragraph describing the overall pattern and purpose of this timeline)
3. CHRONOLOGICAL INCIDENT LOG (each entry on its own line, formatted as:
   [DATE] — [LOCATION] — [INCIDENT TITLE]
   [Detailed description of what occurred, who was involved, what was said or done])
4. SUMMARY OF PATTERN (2-3 paragraphs analyzing the overall pattern, common threads, and legal significance)
5. EVIDENCE AND DOCUMENTATION NOTE (list what documentation should be gathered or preserved for each incident)
6. PREPARER STATEMENT

Important rules:
- Order entries chronologically, earliest first
- Extract and include every specific detail from the incident descriptions
- Where dates are not provided, note "Date TBD — [approximate period if inferable]"
- Return only the document text`;
    }

    const start = Date.now();
    const response = await withRetry(() => this.client.messages.create({
      model: MODEL,
      // 8000: full complaints/motions exceed 4000 output tokens and were silently
      // truncated (stop_reason=max_tokens), persisting an incomplete legal document.
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }));

    const text = this.firstText(response);
    return {
      data: text,
      meta: this.buildMeta(response.usage, Date.now() - start),
    };
  }

  // ── Timeline builder ──────────────────────────────────────────────────────────
  async buildTimeline(
    story: string,
  ): Promise<AiResult<Array<{ title: string; description: string }>>> {
    const prompt = `Parse this narrative into 3-8 discrete chronological events. Return ONLY a valid JSON array.

Narrative:
${story.slice(0, 8000)}

Return format (array only — no wrapper object, no extra text):
[
  { "title": "Brief event name (2-6 words)", "description": "1-2 sentences describing what happened" },
  ...
]

Rules:
- Order events chronologically as they appear in the narrative
- Each event should be a distinct action or turning point
- Use "title" for a short label and "description" for detail
- Return only the JSON array`;

    const start = Date.now();
    const response = await withRetry(() => this.client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: "You are a precise legal timeline parser. Extract discrete chronological events from personal narratives. Return only valid JSON.",
      messages: [{ role: "user", content: prompt }],
    }));

    const text = this.firstText(response, "[]");
    const events = this.parseJsonArray<{ title: string; description: string }>(text) ?? [];

    return {
      data: events,
      meta: this.buildMeta(response.usage, Date.now() - start),
    };
  }

  // ── Case Assembly ─────────────────────────────────────────────────────────────
  async assembleCase(input: {
    parties: Array<{ name: string; role: string; badge?: string }>;
    court: { name: string; level: string; state: string } | null;
    story: string;
    timeline: Array<{ title: string; description: string }>;
  }): Promise<AiResult<{
    organizedFacts: string;
    draftComplaint: string;
    potentialClaims: Array<{ claim: string; supportingFacts: string[]; missingFacts: string[] }>;
  }>> {
    const partiesBlock = input.parties.length
      ? input.parties.map(p => `- ${p.name} (${p.role}${p.badge ? `, Badge ${p.badge}` : ""})`).join("\n")
      : "No parties identified.";

    const courtBlock = input.court
      ? `${input.court.name}, ${input.court.state} (${input.court.level})`
      : "No court selected.";

    const timelineBlock = input.timeline.length
      ? input.timeline.map((e, i) => `${i + 1}. ${e.title}${e.description ? `: ${e.description}` : ""}`).join("\n")
      : "No timeline events.";

    const prompt = `You are a civil rights legal assistant. Analyze the following case information and return ONLY valid JSON.

CRITICAL RULES:
- NEVER invent, assume, or extrapolate any fact not explicitly stated in the input below.
- If information is missing, flag it under "missingFacts" — do not fill it in.
- Potential claims are AI suggestions only — label them as such. Do not assert any claim will succeed.
- Draft complaint must use ONLY facts from the input. Use [BRACKETED PLACEHOLDERS] for missing required fields.

== CASE INPUT ==

Parties:
${partiesBlock}

Court: ${courtBlock}

Narrative (user's own words — may contain nicknames already substituted with legal names):
${input.story.slice(0, 6000)}

Timeline Events:
${timelineBlock}

== INSTRUCTIONS ==

Return JSON with this exact shape:
{
  "organizedFacts": "A structured, objective restatement of the facts from the narrative and timeline. Use complete sentences. Reference parties by their full names. Do not add any facts not in the input. 2-4 paragraphs.",
  "draftComplaint": "A complete pro se civil rights complaint draft. Sections: INTRODUCTION, PARTIES, JURISDICTION AND VENUE, STATEMENT OF FACTS (numbered paragraphs), POTENTIAL CAUSES OF ACTION (labeled as AI-identified possibilities — not legal conclusions), RELIEF REQUESTED, CERTIFICATION. Use [PLACEHOLDER] for any missing required field. Return full complaint text as a single string.",
  "potentialClaims": [
    {
      "claim": "Specific legal basis (e.g. '42 U.S.C. § 1983 — Fourth Amendment Unlawful Seizure')",
      "supportingFacts": ["Exact quoted or paraphrased fact from input that supports this claim"],
      "missingFacts": ["Specific fact or evidence not present in input that would be needed to pursue this claim"]
    }
  ]
}

Include 2-5 potential claims. Each claim must have at least 1 supporting fact from the input and 1 missing fact (what would still need to be established). Return only the JSON object.`;

    const start = Date.now();
    const response = await withRetry(() => this.client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: "You are a precise civil rights legal document assistant. Return only valid JSON. Never invent facts.",
      messages: [{ role: "user", content: prompt }],
    }));

    return {
      data: this.parseJsonResponse(response),
      meta: this.buildMeta(response.usage, Date.now() - start),
    };
  }

  // ── Learning Index ────────────────────────────────────────────────────────────
  async buildLearning(input: {
    organizedFacts: string;
    potentialClaims: Array<{ claim: string; supportingFacts: string[] }>;
    court: { name: string; level: string; state: string } | null;
  }): Promise<AiResult<{
    authorities: Array<{ type: "statute" | "case" | "constitution"; citation: string; plainEnglish: string; relevance: string }>;
  }>> {
    const claimsBlock = input.potentialClaims.length
      ? input.potentialClaims.map(c => `- ${c.claim}`).join("\n")
      : "No specific claims identified.";

    const prompt = `You are a civil rights legal research assistant. Identify relevant legal authorities for this pro se civil rights case. Return ONLY valid JSON.

== CASE SUMMARY ==
${input.organizedFacts.slice(0, 3000)}

== POTENTIAL CLAIMS ==
${claimsBlock}

== COURT ==
${input.court ? `${input.court.name} (${input.court.level}, ${input.court.state})` : "Court not specified."}

== INSTRUCTIONS ==

Return 5-10 legal authorities most directly relevant to the facts and claims above. Include a mix of:
- Constitutional provisions implicated
- Federal statutes (e.g. 42 U.S.C. § 1983, § 1985, Title VII, ADA, etc.)
- Landmark or circuit-relevant case law

Return JSON:
{
  "authorities": [
    {
      "type": "statute" | "case" | "constitution",
      "citation": "Exact legal citation (e.g. '42 U.S.C. § 1983' or 'Monell v. Dept. of Social Services, 436 U.S. 658 (1978)')",
      "plainEnglish": "1-2 sentence plain-English explanation of what this law or case establishes",
      "relevance": "1 sentence specifically connecting this authority to the facts or claims in this case"
    }
  ]
}

Return only well-established authorities. Do not fabricate citations. Return only the JSON object.`;

    const start = Date.now();
    const response = await withRetry(() => this.client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: "You are a precise civil rights legal researcher. Return only valid JSON with accurate legal citations.",
      messages: [{ role: "user", content: prompt }],
    }));

    return {
      data: this.parseJsonResponse(response),
      meta: this.buildMeta(response.usage, Date.now() - start),
    };
  }

  // ── Builder Engine ────────────────────────────────────────────────────────
  // Extracts structured information from user dictation and generates an exhibit draft.

  async builderExtract(input: {
    timestamp: string;
    dictation: string;
    whyItMatters: string;
    exhibitNumber: number;
    caseTitle: string;
    parties: Array<{ firstName: string; lastName: string; type: string; nickname: string; agency?: string; title?: string }>;
    court: { name: string; level: string; state: string } | null;
  }): Promise<AiResult<{
    extraction: {
      directQuotations: string[]; timeline: string[]; contradictions: string[];
      importantActions: string[]; evidenceReferences: string[]; peopleInvolved: string[];
      policyReferences: string[]; statuteReferences: string[]; constitutionalReferences: string[];
      keyFactualObservations: string[]; supportingContext: string[]; followUpQuestions?: string[];
    };
    draft: {
      exhibitNumber: number; headline: string; supportingQuote: string;
      keyObservations: string[]; timelineContext: string; relevantParties: string[];
      evidenceReferences: string[]; legalAuthorities: string[]; whyItMatters: string;
    };
  }>> {
    const partiesText = input.parties.length
      ? input.parties.map(p => `${p.firstName} ${p.lastName} (${p.type}${p.agency ? `, ${p.agency}` : ""})`).join(", ")
      : "Not specified";

    const prompt = `You are HyperLaw's Builder Engine. Analyze this user dictation about a specific moment in a video recording and produce a structured exhibit.

=== CASE: ${input.caseTitle} ===
COURT: ${input.court ? `${input.court.name} (${input.court.level}, ${input.court.state})` : "Not specified"}
PARTIES: ${partiesText}
VIDEO TIMESTAMP: ${input.timestamp}
EXHIBIT NUMBER: ${input.exhibitNumber}

=== USER DICTATION ===
${input.dictation || "(No dictation provided — extract from context)"}

${input.whyItMatters ? `=== WHY THIS MOMENT MATTERS (user's words) ===\n${input.whyItMatters}` : ""}

=== INSTRUCTIONS ===

Return a single JSON object (no markdown, no code fences):
{
  "extraction": {
    "directQuotations": ["Exact words spoken or visible in the video at this moment"],
    "timeline": ["Chronological event at this timestamp"],
    "contradictions": ["Any contradiction between actions/statements and policy/law"],
    "importantActions": ["Significant physical action or decision made at this moment"],
    "evidenceReferences": ["Reference to physical evidence, document, or object visible/mentioned"],
    "peopleInvolved": ["Name or description of person active in this moment"],
    "policyReferences": ["Specific department policy, procedure, or rule implicated"],
    "statuteReferences": ["Specific statute or regulation implicated — only cite if clearly suggested by facts"],
    "constitutionalReferences": ["Constitutional provision implicated — only cite if clearly suggested by facts"],
    "keyFactualObservations": ["Objective factual observation from this moment"],
    "supportingContext": ["Background context that makes this moment significant"],
    "followUpQuestions": ["Critical question whose answer would strengthen this exhibit"]
  },
  "draft": {
    "exhibitNumber": ${input.exhibitNumber},
    "headline": "Short, factual headline (max 10 words) describing this moment without legal conclusions",
    "supportingQuote": "Most impactful direct quote or statement from this moment",
    "keyObservations": ["2-4 key factual observations for the exhibit"],
    "timelineContext": "One sentence placing this moment in the sequence of events",
    "relevantParties": ["Names of people directly involved at this timestamp"],
    "evidenceReferences": ["Evidence items visible or referenced at this moment"],
    "legalAuthorities": ["Statute or constitutional provision — only include if clearly implicated"],
    "whyItMatters": "${input.whyItMatters || "Summarize in one plain sentence why this moment may be significant, without asserting legal conclusions."}"
  }
}

CRITICAL RULES:
- Base EVERYTHING on the user's dictation and known case facts only. Do not fabricate events.
- Do NOT assert legal conclusions. Use factual language: "the user reports", "appears to show", "according to the dictation".
- Omit any field where the information is not clearly present — use empty arrays, not guesses.
- The headline must be factual and neutral, not argumentative.
- "whyItMatters" must be in plain language, not legal language.
Return only the JSON object.`;

    const start = Date.now();
    const response = await withRetry(() => this.client.messages.create({
      model: MODEL,
      max_tokens: 2500,
      system: "You are HyperLaw's Builder Engine. Extract structured exhibit information from user dictation. Return only valid JSON. Never fabricate facts or legal conclusions.",
      messages: [{ role: "user", content: prompt }],
    }));

    return {
      data: this.parseJsonResponse(response),
      meta: this.buildMeta(response.usage, Date.now() - start),
    };
  }

  // ── Jurisdiction Verify ────────────────────────────────────────────────────
  // Checks whether illustrative exhibit slides are generally permitted in a given court.

  async jurisdictionVerify(input: {
    state: string;
    county: string;
    courtName: string;
  }): Promise<AiResult<{ verdict: "permitted" | "limited" | "not_accepted"; explanation: string }>> {
    const location = [input.courtName, input.county, input.state].filter(Boolean).join(", ");

    const prompt = `You are a legal research assistant. Answer ONE focused question about illustrative evidence in a specific court.

COURT / JURISDICTION: ${location}

QUESTION: Are text-based illustrative exhibit slides generally permitted as illustrative aids in this court or jurisdiction? Provide a concise explanation and note any important limitations.

Return JSON only (no markdown):
{
  "verdict": "permitted" | "limited" | "not_accepted",
  "explanation": "2-3 sentences: general rule, any notable limitations, and one practical note for self-represented litigants"
}

Use:
- "permitted" if generally allowed with standard foundation requirements
- "limited" if allowed but with significant restrictions or case-by-case judicial discretion
- "not_accepted" if generally discouraged or prohibited in this court type

Be concise. Do not give legal advice. Return only the JSON object.`;

    const start = Date.now();
    const response = await withRetry(() => this.client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: "You are a legal research assistant. Answer only the question asked. Return only valid JSON.",
      messages: [{ role: "user", content: prompt }],
    }));

    return {
      data: this.parseJsonResponse(response),
      meta: this.buildMeta(response.usage, Date.now() - start),
    };
  }

  // ── Organization Engine ────────────────────────────────────────────────────
  // Produces the full structured case Index from all available case data.
  // Called automatically after assembly completes.

  async organizeCase(input: {
    title: string;
    parties: Array<{ firstName: string; lastName: string; type: string; nickname: string; agency?: string; title?: string }>;
    court: { name: string; level: string; state: string } | null;
    story: string;
    timeline: Array<{ title: string; description: string }>;
    assembly?: { organizedFacts: string; potentialClaims: Array<{ claim: string; supportingFacts: string[] }> } | null;
    evidence?: Array<{ type: string; label: string; notes: string }>;
    extractedDocs?: Array<{ fileName: string; summary: string; claims: string[]; deadlines: string[] }>;
  }): Promise<AiResult<{
    executiveSummary: string;
    clouds: IndexCloud[];
    keyFacts: string[];
    claims: string[];
    importantQuotes: Array<{ quote: string; context: string }>;
    gapQuestions: string[];
  }>> {
    const partiesBlock = input.parties.length
      ? input.parties.map(p => {
          const name = `${p.firstName} ${p.lastName}`;
          const role = p.type === "official" ? `${p.title ?? "Official"} at ${p.agency ?? "Agency"}` : "Civilian";
          return `- ${name} (nickname: "${p.nickname}", role: ${role})`;
        }).join("\n")
      : "No parties entered yet.";

    const timelineBlock = input.timeline.length
      ? input.timeline.map((e, i) => `${i + 1}. ${e.title}: ${e.description}`).join("\n")
      : "No timeline events.";

    const assemblyBlock = input.assembly
      ? `ORGANIZED FACTS:\n${input.assembly.organizedFacts}\n\nCLAIMS:\n${input.assembly.potentialClaims.map(c => `- ${c.claim}`).join("\n")}`
      : "Assembly not yet completed.";

    const evidenceBlock = input.evidence?.length
      ? input.evidence.map(e => `- [${e.type.toUpperCase()}] ${e.label}: ${e.notes}`).join("\n")
      : "No evidence logged.";

    const docsBlock = input.extractedDocs?.length
      ? input.extractedDocs.map(d => `FILE: ${d.fileName}\nSummary: ${d.summary}\nClaims: ${d.claims.join("; ")}\nDeadlines: ${d.deadlines.join("; ")}`).join("\n\n")
      : "No uploaded documents.";

    const prompt = `You are HyperLaw's Organization Engine. Analyze the case information below and produce a complete structured Index.

=== CASE TITLE ===
${input.title}

=== PARTIES ===
${partiesBlock}

=== COURT ===
${input.court ? `${input.court.name} (${input.court.level}, ${input.court.state})` : "Not specified"}

=== NARRATIVE ===
${input.story || "Not yet provided."}

=== TIMELINE ===
${timelineBlock}

=== ASSEMBLY RESULTS ===
${assemblyBlock}

=== EVIDENCE ===
${evidenceBlock}

=== UPLOADED DOCUMENTS ===
${docsBlock}

=== INSTRUCTIONS ===

Return a single JSON object (no markdown, no code fences):
{
  "executiveSummary": "2–3 sentences covering what happened, who was involved, and the core legal issues",
  "clouds": [
    {
      "id": "short-unique-slug",
      "label": "Short name (max 4 words)",
      "category": "amendment" | "statute" | "evidence" | "party" | "violation" | "deadline" | "concept",
      "description": "Plain-English explanation of this concept",
      "facts": ["Specific fact from THIS case supporting this concept"],
      "relatedItems": ["Label of a related person, evidence item, or concept"],
      "importance": "One sentence: why this matters specifically in THIS case"
    }
  ],
  "keyFacts": ["Key established fact from the case"],
  "claims": ["Potential legal claim or cause of action based only on the facts provided"],
  "importantQuotes": [{ "quote": "Exact text quoted from documents or narrative", "context": "Source and why it matters" }],
  "gapQuestions": ["Specific question whose answer could strengthen the legal case"]
}

Coverage rules for clouds (generate 8–20 total):
- Every named party → one "party" cloud
- Every constitutional amendment implicated → one "amendment" cloud (e.g. "Fourth Amendment", "Fourteenth Amendment")
- Every relevant federal statute → one "statute" cloud (e.g. "42 U.S.C. § 1983")
- Key evidence items → "evidence" clouds
- Each distinct legal violation → one "violation" cloud
- Any filing deadlines → "deadline" clouds
- Other legal concepts (qualified immunity, respondeat superior, etc.) → "concept" clouds

CRITICAL: Base everything ONLY on the provided case information. Do not fabricate facts or invent citations. Where information is unknown, omit that cloud or use [UNKNOWN] as a fact. Return only the JSON object.`;

    const start = Date.now();
    const response = await withRetry(() => this.client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: "You are HyperLaw's Organization Engine. You produce structured legal case Indexes. Return only valid JSON. Never fabricate facts or citations.",
      messages: [{ role: "user", content: prompt }],
    }));

    return {
      data: this.parseJsonResponse(response),
      meta: this.buildMeta(response.usage, Date.now() - start),
    };
  }

  // ── Gap Detection Engine ───────────────────────────────────────────────────
  // Identifies missing information and batches ALL follow-up questions in one response.

  async detectGaps(input: {
    title: string;
    parties: Array<{ firstName: string; lastName: string; type: string; nickname: string }>;
    court: { name: string; level: string; state: string } | null;
    story: string;
    timeline: Array<{ title: string; description: string }>;
    intakeChecklist: Array<{ key: string; completed: boolean; notes: string }>;
    evidence?: Array<{ type: string; label: string }>;
  }): Promise<AiResult<{ questions: string[]; urgentCategories: string[] }>> {
    const checklistSummary = input.intakeChecklist
      .map(item => `${item.key}: ${item.completed ? "✓ DONE" : "NOT DONE"}${item.notes ? ` (${item.notes})` : ""}`)
      .join("\n");

    const prompt = `You are HyperLaw's Gap Detection Engine.

Review this case information and identify ALL important missing information in one comprehensive batch.

=== CASE: ${input.title} ===

PARTIES: ${input.parties.map(p => `${p.firstName} ${p.lastName} (${p.type})`).join(", ") || "None"}
COURT: ${input.court ? `${input.court.name}, ${input.court.state}` : "Not selected"}
STORY LENGTH: ${input.story.length > 0 ? `${input.story.split(" ").length} words` : "Not provided"}
TIMELINE EVENTS: ${input.timeline.length}
EVIDENCE CHECKLIST:
${checklistSummary || "Not started"}
EVIDENCE LOGGED: ${input.evidence?.length ?? 0} items

Return JSON (no markdown):
{
  "questions": [
    "Specific question whose answer would materially strengthen the legal case"
  ],
  "urgentCategories": ["evidence", "deadlines", "witnesses", "medical", "documents"]
}

Rules:
- Ask ALL important questions at once — maximum 12 questions
- Focus on: missing evidence, witnesses, deadlines, medical records, official records, prior incidents
- Make questions specific to THIS case, not generic
- Do NOT ask about information already clearly provided
- Prioritize questions that could make or break the case
- Include at least one question about filing deadlines if applicable
Return only the JSON object.`;

    const start = Date.now();
    const response = await withRetry(() => this.client.messages.create({
      model: MODEL,
      max_tokens: 1000,
      system: "You are HyperLaw's Gap Detection Engine. Identify missing case information. Return only valid JSON.",
      messages: [{ role: "user", content: prompt }],
    }));

    return {
      data: this.parseJsonResponse(response),
      meta: this.buildMeta(response.usage, Date.now() - start),
    };
  }

  // Extract the first text block from a response. Some models intermittently
  // emit a leading `thinking` (or other non-text) block, so `content[0]` is not
  // guaranteed to be the text — scan for it instead of assuming index 0.
  private firstText(response: Anthropic.Message, fallback = ""): string {
    for (const block of response.content) {
      if (block.type === "text") return block.text;
    }
    return fallback;
  }

  private parseJsonResponse<T>(response: Anthropic.Message): T {
    const text = this.firstText(response);
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI returned invalid JSON format");
    return JSON.parse(jsonMatch[0]) as T;
  }

  // ── Deep document intake analysis ─────────────────────────────────────────
  async analyzeDocumentWithIntake(
    documentText: string,
    intakeAnswers: {
      docType: string;
      preparedBy: string;
      hasParties: string;
      hasDates: string;
      additionalContext: string;
    },
  ): Promise<AiResult<DocumentIntakeAnalysis>> {
    const prompt = `You are HyperLaw AI — a legal case management assistant helping a pro se litigant understand their uploaded document.

INTAKE ANSWERS PROVIDED BY USER:
- Document type: ${intakeAnswers.docType}
- Prepared by: ${intakeAnswers.preparedBy}
- Parties identified in document: ${intakeAnswers.hasParties}
- Dates/times/events present: ${intakeAnswers.hasDates}
- Additional context from user: ${intakeAnswers.additionalContext || "None provided"}

FULL DOCUMENT TEXT:
${documentText.slice(0, 15000)}

Analyze this document thoroughly using both its content and the intake answers above. Return ONLY valid JSON:

{
  "title": "Short descriptive case title based on document content (e.g. 'Smith v. City of Denver — Police Misconduct')",
  "summary": "3-4 sentence plain-language executive summary: what this document is, what it establishes, and why it matters to the case",
  "parties": [
    { "name": "Full name exactly as written", "role": "plaintiff|defendant|witness|judge|attorney|officer|other", "details": "position or relevant detail" }
  ],
  "timeline": [
    { "date": "Date or time reference as written in document", "description": "What happened — specific factual description", "significance": "Why this moment matters legally" }
  ],
  "evidence": [
    { "description": "What the evidence item is", "type": "document|photo|testimony|record|report|other", "strength": "strong|moderate|weak" }
  ],
  "legalIssues": ["Specific legal claim, violation, or cause of action identified"],
  "openQuestions": ["Important unanswered question about facts, law, or evidence raised by this document"],
  "notes": "Any additional observations — inconsistencies, red flags, or strategic considerations"
}

Rules:
- Extract only what is actually in the document or clearly implied. Do not fabricate.
- parties: include every named individual and organization
- timeline: include every date, deadline, or time reference
- legalIssues: name specific statutes, amendments, or legal theories where identifiable
- Return only the JSON object, no explanation`;

    const start = Date.now();
    const response = await withRetry(() => this.client.messages.create({
      model: MODEL,
      max_tokens: 2500,
      system: "You are HyperLaw AI, a precise legal document analyst. Extract structured information accurately. Never fabricate facts not present in the document.",
      messages: [{ role: "user", content: prompt }],
    }));

    return {
      data: this.parseJsonResponse<DocumentIntakeAnalysis>(response),
      meta: this.buildMeta(response.usage, Date.now() - start),
    };
  }

  /**
   * Build Case Memory — organizes a document into structured case data without drafting.
   * This is the primary analysis engine for the new intake flow.
   */
  async buildCaseMemory(
    documentText: string,
    intakeAnswers: {
      docType: string;
      preparedBy: string;
      hasParties: string;
      hasDates: string;
      additionalContext: string;
    },
  ): Promise<AiResult<CaseMemory>> {
    const prompt = `You are HyperLaw's case analysis engine.
Review the uploaded document and intake responses below.
Extract and organize all case information into structured case memory.

INTAKE ANSWERS PROVIDED BY USER:
- Document type: ${intakeAnswers.docType}
- Prepared by: ${intakeAnswers.preparedBy}
- Parties identified: ${intakeAnswers.hasParties}
- Dates/events present: ${intakeAnswers.hasDates}
- Additional context: ${intakeAnswers.additionalContext || "None provided"}

FULL DOCUMENT TEXT:
${documentText.slice(0, 15000)}

Return ONLY valid JSON. Do not draft a complaint. Do not explain your reasoning. Do not use markdown.

{
  "caseSummary": "3-4 sentence plain-language summary: what this document is, what it establishes, and why it matters legally",
  "factPattern": "Chronological narrative of the key facts — what happened, to whom, when, where, and how",
  "parties": [
    { "name": "Full name exactly as written", "role": "plaintiff|defendant|witness|judge|attorney|officer|agency|other", "details": "position, title, or relevant detail" }
  ],
  "events": [
    { "date": "Date or time reference as written in document", "description": "What happened — specific factual description", "significance": "Why this moment matters legally" }
  ],
  "evidence": [
    { "description": "What the evidence item is", "type": "document|photo|testimony|record|report|other", "strength": "strong|moderate|weak" }
  ],
  "witnesses": [
    { "name": "Witness full name", "relevance": "What they witnessed or can testify to" }
  ],
  "agencies": [
    { "name": "Agency or organization name", "role": "Their role in the matter" }
  ],
  "claims": ["Specific legal claim, statute, constitutional violation, or cause of action identified"],
  "locations": ["Specific location, address, or venue relevant to the case"],
  "openQuestions": ["Important unanswered factual or legal question raised by this document"],
  "jurisdictionSuggestions": ["Suggested court or jurisdiction based on the claims and parties"]
}

Extraction rules:
- Extract only what is actually in the document or clearly implied by it. Do not fabricate.
- parties: include every named individual and organization — be exhaustive
- events: include every date, deadline, or time reference found in the document
- claims: name specific statutes, amendments, or legal theories where identifiable
- Return only the JSON object — no explanation, no preamble, no markdown`;

    const start = Date.now();
    const response = await withRetry(() => this.client.messages.create({
      model: MODEL,
      // 8000: buildCaseMemory emits the full 10-field JSON schema; 3000 truncated
      // mid-array on large complaints (stop_reason=max_tokens) → JSON.parse failure.
      max_tokens: 8000,
      system: "You are HyperLaw's case analysis engine. Your sole job is to extract and organize factual and legal information from documents into structured JSON. Never fabricate. Never draft a complaint. Return only valid JSON.",
      messages: [{ role: "user", content: prompt }],
    }));

    return {
      data: this.parseJsonResponse<CaseMemory>(response),
      meta: this.buildMeta(response.usage, Date.now() - start),
    };
  }

  private parseJsonArray<T>(raw: string): T[] {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    // Try to find a JSON array in the response
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!arrMatch) return [];
    try {
      return JSON.parse(arrMatch[0]) as T[];
    } catch {
      return [];
    }
  }
}

export const aiService = new AiService();

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

// ── Document drafting specs ───────────────────────────────────────────────────
// The full set of documents the drafting system can produce. The four primary
// "Draft" buttons map to complaint / motion / discovery / judgment_summary; the
// remainder are reached via "More" or feature-specific flows (Strengthen,
// Defense, IFP). Frontend mirrors these keys in aiApi.ts.
export type DocumentType =
  | "complaint"
  | "motion"
  | "timeline"
  | "discovery"
  | "judgment_summary"
  | "strengthen"
  | "motion_summary_judgment"
  | "motion_compel_discovery"
  | "motion_dismiss"
  | "answer"
  | "opposition"
  | "declaration"
  | "demand_letter"
  | "defense_response"
  | "fee_waiver";

interface DocumentSpec {
  label: string;
  role: string;
  instructions: string;
  /** When true, generation requires a sourceDocument to work from. */
  needsSource?: boolean;
}

const DRAFTER_ROLE =
  "You are an experienced civil-litigation legal document drafter helping a self-represented (pro se) litigant. Draft a formal, court-ready document based strictly on the case information below.";

export const DOCUMENT_SPECS: Record<DocumentType, DocumentSpec> = {
  complaint: {
    label: "Complaint",
    role: DRAFTER_ROLE,
    instructions: `Draft a formal pro se complaint. Format with these sections:
1. CAPTION (court, parties, case number)
2. INTRODUCTION (who the plaintiff is, who the defendant is, what the complaint is about)
3. PARTIES
4. JURISDICTION AND VENUE
5. STATEMENT OF FACTS (numbered paragraphs, each a distinct allegation drawn from the incidents)
6. CAUSES OF ACTION (identify the specific rights allegedly violated — e.g., 42 U.S.C. § 1983, Title VII, ADA, 4th/14th Amendment — labeled as AI-identified possibilities)
7. RELIEF REQUESTED
8. CERTIFICATION / SIGNATURE BLOCK (pro se)`,
  },
  motion: {
    label: "Motion",
    role: DRAFTER_ROLE,
    instructions: `Draft the most appropriate motion based on the facts. Format with:
1. CAPTION
2. NOTICE OF MOTION (what is requested)
3. INTRODUCTION
4. STATEMENT OF FACTS (numbered)
5. LEGAL ARGUMENT (subsections per ground)
6. CONCLUSION AND RELIEF REQUESTED
7. CERTIFICATION / SIGNATURE BLOCK`,
  },
  timeline: {
    label: "Incident Timeline",
    role: "You are a civil-litigation drafter preparing a formal chronological incident timeline for a self-represented litigant.",
    instructions: `Format the timeline document:
1. HEADER (case name, parties, date prepared)
2. INTRODUCTION (overall pattern and purpose)
3. CHRONOLOGICAL INCIDENT LOG — each entry: [DATE] — [LOCATION] — [TITLE] followed by a detailed description
4. SUMMARY OF PATTERN
5. EVIDENCE AND DOCUMENTATION NOTE
6. PREPARER STATEMENT
Order entries earliest-first; where a date is unknown write "Date TBD".`,
  },
  discovery: {
    label: "Discovery Requests",
    role: DRAFTER_ROLE,
    instructions: `Draft a discovery request set tailored to the disputed facts and claims. Choose and include the appropriate instrument(s): INTERROGATORIES, REQUESTS FOR PRODUCTION OF DOCUMENTS, and/or REQUESTS FOR ADMISSION. Format each with: CAPTION; instrument title; DEFINITIONS AND INSTRUCTIONS; consecutively numbered requests, each grounded in a specific fact/claim and drafted to elicit admissible evidence; and a signature block. Prefer clear, single-subject requests.`,
  },
  judgment_summary: {
    label: "Judgment Summary",
    role: DRAFTER_ROLE,
    instructions: `Draft a Judgment Summary — a clear, structured summary of the case's current posture and the judgment sought. Sections:
1. CASE CAPTION
2. SUMMARY OF THE CASE
3. PROCEDURAL POSTURE
4. STATEMENT OF UNDISPUTED FACTS (numbered)
5. STATEMENT OF DISPUTED FACTS (numbered)
6. CLAIMS AND CURRENT STATUS
7. RELIEF / JUDGMENT SOUGHT
8. INDEX OF SUPPORTING EVIDENCE`,
  },
  strengthen: {
    label: "Strengthened Document",
    role: "You are a senior legal editor improving a self-represented litigant's existing document.",
    needsSource: true,
    instructions: `Revise and STRENGTHEN the source document above. Improve legal structure, clarity, persuasiveness, factual specificity, organization, and formatting. Do NOT invent new facts — preserve every factual assertion; where the document depends on facts not stated, insert [BRACKETED PLACEHOLDERS]. Tighten weak arguments, add appropriate section headings, and ensure conventional formatting. If the applicant answers describe what to strengthen, prioritize those. Return the complete improved document.`,
  },
  motion_summary_judgment: {
    label: "Motion for Summary Judgment",
    role: DRAFTER_ROLE,
    instructions: `Draft a Motion for Summary Judgment. Sections:
1. CAPTION
2. NOTICE OF MOTION AND MOTION
3. STATEMENT OF UNDISPUTED MATERIAL FACTS (numbered; append a [record citation] placeholder to each)
4. LEGAL STANDARD (summary-judgment standard — informational; note the governing rule may be Fed. R. Civ. P. 56 or a state analog and to confirm locally)
5. ARGUMENT (why there is no genuine dispute of material fact and the movant is entitled to judgment as a matter of law)
6. CONCLUSION AND RELIEF
7. REFERENCE TO SUPPORTING DECLARATION/EVIDENCE
8. CERTIFICATE OF SERVICE
Incorporate the applicant's upfront answers about whether discovery is complete and which facts are disputed.`,
  },
  motion_compel_discovery: {
    label: "Motion to Compel Discovery",
    role: DRAFTER_ROLE,
    instructions: `Draft a Motion to Compel Discovery. Sections:
1. CAPTION
2. INTRODUCTION
3. RELEVANT BACKGROUND (what was requested, when served, and the specific deficiency)
4. MEET-AND-CONFER CERTIFICATION (based on the applicant's answers about conferral efforts)
5. LEGAL STANDARD (informational; note rules vary by court)
6. ARGUMENT (relevance and proportionality of the requests; inadequacy of any responses)
7. CONCLUSION AND RELIEF (order compelling responses; fees/sanctions where appropriate)
8. CERTIFICATE OF SERVICE`,
  },
  motion_dismiss: {
    label: "Motion to Dismiss",
    role: DRAFTER_ROLE,
    instructions: `Draft a Motion to Dismiss. Sections: CAPTION; NOTICE OF MOTION; INTRODUCTION; STATEMENT OF RELEVANT ALLEGATIONS; LEGAL STANDARD (informational); ARGUMENT (each ground for dismissal as a separate subsection, grounded in the provided facts); CONCLUSION AND RELIEF; CERTIFICATE OF SERVICE.`,
  },
  answer: {
    label: "Answer to Complaint",
    role: DRAFTER_ROLE,
    needsSource: true,
    instructions: `Draft an ANSWER to the complaint in the source document above. For each numbered allegation, respond (ADMIT / DENY / LACK SUFFICIENT KNOWLEDGE) based ONLY on the provided facts; where the litigant's position on an allegation cannot be determined from the input, write "[ADMIT/DENY — CONFIRM]". Then include AFFIRMATIVE DEFENSES (as AI-identified possibilities to evaluate) and a PRAYER FOR RELIEF. Include CAPTION and SIGNATURE BLOCK.`,
  },
  opposition: {
    label: "Opposition / Response",
    role: DRAFTER_ROLE,
    needsSource: true,
    instructions: `Draft an OPPOSITION/RESPONSE to the motion in the source document above. Sections: CAPTION; INTRODUCTION; COUNTERSTATEMENT OF FACTS (numbered); ARGUMENT (respond to each ground raised by the moving party); CONCLUSION AND RELIEF; CERTIFICATE OF SERVICE.`,
  },
  declaration: {
    label: "Declaration",
    role: "You are drafting a sworn declaration in the first person for a self-represented litigant.",
    instructions: `Draft a DECLARATION/AFFIDAVIT in the first person by the declarant. Format: CAPTION; opening ("I, [NAME], declare as follows:"); consecutively numbered paragraphs stating ONLY facts within the declarant's personal knowledge drawn from the input; penalty-of-perjury closing ("I declare under penalty of perjury under the laws of [JURISDICTION] that the foregoing is true and correct."); date and signature line.`,
  },
  demand_letter: {
    label: "Demand Letter",
    role: "You are drafting a formal pre-litigation demand letter for a self-represented person.",
    instructions: `Draft a formal DEMAND LETTER. Include: sender/recipient blocks and date; a RE: line; a clear statement of the facts and the wrong; the specific demand and a reasonable deadline; the consequences of non-compliance stated factually (possible legal action) without threats; and a professional closing/signature.`,
  },
  defense_response: {
    label: "Response to Defense Filing",
    role: DRAFTER_ROLE,
    needsSource: true,
    instructions: `The source above summarizes a filing made by the opposing/defense party. Draft the appropriate RESPONSIVE document (opposition, reply, or responsive motion — choose based on what the defense filed). Sections: CAPTION; INTRODUCTION identifying the defense filing being responded to; RESPONSE TO EACH POINT raised by the defense (numbered); the litigant's own ARGUMENT and any counter-relief; CONCLUSION AND RELIEF; CERTIFICATE OF SERVICE.`,
  },
  fee_waiver: {
    label: "Application to Proceed In Forma Pauperis",
    role: "You are completing an Application to Proceed In Forma Pauperis (fee waiver) for a self-represented applicant.",
    instructions: `Using the applicant's answers above (and the template in the source document if provided), produce a COMPLETED, court-ready fee-waiver / in forma pauperis application. Fill every field the applicant answered; for any required field with no answer, insert a clearly marked [BLANK — TO COMPLETE]. Preserve any required disclaimer language present in the source template. Do NOT include a judge's order/ruling section or a notary block. End with the applicant signature and date line.`,
  },
};

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
      // No timeout was ever set here — the SDK's own default (several
      // minutes) applied, so one hung request could freeze an interactive
      // batch (e.g. Generate Screens) indefinitely with no error and no
      // progress, which is exactly "stuck at 3 of 15" with nothing moving.
      // Was 45s, but confirmed live that's tight enough to kill a real,
      // still-working generation call before it finishes — and a killed
      // call still gets billed for whatever the model already processed,
      // so a too-short timeout means paying for nothing. 90s still fails
      // well short of the SDK's multi-minute default.
      this._client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 90_000 });
    }
    return this._client;
  }

  resetClient(): void {
    this._client = null;
  }

  /** Public escape hatch for routes outside this service (exhibit.ts) that
   *  need a raw Claude call — gets the same retry-on-429/5xx behavior every
   *  method in this class already gets via withRetry, instead of reaching
   *  around the private client with an unsafe cast and no retry at all. */
  async createMessage(args: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
    return withRetry(() => this.client.messages.create(args));
  }

  /** Cache-aware cost estimate for a raw createMessage() response — plain
   *  buildMeta below assumes every input token is billed at the normal
   *  rate, which understates cost for a cache WRITE (~1.25x normal) and
   *  wildly overstates it for a cache READ (~0.1x normal). Exposed
   *  publicly (unlike buildMeta) for exhibit.ts, the one caller that
   *  actually uses prompt caching. */
  estimateCallCost(usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  }): { estimatedCostMicroUsd: number; cacheHit: boolean } {
    const cacheCreation = usage.cache_creation_input_tokens ?? 0;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    const estimatedCostMicroUsd = Math.round(
      usage.input_tokens * INPUT_MICRO_USD_PER_TOKEN +
      cacheCreation * INPUT_MICRO_USD_PER_TOKEN * 1.25 +
      cacheRead * INPUT_MICRO_USD_PER_TOKEN * 0.1 +
      usage.output_tokens * OUTPUT_MICRO_USD_PER_TOKEN
    );
    return { estimatedCostMicroUsd, cacheHit: cacheRead > 0 };
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
    documentType: DocumentType,
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
      // Authoritative structured facts extracted once during document analysis;
      // when present the draft is grounded in these instead of re-derived facts.
      caseMemory?: CaseMemory;
    },
    opts?: {
      libraryContext?: string;
      /** Structured answers gathered upfront (motion gates, IFP intake, etc.). Accepts a preformatted string or a key/value object. */
      draftContext?: string | Record<string, unknown>;
      /** Existing document to work from (Strengthen, Answer, Opposition, Defense response). */
      sourceDocument?: { title?: string; content: string };
    },
  ): Promise<AiResult<string>> {
    const libBlock = opts?.libraryContext ? `${opts.libraryContext}\n\n---\n\n` : '';
    const memoryBlock = caseData.caseMemory
      ? `\n\n=== EXTRACTED CASE MEMORY (authoritative — already analyzed from this case's documents; draft ONLY from these facts, do not invent beyond them) ===\n${JSON.stringify(caseData.caseMemory).slice(0, 6000)}`
      : '';
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
Date: ${today}${memoryBlock}`;

    const draftContextText = typeof opts?.draftContext === 'string'
      ? opts.draftContext.trim()
      : opts?.draftContext && Object.keys(opts.draftContext).length
        ? Object.entries(opts.draftContext).map(([k, v]) => `- ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n')
        : '';
    const draftContextBlock = draftContextText
      ? `\n\n=== APPLICANT-PROVIDED ANSWERS (use these to tailor the draft; do not contradict them) ===\n${draftContextText.slice(0, 4000)}`
      : '';
    const sourceBlock = opts?.sourceDocument?.content
      ? `\n\n=== SOURCE DOCUMENT (${opts.sourceDocument.title ?? 'provided document'}) — the material to work from ===\n${opts.sourceDocument.content.slice(0, 12000)}`
      : '';

    const RULES = `Important rules — follow strictly:
- Draft ONLY from the facts provided above. Never invent facts, dates, dollar amounts, names, agencies, quotations, or legal citations that are not supported by the input.
- Where a required detail is missing, insert a clearly marked [BRACKETED PLACEHOLDER] (e.g., [COURT NAME], [CASE NUMBER], [DATE]) rather than guessing.
- Present legal theories or claims as AI-identified possibilities for a self-represented filer to evaluate — never as established legal conclusions.
- Any procedural or jurisdictional statement is general informational context, not legal advice.
- Use formal, professional legal language and conventional court formatting.
- Return ONLY the finished document text — no preamble, no meta-commentary, no trailing disclaimer.`;

    const spec = DOCUMENT_SPECS[documentType] ?? DOCUMENT_SPECS.motion;
    const prompt = `${libBlock}${spec.role}

${header}

Case Notes: ${caseData.notes || 'None'}

${incidentBlock ? `Incidents:\n${incidentBlock}` : ''}${draftContextBlock}${sourceBlock}

${spec.instructions}

${RULES}`;

    const start = Date.now();
    const response = await withRetry(() => this.client.messages.create({
      model: MODEL,
      // 8000: full complaints/motions exceed 4000 output tokens and were silently
      // truncated (stop_reason=max_tokens), persisting an incomplete legal document.
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }));

    this.assertComplete(response);
    const text = this.firstText(response);
    return {
      data: text,
      meta: this.buildMeta(response.usage, Date.now() - start),
    };
  }

  /**
   * Procedural information (INFORMATIONAL only, not legal advice) for a given
   * document type and jurisdiction — shown to the user while gathering answers.
   */
  async proceduralInfo(
    documentType: DocumentType,
    jurisdiction: string,
  ): Promise<AiResult<{ title: string; notes: string[] }>> {
    const label = DOCUMENT_SPECS[documentType]?.label ?? String(documentType);
    const prompt = `You are HyperLaw's procedural information assistant. A self-represented (pro se) litigant is preparing to draft: "${label}".
Jurisdiction (as provided, may be informal): ${jurisdiction || 'Not specified'}.

Provide 4-7 concise, plain-language INFORMATIONAL notes about the general procedure for this type of filing in this jurisdiction — for example: what it typically requires, common prerequisites (e.g., meet-and-confer, discovery being complete), general timing/deadline concepts, where/how it is usually filed and served, and formatting expectations.

Strict rules:
- This is general legal information, NOT legal advice, and NOT a recommendation to file.
- If a specific rule number or deadline varies or you are unsure, say it varies by court and to check the local rules — do NOT fabricate specific rule numbers, deadlines, or case citations.
- Keep each note to 1-2 sentences.
Return ONLY valid JSON: { "title": string, "notes": string[] }`;
    const start = Date.now();
    const response = await withRetry(() => this.client.messages.create({
      model: MODEL,
      max_tokens: 900,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }));
    this.assertComplete(response);
    const data = this.parseJsonResponse<{ title: string; notes: string[] }>(response);
    return { data, meta: this.buildMeta(response.usage, Date.now() - start) };
  }

  /**
   * IFP form finder — uses Anthropic's server-side web_search tool to locate the
   * official in-forma-pauperis / fee-waiver form for a jurisdiction. Returns a
   * structured result; found=false tells the caller to fall back to the generic
   * Appendix A template. Never throws on missing data — degrades to found=false.
   */
  async ifpFindForm(
    jurisdiction: string,
    caseData: { court?: string; caseNumber?: string; plaintiff?: string; state?: string; county?: string },
  ): Promise<AiResult<{
    found: boolean;
    formName: string | null;
    sourceUrl: string | null;
    summary: string;
    fields: Array<{ key: string; label: string }>;
    instructions: string;
  }>> {
    const prompt = `A self-represented (pro se) litigant needs the official "in forma pauperis" (IFP) application to proceed without prepaying court fees (a fee-waiver form) for their court.

Jurisdiction / court (as provided): ${jurisdiction || caseData.court || 'Not specified'}
State: ${caseData.state ?? 'Not specified'}
County: ${caseData.county ?? 'Not specified'}

Use web search to find the CURRENT official fee-waiver / IFP form published by that court system (strongly prefer the official .gov / .us court website). Then return ONLY valid JSON as your final message (no other text) with this exact shape:
{
  "found": boolean,
  "formName": string | null,
  "sourceUrl": string | null,
  "summary": string,
  "fields": [ { "key": "short_snake_case", "label": "Human label" } ],
  "instructions": string
}
Rules:
- Only set found=true when you have located an actual official source URL. If you cannot, set found=false and leave formName/sourceUrl null.
- Never fabricate a form number or URL. This is general legal information, not legal advice.`;

    const start = Date.now();
    const response = await withRetry(() => this.client.messages.create({
      model: MODEL,
      max_tokens: 2500,
      system: SYSTEM_PROMPT,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }] as unknown as Anthropic.Tool[],
      messages: [{ role: "user", content: prompt }],
    }));

    // web_search emits several content blocks; the final answer is the last text block.
    const texts: string[] = [];
    for (const block of response.content) if (block.type === "text") texts.push(block.text);
    const cleaned = texts.join("\n").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const matches = cleaned.match(/\{[\s\S]*?\}(?=[^}]*$)/g) ?? cleaned.match(/\{[\s\S]*\}/g);
    let data: {
      found: boolean; formName: string | null; sourceUrl: string | null;
      summary: string; fields: Array<{ key: string; label: string }>; instructions: string;
    } | null = null;
    if (matches && matches.length) {
      try { data = JSON.parse(matches[matches.length - 1]); } catch { data = null; }
    }
    if (!data || typeof data !== "object") {
      data = { found: false, formName: null, sourceUrl: null, summary: "Could not locate an official form for this jurisdiction.", fields: [], instructions: "" };
    }
    return { data, meta: this.buildMeta(response.usage, Date.now() - start) };
  }

  /**
   * Courthouse locator — web-searches for real courthouse(s) serving a
   * location the user typed (works for locations anywhere, not just the
   * U.S.), for the jurisdiction search-by-location fallback when the app's
   * built-in federal/state court list doesn't have what they need. Never
   * fabricates a courthouse — degrades to an empty result list.
   */
  async findCourthouses(location: string): Promise<AiResult<{
    results: Array<{ name: string; level: string; note: string }>;
  }>> {
    const prompt = `A self-represented (pro se) litigant is trying to identify the correct courthouse(s) for their case, based on this location they typed: "${location}"

Use web search to find the actual court(s) with jurisdiction over that location — the local city/county trial court, the relevant state trial court, and/or the applicable U.S. federal district if the location is in the United States. For locations outside the U.S., find the equivalent local trial court for that country's system. Then return ONLY valid JSON as your final message (no other text) with this exact shape:
{
  "results": [ { "name": "Full official court name", "level": "state" | "federal" | "local" | "other", "note": "one short clarifying phrase, e.g. which county or city it covers" } ]
}
Rules:
- List at most 5 results, most locally relevant first.
- Only include real courts you found via search — never invent a courthouse name.
- If you can't find anything credible for this location, return an empty results array.`;

    const start = Date.now();
    const response = await withRetry(() => this.client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }] as unknown as Anthropic.Tool[],
      messages: [{ role: "user", content: prompt }],
    }));

    const texts: string[] = [];
    for (const block of response.content) if (block.type === "text") texts.push(block.text);
    const cleaned = texts.join("\n").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const matches = cleaned.match(/\{[\s\S]*?\}(?=[^}]*$)/g) ?? cleaned.match(/\{[\s\S]*\}/g);
    let data: { results: Array<{ name: string; level: string; note: string }> } | null = null;
    if (matches && matches.length) {
      try { data = JSON.parse(matches[matches.length - 1]); } catch { data = null; }
    }
    if (!data || typeof data !== "object" || !Array.isArray(data.results)) {
      data = { results: [] };
    }
    return { data, meta: this.buildMeta(response.usage, Date.now() - start) };
  }

  /**
   * Defense-filing analyzer — extracts the opposing party's identity and the
   * substance of what they filed, from document text and/or photo(s). Vision-
   * capable. Used to draft a responsive motion.
   */
  async defenseAnalyze(input: {
    sourceText?: string;
    images?: Array<{ mimeType: string; base64: string }>;
    caseTitle?: string;
  }): Promise<AiResult<{
    defendantName: string | null;
    defendantEmail: string | null;
    defendantAddress: string | null;
    filingType: string;
    substanceSummary: string;
    keyArguments: string[];
    factsDisputed: string[];
    suggestedResponse: { documentType: string; rationale: string };
    deadlinesMentioned: string[];
  }>> {
    const prompt = `The material below was filed or sent by the OPPOSING PARTY (the defense) in a civil matter${input.caseTitle ? ` (case: ${input.caseTitle})` : ""}. Analyze it and extract structured information so a self-represented plaintiff can respond.

${input.sourceText ? `DOCUMENT TEXT:\n${input.sourceText.slice(0, 14000)}` : "The document is provided as image(s) above."}

Return ONLY valid JSON:
{
  "defendantName": string | null,
  "defendantEmail": string | null,
  "defendantAddress": string | null,
  "filingType": string,
  "substanceSummary": string,
  "keyArguments": string[],
  "factsDisputed": string[],
  "suggestedResponse": { "documentType": "opposition|answer|motion|declaration|discovery|defense_response", "rationale": "why this is the appropriate responsive filing" },
  "deadlinesMentioned": string[]
}
Rules:
- Extract only what is present. Use null / empty arrays where information is absent. Never fabricate names, emails, addresses, or deadlines.
- This is general legal information, not legal advice.`;

    const imageBlocks = (input.images ?? []).map(img => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: img.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: img.base64,
      },
    }));

    const start = Date.now();
    const response = await withRetry(() => this.client.messages.create({
      model: MODEL,
      max_tokens: 2500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: [...imageBlocks, { type: "text" as const, text: prompt }] }],
    }));
    return {
      data: this.parseJsonResponse<{
        defendantName: string | null; defendantEmail: string | null; defendantAddress: string | null;
        filingType: string; substanceSummary: string; keyArguments: string[]; factsDisputed: string[];
        suggestedResponse: { documentType: string; rationale: string }; deadlinesMentioned: string[];
      }>(response),
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

    this.assertComplete(response);
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
      max_tokens: 8000,
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
    caseMemory?: CaseMemory;
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

    const memoryBlock = input.caseMemory
      ? JSON.stringify(input.caseMemory).slice(0, 6000)
      : "No analyzed Case Memory yet.";

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

=== EXTRACTED CASE MEMORY (authoritative — already analyzed from this case's documents; treat as ground truth and build the Index from this; do not re-derive or invent) ===
${memoryBlock}

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
      max_tokens: 8000,
      system: "You are HyperLaw's Organization Engine. You produce structured legal case Indexes. Return only valid JSON. Never fabricate facts or citations.",
      messages: [{ role: "user", content: prompt }],
    }));

    return {
      data: this.parseJsonResponse(response),
      meta: this.buildMeta(response.usage, Date.now() - start),
    };
  }

  // ── Video Organization Assistant ────────────────────────────────────────────
  // Suggests a presentation order for a Studio project's labeled video chunks —
  // not necessarily their original chronological order in the raw footage.

  async organizeVideoChunks(input: {
    chunks: Array<{ id: string; start: number; end: number; label: string; tag?: string }>;
    caseTitle?: string;
    parties?: Array<{ firstName: string; lastName: string; type: string }>;
    story?: string;
    claims?: string[];
  }): Promise<AiResult<{ order: string[]; reason: string }>> {
    const chunkIds = input.chunks.map(c => c.id);

    const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

    const chunksBlock = input.chunks
      .map((c, i) => `${i + 1}. id="${c.id}" [${fmt(c.start)}–${fmt(c.end)}] tag=${c.tag ?? "none"}: ${c.label || "(no label)"}`)
      .join("\n");

    const partiesBlock = input.parties?.length
      ? input.parties.map(p => `${p.firstName} ${p.lastName} (${p.type})`).join(", ")
      : "Not specified";

    const prompt = `You are HyperLaw's Video Organization Assistant. A user has marked and labeled specific moments ("chunks") from video evidence. Decide the most persuasive, clearest PRESENTATION ORDER for these moments as a video exhibit — not necessarily their original chronological order in the raw footage.

=== CASE CONTEXT ===
Case: ${input.caseTitle || "Not specified"}
Parties: ${partiesBlock}
Story: ${input.story || "Not provided"}
Known claims: ${input.claims?.length ? input.claims.join("; ") : "Not yet determined"}

=== CHUNKS (numbered in original video order; use the "id" values in your answer) ===
${chunksBlock}

=== INSTRUCTIONS ===
- Contrasting or contradicting moments should sit next to each other so the juxtaposition is obvious (e.g. a moment showing a stated policy immediately followed by a moment showing it being violated).
- Escalation-tagged moments should generally build toward the strongest one.
- Consistent/reinforcing moments that support the same point should be grouped together — and when there's a clearly credibility-establishing or good-faith "consistency" moment, prefer opening with it, so the audience trusts the narrator before anything contested is shown.
- "no_cause" moments (an official gave a non-answer or circular justification instead of an actual reason) are almost always MORE persuasive clustered back-to-back than scattered — even if they happened at very different points in the raw footage. Seeing five separate instances of "asked for a reason, got a non-answer" in a row makes the pattern undeniable; seeing them scattered among other moments lets each one read as an isolated, forgivable incident. Actively look for this pattern across all no_cause-tagged chunks and group them together unless doing so would break a stronger contradiction/escalation pairing.
- Use the case context to judge what matters, but base the order only on the chunks listed above — never invent a moment that isn't in the list.

Return ONLY this JSON, nothing else:
{ "order": ["<chunk id>", "<chunk id>", ...], "reason": "One or two sentences explaining the ordering choices a lay person would understand — call out specifically if/why any moments were grouped together." }

The "order" array must contain every chunk id listed above exactly once — no fewer, no more, no duplicates, no invented ids.`;

    const start = Date.now();
    const response = await withRetry(() => this.client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: "You are HyperLaw's Video Organization Assistant. Return only valid JSON. Never invent chunks that weren't provided.",
      messages: [{ role: "user", content: prompt }],
    }));

    const parsed = this.parseJsonResponse<{ order?: unknown; reason?: unknown }>(response);
    const rawOrder = Array.isArray(parsed.order) ? parsed.order.filter((id): id is string => typeof id === "string") : [];
    const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : "";

    // Defensive repair: guarantee the returned order is exactly the input
    // chunk ids (no fewer, no more, no duplicates) regardless of what the
    // model actually returned, so callers never have to validate this
    // themselves.
    const validIds = new Set(chunkIds);
    const seen = new Set<string>();
    const cleanedOrder: string[] = [];
    for (const id of rawOrder) {
      if (validIds.has(id) && !seen.has(id)) { cleanedOrder.push(id); seen.add(id); }
    }
    for (const id of chunkIds) {
      if (!seen.has(id)) { cleanedOrder.push(id); seen.add(id); } // append anything the model dropped, in original order
    }

    return {
      data: { order: cleanedOrder, reason },
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

  // ── AI Decision Layer (draft readiness) ────────────────────────────────────
  // Reviews existing case data for a chosen drafting action and decides whether
  // to proceed, recommend a Guidance Session, or require one first.
  async draftReadiness(input: {
    documentLabel: string;
    documentType: string;
    caseTitle: string;
    caseContext: string;
  }): Promise<AiResult<{ decision: "ready" | "recommended" | "required"; rationale: string; topics: string[] }>> {
    const prompt = `You are HyperLaw's pre-draft reviewer. A self-represented (pro se) litigant wants to draft: "${input.documentLabel}".

Review the case information below and decide whether there is enough concrete, case-specific context to produce a strong draft, or whether a short Guidance Session (a friendly conversation that gathers missing context) should happen first.

=== CASE: ${input.caseTitle} ===
${(input.caseContext || "No case information recorded yet.").slice(0, 8000)}

Return ONLY valid JSON:
{
  "decision": "ready" | "recommended" | "required",
  "rationale": "1-2 warm, plain-language sentences explaining the decision to the user",
  "topics": ["Short label of a specific topic a guidance session should cover to strengthen THIS document"]
}

Decision rules:
- "ready": the case already contains specific facts, parties, dates, and context sufficient for this document. topics may be empty.
- "recommended": draftable now, but a few targeted questions would meaningfully improve the result. Provide 2-5 topics.
- "required": key information needed for this document type is missing (e.g. no facts, no opposing filing to respond to, no dates). Provide 2-6 topics.
- Base the decision ONLY on what is present below. Do not invent facts. This is procedural guidance, not legal advice.
Return only the JSON object.`;

    const start = Date.now();
    const response = await withRetry(() => this.client.messages.create({
      model: MODEL,
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }));
    return {
      data: this.parseJsonResponse(response),
      meta: this.buildMeta(response.usage, Date.now() - start),
    };
  }

  // ── Guidance Session chat turn ─────────────────────────────────────────────
  // A calm, conversational context-gatherer. Returns the assistant's next
  // message plus a `done` flag once it has gathered what it needs.
  async guidanceChat(input: {
    caseTitle: string;
    caseContext: string;
    topics: string[];
    documentLabel?: string;
    history: Array<{ role: "user" | "assistant"; content: string }>;
    userMessage?: string;
  }): Promise<AiResult<{ reply: string; done: boolean }>> {
    const topicsBlock = input.topics.length
      ? input.topics.map((t, i) => `${i + 1}. ${t}`).join("\n")
      : "General context that would strengthen the case.";

    const system = `You are HyperLaw's Guidance Assistant — a warm, calm, encouraging companion (represented by a friendly orange brain) that helps a self-represented (pro se) litigant talk through their case. You are NOT a lawyer: you never give legal advice, never predict outcomes, and never tell the user what they "should" legally do. You gather facts and context through natural conversation.

Style:
- Warm, plain-language, and human. ONE focused question at a time — never interrogate.
- Briefly acknowledge what the user just shared before asking the next thing.
- Never dump a list of questions. Keep each message short (1-3 sentences).
- Do not draft documents or cite statutes here — just understand their situation.
- When you have covered the important topics (or the user signals they're done or has nothing more to add), thank them warmly, give a one-sentence recap, and set done=true.

Every reply MUST be a single valid JSON object (no markdown, no code fences):
{ "reply": "your next conversational message to the user", "done": boolean }`;

    const contextPrimer = `=== CASE: ${input.caseTitle} ===
${(input.caseContext || "No case details recorded yet.").slice(0, 6000)}

=== ${input.documentLabel ? `PREPARING: ${input.documentLabel}\n` : ""}TOPICS TO EXPLORE (cover the important ones, then finish) ===
${topicsBlock}`;

    const messages: Anthropic.MessageParam[] = [];
    if (input.history.length === 0) {
      const opening = input.userMessage
        ? `${contextPrimer}\n\nThe user opened with: "${input.userMessage}"\n\nRespond warmly and ask your first gentle question. Return JSON.`
        : `${contextPrimer}\n\n(Start the session: greet the user warmly, acknowledge in one sentence what you can see about their case, then ask your first gentle question about the most important missing topic. Return JSON.)`;
      messages.push({ role: "user", content: opening });
    } else {
      messages.push({ role: "user", content: `${contextPrimer}\n\n(The guidance conversation so far follows. Reply with JSON for your next message only.)` });
      for (const m of input.history) messages.push({ role: m.role, content: m.content });
      if (input.userMessage) messages.push({ role: "user", content: input.userMessage });
    }

    const start = Date.now();
    const response = await withRetry(() => this.client.messages.create({
      model: MODEL,
      max_tokens: 800,
      system,
      messages,
    }));

    let data: { reply: string; done: boolean };
    try {
      data = this.parseJsonResponse<{ reply: string; done: boolean }>(response);
    } catch {
      // Model didn't return JSON — treat the raw text as the reply, keep going.
      data = { reply: this.firstText(response), done: false };
    }
    if (typeof data.reply !== "string" || !data.reply.trim()) {
      data.reply = "Thanks for sharing that. Is there anything else you think is important?";
    }
    data.done = data.done === true;
    return { data, meta: this.buildMeta(response.usage, Date.now() - start) };
  }

  // ── Guidance Session extraction ────────────────────────────────────────────
  // On completion, distill the transcript into structured answers to merge into
  // the case's memory so future analysis and drafts benefit.
  async extractGuidanceAnswers(input: {
    caseTitle: string;
    topics: string[];
    transcript: string;
  }): Promise<AiResult<{
    summary: string;
    newFacts: string[];
    parties: Array<{ name: string; role: string; details?: string }>;
    events: Array<{ date: string; description: string; significance?: string }>;
    evidence: Array<{ description: string; type: string; strength?: string }>;
    witnesses: Array<{ name: string; relevance?: string }>;
    claims: string[];
    locations: string[];
    resolvedQuestions: string[];
    openQuestions: string[];
  }>> {
    const prompt = `A self-represented litigant just completed a Guidance Session (a conversation) about their case "${input.caseTitle}". Distill everything they shared into structured case data. Extract ONLY what the user actually stated in the transcript — never infer or invent.

TOPICS THE SESSION AIMED TO COVER:
${input.topics.length ? input.topics.map(t => `- ${t}`).join("\n") : "- General context"}

TRANSCRIPT:
${input.transcript.slice(0, 14000)}

Return ONLY valid JSON:
{
  "summary": "2-3 sentence recap of what this session established",
  "newFacts": ["Specific new fact the user stated"],
  "parties": [{ "name": "", "role": "plaintiff|defendant|witness|officer|agency|attorney|other", "details": "" }],
  "events": [{ "date": "as stated", "description": "", "significance": "" }],
  "evidence": [{ "description": "", "type": "document|photo|testimony|record|report|other", "strength": "strong|moderate|weak" }],
  "witnesses": [{ "name": "", "relevance": "" }],
  "claims": ["Legal claim or issue the user described in plain terms"],
  "locations": ["Relevant place mentioned"],
  "resolvedQuestions": ["An open question this session answered"],
  "openQuestions": ["A question still unanswered after this session"]
}
Use empty arrays where nothing applies. Do not fabricate. Return only the JSON object.`;

    const start = Date.now();
    const response = await withRetry(() => this.client.messages.create({
      model: MODEL,
      max_tokens: 2500,
      system: "You extract structured case facts from a conversation transcript. Return only valid JSON. Never fabricate — extract only what the user stated.",
      messages: [{ role: "user", content: prompt }],
    }));
    return {
      data: this.parseJsonResponse(response),
      meta: this.buildMeta(response.usage, Date.now() - start),
    };
  }

  // Throw if the model stopped because it hit the token ceiling. A truncated
  // response yields invalid JSON or a half-written document; failing loudly is
  // far better than silently persisting or parsing partial output.
  private assertComplete(response: Anthropic.Message): void {
    if (response.stop_reason === "max_tokens") {
      throw new Error("AI response was cut off (stop_reason=max_tokens). Increase max_tokens for this call.");
    }
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
    this.assertComplete(response);
    const text = this.firstText(response);
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI returned invalid JSON format");
    return JSON.parse(jsonMatch[0]) as T;
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
${documentText.slice(0, 150000)}

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

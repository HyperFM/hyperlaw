import Anthropic from "@anthropic-ai/sdk";

// ── Shared types (mirrored on frontend via aiApi.ts) ─────────────────────────

export interface TutorInsight {
  type: "summary" | "key_point" | "question" | "notice";
  text: string;
}

export interface TutorAnalysis {
  overview: string;
  insights: TutorInsight[];
  guidingQuestions: string[];
}

export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
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

const MODEL = "claude-opus-4-5";
// Pricing: $15/MTok input, $75/MTok output → expressed as micro-USD per token
const INPUT_MICRO_USD_PER_TOKEN = 15;
const OUTPUT_MICRO_USD_PER_TOKEN = 75;

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
- Never imply an attorney-client relationship exists
- For well-established procedural facts, be direct. For legal strategy or outcomes, use measured language
- When relevant, remind the user: "Laws and procedures vary by jurisdiction — verify these details with your local court rules or a licensed attorney in your area."
- End every analysis or substantive response with a one-sentence disclaimer noting that HyperLaw provides legal information and drafting assistance, not legal advice or representation

Tone: Direct, clear, empowering, respectful. Like a knowledgeable legal self-help resource — not a cautious institution, but not a guarantor of outcomes either.`;

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
    { "type": "key_point", "text": "most important legally relevant detail from the description" },
    { "type": "summary", "text": "assessment of the claim's strength based on what was described" }
  ],
  "guidingQuestions": [
    "Specific question about a detail that would strengthen or clarify the legal claim",
    "Question about evidence that needs to be preserved",
    "Question about witnesses or documentation",
    "Question about prior incidents or patterns",
    "Question about the outcome the person sought"
  ]
}

Guidelines:
- Include 3-5 insights: legal rights implicated, evidence preservation urgency, procedural issues, red flags
- Include exactly 5 guiding questions targeted at this specific incident
- Be specific to the actual content — no generic advice
- Return only the JSON object`;

    const start = Date.now();
    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

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
    { "type": "summary", "text": "the pattern or theme that connects incidents and makes this a stronger case" },
    { "type": "notice", "text": "most important combined legal issue across the incidents" },
    { "type": "key_point", "text": "strongest strategic element of the combined case" },
    { "type": "notice", "text": "evidence or documentation gap across the incidents" }
  ],
  "guidingQuestions": [
    "Strategic question about building the combined case",
    "Question about establishing pattern or intent across incidents",
    "Question about the relationship between incidents and defendants",
    "Question about documenting the cumulative harm",
    "Question about the overall timeline and how it reads to a fact-finder"
  ]
}

Return only the JSON object`;

    const start = Date.now();
    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

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
    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 800,
      system: SYSTEM_PROMPT + contextBlock,
      messages,
    });

    const text = response.content[0].type === "text"
      ? response.content[0].text
      : "I couldn't generate a response. Please try again.";

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
    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 1000,
      system: "You are a precise legal document parser. Extract structured information accurately from legal documents.",
      messages: [{ role: "user", content: prompt }],
    });

    return {
      data: this.parseJsonResponse<CaseExtraction>(response),
      meta: this.buildMeta(response.usage, Date.now() - start),
    };
  }

  async ocrImage(buffer: Buffer, mimeType: string): Promise<AiResult<string>> {
    const base64 = buffer.toString("base64");
    const mediaType = mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

    const start = Date.now();
    const response = await this.client.messages.create({
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
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
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
    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    return {
      data: text,
      meta: this.buildMeta(response.usage, Date.now() - start),
    };
  }

  private parseJsonResponse<T>(response: Anthropic.Message): T {
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI returned invalid JSON format");
    return JSON.parse(jsonMatch[0]) as T;
  }
}

export const aiService = new AiService();

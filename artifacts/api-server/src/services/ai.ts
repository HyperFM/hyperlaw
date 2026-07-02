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

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are HyperLaw Tutor — an AI legal assistant built specifically for pro se civil rights litigants. You are analytical, direct, and empowering. You help people understand what happened to them legally without giving formal legal advice.

Your role:
- Identify legal issues and rights that may apply to the described incident
- Point out evidence the person may have overlooked or needs to preserve immediately
- Ask targeted questions that reveal legally important details
- Explain legal concepts in plain, accessible language
- Be specific to the actual content — never give generic, boilerplate advice
- Always note that users should consult an attorney for formal legal advice

Tone: Direct, clear, respectful. Like a knowledgeable friend who has read the law, not a cautious institution.`;

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

  // Reset client when key changes at runtime
  resetClient(): void {
    this._client = null;
  }

  async analyzeIncident(incident: {
    title: string;
    description: string;
    category: string;
    dateOfEvent?: string;
    location?: string;
  }): Promise<TutorAnalysis> {
    const prompt = `Analyze this civil rights incident and return ONLY valid JSON (no markdown, no explanation):

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

    const response = await this.client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    return this.parseJsonResponse<TutorAnalysis>(response);
  }

  async analyzeCase(
    hlCase: { title: string; notes: string },
    incidents: Array<{ title: string; description: string; category: string; dateOfEvent?: string; location?: string }>,
  ): Promise<TutorAnalysis> {
    const incidentText = incidents.map((inc, idx) =>
      `--- Incident ${idx + 1}: "${inc.title}" (${inc.category}${inc.dateOfEvent ? ", " + inc.dateOfEvent : ""}) ---\n${inc.description}`,
    ).join("\n\n");

    const prompt = `Analyze this civil rights case with ${incidents.length} incident(s) and return ONLY valid JSON:

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

    const response = await this.client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    return this.parseJsonResponse<TutorAnalysis>(response);
  }

  async chat(
    message: string,
    context: {
      incident?: { title: string; description: string; category: string } | null;
      hlCase?: { title: string; notes: string } | null;
      incidents?: Array<{ title: string; description: string; category: string }>;
      history: AiChatMessage[];
    },
  ): Promise<string> {
    let contextBlock = "";
    if (context.incident) {
      contextBlock = `\n\nContext — Current Incident:\nTitle: ${context.incident.title}\nCategory: ${context.incident.category}\n${context.incident.description}`;
    } else if (context.hlCase) {
      const incList = (context.incidents || [])
        .map((i, n) => `${n + 1}. "${i.title}" (${i.category}): ${i.description.slice(0, 300)}`)
        .join("\n");
      contextBlock = `\n\nContext — Current Case: ${context.hlCase.title}\nIncidents:\n${incList}`;
    }

    const messages: Anthropic.MessageParam[] = [
      ...context.history.slice(-12).map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: message },
    ];

    const response = await this.client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 800,
      system: SYSTEM_PROMPT + contextBlock,
      messages,
    });

    return response.content[0].type === "text"
      ? response.content[0].text
      : "I couldn't generate a response. Please try again.";
  }

  async extractFromDocument(text: string): Promise<CaseExtraction> {
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

    const response = await this.client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1000,
      system: "You are a precise legal document parser. Extract structured information accurately from legal documents.",
      messages: [{ role: "user", content: prompt }],
    });

    return this.parseJsonResponse<CaseExtraction>(response);
  }

  async ocrImage(buffer: Buffer, mimeType: string): Promise<string> {
    const base64 = buffer.toString("base64");
    const mediaType = mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

    const response = await this.client.messages.create({
      model: "claude-opus-4-5",
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

    return response.content[0].type === "text" ? response.content[0].text : "";
  }

  private parseJsonResponse<T>(response: Anthropic.Message): T {
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    // Strip markdown fences if present
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI returned invalid JSON format");
    return JSON.parse(jsonMatch[0]) as T;
  }
}

export const aiService = new AiService();

// ── AI API client ─────────────────────────────────────────────────────────────
// Mirrors the shapes defined in artifacts/api-server/src/services/ai.ts

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

export interface UploadResult {
  docId: string | null;
  method: string;
  pageCount?: number;
  wordCount: number;
  textPreview: string;
  extraction: CaseExtraction | null;
}

// ── Fetch helper ──────────────────────────────────────────────────────────────

const BASE = "/api";

interface AiError extends Error {
  code?: string;
}

async function aiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const isFormData = opts?.body instanceof FormData;
  const headers: HeadersInit = isFormData ? {} : { "Content-Type": "application/json" };

  const r = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...opts,
    headers: { ...headers, ...(opts?.headers ?? {}) },
  });

  if (!r.ok) {
    const body = await r.json().catch(() => ({ error: "Request failed" })) as { error?: string; code?: string };
    const err: AiError = new Error(body.error || `AI request failed (${r.status})`);
    err.code = body.code;
    throw err;
  }

  return r.json() as Promise<T>;
}

// ── Public API ────────────────────────────────────────────────────────────────

export const aiApi = {
  /** Check whether Claude is configured on the server */
  status(): Promise<{ configured: boolean; provider: string }> {
    return aiFetch("/ai/status");
  },

  /** Analyze a single incident with Claude */
  analyzeIncident(incident: {
    title: string;
    description: string;
    category: string;
    dateOfEvent?: string;
    location?: string;
  }): Promise<TutorAnalysis> {
    return aiFetch("/ai/analyze", {
      method: "POST",
      body: JSON.stringify({ type: "incident", incident }),
    });
  },

  /** Analyze a full case (multiple incidents) with Claude */
  analyzeCase(
    hlCase: { title: string; notes: string },
    incidents: Array<{ title: string; description: string; category: string; dateOfEvent?: string; location?: string }>,
  ): Promise<TutorAnalysis> {
    return aiFetch("/ai/analyze", {
      method: "POST",
      body: JSON.stringify({ type: "case", hlCase, incidents }),
    });
  },

  /** Send a chat message with context */
  chat(
    message: string,
    context: {
      incident?: { title: string; description: string; category: string } | null;
      hlCase?: { title: string; notes: string } | null;
      incidents?: Array<{ title: string; description: string; category: string }>;
      history: AiChatMessage[];
    },
  ): Promise<{ reply: string }> {
    return aiFetch("/ai/chat", {
      method: "POST",
      body: JSON.stringify({ message, context }),
    });
  },

  /** Upload a document for text extraction + AI case metadata extraction */
  upload(formData: FormData): Promise<UploadResult> {
    return aiFetch("/ai/upload", { method: "POST", body: formData });
  },

  /** Get previously uploaded documents for a case */
  documents(caseId: string): Promise<Array<{ id: string; fileName: string; mimeType: string; caseExtraction: CaseExtraction | null; createdAt: string }>> {
    return aiFetch(`/ai/documents/${caseId}`);
  },
};

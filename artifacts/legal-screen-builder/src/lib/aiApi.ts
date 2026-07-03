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
  /** True when this result came from the server-side cache (no Claude call was made) */
  fromCache?: boolean;
  /** ISO timestamp of when the result was originally cached */
  cachedAt?: string;
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
  fromCache?: boolean;
}

// ── Admin types ───────────────────────────────────────────────────────────────

export interface AiLog {
  id: string;
  userId: string;
  caseId: string | null;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostMicroUsd: number;
  responseTimeMs: number;
  cacheHit: boolean;
  promptTemplate: string | null;
  createdAt: string;
}

export interface AiStats {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostMicroUsd: number;
  avgResponseTimeMs: number;
  cacheHitCount: number;
  cacheHitRate: number;
  cachedEntries: number;
  byFeature: Array<{ feature: string; calls: number; costMicroUsd: number; cacheHits: number }>;
  dailyStats: Array<{ day: string; calls: number; costMicroUsd: number; cacheHits: number }>;
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

// ── Server-side GeneratedDocument shape (matches DB / API response) ──────────

export interface ServerGeneratedDoc {
  id: string;
  userId: string;
  caseId: string | null;
  title: string;
  documentType: string;
  content: string;
  version: number;
  status: string;         // "draft" | "verified" | "filed"
  paymentStatus: string;  // "free" | "pending" | "paid"
  createdAt: string;      // ISO timestamp from server
  updatedAt: string;
}

export const aiApi = {
  /** Check whether Claude is configured on the server */
  status(): Promise<{ configured: boolean; provider: string }> {
    return aiFetch("/ai/status");
  },

  /** Analyze a single incident — returns cached result if available */
  analyzeIncident(
    incident: {
      title: string;
      description: string;
      category: string;
      dateOfEvent?: string;
      location?: string;
    },
    opts?: { forceRefresh?: boolean; caseId?: string },
  ): Promise<TutorAnalysis> {
    return aiFetch("/ai/analyze", {
      method: "POST",
      body: JSON.stringify({
        type: "incident",
        incident,
        forceRefresh: opts?.forceRefresh ?? false,
        caseId: opts?.caseId,
      }),
    });
  },

  /** Analyze a full case — returns cached result if available */
  analyzeCase(
    hlCase: { title: string; notes: string },
    incidents: Array<{ title: string; description: string; category: string; dateOfEvent?: string; location?: string }>,
    opts?: { forceRefresh?: boolean; caseId?: string },
  ): Promise<TutorAnalysis> {
    return aiFetch("/ai/analyze", {
      method: "POST",
      body: JSON.stringify({
        type: "case",
        hlCase,
        incidents,
        forceRefresh: opts?.forceRefresh ?? false,
        caseId: opts?.caseId,
      }),
    });
  },

  /** Send a chat message with context */
  chat(
    message: string,
    context: {
      incident?: { title: string; description: string; category: string } | null;
      hlCase?: { title: string; notes: string } | null;
      incidents?: Array<{ title: string; description: string; category: string }>;
      caseContext?: { plaintiff?: string | null; defendant?: string | null; claims?: string[]; summary?: string } | null;
      history: AiChatMessage[];
    },
    opts?: { caseId?: string },
  ): Promise<{ reply: string }> {
    return aiFetch("/ai/chat", {
      method: "POST",
      body: JSON.stringify({ message, context, caseId: opts?.caseId }),
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

  // ── User self-service ──────────────────────────────────────────────────────

  /** Delete all user-owned server data (call before Clerk user.delete()) */
  deleteUserData(): Promise<void> {
    return aiFetch("/user", { method: "DELETE" });
  },

  // ── Generated Documents ────────────────────────────────────────────────────

  generatedDocs: {
    /** List documents — optionally scoped to a caseId */
    list(caseId?: string): Promise<ServerGeneratedDoc[]> {
      const q = caseId ? `?caseId=${encodeURIComponent(caseId)}` : "";
      return aiFetch(`/ai/generated-documents${q}`);
    },

    /** Save a new generated document to the server */
    create(payload: {
      caseId?: string | null;
      title: string;
      documentType?: string;
      content: string;
    }): Promise<ServerGeneratedDoc> {
      return aiFetch("/ai/generated-documents", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },

    /** Update title or status of a saved document */
    update(id: string, changes: { status?: string; title?: string }): Promise<ServerGeneratedDoc> {
      return aiFetch(`/ai/generated-documents/${id}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
    },

    /** Delete a document */
    remove(id: string): Promise<void> {
      return aiFetch(`/ai/generated-documents/${id}`, { method: "DELETE" });
    },
  },

  // ── Admin-only endpoints ───────────────────────────────────────────────────

  admin: {
    /** Paginated AI call logs */
    logs(params?: { page?: number; limit?: number; feature?: string; cacheHit?: boolean }): Promise<{ logs: AiLog[]; total: number; page: number; limit: number }> {
      const q = new URLSearchParams();
      if (params?.page) q.set("page", String(params.page));
      if (params?.limit) q.set("limit", String(params.limit));
      if (params?.feature) q.set("feature", params.feature);
      if (params?.cacheHit !== undefined) q.set("cacheHit", String(params.cacheHit));
      return aiFetch(`/admin/ai/logs?${q.toString()}`);
    },

    /** Aggregated usage stats */
    stats(): Promise<AiStats> {
      return aiFetch("/admin/ai/stats");
    },
  },
};

// ── Formatting helpers (used by AdminPanel) ───────────────────────────────────

export function formatMicroUsd(microUsd: number): string {
  return `$${(microUsd / 1_000_000).toFixed(4)}`;
}

export function featureLabel(feature: string): string {
  const labels: Record<string, string> = {
    analyze_incident: "Incident Analysis",
    analyze_case: "Case Analysis",
    chat: "AI Chat",
    extract_document: "Doc Extraction",
    ocr_image: "Image OCR",
  };
  return labels[feature] ?? feature;
}

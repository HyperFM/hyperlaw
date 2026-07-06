// ── AI API client ─────────────────────────────────────────────────────────────
// Mirrors the shapes defined in artifacts/api-server/src/services/ai.ts

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

/** Output of the Organization Engine — drives the Index tab and stored server-side */
export interface StructuredCase {
  executiveSummary: string;
  clouds: IndexCloud[];
  keyFacts: string[];
  claims: string[];
  importantQuotes: Array<{ quote: string; context: string }>;
  gapQuestions?: string[];
  organizedAt: number;
}

export interface TutorAnalysis {
  overview: string;
  insights: TutorInsight[];
  guidingQuestions: string[];
  clouds?: IndexCloud[];
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

/** Case Memory — structured source-of-truth built from document + intake answers */
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
  dailyStats: Array<{ day: string; calls: number; costMicroUsd: number; cacheHits: number; avgResponseTimeMs: number }>;
}

export interface ErrorLog {
  id: string;
  userId: string | null;
  context: string;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

// ── Fetch helper ──────────────────────────────────────────────────────────────

const BASE = "/api";

interface AiError extends Error {
  code?: string;
  creditBalance?: number;
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
    if (r.status === 402 && (body as Record<string, unknown>).creditBalance !== undefined) {
      err.creditBalance = (body as Record<string, unknown>).creditBalance as number;
    }
    throw err;
  }

  // 204 No Content — nothing to parse (e.g. DELETE success)
  if (r.status === 204) return undefined as unknown as T;

  return r.json() as Promise<T>;
}

// ── Public API ────────────────────────────────────────────────────────────────

// ── Server-side GeneratedDocument shape (matches DB / API response) ──────────

export interface KnowledgeEntry {
  id: string;
  title: string;
  summary: string;
  body: string;
  category: string;
  tags: string[];
  keywords: string[];
  jurisdiction: string | null;
  source: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreditProduct {
  id: string;
  name: string;
  description: string | null;
  metadata: { credits?: string; type?: string };
  prices: Array<{ id: string; unit_amount: number; currency: string; active: boolean }>;
}

export interface ServerGeneratedDoc {
  id: string;
  userId: string;
  caseId: string | null;
  title: string;
  documentType: string;
  content: string;
  version: number;
  status: string;         // "draft" | "verified" | "filed"
  paymentStatus: string;  // "preview" (generated, not yet unlocked) | "paid" (credit spent, full access)
  verifiedAt: string | null; // ISO timestamp set when TTS pre-verification is completed
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

  /** Build a chronological timeline from a free-text narrative */
  buildTimeline(story: string, caseId?: string): Promise<{ events: Array<{ title: string; description: string }> }> {
    return aiFetch("/ai/timeline", {
      method: "POST",
      body: JSON.stringify({ story, caseId }),
    });
  },

  /** Organization Engine — produce the full structured Index from all available case data */
  organizeCase(input: {
    hlCase: {
      title: string;
      parties: Array<{ firstName: string; lastName: string; type: string; nickname: string; agency?: string; title?: string }>;
      court: { name: string; level: string; state: string } | null;
      story: string;
      timeline: Array<{ title: string; description: string }>;
      assembly?: { organizedFacts: string; potentialClaims: Array<{ claim: string; supportingFacts: string[] }> } | null;
      evidence?: Array<{ type: string; label: string; notes: string }>;
    };
    caseId?: string;
  }): Promise<StructuredCase & { organizedAt: number }> {
    return aiFetch("/ai/organize", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  /** Builder Engine — extract structured data from dictation and generate exhibit draft */
  builderExtract(input: {
    timestamp: string;
    dictation: string;
    whyItMatters: string;
    exhibitNumber: number;
    caseTitle: string;
    parties: Array<{ firstName: string; lastName: string; type: string; nickname: string; agency?: string; title?: string }>;
    court: { name: string; level: string; state: string } | null;
    caseId?: string;
  }): Promise<{
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
  }> {
    return aiFetch("/ai/builder-extract", { method: "POST", body: JSON.stringify(input) });
  },

  /** Jurisdiction Verify — is this court/state permissive of illustrative exhibit slides? */
  jurisdictionVerify(input: {
    state: string;
    county: string;
    courtName: string;
    caseId?: string;
  }): Promise<{ verdict: "permitted" | "limited" | "not_accepted"; explanation: string }> {
    return aiFetch("/ai/jurisdiction-verify", { method: "POST", body: JSON.stringify(input) });
  },

  /** Gap Detection Engine — returns ALL missing-information questions in one batch */
  gapDetect(input: {
    hlCase: {
      title: string;
      parties: Array<{ firstName: string; lastName: string; type: string; nickname: string }>;
      court: { name: string; level: string; state: string } | null;
      story: string;
      timeline: Array<{ title: string; description: string }>;
      intakeChecklist: Array<{ key: string; completed: boolean; notes: string }>;
      evidence?: Array<{ type: string; label: string }>;
    };
    caseId?: string;
  }): Promise<{ questions: string[]; urgentCategories: string[] }> {
    return aiFetch("/ai/gap-detect", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  /** AI Case Assembly — organize facts, draft complaint, identify potential claims */
  assembleCase(input: {
    parties: Array<{ name: string; role: string; badge?: string }>;
    court: { name: string; level: string; state: string } | null;
    story: string;
    timeline: Array<{ title: string; description: string }>;
    caseId?: string;
  }): Promise<{
    organizedFacts: string;
    draftComplaint: string;
    potentialClaims: Array<{ claim: string; supportingFacts: string[]; missingFacts: string[] }>;
  }> {
    return aiFetch("/ai/assembly", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  /** Learning Index — identify relevant statutes, case law, and constitutional provisions */
  buildLearning(input: {
    organizedFacts: string;
    potentialClaims: Array<{ claim: string; supportingFacts: string[] }>;
    court: { name: string; level: string; state: string } | null;
    caseId?: string;
  }): Promise<{
    authorities: Array<{ type: "statute" | "case" | "constitution"; citation: string; plainEnglish: string; relevance: string }>;
  }> {
    return aiFetch("/ai/learning", {
      method: "POST",
      body: JSON.stringify(input),
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

  // ── Knowledge Library ──────────────────────────────────────────────────────

  knowledge: {
    /** Search the knowledge library (no auth required) */
    search(q: string, category?: string, jurisdiction?: string): Promise<KnowledgeEntry[]> {
      const params = new URLSearchParams({ q });
      if (category) params.set("category", category);
      if (jurisdiction) params.set("jurisdiction", jurisdiction);
      return aiFetch(`/knowledge/search?${params.toString()}`);
    },

    /** List all entries (admin) */
    list(): Promise<KnowledgeEntry[]> {
      return aiFetch("/knowledge");
    },

    /** Create a new entry (admin) */
    create(entry: {
      title: string; summary: string; body: string;
      category?: string; tags?: string[]; keywords?: string[];
      jurisdiction?: string | null; source?: string | null; isActive?: boolean;
    }): Promise<KnowledgeEntry> {
      return aiFetch("/knowledge", { method: "POST", body: JSON.stringify(entry) });
    },

    /** Update an entry (admin) */
    update(id: string, changes: Partial<{
      title: string; summary: string; body: string; category: string;
      tags: string[]; keywords: string[]; jurisdiction: string | null;
      source: string | null; isActive: boolean;
    }>): Promise<KnowledgeEntry> {
      return aiFetch(`/knowledge/${id}`, { method: "PATCH", body: JSON.stringify(changes) });
    },

    /** Delete an entry (admin) */
    remove(id: string): Promise<void> {
      return aiFetch(`/knowledge/${id}`, { method: "DELETE" });
    },
  },

  // ── User self-service ──────────────────────────────────────────────────────

  /** Delete all user-owned server data (call before Clerk user.delete()) */
  deleteUserData(): Promise<void> {
    return aiFetch("/user", { method: "DELETE" });
  },

  // ── Stripe / Credits ───────────────────────────────────────────────────────

  /** Get the authenticated user's current credit balance and plan tier */
  creditBalance(): Promise<{ creditBalance: number; planTier?: string }> {
    return aiFetch("/stripe/credits");
  },

  /** List credit-pack products from Stripe */
  creditProducts(): Promise<{ data: CreditProduct[] }> {
    return aiFetch("/stripe/products");
  },

  /**
   * Create a Stripe Checkout session for purchasing credits.
   * Returns { url } — redirect the user to url to complete payment.
   */
  createCreditCheckout(priceId: string, _creditAmount: number, successPath = "/"): Promise<{ url: string }> {
    return aiFetch("/stripe/checkout", {
      method: "POST",
      body: JSON.stringify({ priceId, successPath, cancelPath: "/" }),
    });
  },

  /** Open the Stripe Billing Portal to view payment history */
  stripePortal(): Promise<{ url: string }> {
    return aiFetch("/stripe/portal");
  },

  /**
   * Generate a formal legal document using 1 credit.
   * Returns the saved GeneratedDocument record.
   */
  generateDocument(payload: {
    caseId?: string;
    documentType: "complaint" | "motion" | "timeline";
    title?: string;
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
    };
  }): Promise<ServerGeneratedDoc> {
    return aiFetch("/ai/generate-document", {
      method: "POST",
      body: JSON.stringify(payload),
    });
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

    /**
     * Unlock a preview document. Spends 1 credit and sets paymentStatus → "paid".
     * Idempotent: if already paid, returns the doc immediately.
     * Throws AiError with code "insufficient_credits" if balance is 0.
     */
    unlock(id: string): Promise<ServerGeneratedDoc> {
      return aiFetch(`/ai/generated-documents/${id}/unlock`, { method: "POST" });
    },

    /**
     * Record that the user completed the TTS read-aloud pre-verification step.
     * Sets verifiedAt on the document server-side.
     */
    verify(id: string): Promise<ServerGeneratedDoc> {
      return aiFetch(`/ai/generated-documents/${id}/verify`, { method: "POST" });
    },
  },

  /**
   * Upload a document file with real-time upload-progress reporting.
   * Uses XMLHttpRequest so the browser's upload.onprogress event fires.
   */
  uploadWithProgress(
    form: FormData,
    onProgress: (pct: number) => void,
  ): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${BASE}/ai/upload`);
      xhr.withCredentials = true;
      xhr.upload.addEventListener("progress", e => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText) as UploadResult); }
          catch { reject(new Error("Invalid server response")); }
        } else {
          try {
            const body = JSON.parse(xhr.responseText) as { error?: string };
            reject(new Error(body.error ?? `Upload failed (${xhr.status})`));
          } catch {
            reject(new Error(`Upload failed (${xhr.status})`));
          }
        }
      });
      xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
      xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));
      xhr.send(form);
    });
  },

  /**
   * Deep document analysis — requires 1 credit.
   * Sends stored doc text + intake answers to Claude; builds structured Case Memory.
   */
  buildCaseMemory(params: {
    docId: string;
    caseId: string;
    intakeAnswers: {
      docType: string;
      preparedBy: string;
      hasParties: string;
      hasDates: string;
      additionalContext: string;
    };
  }): Promise<{ ok: boolean; analysis: CaseMemory; fileName: string; fromCache?: boolean }> {
    return aiFetch("/ai/analyze-document", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  },

  // ── Admin-only endpoints ───────────────────────────────────────────────────

  admin: {
    /** Platform-wide aggregate metrics */
    platformStats(): Promise<{
      totalUsers: number;
      totalDocs: number;
      unlockedDocs: number;
      previewDocs: number;
      creditsSold: number;
      stripeRevenueCents: number;
    }> {
      return aiFetch("/admin/platform-stats");
    },

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

    /** Paginated server-side error logs (upload failures, processing errors) */
    errorLogs(params?: { page?: number; limit?: number }): Promise<{ logs: ErrorLog[]; total: number; page: number; limit: number }> {
      const q = new URLSearchParams();
      if (params?.page) q.set("page", String(params.page));
      if (params?.limit) q.set("limit", String(params.limit));
      return aiFetch(`/admin/error-logs?${q.toString()}`);
    },
  },
};

// ── Formatting helpers (used by AdminPanel) ───────────────────────────────────

export function formatMicroUsd(microUsd: number): string {
  return `$${(microUsd / 1_000_000).toFixed(4)}`;
}

export function featureLabel(feature: string): string {
  const labels: Record<string, string> = {
    analyze_incident:        "Incident Analysis",
    analyze_incident_v2:     "Incident Analysis",
    analyze_case:            "Case Analysis",
    analyze_case_v2:         "Case Analysis",
    chat:                    "AI Chat",
    extract_document:        "Document Analysis (legacy)",
    analyze_document_intake: "Document Analysis (legacy)",
    build_case_memory:       "Case Memory Build",
    generate_document:       "Generate Document",
    ocr_image:               "Image OCR",
    timeline:                "Timeline Generation",
    assembly:                "Case Assembly",
    learning:                "Learning Index",
  };
  return labels[feature] ?? feature;
}

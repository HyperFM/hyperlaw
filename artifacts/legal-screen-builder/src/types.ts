// ─── Incident ─────────────────────────────────────────────────────────────────

export type IncidentCategory = "employment" | "police" | "court" | "other";

export interface Incident {
  id: string;
  title: string;
  description: string;
  dateOfEvent: string;      // YYYY-MM-DD or ""
  location: string;
  category: IncidentCategory;
  createdAt: number;
  caseId: string | null;
}

// ─── Party ────────────────────────────────────────────────────────────────────

export type PartyType = "official" | "civilian";

export interface Party {
  id: string;
  firstName: string;
  lastName: string;
  type: PartyType;
  // Official-only fields
  agency?: string;
  title?: string;
  badge?: string;
  officialLocation?: string;
  // Voice nickname (auto-assigned at creation, user-editable)
  nickname: string;       // e.g. "Pickle"
  nicknameEmoji: string;  // e.g. "🥒"
}

// ─── Court ────────────────────────────────────────────────────────────────────

export type CourtLevel = "federal" | "state";

export interface Court {
  level: CourtLevel;
  state: string;      // e.g. "New York"
  name: string;       // e.g. "Southern District of New York"
  shortName?: string; // e.g. "S.D.N.Y."
}

// ─── Timeline Event ───────────────────────────────────────────────────────────

export interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  order: number;
}

// ─── Workflow Stage ───────────────────────────────────────────────────────────

export type WorkflowStage =
  | "parties"    // Phase 1 — identify who was involved
  | "court"      // Phase 2 — select court / jurisdiction
  | "story"      // Phase 3 — tell the story
  | "timeline"   // Phase 4 — review AI-generated timeline
  | "assembly"   // Phase 5 — AI assembles complaint
  | "learning"   // Phase 6 — learning index
  | "documents"; // Phase 7/8 — generate documents

// ─── Intake Checklist ─────────────────────────────────────────────────────────

export type IntakeChecklistKey =
  | "witnesses"
  | "photos"
  | "video"
  | "audio"
  | "medical_records"
  | "police_reports"
  | "body_camera"
  | "prior_incidents"
  | "property_damage"
  | "financial_loss"
  | "emotional_harm"
  | "filing_deadlines";

export interface IntakeChecklistItem {
  key: IntakeChecklistKey;
  completed: boolean;
  notes: string;
}

// ─── Case ─────────────────────────────────────────────────────────────────────

export type CaseStatus = "open" | "in_progress" | "closed";

// ─── Version history ──────────────────────────────────────────────────────────

export interface StorySnapshot {
  snapshot: string;
  savedAt: number; // Unix ms
}

export interface TimelineSnapshot {
  snapshot: TimelineEvent[];
  savedAt: number; // Unix ms
}

// ─── Assembly ─────────────────────────────────────────────────────────────────

export interface AssemblyPotentialClaim {
  claim: string;
  supportingFacts: string[];
  missingFacts: string[];
}

export interface CaseAssembly {
  organizedFacts: string;
  draftComplaint: string;
  potentialClaims: AssemblyPotentialClaim[];
  assembledAt: number;
}

// ─── Learning Index ───────────────────────────────────────────────────────────

export interface LearningAuthority {
  type: "statute" | "case" | "constitution";
  citation: string;
  plainEnglish: string;
  relevance: string;
}

// ─── Evidence ─────────────────────────────────────────────────────────────────

export type EvidenceType = "photo" | "video" | "audio" | "medical" | "police" | "exhibit" | "other";

export interface EvidenceItem {
  id: string;
  type: EvidenceType;
  label: string;
  notes: string;
  fileName?: string;
  docId?: string; // server document ID from /ai/upload
  uploadedAt: number;
}

// ── Studio / Exhibit Builder ──────────────────────────────────────────────────

export interface ExhibitExtraction {
  directQuotations: string[];
  timeline: string[];
  contradictions: string[];
  importantActions: string[];
  evidenceReferences: string[];
  peopleInvolved: string[];
  policyReferences: string[];
  statuteReferences: string[];
  constitutionalReferences: string[];
  keyFactualObservations: string[];
  supportingContext: string[];
  followUpQuestions?: string[];
}

export interface ExhibitDraft {
  exhibitNumber: number;
  headline: string;
  supportingQuote: string;
  keyObservations: string[];
  timelineContext: string;
  relevantParties: string[];
  evidenceReferences: string[];
  legalAuthorities: string[];
  whyItMatters: string;
}

/** A single source-verification result returned by the exhibit generation API */
export interface FieldVerificationResult {
  /** Dot-separated JSON path inside the content object (e.g. "findings[0].body") */
  field: string;
  /** The verbatim ref string Claude produced */
  ref: string;
  /** Where Claude says the claim came from */
  origin: string;
  /** Whether the ref was found in the source material */
  supported: boolean;
}

/** Full data payload stored in an exhibit_screen marker */
export interface ExhibitScreenData {
  /** One of the 10 exhibit type IDs (e.g. "contradiction", "quote_breakdown") */
  selectedType: string;
  /** Raw layout content object from the AI — strongly typed only inside the exhibits/ folder */
  content: Record<string, unknown>;
  alternativeLayouts: string[];
  verificationResults: FieldVerificationResult[];
}

/** A local-only photo or video clip inserted at a precise timestamp.
 *  blobUrl is a session-only object URL — the file must be relinked after a page reload. */
export interface MediaInsert {
  kind: "photo" | "clip";
  /** Object URL from URL.createObjectURL() — valid for the current session only */
  blobUrl: string;
  fileName: string;
  /** Populated for clips after loadedmetadata fires */
  durationSec?: number;
}

/** Data for a screen that is cut into the video at a specific timestamp */
export interface ScreenInsert {
  title: string;
  subtitle?: string;
  /** Hex background color */
  bgColor: string;
  bodyLines: string[];
}

export interface ExhibitMarker {
  id: string;
  /** Seconds from start of video */
  timestamp: number;
  label: string;
  dictation: string;
  whyItMatters: string;
  extraction?: ExhibitExtraction;
  draft?: ExhibitDraft;
  status: "draft" | "extracting" | "ready" | "error";
  /** Seconds this exhibit screen holds on-screen in the exported video (default 10) */
  holdSec?: number;
  createdAt: number;
  /**
   * "analysis"     = dictation-driven Claude extraction (original flow)
   * "screen_cut"   = a manually built screen inserted as a video cut
   * "media_insert" = a local photo or video clip
   * "exhibit_screen" = AI-generated structured exhibit layout
   * "video_cut"    = a region of video to skip during playback and export
   * Defaults to "analysis" if omitted (backward compat).
   */
  type?: "analysis" | "screen_cut" | "media_insert" | "exhibit_screen" | "video_cut";
  /** Populated when type === "screen_cut" */
  screenInsert?: ScreenInsert;
  /** Populated when type === "media_insert" */
  mediaInsert?: MediaInsert;
  /** Populated when type === "exhibit_screen" */
  exhibitScreen?: ExhibitScreenData;
  /** Populated when type === "video_cut" — end timestamp of the cut region (seconds) */
  cutEnd?: number;
}

export interface JurisdictionVerification {
  verdict: "permitted" | "limited" | "not_accepted";
  explanation: string;
  verifiedAt: number;
}

export interface StudioProject {
  id: string;
  caseId: string;
  /** Original file name — shown so user can relink after session */
  videoFileName: string;
  videoDurationSec?: number;
  markers: ExhibitMarker[];
  jurisdictionVerification?: JurisdictionVerification;
  createdAt: number;
  updatedAt: number;
  /**
   * Unix ms timestamp when this project will be auto-deleted by the server
   * if there has been no editing activity. Reset to now + 7 days on every
   * autosave. Null/undefined until the first save after this field was introduced.
   */
  expiresAt?: number;
}

// ── Screen Builder engine (Manual Screen Builder) ──────────────────────────────
// Types consumed by src/engine.ts (question trees + block generator) and
// src/BlockCanvas.tsx (renderer). Kept here so both compile as live modules.

export type ScreenType =
  | "contradiction"
  | "quote"
  | "prior_incident"
  | "admission"
  | "policy_violation";

export type BlockType =
  | "eyebrow" | "headline" | "subheadline" | "divider"
  | "quote_card" | "evidence_card" | "comparison"
  | "fact_list" | "icon_bullets" | "legal_box"
  | "callout" | "policy_row" | "spacer";

export interface Block {
  id: string;
  type: BlockType;
  data: Record<string, string>;
  flex?: number;
}

/** Flat map of question key → collected answer */
export type DataMap = Record<string, string>;

export interface QChoice { label: string; value: string; }

export interface QNode {
  id: string;
  key: string;
  question: string;
  subtext?: string;
  type: "text" | "textarea" | "choice";
  choices?: QChoice[];
  /** Optional evidence-source hints — metadata only, not used by the renderer */
  evidenceTypes?: string[];
  /** Next node id, a resolver based on the answer, or null to end the flow */
  next: string | null | ((answer: string) => string | null);
}

export interface Screen {
  id: string;
  title: string;
  screenType: ScreenType;
  screenNumber: string;
  footerCitations: string[];
  blocks: Block[];
  createdAt: number;
}

// ── Structured Case (Organization Engine output) ──────────────────────────────

/** A single concept in the interactive Index cloud map */
export interface IndexCloud {
  id: string;
  label: string;
  category: "amendment" | "statute" | "evidence" | "party" | "violation" | "deadline" | "concept";
  description: string;
  facts?: string[];
  relatedItems?: string[];
  importance?: string;
}

/**
 * Produced by the Organization Engine after assembly.
 * Stored server-side in cases.structured_case and cached locally on HLCase.
 * Drives the Index tab without requiring an additional Claude call.
 */
export interface StructuredCase {
  executiveSummary: string;
  clouds: IndexCloud[];
  keyFacts: string[];
  claims: string[];
  importantQuotes: Array<{ quote: string; context: string }>;
  gapQuestions?: string[];
  organizedAt: number;
}

export interface HLCase {
  id: string;
  title: string;
  incidentIds: string[];
  notes: string;
  status: CaseStatus;
  createdAt: number;
  /** Legacy: free-text jurisdiction — kept for backward compat */
  jurisdiction?: string;
  // ── New workflow fields ──────────────────────────────────────────────────────
  parties: Party[];
  court: Court | null;
  /** Raw narrative from "Tell Your Story" screen */
  story: string;
  timeline: TimelineEvent[];
  workflowStage: WorkflowStage;
  intakeChecklist: IntakeChecklistItem[];
  // ── AI assembly & learning results ──────────────────────────────────────────
  assembly?: CaseAssembly;
  learningAuthorities?: LearningAuthority[];
  learningGeneratedAt?: number;
  // ── Evidence items ───────────────────────────────────────────────────────────
  evidence?: EvidenceItem[];
  // ── Version history (optional — up to 10 snapshots each) ────────────────────
  storyHistory?: StorySnapshot[];
  timelineHistory?: TimelineSnapshot[];
  // ── Organization Engine output ───────────────────────────────────────────────
  /** Populated automatically after assembly; drives the Index tab cloud view */
  structuredCase?: StructuredCase;
  /** Unix ms when structuredCase was last generated */
  structuredCaseGeneratedAt?: number;
  // ── Exhibit Studio ───────────────────────────────────────────────────────────
  studioProject?: StudioProject;
}

// ─── Generated Document ───────────────────────────────────────────────────────

export type DocumentStatus = "draft" | "verified" | "filed";
export type PaymentStatus = "preview" | "paid";

export interface GeneratedDocument {
  id: string;
  caseId: string | null;
  title: string;
  documentType: string; // "analysis" | "complaint" | "motion" | "timeline" | "chat_summary" | "other"
  content: string;
  version: number;
  status: DocumentStatus;
  paymentStatus: PaymentStatus;
  createdAt: number;
}

// ─── Reminder ─────────────────────────────────────────────────────────────────

export interface Reminder {
  id: string;
  caseId: string;
  label: string;
  dueDate: string; // YYYY-MM-DD
  createdAt: number;
}

// ─── App data ─────────────────────────────────────────────────────────────────

export interface AppData {
  incidents: Incident[];
  cases: HLCase[];
  reminders: Reminder[];
}

// ─── Case health ──────────────────────────────────────────────────────────────

export interface CaseHealth {
  parties: boolean;
  court: boolean;
  story: boolean;
  timeline: boolean;
  documents: boolean; // must be fetched separately from server
}

/** Computes local health fields (documents must be injected separately). */
export function computeCaseHealth(c: HLCase, hasDocuments = false): CaseHealth {
  return {
    parties: c.parties.length > 0,
    // Court is "known" if the structured court is set OR a jurisdiction string is
    // present. The complaint intake fills `jurisdiction` (e.g. "U.S. District
    // Court, E.D. Ky."), not the structured `court`, so keying only off `court`
    // wrongly nagged "Complete court" on cases whose court was clearly provided.
    court: c.court !== null || (c.jurisdiction?.trim().length ?? 0) > 0,
    story: c.story.trim().length > 0,
    timeline: c.timeline.length > 0,
    documents: hasDocuments,
  };
}

/** Returns the label and workflow stage of the next incomplete step. */
export function getNextStep(c: HLCase, health: CaseHealth): { label: string; stage: WorkflowStage } {
  if (!health.parties) return { label: "Add Parties", stage: "parties" };
  if (!health.court) return { label: "Select Court", stage: "court" };
  if (!health.story) return { label: "Tell Your Story", stage: "story" };
  if (!health.timeline) return { label: "Review Timeline", stage: "timeline" };
  if (!c.assembly) return { label: "Assemble Case with AI", stage: "assembly" };
  if (!c.learningAuthorities?.length) return { label: "Build Learning Index", stage: "learning" };
  return { label: "View Documents", stage: "documents" };
}

/** Percentage complete (0–100) based on health. */
export function caseCompletionPct(health: CaseHealth): number {
  const fields: (keyof CaseHealth)[] = ["parties", "court", "story", "timeline", "documents"];
  const done = fields.filter(k => health[k]).length;
  return Math.round((done / fields.length) * 100);
}

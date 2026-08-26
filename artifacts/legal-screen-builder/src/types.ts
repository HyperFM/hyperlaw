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
  /** Anything the AI itself flagged as uncertain when generating this screen —
   *  most importantly a status claim (charged/not charged, in custody/released,
   *  etc.) it couldn't fully reconcile against the rest of the video's own
   *  timeline. Non-empty means "needs a human look before this is trusted,"
   *  not "this is wrong" — surfaced as a warning in Step 3 and again before
   *  export, never silently hidden. */
  confidenceFlags?: string[];
  /** Names the AI corrected against the case's known-entities list (e.g.
   *  "DeHurnton" → "Hernton") — always reported, never a silent rewrite. */
  corrections?: NameCorrection[];
  /** Set when the user explicitly confirms this screen needs no more
   *  review, despite confidenceFlags being non-empty — the flags stay
   *  (they're still a true record of what the AI was unsure about) but the
   *  review prompt won't nag about them again. Cleared automatically the
   *  next time this screen is regenerated (Reiterate or a correction),
   *  since that produces new content the user hasn't looked at yet. */
  reviewedAt?: number;
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
  /** The moment (VideoChunk.id) this marker belongs to, when it was created from within one — lets exhibits travel with their moment when the Organize step reorders it. */
  chunkId?: string;
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

/** A captured moment from the Chunk step (Step 1) */
export interface VideoChunk {
  id: string;
  /** Start time in seconds */
  start: number;
  /** End time in seconds */
  end: number;
  /** Short nickname — a quick, easy-to-scan name for this moment (e.g. "Officer arrives") */
  name?: string;
  /** Combined plain-language content for this moment — the actual text every
   *  other part of the app reads (Organize, Exhibit AI prompt, Copy All
   *  Moment Info, Paste Moments, crash recovery). Always kept as
   *  `factsAnswer + "\n\n" + impactAnswer` when both are answered through the
   *  guided flow, so nothing downstream needs to know the guided flow
   *  exists at all — it only ever sees one combined string, same as before. */
  label: string;
  /** Guided question 1 — "What happened, who was involved, and how did you
   *  respond?" Undefined for chunks made before the guided flow existed, or
   *  chunks whose label was hand-edited outside it. */
  factsAnswer?: string;
  /** Guided question 2 — "How did it make you feel, and what would you have
   *  wanted to happen instead?" */
  impactAnswer?: string;
  /** Optional tag set in Step 2 */
  tag?: "consistency" | "contradiction" | "escalation" | "no_cause";
  /** User-picked frame (data URL) for this moment's card thumbnail — overrides
   *  the auto-picked opening frame. Only affects the card, never the timeline. */
  thumbnailOverride?: string;
  /** Set only on entries living in StudioProject.deletedChunks — when it was deleted. */
  deletedAt?: number;
  /** Illustrative Aid Script tool's output for this moment — a polished,
   *  litigation-ready spoken paragraph built from `label`, for the litigant
   *  to read aloud in court while the video plays. Deliberately NOT the
   *  same text as the exhibit slide content, which is written for on-screen
   *  display, not being read aloud — but shares the same known-entities/
   *  name-correction, status-scoping, and quote-fidelity checks as the
   *  slide generator (see ExhibitScreenData). Undefined until generated;
   *  stale after `label` is edited again until the user regenerates. */
  courtScript?: CourtScript;
}

/** A single quote attributed to a named person within a generated script or
 *  slide — `speaker` should match a name from the case's own party list. */
export interface NamedQuote {
  speaker: string;
  quote: string;
}

/** A name the AI corrected against the case's known-entities list (e.g.
 *  "DeHurnton" → "Hernton") — always reported, never a silent rewrite, so
 *  the user can verify it corrected to the right person. Shared shape for
 *  both the slide generator and the script generator. */
export interface NameCorrection {
  /** Where in the output this was corrected (e.g. "headline", "key_quotes_used[0].speaker") */
  field: string;
  from: string;
  to: string;
}

export interface CourtScript {
  spokenScript: string;
  keyQuotesUsed: NamedQuote[];
  /** Required whenever the script touches something that could change later
   *  in the video (charged/not yet charged, in custody/released, etc.) —
   *  states the time-scoped fact explicitly instead of letting it read as
   *  permanent. Null when nothing in this script needed qualifying. */
  asOfStatusNotes: string | null;
  /** Anything the AI wasn't fully sure about — same meaning and same visual
   *  treatment as ExhibitScreenData.confidenceFlags. Non-empty means "needs
   *  a human look," not "this is wrong." */
  confidenceFlags: string[];
  corrections: NameCorrection[];
  /** True for pure narrative/connective-tissue moments with no independent
   *  evidentiary content — the AI recommends skipping this one rather than
   *  forcing a script out of it. The user still decides; this is a
   *  recommendation, not an automatic exclusion. */
  skipRecommended: boolean;
  skipReason: string | null;
}

export interface StudioProject {
  id: string;
  caseId: string;
  /** Original file name — shown so user can relink after session */
  videoFileName: string;
  videoDurationSec?: number;
  markers: ExhibitMarker[];
  /** Captured moment chunks from the Chunk step */
  chunks?: VideoChunk[];
  /** Deleted chunks, kept as a small recoverable record rather than thrown
   *  away outright — shown as a compact "Deleted" marker in the list and
   *  included in Copy All Moment Info so the original content isn't lost,
   *  not merged back into `chunks` (which drives Organize/Exhibit/export). */
  deletedChunks?: VideoChunk[];
  /** Which step the user is on (1 Chunk, 2 Label, 3 Organize, 4 Exhibit) */
  workflowStep?: number;
  /** Ordered slot array for the Organize step — each entry is a chunk id or null */
  organizedSlots?: (string | null)[];
  jurisdictionVerification?: JurisdictionVerification;
  /** Present once the loaded video has been transcribed via the Transcribe
   *  & Suggest Moments tool. */
  transcript?: VideoTranscript;
  createdAt: number;
  updatedAt: number;
}

// ── Witness Examination ────────────────────────────────────────────────────────

/** One question asked during a witness examination and (eventually) its answer.
 *  yesNo and answerText are independent, not either/or — a witness can answer
 *  "No" and also have exactly what they said typed in underneath. Both being
 *  empty/undefined means the question was asked but never answered — kept in
 *  the list rather than discarded so it stays visible as something to re-ask,
 *  not silently lost. */
export interface WitnessQAEntry {
  id: string;
  question: string;
  yesNo?: "yes" | "no";
  /** Exactly what the witness said, beyond or instead of a plain yes/no */
  answerText?: string;
  askedAt: number;
  answeredAt?: number;
}

export interface WitnessExamination {
  id: string;
  caseId: string;
  witnessName: string;
  /** Set when the witness is one of the case's already-known parties — the
   *  AI already has context on them (role, relationship, prior facts), so
   *  there's nothing extra to ask for. Omitted for someone not already
   *  tracked on the case. */
  partyId?: string;
  /** Why this person is being examined / what their testimony is expected
   *  to establish — only meaningful when partyId is unset, since an
   *  existing party's relevance is already known from the rest of the
   *  case. Free text, e.g. "the clerk upstairs, never had an issue with me
   *  in two years, can speak to my good faith." */
  purpose?: string;
  examinationType?: "direct" | "cross";
  questions: WitnessQAEntry[];
  createdAt: number;
  updatedAt: number;
}

// ── Video Transcript & Suggested Moments ───────────────────────────────────────
// Stage 4 of the live-capture pipeline: transcribe long footage, then cross-
// reference the transcript against an already-known structured record (a
// WitnessExamination's Q&A entries) instead of blind diarization from a cold
// transcript — see the hyperlaw_live_capture_closing_argument_pipeline_spec
// memory. Every suggestion here is a recommendation the user reviews, never
// an automatically-created moment.

/** One timestamped slice of a transcribed video's audio. */
export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

/** A candidate moment the AI found in the footage matching a specific
 *  witness Q&A entry — the user confirms or adjusts before it becomes a
 *  real VideoChunk. */
export interface SuggestedMoment {
  id: string;
  witnessExaminationId: string;
  qaEntryId: string;
  start: number;
  end: number;
  /** Why the AI thinks this range matches that Q&A entry — shown to the
   *  user so "just trust it" is never the only option. */
  reason: string;
  /** Undefined until the user reviews it. */
  status?: "accepted" | "rejected";
}

export interface VideoTranscript {
  segments: TranscriptSegment[];
  fullText: string;
  generatedAt: number;
  suggestedMoments?: SuggestedMoment[];
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
  /** Downscaled (256px) JPEG data URL shown on the barrel/home screen.
   *  Server-persisted via its own casesTable column (casePhotoDataUrl) —
   *  see api.cases.savePhoto — not just localStorage, so it survives a
   *  reinstall or another device. */
  photoDataUrl?: string;
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
  // ── Witness Examination ──────────────────────────────────────────────────────
  witnessExaminations?: WitnessExamination[];
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

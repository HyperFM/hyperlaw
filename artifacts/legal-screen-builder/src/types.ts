// ─── Incident ─────────────────────────────────────────────────────────────────

export type IncidentCategory = "employment" | "police" | "court" | "other";

export interface Incident {
  id: string;
  title: string;
  description: string;
  dateOfEvent: string;      // YYYY-MM-DD or ""
  location: string;         // free text or ""
  category: IncidentCategory;
  createdAt: number;
  caseId: string | null;
}

// ─── Case ─────────────────────────────────────────────────────────────────────

export type CaseStatus = "open" | "in_progress" | "closed";

export interface HLCase {
  id: string;
  title: string;
  incidentIds: string[];
  notes: string;
  status: CaseStatus;
  createdAt: number;
  /** State/jurisdiction where this matter is pending — e.g. "Kentucky" */
  jurisdiction?: string;
}

// ─── Generated Document ───────────────────────────────────────────────────────

export type DocumentStatus = "draft" | "verified" | "filed";
export type PaymentStatus = "preview" | "paid";

export interface GeneratedDocument {
  id: string;
  caseId: string | null;
  title: string;
  documentType: string;   // "analysis" | "complaint" | "motion" | "timeline" | "chat_summary" | "other"
  content: string;        // full text
  version: number;
  status: DocumentStatus;
  paymentStatus: PaymentStatus;
  createdAt: number;      // unix ms
}

// ─── Reminder ─────────────────────────────────────────────────────────────────

export interface Reminder {
  id: string;
  caseId: string;
  label: string;
  dueDate: string;          // YYYY-MM-DD
  createdAt: number;
}

// ─── App data ─────────────────────────────────────────────────────────────────

export interface AppData {
  incidents: Incident[];
  cases: HLCase[];
  reminders: Reminder[];
}

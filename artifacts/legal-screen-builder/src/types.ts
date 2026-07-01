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

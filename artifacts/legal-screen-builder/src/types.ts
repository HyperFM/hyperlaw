// ─── Incident ─────────────────────────────────────────────────────────────────

export interface Incident {
  id: string;
  title: string;
  description: string;
  createdAt: number;
  caseId: string | null;
}

// ─── Case ─────────────────────────────────────────────────────────────────────

export interface HLCase {
  id: string;
  title: string;
  incidentIds: string[];
  notes: string;
  createdAt: number;
}

// ─── App data ─────────────────────────────────────────────────────────────────

export interface AppData {
  incidents: Incident[];
  cases: HLCase[];
}

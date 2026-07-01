import { AppData, Incident, HLCase } from "./types";

const KEY = "hl_v3";

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as AppData;
  } catch {}
  return { incidents: [], cases: [] };
}

export function saveData(data: AppData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
}

// ─── Incident mutations ───────────────────────────────────────────────────────

export function addIncident(data: AppData, incident: Incident): AppData {
  return { ...data, incidents: [incident, ...data.incidents] };
}

export function updateIncident(data: AppData, incident: Incident): AppData {
  return { ...data, incidents: data.incidents.map(i => i.id === incident.id ? incident : i) };
}

export function deleteIncident(data: AppData, id: string): AppData {
  return {
    incidents: data.incidents.filter(i => i.id !== id),
    cases: data.cases.map(c => ({ ...c, incidentIds: c.incidentIds.filter(iid => iid !== id) })),
  };
}

// ─── Case mutations ───────────────────────────────────────────────────────────

export function addCase(data: AppData, hlCase: HLCase): AppData {
  return { ...data, cases: [hlCase, ...data.cases] };
}

export function updateCase(data: AppData, hlCase: HLCase): AppData {
  return { ...data, cases: data.cases.map(c => c.id === hlCase.id ? hlCase : c) };
}

export function deleteCase(data: AppData, id: string): AppData {
  return {
    incidents: data.incidents.map(i => i.caseId === id ? { ...i, caseId: null } : i),
    cases: data.cases.filter(c => c.id !== id),
  };
}

export function addIncidentToCase(data: AppData, incidentId: string, caseId: string): AppData {
  return {
    incidents: data.incidents.map(i => i.id === incidentId ? { ...i, caseId } : i),
    cases: data.cases.map(c => c.id === caseId && !c.incidentIds.includes(incidentId)
      ? { ...c, incidentIds: [...c.incidentIds, incidentId] }
      : c),
  };
}

import type { HLCase } from "../types";

/** Cheap fingerprint of the case inputs the Index is built from (not the Index itself, so refreshing never re-triggers itself). */
export function caseSourceKey(c: HLCase): string {
  const raw = JSON.stringify([
    c.title, c.story, c.notes, c.jurisdiction, c.court?.name,
    c.parties.map(p => `${p.firstName} ${p.lastName}`),
    c.timeline.map(t => `${t.title}|${t.description}`),
    c.evidence?.length ?? 0,
    c.assembly?.potentialClaims?.length ?? 0,
  ]);
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = ((h << 5) + h + raw.charCodeAt(i)) | 0;
  return `${raw.length}:${(h >>> 0).toString(36)}`;
}

// The intake AI sometimes repeats a person or event it already reported, or reports the same person with and
// without a title ("John Smith" / "Deputy John Smith"). These helpers keep the review list to one entry each.

const TITLES = /^(deputy|officer|ofc|sgt|sergeant|detective|det|lt|lieutenant|capt|captain|trooper|chief|sheriff|judge|magistrate|mr|mrs|ms|miss|dr|mx)\.?\s+/i;

export function nameKey(name: string): string {
  let n = name.trim().toLowerCase().replace(/[.,]/g, "");
  for (let i = 0; i < 3 && TITLES.test(n); i++) n = n.replace(TITLES, "");
  return n.replace(/\s+/g, " ");
}

interface P { name: string; role?: string; isOfficial?: boolean; agency?: string | null }

/** Adds `incoming` to `existing`, merging repeats. When a repeat has more detail (a role/agency/title), the richer one wins. */
export function mergeParties<T extends P>(existing: T[], incoming: T[]): T[] {
  const out = [...existing];
  for (const p of incoming) {
    const key = nameKey(p.name);
    if (!key) continue;
    const i = out.findIndex(x => nameKey(x.name) === key);
    if (i < 0) { out.push(p); continue; }
    const cur = out[i];
    const richer = (p.name.length > cur.name.length ? p.name : cur.name);
    out[i] = { ...cur, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v != null && v !== "")), name: richer };
  }
  return out;
}

const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2));

/** Two event descriptions that say (nearly) the same thing on the same date count as one. */
export function sameEvent(a: { when?: string | null; what: string }, b: { when?: string | null; what: string }): boolean {
  if ((a.when ?? "").trim().toLowerCase() !== (b.when ?? "").trim().toLowerCase() && a.when && b.when) return false;
  const ta = tokens(a.what), tb = tokens(b.what);
  if (ta.size === 0 || tb.size === 0) return a.what.trim().toLowerCase() === b.what.trim().toLowerCase();
  let shared = 0;
  ta.forEach(w => { if (tb.has(w)) shared++; });
  return shared / Math.min(ta.size, tb.size) >= 0.7;
}

export function mergeEvents<T extends { when?: string | null; what: string }>(existing: T[], incoming: T[]): T[] {
  const out = [...existing];
  for (const e of incoming) if (!out.some(x => sameEvent(x, e))) out.push(e);
  return out;
}

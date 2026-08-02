import { Court } from "../types";

// ─── Court database ───────────────────────────────────────────────────────────
// Each entry is a selectable court. Federal courts are U.S. district courts.
// State courts are the primary general-jurisdiction trial courts.

export const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
  "Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa",
  "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan",
  "Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada",
  "New Hampshire","New Jersey","New Mexico","New York","North Carolina",
  "North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island",
  "South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont",
  "Virginia","Washington","West Virginia","Wisconsin","Wyoming",
  "District of Columbia",
] as const;

export type USState = typeof US_STATES[number];

// Federal district courts keyed by state name
export const FEDERAL_COURTS: Record<string, Court[]> = {
  Alabama: [
    { level:"federal", state:"Alabama", name:"Northern District of Alabama", shortName:"N.D. Ala." },
    { level:"federal", state:"Alabama", name:"Middle District of Alabama",   shortName:"M.D. Ala." },
    { level:"federal", state:"Alabama", name:"Southern District of Alabama", shortName:"S.D. Ala." },
  ],
  Alaska: [
    { level:"federal", state:"Alaska",  name:"District of Alaska", shortName:"D. Alaska" },
  ],
  Arizona: [
    { level:"federal", state:"Arizona", name:"District of Arizona", shortName:"D. Ariz." },
  ],
  Arkansas: [
    { level:"federal", state:"Arkansas", name:"Eastern District of Arkansas", shortName:"E.D. Ark." },
    { level:"federal", state:"Arkansas", name:"Western District of Arkansas", shortName:"W.D. Ark." },
  ],
  California: [
    { level:"federal", state:"California", name:"Northern District of California", shortName:"N.D. Cal." },
    { level:"federal", state:"California", name:"Eastern District of California",  shortName:"E.D. Cal." },
    { level:"federal", state:"California", name:"Central District of California",  shortName:"C.D. Cal." },
    { level:"federal", state:"California", name:"Southern District of California", shortName:"S.D. Cal." },
  ],
  Colorado: [
    { level:"federal", state:"Colorado", name:"District of Colorado", shortName:"D. Colo." },
  ],
  Connecticut: [
    { level:"federal", state:"Connecticut", name:"District of Connecticut", shortName:"D. Conn." },
  ],
  Delaware: [
    { level:"federal", state:"Delaware", name:"District of Delaware", shortName:"D. Del." },
  ],
  Florida: [
    { level:"federal", state:"Florida", name:"Northern District of Florida", shortName:"N.D. Fla." },
    { level:"federal", state:"Florida", name:"Middle District of Florida",   shortName:"M.D. Fla." },
    { level:"federal", state:"Florida", name:"Southern District of Florida", shortName:"S.D. Fla." },
  ],
  Georgia: [
    { level:"federal", state:"Georgia", name:"Northern District of Georgia", shortName:"N.D. Ga." },
    { level:"federal", state:"Georgia", name:"Middle District of Georgia",   shortName:"M.D. Ga." },
    { level:"federal", state:"Georgia", name:"Southern District of Georgia", shortName:"S.D. Ga." },
  ],
  Hawaii: [
    { level:"federal", state:"Hawaii", name:"District of Hawaii", shortName:"D. Haw." },
  ],
  Idaho: [
    { level:"federal", state:"Idaho", name:"District of Idaho", shortName:"D. Idaho" },
  ],
  Illinois: [
    { level:"federal", state:"Illinois", name:"Northern District of Illinois", shortName:"N.D. Ill." },
    { level:"federal", state:"Illinois", name:"Central District of Illinois",  shortName:"C.D. Ill." },
    { level:"federal", state:"Illinois", name:"Southern District of Illinois", shortName:"S.D. Ill." },
  ],
  Indiana: [
    { level:"federal", state:"Indiana", name:"Northern District of Indiana", shortName:"N.D. Ind." },
    { level:"federal", state:"Indiana", name:"Southern District of Indiana", shortName:"S.D. Ind." },
  ],
  Iowa: [
    { level:"federal", state:"Iowa", name:"Northern District of Iowa", shortName:"N.D. Iowa" },
    { level:"federal", state:"Iowa", name:"Southern District of Iowa", shortName:"S.D. Iowa" },
  ],
  Kansas: [
    { level:"federal", state:"Kansas", name:"District of Kansas", shortName:"D. Kan." },
  ],
  Kentucky: [
    { level:"federal", state:"Kentucky", name:"Eastern District of Kentucky", shortName:"E.D. Ky." },
    { level:"federal", state:"Kentucky", name:"Western District of Kentucky", shortName:"W.D. Ky." },
  ],
  Louisiana: [
    { level:"federal", state:"Louisiana", name:"Eastern District of Louisiana", shortName:"E.D. La." },
    { level:"federal", state:"Louisiana", name:"Middle District of Louisiana",  shortName:"M.D. La." },
    { level:"federal", state:"Louisiana", name:"Western District of Louisiana", shortName:"W.D. La." },
  ],
  Maine: [
    { level:"federal", state:"Maine", name:"District of Maine", shortName:"D. Me." },
  ],
  Maryland: [
    { level:"federal", state:"Maryland", name:"District of Maryland", shortName:"D. Md." },
  ],
  Massachusetts: [
    { level:"federal", state:"Massachusetts", name:"District of Massachusetts", shortName:"D. Mass." },
  ],
  Michigan: [
    { level:"federal", state:"Michigan", name:"Eastern District of Michigan", shortName:"E.D. Mich." },
    { level:"federal", state:"Michigan", name:"Western District of Michigan", shortName:"W.D. Mich." },
  ],
  Minnesota: [
    { level:"federal", state:"Minnesota", name:"District of Minnesota", shortName:"D. Minn." },
  ],
  Mississippi: [
    { level:"federal", state:"Mississippi", name:"Northern District of Mississippi", shortName:"N.D. Miss." },
    { level:"federal", state:"Mississippi", name:"Southern District of Mississippi", shortName:"S.D. Miss." },
  ],
  Missouri: [
    { level:"federal", state:"Missouri", name:"Eastern District of Missouri", shortName:"E.D. Mo." },
    { level:"federal", state:"Missouri", name:"Western District of Missouri", shortName:"W.D. Mo." },
  ],
  Montana: [
    { level:"federal", state:"Montana", name:"District of Montana", shortName:"D. Mont." },
  ],
  Nebraska: [
    { level:"federal", state:"Nebraska", name:"District of Nebraska", shortName:"D. Neb." },
  ],
  Nevada: [
    { level:"federal", state:"Nevada", name:"District of Nevada", shortName:"D. Nev." },
  ],
  "New Hampshire": [
    { level:"federal", state:"New Hampshire", name:"District of New Hampshire", shortName:"D.N.H." },
  ],
  "New Jersey": [
    { level:"federal", state:"New Jersey", name:"District of New Jersey", shortName:"D.N.J." },
  ],
  "New Mexico": [
    { level:"federal", state:"New Mexico", name:"District of New Mexico", shortName:"D.N.M." },
  ],
  "New York": [
    { level:"federal", state:"New York", name:"Northern District of New York", shortName:"N.D.N.Y." },
    { level:"federal", state:"New York", name:"Southern District of New York", shortName:"S.D.N.Y." },
    { level:"federal", state:"New York", name:"Eastern District of New York",  shortName:"E.D.N.Y." },
    { level:"federal", state:"New York", name:"Western District of New York",  shortName:"W.D.N.Y." },
  ],
  "North Carolina": [
    { level:"federal", state:"North Carolina", name:"Eastern District of North Carolina", shortName:"E.D.N.C." },
    { level:"federal", state:"North Carolina", name:"Middle District of North Carolina",  shortName:"M.D.N.C." },
    { level:"federal", state:"North Carolina", name:"Western District of North Carolina", shortName:"W.D.N.C." },
  ],
  "North Dakota": [
    { level:"federal", state:"North Dakota", name:"District of North Dakota", shortName:"D.N.D." },
  ],
  Ohio: [
    { level:"federal", state:"Ohio", name:"Northern District of Ohio", shortName:"N.D. Ohio" },
    { level:"federal", state:"Ohio", name:"Southern District of Ohio", shortName:"S.D. Ohio" },
  ],
  Oklahoma: [
    { level:"federal", state:"Oklahoma", name:"Northern District of Oklahoma", shortName:"N.D. Okla." },
    { level:"federal", state:"Oklahoma", name:"Eastern District of Oklahoma",  shortName:"E.D. Okla." },
    { level:"federal", state:"Oklahoma", name:"Western District of Oklahoma",  shortName:"W.D. Okla." },
  ],
  Oregon: [
    { level:"federal", state:"Oregon", name:"District of Oregon", shortName:"D. Or." },
  ],
  Pennsylvania: [
    { level:"federal", state:"Pennsylvania", name:"Eastern District of Pennsylvania", shortName:"E.D. Pa." },
    { level:"federal", state:"Pennsylvania", name:"Middle District of Pennsylvania",  shortName:"M.D. Pa." },
    { level:"federal", state:"Pennsylvania", name:"Western District of Pennsylvania", shortName:"W.D. Pa." },
  ],
  "Rhode Island": [
    { level:"federal", state:"Rhode Island", name:"District of Rhode Island", shortName:"D.R.I." },
  ],
  "South Carolina": [
    { level:"federal", state:"South Carolina", name:"District of South Carolina", shortName:"D.S.C." },
  ],
  "South Dakota": [
    { level:"federal", state:"South Dakota", name:"District of South Dakota", shortName:"D.S.D." },
  ],
  Tennessee: [
    { level:"federal", state:"Tennessee", name:"Eastern District of Tennessee", shortName:"E.D. Tenn." },
    { level:"federal", state:"Tennessee", name:"Middle District of Tennessee",  shortName:"M.D. Tenn." },
    { level:"federal", state:"Tennessee", name:"Western District of Tennessee", shortName:"W.D. Tenn." },
  ],
  Texas: [
    { level:"federal", state:"Texas", name:"Northern District of Texas", shortName:"N.D. Tex." },
    { level:"federal", state:"Texas", name:"Southern District of Texas", shortName:"S.D. Tex." },
    { level:"federal", state:"Texas", name:"Eastern District of Texas",  shortName:"E.D. Tex." },
    { level:"federal", state:"Texas", name:"Western District of Texas",  shortName:"W.D. Tex." },
  ],
  Utah: [
    { level:"federal", state:"Utah", name:"District of Utah", shortName:"D. Utah" },
  ],
  Vermont: [
    { level:"federal", state:"Vermont", name:"District of Vermont", shortName:"D. Vt." },
  ],
  Virginia: [
    { level:"federal", state:"Virginia", name:"Eastern District of Virginia", shortName:"E.D. Va." },
    { level:"federal", state:"Virginia", name:"Western District of Virginia", shortName:"W.D. Va." },
  ],
  Washington: [
    { level:"federal", state:"Washington", name:"Eastern District of Washington", shortName:"E.D. Wash." },
    { level:"federal", state:"Washington", name:"Western District of Washington", shortName:"W.D. Wash." },
  ],
  "West Virginia": [
    { level:"federal", state:"West Virginia", name:"Northern District of West Virginia", shortName:"N.D.W. Va." },
    { level:"federal", state:"West Virginia", name:"Southern District of West Virginia", shortName:"S.D.W. Va." },
  ],
  Wisconsin: [
    { level:"federal", state:"Wisconsin", name:"Eastern District of Wisconsin", shortName:"E.D. Wis." },
    { level:"federal", state:"Wisconsin", name:"Western District of Wisconsin", shortName:"W.D. Wis." },
  ],
  Wyoming: [
    { level:"federal", state:"Wyoming", name:"District of Wyoming", shortName:"D. Wyo." },
  ],
  "District of Columbia": [
    { level:"federal", state:"District of Columbia", name:"United States District Court for the District of Columbia", shortName:"D.D.C." },
  ],
};

// State general-jurisdiction trial courts keyed by state name
export const STATE_COURTS: Record<string, Court[]> = {
  Alabama:            [{ level:"state", state:"Alabama",            name:"Circuit Court" }],
  Alaska:             [{ level:"state", state:"Alaska",             name:"Superior Court" }],
  Arizona:            [{ level:"state", state:"Arizona",            name:"Superior Court" }],
  Arkansas:           [{ level:"state", state:"Arkansas",           name:"Circuit Court" }],
  California:         [{ level:"state", state:"California",         name:"Superior Court" }],
  Colorado:           [{ level:"state", state:"Colorado",           name:"District Court" }],
  Connecticut:        [{ level:"state", state:"Connecticut",        name:"Superior Court" }],
  Delaware:           [{ level:"state", state:"Delaware",           name:"Superior Court" }],
  Florida:            [{ level:"state", state:"Florida",            name:"Circuit Court" }],
  Georgia:            [{ level:"state", state:"Georgia",            name:"Superior Court" }],
  Hawaii:             [{ level:"state", state:"Hawaii",             name:"Circuit Court" }],
  Idaho:              [{ level:"state", state:"Idaho",              name:"District Court" }],
  Illinois:           [{ level:"state", state:"Illinois",           name:"Circuit Court" }],
  Indiana:            [
    { level:"state", state:"Indiana", name:"Circuit Court" },
    { level:"state", state:"Indiana", name:"Superior Court" },
  ],
  Iowa:               [{ level:"state", state:"Iowa",               name:"District Court" }],
  Kansas:             [{ level:"state", state:"Kansas",             name:"District Court" }],
  Kentucky:           [{ level:"state", state:"Kentucky",           name:"Circuit Court" }],
  Louisiana:          [
    { level:"state", state:"Louisiana", name:"District Court" },
    { level:"state", state:"Louisiana", name:"Parish Court" },
  ],
  Maine:              [{ level:"state", state:"Maine",              name:"Superior Court" }],
  Maryland:           [{ level:"state", state:"Maryland",           name:"Circuit Court" }],
  Massachusetts:      [{ level:"state", state:"Massachusetts",      name:"Superior Court" }],
  Michigan:           [{ level:"state", state:"Michigan",           name:"Circuit Court" }],
  Minnesota:          [{ level:"state", state:"Minnesota",          name:"District Court" }],
  Mississippi:        [
    { level:"state", state:"Mississippi", name:"Circuit Court" },
    { level:"state", state:"Mississippi", name:"Chancery Court" },
  ],
  Missouri:           [{ level:"state", state:"Missouri",           name:"Circuit Court" }],
  Montana:            [{ level:"state", state:"Montana",            name:"District Court" }],
  Nebraska:           [{ level:"state", state:"Nebraska",           name:"District Court" }],
  Nevada:             [{ level:"state", state:"Nevada",             name:"District Court" }],
  "New Hampshire":    [{ level:"state", state:"New Hampshire",      name:"Superior Court" }],
  "New Jersey":       [{ level:"state", state:"New Jersey",         name:"Superior Court" }],
  "New Mexico":       [{ level:"state", state:"New Mexico",         name:"District Court" }],
  "New York":         [{ level:"state", state:"New York",           name:"Supreme Court (Trial Division)" }],
  "North Carolina":   [{ level:"state", state:"North Carolina",     name:"Superior Court" }],
  "North Dakota":     [{ level:"state", state:"North Dakota",       name:"District Court" }],
  Ohio:               [{ level:"state", state:"Ohio",               name:"Court of Common Pleas" }],
  Oklahoma:           [{ level:"state", state:"Oklahoma",           name:"District Court" }],
  Oregon:             [{ level:"state", state:"Oregon",             name:"Circuit Court" }],
  Pennsylvania:       [{ level:"state", state:"Pennsylvania",       name:"Court of Common Pleas" }],
  "Rhode Island":     [{ level:"state", state:"Rhode Island",       name:"Superior Court" }],
  "South Carolina":   [{ level:"state", state:"South Carolina",     name:"Circuit Court" }],
  "South Dakota":     [{ level:"state", state:"South Dakota",       name:"Circuit Court" }],
  Tennessee:          [
    { level:"state", state:"Tennessee", name:"Circuit Court" },
    { level:"state", state:"Tennessee", name:"Chancery Court" },
  ],
  Texas:              [{ level:"state", state:"Texas",              name:"District Court" }],
  Utah:               [{ level:"state", state:"Utah",               name:"District Court" }],
  Vermont:            [{ level:"state", state:"Vermont",            name:"Superior Court" }],
  Virginia:           [{ level:"state", state:"Virginia",           name:"Circuit Court" }],
  Washington:         [{ level:"state", state:"Washington",         name:"Superior Court" }],
  "West Virginia":    [{ level:"state", state:"West Virginia",      name:"Circuit Court" }],
  Wisconsin:          [{ level:"state", state:"Wisconsin",          name:"Circuit Court" }],
  Wyoming:            [{ level:"state", state:"Wyoming",            name:"District Court" }],
  "District of Columbia": [{ level:"state", state:"District of Columbia", name:"Superior Court of D.C." }],
};

/** Returns courts for a given state and level. */
export function getCourts(state: string, level: "federal" | "state"): Court[] {
  return level === "federal"
    ? (FEDERAL_COURTS[state] ?? [])
    : (STATE_COURTS[state] ?? []);
}

// ─── Flat jurisdiction list for search/autocomplete ────────────────────────────
// Every federal district court + every state's general-jurisdiction trial
// court, formatted as a single display string a user can search and pick.
// This is not a full county-by-county courthouse directory (no dataset that
// granular is available here) — it's every U.S. federal district and every
// state's primary trial court, which covers the actual jurisdiction a case is
// filed in even though it doesn't name the specific county courthouse.
export const ALL_JURISDICTIONS: string[] = [
  ...Object.values(FEDERAL_COURTS).flat().map(c => `${c.name}${c.shortName ? ` (${c.shortName})` : ""} — ${c.state}`),
  ...Object.values(STATE_COURTS).flat().map(c => `${c.state} ${c.name}`),
].sort((a, b) => a.localeCompare(b));

/** Case-insensitive substring search over ALL_JURISDICTIONS, capped to `limit` results. */
export function searchJurisdictions(query: string, limit = 8): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return ALL_JURISDICTIONS.filter(j => j.toLowerCase().includes(q)).slice(0, limit);
}

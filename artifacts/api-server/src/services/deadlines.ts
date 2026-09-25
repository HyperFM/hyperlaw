// Deadline rules and date math. The app does ALL the date math — the AI never computes a deadline;
// it is only handed the result to put in plain words (Phase 3 spec).
//
// IMPORTANT: every rule below is a starting table drawn from the published court rules and marked
// verified:false. Before public launch a Kentucky attorney must confirm each one (and add more), and
// the chat always tells the person to confirm with the court clerk. Counting follows the usual civil
// rule (exclude the trigger day, count every calendar day, and if the last day is a weekend or legal
// holiday the period runs to the next day that isn't).

export type CourtLevel = "federal" | "state";
export type TriggerEvent = "served_complaint" | "waiver_requested" | "judgment_entered";

export interface DeadlineRule {
  id: string;
  courtLevel: CourtLevel;
  state?: string;            // for state courts
  event: TriggerEvent;
  filing: string;            // what has to be filed
  days: number;
  rule: string;              // citation, shown to the person
  note?: string;
  verified: boolean;
}

export const DEADLINE_RULES: DeadlineRule[] = [
  // ── Federal civil ──
  { id: "fed-answer-served", courtLevel: "federal", event: "served_complaint", filing: "Answer or motion in response to the complaint", days: 21, rule: "Fed. R. Civ. P. 12(a)(1)(A)(i)", verified: false },
  { id: "fed-answer-waiver", courtLevel: "federal", event: "waiver_requested", filing: "Answer or motion in response to the complaint", days: 60, rule: "Fed. R. Civ. P. 12(a)(1)(A)(ii)", note: "Counted from the date the request for waiver was sent.", verified: false },
  { id: "fed-appeal", courtLevel: "federal", event: "judgment_entered", filing: "Notice of appeal", days: 30, rule: "Fed. R. App. P. 4(a)(1)(A)", note: "60 days if the United States is a party.", verified: false },
  { id: "fed-59e", courtLevel: "federal", event: "judgment_entered", filing: "Motion to alter or amend the judgment", days: 28, rule: "Fed. R. Civ. P. 59(e)", verified: false },
  { id: "fed-59b", courtLevel: "federal", event: "judgment_entered", filing: "Motion for a new trial", days: 28, rule: "Fed. R. Civ. P. 59(b)", verified: false },
  // ── Kentucky state civil ──
  { id: "ky-answer", courtLevel: "state", state: "Kentucky", event: "served_complaint", filing: "Answer to the complaint", days: 20, rule: "Ky. R. Civ. P. 12.01", verified: false },
  { id: "ky-appeal", courtLevel: "state", state: "Kentucky", event: "judgment_entered", filing: "Notice of appeal", days: 30, rule: "Ky. R. Civ. P. 73.02(1)(a)", verified: false },
  { id: "ky-59-05", courtLevel: "state", state: "Kentucky", event: "judgment_entered", filing: "Motion to alter, amend or vacate the judgment", days: 10, rule: "Ky. R. Civ. P. 59.05", verified: false },
];

export function rulesForCourt(court: { level?: string | null; state?: string | null } | null | undefined): DeadlineRule[] {
  if (!court?.level) return [];
  if (court.level === "federal") return DEADLINE_RULES.filter(r => r.courtLevel === "federal");
  const st = (court.state ?? "").trim().toLowerCase();
  return DEADLINE_RULES.filter(r => r.courtLevel === "state" && (r.state ?? "").toLowerCase() === st);
}

// ── Date math (all in UTC calendar days, no time zones involved) ─────────────────────
const DAY = 86_400_000;
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const iso = (d: Date) => d.toISOString().slice(0, 10);

function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = utc(year, month, 1);
  const shift = (weekday - first.getUTCDay() + 7) % 7;
  return utc(year, month, 1 + shift + (n - 1) * 7);
}
function lastWeekday(year: number, month: number, weekday: number): Date {
  const last = utc(year, month + 1, 0);
  return utc(year, month, last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7));
}
/** Federal legal holidays (with the Friday/Monday "observed" shift for weekend holidays). */
export function federalHolidays(year: number): Set<string> {
  const fixed = [utc(year, 0, 1), utc(year, 5, 19), utc(year, 6, 4), utc(year, 10, 11), utc(year, 11, 25)].map(d => {
    if (d.getUTCDay() === 6) return new Date(d.getTime() - DAY);
    if (d.getUTCDay() === 0) return new Date(d.getTime() + DAY);
    return d;
  });
  const floating = [
    nthWeekday(year, 0, 1, 3),   // Martin Luther King Jr. Day
    nthWeekday(year, 1, 1, 3),   // Washington's Birthday
    lastWeekday(year, 4, 1),     // Memorial Day
    nthWeekday(year, 8, 1, 1),   // Labor Day
    nthWeekday(year, 9, 1, 2),   // Columbus / Indigenous Peoples' Day
    nthWeekday(year, 10, 4, 4),  // Thanksgiving
  ];
  return new Set([...fixed, ...floating].map(iso));
}

function isOffDay(d: Date): boolean {
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return true;
  // A holiday observed early in January can fall in the previous year's list, so check both years.
  return federalHolidays(d.getUTCFullYear()).has(iso(d)) || federalHolidays(d.getUTCFullYear() + 1).has(iso(d));
}

/** Last day of a period of `days` counted from `startISO` (YYYY-MM-DD). Returns YYYY-MM-DD, or null for a bad date. */
export function computeDueDate(startISO: string, days: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startISO);
  if (!m) return null;
  const start = utc(+m[1], +m[2] - 1, +m[3]);
  if (Number.isNaN(start.getTime()) || iso(start) !== startISO) return null;
  let due = new Date(start.getTime() + days * DAY);
  while (isOffDay(due)) due = new Date(due.getTime() + DAY);
  return iso(due);
}

export interface ComputedDeadline { rule: DeadlineRule; dueDate: string }

/** All deadlines that a trigger event sets off for this court. Empty = no rule on file (the chat says so, it never guesses). */
export function deadlinesFor(court: { level?: string | null; state?: string | null } | null | undefined, event: string, dateISO: string): ComputedDeadline[] {
  const out: ComputedDeadline[] = [];
  for (const rule of rulesForCourt(court)) {
    if (rule.event !== event) continue;
    const dueDate = computeDueDate(dateISO, rule.days);
    if (dueDate) out.push({ rule, dueDate });
  }
  return out;
}

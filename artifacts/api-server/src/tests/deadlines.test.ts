/**
 * deadlines.test.ts — date math and rule lookup (no database).
 * Run: pnpm --filter @workspace/api-server run test:deadlines
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDueDate, deadlinesFor, federalHolidays, rulesForCourt } from "../services/deadlines.js";

test("a period ending on a holiday rolls to the next court day", () => {
  // Mon Sept 21 2026 + 21 days = Mon Oct 12 2026 = Columbus Day (2nd Monday of October) -> Tue Oct 13.
  assert.equal(computeDueDate("2026-09-21", 21), "2026-10-13");
});

test("a period ending on a weekend rolls forward", () => {
  // Sun Sept 20 2026 + 21 = Sun Oct 11 -> Mon Oct 12 (holiday) -> Tue Oct 13.
  assert.equal(computeDueDate("2026-09-20", 21), "2026-10-13");
  // Sat Jan 3 2026 + 7 = Sat Jan 10 -> Mon Jan 12.
  assert.equal(computeDueDate("2026-01-03", 7), "2026-01-12");
});

test("an ordinary weekday end date is left alone", () => {
  // Mon Mar 2 2026 + 21 = Mon Mar 23 2026.
  assert.equal(computeDueDate("2026-03-02", 21), "2026-03-23");
});

test("federal holidays for 2026", () => {
  const h = federalHolidays(2026);
  assert.ok(h.has("2026-11-26")); // Thanksgiving
  assert.ok(h.has("2026-07-03")); // July 4 is a Saturday -> observed Friday
  assert.ok(h.has("2026-05-25")); // Memorial Day
  assert.ok(h.has("2026-09-07")); // Labor Day
  assert.ok(h.has("2026-12-25")); // Christmas (Friday)
});

test("bad dates are refused, never guessed", () => {
  assert.equal(computeDueDate("2026-02-30", 10), null);
  assert.equal(computeDueDate("not a date", 10), null);
});

test("rule lookup by court", () => {
  assert.equal(deadlinesFor({ level: "federal" }, "served_complaint", "2026-03-02")[0].rule.days, 21);
  assert.equal(deadlinesFor({ level: "state", state: "Kentucky" }, "served_complaint", "2026-03-02")[0].rule.days, 20);
  assert.equal(deadlinesFor({ level: "state", state: "Ohio" }, "served_complaint", "2026-03-02").length, 0); // no rule on file: say so, don't guess
  assert.equal(deadlinesFor(null, "served_complaint", "2026-03-02").length, 0);
  assert.equal(rulesForCourt({ level: "state", state: "kentucky" }).length > 0, true);
});

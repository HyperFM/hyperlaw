/**
 * buildCaseContext — assembles the persistent case memory block that is
 * prepended to every AI call (guidance, drafting, analysis).
 *
 * Queries three memory tables (memorySummaries, caseStrategyMemory,
 * litigationTimeline) and returns a compact, formatted context string.
 * Never throws — a failure returns "" so the AI call still proceeds.
 */
import { db, memorySummaries, caseStrategyMemory, litigationTimeline } from "@workspace/db";
import { and, eq, desc, asc, or } from "drizzle-orm";

export async function buildCaseContext(caseId: string): Promise<string> {
  try {
    const [summary, openStrategy, recentTimeline, openDeadlines] = await Promise.all([
      db.select()
        .from(memorySummaries)
        .where(and(eq(memorySummaries.caseId, caseId), eq(memorySummaries.summaryType, "rolling_case_summary")))
        .limit(1),

      db.select()
        .from(caseStrategyMemory)
        .where(and(eq(caseStrategyMemory.caseId, caseId), eq(caseStrategyMemory.status, "open")))
        .orderBy(desc(caseStrategyMemory.createdAt))
        .limit(8),

      db.select()
        .from(litigationTimeline)
        .where(eq(litigationTimeline.caseId, caseId))
        .orderBy(desc(litigationTimeline.eventDate))
        .limit(5),

      db.select()
        .from(litigationTimeline)
        .where(and(
          eq(litigationTimeline.caseId, caseId),
          or(eq(litigationTimeline.status, "upcoming"), eq(litigationTimeline.status, "missed")),
        ))
        .orderBy(asc(litigationTimeline.eventDate))
        .limit(5),
    ]);

    // Nothing recorded yet — return empty (existing caseData covers initial context)
    if (!summary[0]?.content && openStrategy.length === 0 && recentTimeline.length === 0) {
      return "";
    }

    const parts: string[] = [];

    if (summary[0]?.content) {
      parts.push(`Summary: ${summary[0].content}`);
    }

    if (openStrategy.length > 0) {
      parts.push(
        `Open strategic issues:\n${openStrategy
          .map(s => `• [${s.category}] ${s.content}`)
          .join("\n")}`,
      );
    }

    if (recentTimeline.length > 0) {
      parts.push(
        `Recent timeline:\n${recentTimeline
          .map(e => `• ${new Date(e.eventDate).toISOString().slice(0, 10)} — ${e.description} (${e.status})`)
          .join("\n")}`,
      );
    }

    const recentIds = new Set(recentTimeline.map(r => r.id));
    const extraDeadlines = openDeadlines.filter(d => !recentIds.has(d.id));
    if (extraDeadlines.length > 0) {
      parts.push(
        `Upcoming/unresolved:\n${extraDeadlines
          .map(e => `• ${new Date(e.eventDate).toISOString().slice(0, 10)} — ${e.description}`)
          .join("\n")}`,
      );
    }

    return parts.join("\n\n");
  } catch (err) {
    console.warn(`[caseContext] buildCaseContext failed for case ${caseId}:`, (err as Error).message);
    return "";
  }
}

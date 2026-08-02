/**
 * Admin AI Routes
 * Accessible only to accounts with isAdmin set (see routes/auth.ts registration flow)
 * Surfaces AI usage logs, cost stats, and cache analytics.
 */

import { Router, type Request, type Response } from "express";
import { getAuth } from "../services/auth.js";
import { db, aiLogsTable, aiAnalysisCacheTable, errorLogsTable } from "@workspace/db";
import { desc, eq, sql, and, gte, lte } from "drizzle-orm";

const router = Router();

async function requireAdmin(req: Request, res: Response): Promise<string | null> {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return null; }
  if (!req.user?.isAdmin) { res.status(403).json({ error: "Forbidden" }); return null; }
  return auth.userId;
}

// ── GET /admin/ai/logs ─────────────────────────────────────────────────────────
// Query params: page, limit, feature, userId, cacheHit
router.get("/admin/ai/logs", async (req: Request, res: Response): Promise<void> => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
  const offset = (page - 1) * limit;

  try {
    const conditions = [];
    if (req.query.feature) conditions.push(eq(aiLogsTable.feature, String(req.query.feature)));
    if (req.query.userId) conditions.push(eq(aiLogsTable.userId, String(req.query.userId)));
    if (req.query.cacheHit === "true") conditions.push(eq(aiLogsTable.cacheHit, true));
    if (req.query.cacheHit === "false") conditions.push(eq(aiLogsTable.cacheHit, false));

    const where = conditions.length ? and(...conditions) : undefined;

    const [logs, countRows] = await Promise.all([
      db.select().from(aiLogsTable)
        .where(where)
        .orderBy(desc(aiLogsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`cast(count(*) as int)` }).from(aiLogsTable).where(where),
    ]);

    res.json({ logs, total: countRows[0]?.count ?? 0, page, limit });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /admin/ai/stats ────────────────────────────────────────────────────────
router.get("/admin/ai/stats", async (req: Request, res: Response): Promise<void> => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  try {
    const [
      totals,
      cacheHits,
      byFeature,
      last30Days,
      cacheSize,
    ] = await Promise.all([
      // Overall totals
      db.select({
        totalCalls: sql<number>`cast(count(*) as int)`,
        totalInputTokens: sql<number>`cast(coalesce(sum(input_tokens), 0) as int)`,
        totalOutputTokens: sql<number>`cast(coalesce(sum(output_tokens), 0) as int)`,
        totalCostMicroUsd: sql<number>`cast(coalesce(sum(estimated_cost_micro_usd), 0) as bigint)`,
        avgResponseTimeMs: sql<number>`cast(coalesce(avg(response_time_ms), 0) as int)`,
      }).from(aiLogsTable),

      // Cache hit count
      db.select({ count: sql<number>`cast(count(*) as int)` })
        .from(aiLogsTable)
        .where(eq(aiLogsTable.cacheHit, true)),

      // Breakdown by feature
      db.select({
        feature: aiLogsTable.feature,
        calls: sql<number>`cast(count(*) as int)`,
        costMicroUsd: sql<number>`cast(coalesce(sum(estimated_cost_micro_usd), 0) as bigint)`,
        cacheHits: sql<number>`cast(sum(case when cache_hit then 1 else 0 end) as int)`,
      }).from(aiLogsTable).groupBy(aiLogsTable.feature).orderBy(desc(sql`sum(estimated_cost_micro_usd)`)),

      // Daily usage (last 30 days)
      db.select({
        day: sql<string>`to_char(created_at, 'YYYY-MM-DD')`,
        calls: sql<number>`cast(count(*) as int)`,
        costMicroUsd: sql<number>`cast(coalesce(sum(estimated_cost_micro_usd), 0) as bigint)`,
        cacheHits: sql<number>`cast(sum(case when cache_hit then 1 else 0 end) as int)`,
        avgResponseTimeMs: sql<number>`cast(coalesce(avg(case when cache_hit then null else response_time_ms end), 0) as int)`,
      }).from(aiLogsTable)
        .where(gte(aiLogsTable.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)))
        .groupBy(sql`to_char(created_at, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(created_at, 'YYYY-MM-DD')`),

      // Cache table size
      db.select({ count: sql<number>`cast(count(*) as int)` }).from(aiAnalysisCacheTable),
    ]);

    const totalCalls = totals[0]?.totalCalls ?? 0;
    const cacheHitCount = cacheHits[0]?.count ?? 0;

    res.json({
      totalCalls,
      totalInputTokens: totals[0]?.totalInputTokens ?? 0,
      totalOutputTokens: totals[0]?.totalOutputTokens ?? 0,
      totalCostMicroUsd: totals[0]?.totalCostMicroUsd ?? 0,
      avgResponseTimeMs: totals[0]?.avgResponseTimeMs ?? 0,
      cacheHitCount,
      cacheHitRate: totalCalls > 0 ? Math.round((cacheHitCount / totalCalls) * 100) : 0,
      cachedEntries: cacheSize[0]?.count ?? 0,
      byFeature,
      dailyStats: last30Days,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /admin/error-logs ──────────────────────────────────────────────────────
// Returns paginated server-side error logs (upload failures, processing errors).
router.get("/admin/error-logs", async (req: Request, res: Response): Promise<void> => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
  const offset = (page - 1) * limit;

  try {
    const [logs, countRows] = await Promise.all([
      db.select().from(errorLogsTable)
        .orderBy(desc(errorLogsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`cast(count(*) as int)` }).from(errorLogsTable),
    ]);
    res.json({ logs, total: countRows[0]?.count ?? 0, page, limit });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;

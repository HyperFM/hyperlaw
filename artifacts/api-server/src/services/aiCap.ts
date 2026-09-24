// Central daily cap for every route that calls a model. Mounted once in
// routes/index.ts so a new AI route can't be forgotten: anything matching
// AI_ROUTES is counted per user per day (in memory, independent of whether the
// route logs to ai_logs) AND checked against the logged real-call count.
// Admins are exempt. The per-handler checks in routes/ai.ts stay as a second layer.

import type { Request, Response, NextFunction } from "express";
import { getAuth } from "./auth.js";
import { checkDailyLimit, dailyLimit } from "./aiCache.js";

// POST routes that reach Claude or OpenAI (audit: routes/ai.ts, tutor, hearing-scripts, exhibit, transcript).
const AI_ROUTES: RegExp[] = [
  /^\/ai\/(?!estimate$|generated-documents)/,
  /^\/tutor\/help$/,
  /^\/hearing-scripts\/[^/]+\/generate$/,
  /^\/exhibit\/(court-script|generate|analyze-photos)$/,
  /^\/transcript\//,
];

const counts = new Map<string, number>(); // key: userId|YYYY-MM-DD
function todayKey(userId: string): string {
  return `${userId}|${new Date().toISOString().slice(0, 10)}`;
}

export async function aiDailyCap(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.method !== "POST" || !AI_ROUTES.some((r) => r.test(req.path))) { next(); return; }
  const { userId } = getAuth(req);
  if (!userId) { next(); return; } // route's own auth check returns the 401
  if (req.user?.isAdmin) { next(); return; }

  const limit = dailyLimit();
  const key = todayKey(userId);
  const used = counts.get(key) ?? 0;
  const logged = await checkDailyLimit(userId);
  if (used >= limit || !logged.allowed) {
    res.status(429).json({
      error: "You've reached today's AI limit. Everything you've done is saved — it resets tomorrow.",
      code: "rate_limited",
    });
    return;
  }
  counts.set(key, used + 1);
  if (counts.size > 5000) for (const k of counts.keys()) if (!k.endsWith(key.slice(-10))) counts.delete(k);
  next();
}

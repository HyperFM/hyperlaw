// Central spend gate for every route that calls a model. Mounted once in
// routes/index.ts so a new AI route can't be forgotten: anything matching
// AI_ROUTES is checked against real provider spend (per-user $ backstop and
// the global kill switch, see aiSpend.ts) before it can reach Claude/OpenAI.

import type { Request, Response, NextFunction } from "express";
import { getAuth } from "./auth.js";
import { checkSpend } from "./aiSpend.js";

// POST routes that reach Claude or OpenAI (audit: routes/ai.ts, tutor, hearing-scripts, exhibit, transcript).
const AI_ROUTES: RegExp[] = [
  /^\/ai\/(?!estimate$|generated-documents)/,
  /^\/tutor\/help$/,
  /^\/hearing-scripts\/[^/]+\/generate$/,
  /^\/exhibit\/(court-script|generate|analyze-photos)$/,
  /^\/transcript\//,
];

export async function aiDailyCap(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.method !== "POST" || !AI_ROUTES.some((r) => r.test(req.path))) { next(); return; }
  const { userId } = getAuth(req);
  if (!userId) { next(); return; } // the route's own auth check returns the 401
  const verdict = await checkSpend(userId, !!req.user?.isAdmin);
  if (!verdict.ok) { res.status(verdict.status).json({ error: verdict.error, code: verdict.code }); return; }
  next();
}

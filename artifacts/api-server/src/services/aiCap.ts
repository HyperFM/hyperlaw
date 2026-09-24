// Central spend gate for every route that calls a model. Mounted once in
// routes/index.ts so a new AI route can't be forgotten: anything matching
// AI_ROUTES is checked against real provider spend (per-user $ backstop and
// the global kill switch, see aiSpend.ts) before it can reach Claude/OpenAI.

import type { Request, Response, NextFunction } from "express";
import { getAuth } from "./auth.js";
import { checkSpend } from "./aiSpend.js";
import { isBillingEnabled, isUserWaived, TYPICAL_CREDITS } from "./billing.js";
import { storage } from "../storage.js";

// POST routes that reach Claude or OpenAI (audit: routes/ai.ts, tutor, hearing-scripts, exhibit, transcript).
const AI_ROUTES: RegExp[] = [
  /^\/ai\/(?!estimate$|generated-documents)/,
  /^\/tutor\/help$/,
  /^\/hearing-scripts\/[^/]+\/generate$/,
  /^\/exhibit\/(court-script|generate|analyze-photos)$/,
  /^\/transcript\//,
  /^\/intake\/chat$/,
];

// Multi-call actions that can cost real money. With billing on, they need a balance that covers a typical run BEFORE any provider call.
const EXPENSIVE: Array<[RegExp, string]> = [
  [/^\/exhibit\/generate$/, "exhibit_generate"],
  [/^\/exhibit\/court-script$/, "exhibit_court_script"],
  [/^\/exhibit\/analyze-photos$/, "exhibit_analyze_photos"],
  [/^\/hearing-scripts\/[^/]+\/generate$/, "hearing_script"],
];

export async function aiDailyCap(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.method !== "POST" || !AI_ROUTES.some((r) => r.test(req.path))) { next(); return; }
  const { userId } = getAuth(req);
  if (!userId) { next(); return; } // the route's own auth check returns the 401
  const verdict = await checkSpend(userId, !!req.user?.isAdmin);
  if (!verdict.ok) { res.status(verdict.status).json({ error: verdict.error, code: verdict.code }); return; }

  // Balance pre-check (web only; the iOS app has its own balance and check). Only when billing is on and the user pays.
  const hit = EXPENSIVE.find(([re]) => re.test(req.path));
  if (hit && req.get("X-Client-Platform") !== "ios" && (await isBillingEnabled()) && !(await isUserWaived(userId))) {
    const needed = TYPICAL_CREDITS[hit[1]] ?? 1;
    const balance = await storage.getCreditBalance(userId);
    if (balance < needed) {
      res.status(402).json({
        code: "insufficient_credits",
        error: `This needs about ${needed} credits and you have ${balance}. Add credits to continue.`,
        creditsNeeded: needed,
        creditBalance: balance,
      });
      return;
    }
  }
  next();
}

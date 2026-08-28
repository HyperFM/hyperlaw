// Stripe routes — temporarily stubbed while billing is disabled.
// All endpoints return graceful no-op responses so client-side calls don't crash.
import { Router, type Request, type Response } from 'express';
import { getAuth } from "../services/auth.js";
import { storage } from '../storage.js';

const router = Router();

// ── GET /stripe/credits ───────────────────────────────────────────────────────
router.get('/stripe/credits', async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  try {
    if (!userId) { res.json({ creditBalance: 0, planTier: 'free' }); return; }
    const [creditBalance, user] = await Promise.all([storage.getCreditBalance(userId), storage.getUser(userId)]);
    res.json({ creditBalance, planTier: user?.planTier ?? 'free' });
  } catch {
    res.json({ creditBalance: 0, planTier: 'free' });
  }
});

// ── POST /stripe/set-plan-tier ──────────────────────────────────────────────
// Test-only plan switcher while real Stripe billing is disabled (see the
// file header above) — only isAdmin/isTester accounts can call this. Real
// users still go through onBuyCredits (the Credit Shop) exactly as before;
// this exists so admin/tester accounts can freely switch tiers to test
// tier-gated features without needing live billing wired up.
const VALID_PLAN_TIERS = new Set(['free', 'prosay', 'apex']);
router.post('/stripe/set-plan-tier', async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const user = await storage.getUser(userId);
  if (!user?.isAdmin && !user?.isTester) {
    res.status(403).json({ error: 'Plan switching is only available for admin/tester accounts right now — real billing isn\'t wired up yet.' });
    return;
  }

  const { planTier } = req.body as { planTier?: string };
  if (!planTier || !VALID_PLAN_TIERS.has(planTier)) {
    res.status(400).json({ error: 'Invalid plan tier' });
    return;
  }

  await storage.setPlanTier(userId, planTier);
  res.json({ planTier });
});

// ── GET /stripe/products ──────────────────────────────────────────────────────
router.get('/stripe/products', (_req: Request, res: Response): void => {
  res.json({ data: [] });
});

// ── POST /stripe/checkout ─────────────────────────────────────────────────────
router.post('/stripe/checkout', (_req: Request, res: Response): void => {
  res.status(503).json({ error: 'Purchasing is temporarily unavailable.' });
});

// ── GET /stripe/portal ────────────────────────────────────────────────────────
router.get('/stripe/portal', (_req: Request, res: Response): void => {
  res.status(503).json({ error: 'Billing portal is temporarily unavailable.' });
});

export default router;

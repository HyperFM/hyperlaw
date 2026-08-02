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
    const creditBalance = userId ? await storage.getCreditBalance(userId) : 0;
    res.json({ creditBalance, planTier: 'free' });
  } catch {
    res.json({ creditBalance: 0, planTier: 'free' });
  }
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

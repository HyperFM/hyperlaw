// Stripe routes: credit packs, web checkout, credits balance, and the admin/tester plan switcher.
import { Router, type Request, type Response } from 'express';
import { getAuth } from "../services/auth.js";
import { storage } from '../storage.js';
import { isBillingEnabled, TYPICAL_CREDITS } from '../services/billing.js';
import { CREDIT_PACKS, packById } from '../services/creditPacks.js';
import { stripeService } from '../stripeService.js';
import { getUncachableStripeClient } from '../stripeClient.js';
import { logger } from '../lib/logger.js';

const router = Router();

// ── GET /stripe/credits ───────────────────────────────────────────────────────
router.get('/stripe/credits', async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  try {
    if (!userId) { res.json({ creditBalance: 0, planTier: 'free' }); return; }
    const [creditBalance, user] = await Promise.all([storage.getCreditBalance(userId), storage.getUser(userId)]);
    res.json({ creditBalance, planTier: user?.planTier ?? 'free', billingEnabled: await isBillingEnabled(), typicalCredits: TYPICAL_CREDITS });
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
// Served from the server-side pack list (services/creditPacks.ts), shaped like the Stripe product list
// the Credit Shop already expects. The price id IS the pack id, so a client can only ever ask for a known pack.
router.get('/stripe/products', (_req: Request, res: Response): void => {
  res.json({
    data: CREDIT_PACKS.map(p => ({
      id: p.id,
      name: p.name,
      description: null,
      metadata: { credits: String(p.credits), type: 'credit_pack' },
      prices: [{ id: p.id, unit_amount: p.amountCents, currency: 'usd', active: true }],
    })),
  });
});

// ── POST /stripe/checkout ─────────────────────────────────────────────────────
// Web only: in the iOS app digital credits must be bought through Apple's in-app purchase (Guideline 3.1.1),
// so this refuses iOS clients. Credits are granted by the webhook (app.ts), never by this route.
router.post('/stripe/checkout', async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: 'Please sign in first.' }); return; }
  if (req.get('X-Client-Platform') === 'ios') {
    res.status(403).json({ error: 'Credits in the app are purchased through Apple. Use the top-up in your profile.' });
    return;
  }
  if (!process.env.STRIPE_LIVE_API_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    res.status(503).json({ error: 'Purchasing is not switched on yet.' });
    return;
  }
  const { priceId } = req.body as { priceId?: string };
  const pack = packById(priceId);
  if (!pack) { res.status(400).json({ error: 'Unknown credit pack.' }); return; }

  try {
    const user = await storage.getUser(userId);
    const base = (process.env.PUBLIC_URL ?? 'https://hyperlaw.site').replace(/\/$/, '');
    const customerId = await stripeService.getOrCreateCustomer(userId, user?.email);
    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: { currency: 'usd', unit_amount: pack.amountCents, product_data: { name: pack.name } },
      }],
      success_url: `${base}/?checkout=success&credits=${pack.credits}`,
      cancel_url: `${base}/?checkout=cancelled`,
      client_reference_id: userId,
      // Server-decided, not user-supplied: the webhook credits exactly this.
      metadata: { userId, creditAmount: String(pack.credits), packId: pack.id },
    });
    res.json({ url: session.url });
  } catch (err) {
    logger.error({ err }, 'stripe checkout failed');
    res.status(502).json({ error: 'Could not start checkout. Please try again.' });
  }
});

// ── GET /stripe/portal ────────────────────────────────────────────────────────
router.get('/stripe/portal', (_req: Request, res: Response): void => {
  res.status(503).json({ error: 'Payment history is not available yet.' });
});

export default router;

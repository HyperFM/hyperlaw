import { Router, type Request, type Response } from 'express';
import { getAuth } from '@clerk/express';
import { storage } from '../storage.js';
import { stripeService } from '../stripeService.js';
import { getUncachableStripeClient } from '../stripeClient.js';

const router = Router();

function requireAuth(req: Request, res: Response, next: () => void): void {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
  next();
}

// ── GET /stripe/credits ───────────────────────────────────────────────────────
// Returns the authenticated user's current credit balance.
router.get('/stripe/credits', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  try {
    const creditBalance = await storage.getCreditBalance(userId!);
    res.json({ creditBalance });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /stripe/products ──────────────────────────────────────────────────────
// Lists active credit-pack products with their prices — queries Stripe API directly
// rather than the sync tables, which may not have data until webhooks arrive.
router.get('/stripe/products', async (_req: Request, res: Response): Promise<void> => {
  try {
    const stripe = await getUncachableStripeClient();
    const [rawProducts, rawPrices] = await Promise.all([
      stripe.products.list({ active: true, limit: 100 }),
      stripe.prices.list({ active: true, limit: 100 }),
    ]);

    // Only include products tagged as credit packs
    const creditProducts = rawProducts.data.filter(
      p => p.metadata?.type === 'credit_pack' || p.metadata?.credits
    );

    const pricesByProduct = new Map<string, typeof rawPrices.data>();
    for (const price of rawPrices.data) {
      const pid = typeof price.product === 'string' ? price.product : price.product.id;
      if (!pricesByProduct.has(pid)) pricesByProduct.set(pid, []);
      pricesByProduct.get(pid)!.push(price);
    }

    const data = creditProducts.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      metadata: p.metadata,
      prices: (pricesByProduct.get(p.id) ?? []).map(pr => ({
        id: pr.id,
        unit_amount: pr.unit_amount ?? 0,
        currency: pr.currency,
        active: pr.active,
      })),
    }));

    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /stripe/checkout ─────────────────────────────────────────────────────
// Creates a Stripe Checkout session for a one-time credit purchase.
// Body: { priceId: string; creditAmount: number; successPath?: string; cancelPath?: string }
router.post('/stripe/checkout', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  // Note: creditAmount is intentionally NOT accepted from the client.
  // The server looks it up from Stripe product metadata to prevent tampering.
  const { priceId, successPath = '/', cancelPath = '/' } = req.body as {
    priceId: string;
    successPath?: string;
    cancelPath?: string;
  };

  if (!priceId) { res.status(400).json({ error: 'priceId is required' }); return; }

  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const baseUrl = `${protocol}://${host}`;

    // successUrl includes checkout=success; credit count comes from webhook metadata
    const successUrl = `${baseUrl}${successPath}${successPath.includes('?') ? '&' : '?'}checkout=success`;
    const cancelUrl = `${baseUrl}${cancelPath}${cancelPath.includes('?') ? '&' : '?'}checkout=cancel`;

    const session = await stripeService.createCreditCheckout({
      userId,
      priceId,
      successUrl,
      cancelUrl,
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /stripe/portal ────────────────────────────────────────────────────────
// Creates a Stripe Billing Portal session to view payment history.
router.get('/stripe/portal', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const returnUrl = `${protocol}://${host}/`;

    const session = await stripeService.createPortalSession(userId, returnUrl);
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;

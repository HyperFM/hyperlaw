import { storage } from './storage.js';
import { getUncachableStripeClient } from './stripeClient.js';

export class StripeService {
  /** Create or retrieve the Stripe Customer ID for a user */
  async getOrCreateCustomer(userId: string, email?: string): Promise<string> {
    // Check if we already have one stored
    const existing = await storage.getStripeCustomerId(userId);
    if (existing) return existing;

    // Create a new Stripe customer
    const stripe = await getUncachableStripeClient();
    const customer = await stripe.customers.create({
      email,
      metadata: { userId },
    });

    await storage.updateUserStripeId(userId, customer.id);
    return customer.id;
  }

  /**
   * Create a Stripe Checkout session for a one-time credit purchase.
   *
   * metadata on the session carries userId + creditAmount so the webhook
   * can credit the user's balance when checkout.session.completed fires.
   */
  async createCreditCheckout(opts: {
    userId: string;
    email?: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
  }) {
    const customerId = await this.getOrCreateCustomer(opts.userId, opts.email);
    const stripe = await getUncachableStripeClient();

    // ── Server-authoritative credit amount ────────────────────────────────────
    // Never trust client-supplied creditAmount. Look up the product metadata
    // for the selected price so the webhook can credit the correct amount.
    const price = await stripe.prices.retrieve(opts.priceId, { expand: ['product'] });
    const product = price.product as { metadata?: Record<string, string> };
    const creditAmount = parseInt(product.metadata?.credits ?? '0', 10);
    if (!creditAmount || creditAmount < 1) {
      throw new Error('This price is not configured as a credit pack. Contact support.');
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: opts.priceId, quantity: 1 }],
      mode: 'payment',
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
      metadata: {
        userId: opts.userId,
        // Set by server from Stripe product metadata — not user-supplied
        creditAmount: String(creditAmount),
      },
    });

    return session;
  }

  /** Create a Stripe Billing Portal session for managing past payments */
  async createPortalSession(userId: string, returnUrl: string) {
    const customerId = await this.getStripeCustomerId(userId);
    if (!customerId) throw new Error('No Stripe customer found');
    const stripe = await getUncachableStripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return session;
  }

  private async getStripeCustomerId(userId: string): Promise<string | null> {
    return storage.getStripeCustomerId(userId);
  }
}

export const stripeService = new StripeService();

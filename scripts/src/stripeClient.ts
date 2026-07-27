import Stripe from 'stripe';

/**
 * Returns a fresh authenticated Stripe client.
 * Not cached -- reads the env var fresh each call so rotated keys are picked up.
 */
export async function getUncachableStripeClient(): Promise<Stripe> {
  if (!process.env.STRIPE_LIVE_API_KEY) {
    throw new Error('STRIPE_LIVE_API_KEY environment variable is required');
  }
  return new Stripe(process.env.STRIPE_LIVE_API_KEY);
}

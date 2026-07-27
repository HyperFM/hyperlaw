import Stripe from 'stripe';
import { StripeSync } from 'stripe-replit-sync';

function getStripeSecretKey(): string {
  if (!process.env.STRIPE_LIVE_API_KEY) {
    throw new Error('STRIPE_LIVE_API_KEY environment variable is required');
  }
  return process.env.STRIPE_LIVE_API_KEY;
}

/**
 * Returns a fresh authenticated Stripe client.
 * Not cached — tokens/keys can rotate, so always fetch fresh.
 */
export async function getUncachableStripeClient(): Promise<Stripe> {
  const secretKey = getStripeSecretKey();
  return new Stripe(secretKey);
}

/**
 * Returns a fresh StripeSync instance for webhook processing and data sync.
 * Not cached — fetches credentials on every call so rotated keys are picked up.
 */
export async function getStripeSync(): Promise<StripeSync> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const secretKey = getStripeSecretKey();

  return new StripeSync({
    poolConfig: { connectionString: databaseUrl },
    stripeSecretKey: secretKey,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  });
}

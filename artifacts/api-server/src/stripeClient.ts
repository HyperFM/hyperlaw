import Stripe from 'stripe';
import { StripeSync } from 'stripe-replit-sync';

/**
 * Fetches the Stripe secret key.
 * Prefers STRIPE_LIVE_API_KEY env var; falls back to Replit connector for
 * backwards compatibility in environments where only the connector is configured.
 */
async function getStripeSecretKey(): Promise<string> {
  // Direct env-var path (preferred)
  if (process.env.STRIPE_LIVE_API_KEY) {
    return process.env.STRIPE_LIVE_API_KEY;
  }

  // Replit connector fallback
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      'Stripe secret key not found. Set STRIPE_LIVE_API_KEY or connect Stripe via the Integrations tab.'
    );
  }

  const resp = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    {
      headers: { Accept: "application/json", "X-Replit-Token": xReplitToken },
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (!resp.ok) {
    throw new Error(`Failed to fetch Stripe credentials: ${resp.status} ${resp.statusText}`);
  }

  type ConnectorItem = { settings?: Record<string, string> };
  type ConnectorResp = { items?: ConnectorItem[] };
  const data = await resp.json() as ConnectorResp;
  const secret = data.items?.[0]?.settings?.secret;

  if (!secret) {
    throw new Error(
      'Stripe integration not connected or missing secret key. ' +
      'Set STRIPE_LIVE_API_KEY or connect Stripe via the Integrations tab.'
    );
  }

  return secret;
}

/**
 * Returns a fresh authenticated Stripe client.
 * Not cached — tokens/keys can rotate, so always fetch fresh.
 */
export async function getUncachableStripeClient(): Promise<Stripe> {
  const secretKey = await getStripeSecretKey();
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

  const secretKey = await getStripeSecretKey();

  return new StripeSync({
    poolConfig: { connectionString: databaseUrl },
    stripeSecretKey: secretKey,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  });
}

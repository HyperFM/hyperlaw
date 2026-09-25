import path from "node:path";
import fs from "node:fs";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { sessionMiddleware, passport } from "./middlewares/passportConfig";
import router from "./routes";
import { logger } from "./lib/logger";
import { WebhookHandlers } from "./webhookHandlers.js";
import type Stripe from "stripe";
import { getUncachableStripeClient } from "./stripeClient.js";
import { storage } from "./storage.js";

const app: Express = express();

// Trust the first proxy hop so express-rate-limit resolves the real client IP
// instead of collapsing all requests onto the reverse-proxy address.
app.set("trust proxy", 1);

// ── Stripe webhook — MUST be registered BEFORE express.json() ─────────────────
// Stripe requires the raw Buffer body for signature verification.
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      res.status(400).json({ error: 'Missing stripe-signature header' });
      return;
    }

    const sig = Array.isArray(signature) ? signature[0] : signature;

    if (!Buffer.isBuffer(req.body)) {
      logger.error('Stripe webhook body is not a Buffer — express.json() may have run first');
      res.status(500).json({ error: 'Webhook processing error' });
      return;
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret || !process.env.STRIPE_LIVE_API_KEY) {
      logger.error('Stripe webhook received but STRIPE_WEBHOOK_SECRET / STRIPE_LIVE_API_KEY are not set');
      res.status(503).json({ error: 'Webhook not configured' });
      return;
    }

    // Verify the signature ourselves. Credits must never depend on the (optional) data-sync library below.
    let event: Stripe.Event;
    try {
      const stripe = await getUncachableStripeClient();
      event = stripe.webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
    } catch (err) {
      logger.warn({ err }, 'Stripe webhook signature verification failed');
      res.status(400).json({ error: 'Invalid signature' });
      return;
    }

    try {
      // 1. Credit fulfillment FIRST. A non-2xx makes Stripe retry, and the idempotency guard makes retries safe.
      if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
        const session = event.data.object as Stripe.Checkout.Session;
        const sessionId = session.id;
        const userId = session.metadata?.userId;
        const creditAmount = parseInt(session.metadata?.creditAmount ?? '0', 10);

        if (session.payment_status !== 'paid') {
          logger.info({ sessionId, status: session.payment_status }, 'Checkout completed but not paid yet — waiting for async success');
        } else if (userId && creditAmount > 0 && sessionId) {
          // UNIQUE-constraint guard: only the first delivery credits the user.
          const recorded = await storage.markSessionProcessed(sessionId, userId, creditAmount);
          if (!recorded) {
            logger.warn({ sessionId, userId }, 'Duplicate webhook delivery — skipping credit fulfillment');
          } else {
            const newBalance = await storage.addCredits(userId, creditAmount);
            logger.info({ sessionId, userId, creditAmount, newBalance }, 'Credits added after checkout');
          }
        }
      }

      // 2. Best-effort data sync (analytics/reporting). Never allowed to fail the webhook.
      try {
        await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      } catch (err) {
        logger.warn({ err }, 'Stripe data sync failed (credits were already handled)');
      }

      res.status(200).json({ received: true });
    } catch (err) {
      logger.error({ err }, 'Stripe webhook error');
      res.status(400).json({ error: 'Webhook processing error' });
    }
  },
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

app.use("/api", router);

// ── Serve the built frontend (legal-screen-builder) for everything else ───────
// Populated by `pnpm --filter @workspace/legal-screen-builder run build` (see
// Render's build command). In local dev, run the frontend separately instead
// via `pnpm --filter @workspace/legal-screen-builder run dev` for Vite's HMR —
// this block only serves whatever static build last landed in that dist dir,
// and simply falls through to a 404 if it hasn't been built yet.
const frontendDist = path.resolve(
  import.meta.dirname,
  "../../legal-screen-builder/dist/public",
);
const frontendIndexHtml = path.join(frontendDist, "index.html");

app.use(
  express.static(frontendDist, {
    setHeaders: (res, filePath) => {
      // Vite's /assets/* bundles are content-hashed (a new build gets a new
      // filename), so they're safe to cache forever. Everything else,
      // index.html above all, must always revalidate — express.static's
      // default (max-age=0 with no explicit directive) is weak enough that
      // a CDN or mobile browser sitting in front can still hand back a
      // stale copy instead of actually revalidating on every request.
      if (path.relative(frontendDist, filePath).startsWith(`assets${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  }),
);
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api") || !fs.existsSync(frontendIndexHtml)) {
    next();
    return;
  }
  res.set("Cache-Control", "no-cache");
  res.sendFile(frontendIndexHtml);
});

export default app;

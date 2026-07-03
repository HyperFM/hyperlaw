import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { WebhookHandlers } from "./webhookHandlers.js";
import { storage } from "./storage.js";

const app: Express = express();

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

    try {
      // 1. Sync Stripe data to the stripe schema tables
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);

      // 2. Handle application events (credit fulfillment)
      const event = JSON.parse((req.body as Buffer).toString()) as {
        type: string;
        data: { object: Record<string, unknown> };
      };

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const sessionId = session.id as string | undefined;
        const userId = (session.metadata as Record<string, string> | null)?.userId;
        const creditAmount = parseInt(
          (session.metadata as Record<string, string> | null)?.creditAmount ?? '0',
          10,
        );

        if (userId && creditAmount > 0 && sessionId) {
          // ── Idempotency guard ────────────────────────────────────────────────
          // Stripe may retry webhook deliveries; markSessionProcessed uses a
          // UNIQUE constraint so only the first delivery credits the user.
          const recorded = await storage.markSessionProcessed(sessionId, userId, creditAmount);
          if (!recorded) {
            logger.warn({ sessionId, userId }, 'Duplicate webhook delivery — skipping credit fulfillment');
          } else {
            const newBalance = await storage.addCredits(userId, creditAmount);
            logger.info({ sessionId, userId, creditAmount, newBalance }, 'Credits added after checkout');
          }
        }
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

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

export default app;

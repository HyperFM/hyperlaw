import path from "node:path";
import fs from "node:fs";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { sessionMiddleware, passport } from "./middlewares/passportConfig";
import router from "./routes";
import { logger } from "./lib/logger";
import { WebhookHandlers } from "./webhookHandlers.js";
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

// ── Apple In-App Purchase routes (iOS pay-as-you-go only) ────────────────────
// Web/Stripe billing is untouched — see routes/stripe.ts. This funds the
// separate iosPaygBalanceMicroUsd column, only ever spent by iOS AI calls
// (see services/iosPayg.ts and its call sites in routes/ai.ts).
import { Router, type Request, type Response } from "express";
import { getAuth } from "../services/auth.js";
import { storage } from "../storage.js";
import { verifyAppleTransaction, VerificationException } from "../appleIapClient.js";

const router = Router();

// Server-authoritative product → credit map. Never trust a client-supplied
// amount — same principle as stripeService.createCreditCheckout() re-deriving
// creditAmount from Stripe product metadata rather than the client.
const PRODUCT_CREDIT_MICRO_USD: Record<string, number> = {
  "com.hyperlaw.app.payg.topup": 500_000, // $1 purchase → $0.50 of AI-cost budget
};

// ── GET /iap/balance ─────────────────────────────────────────────────────────
router.get("/iap/balance", async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const balanceMicroUsd = await storage.getIosPaygBalance(userId);
  res.json({ balanceMicroUsd });
});

// ── POST /iap/verify-purchase ─────────────────────────────────────────────────
router.post("/iap/verify-purchase", async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { signedTransactionInfo } = req.body as { signedTransactionInfo?: string };
  if (!signedTransactionInfo) {
    res.status(400).json({ ok: false, code: "invalid_transaction", error: "Missing signedTransactionInfo" });
    return;
  }

  let verified;
  try {
    verified = await verifyAppleTransaction(signedTransactionInfo);
  } catch (err) {
    const message = err instanceof VerificationException ? "Could not verify transaction with Apple" : "Verification failed";
    res.status(400).json({ ok: false, code: "invalid_transaction", error: message });
    return;
  }

  const amountMicroUsd = PRODUCT_CREDIT_MICRO_USD[verified.productId];
  if (!amountMicroUsd) {
    res.status(400).json({ ok: false, code: "invalid_transaction", error: `Unknown product: ${verified.productId}` });
    return;
  }

  const isNewlyProcessed = await storage.markAppleTransactionProcessed(
    verified.transactionId,
    userId,
    verified.productId,
    amountMicroUsd,
  );

  if (!isNewlyProcessed) {
    // Already credited on a previous call (e.g. StoreKit re-presenting an
    // unfinished transaction after relaunch) — client should still finish
    // the transaction locally, just without crediting again.
    const balanceMicroUsd = await storage.getIosPaygBalance(userId);
    res.status(409).json({ ok: false, code: "already_processed", balanceMicroUsd });
    return;
  }

  const balanceMicroUsd = await storage.addIosPaygBalance(userId, amountMicroUsd);
  res.json({ ok: true, balanceMicroUsd });
});

export default router;

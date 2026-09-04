import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SignedDataVerifier,
  Environment,
  VerificationException,
  VerificationStatus,
  type JWSTransactionDecodedPayload,
} from "@apple/app-store-server-library";

const ROOT_CA_PATH = join(import.meta.dirname, "certs", "AppleRootCA-G3.cer");

function getBundleId(): string {
  if (!process.env.APPLE_APP_BUNDLE_ID) {
    throw new Error("APPLE_APP_BUNDLE_ID environment variable is required");
  }
  return process.env.APPLE_APP_BUNDLE_ID;
}

/** Not cached — mirrors stripeClient.ts's "always fetch fresh" convention;
 *  cheap to construct, and picks up rotated env vars without a restart. */
function buildVerifier(environment: Environment): SignedDataVerifier {
  const rootCa = readFileSync(ROOT_CA_PATH);
  const bundleId = getBundleId();
  const enableOnlineChecks = true;
  // appAppleId is only required for Environment.PRODUCTION, and we don't
  // currently need it (no App Store Server *API* calls yet, verification only).
  return new SignedDataVerifier([rootCa], enableOnlineChecks, environment, bundleId);
}

export interface VerifiedAppleTransaction {
  transactionId: string;
  productId: string;
  purchaseDate: Date;
}

/**
 * Verifies a signed transaction JWS (as returned by StoreKit on-device after a
 * purchase) and returns its decoded, Apple-signed fields. Never trust
 * client-decoded fields — this is the only place transactionId/productId
 * should be read from for crediting purposes.
 *
 * Tries PRODUCTION first, then falls back to SANDBOX — a single endpoint on
 * this app serves both real purchases and TestFlight/sandbox testing, and
 * Apple's own guidance is to attempt both rather than branch on request origin.
 */
export async function verifyAppleTransaction(
  signedTransactionInfo: string,
): Promise<VerifiedAppleTransaction> {
  let decoded: JWSTransactionDecodedPayload;
  try {
    decoded = await buildVerifier(Environment.PRODUCTION).verifyAndDecodeTransaction(
      signedTransactionInfo,
    );
  } catch (err) {
    if (!(err instanceof VerificationException)) throw err;
    decoded = await buildVerifier(Environment.SANDBOX).verifyAndDecodeTransaction(
      signedTransactionInfo,
    );
  }

  if (!decoded.transactionId || !decoded.productId) {
    throw new VerificationException(
      VerificationStatus.VERIFICATION_FAILURE,
      new Error("Verified transaction is missing transactionId or productId"),
    );
  }

  return {
    transactionId: decoded.transactionId,
    productId: decoded.productId,
    purchaseDate: decoded.purchaseDate ? new Date(decoded.purchaseDate) : new Date(),
  };
}

export { VerificationException };

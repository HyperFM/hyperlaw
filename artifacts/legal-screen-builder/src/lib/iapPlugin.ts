import { registerPlugin } from "@capacitor/core";

export interface PurchaseResult {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  /** Signed JWS transaction string — POST this to /api/iap/verify-purchase.
   *  Never trust the other fields above for crediting; they're for display/
   *  bookkeeping only. */
  jwsRepresentation: string;
}

export interface HyperLawIAPPlugin {
  purchase(options: { productId: string }): Promise<PurchaseResult>;
  finishTransaction(options: { transactionId: string }): Promise<void>;
  restorePurchases(): Promise<void>;
}

export const iapPlugin = registerPlugin<HyperLawIAPPlugin>("HyperLawIAP");

/** The single consumable product this app sells — see also
 *  artifacts/api-server/src/routes/appleIap.ts's PRODUCT_CREDIT_MICRO_USD map. */
export const IOS_PAYG_TOPUP_PRODUCT_ID = "com.hyperlaw.app.payg.topup";

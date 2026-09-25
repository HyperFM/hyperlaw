// Credit packs are defined here, on the server — never taken from the client and never dependent on
// products having been set up in the Stripe dashboard. 1 credit = $0.05 (see services/aiRates.ts).
export interface CreditPack { id: string; credits: number; amountCents: number; name: string; firstPurchaseOnly?: boolean }

export const CREDIT_PACKS: CreditPack[] = [
  // One-time trial so a new person can really try the AI for a dollar. Same rate: $0.05 a credit.
  { id: "first1", credits: 20, amountCents: 100, name: "HyperLaw credits — starter (20)", firstPurchaseOnly: true },
  { id: "topup5", credits: 100, amountCents: 500, name: "HyperLaw credits — 100" },
];

export function packById(id: string | undefined): CreditPack | null {
  return CREDIT_PACKS.find(p => p.id === id) ?? null;
}

// Apple's cheapest tier is $0.99, so the iOS starter grants $0.99 of balance at face value (same as the $5 top-up).
export const IOS_FIRST_PRODUCT_ID = "com.hyperlaw.app.payg.first";
export const IOS_FIRST_MICRO_USD = 990_000;

/** Who may buy what. Members (Pro-Say / Apex) never top up — their plan covers usage; free/pay-as-you-go accounts do. */
export function topUpState(planTier: string | null | undefined, purchaseCount: number): { canTopUp: boolean; firstTopUpAvailable: boolean } {
  const canTopUp = planTier !== "apex" && planTier !== "prosay";
  return { canTopUp, firstTopUpAvailable: canTopUp && purchaseCount === 0 };
}

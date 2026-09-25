// Credit packs are defined here, on the server — never taken from the client and never dependent on
// products having been set up in the Stripe dashboard. 1 credit = $0.05 (see services/aiRates.ts).
export interface CreditPack { id: string; credits: number; amountCents: number; name: string }

export const CREDIT_PACKS: CreditPack[] = [
  { id: "topup5", credits: 100, amountCents: 500, name: "HyperLaw credits — 100" },
];

export function packById(id: string | undefined): CreditPack | null {
  return CREDIT_PACKS.find(p => p.id === id) ?? null;
}

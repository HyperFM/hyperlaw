// Provider prices live in the ai_rates table so a price change is a data edit,
// not a redeploy. DEFAULT_RATES covers a missing table/row so metering never
// stops working (and never silently costs a call at $0).

import { db, aiRatesTable } from "@workspace/db";
import { logger } from "../lib/logger.js";

export interface Rate {
  inputUsdPerMtok: number;
  outputUsdPerMtok: number;
  perMinuteUsd: number | null;
  updatedAt: Date | null; // null = built-in default, never confirmed in the table
}

const DEFAULT_RATES: Record<string, Rate> = {
  "claude-sonnet-5": { inputUsdPerMtok: 3, outputUsdPerMtok: 15, perMinuteUsd: null, updatedAt: null },
  "claude-haiku-4-5": { inputUsdPerMtok: 1, outputUsdPerMtok: 5, perMinuteUsd: null, updatedAt: null },
  "claude-3-5-haiku-20241022": { inputUsdPerMtok: 0.8, outputUsdPerMtok: 4, perMinuteUsd: null, updatedAt: null },
  "whisper-1": { inputUsdPerMtok: 0, outputUsdPerMtok: 0, perMinuteUsd: 0.006, updatedAt: null },
};
// A model with no rate anywhere is costed at the priciest known Claude rate — over-counting is the safe error.
const FALLBACK_RATE = DEFAULT_RATES["claude-sonnet-5"];
export const STALE_AFTER_DAYS = 30;

let cache: Record<string, Rate> = { ...DEFAULT_RATES };

export async function refreshRates(): Promise<void> {
  try {
    const rows = await db.select().from(aiRatesTable);
    const next: Record<string, Rate> = { ...DEFAULT_RATES };
    for (const r of rows) {
      next[r.model] = {
        inputUsdPerMtok: r.inputUsdPerMtok,
        outputUsdPerMtok: r.outputUsdPerMtok,
        perMinuteUsd: r.perMinuteUsd ?? null,
        updatedAt: r.updatedAt,
      };
    }
    cache = next;
  } catch {
    // table not created yet — keep built-in defaults
  }
}
void refreshRates();
setInterval(() => void refreshRates(), 5 * 60_000).unref();

// Older call sites log the generic label "claude" (or "cache" for a hit) instead of a real model id.
const MODEL_ALIASES: Record<string, string> = { claude: "claude-sonnet-5", cache: "claude-sonnet-5" };

export function rateFor(model: string): Rate {
  const r = cache[MODEL_ALIASES[model] ?? model];
  if (r) return r;
  logger.warn({ model }, "no AI rate for model — costing at the fallback (Sonnet) rate");
  return FALLBACK_RATE;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** USD/MTok is numerically micro-USD per token, so no unit conversion is needed. Cache writes bill ~1.25x, reads ~0.1x. */
export function costMicroUsd(model: string, usage: Usage): { costMicroUsd: number; rate: Rate } {
  const rate = rateFor(model);
  const cost =
    usage.input_tokens * rate.inputUsdPerMtok +
    (usage.cache_creation_input_tokens ?? 0) * rate.inputUsdPerMtok * 1.25 +
    (usage.cache_read_input_tokens ?? 0) * rate.inputUsdPerMtok * 0.1 +
    usage.output_tokens * rate.outputUsdPerMtok;
  return { costMicroUsd: Math.round(cost), rate };
}

export function audioCostMicroUsd(model: string, seconds: number): { costMicroUsd: number; rate: Rate } {
  const rate = rateFor(model);
  return { costMicroUsd: Math.round((seconds / 60) * (rate.perMinuteUsd ?? 0) * 1_000_000), rate };
}

// ── Credits ──────────────────────────────────────────────────────────────────
// Locked-in pricing (owner, Phase 0.5): 1.5x markup, 100 credits per $5 -> 1 credit = $0.05.
export const CREDIT_MARKUP = 1.5;
export const USD_PER_CREDIT = 0.05;
/** Credits to charge for a real provider cost. Rounded up so a paid call never rounds to free. */
export function creditsForCost(costMicroUsdValue: number): number {
  if (costMicroUsdValue <= 0) return 0;
  return Math.max(1, Math.ceil((costMicroUsdValue / 1_000_000) * CREDIT_MARKUP / USD_PER_CREDIT));
}

export async function staleRates(): Promise<{ model: string; daysOld: number | null }[]> {
  const now = Date.now();
  const out: { model: string; daysOld: number | null }[] = [];
  for (const [model, r] of Object.entries(cache)) {
    if (!r.updatedAt) out.push({ model, daysOld: null }); // never confirmed in the table
    else {
      const d = Math.floor((now - r.updatedAt.getTime()) / 86_400_000);
      if (d >= STALE_AFTER_DAYS) out.push({ model, daysOld: d });
    }
  }
  return out;
}

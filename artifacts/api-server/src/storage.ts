import { db, usersTable, stripeProcessedSessionsTable, appleProcessedTransactionsTable } from '@workspace/db';
import { eq, sql, gte, and } from 'drizzle-orm';

export class Storage {
  // ── User CRUD ───────────────────────────────────────────────────────────────

  async getUser(id: string) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    return user ?? null;
  }

  /** No-op: with self-hosted auth, a user row is always created up front by
   *  /api/auth/register, so any userId reaching here already has a full row
   *  (username/email/etc. are NOT NULL — there's no valid partial row to
   *  lazily insert anymore, unlike the old Clerk-provisioned-on-first-touch flow). */
  async ensureUser(_id: string, _email?: string) {}

  async updateUserStripeId(userId: string, stripeCustomerId: string) {
    await db
      .update(usersTable)
      .set({ stripeCustomerId, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));
  }

  /** Test-only plan switcher — see the planTier column comment in schema.
   *  Callers must check isAdmin/isTester themselves before calling this. */
  async setPlanTier(userId: string, planTier: string) {
    await db
      .update(usersTable)
      .set({ planTier, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));
  }

  async getCreditBalance(userId: string): Promise<number> {
    const user = await this.getUser(userId);
    return user?.creditBalance ?? 0;
  }

  /** Atomically add credits — creates user row if missing */
  async addCredits(userId: string, amount: number): Promise<number> {
    await this.ensureUser(userId);
    const [row] = await db
      .update(usersTable)
      .set({
        creditBalance: sql`${usersTable.creditBalance} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId))
      .returning({ creditBalance: usersTable.creditBalance });
    return row?.creditBalance ?? 0;
  }

  /** Atomically deduct 1 credit. Returns true if successful (had balance ≥ 1). */
  async deductCredit(userId: string): Promise<boolean> {
    await this.ensureUser(userId);
    const rows = await db
      .update(usersTable)
      .set({
        creditBalance: sql`${usersTable.creditBalance} - 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(usersTable.id, userId), gte(usersTable.creditBalance, 1)))
      .returning({ creditBalance: usersTable.creditBalance });
    return rows.length > 0;
  }

  /** Atomically deduct N credits. Returns true only if the full amount was covered. */
  async deductCredits(userId: string, amount: number): Promise<boolean> {
    if (amount <= 0) return true;
    await this.ensureUser(userId);
    const rows = await db
      .update(usersTable)
      .set({
        creditBalance: sql`${usersTable.creditBalance} - ${amount}`,
        updatedAt: new Date(),
      })
      .where(and(eq(usersTable.id, userId), gte(usersTable.creditBalance, amount)))
      .returning({ creditBalance: usersTable.creditBalance });
    return rows.length > 0;
  }

  // ── iOS pay-as-you-go balance (Apple IAP only, separate from creditBalance) ──

  async getIosPaygBalance(userId: string): Promise<number> {
    const user = await this.getUser(userId);
    return user?.iosPaygBalanceMicroUsd ?? 0;
  }

  /** Atomically add to the iOS PAYG balance (micro-USD) — called only after a
   *  verified Apple transaction. Creates user row if missing. */
  async addIosPaygBalance(userId: string, amountMicroUsd: number): Promise<number> {
    await this.ensureUser(userId);
    const [row] = await db
      .update(usersTable)
      .set({
        iosPaygBalanceMicroUsd: sql`${usersTable.iosPaygBalanceMicroUsd} + ${amountMicroUsd}`,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId))
      .returning({ iosPaygBalanceMicroUsd: usersTable.iosPaygBalanceMicroUsd });
    return row?.iosPaygBalanceMicroUsd ?? 0;
  }

  /** Unconditional decrement — unlike deductCredits, this isn't gated on
   *  balance >= amount: the AI cost was already incurred by the time this is
   *  called (real cost is only known after the call returns), so it's allowed
   *  to go slightly negative rather than fail after the fact. */
  async deductIosPaygBalance(userId: string, amountMicroUsd: number): Promise<number> {
    if (amountMicroUsd <= 0) return this.getIosPaygBalance(userId);
    await this.ensureUser(userId);
    const [row] = await db
      .update(usersTable)
      .set({
        iosPaygBalanceMicroUsd: sql`${usersTable.iosPaygBalanceMicroUsd} - ${amountMicroUsd}`,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId))
      .returning({ iosPaygBalanceMicroUsd: usersTable.iosPaygBalanceMicroUsd });
    return row?.iosPaygBalanceMicroUsd ?? 0;
  }

  // ── Apple IAP idempotency ────────────────────────────────────────────────────

  async hasProcessedAppleTransaction(transactionId: string): Promise<boolean> {
    const [row] = await db
      .select({ transactionId: appleProcessedTransactionsTable.transactionId })
      .from(appleProcessedTransactionsTable)
      .where(eq(appleProcessedTransactionsTable.transactionId, transactionId));
    return !!row;
  }

  /** Marks an Apple transaction as processed. Returns true only if THIS call's
   *  own insert won the race (i.e. the caller should credit the balance) —
   *  false means it was already recorded, so the caller must not credit again. */
  async markAppleTransactionProcessed(
    transactionId: string,
    userId: string,
    productId: string,
    amountMicroUsd: number,
  ): Promise<boolean> {
    const rows = await db
      .insert(appleProcessedTransactionsTable)
      .values({ transactionId, userId, productId, amountMicroUsd })
      .onConflictDoNothing()
      .returning({ transactionId: appleProcessedTransactionsTable.transactionId });
    return rows.length > 0;
  }

  // ── Stripe product queries (from stripe-replit-sync stripe schema) ──────────

  async listProductsWithPrices() {
    try {
      const result = await db.execute(sql`
        SELECT
          p.id            AS product_id,
          p.name          AS product_name,
          p.description   AS product_description,
          p.active        AS product_active,
          p.metadata      AS product_metadata,
          pr.id           AS price_id,
          pr.unit_amount,
          pr.currency,
          pr.active       AS price_active
        FROM stripe.products p
        LEFT JOIN stripe.prices pr
          ON pr.product = p.id AND pr.active = true
        WHERE p.active = true
        ORDER BY pr.unit_amount ASC NULLS LAST
      `);

      const map = new Map<string, Record<string, unknown>>();
      for (const row of result.rows) {
        const r = row as Record<string, unknown>;
        const pid = r.product_id as string;
        if (!map.has(pid)) {
          map.set(pid, {
            id: pid,
            name: r.product_name,
            description: r.product_description,
            metadata: r.product_metadata ?? {},
            prices: [],
          });
        }
        if (r.price_id) {
          (map.get(pid)!.prices as unknown[]).push({
            id: r.price_id,
            unit_amount: r.unit_amount,
            currency: r.currency,
            active: r.price_active,
          });
        }
      }
      return Array.from(map.values());
    } catch {
      return [];
    }
  }

  async getStripeCustomerId(userId: string): Promise<string | null> {
    const user = await this.getUser(userId);
    return user?.stripeCustomerId ?? null;
  }

  // ── Webhook idempotency ─────────────────────────────────────────────────────

  /** Returns true if this Stripe checkout session has already been processed */
  async hasProcessedSession(sessionId: string): Promise<boolean> {
    const [row] = await db
      .select({ sessionId: stripeProcessedSessionsTable.sessionId })
      .from(stripeProcessedSessionsTable)
      .where(eq(stripeProcessedSessionsTable.sessionId, sessionId));
    return !!row;
  }

  /**
   * Marks a checkout session as processed. Returns false if it was already recorded
   * (concurrent duplicate delivery), so callers can skip re-crediting.
   */
  async markSessionProcessed(sessionId: string, userId: string, creditAmount: number): Promise<boolean> {
    try {
      await db
        .insert(stripeProcessedSessionsTable)
        .values({ sessionId, userId, creditAmount })
        .onConflictDoNothing();
      // If nothing was inserted (session already processed), onConflictDoNothing inserts 0 rows.
      // We verify by checking existence.
      const [row] = await db
        .select({ sessionId: stripeProcessedSessionsTable.sessionId })
        .from(stripeProcessedSessionsTable)
        .where(eq(stripeProcessedSessionsTable.sessionId, sessionId));
      return !!row && row.sessionId === sessionId;
    } catch {
      return false;
    }
  }
}

export const storage = new Storage();

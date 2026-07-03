import { db, usersTable, stripeProcessedSessionsTable } from '@workspace/db';
import { eq, sql, gte, and } from 'drizzle-orm';

export class Storage {
  // ── User CRUD ───────────────────────────────────────────────────────────────

  async getUser(id: string) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    return user ?? null;
  }

  async ensureUser(id: string, email?: string) {
    await db
      .insert(usersTable)
      .values({ id, email: email ?? null })
      .onConflictDoNothing();
  }

  async updateUserStripeId(userId: string, stripeCustomerId: string) {
    await db
      .update(usersTable)
      .set({ stripeCustomerId, updatedAt: new Date() })
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

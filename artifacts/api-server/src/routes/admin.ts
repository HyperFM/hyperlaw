import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { db, chatSessionsTable, messagesTable, notificationsTable, usersTable, stripeProcessedSessionsTable, generatedDocumentsTable } from "@workspace/db";
import { eq, desc, asc, sql } from "drizzle-orm";
import { getClerkUserEmail } from "./feedback";

const router = Router();
const ADMIN_EMAIL = "hyperlawcompliance@gmail.com";

async function requireAdmin(req: Request, res: Response): Promise<string | null> {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const info = await getClerkUserEmail(auth.userId);
  if (info?.email !== ADMIN_EMAIL) { res.status(403).json({ error: "Forbidden" }); return null; }
  return auth.userId;
}

router.get("/admin/users", async (req: Request, res: Response): Promise<void> => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) { res.status(500).json({ error: "No secret key" }); return; }

  const r = await fetch("https://api.clerk.com/v1/users?limit=100&order_by=-created_at", {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const users = await r.json();
  res.json(users);
});

router.get("/admin/chat-sessions", async (req: Request, res: Response): Promise<void> => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const sessions = await db.select().from(chatSessionsTable).orderBy(desc(chatSessionsTable.createdAt));
  res.json(sessions);
});

router.post("/admin/chat/:userId", async (req: Request, res: Response): Promise<void> => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const userId = String(req.params.userId);
  const { userEmail, userName } = req.body as { userEmail?: string; userName?: string };

  const existing = await db.select().from(chatSessionsTable).where(eq(chatSessionsTable.userId, userId));
  if (existing.length > 0) { res.json(existing[0]); return; }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const [session] = await db.insert(chatSessionsTable).values({
    userId,
    userEmail: userEmail ?? "",
    userName: userName ?? "",
    status: "temporary",
    retentionDays: 30,
    expiresAt,
  }).returning();

  res.json(session);
});

router.get("/admin/messages/:sessionId", async (req: Request, res: Response): Promise<void> => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const sessionId = String(req.params.sessionId);
  const msgs = await db.select().from(messagesTable)
    .where(eq(messagesTable.sessionId, sessionId))
    .orderBy(asc(messagesTable.createdAt));
  res.json(msgs);
});

router.post("/admin/messages/:sessionId", async (req: Request, res: Response): Promise<void> => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const sessionId = String(req.params.sessionId);
  const { body } = req.body as { body: string };
  if (!body?.trim()) { res.status(400).json({ error: "Message required" }); return; }

  const sessions = await db.select().from(chatSessionsTable).where(eq(chatSessionsTable.id, sessionId));
  if (!sessions.length) { res.status(404).json({ error: "Session not found" }); return; }

  const [msg] = await db.insert(messagesTable).values({
    sessionId,
    fromAdmin: true,
    body: body.trim(),
  }).returning();

  await db.insert(notificationsTable).values({
    userId: sessions[0].userId,
    title: "New message from HyperLaw",
    body: body.trim().slice(0, 120),
    type: "admin_message",
    metadata: { sessionId },
  });

  res.json(msg);
});

// ── GET /admin/platform-stats ─────────────────────────────────────────────────
// Returns aggregate platform metrics: users, docs by status, credits sold, revenue.
router.get("/admin/platform-stats", async (req: Request, res: Response): Promise<void> => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  try {
    // Users registered in HyperLaw DB (may be < Clerk total if new users haven't used AI yet)
    const [userCountRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable);

    // Generated documents grouped by paymentStatus
    const docRows = await db
      .select({
        paymentStatus: generatedDocumentsTable.paymentStatus,
        count: sql<number>`count(*)::int`,
      })
      .from(generatedDocumentsTable)
      .groupBy(generatedDocumentsTable.paymentStatus);

    const totalDocs = docRows.reduce((sum, r) => sum + r.count, 0);
    const unlockedDocs = docRows.find(r => r.paymentStatus === "paid")?.count ?? 0;
    const previewDocs = docRows.find(r => r.paymentStatus === "preview")?.count ?? 0;

    // Credits sold via Stripe checkout (sum from idempotency table)
    const [creditsRow] = await db
      .select({ total: sql<number>`coalesce(sum(credit_amount), 0)::int` })
      .from(stripeProcessedSessionsTable);

    // Stripe revenue — try stripe schema first, fall back to 0
    let stripeRevenueCents = 0;
    try {
      const revResult = await db.execute(
        sql`SELECT COALESCE(SUM(amount), 0)::bigint AS total FROM stripe.payment_intents WHERE status = 'succeeded'`
      );
      stripeRevenueCents = parseInt(String((revResult.rows[0] as Record<string, unknown>)?.total ?? "0"), 10);
    } catch {
      // stripe schema may not be populated yet — return 0
    }

    res.json({
      totalUsers: userCountRow?.count ?? 0,
      totalDocs,
      unlockedDocs,
      previewDocs,
      creditsSold: creditsRow?.total ?? 0,
      stripeRevenueCents,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch platform stats" });
  }
});

router.put("/admin/sessions/:sessionId/retention", async (req: Request, res: Response): Promise<void> => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const sessionId = String(req.params.sessionId);
  const { status, retentionDays } = req.body as { status: string; retentionDays: number | null };

  let expiresAt: Date | undefined;
  if (status === "temporary" && retentionDays) {
    expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + retentionDays);
  }

  const [updated] = await db.update(chatSessionsTable)
    .set({ status, retentionDays: retentionDays ?? null, expiresAt })
    .where(eq(chatSessionsTable.id, sessionId))
    .returning();

  res.json(updated);
});

export default router;

import { Router, type Request, type Response } from "express";
import { getAuth } from "../services/auth.js";
import { db, chatSessionsTable, messagesTable, notificationsTable, usersTable, stripeProcessedSessionsTable, generatedDocumentsTable } from "@workspace/db";
import { eq, desc, asc, sql } from "drizzle-orm";

const router = Router();

// Admin status is the real isAdmin column (granted only through the gated
// admin-registration flow in routes/auth.ts), not an email-string match —
// req.user is already the full row via passport's deserializeUser.
async function requireAdmin(req: Request, res: Response): Promise<string | null> {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return null; }
  if (!req.user?.isAdmin) { res.status(403).json({ error: "Forbidden" }); return null; }
  return auth.userId;
}

router.get("/admin/users", async (req: Request, res: Response): Promise<void> => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const users = await db
    .select({
      id: usersTable.id, username: usersTable.username, firstName: usersTable.firstName,
      lastName: usersTable.lastName, email: usersTable.email, emailVerified: usersTable.emailVerified,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(desc(usersTable.createdAt))
    .limit(100);
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
    // Total registered users
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

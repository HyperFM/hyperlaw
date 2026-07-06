import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { casesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

// ── GET /cases ─────────────────────────────────────────────────────────────────
router.get("/cases", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const cases = await db
    .select()
    .from(casesTable)
    .where(eq(casesTable.userId, auth.userId))
    .orderBy(desc(casesTable.updatedAt));

  res.json(cases);
});

// ── POST /cases — upsert (create or update) ────────────────────────────────────
router.post("/cases", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { id, title, workflowStage, caseData } = req.body as {
    id: string;
    title: string;
    workflowStage: string;
    caseData: Record<string, unknown>;
  };

  if (!id || !title) { res.status(400).json({ error: "Missing id or title" }); return; }

  // Check ownership before deciding insert vs update — prevents cross-tenant overwrites
  const [existing] = await db
    .select({ userId: casesTable.userId })
    .from(casesTable)
    .where(eq(casesTable.id, id));

  if (existing) {
    // Case already exists — only update if this user owns it
    if (existing.userId !== auth.userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await db
      .update(casesTable)
      .set({
        title: title || "Untitled Case",
        workflowStage: workflowStage ?? "parties",
        caseData: caseData ?? {},
        updatedAt: new Date(),
      })
      .where(eq(casesTable.id, id));
  } else {
    // New case — insert (onConflictDoNothing guards against rare parallel requests)
    await db
      .insert(casesTable)
      .values({
        id,
        userId: auth.userId,
        title: title || "Untitled Case",
        workflowStage: workflowStage ?? "parties",
        caseData: caseData ?? {},
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }

  res.json({ ok: true });
});

// ── PATCH /cases/:id/structured — save Organization Engine output ──────────────
router.patch("/cases/:id/structured", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { structuredCase } = req.body as { structuredCase: Record<string, unknown> };
  if (!structuredCase) { res.status(400).json({ error: "Missing structuredCase" }); return; }

  await db
    .update(casesTable)
    .set({ structuredCase, updatedAt: new Date() })
    .where(and(eq(casesTable.id, req.params.id), eq(casesTable.userId, auth.userId)));

  res.json({ ok: true });
});

// ── DELETE /cases/:id ──────────────────────────────────────────────────────────
router.delete("/cases/:id", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  await db
    .delete(casesTable)
    .where(and(eq(casesTable.id, req.params.id), eq(casesTable.userId, auth.userId)));

  res.json({ ok: true });
});

export default router;

import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "../services/auth.js";
import { db, hearingScripts, hearingScriptSections, casesTable, generatedDocumentsTable, uploadedDocumentsTable } from "@workspace/db";
import { and, eq, asc, desc, ne } from "drizzle-orm";
import { generateHearingScript } from "../services/hearingScript.js";

const router = Router();

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  (req as any).userId = userId;
  next();
}

async function loadSections(scriptId: string) {
  return db.select().from(hearingScriptSections)
    .where(eq(hearingScriptSections.scriptId, scriptId))
    .orderBy(asc(hearingScriptSections.sortOrder));
}

// ── List hearing scripts for a case ────────────────────────────────────────────
router.get("/hearing-scripts", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;
  const rawCaseId = req.query.caseId;
  const caseId = typeof rawCaseId === "string" ? rawCaseId : undefined;
  if (!caseId) { res.status(400).json({ error: "caseId is required" }); return; }
  try {
    const rows = await db.select().from(hearingScripts)
      .where(and(eq(hearingScripts.userId, userId), eq(hearingScripts.caseId, caseId)))
      .orderBy(desc(hearingScripts.hearingDate));
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch hearing scripts" });
  }
});

// ── Get one hearing script with its sections ──────────────────────────────────
router.get("/hearing-scripts/:id", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;
  const id = String(req.params.id);
  try {
    const [script] = await db.select().from(hearingScripts)
      .where(and(eq(hearingScripts.id, id), eq(hearingScripts.userId, userId)));
    if (!script) { res.status(404).json({ error: "Not found" }); return; }
    const sections = await loadSections(id);
    res.json({ ...script, sections });
  } catch {
    res.status(500).json({ error: "Failed to fetch hearing script" });
  }
});

// ── Create a hearing script shell (no AI call yet) ────────────────────────────
router.post("/hearing-scripts", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;
  const { caseId, title, hearingDate, court, division, judge } = req.body as {
    caseId?: string; title?: string; hearingDate?: string | null;
    court?: string | null; division?: string | null; judge?: string | null;
  };
  if (!caseId || !title?.trim()) {
    res.status(400).json({ error: "caseId and title are required" });
    return;
  }
  try {
    const [script] = await db.insert(hearingScripts).values({
      userId,
      caseId,
      title: title.trim(),
      hearingDate: hearingDate ? new Date(hearingDate) : null,
      court: court ?? null,
      division: division ?? null,
      judge: judge ?? null,
    }).returning();
    res.status(201).json({ ...script, sections: [] });
  } catch {
    res.status(500).json({ error: "Failed to create hearing script" });
  }
});

// ── Prepare the script for the person's next hearing — automatically ─────────────
// The script is meant to be waiting for them, not something they have to start: it is built from the case's most
// recent filings and the Index (which already holds the next hearing date once they've told us about it).
// Idempotent: if a live (not yet delivered, not in the past) script exists, that one is returned and nothing is spent.
router.post("/hearing-scripts/auto", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;
  const { caseId } = req.body as { caseId?: string };
  if (!caseId) { res.status(400).json({ error: "caseId is required" }); return; }

  const [row] = await db.select().from(casesTable).where(and(eq(casesTable.id, caseId), eq(casesTable.userId, userId)));
  if (!row) { res.status(404).json({ error: "Case not found" }); return; }

  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const existing = await db.select().from(hearingScripts).where(and(eq(hearingScripts.userId, userId), eq(hearingScripts.caseId, caseId)));
  const live = existing
    .filter(s => s.status !== "delivered" && s.status !== "archived" && (!s.hearingDate || s.hearingDate >= startOfToday))
    .sort((a, b) => (a.hearingDate?.getTime() ?? Infinity) - (b.hearingDate?.getTime() ?? Infinity) || b.updatedAt.getTime() - a.updatedAt.getTime());
  if (live.length) {
    res.json({ script: { ...live[0], sections: await loadSections(live[0].id) }, created: false });
    return;
  }

  const c = (row.caseData ?? {}) as Record<string, any>;
  const sc = (row.structuredCase ?? c.structuredCase ?? {}) as Record<string, any>;
  const todayISO = new Date().toISOString().slice(0, 10);
  const hearing = ((sc.nextUp ?? []) as Array<{ text?: string; dueDate?: string | null }>)
    .filter(i => i.dueDate && i.dueDate >= todayISO && /hearing|court date|trial|conference|oral argument|motion/i.test(i.text ?? ""))
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0];

  const gen = await db.select({ id: generatedDocumentsTable.id, title: generatedDocumentsTable.title, type: generatedDocumentsTable.documentType })
    .from(generatedDocumentsTable)
    .where(and(eq(generatedDocumentsTable.userId, userId), eq(generatedDocumentsTable.caseId, caseId), ne(generatedDocumentsTable.status, "archived")))
    .orderBy(desc(generatedDocumentsTable.createdAt)).limit(3);
  const up = gen.length ? [] : await db.select({ id: uploadedDocumentsTable.id })
    .from(uploadedDocumentsTable)
    .where(and(eq(uploadedDocumentsTable.userId, userId), eq(uploadedDocumentsTable.caseId, caseId)))
    .orderBy(desc(uploadedDocumentsTable.createdAt)).limit(3);

  const hasMaterial = gen.length > 0 || up.length > 0 || !!sc.executiveSummary || (sc.claims ?? []).length > 0;
  if (!hasMaterial) { res.json({ script: null, created: false, needsMaterial: true }); return; }

  const latestMotion = gen.find(g => g.type === "motion");
  const pretty = hearing?.dueDate ? new Date(`${hearing.dueDate}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null;
  const title = pretty ? `Hearing — ${pretty}` : latestMotion ? `Hearing on ${latestMotion.title}`.slice(0, 120) : "Next hearing";

  try {
    const [script] = await db.insert(hearingScripts).values({
      userId, caseId, title,
      hearingDate: hearing?.dueDate ? new Date(`${hearing.dueDate}T12:00:00Z`) : null,
      court: (c.court?.name as string | undefined) ?? (String(c.jurisdiction ?? "").trim() || null),
      sourceGeneratedDocIds: gen.map(g => g.id),
      sourceUploadedDocIds: up.map(u => u.id),
    }).returning();
    const result = await generateHearingScript({
      caseId, userId, hearingDate: script.hearingDate, court: script.court, division: null, judge: null,
      sourceGeneratedDocIds: gen.map(g => g.id), sourceUploadedDocIds: up.map(u => u.id),
    });
    await db.insert(hearingScriptSections).values(result.sections.map((s, i) => ({
      scriptId: script.id, sortOrder: i, heading: s.heading, body: s.body, triggerType: s.triggerType, conditionNote: s.conditionNote,
    })));
    const [updated] = await db.update(hearingScripts).set({ version: 2, lastGeneratedAt: new Date(), updatedAt: new Date() }).where(eq(hearingScripts.id, script.id)).returning();
    res.json({ script: { ...updated, sections: await loadSections(script.id) }, created: true });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message || "Couldn't prepare your script right now — try again." });
  }
});

// ── Add a section by hand (the manual path) ──────────────────────────────────────
router.post("/hearing-scripts/:id/sections", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;
  const id = String(req.params.id);
  const { heading, body, triggerType } = req.body as { heading?: string; body?: string; triggerType?: string };
  if (!heading?.trim() || !body?.trim()) { res.status(400).json({ error: "heading and body are required" }); return; }
  const [owned] = await db.select({ id: hearingScripts.id }).from(hearingScripts).where(and(eq(hearingScripts.id, id), eq(hearingScripts.userId, userId)));
  if (!owned) { res.status(404).json({ error: "Not found" }); return; }
  const existing = await loadSections(id);
  const [section] = await db.insert(hearingScriptSections).values({
    scriptId: id,
    sortOrder: existing.length ? Math.max(...existing.map(s => s.sortOrder)) + 1 : 0,
    heading: heading.trim().slice(0, 200),
    body: body.trim().slice(0, 8000),
    triggerType: ["opening", "responsive", "closing", "conditional"].includes(triggerType ?? "") ? triggerType! : "responsive",
    conditionNote: null,
  }).returning();
  res.status(201).json(section);
});

// ── Generate (or regenerate) a script's sections ──────────────────────────────
// Always leaves status as "draft" — even when regenerating a previously-
// "ready" script — since auto-promoting back to ready would reintroduce the
// exact "stale and nobody knows" failure this feature exists to prevent.
// The caller re-marks it ready manually once they've reviewed the new draft.
router.post("/hearing-scripts/:id/generate", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;
  const id = String(req.params.id);
  const { sourceGeneratedDocIds, sourceUploadedDocIds } = req.body as {
    sourceGeneratedDocIds?: string[]; sourceUploadedDocIds?: string[];
  };

  const [script] = await db.select().from(hearingScripts)
    .where(and(eq(hearingScripts.id, id), eq(hearingScripts.userId, userId)));
  if (!script) { res.status(404).json({ error: "Not found" }); return; }

  const priorSections = await loadSections(id);

  let result: Awaited<ReturnType<typeof generateHearingScript>>;
  try {
    result = await generateHearingScript({
      caseId: script.caseId,
      userId,
      hearingDate: script.hearingDate,
      court: script.court,
      division: script.division,
      judge: script.judge,
      sourceGeneratedDocIds: sourceGeneratedDocIds ?? (script.sourceGeneratedDocIds as string[]),
      sourceUploadedDocIds: sourceUploadedDocIds ?? (script.sourceUploadedDocIds as string[]),
      priorSections: priorSections.length > 0
        ? priorSections.map(s => ({ heading: s.heading, body: s.body, triggerType: s.triggerType, conditionNote: s.conditionNote }))
        : undefined,
    });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message || "Generation failed" });
    return;
  }

  try {
    await db.delete(hearingScriptSections).where(eq(hearingScriptSections.scriptId, id));
    await db.insert(hearingScriptSections).values(
      result.sections.map((s, i) => ({
        scriptId: id,
        sortOrder: i,
        heading: s.heading,
        body: s.body,
        triggerType: s.triggerType,
        conditionNote: s.conditionNote,
      })),
    );
    const [updated] = await db.update(hearingScripts).set({
      status: "draft",
      version: script.version + 1,
      lastGeneratedAt: new Date(),
      sourceGeneratedDocIds: sourceGeneratedDocIds ?? script.sourceGeneratedDocIds,
      sourceUploadedDocIds: sourceUploadedDocIds ?? script.sourceUploadedDocIds,
      updatedAt: new Date(),
    }).where(eq(hearingScripts.id, id)).returning();
    const sections = await loadSections(id);
    res.json({ ...updated, sections });
  } catch {
    res.status(500).json({ error: "Generated the script but failed to save it" });
  }
});

// ── Update metadata/status ─────────────────────────────────────────────────────
router.patch("/hearing-scripts/:id", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;
  const id = String(req.params.id);
  const { title, hearingDate, court, division, judge, status } = req.body as {
    title?: string; hearingDate?: string | null; court?: string | null;
    division?: string | null; judge?: string | null; status?: string;
  };
  try {
    const [script] = await db.update(hearingScripts).set({
      ...(title?.trim() ? { title: title.trim() } : {}),
      ...(hearingDate !== undefined ? { hearingDate: hearingDate ? new Date(hearingDate) : null } : {}),
      ...(court !== undefined ? { court } : {}),
      ...(division !== undefined ? { division } : {}),
      ...(judge !== undefined ? { judge } : {}),
      ...(status ? { status } : {}),
      updatedAt: new Date(),
    }).where(and(eq(hearingScripts.id, id), eq(hearingScripts.userId, userId))).returning();
    if (!script) { res.status(404).json({ error: "Not found" }); return; }
    const sections = await loadSections(id);
    res.json({ ...script, sections });
  } catch {
    res.status(500).json({ error: "Failed to update hearing script" });
  }
});

// ── Edit/reorder/mark-delivered a single section ──────────────────────────────
router.patch("/hearing-scripts/:id/sections/:sectionId", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;
  const { id, sectionId } = req.params as { id: string; sectionId: string };
  const { heading, body, delivered, sortOrder } = req.body as {
    heading?: string; body?: string; delivered?: boolean; sortOrder?: number;
  };
  try {
    const [owned] = await db.select({ id: hearingScripts.id }).from(hearingScripts)
      .where(and(eq(hearingScripts.id, id), eq(hearingScripts.userId, userId)));
    if (!owned) { res.status(404).json({ error: "Not found" }); return; }

    const [section] = await db.update(hearingScriptSections).set({
      ...(heading !== undefined ? { heading } : {}),
      ...(body !== undefined ? { body } : {}),
      ...(delivered !== undefined ? { delivered } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
      updatedAt: new Date(),
    }).where(and(eq(hearingScriptSections.id, sectionId), eq(hearingScriptSections.scriptId, id))).returning();
    if (!section) { res.status(404).json({ error: "Section not found" }); return; }
    res.json(section);
  } catch {
    res.status(500).json({ error: "Failed to update section" });
  }
});

// ── Post-hearing capture ───────────────────────────────────────────────────────
router.patch("/hearing-scripts/:id/post-hearing", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;
  const id = String(req.params.id);
  const { me, judge, opposingCounsel } = req.body as { me?: string; judge?: string; opposingCounsel?: string };
  try {
    const [script] = await db.update(hearingScripts).set({
      postHearingSummaryMe: me ?? null,
      postHearingSummaryJudge: judge ?? null,
      postHearingSummaryOpposingCounsel: opposingCounsel ?? null,
      postHearingCapturedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(hearingScripts.id, id), eq(hearingScripts.userId, userId))).returning();
    if (!script) { res.status(404).json({ error: "Not found" }); return; }
    res.json(script);
  } catch {
    res.status(500).json({ error: "Failed to save post-hearing notes" });
  }
});

// ── Delete a hearing script (sections cascade) ─────────────────────────────────
router.delete("/hearing-scripts/:id", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;
  const id = String(req.params.id);
  try {
    const result = await db.delete(hearingScripts)
      .where(and(eq(hearingScripts.id, id), eq(hearingScripts.userId, userId)))
      .returning({ id: hearingScripts.id });
    if (result.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.status(204).end();
  } catch {
    res.status(500).json({ error: "Failed to delete hearing script" });
  }
});

export default router;

/**
 * Knowledge Library CRUD routes.
 *
 * GET  /knowledge/search?q=&category=&jurisdiction=  — public search (no auth)
 * GET  /knowledge                                     — admin only: list all
 * POST /knowledge                                     — admin only: create
 * PATCH /knowledge/:id                               — admin only: update
 * DELETE /knowledge/:id                              — admin only: delete
 */
import { Router, type Request, type Response } from "express";
import { getAuth } from "../services/auth.js";
import { db, knowledgeLibraryTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { pool } from "@workspace/db";
import { searchLibrary } from "../services/knowledgeLibrary.js";

const router = Router();

/** Returns userId if the requester is an admin (real isAdmin column, granted
 *  only through the gated registration flow in routes/auth.ts); otherwise
 *  writes 401/403 and returns null. */
async function requireAdmin(req: Request, res: Response): Promise<string | null> {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return null; }
  if (!req.user?.isAdmin) { res.status(403).json({ error: "Forbidden" }); return null; }
  return auth.userId;
}

// ── GET /knowledge/search — user-facing, no auth required ─────────────────────
router.get("/knowledge/search", async (req: Request, res: Response) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const jurisdiction = typeof req.query.jurisdiction === "string" ? req.query.jurisdiction : undefined;
  const limit = Math.min(Number(req.query.limit) || 5, 20);

  if (!q.trim()) { res.json([]); return; }
  try {
    const entries = await searchLibrary({ query: q, category, jurisdiction, limit });
    res.json(entries);
  } catch {
    res.status(500).json({ error: "Search failed" });
  }
});

// ── GET /knowledge — admin: list all entries ──────────────────────────────────
router.get("/knowledge", async (req: Request, res: Response): Promise<void> => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;
  try {
    const { rows } = await pool.query(
      `SELECT id, title, summary, body, category, tags, keywords, jurisdiction, source,
              is_active AS "isActive", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM knowledge_library
       ORDER BY created_at DESC`,
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch library" });
  }
});

// ── POST /knowledge — admin: create ──────────────────────────────────────────
router.post("/knowledge", async (req: Request, res: Response): Promise<void> => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;
  const { title, summary, body, category, tags, keywords, jurisdiction, source, isActive } = req.body as {
    title: string; summary: string; body: string;
    category?: string; tags?: string[]; keywords?: string[];
    jurisdiction?: string; source?: string; isActive?: boolean;
  };
  if (!title?.trim() || !summary?.trim() || !body?.trim()) {
    res.status(400).json({ error: "title, summary, and body are required" });
    return;
  }
  try {
    const [entry] = await db.insert(knowledgeLibraryTable).values({
      title: title.trim(),
      summary: summary.trim(),
      body: body.trim(),
      category: category ?? "other",
      tags: tags ?? [],
      keywords: keywords ?? [],
      jurisdiction: jurisdiction?.trim() || null,
      source: source?.trim() || null,
      isActive: isActive ?? true,
    }).returning();
    res.status(201).json(entry);
  } catch {
    res.status(500).json({ error: "Failed to create entry" });
  }
});

// ── PATCH /knowledge/:id — admin: update ──────────────────────────────────────
router.patch("/knowledge/:id", async (req: Request, res: Response): Promise<void> => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;
  const id = String(req.params.id);
  const { title, summary, body, category, tags, keywords, jurisdiction, source, isActive } = req.body as {
    title?: string; summary?: string; body?: string;
    category?: string; tags?: string[]; keywords?: string[];
    jurisdiction?: string | null; source?: string | null; isActive?: boolean;
  };
  try {
    const [entry] = await db.update(knowledgeLibraryTable)
      .set({
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(summary !== undefined ? { summary: summary.trim() } : {}),
        ...(body !== undefined ? { body: body.trim() } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(tags !== undefined ? { tags } : {}),
        ...(keywords !== undefined ? { keywords } : {}),
        ...(jurisdiction !== undefined ? { jurisdiction: jurisdiction || null } : {}),
        ...(source !== undefined ? { source: source || null } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        updatedAt: new Date(),
      })
      .where(eq(knowledgeLibraryTable.id, id))
      .returning();
    if (!entry) { res.status(404).json({ error: "Not found" }); return; }
    res.json(entry);
  } catch {
    res.status(500).json({ error: "Failed to update entry" });
  }
});

// ── DELETE /knowledge/:id — admin: delete ─────────────────────────────────────
router.delete("/knowledge/:id", async (req: Request, res: Response): Promise<void> => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;
  const id = String(req.params.id);
  try {
    const result = await db.delete(knowledgeLibraryTable)
      .where(eq(knowledgeLibraryTable.id, id))
      .returning({ id: knowledgeLibraryTable.id });
    if (result.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.status(204).end();
  } catch {
    res.status(500).json({ error: "Failed to delete entry" });
  }
});

export default router;

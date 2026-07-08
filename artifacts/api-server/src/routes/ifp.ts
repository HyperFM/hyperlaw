// ── IFP (In Forma Pauperis) template library ───────────────────────────────────
// Admin-managed fee-waiver form templates keyed by jurisdiction, plus a single
// generic Appendix A fallback used when no jurisdiction-specific form is found.
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db, ifpTemplatesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { isAdminUser } from "../services/credits.js";

const router = Router();

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
}
async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!(await isAdminUser(userId))) { res.status(403).json({ error: "Forbidden" }); return; }
  next();
}

// Appendix A — generic fee-waiver intake used as the fallback template.
const GENERIC_IFP_FIELDS: Array<{ key: string; label: string; type?: string }> = [
  { key: "case_caption", label: "Case Caption (court, parties, case number)", type: "textarea" },
  { key: "affiant_identity", label: "Your full legal name, address, and phone", type: "textarea" },
  { key: "employment", label: "Employment — employer, occupation, and monthly pay (or state that you are unemployed)", type: "textarea" },
  { key: "household", label: "Household size and dependents you support", type: "textarea" },
  { key: "monthly_income", label: "Monthly income from all sources (wages, benefits, support)", type: "textarea" },
  { key: "monthly_expenses", label: "Monthly expenses (rent/mortgage, utilities, food, transport, medical)", type: "textarea" },
  { key: "assets", label: "Assets (cash, bank accounts, vehicles, real estate)", type: "textarea" },
  { key: "debts", label: "Debts and obligations (loans, credit cards, arrears)", type: "textarea" },
  { key: "closing", label: "Statement of your inability to pay court fees", type: "textarea" },
];

const GENERIC_IFP_BODY = `GENERIC APPLICATION TO PROCEED WITHOUT PREPAYMENT OF FEES (IN FORMA PAUPERIS) — APPENDIX A

Assemble a formal fee-waiver affidavit for a self-represented (pro se) litigant using the applicant's answers. Structure the document with these sections, drawing ONLY on the answers provided (insert a clearly marked [BRACKETED PLACEHOLDER] wherever a detail is missing):

1. CASE CAPTION — court name, parties, and case number.
2. AFFIDAVIT / DECLARATION OF INDIGENCY — affiant's identity and a statement made under penalty of perjury.
3. EMPLOYMENT — current employment, occupation, and gross monthly pay (or unemployment status).
4. HOUSEHOLD — household size and dependents.
5. MONTHLY INCOME — itemized income from all sources.
6. MONTHLY EXPENSES — itemized necessary living expenses.
7. ASSETS — cash, accounts, vehicles, and property.
8. DEBTS AND OBLIGATIONS — outstanding debts.
9. STATEMENT OF INABILITY TO PAY — a concise statement that the applicant cannot pay court fees without hardship.
10. SIGNATURE BLOCK — a signature line and date for the applicant (do NOT include a judge's order or a notary block).

Do not fabricate financial figures. This is a general template, not legal advice.`;

async function ensureGenericTemplate() {
  const [g] = await db.select().from(ifpTemplatesTable).where(eq(ifpTemplatesTable.isGeneric, true));
  if (g) return g;
  const [row] = await db.insert(ifpTemplatesTable).values({
    jurisdiction: null,
    title: "Generic Fee-Waiver Application (Appendix A)",
    formName: null,
    sourceUrl: null,
    body: GENERIC_IFP_BODY,
    fields: GENERIC_IFP_FIELDS,
    isGeneric: true,
    isActive: true,
  }).returning();
  return row;
}

// GET /ifp-templates/match?jurisdiction= — best template for a jurisdiction, else generic
router.get("/ifp-templates/match", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const jurisdiction = typeof req.query.jurisdiction === "string" ? req.query.jurisdiction : "";
  const all = await db.select().from(ifpTemplatesTable).where(eq(ifpTemplatesTable.isActive, true));
  const j = jurisdiction.toLowerCase().trim();
  const match = j
    ? all.find(t => t.jurisdiction && !t.isGeneric &&
        (j.includes(t.jurisdiction.toLowerCase()) || t.jurisdiction.toLowerCase().includes(j)))
    : undefined;
  const generic = all.find(t => t.isGeneric) ?? await ensureGenericTemplate();
  res.json({ template: match ?? generic, isFallback: !match });
});

// ── Admin CRUD ─────────────────────────────────────────────────────────────────
router.get("/ifp-templates", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const rows = await db.select().from(ifpTemplatesTable).orderBy(desc(ifpTemplatesTable.updatedAt));
  res.json(rows);
});

router.post("/ifp-templates", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const b = req.body as Partial<typeof ifpTemplatesTable.$inferInsert>;
  if (!b.title) { res.status(400).json({ error: "title is required" }); return; }
  const [row] = await db.insert(ifpTemplatesTable).values({
    jurisdiction: b.jurisdiction ?? null,
    title: b.title,
    formName: b.formName ?? null,
    sourceUrl: b.sourceUrl ?? null,
    body: b.body ?? "",
    fields: b.fields ?? [],
    isActive: b.isActive ?? true,
    isGeneric: false,
  }).returning();
  res.json(row);
});

router.patch("/ifp-templates/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const b = req.body as Partial<typeof ifpTemplatesTable.$inferInsert>;
  const changes: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ["jurisdiction", "title", "formName", "sourceUrl", "body", "fields", "isActive"] as const) {
    if (b[k] !== undefined) changes[k] = b[k];
  }
  const [row] = await db.update(ifpTemplatesTable).set(changes)
    .where(eq(ifpTemplatesTable.id, String(req.params.id))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/ifp-templates/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const [existing] = await db.select().from(ifpTemplatesTable).where(eq(ifpTemplatesTable.id, String(req.params.id)));
  if (existing?.isGeneric) { res.status(400).json({ error: "The generic fallback template cannot be deleted." }); return; }
  await db.delete(ifpTemplatesTable).where(eq(ifpTemplatesTable.id, String(req.params.id)));
  res.status(204).end();
});

export default router;

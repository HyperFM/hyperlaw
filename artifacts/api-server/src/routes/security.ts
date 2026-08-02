// ── Account security routes (PIN + WebAuthn enrollment) ────────────────────────
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "../services/auth.js";
import {
  getSecurityStatus, setPin, verifyPin, isValidPinFormat,
  issueWebauthnChallenge, enrollWebauthn, disableWebauthn,
} from "../services/security.js";

const router = Router();

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  (req as Request & { userId?: string }).userId = userId;
  next();
}
const uid = (req: Request): string => (req as Request & { userId: string }).userId;

// GET /security/status — does the user have a PIN? Is WebAuthn enrolled?
router.get("/security/status", requireAuth, async (req: Request, res: Response): Promise<void> => {
  res.json(await getSecurityStatus(uid(req)));
});

// POST /security/pin — set or change the account PIN
router.post("/security/pin", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { pin, currentPin } = req.body as { pin?: string; currentPin?: string };
  if (!isValidPinFormat(pin)) { res.status(400).json({ error: "PIN must be 4–8 digits" }); return; }
  const r = await setPin(uid(req), pin, typeof currentPin === "string" ? currentPin : undefined);
  if (!r.ok) { res.status(400).json({ error: r.error }); return; }
  res.json({ ok: true });
});

// POST /security/pin/verify — verify the PIN (throttled)
router.post("/security/pin/verify", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { pin } = req.body as { pin?: string };
  if (typeof pin !== "string" || !pin) { res.status(400).json({ error: "PIN is required" }); return; }
  const r = await verifyPin(uid(req), pin);
  if (!r.ok) { res.status(r.locked ? 429 : 401).json(r); return; }
  res.json({ ok: true });
});

// POST /security/webauthn/challenge — issue a challenge + known credential ids
router.post("/security/webauthn/challenge", requireAuth, async (req: Request, res: Response): Promise<void> => {
  res.json(await issueWebauthnChallenge(uid(req)));
});

// POST /security/webauthn/enroll — record an enrolled platform credential id
router.post("/security/webauthn/enroll", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { credentialId } = req.body as { credentialId?: string };
  if (!credentialId) { res.status(400).json({ error: "credentialId is required" }); return; }
  await enrollWebauthn(uid(req), credentialId);
  res.json({ ok: true });
});

// POST /security/webauthn/disable — remove all enrolled credentials
router.post("/security/webauthn/disable", requireAuth, async (req: Request, res: Response): Promise<void> => {
  await disableWebauthn(uid(req));
  res.json({ ok: true });
});

export default router;

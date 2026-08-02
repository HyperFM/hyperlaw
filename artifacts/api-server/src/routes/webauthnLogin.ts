// ── Passkey login routes ────────────────────────────────────────────────────
//  POST   /auth/passkey/register/options  — (requireAuth) start enrolling a device
//  POST   /auth/passkey/register/verify   — (requireAuth) finish enrolling
//  GET    /auth/passkey/list              — (requireAuth) list this user's passkeys
//  DELETE /auth/passkey/:id               — (requireAuth) remove a passkey
//  POST   /auth/passkey/login/options     — (public) start usernameless sign-in
//  POST   /auth/passkey/login/verify      — (public) finish sign-in, starts the session

import { Router, type Request, type Response, type NextFunction } from "express";
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from "@simplewebauthn/server";
import { getAuth, sanitizeUser } from "../services/auth.js";
import {
  startPasskeyRegistration, finishPasskeyRegistration,
  startPasskeyAuthentication, finishPasskeyAuthentication,
  listPasskeys, deletePasskey,
} from "../services/webauthnLogin.js";

const router = Router();

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
}

router.post("/auth/passkey/register/options", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  const options = await startPasskeyRegistration(userId!, req.user!.username, req);
  res.json(options);
});

router.post("/auth/passkey/register/verify", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  const result = await finishPasskeyRegistration(userId!, req.body as RegistrationResponseJSON, req);
  if (!result.ok) { res.status(400).json({ error: result.error }); return; }
  res.json({ ok: true });
});

router.get("/auth/passkey/list", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  res.json(await listPasskeys(userId!));
});

router.delete("/auth/passkey/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  await deletePasskey(userId!, String(req.params.id));
  res.json({ ok: true });
});

router.post("/auth/passkey/login/options", async (req: Request, res: Response): Promise<void> => {
  const options = await startPasskeyAuthentication(req);
  res.json(options);
});

router.post("/auth/passkey/login/verify", async (req: Request, res: Response): Promise<void> => {
  const result = await finishPasskeyAuthentication(req.body as AuthenticationResponseJSON, req);
  if (!result.ok || !result.user) { res.status(400).json({ error: result.error }); return; }
  req.login(result.user, (err) => {
    if (err) { res.status(500).json({ error: "Signed in, but failed to start your session" }); return; }
    res.json(sanitizeUser(result.user!));
  });
});

export default router;

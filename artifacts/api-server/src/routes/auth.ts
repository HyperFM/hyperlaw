// ── Self-hosted auth routes (replaces Clerk) ────────────────────────────────
//  GET  /auth/providers          — which OAuth buttons the frontend should show
//  POST /auth/register           — username/first/last/phone/email/password(x2)
//  POST /auth/login              — username-or-email + password, optional rememberMe
//  POST /auth/logout
//  GET  /auth/me
//  GET  /auth/verify-email       — ?token=
//  POST /auth/resend-verification
//  POST /auth/recover-account/lookup — identity only, returns whether the
//                                   matched account needs an admin question
//  POST /auth/recover-account    — identity + security answers, no email needed
//  POST /auth/reset-password     — token + new password
//  GET  /auth/google, GET /auth/google/callback
//  POST /auth/apple/callback     — Apple posts form-encoded id_token here

import { Router, type Request, type Response, type NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import appleSignin from "apple-signin-auth";
import rateLimit from "express-rate-limit";
import {
  hashPassword, verifyPassword, generateToken, sanitizeUser, getAuth,
  hashSecurityAnswer, verifySecurityAnswer, SECURITY_QUESTIONS,
  hashSsnLast4, hashAdminSecurityAnswer, verifyAdminSecurityAnswer, ADMIN_EMAIL_ALLOWLIST,
  EMAIL_VERIFICATION_TTL_MS, PASSWORD_RESET_TTL_MS,
} from "../services/auth.js";
import { sendVerificationEmail } from "../services/email.js";
import { passport, uniqueUsernameFromEmail } from "../middlewares/passportConfig.js";
import { logger } from "../lib/logger.js";

const router = Router();

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /auth/providers
router.get("/auth/providers", (_req: Request, res: Response) => {
  res.json({
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    apple: Boolean(
      process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID &&
      process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY,
    ),
  });
});

// POST /auth/register
router.post("/auth/register", async (req: Request, res: Response): Promise<void> => {
  const {
    username, firstName, lastName, phoneNumber, email, password, confirmPassword,
    securityAnswer1, securityAnswer2, securityAnswer3,
    isAdminRequest, secondaryEmail, ssnLast4, adminSecurityQuestion, adminSecurityAnswer,
  } = req.body as Record<string, unknown>;

  if (typeof username !== "string" || username.trim().length < 3) {
    res.status(400).json({ error: "Username must be at least 3 characters" }); return;
  }
  if (typeof firstName !== "string" || !firstName.trim()) {
    res.status(400).json({ error: "First name is required" }); return;
  }
  if (typeof lastName !== "string" || !lastName.trim()) {
    res.status(400).json({ error: "Last name is required" }); return;
  }
  if (typeof phoneNumber !== "string" || !phoneNumber.trim()) {
    res.status(400).json({ error: "Phone number is required" }); return;
  }
  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    res.status(400).json({ error: "A valid email is required" }); return;
  }
  if (typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" }); return;
  }
  if (password !== confirmPassword) {
    res.status(400).json({ error: "Passwords do not match" }); return;
  }
  if (typeof securityAnswer1 !== "string" || !securityAnswer1.trim()) {
    res.status(400).json({ error: "Please answer the security question about the street you grew up on" }); return;
  }
  if (typeof securityAnswer2 !== "string" || !securityAnswer2.trim()) {
    res.status(400).json({ error: "Please answer the security question about your mother's first name" }); return;
  }
  if (typeof securityAnswer3 !== "string" || !securityAnswer3.trim()) {
    res.status(400).json({ error: "Please answer the security question about your favorite childhood TV show" }); return;
  }

  // Admin registration — extra identity verification, and gated to a fixed
  // pair of allowlisted emails so checking this box doesn't just grant admin
  // to anyone. Both allowlisted addresses must be present (one as primary,
  // one as secondary) — knowing just one isn't enough, which is the whole
  // point of requiring two. Reject outright rather than silently falling
  // back to a regular account, so a mistaken checkbox press doesn't create a
  // confusing half-admin state.
  const wantsAdmin = isAdminRequest === true || isAdminRequest === "true";
  let normalizedSecondaryEmail: string | null = null;
  if (wantsAdmin) {
    if (typeof secondaryEmail !== "string" || !EMAIL_RE.test(secondaryEmail)) {
      res.status(400).json({ error: "A valid second email address is required for an admin account" }); return;
    }
    if (typeof ssnLast4 !== "string" || !/^\d{4}$/.test(ssnLast4)) {
      res.status(400).json({ error: "Enter exactly 4 digits for the last 4 of your SSN" }); return;
    }
    if (typeof adminSecurityQuestion !== "string" || !adminSecurityQuestion.trim()) {
      res.status(400).json({ error: "Write your own admin security question" }); return;
    }
    if (typeof adminSecurityAnswer !== "string" || !adminSecurityAnswer.trim()) {
      res.status(400).json({ error: "Answer your admin security question" }); return;
    }
    normalizedSecondaryEmail = secondaryEmail.trim().toLowerCase();
    const normalizedPrimaryEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const suppliedPair = new Set([normalizedPrimaryEmail, normalizedSecondaryEmail]);
    const isExactAllowlistPair =
      suppliedPair.size === ADMIN_EMAIL_ALLOWLIST.size &&
      [...ADMIN_EMAIL_ALLOWLIST].every((allowed) => suppliedPair.has(allowed));
    if (!isExactAllowlistPair) {
      res.status(403).json({ error: "Admin accounts must use both authorized email addresses — one as the primary, one as the second." });
      return;
    }
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedUsername = username.trim().toLowerCase();
  const normalizedPhone = phoneNumber.trim();

  const [existing] = await db
    .select({ email: usersTable.email, username: usersTable.username, phoneNumber: usersTable.phoneNumber })
    .from(usersTable)
    .where(or(
      eq(usersTable.email, normalizedEmail),
      eq(usersTable.username, normalizedUsername),
      eq(usersTable.phoneNumber, normalizedPhone),
    ));

  if (existing) {
    if (existing.email === normalizedEmail) {
      res.status(400).json({ error: "An account with this email already exists. Log in or reset your password instead." });
      return;
    }
    if (existing.username === normalizedUsername) {
      res.status(400).json({ error: "That username is taken." }); return;
    }
    if (existing.phoneNumber === normalizedPhone) {
      res.status(400).json({ error: "An account with this phone number already exists. Log in or reset your password instead." });
      return;
    }
  }

  const verificationToken = generateToken();
  const [user] = await db.insert(usersTable).values({
    username: normalizedUsername,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    phoneNumber: normalizedPhone,
    email: normalizedEmail,
    passwordHash: hashPassword(password),
    securityAnswer1Hash: hashSecurityAnswer(securityAnswer1),
    securityAnswer2Hash: hashSecurityAnswer(securityAnswer2),
    securityAnswer3Hash: hashSecurityAnswer(securityAnswer3),
    emailVerificationToken: verificationToken,
    emailVerificationExpiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
    ...(wantsAdmin ? {
      isAdmin: true,
      secondaryEmail: normalizedSecondaryEmail,
      ssnLast4Hash: hashSsnLast4(ssnLast4 as string),
      adminSecurityQuestion: (adminSecurityQuestion as string).trim(),
      adminSecurityAnswerHash: hashAdminSecurityAnswer(adminSecurityAnswer as string),
    } : {}),
  }).returning();

  sendVerificationEmail(normalizedEmail, verificationToken)
    .catch((err) => logger.error({ err }, "Failed to send verification email"));

  req.login(user, (err) => {
    if (err) {
      res.status(500).json({ error: "Account created, but failed to start your session — try logging in" });
      return;
    }
    res.status(201).json(sanitizeUser(user));
  });
});

// POST /auth/login
router.post("/auth/login", (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate("local", (err: Error | null, user: Express.User | false, info?: { message?: string }) => {
    if (err) { res.status(500).json({ error: "Login failed" }); return; }
    if (!user) { res.status(401).json({ error: info?.message ?? "Invalid username/email or password" }); return; }
    req.login(user, (loginErr) => {
      if (loginErr) { res.status(500).json({ error: "Login failed" }); return; }
      const rememberMe = req.body?.rememberMe === true || req.body?.rememberMe === "true";
      req.session.cookie.maxAge = rememberMe ? 90 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
      req.session.save((saveErr) => {
        if (saveErr) { res.status(500).json({ error: "Login failed" }); return; }
        res.json(sanitizeUser(user));
      });
    });
  })(req, res, next);
});

// POST /auth/logout
router.post("/auth/logout", (req: Request, res: Response) => {
  req.logout((err) => {
    if (err) { res.status(500).json({ error: "Logout failed" }); return; }
    res.json({ ok: true });
  });
});

// GET /auth/me
router.get("/auth/me", (req: Request, res: Response) => {
  if (!req.isAuthenticated() || !req.user) { res.status(401).json({ error: "Not signed in" }); return; }
  res.json(sanitizeUser(req.user));
});

// GET /auth/verify-email?token=
router.get("/auth/verify-email", async (req: Request, res: Response): Promise<void> => {
  const token = req.query.token;
  if (typeof token !== "string" || !token) { res.status(400).json({ error: "Missing token" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.emailVerificationToken, token));
  if (!user || !user.emailVerificationExpiresAt || user.emailVerificationExpiresAt < new Date()) {
    res.status(400).json({ error: "This verification link is invalid or has expired." });
    return;
  }
  await db.update(usersTable)
    .set({ emailVerified: true, emailVerificationToken: null, emailVerificationExpiresAt: null, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id));
  res.json({ ok: true });
});

// POST /auth/resend-verification
router.post("/auth/resend-verification", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId!));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (user.emailVerified) { res.json({ ok: true }); return; }
  const token = generateToken();
  await db.update(usersTable)
    .set({ emailVerificationToken: token, emailVerificationExpiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS) })
    .where(eq(usersTable.id, user.id));
  await sendVerificationEmail(user.email, token);
  res.json({ ok: true });
});

// POST /auth/reset-password
router.post("/auth/reset-password", async (req: Request, res: Response): Promise<void> => {
  const { token, password } = req.body as { token?: string; password?: string };
  if (typeof token !== "string" || !token) { res.status(400).json({ error: "Missing token" }); return; }
  if (typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" }); return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.passwordResetToken, token));
  if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
    res.status(400).json({ error: "This reset link is invalid or has expired." });
    return;
  }
  await db.update(usersTable)
    .set({ passwordHash: hashPassword(password), passwordResetToken: null, passwordResetExpiresAt: null, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id));
  res.json({ ok: true });
});

// GET /auth/security-questions — the fixed 3 questions asked at signup and
// re-asked here for no-email recovery. Single source of truth for the text
// shown on both the signup and recovery forms.
router.get("/auth/security-questions", (_req: Request, res: Response) => {
  res.json({ questions: SECURITY_QUESTIONS });
});

// Shared identity check for account recovery: email/first/last always
// required, plus EITHER username or phone number — whichever the user has
// on hand — matched against whichever of those was supplied.
type UserRow = typeof usersTable.$inferSelect;
function identityMatches(
  user: UserRow | undefined,
  body: { firstName: string; lastName: string; username?: string; phoneNumber?: string },
): boolean {
  const hasUsername = Boolean(body.username?.trim());
  const hasPhone = Boolean(body.phoneNumber?.trim());
  if (!hasUsername && !hasPhone) return false;
  return Boolean(user)
    && user!.firstName.toLowerCase() === body.firstName.trim().toLowerCase()
    && user!.lastName.toLowerCase() === body.lastName.trim().toLowerCase()
    && (!hasUsername || user!.username === body.username!.trim().toLowerCase())
    && (!hasPhone || user!.phoneNumber === body.phoneNumber!.trim());
}

// Admins can be looked up by either email on file (primary or secondary) —
// regular accounts only ever have a primary email, so this is a no-op for
// them. Primary email is checked first and always wins if it matches (it's
// the one column with a uniqueness guarantee) — only falls back to matching
// on secondaryEmail if no account owns that address as its primary, so one
// account's primary can never be shadowed by a different account's secondary.
async function findByEitherEmail(email: string): Promise<UserRow | undefined> {
  const normalized = email.trim().toLowerCase();
  const [byPrimary] = await db.select().from(usersTable).where(eq(usersTable.email, normalized));
  if (byPrimary) return byPrimary;
  const [bySecondary] = await db.select().from(usersTable).where(eq(usersTable.secondaryEmail, normalized));
  return bySecondary;
}

// Confirms the two supplied addresses are exactly {x, y} as a set (order
// doesn't matter) — used to require an admin type BOTH of their emails on
// file during recovery, not just the one they used to look themselves up.
function isSameEmailPair(a: string, b: string, x: string | null, y: string | null): boolean {
  if (!x || !y) return false;
  const supplied = new Set([a.trim().toLowerCase(), b.trim().toLowerCase()]);
  return supplied.size === 2 && supplied.has(x) && supplied.has(y);
}

const RECOVER_GENERIC_ERROR = "We couldn't verify those details. Double-check what you entered and try again.";

const recoverAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait 15 minutes and try again." },
});

// POST /auth/recover-account/lookup — identity only (no security answers
// yet). Confirms who they are and, if this is an admin account, hands back
// the admin's own custom question text (never the answer) so the next step
// can ask for it too. Same generic failure on any mismatch, so this can't be
// used to enumerate which account exists.
router.post("/auth/recover-account/lookup", recoverAccountLimiter, async (req: Request, res: Response): Promise<void> => {
  const { email, username, phoneNumber, firstName, lastName } = req.body as Record<string, unknown>;

  if (
    typeof email !== "string" || typeof firstName !== "string" || typeof lastName !== "string" ||
    (username !== undefined && typeof username !== "string") ||
    (phoneNumber !== undefined && typeof phoneNumber !== "string")
  ) {
    res.status(400).json({ error: RECOVER_GENERIC_ERROR }); return;
  }

  const user = await findByEitherEmail(email);

  if (!identityMatches(user, { firstName, lastName, username: username as string | undefined, phoneNumber: phoneNumber as string | undefined })) {
    res.status(400).json({ error: RECOVER_GENERIC_ERROR });
    return;
  }

  res.json({
    ok: true,
    isAdmin: user!.isAdmin,
    adminSecurityQuestion: user!.isAdmin ? user!.adminSecurityQuestion : null,
  });
});

// POST /auth/recover-account — re-verifies the same identity AND all 3 fixed
// security answers in one shot, then hands back a reset link directly (no
// email needed). Admin accounts additionally have to answer their own custom
// question AND type both emails on file (adminEmail1/adminEmail2, order
// doesn't matter) — knowing one email plus the 3 generic answers isn't
// enough for an admin account. Everything must match or the response is the
// same generic failure either way, so this can't be used to enumerate which
// part was wrong.
router.post("/auth/recover-account", recoverAccountLimiter, async (req: Request, res: Response): Promise<void> => {
  const {
    email, username, phoneNumber, firstName, lastName,
    securityAnswer1, securityAnswer2, securityAnswer3, adminSecurityAnswer,
    adminEmail1, adminEmail2,
  } = req.body as Record<string, unknown>;

  if (
    typeof email !== "string" ||
    typeof firstName !== "string" || typeof lastName !== "string" ||
    typeof securityAnswer1 !== "string" || typeof securityAnswer2 !== "string" || typeof securityAnswer3 !== "string"
  ) {
    res.status(400).json({ error: RECOVER_GENERIC_ERROR }); return;
  }

  const user = await findByEitherEmail(email);

  if (!identityMatches(user, { firstName, lastName, username: username as string | undefined, phoneNumber: phoneNumber as string | undefined })) {
    res.status(400).json({ error: RECOVER_GENERIC_ERROR });
    return;
  }

  const answersMatch = Boolean(user!.securityAnswer1Hash) && Boolean(user!.securityAnswer2Hash) && Boolean(user!.securityAnswer3Hash)
    && verifySecurityAnswer(securityAnswer1, user!.securityAnswer1Hash!)
    && verifySecurityAnswer(securityAnswer2, user!.securityAnswer2Hash!)
    && verifySecurityAnswer(securityAnswer3, user!.securityAnswer3Hash!);

  const adminAnswerMatches = !user!.isAdmin || (
    typeof adminSecurityAnswer === "string" && Boolean(user!.adminSecurityAnswerHash)
    && verifyAdminSecurityAnswer(adminSecurityAnswer, user!.adminSecurityAnswerHash!)
  );

  const adminEmailsMatch = !user!.isAdmin || (
    typeof adminEmail1 === "string" && typeof adminEmail2 === "string"
    && isSameEmailPair(adminEmail1, adminEmail2, user!.email, user!.secondaryEmail)
  );

  if (!answersMatch || !adminAnswerMatches || !adminEmailsMatch) {
    res.status(400).json({ error: RECOVER_GENERIC_ERROR });
    return;
  }

  const token = generateToken();
  await db.update(usersTable)
    .set({ passwordResetToken: token, passwordResetExpiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS) })
    .where(eq(usersTable.id, user!.id));

  res.json({ ok: true, resetLink: `/reset-password?token=${token}` });
});

// GET /auth/google — only registered as a strategy (and thus only useful) once
// GOOGLE_CLIENT_ID/SECRET are set; passport throws a clear error if hit before then.
router.get("/auth/google", (req: Request, res: Response, next: NextFunction) => {
  if (!process.env.GOOGLE_CLIENT_ID) { res.status(503).json({ error: "Google sign-in isn't configured yet" }); return; }
  passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});

router.get("/auth/google/callback", (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate("google", { failureRedirect: "/sign-in?error=google" })(req, res, next);
}, (_req: Request, res: Response) => {
  res.redirect("/");
});

// POST /auth/apple/callback — Apple's JS SDK on the frontend posts form-encoded
// data here after the user approves. `user` (name/email) is only present on the
// very first sign-in ever for that Apple ID; every sign-in after that only sends
// id_token, which is why we resolve identity from id_token, not from `user`.
router.post("/auth/apple/callback", async (req: Request, res: Response): Promise<void> => {
  const clientID = process.env.APPLE_CLIENT_ID;
  const { id_token: idToken, user: userJson } = req.body as { id_token?: string; user?: string };
  if (!clientID || typeof idToken !== "string" || !idToken) {
    res.redirect("/sign-in?error=apple");
    return;
  }
  try {
    const applePayload = await appleSignin.verifyIdToken(idToken, { audience: clientID });
    const email = applePayload.email;
    if (!email) { res.redirect("/sign-in?error=apple"); return; }

    let [user] = await db.select().from(usersTable).where(eq(usersTable.appleId, applePayload.sub));
    if (!user) {
      const [byEmail] = await db.select().from(usersTable).where(eq(usersTable.email, email));
      if (byEmail) {
        [user] = await db.update(usersTable)
          .set({ appleId: applePayload.sub, updatedAt: new Date() })
          .where(eq(usersTable.id, byEmail.id))
          .returning();
      } else {
        let firstName = "Apple";
        let lastName = "User";
        if (userJson) {
          try {
            const parsed = JSON.parse(userJson) as { name?: { firstName?: string; lastName?: string } };
            if (parsed.name?.firstName) firstName = parsed.name.firstName;
            if (parsed.name?.lastName) lastName = parsed.name.lastName;
          } catch {
            // Malformed/unexpected `user` payload — fall back to the defaults above.
          }
        }
        const username = await uniqueUsernameFromEmail(email);
        [user] = await db.insert(usersTable).values({
          username, firstName, lastName, email, emailVerified: true, appleId: applePayload.sub,
        }).returning();
      }
    }

    req.login(user, (err) => {
      if (err) { res.redirect("/sign-in?error=apple"); return; }
      res.redirect("/");
    });
  } catch (err) {
    logger.error({ err }, "Apple sign-in verification failed");
    res.redirect("/sign-in?error=apple");
  }
});

export default router;

// ── Session + Passport wiring ────────────────────────────────────────────────
// Replaces Clerk's clerkMiddleware. Session store is Postgres-backed
// (connect-pg-simple against the same DATABASE_URL pool everything else uses),
// with createTableIfMissing so the session table needs no manual migration —
// same shape as ShortHop's setup. Local strategy checks username-or-email +
// password; Google strategy only registers if GOOGLE_CLIENT_ID/SECRET are set,
// so the app runs fine without Google configured yet — the sign-in button on
// the frontend just won't render.

import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { db, pool, usersTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { verifyPassword } from "../services/auth.js";
import { logger } from "../lib/logger.js";

const PgSessionStore = connectPgSimple(session);

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set.");
}

export const sessionMiddleware = session({
  // Table is created via the normal drizzle schema/push (see sessionTable in
  // lib/db/src/schema/index.ts), not createTableIfMissing — that option reads
  // a table.sql file from connect-pg-simple's own package directory, which
  // doesn't exist once this server is bundled into a single dist/index.mjs.
  store: new PgSessionStore({ pool, tableName: "session" }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // default 30 days; login route overrides to 90 for "remember me"
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  },
});

passport.use(
  new LocalStrategy(async (usernameOrEmail, password, done) => {
    try {
      // Username and both stored emails are lowercased at registration —
      // normalize the login input the same way. Username/primary-email are
      // checked first (both are unique columns, so this can match at most
      // one account) and only fall back to secondaryEmail if nothing owns
      // that address as username or primary — so admin accounts can sign in
      // with either address on file, but one account's primary can never be
      // shadowed by a different account's secondary.
      const normalized = usernameOrEmail.trim().toLowerCase();
      let [user] = await db
        .select()
        .from(usersTable)
        .where(or(eq(usersTable.username, normalized), eq(usersTable.email, normalized)));
      if (!user) {
        [user] = await db.select().from(usersTable).where(eq(usersTable.secondaryEmail, normalized));
      }
      if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
        return done(null, false, { message: "Invalid username/email or password" });
      }
      return done(null, user);
    } catch (err) {
      return done(err as Error);
    }
  }),
);

/** Generates a unique username from an email's local part for OAuth signups
 *  (Google/Apple never collect a username), appending a number on collision. */
async function uniqueUsernameFromEmail(email: string): Promise<string> {
  const base = email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").toLowerCase() || "user";
  let candidate = base;
  let suffix = 0;
  // Bounded by realistic collision rates — this is a signup-time convenience,
  // not a security boundary, so a simple incrementing suffix is sufficient.
  while (suffix < 1000) {
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, candidate));
    if (!existing) return candidate;
    suffix += 1;
    candidate = `${base}${suffix}`;
  }
  return `${base}${Date.now()}`;
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "/api/auth/google/callback",
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) return done(new Error("Google account has no email on file"));

          const [byGoogleId] = await db.select().from(usersTable).where(eq(usersTable.googleId, profile.id));
          if (byGoogleId) return done(null, byGoogleId);

          const [byEmail] = await db.select().from(usersTable).where(eq(usersTable.email, email));
          if (byEmail) {
            const [linked] = await db
              .update(usersTable)
              .set({ googleId: profile.id, updatedAt: new Date() })
              .where(eq(usersTable.id, byEmail.id))
              .returning();
            return done(null, linked);
          }

          const username = await uniqueUsernameFromEmail(email);
          const [created] = await db
            .insert(usersTable)
            .values({
              username,
              firstName: profile.name?.givenName || "Google",
              lastName: profile.name?.familyName || "User",
              email,
              emailVerified: true, // Google has already verified this address
              googleId: profile.id,
            })
            .returning();
          return done(null, created);
        } catch (err) {
          logger.error({ err }, "Google OAuth strategy error");
          return done(err as Error);
        }
      },
    ),
  );
} else {
  logger.info("GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set — Google sign-in disabled");
}

passport.serializeUser((user: Express.User, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    done(null, user ?? false);
  } catch (err) {
    done(err);
  }
});

export { passport, uniqueUsernameFromEmail };

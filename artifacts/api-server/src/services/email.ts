// ── Transactional email (verification, password reset) ─────────────────────
// Uses Resend when RESEND_API_KEY is set. Without it, logs the email to the
// server console instead of throwing — so local dev/signup isn't blocked on
// having a Resend account yet, per the auth-replacement plan.

import { Resend } from "resend";
import { logger } from "../lib/logger.js";

const FROM_ADDRESS = "HyperLaw <noreply@hyperlaw.site>";

function getClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const client = getClient();
  if (!client) {
    logger.info({ to, subject, html }, "RESEND_API_KEY not set — logging email instead of sending");
    return;
  }
  await client.emails.send({ from: FROM_ADDRESS, to, subject, html });
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const link = `https://hyperlaw.site/verify-email?token=${token}`;
  await sendEmail(
    to,
    "Verify your HyperLaw email",
    `<p>Welcome to HyperLaw. Confirm your email address to finish setting up your account:</p>
     <p><a href="${link}">${link}</a></p>
     <p>This link expires in 24 hours.</p>`,
  );
}

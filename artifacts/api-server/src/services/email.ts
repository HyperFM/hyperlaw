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

async function sendEmail(to: string, subject: string, html: string, replyTo?: string): Promise<void> {
  const client = getClient();
  if (!client) {
    logger.info({ to, subject, html }, "RESEND_API_KEY not set — logging email instead of sending");
    return;
  }
  await client.emails.send({ from: FROM_ADDRESS, to, subject, html, ...(replyTo ? { replyTo } : {}) });
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

function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const FEEDBACK_NOTIFY_EMAIL = process.env.FEEDBACK_NOTIFY_EMAIL ?? "hypermodula@gmail.com";

/** Tells the admin a new support/feedback message arrived. Reply-To is the sender when we know their email. */
export async function sendFeedbackAdminEmail(opts: { type: string; message: string; name: string; email: string }): Promise<void> {
  const who = [opts.name, opts.email].filter(Boolean).join(" · ") || "Anonymous";
  await sendEmail(
    FEEDBACK_NOTIFY_EMAIL,
    `HyperLaw ${opts.type}: ${opts.message.slice(0, 60)}`,
    `<p><b>${esc(opts.type)}</b> from ${esc(who)}</p><p style="white-space:pre-wrap">${esc(opts.message)}</p>`,
    opts.email || undefined,
  );
}

/** Emails the admin's reply to whoever sent the feedback. */
export async function sendFeedbackReplyEmail(to: string, original: string, reply: string): Promise<void> {
  await sendEmail(
    to,
    "A reply from HyperLaw",
    `<p style="white-space:pre-wrap">${esc(reply)}</p><hr><p style="color:#777;font-size:13px">Your message: ${esc(original.slice(0, 500))}</p>`,
  );
}

/** Plain alert to the owner (spend backstops, kill switch). */
export async function sendOwnerAlert(subject: string, body: string): Promise<void> {
  await sendEmail(FEEDBACK_NOTIFY_EMAIL, subject, `<p style="white-space:pre-wrap">${esc(body)}</p>`);
}

/** A deadline reminder. offsetDays: 0 = due today. */
export async function sendReminderEmail(to: string, title: string, dueDate: string, offsetDays: number): Promise<void> {
  const when = offsetDays === 0 ? "today" : offsetDays === 1 ? "tomorrow" : `in ${offsetDays} days`;
  await sendEmail(
    to,
    `Reminder: ${title} — due ${when}`,
    `<p><b>${esc(title)}</b> is due <b>${esc(when)}</b> (${esc(dueDate)}).</p>
     <p style="color:#666;font-size:13px">HyperLaw can't see your court's records. Please confirm this date with your court clerk. Open HyperLaw to see your case.</p>`,
  );
}

/** Invite to a co-parenting thread. The code is the only way in; it works once. */
export async function sendFamilyInviteEmail(to: string, fromName: string, code: string): Promise<void> {
  await sendEmail(
    to,
    `${fromName || "Someone"} invited you to a co-parenting chat on HyperLaw`,
    `<p>${esc(fromName || "Someone")} invited you to a private co-parenting chat on HyperLaw.</p>
     <p>Open HyperLaw, go to <b>Tools → Family Court → Join with a code</b>, and enter:</p>
     <p style="font-size:22px;letter-spacing:2px"><b>${esc(code)}</b></p>
     <p style="color:#666;font-size:13px">Only the two of you can see this chat. Messages are kept as a record. If you didn't expect this, ignore this email.</p>`,
  );
}

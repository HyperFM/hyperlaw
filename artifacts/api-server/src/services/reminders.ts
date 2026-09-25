// Deadline reminders (Phase 4). One deadline becomes a handful of reminder rows (default: 7, 3 and 1 days
// before, and the day of). Delivery: an in-app notification, an email, and — where the person gave a phone
// number AND texting is configured — an SMS. Real push notifications need an Apple push key; that channel is
// not built (see README note in the phase 4 report).
//
// Nothing runs on a timer inside the web process (a free Render instance sleeps). Instead:
//   - POST /api/reminders/run (secret header) is called by an outside scheduler every ~15 minutes, and
//   - a person's own due reminders are also processed whenever they load their notifications.

import { and, eq, isNull, lte } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, remindersTable, notificationsTable, usersTable } from "@workspace/db";
import { sendReminderEmail } from "./email.js";
import { logger } from "../lib/logger.js";

/** PLACEHOLDER schedule (owner decision still open) — days before the deadline. Change here only. */
export const DEFAULT_OFFSETS = [7, 3, 1, 0];
/** Send time, UTC. 14:00 UTC is 9-10am in Kentucky. */
export const REMINDER_HOUR_UTC = 14;

export async function createReminders(opts: { userId: string; caseId?: string | null; title: string; dueDate: string; offsets?: number[] }): Promise<{ groupId: string; times: string[] }> {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(opts.dueDate);
  if (!m) throw new Error("Invalid due date");
  const groupId = randomUUID();
  const now = Date.now();
  const rows = (opts.offsets ?? DEFAULT_OFFSETS)
    .map(off => ({ off, at: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] - off, REMINDER_HOUR_UTC, 0, 0)) }))
    .filter(x => x.at.getTime() > now);
  // Deadline is today or tomorrow and every slot has passed: still give one reminder soon so it isn't silent.
  if (rows.length === 0) rows.push({ off: 0, at: new Date(now + 60_000) });
  await db.insert(remindersTable).values(rows.map(r => ({
    userId: opts.userId, caseId: opts.caseId ?? null, groupId, title: opts.title, dueDate: opts.dueDate, remindAt: r.at, offsetDays: r.off,
  })));
  return { groupId, times: rows.map(r => r.at.toISOString()) };
}

async function sendSms(to: string, body: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return; // texting isn't configured yet
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  if (!r.ok) logger.warn({ status: r.status }, "reminder SMS failed");
}

/** Sends every reminder that is due (optionally only one person's). Safe to call often; each row is claimed before sending. */
export async function processDueReminders(userId?: string): Promise<number> {
  const due = await db.select().from(remindersTable)
    .where(and(isNull(remindersTable.sentAt), lte(remindersTable.remindAt, new Date()), userId ? eq(remindersTable.userId, userId) : undefined))
    .limit(200);
  let sent = 0;
  for (const r of due) {
    // Claim first (only one caller wins), so overlapping runs never double-send.
    const claimed = await db.update(remindersTable).set({ sentAt: new Date() })
      .where(and(eq(remindersTable.id, r.id), isNull(remindersTable.sentAt))).returning({ id: remindersTable.id });
    if (claimed.length === 0) continue;
    try {
      const when = r.offsetDays === 0 ? "today" : r.offsetDays === 1 ? "tomorrow" : `in ${r.offsetDays} days`;
      await db.insert(notificationsTable).values({
        userId: r.userId,
        title: `Reminder: due ${when}`,
        body: r.title,
        type: "reminder",
        metadata: { caseId: r.caseId, dueDate: r.dueDate, reminderId: r.id },
      });
      const [u] = await db.select({ email: usersTable.email, phone: usersTable.phoneNumber }).from(usersTable).where(eq(usersTable.id, r.userId));
      if (u?.email) await sendReminderEmail(u.email, r.title, r.dueDate, r.offsetDays).catch(err => logger.warn({ err }, "reminder email failed"));
      if (u?.phone) await sendSms(u.phone, `HyperLaw reminder: ${r.title} is due ${when} (${r.dueDate}). Confirm with your court clerk.`).catch(err => logger.warn({ err }, "reminder SMS failed"));
      sent++;
    } catch (err) {
      logger.warn({ err }, "reminder delivery failed");
    }
  }
  return sent;
}

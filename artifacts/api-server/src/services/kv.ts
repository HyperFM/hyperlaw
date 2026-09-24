// Tiny key/value helpers over the app_settings table (also used by the AI kill switch).
import { db, appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function kvGet<T>(key: string): Promise<T | null> {
  const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key));
  if (!row) return null;
  try { return JSON.parse(row.value) as T; } catch { return null; }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const v = JSON.stringify(value);
  await db
    .insert(appSettingsTable)
    .values({ key, value: v })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: v, updatedAt: new Date() } });
}

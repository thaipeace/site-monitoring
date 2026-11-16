import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const maxDuration = 60;

/**
 * Daily retention job (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`).
 * Deletes events, receipts and hourly buckets older than each project's retentionDays,
 * issues not seen within that window, and expired sessions.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = sql`now() - make_interval(days => p.retention_days)`;
  const deleted = {
    events: (await db.execute(sql`delete from events e using projects p where e.project_id = p.id and e.received_at < ${cutoff}`)).count,
    receipts: (await db.execute(sql`delete from event_receipts r using projects p where r.project_id = p.id and r.received_at < ${cutoff}`)).count,
    hourly: (await db.execute(sql`delete from issue_hourly h using projects p where h.project_id = p.id and h.hour < ${cutoff}`)).count,
    issues: (await db.execute(sql`delete from issues i using projects p where i.project_id = p.id and i.last_seen < ${cutoff}`)).count,
    sessions: (await db.execute(sql`delete from sessions where expires_at < now()`)).count,
  };
  return Response.json({ ok: true, deleted });
}

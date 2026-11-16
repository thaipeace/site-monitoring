import { eq } from "drizzle-orm";
import { after } from "next/server";
import { dispatchAlerts } from "@/lib/alerts";
import { db } from "@/lib/db";
import { ingestKeys, projects } from "@/lib/db/schema";
import { batchSchema, normalizeEvent, toList, type NormalizedEvent } from "@/lib/ingest/contract";
import { ingestEvent, type IngestOutcome } from "@/lib/ingest/process";
import { decryptSecret, verifySignature } from "@/lib/secrets";

export const maxDuration = 30;

const MAX_BODY_BYTES = 512 * 1024;

function json(body: unknown, status: number) {
  return Response.json(body, { status });
}

/**
 * POST /api/ingest
 * Headers:
 *   X-GS-Key:        key id of the environment's ingest key
 *   X-GS-Timestamp:  unix seconds
 *   X-GS-Signature:  hex(HMAC-SHA256(secret, `${timestamp}.${rawBody}`))
 * Body: one event, an array of events, or { su_kien: [...] } (max 100).
 */
export async function POST(request: Request) {
  const keyId = request.headers.get("x-gs-key");
  const timestamp = request.headers.get("x-gs-timestamp");
  const signature = request.headers.get("x-gs-signature");
  if (!keyId || !timestamp || !signature) {
    return json({ loi: "Thiếu X-GS-Key / X-GS-Timestamp / X-GS-Signature" }, 401);
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return json({ loi: "Body quá lớn" }, 413);

  const [row] = await db
    .select({ key: ingestKeys, project: projects })
    .from(ingestKeys)
    .innerJoin(projects, eq(projects.id, ingestKeys.projectId))
    .where(eq(ingestKeys.keyId, keyId))
    .limit(1);
  if (!row || row.key.revokedAt) return json({ loi: "Khoá không hợp lệ" }, 401);

  const check = verifySignature(decryptSecret(row.key.secretEnc), timestamp, raw, signature);
  if (!check.ok) return json({ loi: `Chữ ký sai: ${check.reason}` }, 401);

  let parsed;
  try {
    parsed = batchSchema.safeParse(JSON.parse(raw));
  } catch {
    return json({ loi: "JSON không hợp lệ" }, 400);
  }
  if (!parsed.success) {
    return json({ loi: "Sai hợp đồng gửi", chi_tiet: parsed.error.issues.slice(0, 10) }, 400);
  }

  const { key, project } = row;
  const now = new Date();
  const results: (IngestOutcome | { ma_su_kien: string; trang_thai: "rejected"; ly_do: string })[] = [];
  const forAlerts: { outcome: IngestOutcome; event: NormalizedEvent }[] = [];

  for (const incoming of toList(parsed.data)) {
    // R7: the key decides the environment; a mismatching moi_truong is rejected.
    if (incoming.moi_truong !== key.environment) {
      results.push({
        ma_su_kien: incoming.ma_su_kien,
        trang_thai: "rejected",
        ly_do: `moi_truong "${incoming.moi_truong}" khác môi trường của khoá "${key.environment}"`,
      });
      continue;
    }
    const event = normalizeEvent(incoming, now);
    const outcome = await ingestEvent(project, event);
    results.push(outcome);
    forAlerts.push({ outcome, event });
  }

  after(async () => {
    await db.update(ingestKeys).set({ lastUsedAt: now }).where(eq(ingestKeys.id, key.id));
    await dispatchAlerts(project, forAlerts);
  });

  return json(
    {
      nhan: results.filter((r) => r.trang_thai === "accepted").length,
      trung: results.filter((r) => r.trang_thai === "duplicate").length,
      tu_choi: results.filter((r) => r.trang_thai === "rejected").length,
      ket_qua: results,
    },
    202,
  );
}

/**
 * Integration tests against a real Postgres (DATABASE_URL).
 *   npm run test:integration
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import { db } from "../src/lib/db";
import { issueHourly, issues, projects, users } from "../src/lib/db/schema";
import { normalizeEvent, type IncomingEvent } from "../src/lib/ingest/contract";
import { ingestEvent } from "../src/lib/ingest/process";
import { createProject } from "../src/lib/services/projects";
import { setIssueStatus } from "../src/lib/services/issues";
import type { Actor } from "../src/lib/services/access";

let actor: Actor;
let projectId: string;
const run = Math.random().toString(36).slice(2, 8);
let seq = 0;

function ev(over: Partial<IncomingEvent> = {}): IncomingEvent {
  return {
    ma_su_kien: `t${run}_${seq++}_xxxxxxxx`,
    thoi_gian: new Date().toISOString(),
    moi_truong: "thu",
    nguon: "may-chu",
    phien_ban: "1.0.0",
    loai_loi: "HTTP 500",
    thong_diep: "D1 timeout",
    duong_dan: "/api/app/buoi/1",
    ...over,
  };
}

async function project() {
  const [p] = await db.select().from(projects).where(eq(projects.id, projectId));
  return p;
}

before(async () => {
  const [u] = await db
    .insert(users)
    .values({ email: `test-${run}@siroby.com`, name: "Test", passwordHash: "x" })
    .returning();
  actor = { kind: "user", userId: u.id };
  const { project } = await createProject(actor, { name: `Test ${run}` });
  projectId = project.id;
  await db.update(projects).set({ sampleLimitPerHour: 3 }).where(eq(projects.id, projectId));
});

after(async () => {
  await db.delete(projects).where(eq(projects.id, projectId));
  await db.delete(users).where(eq(users.id, actor.userId));
  await db.$client.end();
});

describe("ingest", () => {
  it("creates an issue, then groups the next event into it", async () => {
    const a = await ingestEvent(await project(), normalizeEvent(ev()));
    const b = await ingestEvent(await project(), normalizeEvent(ev({ duong_dan: "/api/app/buoi/2" })));
    assert.equal(a.trang_thai, "accepted");
    assert.equal(b.trang_thai, "accepted");
    if (a.trang_thai !== "accepted" || b.trang_thai !== "accepted") return;
    assert.equal(a.trigger, "new");
    assert.equal(b.trigger, undefined);
    assert.equal(a.issue_id, b.issue_id);
    const [i] = await db.select().from(issues).where(eq(issues.id, a.issue_id!));
    assert.equal(i.eventCount, 2);
    assert.equal(i.shortId, 1);
  });

  it("counts a re-sent ma_su_kien only once", async () => {
    const e = ev({ loai_loi: "DupError" });
    const first = await ingestEvent(await project(), normalizeEvent(e));
    const again = await ingestEvent(await project(), normalizeEvent(e));
    assert.equal(again.trang_thai, "duplicate");
    if (first.trang_thai !== "accepted") return assert.fail();
    const [i] = await db.select().from(issues).where(eq(issues.id, first.issue_id!));
    assert.equal(i.eventCount, 1);
  });

  it("keeps environments separate", async () => {
    const a = await ingestEvent(await project(), normalizeEvent(ev({ loai_loi: "EnvError" })));
    const b = await ingestEvent(await project(), normalizeEvent(ev({ loai_loi: "EnvError", moi_truong: "that" })));
    if (a.trang_thai !== "accepted" || b.trang_thai !== "accepted") return assert.fail();
    assert.notEqual(a.issue_id, b.issue_id);
  });

  it("samples full events but keeps exact counts", async () => {
    let issueId = "";
    for (let i = 0; i < 10; i++) {
      const r = await ingestEvent(await project(), normalizeEvent(ev({ loai_loi: "StormError" })));
      if (r.trang_thai === "accepted") issueId = r.issue_id!;
    }
    const [bucket] = await db
      .select({ count: sql<number>`sum(${issueHourly.count})::int`, stored: sql<number>`sum(${issueHourly.stored})::int` })
      .from(issueHourly)
      .where(eq(issueHourly.issueId, issueId));
    assert.equal(bucket.count, 10);
    assert.equal(bucket.stored, 3);
  });

  it("reopens a resolved issue on the next event (regression)", async () => {
    const a = await ingestEvent(await project(), normalizeEvent(ev({ loai_loi: "RegError" })));
    if (a.trang_thai !== "accepted") return assert.fail();
    await setIssueStatus(actor, a.issue_id!, "resolve");
    const b = await ingestEvent(await project(), normalizeEvent(ev({ loai_loi: "RegError" })));
    if (b.trang_thai !== "accepted") return assert.fail();
    assert.equal(b.trigger, "regression");
    const [i] = await db.select().from(issues).where(eq(issues.id, a.issue_id!));
    assert.equal(i.status, "unresolved");
  });

  it("'resolve in next release' ignores old releases but reopens on a new one", async () => {
    const a = await ingestEvent(await project(), normalizeEvent(ev({ loai_loi: "NextRelError", phien_ban: "2.0.0" })));
    if (a.trang_thai !== "accepted") return assert.fail();
    await setIssueStatus(actor, a.issue_id!, "resolve_next_release");
    await new Promise((r) => setTimeout(r, 20));

    const old = await ingestEvent(await project(), normalizeEvent(ev({ loai_loi: "NextRelError", phien_ban: "2.0.0" })));
    if (old.trang_thai !== "accepted") return assert.fail();
    assert.equal(old.trigger, undefined);
    let [i] = await db.select().from(issues).where(eq(issues.id, a.issue_id!));
    assert.equal(i.status, "resolved");

    const fresh = await ingestEvent(await project(), normalizeEvent(ev({ loai_loi: "NextRelError", phien_ban: "2.1.0" })));
    if (fresh.trang_thai !== "accepted") return assert.fail();
    assert.equal(fresh.trigger, "regression");
    [i] = await db.select().from(issues).where(eq(issues.id, a.issue_id!));
    assert.equal(i.status, "unresolved");
  });

  it("concurrent first events create exactly one issue", async () => {
    const p = await project();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => ingestEvent(p, normalizeEvent(ev({ loai_loi: "RaceError" })))),
    );
    const ids = new Set(results.map((r) => (r.trang_thai === "accepted" ? r.issue_id : "")));
    assert.equal(ids.size, 1);
    assert.equal(results.filter((r) => r.trang_thai === "accepted" && r.trigger === "new").length, 1);
  });

  it("alert claim succeeds once under concurrency", async () => {
    const r = await ingestEvent(await project(), normalizeEvent(ev({ loai_loi: "ClaimError" })));
    if (r.trang_thai !== "accepted") return assert.fail();
    const claim = () =>
      db.execute(sql`update issues set last_alerted_at = now()
        where id = ${r.issue_id} and (last_alerted_at is null or last_alerted_at < now() - interval '60 minutes')
        returning id`);
    const claims = await Promise.all(Array.from({ length: 6 }, claim));
    assert.equal(claims.filter((c) => c.rows.length > 0).length, 1);
  });
});

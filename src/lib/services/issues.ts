import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import {
  events,
  issueComments,
  issueHourly,
  issues,
  projectMembers,
  projects,
  releases,
  users,
  type EventKind,
  type IssueStatus,
} from "../db/schema";
import { AccessError, getProjectAccess, requireScope, type Actor } from "./access";

export const PERIODS = { "1h": 1, "24h": 24, "7d": 24 * 7, "14d": 24 * 14, "30d": 24 * 30 } as const;
export type Period = keyof typeof PERIODS;
export const SORTS = ["last_seen", "first_seen", "events"] as const;
export type Sort = (typeof SORTS)[number];

export type IssueFilters = {
  status?: IssueStatus | "all";
  environment?: string;
  release?: string;
  period?: Period;
  query?: string;
  sort?: Sort;
  limit?: number;
  offset?: number;
};

export function parseIssueFilters(sp: Record<string, string | string[] | undefined>): IssueFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) || undefined;
  const status = one("status");
  const period = one("period");
  const sort = one("sort");
  return {
    status: (["unresolved", "resolved", "ignored", "all"] as const).find((s) => s === status) ?? "unresolved",
    environment: one("env"),
    release: one("release"),
    period: period && period in PERIODS ? (period as Period) : "14d",
    query: one("q"),
    sort: SORTS.find((s) => s === sort) ?? "last_seen",
    limit: Math.min(100, Number(one("limit")) || 50),
    offset: Math.max(0, Number(one("offset")) || 0),
  };
}

export async function listIssues(actor: Actor, slug: string, f: IssueFilters) {
  const { project } = await getProjectAccess(actor, slug);
  const hours = PERIODS[f.period ?? "14d"];
  const since = sql`now() - make_interval(hours => ${hours})`;

  const where: SQL[] = [eq(issues.projectId, project.id), gte(issues.lastSeen, since)];
  if (f.status && f.status !== "all") where.push(eq(issues.status, f.status));
  if (f.environment) where.push(eq(issues.environment, f.environment));
  if (f.release) {
    // Issues that have events in this release (stored events) or were first/last seen in it
    where.push(
      or(
        eq(issues.firstRelease, f.release),
        eq(issues.lastRelease, f.release),
        sql`exists (select 1 from ${events} where ${events.issueId} = ${issues.id} and ${events.release} = ${f.release})`,
      )!,
    );
  }
  if (f.query) {
    const q = `%${f.query.replace(/[%_]/g, "\\$&")}%`;
    where.push(or(ilike(issues.title, q), ilike(issues.culprit, q), ilike(issues.errorType, q))!);
  }

  const periodCount = sql<number>`coalesce((select sum(${issueHourly.count}) from ${issueHourly}
    where ${issueHourly.issueId} = ${issues.id} and ${issueHourly.hour} >= date_trunc('hour', ${since})), 0)::int`;

  const order =
    f.sort === "first_seen" ? desc(issues.firstSeen) : f.sort === "events" ? desc(periodCount) : desc(issues.lastSeen);

  const rows = await db
    .select({
      id: issues.id,
      shortId: issues.shortId,
      title: issues.title,
      errorType: issues.errorType,
      culprit: issues.culprit,
      source: issues.source,
      environment: issues.environment,
      level: issues.level,
      status: issues.status,
      eventCount: issues.eventCount,
      periodCount,
      firstSeen: issues.firstSeen,
      lastSeen: issues.lastSeen,
      firstRelease: issues.firstRelease,
      lastRelease: issues.lastRelease,
    })
    .from(issues)
    .where(and(...where))
    .orderBy(order, desc(issues.id))
    .limit((f.limit ?? 50) + 1)
    .offset(f.offset ?? 0);

  const hasMore = rows.length > (f.limit ?? 50);
  const list = rows.slice(0, f.limit ?? 50);
  const sparks = await hourlySeries(list.map((r) => r.id), 24);
  return {
    project,
    issues: list.map((r) => ({ ...r, spark: sparks.get(r.id) ?? new Array(24).fill(0) })),
    hasMore,
  };
}

/** Counts per hour for the last `hours` hours, oldest first. */
export async function hourlySeries(issueIds: string[], hours: number) {
  const out = new Map<string, number[]>();
  if (!issueIds.length) return out;
  const rows = await db
    .select({
      issueId: issueHourly.issueId,
      idx: sql<number>`(extract(epoch from (date_trunc('hour', now()) - ${issueHourly.hour})) / 3600)::int`,
      count: issueHourly.count,
    })
    .from(issueHourly)
    .where(
      and(
        inArray(issueHourly.issueId, issueIds),
        sql`${issueHourly.hour} > date_trunc('hour', now()) - make_interval(hours => ${hours})`,
      ),
    );
  for (const id of issueIds) out.set(id, new Array(hours).fill(0));
  for (const r of rows) {
    const i = hours - 1 - r.idx;
    if (i >= 0 && i < hours) out.get(r.issueId)![i] += r.count;
  }
  return out;
}

export async function projectHourly(projectId: string, hours: number, environment?: string) {
  const rows = await db
    .select({
      idx: sql<number>`(extract(epoch from (date_trunc('hour', now()) - ${issueHourly.hour})) / 3600)::int`,
      count: sql<number>`sum(${issueHourly.count})::int`,
    })
    .from(issueHourly)
    .innerJoin(issues, eq(issues.id, issueHourly.issueId))
    .where(
      and(
        eq(issueHourly.projectId, projectId),
        sql`${issueHourly.hour} > date_trunc('hour', now()) - make_interval(hours => ${hours})`,
        environment ? eq(issues.environment, environment) : undefined,
      ),
    )
    .groupBy(sql`1`);
  const series = new Array(hours).fill(0);
  for (const r of rows) {
    const i = hours - 1 - r.idx;
    if (i >= 0 && i < hours) series[i] += r.count;
  }
  return series as number[];
}

export async function filterOptions(projectId: string) {
  const [envs, rels] = await Promise.all([
    db.selectDistinct({ environment: issues.environment }).from(issues).where(eq(issues.projectId, projectId)),
    db
      .select({ version: releases.version, environment: releases.environment, lastSeen: releases.lastSeen })
      .from(releases)
      .where(eq(releases.projectId, projectId))
      .orderBy(desc(releases.lastSeen))
      .limit(50),
  ]);
  return {
    environments: [...new Set(["that", "thu", "dev", ...envs.map((e) => e.environment)])],
    releases: [...new Set(rels.map((r) => r.version))],
  };
}

/** Loads an issue the actor can see (membership via its project). */
export async function getIssue(actor: Actor, issueId: string) {
  requireScope(actor, "read");
  if (!/^[0-9a-f-]{36}$/i.test(issueId)) throw new AccessError("Issue not found", 404);
  const [row] = await db
    .select({ issue: issues, project: projects })
    .from(issues)
    .innerJoin(projects, eq(projects.id, issues.projectId))
    .innerJoin(
      projectMembers,
      and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, actor.userId)),
    )
    .where(eq(issues.id, issueId))
    .limit(1);
  if (!row) throw new AccessError("Issue not found", 404);
  if (actor.kind === "token" && actor.projectId && actor.projectId !== row.project.id) {
    throw new AccessError("Issue not found", 404);
  }
  return row;
}

export async function getIssueDetail(actor: Actor, issueId: string) {
  const { issue, project } = await getIssue(actor, issueId);
  const [series, latest, comments, releaseBreakdown, hourCount, dayCount] = await Promise.all([
    hourlySeries([issue.id], 24 * 14).then((m) => m.get(issue.id)!),
    db.select().from(events).where(eq(events.issueId, issue.id)).orderBy(desc(events.timestamp)).limit(1),
    db
      .select({
        id: issueComments.id,
        body: issueComments.body,
        createdAt: issueComments.createdAt,
        viaTokenName: issueComments.viaTokenName,
        userName: users.name,
      })
      .from(issueComments)
      .leftJoin(users, eq(users.id, issueComments.userId))
      .where(eq(issueComments.issueId, issue.id))
      .orderBy(asc(issueComments.createdAt)),
    db
      .select({ release: events.release, n: sql<number>`coalesce(sum(${events.occurrences}),0)::int`, last: sql<Date>`max(${events.timestamp})` })
      .from(events)
      .where(eq(events.issueId, issue.id))
      .groupBy(events.release)
      .orderBy(desc(sql`max(${events.timestamp})`))
      .limit(10),
    sumSince(issue.id, "1 hour"),
    sumSince(issue.id, "24 hours"),
  ]);
  return {
    issue,
    project,
    series,
    latestEvent: latest[0] ?? null,
    comments,
    releaseBreakdown,
    counts: { lastHour: hourCount, last24h: dayCount },
  };
}

async function sumSince(issueId: string, interval: string) {
  const [r] = await db
    .select({ n: sql<number>`coalesce(sum(${issueHourly.count}),0)::int` })
    .from(issueHourly)
    .where(and(eq(issueHourly.issueId, issueId), sql`${issueHourly.hour} > now() - ${interval}::interval`));
  return r.n;
}

export async function listIssueEvents(actor: Actor, issueId: string, opts: { limit?: number; before?: string } = {}) {
  const { issue } = await getIssue(actor, issueId);
  return db
    .select()
    .from(events)
    .where(and(eq(events.issueId, issue.id), opts.before ? lt(events.timestamp, new Date(opts.before)) : undefined))
    .orderBy(desc(events.timestamp))
    .limit(Math.min(opts.limit ?? 50, 200));
}

export type StatusAction = "resolve" | "resolve_next_release" | "ignore" | "unresolve";

export async function setIssueStatus(actor: Actor, issueId: string, action: StatusAction) {
  requireScope(actor, "write");
  const { issue } = await getIssue(actor, issueId);
  const patch =
    action === "resolve"
      ? { status: "resolved" as const, resolvedAt: new Date(), resolvedInNextRelease: false }
      : action === "resolve_next_release"
        ? { status: "resolved" as const, resolvedAt: new Date(), resolvedInNextRelease: true }
        : action === "ignore"
          ? { status: "ignored" as const, resolvedAt: null, resolvedInNextRelease: false }
          : { status: "unresolved" as const, resolvedAt: null, resolvedInNextRelease: false };
  const [updated] = await db.update(issues).set(patch).where(eq(issues.id, issue.id)).returning();
  const actorName = actor.kind === "token" ? `token "${actor.tokenName}"` : null;
  await db.insert(issueComments).values({
    issueId: issue.id,
    userId: actor.userId,
    viaTokenName: actor.kind === "token" ? actor.tokenName : null,
    body: `_Đổi trạng thái: ${ACTION_LABEL[action]}${actorName ? ` (qua ${actorName})` : ""}_`,
  });
  return updated;
}

export const ACTION_LABEL: Record<StatusAction, string> = {
  resolve: "Đã xử lý",
  resolve_next_release: "Đã xử lý ở bản tiếp theo",
  ignore: "Bỏ qua",
  unresolve: "Mở lại",
};

export async function addComment(actor: Actor, issueId: string, body: string) {
  requireScope(actor, "write");
  const { issue } = await getIssue(actor, issueId);
  const text = body.trim();
  if (!text || text.length > 10_000) throw new AccessError("Bình luận 1–10000 ký tự", 400);
  const [c] = await db
    .insert(issueComments)
    .values({
      issueId: issue.id,
      userId: actor.userId,
      viaTokenName: actor.kind === "token" ? actor.tokenName : null,
      body: text,
    })
    .returning();
  return c;
}

/* ------------------------------------------------- activity & notifications */

export async function listProjectEvents(
  actor: Actor,
  slug: string,
  opts: { kind?: EventKind; environment?: string; limit?: number; before?: string } = {},
) {
  const { project } = await getProjectAccess(actor, slug);
  const rows = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.projectId, project.id),
        opts.kind ? eq(events.kind, opts.kind) : undefined,
        opts.environment ? eq(events.environment, opts.environment) : undefined,
        opts.before ? lt(events.timestamp, new Date(opts.before)) : undefined,
      ),
    )
    .orderBy(desc(events.timestamp))
    .limit(Math.min(opts.limit ?? 50, 200));
  return { project, events: rows };
}

export async function listNotifications(actor: Actor, opts: { unreadOnly?: boolean; limit?: number } = {}) {
  requireScope(actor, "read");
  return db
    .select({ event: events, projectName: projects.name, projectSlug: projects.slug })
    .from(events)
    .innerJoin(projects, eq(projects.id, events.projectId))
    .innerJoin(
      projectMembers,
      and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, actor.userId)),
    )
    .where(
      and(
        eq(events.kind, "notification"),
        opts.unreadOnly ? isNull(events.readAt) : undefined,
        actor.kind === "token" && actor.projectId ? eq(events.projectId, actor.projectId) : undefined,
      ),
    )
    .orderBy(desc(events.timestamp))
    .limit(Math.min(opts.limit ?? 100, 200));
}

export async function unreadNotificationCount(userId: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(events)
    .innerJoin(projectMembers, and(eq(projectMembers.projectId, events.projectId), eq(projectMembers.userId, userId)))
    .where(and(eq(events.kind, "notification"), isNull(events.readAt)));
  return r.n;
}

export async function markNotificationsRead(actor: Actor, ids: string[] | "all") {
  requireScope(actor, "write");
  const visible = db
    .select({ id: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, actor.userId));
  await db
    .update(events)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(events.kind, "notification"),
        isNull(events.readAt),
        inArray(events.projectId, visible),
        ids === "all" ? undefined : inArray(events.id, ids.filter((i) => /^[0-9a-f-]{36}$/i.test(i))),
      ),
    );
}

export async function listReleases(actor: Actor, slug: string) {
  const { project } = await getProjectAccess(actor, slug);
  const rows = await db
    .select({
      version: releases.version,
      environment: releases.environment,
      firstSeen: releases.firstSeen,
      lastSeen: releases.lastSeen,
      eventCount: releases.eventCount,
      newIssues: sql<number>`(select count(*) from ${issues} where ${issues.projectId} = ${project.id}
        and ${issues.environment} = ${releases.environment} and ${issues.firstRelease} = ${releases.version})::int`,
    })
    .from(releases)
    .where(eq(releases.projectId, project.id))
    .orderBy(desc(releases.firstSeen))
    .limit(100);
  return { project, releases: rows };
}

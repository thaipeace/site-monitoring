import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  eventReceipts,
  events,
  issueHourly,
  issues,
  projects,
  releases,
  type Issue,
  type Project,
} from "../db/schema";
import { issueTitle, type NormalizedEvent } from "./contract";

export type IngestOutcome =
  | { ma_su_kien: string; trang_thai: "duplicate" }
  | {
      ma_su_kien: string;
      trang_thai: "accepted";
      stored: boolean;
      issue_id?: string;
      // Why an alert might fire for this event (decided after commit)
      trigger?: "new" | "regression" | "spike" | "notification";
    };

function hourOf(d: Date) {
  const h = new Date(d);
  h.setUTCMinutes(0, 0, 0);
  return h;
}

/**
 * Stores one normalized event. Runs in a single transaction:
 *  1. idempotency receipt — a re-sent ma_su_kien stops here and counts nothing
 *     (so_lan = N counts N everywhere, once)
 *  2. release upsert
 *  3. issue upsert (new / existing / regression)
 *  4. hourly roll-up + sampling decision
 *  5. full event row, only if within the sampling budget
 */
export async function ingestEvent(project: Project, e: NormalizedEvent): Promise<IngestOutcome> {
  return db.transaction(async (tx) => {
    const receipt = await tx
      .insert(eventReceipts)
      .values({ projectId: project.id, environment: e.environment, eventId: e.eventId })
      .onConflictDoNothing()
      .returning({ eventId: eventReceipts.eventId });
    if (receipt.length === 0) return { ma_su_kien: e.eventId, trang_thai: "duplicate" as const };

    let releaseFirstSeen: Date | null = null;
    if (e.release) {
      const [rel] = await tx
        .insert(releases)
        .values({
          projectId: project.id,
          environment: e.environment,
          version: e.release,
          firstSeen: e.timestamp,
          lastSeen: e.timestamp,
          eventCount: e.count,
        })
        .onConflictDoUpdate({
          target: [releases.projectId, releases.environment, releases.version],
          set: {
            eventCount: sql`${releases.eventCount} + ${e.count}`,
            lastSeen: sql`greatest(${releases.lastSeen}, excluded.last_seen)`,
          },
        })
        .returning({ firstSeen: releases.firstSeen });
      releaseFirstSeen = rel.firstSeen;
    }

    // Activity-stream kinds (event / notification) are not grouped into issues.
    if (e.kind !== "error") {
      await tx.insert(events).values({ ...baseRow(project, e), issueId: null });
      return {
        ma_su_kien: e.eventId,
        trang_thai: "accepted" as const,
        stored: true,
        trigger: e.kind === "notification" ? ("notification" as const) : undefined,
      };
    }

    // ---- issue upsert
    let trigger: "new" | "regression" | undefined;
    let issue: Issue | undefined;

    const [existing] = await tx
      .select()
      .from(issues)
      .where(
        and(
          eq(issues.projectId, project.id),
          eq(issues.environment, e.environment),
          eq(issues.fingerprint, e.fingerprint),
        ),
      )
      .for("update")
      .limit(1);

    if (!existing) {
      const [{ counter }] = await tx
        .update(projects)
        .set({ issueCounter: sql`${projects.issueCounter} + 1` })
        .where(eq(projects.id, project.id))
        .returning({ counter: projects.issueCounter });
      const inserted = await tx
        .insert(issues)
        .values({
          projectId: project.id,
          environment: e.environment,
          shortId: counter,
          fingerprint: e.fingerprint,
          errorType: e.errorType,
          title: issueTitle(e),
          culprit: e.path ?? e.stack?.[0] ?? null,
          source: e.source,
          level: e.level,
          eventCount: e.count,
          firstSeen: e.timestamp,
          lastSeen: e.timestamp,
          firstRelease: e.release,
          lastRelease: e.release,
        })
        // A concurrent request created the same issue first: fall through to update.
        .onConflictDoNothing({ target: [issues.projectId, issues.environment, issues.fingerprint] })
        .returning();
      if (inserted.length) {
        issue = inserted[0];
        trigger = "new";
      }
    }

    if (!issue) {
      const current =
        existing ??
        (
          await tx
            .select()
            .from(issues)
            .where(
              and(
                eq(issues.projectId, project.id),
                eq(issues.environment, e.environment),
                eq(issues.fingerprint, e.fingerprint),
              ),
            )
            .for("update")
            .limit(1)
        )[0];

      const regressed =
        current.status === "resolved" &&
        (!current.resolvedInNextRelease ||
          // "resolved in next release": only a release first seen after the fix reopens
          (releaseFirstSeen !== null && current.resolvedAt !== null && releaseFirstSeen > current.resolvedAt));

      const [updated] = await tx
        .update(issues)
        .set({
          eventCount: sql`${issues.eventCount} + ${e.count}`,
          lastSeen: sql`greatest(${issues.lastSeen}, ${e.timestamp.toISOString()}::timestamptz)`,
          lastRelease: e.release ?? current.lastRelease,
          ...(regressed
            ? { status: "unresolved" as const, resolvedAt: null, resolvedInNextRelease: false }
            : {}),
        })
        .where(eq(issues.id, current.id))
        .returning();
      issue = updated;
      if (regressed) trigger = "regression";
    }

    // ---- hourly roll-up + sampling
    const [bucket] = await tx
      .insert(issueHourly)
      .values({ issueId: issue.id, projectId: project.id, hour: hourOf(e.timestamp), count: e.count, stored: 0 })
      .onConflictDoUpdate({
        target: [issueHourly.issueId, issueHourly.hour],
        set: { count: sql`${issueHourly.count} + ${e.count}` },
      })
      .returning({ count: issueHourly.count, stored: issueHourly.stored });

    // Always keep the first event of a new / regressed issue
    const store = trigger !== undefined || bucket.stored < project.sampleLimitPerHour;
    if (store) {
      await tx
        .update(issueHourly)
        .set({ stored: sql`${issueHourly.stored} + 1` })
        .where(and(eq(issueHourly.issueId, issue.id), eq(issueHourly.hour, hourOf(e.timestamp))));
      await tx.insert(events).values({ ...baseRow(project, e), issueId: issue.id });
    }

    const spike =
      !trigger &&
      project.alertThresholdPerHour > 0 &&
      bucket.count >= project.alertThresholdPerHour;

    return {
      ma_su_kien: e.eventId,
      trang_thai: "accepted" as const,
      stored: store,
      issue_id: issue.id,
      trigger: trigger ?? (spike ? ("spike" as const) : undefined),
    };
  });
}

function baseRow(project: Project, e: NormalizedEvent) {
  return {
    projectId: project.id,
    eventId: e.eventId,
    kind: e.kind,
    level: e.level,
    environment: e.environment,
    source: e.source,
    release: e.release,
    errorType: e.errorType,
    message: e.message,
    stack: e.stack,
    path: e.path,
    fingerprint: e.fingerprint,
    timestamp: e.timestamp,
    occurrences: e.count,
    requestId: e.requestId,
  };
}

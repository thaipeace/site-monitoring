import "server-only";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "./db";
import { issueHourly, issues, type Issue, type Project } from "./db/schema";
import type { IngestOutcome } from "./ingest/process";
import type { NormalizedEvent } from "./ingest/contract";

const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export function shortId(project: Pick<Project, "slug">, issue: Pick<Issue, "shortId">) {
  return `${project.slug.toUpperCase()}-${issue.shortId}`;
}

/**
 * Atomically claims the right to alert for an issue. Under concurrent requests only
 * one UPDATE matches (row lock + WHERE re-check), so the alert is sent exactly once
 * per cooldown window.
 */
async function claimIssueAlert(issueId: string, cooldownMinutes: number) {
  const claimed = await db
    .update(issues)
    .set({ lastAlertedAt: sql`now()` })
    .where(
      and(
        eq(issues.id, issueId),
        or(
          isNull(issues.lastAlertedAt),
          lt(issues.lastAlertedAt, sql`now() - make_interval(mins => ${cooldownMinutes})`),
        ),
      ),
    )
    .returning();
  return claimed[0] ?? null;
}

const REASON = {
  new: "Lỗi mới",
  regression: "Lỗi tái phát",
  spike: "Lỗi tăng đột biến",
} as const;

/** Runs after the response is sent. Never throws. */
export async function dispatchAlerts(
  project: Project,
  items: { outcome: IngestOutcome; event: NormalizedEvent }[],
) {
  const envs = project.alertEnvironments.split(",").map((s) => s.trim()).filter(Boolean);
  if (!hasChannel(project)) return; // don't consume the alert claim when nothing would be sent
  const handled = new Set<string>();

  for (const { outcome, event } of items) {
    try {
      if (outcome.trang_thai !== "accepted" || !outcome.trigger) continue;
      if (!envs.includes(event.environment)) continue;

      if (outcome.trigger === "notification") {
        if (!project.alertOnNotification) continue;
        await send(project, {
          subject: `[${project.name}/${event.environment}] ${event.errorType}`,
          lines: [event.message ?? "", `Nguồn: ${event.source ?? "-"} · Phiên bản: ${event.release ?? "-"}`],
          url: `${appUrl()}/projects/${project.slug}/events`,
        });
        continue;
      }

      if (!outcome.issue_id || handled.has(outcome.issue_id)) continue;
      handled.add(outcome.issue_id);
      if (outcome.trigger === "new" && !project.alertOnNewIssue) continue;
      if (outcome.trigger === "regression" && !project.alertOnRegression) continue;

      const issue = await claimIssueAlert(outcome.issue_id, project.alertCooldownMinutes);
      if (!issue) continue; // someone else already alerted within the cooldown

      const [{ lastHour }] = await db
        .select({ lastHour: sql<number>`coalesce(sum(${issueHourly.count}), 0)::int` })
        .from(issueHourly)
        .where(and(eq(issueHourly.issueId, issue.id), sql`${issueHourly.hour} > now() - interval '1 hour'`));

      await send(project, {
        subject: `[${project.name}/${issue.environment}] ${REASON[outcome.trigger]}: ${issue.title}`.slice(0, 200),
        lines: [
          `${REASON[outcome.trigger]} — ${shortId(project, issue)}`,
          issue.title,
          `Nơi xảy ra: ${issue.culprit ?? "-"}`,
          `Môi trường: ${issue.environment} · Nguồn: ${issue.source ?? "-"} · Phiên bản: ${issue.lastRelease ?? "-"}`,
          `Tổng số lần: ${issue.eventCount} · Trong 1 giờ qua: ${lastHour}`,
        ],
        url: `${appUrl()}/projects/${project.slug}/issues/${issue.id}`,
      });
    } catch (err) {
      console.error("[alerts] failed", err);
    }
  }
}

function alertRecipients(project: Project) {
  return (project.alertEmails ?? "").split(/[,\s]+/).filter((s) => s.includes("@"));
}

function hasChannel(project: Project) {
  return Boolean(project.webhookUrl) || (alertRecipients(project).length > 0 && Boolean(process.env.RESEND_API_KEY));
}

async function send(project: Project, msg: { subject: string; lines: string[]; url: string }) {
  const text = [...msg.lines.filter(Boolean), "", msg.url].join("\n");
  const tasks: Promise<unknown>[] = [];

  const to = alertRecipients(project);
  if (to.length && process.env.RESEND_API_KEY) {
    tasks.push(
      fetchWithTimeout("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.ALERT_FROM_EMAIL ?? "Site Monitoring <onboarding@resend.dev>",
          to,
          subject: msg.subject,
          text,
        }),
      }),
    );
  }
  if (project.webhookUrl) {
    tasks.push(
      fetchWithTimeout(project.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `text` makes it Slack / Google Chat / Discord(-ish) compatible
        body: JSON.stringify({ text: `*${msg.subject}*\n${text}`, subject: msg.subject, url: msg.url }),
      }),
    );
  }
  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === "rejected") console.error("[alerts] channel failed", r.reason);
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 8000) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

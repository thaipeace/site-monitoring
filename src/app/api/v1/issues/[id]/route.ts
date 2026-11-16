import { z } from "zod";
import { apiRoute } from "@/lib/api/handler";
import { getIssueDetail, setIssueStatus } from "@/lib/services/issues";

export const GET = apiRoute<{ id: string }>(async (actor, _req, { id }) => {
  const d = await getIssueDetail(actor, id);
  return {
    issue: { ...d.issue, short_id: `${d.project.slug.toUpperCase()}-${d.issue.shortId}`, project: d.project.slug },
    counts: { last_hour: d.counts.lastHour, last_24h: d.counts.last24h },
    hourly_last_14d: d.series,
    by_release: d.releaseBreakdown,
    latest_event: d.latestEvent,
    comments: d.comments,
  };
});

const patchBody = z.object({ action: z.enum(["resolve", "resolve_next_release", "ignore", "unresolve"]) });

export const PATCH = apiRoute<{ id: string }>(async (actor, request, { id }) => {
  const { action } = patchBody.parse(await request.json());
  return { issue: await setIssueStatus(actor, id, action) };
});

import { apiRoute, searchParams } from "@/lib/api/handler";
import { listIssues, parseIssueFilters } from "@/lib/services/issues";

/** ?status=unresolved|resolved|ignored|all &env= &release= &period=1h|24h|7d|14d|30d &q= &sort=last_seen|first_seen|events &limit= &offset= */
export const GET = apiRoute<{ slug: string }>(async (actor, request, { slug }) => {
  const filters = parseIssueFilters(searchParams(request));
  const { issues, hasMore, project } = await listIssues(actor, slug, filters);
  return {
    issues: issues.map((i) => ({
      id: i.id,
      short_id: `${project.slug.toUpperCase()}-${i.shortId}`,
      title: i.title,
      error_type: i.errorType,
      culprit: i.culprit,
      source: i.source,
      environment: i.environment,
      level: i.level,
      status: i.status,
      events_total: i.eventCount,
      events_in_period: i.periodCount,
      first_seen: i.firstSeen,
      last_seen: i.lastSeen,
      first_release: i.firstRelease,
      last_release: i.lastRelease,
    })),
    has_more: hasMore,
    next_offset: hasMore ? (filters.offset ?? 0) + (filters.limit ?? 50) : null,
  };
});

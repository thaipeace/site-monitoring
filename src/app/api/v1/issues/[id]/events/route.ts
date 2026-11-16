import { apiRoute, searchParams } from "@/lib/api/handler";
import { listIssueEvents } from "@/lib/services/issues";

export const GET = apiRoute<{ id: string }>(async (actor, request, { id }) => {
  const sp = searchParams(request);
  return { events: await listIssueEvents(actor, id, { limit: Number(sp.limit) || 50, before: sp.before }) };
});

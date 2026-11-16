import { apiRoute, searchParams } from "@/lib/api/handler";
import { listProjectEvents } from "@/lib/services/issues";

const KINDS = ["error", "event", "notification"] as const;

/** ?kind=error|event|notification &env= &limit= &before=<ISO timestamp> */
export const GET = apiRoute<{ slug: string }>(async (actor, request, { slug }) => {
  const sp = searchParams(request);
  const { events } = await listProjectEvents(actor, slug, {
    kind: KINDS.find((k) => k === sp.kind),
    environment: sp.env,
    limit: Number(sp.limit) || 50,
    before: sp.before,
  });
  return { events };
});

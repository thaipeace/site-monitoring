import { apiRoute, searchParams } from "@/lib/api/handler";
import { listNotifications } from "@/lib/services/issues";

export const GET = apiRoute(async (actor, request) => {
  const sp = searchParams(request);
  const rows = await listNotifications(actor, { unreadOnly: sp.unread === "1" || sp.unread === "true" });
  return { notifications: rows.map((r) => ({ ...r.event, project: r.projectSlug })) };
});

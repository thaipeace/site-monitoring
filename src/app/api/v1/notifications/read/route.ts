import { z } from "zod";
import { apiRoute } from "@/lib/api/handler";
import { markNotificationsRead } from "@/lib/services/issues";

const body = z.union([z.object({ all: z.literal(true) }), z.object({ ids: z.array(z.string()).min(1).max(500) })]);

export const POST = apiRoute(async (actor, request) => {
  const input = body.parse(await request.json());
  await markNotificationsRead(actor, "all" in input ? "all" : input.ids);
  return { ok: true };
});

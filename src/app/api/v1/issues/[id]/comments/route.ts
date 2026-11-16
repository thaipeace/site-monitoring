import { z } from "zod";
import { apiRoute } from "@/lib/api/handler";
import { addComment } from "@/lib/services/issues";

const body = z.object({ body: z.string().min(1).max(10_000) });

export const POST = apiRoute<{ id: string }>(async (actor, request, { id }) => {
  const input = body.parse(await request.json());
  return Response.json({ comment: await addComment(actor, id, input.body) }, { status: 201 });
});

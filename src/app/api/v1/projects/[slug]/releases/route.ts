import { apiRoute } from "@/lib/api/handler";
import { listReleases } from "@/lib/services/issues";

export const GET = apiRoute<{ slug: string }>(async (actor, _req, { slug }) => {
  const { releases } = await listReleases(actor, slug);
  return { releases };
});

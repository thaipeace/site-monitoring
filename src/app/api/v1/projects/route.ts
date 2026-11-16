import { z } from "zod";
import { apiRoute } from "@/lib/api/handler";
import { createProject, listProjects, projectStats } from "@/lib/services/projects";

export const GET = apiRoute(async (actor) => {
  const projects = await listProjects(actor);
  const stats = await projectStats(projects.map((p) => p.id));
  return { projects: projects.map((p) => ({ ...p, ...stats.get(p.id) })) };
});

const createBody = z.object({ name: z.string().min(1).max(80), slug: z.string().max(40).optional() });

/** Creates a project with one ingest key per environment (that / thu / dev). Secrets are returned once. */
export const POST = apiRoute(async (actor, request) => {
  const input = createBody.parse(await request.json());
  const { project, keys } = await createProject(actor, input);
  return Response.json(
    {
      project: { id: project.id, name: project.name, slug: project.slug },
      ingest_keys: keys.map((k) => ({ environment: k.environment, key_id: k.keyId, secret: k.secret })),
      note: "Store each secret now (e.g. as a Worker secret). Secrets can be revealed again by project admins in the UI.",
    },
    { status: 201 },
  );
});

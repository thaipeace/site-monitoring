import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { AccessError, type Actor } from "../services/access";
import { authenticateBearer } from "../services/tokens";

type Ctx<P> = { params: Promise<P> };

/** Wraps an API route: authenticates the Bearer token and maps errors to JSON. */
export function apiRoute<P = Record<string, never>>(
  handler: (actor: Actor, request: Request, params: P) => Promise<unknown>,
) {
  return async (request: Request, ctx: Ctx<P>) => {
    try {
      const actor = await authenticateBearer(request.headers.get("authorization"));
      const result = await handler(actor, request, await ctx.params);
      return result instanceof Response ? result : Response.json(result);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown) {
  unstable_rethrow(err); // let Next.js internals (prerender bail-out, redirects) propagate
  if (err instanceof AccessError) return Response.json({ error: err.message }, { status: err.status });
  if (err instanceof ZodError) {
    return Response.json({ error: "Invalid input", details: err.issues.slice(0, 10) }, { status: 400 });
  }
  if (err instanceof SyntaxError) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  console.error("[api]", err);
  return Response.json({ error: "Internal error" }, { status: 500 });
}

export function searchParams(request: Request) {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}

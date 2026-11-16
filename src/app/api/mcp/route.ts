/**
 * Minimal MCP server (Streamable HTTP transport, stateless, JSON responses).
 * Auth: `Authorization: Bearer smt_...` (same API tokens as /api/v1).
 */
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { errorResponse } from "@/lib/api/handler";
import { integrationGuideText } from "@/lib/integration";
import { getProjectAccess, type Actor } from "@/lib/services/access";
import {
  addComment,
  getIssueDetail,
  listIssueEvents,
  listIssues,
  listNotifications,
  listProjectEvents,
  listReleases,
  markNotificationsRead,
  parseIssueFilters,
  setIssueStatus,
} from "@/lib/services/issues";
import { createProject, listIngestKeys, listProjects, projectStats } from "@/lib/services/projects";
import { authenticateBearer } from "@/lib/services/tokens";

const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];

type Tool = {
  name: string;
  description: string;
  inputSchema: z.ZodObject;
  run: (actor: Actor, args: Record<string, unknown>) => Promise<unknown>;
};

const slug = z.string().describe("Project slug");
const issueId = z.string().describe("Issue id (uuid)");

const TOOLS: Tool[] = [
  {
    name: "list_projects",
    description: "List projects you can access, with unresolved issue count and events in the last 24h.",
    inputSchema: z.object({}),
    run: async (actor) => {
      const ps = await listProjects(actor);
      const stats = await projectStats(ps.map((p) => p.id));
      return ps.map((p) => ({ ...p, ...stats.get(p.id) }));
    },
  },
  {
    name: "create_project",
    description:
      "Create a project (requires admin scope). Returns one ingest key + secret per environment (that/thu/dev). Show the secrets to the user once; store them as secrets in the target app.",
    inputSchema: z.object({ name: z.string().min(1).max(80), slug: z.string().max(40).optional() }),
    run: async (actor, a) => {
      const { project, keys } = await createProject(actor, a as { name: string; slug?: string });
      return { project: { name: project.name, slug: project.slug }, ingest_keys: keys };
    },
  },
  {
    name: "get_integration_guide",
    description:
      "How to send errors from an app (ingest contract, HMAC signing, Worker/Node examples). Pass a project slug to include its key ids.",
    inputSchema: z.object({ project: slug.optional() }),
    run: async (actor, a) => {
      if (!a.project) return integrationGuideText();
      const { project } = await getProjectAccess(actor, String(a.project));
      const keys = (await listIngestKeys(actor, project.slug)).filter((k) => !k.revokedAt);
      return integrationGuideText({ slug: project.slug, keys });
    },
  },
  {
    name: "list_issues",
    description: "List grouped errors (issues) of a project with filters.",
    inputSchema: z.object({
      project: slug,
      status: z.enum(["unresolved", "resolved", "ignored", "all"]).optional(),
      env: z.string().optional().describe("Environment: that / thu / dev"),
      release: z.string().optional(),
      period: z.enum(["1h", "24h", "7d", "14d", "30d"]).optional(),
      q: z.string().optional().describe("Search in title / culprit / error type"),
      sort: z.enum(["last_seen", "first_seen", "events"]).optional(),
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional(),
    }),
    run: async (actor, a) => {
      const sp = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v == null ? undefined : String(v)]));
      const { issues, hasMore } = await listIssues(actor, String(a.project), parseIssueFilters(sp));
      return {
        issues: issues.map((i) => {
          const { spark, ...rest } = i;
          return { ...rest, hourly_24h: spark };
        }),
        has_more: hasMore,
      };
    },
  },
  {
    name: "get_issue",
    description: "Issue detail: counts, hourly series (14 days), per-release breakdown, latest event (message, stack, route) and comments.",
    inputSchema: z.object({ issue_id: issueId }),
    run: async (actor, a) => {
      const d = await getIssueDetail(actor, String(a.issue_id));
      return { ...d, project: { slug: d.project.slug, name: d.project.name } };
    },
  },
  {
    name: "list_issue_events",
    description: "Stored (sampled) events of an issue, newest first.",
    inputSchema: z.object({ issue_id: issueId, limit: z.number().int().min(1).max(200).optional() }),
    run: (actor, a) => listIssueEvents(actor, String(a.issue_id), { limit: a.limit as number | undefined }),
  },
  {
    name: "update_issue_status",
    description:
      "Change issue status (write scope). resolve: any new event reopens it. resolve_next_release: only events from a release first seen after now reopen it.",
    inputSchema: z.object({
      issue_id: issueId,
      action: z.enum(["resolve", "resolve_next_release", "ignore", "unresolve"]),
    }),
    run: (actor, a) => setIssueStatus(actor, String(a.issue_id), a.action as "resolve"),
  },
  {
    name: "add_issue_comment",
    description: "Add a comment / analysis note to an issue (write scope). Markdown allowed.",
    inputSchema: z.object({ issue_id: issueId, body: z.string().min(1).max(10_000) }),
    run: (actor, a) => addComment(actor, String(a.issue_id), String(a.body)),
  },
  {
    name: "list_events",
    description: "Raw event stream of a project (errors, custom events, notifications).",
    inputSchema: z.object({
      project: slug,
      kind: z.enum(["error", "event", "notification"]).optional(),
      env: z.string().optional(),
      limit: z.number().int().min(1).max(200).optional(),
    }),
    run: async (actor, a) =>
      (
        await listProjectEvents(actor, String(a.project), {
          kind: a.kind as "error" | undefined,
          environment: a.env as string | undefined,
          limit: a.limit as number | undefined,
        })
      ).events,
  },
  {
    name: "list_releases",
    description: "Releases seen per environment with event counts and number of new issues introduced.",
    inputSchema: z.object({ project: slug }),
    run: async (actor, a) => (await listReleases(actor, String(a.project))).releases,
  },
  {
    name: "list_notifications",
    description: "Notifications (events sent with loai=thong_bao) across your projects.",
    inputSchema: z.object({ unread_only: z.boolean().optional() }),
    run: async (actor, a) =>
      (await listNotifications(actor, { unreadOnly: Boolean(a.unread_only) })).map((r) => ({
        ...r.event,
        project: r.projectSlug,
      })),
  },
  {
    name: "mark_notifications_read",
    description: "Mark notifications as read (write scope). Pass ids, or all=true.",
    inputSchema: z.object({ ids: z.array(z.string()).optional(), all: z.boolean().optional() }),
    run: async (actor, a) => {
      await markNotificationsRead(actor, a.all ? "all" : ((a.ids as string[]) ?? []));
      return { ok: true };
    },
  },
];

type RpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

const rpcResult = (id: RpcRequest["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const rpcError = (id: RpcRequest["id"], code: number, message: string) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message },
});

async function handle(actor: Actor, req: RpcRequest) {
  switch (req.method) {
    case "initialize": {
      const requested = String(req.params?.protocolVersion ?? "");
      return rpcResult(req.id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "site-monitoring", version: "0.1.0" },
        instructions:
          "Error monitoring for your projects. Start with list_projects, then list_issues / get_issue. Use get_integration_guide to wire a new app.",
      });
    }
    case "ping":
      return rpcResult(req.id, {});
    case "tools/list":
      return rpcResult(req.id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: z.toJSONSchema(t.inputSchema),
        })),
      });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === req.params?.name);
      if (!tool) return rpcError(req.id, -32602, `Unknown tool: ${String(req.params?.name)}`);
      const parsed = tool.inputSchema.safeParse(req.params?.arguments ?? {});
      if (!parsed.success) {
        return rpcResult(req.id, {
          isError: true,
          content: [{ type: "text", text: `Invalid arguments: ${parsed.error.message}` }],
        });
      }
      try {
        const out = await tool.run(actor, parsed.data as Record<string, unknown>);
        const text = typeof out === "string" ? out : JSON.stringify(out, null, 2);
        return rpcResult(req.id, { content: [{ type: "text", text }] });
      } catch (err) {
        unstable_rethrow(err);
        return rpcResult(req.id, {
          isError: true,
          content: [{ type: "text", text: err instanceof Error ? err.message : "Tool failed" }],
        });
      }
    }
    default:
      return rpcError(req.id, -32601, `Method not found: ${req.method}`);
  }
}

export async function POST(request: Request) {
  let actor: Actor;
  try {
    actor = await authenticateBearer(request.headers.get("authorization"));
  } catch (err) {
    return errorResponse(err);
  }

  let body: RpcRequest | RpcRequest[];
  try {
    body = await request.json();
  } catch {
    return Response.json(rpcError(null, -32700, "Parse error"), { status: 400 });
  }

  const batch = Array.isArray(body) ? body : [body];
  const responses = [];
  for (const msg of batch) {
    if (msg.id === undefined) continue; // notification (e.g. notifications/initialized): no response
    responses.push(await handle(actor, msg));
  }
  if (!responses.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? responses : responses[0]);
}

export function GET() {
  // No server-initiated stream in this stateless server.
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}

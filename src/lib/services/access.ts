import "server-only";
import { and, eq, or } from "drizzle-orm";
import { db } from "../db";
import { projectMembers, projects, type Project, type ProjectRole } from "../db/schema";

export const TOKEN_SCOPES = ["read", "write", "admin"] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];

export const SCOPE_DESCRIPTIONS: Record<TokenScope, string> = {
  read: "Read projects, issues, events and notifications",
  write: "Resolve / ignore issues, comment, mark notifications read, send test events",
  admin: "Create projects, manage ingest keys and alert settings",
};

/** Who is performing an operation: a signed-in user, or an AI agent via API token. */
export type Actor =
  | { kind: "user"; userId: string }
  | {
      kind: "token";
      userId: string;
      tokenId: string;
      tokenName: string;
      scopes: TokenScope[];
      projectId: string | null;
    };

export class AccessError extends Error {
  constructor(
    message: string,
    public status: 401 | 403 | 404 | 400 = 403,
  ) {
    super(message);
  }
}

export function requireScope(actor: Actor, scope: TokenScope) {
  if (actor.kind === "user") return;
  // admin implies write, write implies read
  const rank = { read: 0, write: 1, admin: 2 } as const;
  const best = Math.max(-1, ...actor.scopes.map((s) => rank[s]));
  if (best < rank[scope]) {
    throw new AccessError(`Token is missing the "${scope}" scope`, 403);
  }
}

const roleRank: Record<ProjectRole, number> = { member: 0, admin: 1, owner: 2 };

export type ProjectAccess = { project: Project; role: ProjectRole };

/**
 * Loads a project by slug or id, if the actor is a member.
 * Throws 404 when not found / not a member (don't leak existence).
 */
export async function getProjectAccess(
  actor: Actor,
  slugOrId: string,
  opts: { minRole?: ProjectRole; scope?: TokenScope } = {},
): Promise<ProjectAccess> {
  requireScope(actor, opts.scope ?? "read");
  const isUuid = /^[0-9a-f-]{36}$/i.test(slugOrId);
  const [row] = await db
    .select({ project: projects, role: projectMembers.role })
    .from(projects)
    .innerJoin(
      projectMembers,
      and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, actor.userId)),
    )
    .where(isUuid ? or(eq(projects.id, slugOrId), eq(projects.slug, slugOrId)) : eq(projects.slug, slugOrId))
    .limit(1);
  if (!row) throw new AccessError("Project not found", 404);
  if (actor.kind === "token" && actor.projectId && actor.projectId !== row.project.id) {
    throw new AccessError("Project not found", 404);
  }
  if (opts.minRole && roleRank[row.role] < roleRank[opts.minRole]) {
    throw new AccessError(`Requires ${opts.minRole} role on this project`, 403);
  }
  return row;
}

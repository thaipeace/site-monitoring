import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  ingestKeys,
  issueHourly,
  issues,
  projectMembers,
  projects,
  users,
  type ProjectRole,
} from "../db/schema";
import { decryptSecret, encryptSecret } from "../secrets";
import { AccessError, getProjectAccess, requireScope, type Actor } from "./access";

export const DEFAULT_ENVIRONMENTS = ["that", "thu", "dev"] as const;
export const ENV_LABEL: Record<string, string> = { that: "Thật", thu: "Thử", dev: "Dev" };

export function slugify(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/gi, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "project"
  );
}

export async function listProjects(actor: Actor) {
  requireScope(actor, "read");
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
      role: projectMembers.role,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .innerJoin(
      projectMembers,
      and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, actor.userId)),
    )
    .orderBy(asc(projects.name));
  if (actor.kind === "token" && actor.projectId) return rows.filter((r) => r.id === actor.projectId);
  return rows;
}

/** Per-project counters for the overview: unresolved issues + events in the last 24h. */
export async function projectStats(projectIds: string[]) {
  if (!projectIds.length) return new Map<string, { unresolved: number; events24h: number }>();
  const [unresolved, recent] = await Promise.all([
    db
      .select({ projectId: issues.projectId, n: sql<number>`count(*)::int` })
      .from(issues)
      .where(and(inArray(issues.projectId, projectIds), eq(issues.status, "unresolved")))
      .groupBy(issues.projectId),
    db
      .select({ projectId: issueHourly.projectId, n: sql<number>`coalesce(sum(${issueHourly.count}),0)::int` })
      .from(issueHourly)
      .where(and(inArray(issueHourly.projectId, projectIds), sql`${issueHourly.hour} > now() - interval '24 hours'`))
      .groupBy(issueHourly.projectId),
  ]);
  const map = new Map<string, { unresolved: number; events24h: number }>();
  for (const id of projectIds) map.set(id, { unresolved: 0, events24h: 0 });
  for (const r of unresolved) map.get(r.projectId)!.unresolved = r.n;
  for (const r of recent) map.get(r.projectId)!.events24h = r.n;
  return map;
}

function newKeyMaterial() {
  return { keyId: `gs_${randomBytes(9).toString("hex")}`, secret: randomBytes(32).toString("base64url") };
}

export async function createProject(actor: Actor, input: { name: string; slug?: string }) {
  requireScope(actor, "admin");
  if (actor.kind === "token" && actor.projectId) {
    throw new AccessError("Token bị giới hạn trong một project, không tạo được project mới", 403);
  }
  const name = input.name.trim();
  if (!name || name.length > 80) throw new AccessError("Tên project 1–80 ký tự", 400);
  let slug = slugify(input.slug || name);
  const taken = await db.select({ slug: projects.slug }).from(projects).where(sql`${projects.slug} like ${slug + "%"}`);
  if (taken.some((t) => t.slug === slug)) {
    let i = 2;
    while (taken.some((t) => t.slug === `${slug}-${i}`)) i++;
    slug = `${slug}-${i}`;
  }

  return db.transaction(async (tx) => {
    const [project] = await tx.insert(projects).values({ name, slug }).returning();
    await tx.insert(projectMembers).values({ projectId: project.id, userId: actor.userId, role: "owner" });
    const keys = DEFAULT_ENVIRONMENTS.map((environment) => {
      const m = newKeyMaterial();
      return { environment, keyId: m.keyId, secret: m.secret };
    });
    await tx.insert(ingestKeys).values(
      keys.map((k) => ({
        projectId: project.id,
        environment: k.environment,
        keyId: k.keyId,
        secretEnc: encryptSecret(k.secret),
      })),
    );
    return { project, keys };
  });
}

export const projectSettingsFields = [
  "name",
  "alertEmails",
  "webhookUrl",
  "alertEnvironments",
  "alertOnNewIssue",
  "alertOnRegression",
  "alertThresholdPerHour",
  "alertCooldownMinutes",
  "alertOnNotification",
  "sampleLimitPerHour",
  "retentionDays",
] as const;

export type ProjectSettings = Partial<{
  name: string;
  alertEmails: string | null;
  webhookUrl: string | null;
  alertEnvironments: string;
  alertOnNewIssue: boolean;
  alertOnRegression: boolean;
  alertThresholdPerHour: number;
  alertCooldownMinutes: number;
  alertOnNotification: boolean;
  sampleLimitPerHour: number;
  retentionDays: number;
}>;

export async function updateProjectSettings(actor: Actor, slug: string, input: ProjectSettings) {
  const { project } = await getProjectAccess(actor, slug, { minRole: "admin", scope: "admin" });
  if (input.webhookUrl && !/^https:\/\//.test(input.webhookUrl)) {
    throw new AccessError("Webhook phải là URL https://", 400);
  }
  const clamp = (n: number | undefined, min: number, max: number) =>
    n === undefined || Number.isNaN(n) ? undefined : Math.min(max, Math.max(min, Math.round(n)));
  const [updated] = await db
    .update(projects)
    .set({
      ...input,
      alertThresholdPerHour: clamp(input.alertThresholdPerHour, 0, 1_000_000),
      alertCooldownMinutes: clamp(input.alertCooldownMinutes, 1, 10_080),
      sampleLimitPerHour: clamp(input.sampleLimitPerHour, 1, 10_000),
      retentionDays: clamp(input.retentionDays, 1, 365),
    })
    .where(eq(projects.id, project.id))
    .returning();
  return updated;
}

export async function deleteProject(actor: Actor, slug: string) {
  const { project } = await getProjectAccess(actor, slug, { minRole: "owner", scope: "admin" });
  await db.delete(projects).where(eq(projects.id, project.id));
}

/* ---------------------------------------------------------------- keys */

export async function listIngestKeys(actor: Actor, slug: string, opts: { revealSecrets?: boolean } = {}) {
  const { project } = await getProjectAccess(actor, slug, {
    minRole: opts.revealSecrets ? "admin" : "member",
    scope: opts.revealSecrets ? "admin" : "read",
  });
  const rows = await db
    .select()
    .from(ingestKeys)
    .where(eq(ingestKeys.projectId, project.id))
    .orderBy(asc(ingestKeys.environment), desc(ingestKeys.createdAt));
  return rows.map((k) => ({
    id: k.id,
    environment: k.environment,
    keyId: k.keyId,
    secret: opts.revealSecrets ? decryptSecret(k.secretEnc) : undefined,
    lastUsedAt: k.lastUsedAt,
    revokedAt: k.revokedAt,
    createdAt: k.createdAt,
  }));
}

export async function createIngestKey(actor: Actor, slug: string, environment: string) {
  const { project } = await getProjectAccess(actor, slug, { minRole: "admin", scope: "admin" });
  if (!/^[a-z0-9-]{1,20}$/.test(environment)) throw new AccessError("Môi trường: a-z, 0-9, '-' (≤20)", 400);
  const m = newKeyMaterial();
  const [key] = await db
    .insert(ingestKeys)
    .values({ projectId: project.id, environment, keyId: m.keyId, secretEnc: encryptSecret(m.secret) })
    .returning();
  return { id: key.id, environment, keyId: m.keyId, secret: m.secret };
}

export async function revokeIngestKey(actor: Actor, slug: string, keyId: string) {
  const { project } = await getProjectAccess(actor, slug, { minRole: "admin", scope: "admin" });
  await db
    .update(ingestKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(ingestKeys.projectId, project.id), eq(ingestKeys.id, keyId)));
}

/* ------------------------------------------------------------- members */

export async function listMembers(actor: Actor, slug: string) {
  const { project } = await getProjectAccess(actor, slug);
  return db
    .select({ userId: users.id, email: users.email, name: users.name, role: projectMembers.role })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, project.id))
    .orderBy(asc(users.email));
}

export async function addMember(actor: Actor, slug: string, email: string, role: ProjectRole) {
  const { project } = await getProjectAccess(actor, slug, { minRole: "admin", scope: "admin" });
  if (role === "owner") throw new AccessError("Không thể thêm owner", 400);
  const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
  if (!user) throw new AccessError("Chưa có tài khoản với email này — người đó cần đăng ký trước", 400);
  await db
    .insert(projectMembers)
    .values({ projectId: project.id, userId: user.id, role })
    .onConflictDoUpdate({ target: [projectMembers.projectId, projectMembers.userId], set: { role } });
}

export async function removeMember(actor: Actor, slug: string, userId: string) {
  const { project } = await getProjectAccess(actor, slug, { minRole: "admin", scope: "admin" });
  const [target] = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, userId)));
  if (target?.role === "owner") throw new AccessError("Không thể xoá owner", 400);
  await db
    .delete(projectMembers)
    .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, userId)));
}

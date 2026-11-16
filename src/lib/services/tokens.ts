import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { apiTokens, projects } from "../db/schema";
import { newApiToken, sha256 } from "../crypto";
import { AccessError, TOKEN_SCOPES, type Actor, type TokenScope } from "./access";

export async function listTokens(userId: string) {
  return db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      prefix: apiTokens.prefix,
      scopes: apiTokens.scopes,
      projectName: projects.name,
      lastUsedAt: apiTokens.lastUsedAt,
      expiresAt: apiTokens.expiresAt,
      revokedAt: apiTokens.revokedAt,
      createdAt: apiTokens.createdAt,
    })
    .from(apiTokens)
    .leftJoin(projects, eq(projects.id, apiTokens.projectId))
    .where(eq(apiTokens.userId, userId))
    .orderBy(desc(apiTokens.createdAt));
}

export async function createToken(
  userId: string,
  input: { name: string; scopes: string[]; projectId?: string | null; expiresInDays?: number | null },
) {
  const name = input.name.trim();
  if (!name || name.length > 80) throw new AccessError("Tên token 1–80 ký tự", 400);
  const scopes = input.scopes.filter((s): s is TokenScope => (TOKEN_SCOPES as readonly string[]).includes(s));
  if (!scopes.length) throw new AccessError("Chọn ít nhất một quyền", 400);
  const token = newApiToken();
  await db.insert(apiTokens).values({
    userId,
    name,
    tokenHash: sha256(token),
    prefix: token.slice(0, 10),
    scopes,
    projectId: input.projectId || null,
    expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null,
  });
  return token;
}

export async function revokeToken(userId: string, tokenId: string) {
  await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)));
}

/** Resolves `Authorization: Bearer smt_...` into an Actor, or throws 401. */
export async function authenticateBearer(header: string | null): Promise<Actor> {
  const token = header?.match(/^Bearer\s+(smt_[A-Za-z0-9_-]+)$/)?.[1];
  if (!token) throw new AccessError("Thiếu hoặc sai header Authorization: Bearer smt_…", 401);
  const [row] = await db.select().from(apiTokens).where(eq(apiTokens.tokenHash, sha256(token))).limit(1);
  if (!row || row.revokedAt || (row.expiresAt && row.expiresAt < new Date())) {
    throw new AccessError("Token không hợp lệ, đã thu hồi hoặc hết hạn", 401);
  }
  // Best effort, at most once a minute
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.id));
  }
  return {
    kind: "token",
    userId: row.userId,
    tokenId: row.id,
    tokenName: row.name,
    scopes: row.scopes as TokenScope[],
    projectId: row.projectId,
  };
}

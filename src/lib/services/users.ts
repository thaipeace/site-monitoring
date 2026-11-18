import "server-only";
import { and, asc, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { invites, sessions, users, type UserRole } from "../db/schema";
import { randomToken, sha256 } from "../crypto";
import { hashPassword } from "../password";
import { AccessError } from "./access";

/**
 * Workspace user management, modelled on Task Board:
 * no public sign-up, single-use invite links, admin / member roles,
 * lock instead of delete, admin-issued password reset links.
 * Callers (server actions) must check `requireAdmin()` first.
 */

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 24 * 60 * 60 * 1000;
export const USER_ROLES = ["member", "admin"] as const satisfies readonly UserRole[];

export function allowedDomain() {
  return (process.env.ALLOWED_EMAIL_DOMAIN ?? "").trim().toLowerCase().replace(/^@/, "");
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function checkDomain(email: string) {
  const domain = allowedDomain();
  if (domain && !email.endsWith(`@${domain}`)) throw new AccessError(`Chỉ mời được email @${domain}`, 400);
}

export async function listUsers() {
  return db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role, active: users.active, createdAt: users.createdAt })
    .from(users)
    .orderBy(desc(users.active), asc(users.name));
}

/** Unused, unexpired links. */
export async function listPendingInvites() {
  return db
    .select({ id: invites.id, email: invites.email, role: invites.role, isReset: invites.isReset, expiresAt: invites.expiresAt })
    .from(invites)
    .where(and(isNull(invites.usedAt), gt(invites.expiresAt, sql`now()`)))
    .orderBy(desc(invites.createdAt));
}

async function insertLink(email: string, role: UserRole, isReset: boolean, createdById: string, ttlMs: number) {
  const token = randomToken();
  await db.transaction(async (tx) => {
    // One live link per email: a new link replaces older unused ones.
    await tx.delete(invites).where(and(eq(invites.email, email), isNull(invites.usedAt)));
    await tx.insert(invites).values({
      tokenHash: sha256(token),
      email,
      role,
      isReset,
      createdById,
      expiresAt: new Date(Date.now() + ttlMs),
    });
  });
  return token;
}

/** Returns the raw token once; only its hash is stored. */
export async function createInvite(adminId: string, rawEmail: string, role: UserRole) {
  const email = normalizeEmail(rawEmail);
  checkDomain(email);
  const [existing] = await db.select({ active: users.active }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    throw new AccessError(
      existing.active ? "Email này đã có tài khoản" : "Tài khoản này đang bị khoá – bấm Mở khoá thay vì mời lại",
      400,
    );
  }
  return insertLink(email, role, false, adminId, INVITE_TTL_MS);
}

export async function createResetLink(adminId: string, userId: string) {
  if (userId === adminId) throw new AccessError("Tự đổi mật khẩu ở trang Tài khoản", 400);
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new AccessError("Không tìm thấy người dùng", 404);
  if (!user.active) throw new AccessError("Tài khoản đang bị khoá – mở khoá trước", 400);
  return insertLink(user.email, user.role, true, adminId, RESET_TTL_MS);
}

export async function revokeInvite(inviteId: string) {
  await db.delete(invites).where(and(eq(invites.id, inviteId), isNull(invites.usedAt)));
}

/** Refuses to leave the workspace without an active admin. */
async function assertNotLastAdmin(userId: string) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.active, true), ne(users.id, userId)));
  if (n === 0) throw new AccessError("Phải còn ít nhất một quản trị viên đang hoạt động", 400);
}

export async function setUserRole(adminId: string, userId: string, role: UserRole) {
  if (userId === adminId) throw new AccessError("Không tự đổi quyền của mình", 400);
  if (!USER_ROLES.includes(role)) throw new AccessError("Vai trò không hợp lệ", 400);
  if (role !== "admin") await assertNotLastAdmin(userId);
  const updated = await db.update(users).set({ role }).where(eq(users.id, userId)).returning({ id: users.id });
  if (!updated.length) throw new AccessError("Không tìm thấy người dùng", 404);
}

export async function setUserActive(adminId: string, userId: string, active: boolean) {
  if (userId === adminId) throw new AccessError("Không tự khoá tài khoản của mình", 400);
  if (!active) await assertNotLastAdmin(userId);
  await db.transaction(async (tx) => {
    const [user] = await tx.update(users).set({ active }).where(eq(users.id, userId)).returning();
    if (!user) throw new AccessError("Không tìm thấy người dùng", 404);
    if (!active) {
      // Sign out everywhere and kill pending links (a reset link would re-open the account).
      await tx.delete(sessions).where(eq(sessions.userId, userId));
      await tx.delete(invites).where(and(eq(invites.email, user.email), isNull(invites.usedAt)));
    }
  });
}

/** For the /invite/[token] page: a usable link, or null. */
export async function findInvite(token: string) {
  const [row] = await db
    .select({ email: invites.email, role: invites.role, isReset: invites.isReset, expiresAt: invites.expiresAt })
    .from(invites)
    .where(and(eq(invites.tokenHash, sha256(token)), isNull(invites.usedAt), gt(invites.expiresAt, sql`now()`)))
    .limit(1);
  if (!row) return null;
  const [user] = await db.select({ name: users.name }).from(users).where(eq(users.email, row.email)).limit(1);
  return { ...row, existingName: user?.name ?? null };
}

/**
 * Consumes a link: creates the account (invite) or sets a new password (reset).
 * Returns the user id to sign in.
 */
export async function acceptInvite(token: string, name: string, password: string) {
  const passwordHash = await hashPassword(password);
  return db.transaction(async (tx) => {
    // Claim atomically so a link can only be used once.
    const [invite] = await tx
      .update(invites)
      .set({ usedAt: new Date() })
      .where(and(eq(invites.tokenHash, sha256(token)), isNull(invites.usedAt), gt(invites.expiresAt, sql`now()`)))
      .returning();
    if (!invite) throw new AccessError("Link không hợp lệ, đã dùng hoặc đã hết hạn", 400);

    const [existing] = await tx.select().from(users).where(eq(users.email, invite.email)).limit(1);
    if (existing) {
      if (!existing.active) throw new AccessError("Tài khoản đang bị khoá", 403);
      await tx.update(users).set({ name, passwordHash }).where(eq(users.id, existing.id));
      // New password: old sessions are signed out.
      await tx.delete(sessions).where(eq(sessions.userId, existing.id));
      return existing.id;
    }
    const [created] = await tx
      .insert(users)
      .values({ email: invite.email, name, passwordHash, role: invite.role })
      .returning({ id: users.id });
    return created.id;
  });
}

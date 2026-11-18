import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { db } from "./db";
import { sessions, users, type UserRole } from "./db/schema";
import { randomToken, sha256 } from "./crypto";

export const SESSION_COOKIE = "sm_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type SessionUser = { id: string; email: string; name: string; role: UserRole };

export { hashPassword, verifyPassword } from "./password";

export async function createSession(userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id: sha256(token), userId, expiresAt });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, sha256(token)));
  jar.delete(SESSION_COOKIE);
}

/** sha256 id of the current session (empty string when signed out). */
export async function currentSessionId() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? sha256(token) : "";
}

/** Returns the signed-in user or null. Reads the request cookie. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    // Locked accounts lose access immediately, even with a live cookie.
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, sql`now()`), eq(users.active, true)))
    .limit(1);
  return row ?? null;
}

/** Use in Server Components / Actions that require a signed-in user. */
export async function requireUser(): Promise<SessionUser> {
  // Everything below a signed-in check is per-request data (live error counts, "x minutes ago").
  await connection();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Workspace admin only (user & invite management). Others go back to the overview. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

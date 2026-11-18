"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, currentSessionId, destroySession, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { AccessError } from "@/lib/services/access";
import { acceptInvite } from "@/lib/services/users";

export type FormState = { error?: string; ok?: string } | undefined;

function allowedDomain() {
  return (process.env.ALLOWED_EMAIL_DOMAIN ?? "").trim().toLowerCase().replace(/^@/, "");
}

function safeNext(next: FormDataEntryValue | null) {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

const credentials = z.object({
  email: z.email("Email không hợp lệ").transform((e) => e.trim().toLowerCase()),
  password: z.string().min(1, "Nhập mật khẩu"),
});

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const parsed = credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email, password } = parsed.data;

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  // Same message for unknown user / wrong password; always run bcrypt to keep timing similar.
  const ok = await verifyPassword(password, user?.passwordHash ?? "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali");
  if (!user || !ok) return { error: "Email hoặc mật khẩu không đúng" };
  if (!user.active) return { error: "Tài khoản đã bị khoá. Liên hệ quản trị viên." };

  const domain = allowedDomain();
  if (domain && !email.endsWith(`@${domain}`)) return { error: `Chỉ tài khoản @${domain} được đăng nhập` };

  await createSession(user.id);
  redirect(safeNext(form.get("next")));
}

const registration = z.object({
  name: z.string().trim().min(1, "Nhập tên").max(80),
  email: z.email("Email không hợp lệ").transform((e) => e.trim().toLowerCase()),
  password: z.string().min(10, "Mật khẩu tối thiểu 10 ký tự").max(200),
});

export async function register(_: FormState, form: FormData): Promise<FormState> {
  const parsed = registration.safeParse({
    name: form.get("name"),
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, email, password } = parsed.data;

  const domain = allowedDomain();
  if (domain && !email.endsWith(`@${domain}`)) return { error: `Chỉ email @${domain} được đăng ký` };

  // Like Task Board: no public sign-up. Only the very first account (the first admin)
  // registers here; everyone else joins through an invite link.
  const created = await db.transaction(async (tx) => {
    await tx.execute(sql`lock table ${users} in share row exclusive mode`);
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(users);
    if (n > 0) return null;
    const [row] = await tx
      .insert(users)
      .values({ name, email, passwordHash: await hashPassword(password), role: "admin" })
      .returning({ id: users.id });
    return row;
  });
  if (!created) return { error: "Chỉ đăng nhập bằng link mời. Liên hệ quản trị viên để được mời." };

  await createSession(created.id);
  redirect("/admin/users");
}

export async function acceptInviteAction(token: string, _: FormState, form: FormData): Promise<FormState> {
  const parsed = z
    .object({
      name: z.string().trim().min(1, "Nhập tên").max(80),
      password: z.string().min(10, "Mật khẩu tối thiểu 10 ký tự").max(200),
    })
    .safeParse({ name: form.get("name"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  let userId: string;
  try {
    userId = await acceptInvite(token, parsed.data.name, parsed.data.password);
  } catch (err) {
    if (err instanceof AccessError) return { error: err.message };
    throw err;
  }
  await createSession(userId);
  redirect("/");
}

const accountSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên").max(80),
  currentPassword: z.string(),
  newPassword: z.union([z.literal(""), z.string().min(10, "Mật khẩu mới tối thiểu 10 ký tự").max(200)]),
});

/** /account: change your own name and (optionally) password. */
export async function updateAccountAction(_: FormState, form: FormData): Promise<FormState> {
  const me = await requireUser();
  const parsed = accountSchema.safeParse({
    name: form.get("name"),
    currentPassword: form.get("currentPassword") ?? "",
    newPassword: form.get("newPassword") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, currentPassword, newPassword } = parsed.data;
  if (!newPassword) {
    await db.update(users).set({ name }).where(eq(users.id, me.id));
    return { ok: "Đã lưu" };
  }
  const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, me.id)).limit(1);
  if (!row || !(await verifyPassword(currentPassword, row.passwordHash))) return { error: "Mật khẩu hiện tại không đúng" };
  await db.update(users).set({ name, passwordHash: await hashPassword(newPassword) }).where(eq(users.id, me.id));
  // Sign out other devices; keep this one.
  await db.delete(sessions).where(and(eq(sessions.userId, me.id), ne(sessions.id, await currentSessionId())));
  return { ok: "Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất." };
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

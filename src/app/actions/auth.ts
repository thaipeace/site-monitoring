"use server";

import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

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

  if (process.env.ALLOW_REGISTRATION === "false") {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
    if (n > 0) return { error: "Đăng ký đang tắt. Liên hệ quản trị viên." };
  }

  const inserted = await db
    .insert(users)
    .values({ name, email, passwordHash: await hashPassword(password) })
    .onConflictDoNothing()
    .returning({ id: users.id });
  if (!inserted.length) return { error: "Email đã được đăng ký" };

  await createSession(inserted[0].id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

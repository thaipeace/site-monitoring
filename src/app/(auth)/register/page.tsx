import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { sql } from "drizzle-orm";
import { register } from "@/app/actions/auth";
import { AuthForm } from "@/components/auth-form";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const metadata = { title: "Tạo quản trị viên đầu tiên · Site Monitoring" };

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <Register />
    </Suspense>
  );
}

/** Only for an empty workspace: the first account becomes admin. Afterwards: invite links only. */
async function Register() {
  await connection();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  if (n > 0) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-zinc-700">Không có đăng ký công khai. Nhờ quản trị viên gửi link mời.</p>
        <Link href="/login" className="text-violet-700 hover:underline">Về trang đăng nhập</Link>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-600">Tạo quản trị viên đầu tiên.</p>
      <AuthForm mode="register" action={register} domain={process.env.ALLOWED_EMAIL_DOMAIN || undefined} />
    </div>
  );
}

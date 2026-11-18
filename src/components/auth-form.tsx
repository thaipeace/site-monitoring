"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "@/app/actions/auth";
import { Button, Field, input } from "./ui";

type Props = {
  mode: "login" | "register";
  action: (state: FormState, form: FormData) => Promise<FormState>;
  domain?: string;
  next?: string;
};

export function AuthForm({ mode, action, domain, next }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-4">
      {mode === "register" && (
        <Field label="Tên">
          <input name="name" required autoComplete="name" className={input} />
        </Field>
      )}
      <Field label="Email" hint={domain ? `Chỉ tài khoản @${domain}` : undefined}>
        <input name="email" type="email" required autoComplete="email" className={input} placeholder={domain ? `ten@${domain}` : undefined} />
      </Field>
      <Field label="Mật khẩu" hint={mode === "register" ? "Tối thiểu 10 ký tự" : undefined}>
        <input
          name="password"
          type="password"
          required
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          className={input}
        />
      </Field>
      {next && <input type="hidden" name="next" value={next} />}
      {state?.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Đang xử lý…" : mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}
      </Button>
      <p className="text-center text-sm text-zinc-500">
        {mode === "login" ? (
          <>Chưa có tài khoản? Nhờ quản trị viên gửi link mời.</>
        ) : (
          <>
            Đã có tài khoản? <Link className="text-violet-700 hover:underline" href="/login">Đăng nhập</Link>
          </>
        )}
      </p>
    </form>
  );
}

export function AcceptInviteForm({
  action,
  defaultName,
  reset,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  defaultName: string;
  reset: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-4">
      <Field label="Tên">
        <input name="name" required autoComplete="name" defaultValue={defaultName} maxLength={80} className={input} />
      </Field>
      <Field label={reset ? "Mật khẩu mới" : "Mật khẩu"} hint="Tối thiểu 10 ký tự">
        <input name="password" type="password" required minLength={10} autoComplete="new-password" className={input} />
      </Field>
      {state?.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Đang xử lý…" : reset ? "Đặt mật khẩu & đăng nhập" : "Tạo tài khoản & đăng nhập"}
      </Button>
    </form>
  );
}

export function AccountForm({ name, action }: { name: string; action: (state: FormState, form: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="max-w-md space-y-4">
      <Field label="Tên">
        <input name="name" required defaultValue={name} maxLength={80} className={input} />
      </Field>
      <Field label="Mật khẩu hiện tại" hint="Chỉ cần khi đổi mật khẩu">
        <input name="currentPassword" type="password" autoComplete="current-password" className={input} />
      </Field>
      <Field label="Mật khẩu mới" hint="Để trống nếu không đổi · tối thiểu 10 ký tự">
        <input name="newPassword" type="password" autoComplete="new-password" className={input} />
      </Field>
      {state?.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.ok}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Đang lưu…" : "Lưu"}</Button>
    </form>
  );
}

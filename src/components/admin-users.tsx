"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createInviteAction,
  createResetLinkAction,
  setUserActiveAction,
  setUserRoleAction,
  type LinkState,
} from "@/app/actions/admin";
import { CopyButton } from "./client-bits";
import { Badge, Button, Field, btn, cx, input } from "./ui";

export const USER_ROLE_LABEL = { admin: "Quản trị", member: "Thành viên" } as const;
type Role = keyof typeof USER_ROLE_LABEL;

/** Shows a one-time link with a copy button. */
function LinkBox({ state }: { state: LinkState }) {
  if (!state?.token) return null;
  const url = `${window.location.origin}/invite/${state.token}`;
  return (
    <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
      <p className="font-medium text-amber-900">
        {state.isReset ? "Link đặt lại mật khẩu" : "Link mời"} cho <b>{state.email}</b> – chỉ hiện một lần, hãy copy ngay
        {state.isReset ? " (hết hạn sau 24 giờ)." : " (dùng một lần, hết hạn sau 7 ngày)."}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="break-all rounded bg-white px-2 py-1 font-mono text-xs ring-1 ring-zinc-200">{url}</code>
        <CopyButton text={url} className="px-2 py-0.5 text-xs" />
      </div>
    </div>
  );
}

export function InviteForm({ domain }: { domain?: string }) {
  const [state, action, pending] = useActionState(createInviteAction, undefined);
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <Field label="Email">
            <input name="email" type="email" required className={input} placeholder={domain ? `ten@${domain}` : "email@congty.com"} />
          </Field>
        </div>
        <select name="role" className={`${input} w-auto`} aria-label="Vai trò" defaultValue="member">
          <option value="member">Thành viên</option>
          <option value="admin">Quản trị</option>
        </select>
        <Button type="submit" disabled={pending}>{pending ? "Đang tạo…" : "Tạo link mời"}</Button>
      </form>
      {state?.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <LinkBox state={state} />
    </div>
  );
}

export type UserRow = { id: string; email: string; name: string; role: Role; active: boolean };

export function UserItem({ user, isMe }: { user: UserRow; isMe: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [link, setLink] = useState<LinkState>();

  const run = (fn: () => Promise<{ error?: string } | LinkState>) =>
    start(async () => {
      setError(undefined);
      const res = await fn();
      if (res?.error) setError(res.error);
      else if (res && "token" in res) setLink(res);
    });

  return (
    <li className={cx("py-3", pending && "opacity-60")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700">
            {user.name.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 font-medium">
              {user.name}
              {isMe && <span className="text-xs font-normal text-zinc-500">(bạn)</span>}
              {!user.active && <Badge tone="red">đã khoá</Badge>}
            </div>
            <div className="truncate text-xs text-zinc-500">{user.email}</div>
          </div>
        </div>
        {isMe ? (
          <Badge tone={user.role === "admin" ? "violet" : "zinc"}>{USER_ROLE_LABEL[user.role]}</Badge>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              aria-label={`Vai trò của ${user.email}`}
              className={`${input} w-auto py-1 text-xs`}
              value={user.role}
              disabled={pending}
              onChange={(e) => run(() => setUserRoleAction(user.id, e.target.value))}
            >
              <option value="member">Thành viên</option>
              <option value="admin">Quản trị</option>
            </select>
            {user.active && (
              <button
                type="button"
                className={cx(btn.base, btn.secondary, "px-2 py-1 text-xs")}
                disabled={pending}
                onClick={() => run(() => createResetLinkAction(user.id, user.email))}
              >
                Đặt lại mật khẩu
              </button>
            )}
            <button
              type="button"
              className={cx(btn.base, user.active ? btn.danger : btn.secondary, "px-2 py-1 text-xs")}
              disabled={pending}
              onClick={() => {
                if (user.active && !confirm(`Khoá tài khoản ${user.email}? Người dùng bị đăng xuất ngay, API token ngừng hoạt động.`)) return;
                run(() => setUserActiveAction(user.id, !user.active));
              }}
            >
              {user.active ? "Khoá" : "Mở khoá"}
            </button>
          </div>
        )}
      </div>
      {error && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {link?.token && (
        <div className="mt-2">
          <LinkBox state={link} />
        </div>
      )}
    </li>
  );
}

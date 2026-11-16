"use client";

import { useActionState } from "react";
import { createTokenAction } from "@/app/actions/dashboard";
import { CopyButton } from "./client-bits";
import { Button, Field, input } from "./ui";

export function TokenForm({
  projects,
  scopes,
  mcpUrl,
}: {
  projects: { id: string; name: string }[];
  scopes: { value: string; label: string }[];
  mcpUrl: string;
}) {
  const [state, action, pending] = useActionState(createTokenAction, undefined);
  const mcp = state?.secret
    ? JSON.stringify(
        { mcpServers: { "site-monitoring": { type: "http", url: mcpUrl, headers: { Authorization: `Bearer ${state.secret}` } } } },
        null,
        2,
      )
    : "";
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <Field label="Tên token" hint="Ví dụ: Claude Code – máy Thái">
          <input name="name" required maxLength={80} className={input} />
        </Field>
        <div>
          <div className="mb-1 text-sm font-medium">Quyền</div>
          <div className="space-y-1">
            {scopes.map((s) => (
              <label key={s.value} className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="scopes" value={s.value} defaultChecked={s.value !== "admin"} className="mt-0.5 h-4 w-4" />
                <span><b>{s.value}</b> — {s.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Giới hạn project">
            <select name="projectId" className={input} defaultValue="">
              <option value="">Mọi project của tôi</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Hết hạn sau (ngày)" hint="Để trống = không hết hạn">
            <input name="expiresInDays" type="number" min={1} max={3650} defaultValue={90} className={input} />
          </Field>
        </div>
        {state?.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
        <Button type="submit" disabled={pending}>{pending ? "Đang tạo…" : "Tạo token"}</Button>
      </form>

      {state?.secret && (
        <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-medium text-amber-900">Token chỉ hiện một lần. Lưu ngay:</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-white px-2 py-1 font-mono text-xs ring-1 ring-zinc-200">{state.secret}</code>
            <CopyButton text={state.secret} className="px-2 py-0.5 text-xs" />
          </div>
          <p className="text-amber-900">Cấu hình MCP (Claude Code: <code>.mcp.json</code>; Cursor: <code>mcp.json</code>):</p>
          <pre className="overflow-x-auto rounded bg-zinc-950 p-3 text-xs text-zinc-100">{mcp}</pre>
          <CopyButton text={mcp} label="Chép cấu hình MCP" />
        </div>
      )}
    </div>
  );
}

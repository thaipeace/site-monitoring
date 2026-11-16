"use client";

import { useActionState } from "react";
import {
  addMemberAction,
  createKeyAction,
  deleteProjectAction,
  updateProjectAction,
  type ActionState,
} from "@/app/actions/dashboard";
import type { Project } from "@/lib/db/schema";
import { CopyButton } from "./client-bits";
import { Button, Field, input } from "./ui";

function Status({ state }: { state: ActionState }) {
  if (state?.error) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>;
  if (state?.ok) return <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.ok}</p>;
  return null;
}

const check = "h-4 w-4 rounded border-zinc-300 text-violet-600";

export function ProjectSettingsForm({ project, environments }: { project: Project; environments: string[] }) {
  const [state, action, pending] = useActionState(updateProjectAction.bind(null, project.slug), undefined);
  const alertEnvs = project.alertEnvironments.split(",");
  return (
    <form action={action} className="space-y-5">
      <Field label="Tên project">
        <input name="name" defaultValue={project.name} className={input} maxLength={80} />
      </Field>

      <fieldset className="space-y-3 rounded-md border border-zinc-200 p-4">
        <legend className="px-1 text-sm font-semibold">Cảnh báo</legend>
        <Field label="Email nhận cảnh báo" hint="Nhiều email cách nhau bằng dấu phẩy. Gửi qua Resend bằng khoá riêng của webapp (RESEND_API_KEY).">
          <input name="alertEmails" defaultValue={project.alertEmails ?? ""} className={input} placeholder="ops@siroby.com, ..." />
        </Field>
        <Field label="Webhook (tuỳ chọn)" hint='POST JSON {"text": "..."} — tương thích Slack / Google Chat.'>
          <input name="webhookUrl" defaultValue={project.webhookUrl ?? ""} className={input} placeholder="https://hooks.slack.com/..." />
        </Field>
        <div>
          <div className="mb-1 text-sm font-medium">Môi trường được cảnh báo</div>
          <div className="flex flex-wrap gap-4">
            {environments.map((e) => (
              <label key={e} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="alertEnvironments" value={e} defaultChecked={alertEnvs.includes(e)} className={check} />
                {e}
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="alertOnNewIssue" defaultChecked={project.alertOnNewIssue} className={check} /> Lỗi mới
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="alertOnRegression" defaultChecked={project.alertOnRegression} className={check} /> Lỗi tái phát
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="alertOnNotification" defaultChecked={project.alertOnNotification} className={check} /> Thông báo (loai = thong_bao)
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Ngưỡng tăng đột biến (lần / giờ / nhóm lỗi)" hint="0 = tắt">
            <input name="alertThresholdPerHour" type="number" min={0} defaultValue={project.alertThresholdPerHour} className={input} />
          </Field>
          <Field label="Thời gian chờ giữa 2 cảnh báo (phút)" hint="Một nhóm lỗi không cảnh báo lại trong khoảng này">
            <input name="alertCooldownMinutes" type="number" min={1} defaultValue={project.alertCooldownMinutes} className={input} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="grid gap-3 rounded-md border border-zinc-200 p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">Lưu trữ & chống bão lỗi</legend>
        <Field label="Số event chi tiết tối đa / giờ / nhóm lỗi" hint="Vượt ngưỡng chỉ cộng dồn số đếm">
          <input name="sampleLimitPerHour" type="number" min={1} defaultValue={project.sampleLimitPerHour} className={input} />
        </Field>
        <Field label="Giữ dữ liệu (ngày)">
          <input name="retentionDays" type="number" min={1} max={365} defaultValue={project.retentionDays} className={input} />
        </Field>
      </fieldset>

      <Status state={state} />
      <Button type="submit" disabled={pending}>{pending ? "Đang lưu…" : "Lưu cài đặt"}</Button>
    </form>
  );
}

export function NewKeyForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(createKeyAction.bind(null, slug), undefined);
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap items-end gap-2">
        <Field label="Tạo khoá mới cho môi trường">
          <input name="environment" required pattern="[a-z0-9-]{1,20}" placeholder="that / thu / dev" className={input} />
        </Field>
        <Button type="submit" variant="secondary" disabled={pending}>Tạo khoá</Button>
      </form>
      {state?.error && <Status state={state} />}
      {state?.secret && (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-medium text-amber-900">Khoá mới cho môi trường “{state.environment}”. Lưu secret ngay vào secret của app:</p>
          <SecretLine label="GS_KEY_ID" value={state.keyId!} />
          <SecretLine label="GS_SECRET" value={state.secret} />
        </div>
      )}
    </div>
  );
}

export function SecretLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="rounded bg-white px-2 py-1 font-mono text-xs ring-1 ring-zinc-200">{label}={value}</code>
      <CopyButton text={value} className="px-2 py-0.5 text-xs" />
    </div>
  );
}

export function AddMemberForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(addMemberAction.bind(null, slug), undefined);
  return (
    <form action={action} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Email thành viên">
          <input name="email" type="email" required className={input} placeholder="ten@siroby.com" />
        </Field>
        <select name="role" className={`${input} w-auto`} aria-label="Vai trò">
          <option value="member">Thành viên</option>
          <option value="admin">Quản trị</option>
        </select>
        <Button type="submit" variant="secondary" disabled={pending}>Thêm</Button>
      </div>
      <Status state={state} />
    </form>
  );
}

export function DeleteProjectForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(deleteProjectAction.bind(null, slug), undefined);
  return (
    <form action={action} className="space-y-2">
      <p className="text-sm text-zinc-600">Xoá vĩnh viễn project, mọi nhóm lỗi, sự kiện và khoá. Gõ <code className="font-mono">{slug}</code> để xác nhận.</p>
      <div className="flex flex-wrap gap-2">
        <input name="confirm" className={`${input} max-w-xs`} autoComplete="off" />
        <Button type="submit" variant="danger" disabled={pending}>Xoá project</Button>
      </div>
      <Status state={state} />
    </form>
  );
}

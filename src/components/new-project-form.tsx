"use client";

import { useActionState } from "react";
import { createProjectAction } from "@/app/actions/dashboard";
import { Button, Field, input } from "./ui";

export function NewProjectForm() {
  const [state, action, pending] = useActionState(createProjectAction, undefined);
  return (
    <form action={action} className="max-w-md space-y-4">
      <Field label="Tên project" hint="Ví dụ: Siroby. Sẽ tự tạo khoá cho 3 môi trường: thật, thử, dev.">
        <input name="name" required maxLength={80} className={input} autoFocus />
      </Field>
      {state?.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Đang tạo…" : "Tạo project"}</Button>
    </form>
  );
}

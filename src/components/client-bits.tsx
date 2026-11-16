"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/app/actions/dashboard";
import { Button, cx, btn, input } from "./ui";

export function CopyButton({ text, label = "Chép", className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={cx(btn.base, btn.secondary, className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {done ? "Đã chép ✓" : label}
    </button>
  );
}

export function CommentForm({ action }: { action: (s: ActionState, f: FormData) => Promise<ActionState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-2">
      <textarea name="body" required rows={3} maxLength={10000} className={input} placeholder="Ghi chú, phân tích nguyên nhân, link PR…" />
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Đang gửi…" : "Bình luận"}</Button>
    </form>
  );
}

export function ConfirmSubmit({ children, message, className }: { children: React.ReactNode; message: string; className?: string }) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

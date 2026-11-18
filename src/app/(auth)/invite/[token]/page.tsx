import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { acceptInviteAction } from "@/app/actions/auth";
import { AcceptInviteForm } from "@/components/auth-form";
import { findInvite } from "@/lib/services/users";

export const metadata = { title: "Nhận lời mời · Site Monitoring" };

export default function InvitePage(props: PageProps<"/invite/[token]">) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Đang kiểm tra link…</p>}>
      <Invite {...props} />
    </Suspense>
  );
}

async function Invite({ params }: PageProps<"/invite/[token]">) {
  await connection();
  const { token } = await params;
  const invite = await findInvite(token);
  if (!invite) {
    return (
      <div className="space-y-3 text-sm">
        <h1 className="text-base font-semibold text-zinc-900">Link không dùng được</h1>
        <p className="text-zinc-600">Link đã được dùng, đã bị huỷ hoặc đã hết hạn. Nhờ quản trị viên tạo link mới.</p>
        <Link href="/login" className="text-violet-700 hover:underline">Về trang đăng nhập</Link>
      </div>
    );
  }
  const reset = invite.existingName !== null;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-semibold text-zinc-900">{reset ? "Đặt lại mật khẩu" : "Nhận lời mời"}</h1>
        <p className="text-sm text-zinc-600">
          {reset ? "Đặt mật khẩu mới cho" : "Tạo tài khoản cho"} <b>{invite.email}</b>
        </p>
      </div>
      <AcceptInviteForm action={acceptInviteAction.bind(null, token)} defaultName={invite.existingName ?? ""} reset={reset} />
    </div>
  );
}

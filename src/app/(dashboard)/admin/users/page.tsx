import { Suspense } from "react";
import { revokeInviteAction } from "@/app/actions/admin";
import { InviteForm, USER_ROLE_LABEL, UserItem } from "@/components/admin-users";
import { ConfirmSubmit } from "@/components/client-bits";
import { Badge, Card, PageHeader, Skeleton, btn, cx } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { allowedDomain, listPendingInvites, listUsers } from "@/lib/services/users";

export const metadata = { title: "Người dùng · Site Monitoring" };

export default function UsersPage() {
  return (
    <>
      <PageHeader title="Người dùng" subtitle="Đăng nhập chỉ bằng link mời – không có đăng ký công khai." />
      <Suspense fallback={<Skeleton />}>
        <Users />
      </Suspense>
    </>
  );
}

async function Users() {
  const me = await requireAdmin();
  const [users, pending] = await Promise.all([listUsers(), listPendingInvites()]);
  const domain = allowedDomain() || undefined;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="space-y-4">
        <Card title="Mời người dùng">
          <InviteForm domain={domain} />
        </Card>
        <Card title={`Link đang chờ (${pending.length})`}>
          {pending.length === 0 ? (
            <p className="text-sm text-zinc-500">Không có link nào đang chờ.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 text-sm">
              {pending.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{i.email}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                      {i.isReset ? <Badge tone="yellow">Đặt lại mật khẩu</Badge> : <Badge>{USER_ROLE_LABEL[i.role]}</Badge>}
                      hết hạn {formatDateTime(i.expiresAt)}
                    </div>
                  </div>
                  <form action={revokeInviteAction.bind(null, i.id)}>
                    <ConfirmSubmit message={`Huỷ link của ${i.email}?`} className={cx(btn.base, btn.ghost, "px-2 py-1 text-xs")}>
                      Huỷ link
                    </ConfirmSubmit>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card title={`Thành viên (${users.length})`}>
        <ul className="divide-y divide-zinc-100 text-sm">
          {users.map((u) => (
            <UserItem key={u.id} user={u} isMe={u.id === me.id} />
          ))}
        </ul>
        <p className="mt-3 text-xs text-zinc-500">
          Quản trị: mời, đổi quyền, khoá người dùng. Không xoá tài khoản – khoá để chặn đăng nhập (giữ lịch sử bình luận). Quyền trong từng
          project đặt ở Cài đặt của project.
        </p>
      </Card>
    </div>
  );
}

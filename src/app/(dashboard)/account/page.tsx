import { Suspense } from "react";
import { updateAccountAction } from "@/app/actions/auth";
import { USER_ROLE_LABEL } from "@/components/admin-users";
import { AccountForm } from "@/components/auth-form";
import { Badge, Card, PageHeader, Skeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Tài khoản · Site Monitoring" };

export default function AccountPage() {
  return (
    <>
      <PageHeader title="Tài khoản" subtitle="Đổi tên và mật khẩu của bạn." />
      <Suspense fallback={<Skeleton rows={3} />}>
        <Account />
      </Suspense>
    </>
  );
}

async function Account() {
  const user = await requireUser();
  return (
    <Card title={<span className="flex items-center gap-2">{user.email} <Badge tone={user.role === "admin" ? "violet" : "zinc"}>{USER_ROLE_LABEL[user.role]}</Badge></span>}>
      <AccountForm name={user.name} action={updateAccountAction} />
    </Card>
  );
}

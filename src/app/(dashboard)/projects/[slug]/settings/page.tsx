import { Suspense } from "react";
import { removeMemberAction, revokeKeyAction } from "@/app/actions/dashboard";
import { ConfirmSubmit } from "@/components/client-bits";
import { AddMemberForm, DeleteProjectForm, NewKeyForm, ProjectSettingsForm, SecretLine } from "@/components/settings-forms";
import { Badge, Card, Code, Skeleton, btn, cx, envTone } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { envLabel, timeAgo } from "@/lib/format";
import { curlSnippet } from "@/lib/integration";
import { getProjectAccess } from "@/lib/services/access";
import { listIngestKeys, listMembers } from "@/lib/services/projects";

export default function SettingsPage(props: PageProps<"/projects/[slug]/settings">) {
  return (
    <Suspense fallback={<Skeleton />}>
      <Settings {...props} />
    </Suspense>
  );
}

const ROLE_LABEL = { owner: "Chủ sở hữu", admin: "Quản trị", member: "Thành viên" } as const;

async function Settings({ params, searchParams }: PageProps<"/projects/[slug]/settings">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const actor = { kind: "user" as const, userId: user.id };
  const { project, role } = await getProjectAccess(actor, slug);
  const isAdmin = role !== "member";
  const [keys, members] = await Promise.all([listIngestKeys(actor, slug, { revealSecrets: isAdmin }), listMembers(actor, slug)]);
  const activeKeys = keys.filter((k) => !k.revokedAt);
  const environments = [...new Set(["that", "thu", "dev", ...activeKeys.map((k) => k.environment)])];

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {sp.created && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 xl:col-span-2">
          Đã tạo project với 3 khoá (thật / thử / dev). Cấu hình <b>GS_KEY_ID</b> + <b>GS_SECRET</b> tương ứng làm secret của app ở từng môi trường, rồi gửi thử bằng lệnh bên dưới.
        </div>
      )}

      <Card title="Khoá gửi lỗi theo môi trường" className="xl:col-span-2">
        <p className="mb-3 text-sm text-zinc-600">
          Mỗi môi trường một khoá; khoá quyết định môi trường của sự kiện nên dữ liệu được tách riêng. Mỗi request ký HMAC-SHA256 bằng secret.
        </p>
        <div className="-mx-4 mb-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Môi trường</th>
                <th className="px-4 py-2 font-medium">Khoá</th>
                <th className="px-4 py-2 font-medium">Dùng lần cuối</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {keys.map((k) => (
                <tr key={k.id} className={k.revokedAt ? "opacity-50" : ""}>
                  <td className="px-4 py-2"><Badge tone={envTone(k.environment)}>{envLabel(k.environment)}</Badge></td>
                  <td className="px-4 py-2">
                    <SecretLine label="GS_KEY_ID" value={k.keyId} />
                    {k.secret && !k.revokedAt && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-violet-700">Hiện secret</summary>
                        <div className="mt-1"><SecretLine label="GS_SECRET" value={k.secret} /></div>
                      </details>
                    )}
                  </td>
                  <td className="px-4 py-2 text-zinc-600">{k.revokedAt ? "Đã thu hồi" : timeAgo(k.lastUsedAt)}</td>
                  <td className="px-4 py-2 text-right">
                    {isAdmin && !k.revokedAt && (
                      <form action={revokeKeyAction.bind(null, slug, k.id)}>
                        <ConfirmSubmit message="Thu hồi khoá này? App dùng khoá sẽ bị từ chối ngay." className={cx(btn.base, btn.danger, "px-2 py-1 text-xs")}>
                          Thu hồi
                        </ConfirmSubmit>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isAdmin && <NewKeyForm slug={slug} />}
        <div className="mt-4">
          <div className="mb-1 text-sm font-medium">Gửi thử bằng curl</div>
          <Code>{curlSnippet()}</Code>
        </div>
      </Card>

      <Card title="Cài đặt chung & cảnh báo">
        {isAdmin ? <ProjectSettingsForm project={project} environments={environments} /> : <p className="text-sm text-zinc-500">Cần quyền quản trị để sửa.</p>}
      </Card>

      <div className="space-y-4">
        <Card title="Thành viên">
          <ul className="mb-4 divide-y divide-zinc-100 text-sm">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-2 py-2">
                <div>
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-zinc-500">{m.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge>{ROLE_LABEL[m.role]}</Badge>
                  {isAdmin && m.role !== "owner" && (
                    <form action={removeMemberAction.bind(null, slug, m.userId)}>
                      <ConfirmSubmit message={`Xoá ${m.email} khỏi project?`} className={cx(btn.base, btn.ghost, "px-2 py-1 text-xs")}>
                        Xoá
                      </ConfirmSubmit>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {isAdmin && <AddMemberForm slug={slug} />}
        </Card>
        {role === "owner" && (
          <Card title="Vùng nguy hiểm">
            <DeleteProjectForm slug={slug} />
          </Card>
        )}
      </div>
    </div>
  );
}

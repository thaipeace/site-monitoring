import { Suspense } from "react";
import { revokeTokenAction } from "@/app/actions/dashboard";
import { ConfirmSubmit } from "@/components/client-bits";
import { TokenForm } from "@/components/token-form";
import { Badge, Card, Code, PageHeader, Skeleton, btn, cx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDateTime, timeAgo } from "@/lib/format";
import { appUrl, mcpConfigSnippet } from "@/lib/integration";
import { SCOPE_DESCRIPTIONS, TOKEN_SCOPES } from "@/lib/services/access";
import { listProjects } from "@/lib/services/projects";
import { listTokens } from "@/lib/services/tokens";

export default function TokensPage() {
  return (
    <>
      <PageHeader
        title="API tokens cho AI agent"
        subtitle="Token cho phép AI agent (Claude Code, Cursor, script…) đọc lỗi, đổi trạng thái, bình luận và tạo project qua REST API hoặc MCP."
      />
      <Suspense fallback={<Skeleton />}>
        <Tokens />
      </Suspense>
    </>
  );
}

async function Tokens() {
  const user = await requireUser();
  const [tokens, projects] = await Promise.all([listTokens(user.id), listProjects({ kind: "user", userId: user.id })]);
  const now = new Date();
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card title="Tạo token">
        <TokenForm
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          scopes={TOKEN_SCOPES.map((s) => ({ value: s, label: SCOPE_DESCRIPTIONS[s] }))}
          mcpUrl={`${appUrl()}/api/mcp`}
        />
      </Card>
      <div className="space-y-4">
        <Card title="Token của bạn">
          {tokens.length === 0 ? (
            <p className="text-sm text-zinc-500">Chưa có token.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 text-sm">
              {tokens.map((t) => {
                const dead = t.revokedAt || (t.expiresAt && t.expiresAt < now);
                return (
                  <li key={t.id} className={cx("flex items-start justify-between gap-2 py-2", dead && "opacity-50")}>
                    <div className="min-w-0">
                      <div className="font-medium">{t.name}</div>
                      <div className="mt-0.5 flex flex-wrap gap-1 text-xs text-zinc-500">
                        <code>{t.prefix}…</code>
                        {t.scopes.map((s) => (
                          <Badge key={s} tone="violet">{s}</Badge>
                        ))}
                        <Badge>{t.projectName ?? "mọi project"}</Badge>
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        Dùng lần cuối: {timeAgo(t.lastUsedAt)} · {t.revokedAt ? "đã thu hồi" : t.expiresAt ? `hết hạn ${formatDateTime(t.expiresAt)}` : "không hết hạn"}
                      </div>
                    </div>
                    {!t.revokedAt && (
                      <form action={revokeTokenAction.bind(null, t.id)}>
                        <ConfirmSubmit message="Thu hồi token này?" className={cx(btn.base, btn.danger, "px-2 py-1 text-xs")}>Thu hồi</ConfirmSubmit>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card title="Kết nối MCP">
          <p className="mb-2 text-sm text-zinc-600">Thêm vào cấu hình MCP của agent (thay token):</p>
          <Code>{mcpConfigSnippet()}</Code>
          <p className="mt-2 text-sm text-zinc-600">
            Hoặc Claude Code CLI:{" "}
            <code className="text-xs">claude mcp add --transport http site-monitoring {appUrl()}/api/mcp --header &quot;Authorization: Bearer smt_…&quot;</code>
          </p>
        </Card>
      </div>
    </div>
  );
}

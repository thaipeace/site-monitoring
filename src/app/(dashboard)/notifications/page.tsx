import Link from "next/link";
import { Suspense } from "react";
import { markReadAction } from "@/app/actions/dashboard";
import { Badge, Empty, PageHeader, Skeleton, btn, cx, envTone, levelTone } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { envLabel, formatDateTime, LEVEL_LABEL } from "@/lib/format";
import { listNotifications } from "@/lib/services/issues";

export default function NotificationsPage(props: PageProps<"/notifications">) {
  return (
    <>
      <PageHeader title="Thông báo" subtitle="Các sự kiện gửi với loai = thong_bao từ mọi project" />
      <Suspense fallback={<Skeleton />}>
        <Notifications {...props} />
      </Suspense>
    </>
  );
}

async function Notifications({ searchParams }: PageProps<"/notifications">) {
  const sp = await searchParams;
  const unreadOnly = sp.unread === "1";
  const user = await requireUser();
  const rows = await listNotifications({ kind: "user", userId: user.id }, { unreadOnly });
  const unreadIds = rows.filter((r) => !r.event.readAt).map((r) => r.event.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          <Link href="/notifications" className={cx(btn.base, !unreadOnly ? "bg-zinc-900 text-white" : btn.ghost)}>Tất cả</Link>
          <Link href="/notifications?unread=1" className={cx(btn.base, unreadOnly ? "bg-zinc-900 text-white" : btn.ghost)}>Chưa đọc</Link>
        </div>
        {unreadIds.length > 0 && (
          <form action={markReadAction.bind(null, "all")}>
            <button className={cx(btn.base, btn.secondary)}>Đánh dấu đã đọc tất cả</button>
          </form>
        )}
      </div>
      {rows.length === 0 ? (
        <Empty title="Không có thông báo" />
      ) : (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200 bg-white">
          {rows.map(({ event: e, projectName, projectSlug }) => (
            <li key={e.id} className={cx("flex flex-wrap items-start justify-between gap-3 px-4 py-3", !e.readAt && "bg-violet-50/50")}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  {!e.readAt && <span className="h-2 w-2 rounded-full bg-violet-600" aria-label="Chưa đọc" />}
                  <span className="font-medium">{e.errorType}</span>
                  <Badge tone={levelTone[e.level]}>{LEVEL_LABEL[e.level]}</Badge>
                  <Badge tone={envTone(e.environment)}>{envLabel(e.environment)}</Badge>
                </div>
                {e.message && <p className="mt-1 text-sm text-zinc-700">{e.message}</p>}
                <div className="mt-1 text-xs text-zinc-500">
                  <Link className="hover:underline" href={`/projects/${projectSlug}/events?kind=notification`}>{projectName}</Link> · {formatDateTime(e.timestamp)}
                  {e.source && ` · ${e.source}`}
                </div>
              </div>
              {!e.readAt && (
                <form action={markReadAction.bind(null, [e.id])}>
                  <button className={cx(btn.base, btn.ghost, "text-xs")}>Đã đọc</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

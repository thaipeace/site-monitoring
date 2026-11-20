import Link from "next/link";
import { Suspense } from "react";
import { Badge, Empty, Skeleton, btn, cx, envTone, levelTone } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { envLabel, formatDateTime, KIND_LABEL, LEVEL_LABEL } from "@/lib/format";
import { listProjectEvents } from "@/lib/services/issues";

export default function EventsPage(props: PageProps<"/projects/[slug]/events">) {
  return (
    <Suspense fallback={<Skeleton />}>
      <Events {...props} />
    </Suspense>
  );
}

const KINDS = ["error", "event", "notification"] as const;

async function Events({ params, searchParams }: PageProps<"/projects/[slug]/events">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const kind = KINDS.find((k) => k === sp.kind);
  const env = typeof sp.env === "string" && sp.env ? sp.env : undefined;
  const before = typeof sp.before === "string" ? sp.before : undefined;
  const { events } = await listProjectEvents({ kind: "user", userId: user.id }, slug, { kind, environment: env, before, limit: 100 });

  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ kind, env, ...patch })) if (v) q.set(k, v);
    return `/projects/${slug}/events?${q}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        <Link href={href({ kind: undefined, before: undefined })} className={cx(btn.base, !kind ? "bg-zinc-900 text-white" : btn.ghost)}>Tất cả</Link>
        {KINDS.map((k) => (
          <Link key={k} href={href({ kind: k, before: undefined })} className={cx(btn.base, kind === k ? "bg-zinc-900 text-white" : btn.ghost)}>
            {KIND_LABEL[k]}
          </Link>
        ))}
        <span className="mx-2 border-l border-zinc-300" />
        {[undefined, "that", "thu", "dev"].map((e) => (
          <Link key={e ?? "all"} href={href({ env: e, before: undefined })} className={cx(btn.base, env === e ? "bg-zinc-900 text-white" : btn.ghost)}>
            {e ? envLabel(e) : "Mọi môi trường"}
          </Link>
        ))}
      </div>

      {events.length === 0 ? (
        <Empty title="Chưa có sự kiện">Gửi thử một sự kiện theo hướng dẫn ở trang Tích hợp.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Thời gian</th>
                <th className="px-4 py-2 font-medium">Loại</th>
                <th className="px-4 py-2 font-medium">Nội dung</th>
                <th className="px-4 py-2 font-medium">Môi trường</th>
                <th className="px-4 py-2 font-medium">Nguồn</th>
                <th className="px-4 py-2 font-medium">Phiên bản</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {events.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-2 text-zinc-600">{formatDateTime(e.timestamp)}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <Badge>{KIND_LABEL[e.kind]}</Badge>
                      <Badge tone={levelTone[e.level]}>{LEVEL_LABEL[e.level]}</Badge>
                    </div>
                  </td>
                  <td className="max-w-lg px-4 py-2">
                    {e.issueId ? (
                      <Link href={`/projects/${slug}/issues/${e.issueId}`} className="font-medium hover:text-violet-700">{e.errorType}</Link>
                    ) : (
                      <span className="font-medium">{e.errorType}</span>
                    )}
                    {e.message && <div className="truncate text-zinc-600">{e.message}</div>}
                    {e.path && <div className="font-mono text-xs text-zinc-500">{e.path}</div>}
                    {(e.occurrences > 1 || e.requestId) && (
                      <div className="text-xs text-zinc-500">
                        {e.occurrences > 1 && <span className="mr-2 font-medium text-zinc-700">×{e.occurrences} lần</span>}
                        {e.requestId && <span className="font-mono">cf-ray {e.requestId}</span>}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2"><Badge tone={envTone(e.environment)}>{envLabel(e.environment)}</Badge></td>
                  <td className="px-4 py-2 text-zinc-600">{e.source ?? "—"}</td>
                  <td className="px-4 py-2 text-zinc-600">{e.release ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {events.length === 100 && (
        <div className="flex justify-end">
          <Link className={cx(btn.base, btn.secondary)} href={href({ before: events[events.length - 1].timestamp.toISOString() })}>Cũ hơn →</Link>
        </div>
      )}
    </div>
  );
}

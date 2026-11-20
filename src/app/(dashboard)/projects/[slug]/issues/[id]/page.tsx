import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { commentAction, issueStatusAction } from "@/app/actions/dashboard";
import { HourlyBars } from "@/components/charts";
import { CommentForm, CopyButton } from "@/components/client-bits";
import { Badge, Card, Skeleton, btn, cx, envTone, levelTone, statusTone } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { compact, envLabel, formatDateTime, LEVEL_LABEL, STATUS_LABEL, timeAgo } from "@/lib/format";
import { appUrl } from "@/lib/integration";
import { AccessError } from "@/lib/services/access";
import { getIssueDetail, listIssueEvents, type StatusAction } from "@/lib/services/issues";

export default function IssuePage(props: PageProps<"/projects/[slug]/issues/[id]">) {
  return (
    <Suspense fallback={<Skeleton />}>
      <IssueDetail {...props} />
    </Suspense>
  );
}

async function IssueDetail({ params }: PageProps<"/projects/[slug]/issues/[id]">) {
  const { slug, id } = await params;
  const user = await requireUser();
  const actor = { kind: "user" as const, userId: user.id };
  let d;
  try {
    d = await getIssueDetail(actor, id);
  } catch (err) {
    if (err instanceof AccessError) notFound();
    throw err;
  }
  if (d.project.slug !== slug) notFound();
  const { issue, latestEvent: ev } = d;
  const recent = await listIssueEvents(actor, id, { limit: 20 });
  const shortId = `${slug.toUpperCase()}-${issue.shortId}`;
  const link = `${appUrl()}/projects/${slug}/issues/${issue.id}`;

  const taskText = [
    `[Lỗi] ${issue.title}`,
    ``,
    `- Mã nhóm lỗi: ${shortId} (khoa_ngoai = gs:${issue.fingerprint})`,
    `- Môi trường: ${envLabel(issue.environment)} · Nguồn: ${issue.source ?? "-"}`,
    `- Nơi xảy ra: ${issue.culprit ?? "-"}`,
    `- Số lần: ${issue.eventCount} (24h: ${d.counts.last24h}) · Từ ${formatDateTime(issue.firstSeen)} đến ${formatDateTime(issue.lastSeen)}`,
    `- Phiên bản: ${issue.firstRelease ?? "-"} → ${issue.lastRelease ?? "-"}`,
    ev?.stack?.length ? `- Stack:\n${ev.stack.slice(0, 8).map((f) => `    ${f}`).join("\n")}` : "",
    `- Chi tiết: ${link}`,
  ]
    .filter(Boolean)
    .join("\n");

  const action = (a: StatusAction) => issueStatusAction.bind(null, issue.id, a);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/projects/${slug}`} className="text-sm text-violet-700 hover:underline">← Nhóm lỗi</Link>
          <h2 className="mt-1 break-words text-lg font-semibold">{issue.title}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
            <span className="font-mono">{shortId}</span>
            <Badge tone={statusTone[issue.status]}>{STATUS_LABEL[issue.status]}</Badge>
            {issue.status === "resolved" && issue.resolvedInNextRelease && <Badge tone="green">chờ bản tiếp theo</Badge>}
            <Badge tone={levelTone[issue.level]}>{LEVEL_LABEL[issue.level]}</Badge>
            <Badge tone={envTone(issue.environment)}>{envLabel(issue.environment)}</Badge>
            {issue.source && <Badge>{issue.source}</Badge>}
            {issue.culprit && <span className="font-mono">{issue.culprit}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {issue.status !== "resolved" && (
            <>
              <form action={action("resolve")}>
                <button className={cx(btn.base, btn.primary)}>Đã xử lý</button>
              </form>
              <form action={action("resolve_next_release")}>
                <button className={cx(btn.base, btn.secondary)} title="Chỉ mở lại khi lỗi xuất hiện ở phiên bản mới hơn">
                  Xử lý ở bản tiếp theo
                </button>
              </form>
            </>
          )}
          {issue.status !== "ignored" && (
            <form action={action("ignore")}>
              <button className={cx(btn.base, btn.secondary)}>Bỏ qua</button>
            </form>
          )}
          {issue.status !== "unresolved" && (
            <form action={action("unresolve")}>
              <button className={cx(btn.base, btn.secondary)}>Mở lại</button>
            </form>
          )}
          <CopyButton text={taskText} label="Chép để tạo task" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-4">
          <Card title="48 giờ qua (theo giờ)">
            <HourlyBars data={d.series.slice(-48)} height={90} />
          </Card>

          <Card title="Lần xảy ra gần nhất" actions={ev && <span className="text-xs text-zinc-500">{formatDateTime(ev.timestamp)}</span>}>
            {!ev ? (
              <p className="text-sm text-zinc-500">Không còn event chi tiết (đã quá hạn lưu).</p>
            ) : (
              <div className="space-y-4 text-sm">
                <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5">
                  <dt className="text-zinc-500">Loại lỗi</dt>
                  <dd className="font-mono">{ev.errorType}</dd>
                  <dt className="text-zinc-500">Thông điệp</dt>
                  <dd className="break-words">{ev.message ?? "—"}</dd>
                  <dt className="text-zinc-500">Đường dẫn</dt>
                  <dd className="font-mono">{ev.path ?? "—"}</dd>
                  <dt className="text-zinc-500">Nguồn</dt>
                  <dd>{ev.source ?? "—"}</dd>
                  <dt className="text-zinc-500">Phiên bản</dt>
                  <dd>{ev.release ?? "—"}</dd>
                  <dt className="text-zinc-500">Mã sự kiện</dt>
                  <dd className="font-mono text-xs">{ev.eventId}</dd>
                  <dt className="text-zinc-500" title="ma_yc – tra Workers Logs">Mã yêu cầu (cf-ray)</dt>
                  <dd className="font-mono text-xs">{ev.requestId ?? "—"}</dd>
                  {ev.occurrences > 1 && (
                    <>
                      <dt className="text-zinc-500">Số lần gộp</dt>
                      <dd>×{ev.occurrences}</dd>
                    </>
                  )}
                </dl>
                <div>
                  <div className="mb-1 text-xs font-medium uppercase text-zinc-500">Stack (tệp:dòng:cột)</div>
                  {ev.stack?.length ? (
                    <ol className="divide-y divide-zinc-100 rounded-md border border-zinc-200 font-mono text-xs">
                      {ev.stack.map((f, i) => (
                        <li key={i} className={cx("px-3 py-1.5", i === 0 && "bg-amber-50")}>{f}</li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-zinc-500">Không có stack.</p>
                  )}
                </div>
              </div>
            )}
          </Card>

          <Card title={`Các lần xảy ra đã lưu (${recent.length})`}>
            <div className="-m-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Thời gian</th>
                    <th className="px-4 py-2 font-medium">Phiên bản</th>
                    <th className="px-4 py-2 font-medium">Đường dẫn</th>
                    <th className="px-4 py-2 font-medium">Thông điệp</th>
                    <th className="px-4 py-2 font-medium">cf-ray</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {recent.map((e) => (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap px-4 py-2 text-zinc-600">{formatDateTime(e.timestamp)}</td>
                      <td className="px-4 py-2">{e.release ?? "—"}</td>
                      <td className="px-4 py-2 font-mono text-xs">{e.path ?? "—"}</td>
                      <td className="max-w-md truncate px-4 py-2 text-zinc-600">
                        {e.occurrences > 1 && <span className="mr-1 font-medium text-zinc-800">×{e.occurrences}</span>}
                        {e.message ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-zinc-500">{e.requestId ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-6 text-xs text-zinc-500">
              Khi lỗi dồn dập, chỉ lưu tối đa {d.project.sampleLimitPerHour} event chi tiết mỗi giờ; số đếm vẫn chính xác.
            </p>
          </Card>

          <Card title="Bình luận & lịch sử">
            <ul className="mb-4 space-y-3">
              {d.comments.length === 0 && <li className="text-sm text-zinc-500">Chưa có bình luận.</li>}
              {d.comments.map((c) => (
                <li key={c.id} className="text-sm">
                  <div className="text-xs text-zinc-500">
                    <span className="font-medium text-zinc-700">{c.userName ?? "—"}</span>
                    {c.viaTokenName && <Badge tone="violet">AI agent: {c.viaTokenName}</Badge>} · {timeAgo(c.createdAt)}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words">{c.body}</p>
                </li>
              ))}
            </ul>
            <CommentForm action={commentAction.bind(null, issue.id)} />
          </Card>
        </div>

        <aside className="space-y-4">
          <Card title="Thống kê">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Stat label="Tổng số lần" value={compact(issue.eventCount)} />
              <Stat label="1 giờ qua" value={compact(d.counts.lastHour)} />
              <Stat label="24 giờ qua" value={compact(d.counts.last24h)} />
              <Stat label="Lần cuối" value={timeAgo(issue.lastSeen)} />
            </dl>
            <dl className="mt-4 space-y-1.5 text-sm">
              <Row label="Xuất hiện đầu" value={formatDateTime(issue.firstSeen)} />
              <Row label="Lần cuối" value={formatDateTime(issue.lastSeen)} />
              <Row label="Bản đầu tiên" value={issue.firstRelease ?? "—"} />
              <Row label="Bản gần nhất" value={issue.lastRelease ?? "—"} />
              {issue.resolvedAt && <Row label="Xử lý lúc" value={formatDateTime(issue.resolvedAt)} />}
              {issue.lastAlertedAt && <Row label="Cảnh báo gần nhất" value={timeAgo(issue.lastAlertedAt)} />}
            </dl>
          </Card>
          <Card title="Theo phiên bản">
            {d.releaseBreakdown.length === 0 ? (
              <p className="text-sm text-zinc-500">—</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {d.releaseBreakdown.map((r) => (
                  <li key={r.release ?? "none"} className="flex justify-between gap-2">
                    <span className="font-mono">{r.release ?? "(không rõ)"}</span>
                    <span className="text-zinc-500">{r.n} lần đã lưu</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

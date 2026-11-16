import Link from "next/link";
import { Suspense } from "react";
import { HourlyBars, Sparkline } from "@/components/charts";
import { Badge, Empty, Skeleton, btn, cx, envTone, input, levelTone } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { compact, envLabel, LEVEL_LABEL, STATUS_LABEL, timeAgo } from "@/lib/format";
import { filterOptions, listIssues, parseIssueFilters, PERIODS, projectHourly, type IssueFilters } from "@/lib/services/issues";

export default function IssuesPage(props: PageProps<"/projects/[slug]">) {
  return (
    <Suspense fallback={<Skeleton />}>
      <Issues {...props} />
    </Suspense>
  );
}

const PERIOD_LABEL: Record<keyof typeof PERIODS, string> = {
  "1h": "1 giờ",
  "24h": "24 giờ",
  "7d": "7 ngày",
  "14d": "14 ngày",
  "30d": "30 ngày",
};

async function Issues({ params, searchParams }: PageProps<"/projects/[slug]">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const actor = { kind: "user" as const, userId: user.id };
  const filters = parseIssueFilters(sp);
  const { project, issues, hasMore } = await listIssues(actor, slug, filters);
  const [options, series] = await Promise.all([
    filterOptions(project.id),
    projectHourly(project.id, Math.min(PERIODS[filters.period ?? "14d"], 24 * 14), filters.environment),
  ]);

  const href = (patch: Partial<Record<string, string | undefined>>) => {
    const q = new URLSearchParams();
    const merged = {
      status: filters.status,
      env: filters.environment,
      release: filters.release,
      period: filters.period,
      q: filters.query,
      sort: filters.sort,
      ...patch,
    };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, String(v));
    return `/projects/${slug}?${q}`;
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <HourlyBars data={series} height={64} />
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {(["unresolved", "resolved", "ignored", "all"] as const).map((s) => (
          <Link
            key={s}
            href={href({ status: s, offset: undefined })}
            className={cx(btn.base, filters.status === s ? "bg-zinc-900 text-white" : btn.ghost)}
          >
            {s === "all" ? "Tất cả" : STATUS_LABEL[s]}
          </Link>
        ))}
      </div>

      <form className="grid gap-2 rounded-lg border border-zinc-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-6" action={`/projects/${slug}`}>
        <input type="hidden" name="status" value={filters.status} />
        <input name="q" defaultValue={filters.query} placeholder="Tìm theo thông điệp, đường dẫn, loại lỗi…" className={cx(input, "lg:col-span-2")} />
        <select name="env" defaultValue={filters.environment ?? ""} className={input} aria-label="Môi trường">
          <option value="">Mọi môi trường</option>
          {options.environments.map((e) => (
            <option key={e} value={e}>{envLabel(e)}</option>
          ))}
        </select>
        <select name="release" defaultValue={filters.release ?? ""} className={input} aria-label="Phiên bản">
          <option value="">Mọi phiên bản</option>
          {options.releases.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select name="period" defaultValue={filters.period} className={input} aria-label="Thời gian">
          {Object.keys(PERIODS).map((p) => (
            <option key={p} value={p}>{PERIOD_LABEL[p as keyof typeof PERIODS]}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <select name="sort" defaultValue={filters.sort} className={input} aria-label="Sắp xếp">
            <option value="last_seen">Mới nhất</option>
            <option value="first_seen">Xuất hiện đầu</option>
            <option value="events">Nhiều nhất</option>
          </select>
          <button className={cx(btn.base, btn.primary)} type="submit">Lọc</button>
        </div>
      </form>

      {issues.length === 0 ? (
        <Empty title="Không có nhóm lỗi nào khớp bộ lọc">
          {filters.status === "unresolved" ? "Tốt! Không có lỗi chưa xử lý trong khoảng thời gian này." : null}
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <div className="hidden grid-cols-[1fr_110px_80px_110px] gap-4 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-medium uppercase text-zinc-500 md:grid">
            <span>Nhóm lỗi</span>
            <span>24 giờ</span>
            <span className="text-right">Số lần</span>
            <span className="text-right">Lần cuối</span>
          </div>
          <ul className="divide-y divide-zinc-100">
            {issues.map((i) => (
              <li key={i.id} className="grid gap-2 px-4 py-3 hover:bg-zinc-50 md:grid-cols-[1fr_110px_80px_110px] md:items-center md:gap-4">
                <div className="min-w-0">
                  <Link href={`/projects/${slug}/issues/${i.id}`} className="block truncate font-medium text-zinc-900 hover:text-violet-700">
                    {i.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                    <span className="font-mono">{slug.toUpperCase()}-{i.shortId}</span>
                    <Badge tone={levelTone[i.level]}>{LEVEL_LABEL[i.level]}</Badge>
                    <Badge tone={envTone(i.environment)}>{envLabel(i.environment)}</Badge>
                    {i.source && <Badge>{i.source}</Badge>}
                    {i.lastRelease && <span>v{i.lastRelease}</span>}
                    {i.culprit && <span className="truncate font-mono">{i.culprit}</span>}
                    {i.status !== "unresolved" && <Badge tone="green">{STATUS_LABEL[i.status]}</Badge>}
                    <span>· xuất hiện {timeAgo(i.firstSeen)}</span>
                  </div>
                </div>
                <Sparkline data={i.spark} className="h-7 w-full max-w-[110px]" />
                <div className="text-sm md:text-right" title={`Tổng: ${i.eventCount}`}>
                  <span className="font-semibold">{compact(i.periodCount)}</span>
                </div>
                <div className="text-xs text-zinc-500 md:text-right">{timeAgo(i.lastSeen)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Pager filters={filters} hasMore={hasMore} href={href} />
    </div>
  );
}

function Pager({ filters, hasMore, href }: { filters: IssueFilters; hasMore: boolean; href: (p: Record<string, string | undefined>) => string }) {
  const offset = filters.offset ?? 0;
  const limit = filters.limit ?? 50;
  if (!hasMore && offset === 0) return null;
  return (
    <div className="flex justify-end gap-2">
      {offset > 0 && (
        <Link className={cx(btn.base, btn.secondary)} href={href({ offset: String(Math.max(0, offset - limit)) })}>← Trước</Link>
      )}
      {hasMore && (
        <Link className={cx(btn.base, btn.secondary)} href={href({ offset: String(offset + limit) })}>Sau →</Link>
      )}
    </div>
  );
}

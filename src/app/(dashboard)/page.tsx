import Link from "next/link";
import { Suspense } from "react";
import { HourlyBars } from "@/components/charts";
import { Empty, LinkButton, PageHeader, Skeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { compact } from "@/lib/format";
import { projectHourly } from "@/lib/services/issues";
import { listProjects, projectStats } from "@/lib/services/projects";

export default function OverviewPage() {
  return (
    <>
      <PageHeader
        title="Tổng quan"
        subtitle="Tình trạng lỗi của các project trong 24 giờ qua"
        actions={<LinkButton href="/projects/new">Tạo project</LinkButton>}
      />
      <Suspense fallback={<Skeleton rows={3} />}>
        <Overview />
      </Suspense>
    </>
  );
}

async function Overview() {
  const user = await requireUser();
  const projects = await listProjects({ kind: "user", userId: user.id });
  if (!projects.length) {
    return (
      <Empty title="Chưa có project nào">
        <p>Tạo project để nhận khoá gửi lỗi cho từng môi trường (thật / thử / dev).</p>
        <LinkButton href="/projects/new" className="mt-4">Tạo project đầu tiên</LinkButton>
      </Empty>
    );
  }
  const stats = await projectStats(projects.map((p) => p.id));
  const series = await Promise.all(projects.map((p) => projectHourly(p.id, 24)));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {projects.map((p, i) => {
        const s = stats.get(p.id)!;
        const healthy = s.events24h === 0;
        return (
          <Link
            key={p.id}
            href={`/projects/${p.slug}`}
            className="block rounded-lg border border-zinc-200 bg-white p-4 transition hover:border-violet-300 hover:shadow-sm"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${healthy ? "bg-emerald-500" : s.unresolved > 0 ? "bg-red-500" : "bg-amber-400"}`}
                  aria-hidden
                />
                <span className="font-semibold">{p.name}</span>
              </div>
              <div className="flex gap-4 text-right text-sm">
                <div>
                  <div className="font-semibold text-zinc-900">{compact(s.unresolved)}</div>
                  <div className="text-xs text-zinc-500">chưa xử lý</div>
                </div>
                <div>
                  <div className="font-semibold text-zinc-900">{compact(s.events24h)}</div>
                  <div className="text-xs text-zinc-500">lỗi / 24h</div>
                </div>
              </div>
            </div>
            <HourlyBars data={series[i]} height={56} />
          </Link>
        );
      })}
    </div>
  );
}

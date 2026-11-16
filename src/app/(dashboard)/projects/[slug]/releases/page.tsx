import Link from "next/link";
import { Suspense } from "react";
import { Badge, Empty, Skeleton, envTone } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { compact, envLabel, formatDateTime, timeAgo } from "@/lib/format";
import { listReleases } from "@/lib/services/issues";

export default function ReleasesPage(props: PageProps<"/projects/[slug]/releases">) {
  return (
    <Suspense fallback={<Skeleton />}>
      <Releases {...props} />
    </Suspense>
  );
}

async function Releases({ params }: PageProps<"/projects/[slug]/releases">) {
  const { slug } = await params;
  const user = await requireUser();
  const { releases } = await listReleases({ kind: "user", userId: user.id }, slug);
  if (!releases.length) return <Empty title="Chưa có phiên bản">Gửi trường phien_ban kèm mỗi lỗi để theo dõi theo phiên bản.</Empty>;
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
          <tr>
            <th className="px-4 py-2 font-medium">Phiên bản</th>
            <th className="px-4 py-2 font-medium">Môi trường</th>
            <th className="px-4 py-2 font-medium">Thấy lần đầu</th>
            <th className="px-4 py-2 font-medium">Lần cuối</th>
            <th className="px-4 py-2 text-right font-medium">Số lỗi</th>
            <th className="px-4 py-2 text-right font-medium">Nhóm lỗi mới</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {releases.map((r) => (
            <tr key={`${r.environment}-${r.version}`}>
              <td className="px-4 py-2 font-mono font-medium">
                <Link className="hover:text-violet-700" href={`/projects/${slug}?status=all&env=${r.environment}&release=${encodeURIComponent(r.version)}&period=30d`}>
                  {r.version}
                </Link>
              </td>
              <td className="px-4 py-2"><Badge tone={envTone(r.environment)}>{envLabel(r.environment)}</Badge></td>
              <td className="px-4 py-2 text-zinc-600">{formatDateTime(r.firstSeen)}</td>
              <td className="px-4 py-2 text-zinc-600">{timeAgo(r.lastSeen)}</td>
              <td className="px-4 py-2 text-right">{compact(r.eventCount)}</td>
              <td className="px-4 py-2 text-right">
                {r.newIssues > 0 ? <Badge tone="red">{r.newIssues}</Badge> : <span className="text-zinc-400">0</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

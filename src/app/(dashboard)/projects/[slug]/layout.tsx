import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TabLink } from "@/components/nav";
import { requireUser } from "@/lib/auth";
import { AccessError, getProjectAccess } from "@/lib/services/access";

export default function ProjectLayout({ children, params }: LayoutProps<"/projects/[slug]">) {
  return (
    <>
      <Suspense fallback={<div className="mb-5 h-16" />}>
        <ProjectHeader params={params} />
      </Suspense>
      {children}
    </>
  );
}

async function ProjectHeader({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  let project;
  try {
    ({ project } = await getProjectAccess({ kind: "user", userId: user.id }, slug));
  } catch (err) {
    if (err instanceof AccessError) notFound();
    throw err;
  }
  const base = `/projects/${project.slug}`;
  return (
    <div className="mb-5 border-b border-zinc-200">
      <div className="mb-3 text-xs uppercase tracking-wide text-zinc-500">Project</div>
      <h1 className="mb-3 text-xl font-semibold">{project.name}</h1>
      <nav className="flex gap-5">
        <TabLink href={base} exact>Nhóm lỗi</TabLink>
        <TabLink href={`${base}/events`}>Luồng sự kiện</TabLink>
        <TabLink href={`${base}/releases`}>Phiên bản</TabLink>
        <TabLink href={`${base}/settings`}>Cài đặt</TabLink>
      </nav>
    </div>
  );
}

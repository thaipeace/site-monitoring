import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { logout } from "@/app/actions/auth";
import { NavLink } from "@/components/nav";
import { requireUser } from "@/lib/auth";
import { unreadNotificationCount } from "@/lib/services/issues";
import { listProjects } from "@/lib/services/projects";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col bg-[#2b1d38] text-white md:sticky md:top-0 md:h-screen md:w-60">
        <Link href="/" className="flex items-center gap-2 px-4 py-4">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-violet-300" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M3 12h4l3-8 4 16 3-8h4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="font-semibold">Site Monitoring</span>
        </Link>
        <nav className="flex-1 space-y-4 overflow-y-auto px-2 pb-4">
          <div className="space-y-0.5">
            <Suspense fallback={<div className="h-28" />}>
              <MainNav />
            </Suspense>
          </div>
          <div>
            <div className="flex items-center justify-between px-2.5 pb-1 text-xs font-semibold uppercase tracking-wide text-violet-200/60">
              Projects
              <Link href="/projects/new" className="rounded px-1 text-base leading-none text-violet-200 hover:bg-white/10" title="Tạo project">
                +
              </Link>
            </div>
            <Suspense fallback={<div className="mx-2.5 h-6 animate-pulse rounded bg-white/10" />}>
              <ProjectNav />
            </Suspense>
          </div>
        </nav>
        <Suspense fallback={<div className="h-14 border-t border-white/10" />}>
          <UserBox />
        </Suspense>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}

async function MainNav() {
  const user = await requireUser();
  const unread = await unreadNotificationCount(user.id);
  return (
    <>
      <NavLink href="/" exact>Tổng quan</NavLink>
      <NavLink href="/notifications">
        Thông báo
        {unread > 0 && <span className="rounded-full bg-violet-500 px-1.5 text-xs">{unread}</span>}
      </NavLink>
      <NavLink href="/settings/tokens">API tokens (AI agent)</NavLink>
      <NavLink href="/docs">Tích hợp</NavLink>
      {user.role === "admin" && <NavLink href="/admin/users">Người dùng</NavLink>}
    </>
  );
}

async function ProjectNav() {
  const user = await requireUser();
  const projects = await listProjects({ kind: "user", userId: user.id });
  if (!projects.length) return <p className="px-2.5 text-xs text-violet-200/60">Chưa có project</p>;
  return (
    <div className="space-y-0.5">
      {projects.map((p) => (
        <NavLink key={p.id} href={`/projects/${p.slug}`}>
          <span className="truncate">{p.name}</span>
        </NavLink>
      ))}
    </div>
  );
}

async function UserBox() {
  const user = await requireUser();
  return (
    <div className="flex items-center justify-between gap-2 border-t border-white/10 px-4 py-3 text-sm">
      <Link href="/account" className="min-w-0 rounded hover:bg-white/5" title="Tài khoản">
        <div className="truncate font-medium">{user.name}</div>
        <div className="truncate text-xs text-violet-200/70">{user.email}</div>
      </Link>
      <form action={logout}>
        <button className="rounded px-2 py-1 text-xs text-violet-200 hover:bg-white/10" type="submit">
          Thoát
        </button>
      </form>
    </div>
  );
}

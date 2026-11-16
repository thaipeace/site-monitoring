"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

export function NavLink({ href, children, exact }: { href: string; children: React.ReactNode; exact?: boolean }) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={cx(
        "flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm",
        active ? "bg-white/15 font-medium text-white" : "text-violet-100/80 hover:bg-white/10 hover:text-white",
      )}
    >
      {children}
    </Link>
  );
}

export function TabLink({ href, children, exact }: { href: string; children: React.ReactNode; exact?: boolean }) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={cx(
        "border-b-2 px-1 pb-2 text-sm",
        active ? "border-violet-600 font-medium text-violet-700" : "border-transparent text-zinc-500 hover:text-zinc-800",
      )}
    >
      {children}
    </Link>
  );
}

import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#2b1d38] to-[#1a1023] px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-6 flex items-center gap-2">
          <Logo />
          <span className="text-lg font-semibold text-zinc-900">Site Monitoring</span>
        </div>
        {children}
      </div>
    </main>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 text-violet-600" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 12h4l3-8 4 16 3-8h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

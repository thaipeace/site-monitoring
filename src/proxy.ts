import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "sm_session";
const PUBLIC = ["/login", "/register"];

/** Optimistic check only: real session validation happens in the data layer. */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);
  // Don't bounce signed-in users away from /login: a stale cookie would loop.
  if (PUBLIC.includes(pathname) || pathname.startsWith("/invite/")) return NextResponse.next();
  if (!hasSession) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Skip APIs (token / HMAC auth), Next internals and static files
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|txt)$).*)"],
};

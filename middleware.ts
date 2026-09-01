import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session-token";

/**
 * A redirect for humans, not the security boundary.
 *
 * This checks one thing: does the request carry a cookie whose HS256 signature and expiry
 * verify? That is the entire contract. It exists so a logged-out visitor lands on /login
 * instead of a flash of empty dashboard.
 *
 * It deliberately does NOT do per-document authorization, and must never be extended to.
 * Authorization needs Document.ownerId and DocumentShare rows — i.e. the database — and
 * Prisma does not run on Edge, so nothing here may reach lib/db.ts, directly or transitively.
 * More importantly, middleware is path-shaped while authorization is data-shaped, it is not
 * on every path to the data (Server Actions and RSC fetches can miss a matcher), and Next.js
 * shipped CVE-2025-29927 where a crafted header skipped middleware entirely. The check that
 * lives next to the data access — `requireAccess` in lib/permissions.ts — cannot be routed
 * around. See specs/03-auth-and-permissions.md §5.3.
 *
 * /api/* is excluded on purpose: every API route authenticates itself through `withSession`.
 */
export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token);

  if (session) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);

  const response = NextResponse.redirect(loginUrl);
  if (token) response.cookies.delete(SESSION_COOKIE); // expired/garbage — stop re-sending it
  return response;
}

export const config = {
  matcher: ["/documents/:path*"],
};

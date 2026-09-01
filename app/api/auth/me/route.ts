import { ok, withSession } from "@/lib/api";
import type { MeResponse } from "@/lib/api-types";

/** `GET /api/auth/me` — 02-api-contract.md §7.3. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Answered entirely from the verified JWT claims — **zero database round trips**. `sub`,
 * `email` and `name` are everything the token carries and everything `UserSummary` needs
 * (03 §3.1), so re-reading the user row here would buy nothing but latency on every header
 * render. There is no profile editing in scope, so the denormalised claims cannot go stale.
 *
 * `withSession` supplies the 401 UNAUTHENTICATED for a missing, malformed, mis-signed or
 * expired cookie; all four collapse to the same answer by design.
 */
export const GET = withSession(async (_request, { session }) => {
  return ok<MeResponse>({
    user: { id: session.id, name: session.name, email: session.email },
  });
});

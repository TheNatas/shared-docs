import { ok, withPublic } from "@/lib/api";
import type { LogoutResponse } from "@/lib/api-types";
import { isProduction } from "@/lib/env";
import { SESSION_COOKIE } from "@/lib/session-token";

/** `POST /api/auth/logout` — 02-api-contract.md §7.2. Node for uniformity with the rest. */
export const runtime = "nodejs";

/**
 * `withPublic`, and that is the whole point: logout is idempotent and must never 401. With no
 * cookie, an expired one or a forged one it clears the cookie and returns 200. Wrapping it in
 * `withSession` would force the client to treat a 401 as success — the kind of special case
 * that later hides a real one (00-foundation.md §7, 02 §7.2).
 *
 * The request body is ignored: not read, not parsed, not validated.
 *
 * POST rather than GET, because a GET that mutates state is CSRF-able through an `<img>` tag
 * and `sameSite=lax` does not protect top-level GETs (03 §5.2).
 */
export const POST = withPublic(async () => {
  const response = ok<LogoutResponse>({ ok: true });

  // Overwrite with an empty, already-expired cookie rather than only deleting: a delete whose
  // attributes do not match the ones the browser stored is a no-op, and the user stays signed
  // in. Every attribute below therefore mirrors the login route's exactly, except `maxAge: 0`.
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: 0,
  });

  return response;
});

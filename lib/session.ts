import { cookies } from "next/headers";
import { ApiError } from "@/lib/api";
import { isProduction } from "@/lib/env";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  signSessionToken,
  verifySessionToken,
  type SessionUser,
} from "@/lib/session-token";

export { SESSION_COOKIE, type SessionUser };

/**
 * SERVER COMPONENTS AND COOKIE WRITES ONLY. This module is the next/headers half of the
 * session and nothing under app/api/** may import it for a read: `cookies()` throws outside a
 * request scope, so a handler that reads its session from here cannot be imported and called
 * by the integration suite, and the whole suite goes with it. Handlers use
 * `getSessionFromRequest(request)` from lib/session-token.ts (00-foundation.md §7c).
 *
 * The split is deliberate and load-bearing. Do not "simplify" it by moving readSession into
 * the handlers or getSessionFromRequest into here.
 */

/**
 * Mint a session and attach it to the response. Route Handlers and Server Actions only —
 * Next.js forbids cookie writes during a Server Component render.
 */
export async function createSession(user: SessionUser): Promise<void> {
  const token = await signSessionToken(user);
  const store = await cookies();

  store.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** Current user, or null. Does NOT hit the database — everything it needs is in the token. */
export async function readSession(): Promise<SessionUser | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/**
 * Same as readSession, but THROWS instead of returning null, so
 * `const s = await requireSession(); if (!s) …` is a dead branch.
 */
export async function requireSession(): Promise<SessionUser> {
  const session = await readSession();
  if (!session) {
    throw new ApiError("UNAUTHENTICATED", "Sign in to continue.", 401);
  }
  return session;
}

/**
 * Clear the session. Overwriting with an empty, already-expired cookie rather than only
 * calling delete guarantees the browser drops it even when attributes differ.
 * Route Handlers and Server Actions only.
 */
export async function destroySession(): Promise<void> {
  const store = await cookies();

  store.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: 0,
  });
}

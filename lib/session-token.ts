import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

/**
 * Edge-safe half of the session. Nothing here touches next/headers, Prisma or a Node
 * builtin, which is what lets the SAME code authenticate a request inside middleware (Edge
 * runtime) and inside a route handler that a Vitest process imported directly with no server
 * running. Cookie *reads* live here; cookie *writes* live in lib/session.ts or on a
 * NextResponse (specs/03-auth-and-permissions.md §3.2).
 */
export const SESSION_COOKIE = "shared_docs_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

const secretKey = new TextEncoder().encode(env.AUTH_SECRET);

export async function signSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey);
}

/**
 * THE primitive a route handler uses. Reads the cookie off the Request itself, so a handler
 * can be imported and called directly by the integration suite. `cookies()` from next/headers
 * throws outside a request scope, which is why no handler may use it
 * (specs/00-foundation.md §7c, specs/06-test-plan.md §5.1).
 */
export async function getSessionFromRequest(
  req: Request,
): Promise<SessionUser | null> {
  const header = req.headers.get("cookie");
  if (!header) return null;

  const token = header
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);

  return verifySessionToken(token);
}

/** Returns null for anything that is not a currently-valid, well-shaped token. Never throws. */
export async function verifySessionToken(
  token: string | undefined,
): Promise<SessionUser | null> {
  if (!token) return null;

  try {
    // Pinning the algorithm is not decoration: an unpinned verifier can be talked into
    // accepting `alg: none` or an asymmetric-key confusion.
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ["HS256"],
    });

    if (
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.name !== "string"
    ) {
      return null;
    }

    return { id: payload.sub, email: payload.email, name: payload.name };
  } catch {
    // expired, tampered, wrong alg, malformed — all indistinguishable to the caller by design
    return null;
  }
}

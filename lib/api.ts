import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError, type ZodType } from "zod";
// 03-auth-and-permissions.md. NOT lib/session.ts — that module imports next/headers, whose
// cookies() throws outside a request scope, which would make every handler untestable and
// delete the whole integration suite (00-foundation.md §7c).
//
// Type-only on purpose; the value side is loaded lazily by readSession() below. See the note
// there — this is what keeps `pnpm test:unit` runnable with no environment at all.
import type { SessionUser } from "@/lib/session-token";
import type { ApiErrorCode } from "@/lib/api-types";

/**
 * The shared plumbing every route handler is wrapped by (02-api-contract.md §4).
 *
 * This is the ONLY error class and the ONLY error funnel in the repo: there is no
 * lib/errors.ts, no AppError, no toErrorResponse, no apiError (00-foundation.md §5a).
 *
 * Two invariants are enforced here so that no handler has to remember them:
 *   I1 — every response, success and failure, has a JSON body. **There are no 204s**, because
 *        `apiFetch` in lib/client.ts calls `res.json()` unconditionally and a 204 is a
 *        SyntaxError on arrival.
 *   I2 — every response carries `Cache-Control: no-store`, set once, in ok() / fail().
 *
 * History — T01 created this file in W1 with only the ApiError class, because
 * lib/permissions.ts and lib/session.ts both throw it and both shipped a wave earlier than the
 * task graph assigned this module (specs/DECISIONS.md D011). T07 added everything else. The
 * class below is unchanged and is still the canonical definition.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Success. Always JSON, always no-store. */
export function ok<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

/**
 * Failure. The ONLY way an error body is ever produced — no handler builds `{ error: … }` by
 * hand, which is what makes "every code is a member of the ApiErrorCode union" a compile-time
 * fact rather than a review convention (I3, I4).
 */
export function fail(
  code: ApiErrorCode,
  message: string,
  status: number,
  details?: unknown,
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(details !== undefined ? { details } : {}) } },
    { status, headers: NO_STORE },
  );
}

/** Throwable equivalent of `fail`, so helpers deep in lib/ can abort a request. */
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * The single funnel from a thrown value to a response. An unhandled throw becomes a 500 whose
 * body carries no part of the original message: `err` may be a Prisma error naming a table, a
 * column or a connection string, and none of that is the client's business.
 */
export function toResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) return fail(err.code, err.message, err.status, err.details);

  if (err instanceof ZodError) {
    // Zod 4: z.flattenError(err), not err.flatten() (00-foundation.md §2a).
    return fail("VALIDATION_FAILED", "Request validation failed.", 400, z.flattenError(err));
  }

  console.error("[api] unhandled error:", err);
  return fail("INTERNAL_ERROR", "Something went wrong on our side.", 500);
}

/**
 * Parse + validate a JSON body. Throws ApiError(400 VALIDATION_FAILED) on bad JSON or a Zod
 * failure, with `z.flattenError`'s output dropped straight into `details` — nothing is
 * reshaped, so the mapping in 02-api-contract.md §8 is trivially verifiable.
 *
 * A non-JSON body produces the same `{ formErrors, fieldErrors }` shape as a schema failure,
 * so the client renders both through one code path.
 */
export async function parseJson<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError("VALIDATION_FAILED", "Request body must be valid JSON.", 400, {
      formErrors: ["Request body must be valid JSON."],
      fieldErrors: {},
    });
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(
      "VALIDATION_FAILED",
      "Request validation failed.",
      400,
      z.flattenError(parsed.error),
    );
  }

  return parsed.data;
}

/** Validate URLSearchParams the same way. Repeated keys collapse to the last one. */
export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  const parsed = schema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    throw new ApiError(
      "VALIDATION_FAILED",
      "Invalid query parameters.",
      400,
      z.flattenError(parsed.error),
    );
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// withSession / withPublic
// ---------------------------------------------------------------------------

/** Next.js 16 (as 15): dynamic route params arrive as a Promise. */
export type RouteContext<P> = { params: Promise<P> };

export type SessionHandler<P> = (
  req: NextRequest,
  ctx: { params: Promise<P>; session: SessionUser },
) => Promise<Response>;

export type PublicHandler<P> = (
  req: NextRequest,
  ctx: { params: Promise<P> },
) => Promise<Response>;

/**
 * `getSessionFromRequest`, loaded on first use rather than at module evaluation.
 *
 * The reason is a dependency edge D011 created and cannot remove. lib/permissions.ts and
 * lib/session.ts import `ApiError` from this module, and lib/permissions.test.ts imports
 * lib/permissions.ts. A *static* `import { getSessionFromRequest } from '@/lib/session-token'`
 * therefore drags lib/session-token.ts → lib/env.ts into the unit-test module graph, and
 * lib/env.ts is deliberately fail-fast: it throws at module scope when AUTH_SECRET or
 * DATABASE_URL is absent. That would break 06-test-plan.md §2.4's headline promise — the unit
 * suite must pass on a clean clone after `pnpm install` and nothing else, with no `.env` at
 * all — turning a green 50-test run red for a reason that has nothing to do with permissions.
 *
 * Deferring the *value* import to request time fixes it without weakening anything: env is
 * always present when a request is being served, so the fail-fast still fires at the first
 * request rather than never, and `import type` above keeps `SessionUser` fully checked. The
 * module is resolved once and cached, so this costs one map lookup per request.
 *
 * Do NOT "tidy" this back into a static import. The failure it causes is in a different file
 * from the change, which is what makes it expensive to diagnose the second time.
 */
let sessionReaderPromise: Promise<
  typeof import("@/lib/session-token").getSessionFromRequest
> | null = null;

function readSession(req: NextRequest): Promise<SessionUser | null> {
  sessionReaderPromise ??= import("@/lib/session-token").then(
    (m) => m.getSessionFromRequest,
  );
  return sessionReaderPromise.then((getSession) => getSession(req));
}

/**
 * Wraps a handler so it (a) 401s without a valid session, (b) receives the session, (c) never
 * leaks a thrown error. Use on EVERY non-public route.
 *
 * The session is read from the Request with `getSessionFromRequest(req)` — never `cookies()`.
 * That single choice is what lets the integration suite import a route module and call the
 * exported handler directly, with no server listening (06-test-plan.md §5.1).
 *
 * `SessionUser` is `{ id, email, name }`, decoded from the JWT and NOT re-fetched from the
 * database on every request. The field is `session.id`; `session.userId` does not exist and
 * would silently be `undefined`.
 */
export function withSession<P = Record<string, never>>(handler: SessionHandler<P>) {
  return async (req: NextRequest, ctx?: RouteContext<P>): Promise<Response> => {
    try {
      const session = await readSession(req);
      if (!session) return fail("UNAUTHENTICATED", "You must be signed in.", 401);

      const params = ctx?.params ?? Promise.resolve({} as P);
      return await handler(req, { params, session });
    } catch (err) {
      return toResponse(err);
    }
  };
}

/**
 * Same error funnel, no session requirement. Used by POST /api/auth/login, by
 * POST /api/auth/logout (which is idempotent and must never 401), and by GET /api/health.
 */
export function withPublic<P = Record<string, never>>(handler: PublicHandler<P>) {
  return async (req: NextRequest, ctx?: RouteContext<P>): Promise<Response> => {
    try {
      return await handler(req, { params: ctx?.params ?? Promise.resolve({} as P) });
    } catch (err) {
      return toResponse(err);
    }
  };
}

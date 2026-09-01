// tests/integration/helpers/request.ts
//
// specs/06-test-plan.md §5.5.
//
// Route handlers in Next 16 are exported async functions taking `(request, ctx)`. This suite
// imports them and calls them directly — no dev server, no listener, no supertest — which
// gives real Prisma, real Zod and real session verification in ~4 seconds with zero port
// management. Two facts that makes possible, both load-bearing:
//
//   1. `ctx.params` is a Promise (Next 15+). The `ctx()` helper keeps that in one place.
//   2. No handler may call `cookies()` from next/headers — it throws outside a request scope.
//      They read the session off the Request itself via `getSessionFromRequest`
//      (00-foundation.md §7c). Without that ruling this entire suite is impossible.
//
// The session cookie is minted with the PRODUCTION `signSessionToken`, deliberately. The
// session layer is not mocked and must not be: a fake cookie would make every test in this
// directory an assertion about the fake. Signing for real means that if the token shape, the
// claim set, the algorithm or the cookie name changes, these tests fail loudly instead of
// passing against a fiction — and it puts `verifySessionToken`'s rejection paths (case 20's
// tampered signature) genuinely under test.

import { NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  signSessionToken,
  type SessionUser,
} from "@/lib/session-token";

const BASE_URL = "http://localhost:3000";

type Init = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  json?: unknown;
  formData?: FormData;
  /** Corrupt the signed token, to prove a forged session is not a session. */
  badSignature?: boolean;
};

/**
 * Builds a request the way a browser would, optionally carrying a real signed session.
 * Pass `null` for the unauthenticated case — no `cookie` header at all.
 *
 * Returns a `NextRequest` rather than the bare `Request` of the spec's sketch: `withSession`
 * in lib/api.ts types its handler parameter as `NextRequest` (parseQuery reads
 * `req.nextUrl.searchParams`), so a plain `Request` would not typecheck at the call site and
 * `pnpm exec tsc --noEmit` is part of this task's definition of done. `NextRequest` extends
 * `Request`, so nothing about the fidelity of the exercise changes.
 */
export async function authedRequest(
  user: SessionUser | null,
  path: string,
  init: Init = {},
): Promise<NextRequest> {
  const headers = new Headers();

  if (user) {
    // signSessionToken takes the whole SessionUser: the token carries `sub`, `email` and
    // `name`, and verifySessionToken returns null for a payload missing any of them. Callers
    // pass a USERS fixture entry, e.g. authedRequest(USERS.carol, …).
    const token = await signSessionToken(user);
    headers.set(
      "cookie",
      `${SESSION_COOKIE}=${init.badSignature ? `${token}tampered` : token}`,
    );
  }

  let body: BodyInit | undefined;
  if (init.formData) {
    // Do NOT set content-type here — undici derives the multipart boundary, and setting the
    // header by hand produces a body the parser cannot split.
    body = init.formData;
  } else if (init.json !== undefined) {
    body = JSON.stringify(init.json);
    headers.set("content-type", "application/json");
  }

  return new NextRequest(`${BASE_URL}${path}`, {
    method: init.method ?? "GET",
    headers,
    body,
  });
}

/** Next 15+ route-handler context: `params` is a Promise. */
export function ctx<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

/** Multipart body for the import route. */
export function fileForm(
  filename: string,
  mimeType: string,
  bytes: Uint8Array | string,
): FormData {
  // `readFileSync` hands back a Buffer, i.e. `Uint8Array<ArrayBufferLike>`, and `BlobPart`
  // wants `ArrayBufferView<ArrayBuffer>` — the SharedArrayBuffer case is what the two
  // disagree about. Re-wrapping copies into a plain ArrayBuffer-backed view, which satisfies
  // the DOM types without a cast and, incidentally, means the File never aliases the
  // fixture buffer a later test might reuse.
  const part: BlobPart = typeof bytes === "string" ? bytes : new Uint8Array(bytes);
  const form = new FormData();
  form.append("file", new File([part], filename, { type: mimeType }));
  return form;
}

/** Reads the JSON body once and returns it beside the status, for compact assertions. */
export async function read<T = any>(
  res: Response,
): Promise<{ status: number; body: T }> {
  return { status: res.status, body: (await res.json()) as T };
}

/**
 * The error envelope, for the assertions that only care about the code.
 * 00-foundation.md §7 fixes the shape as `{ error: { code, message, details? } }`.
 *
 * Nothing in this suite asserts on `error.message`. Messages are UI copy; they will be
 * reworded, and a test that pins them turns a copy edit into a red build.
 */
export type ErrorBody = {
  error: { code: string; message: string; details?: any };
};

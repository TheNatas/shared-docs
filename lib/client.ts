import type { ApiErrorBody, ApiErrorCode } from "@/lib/api-types";

/**
 * The browser-side half of the wire contract (02-api-contract.md §9). One place that knows the
 * error envelope, so no component hand-rolls `res.ok` / `res.json()` / `body.error?.code`.
 *
 * There is no lib/api-client.ts (00-foundation.md §5a), and the constructor argument order is
 * `(code, message, status, details?)` — an earlier draft of 04-ui-spec.md had
 * `(status, code, message)`, which would have produced two classes with the same name and
 * incompatible constructors.
 *
 * This module is safe to import from a Server Component (it emits no `use client` directive
 * and touches no browser global at module scope), but it is only *useful* on the client:
 * Server Components read through lib/documents/queries.ts and never fetch their own API.
 */
export class ApiClientError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

/** Narrowing helper for `catch (err: unknown)` blocks. */
export function isApiClientError(err: unknown): err is ApiClientError {
  return err instanceof ApiClientError;
}

/**
 * Throws `ApiClientError` on any non-2xx; returns the parsed JSON body otherwise.
 *
 * `res.json()` is called unconditionally, which is exactly why the API has **no 204s**
 * (02-api-contract.md I1): a bodyless success would arrive here as a SyntaxError. Deletes
 * therefore return `200 { ok: true, … }`.
 *
 * `Content-Type: application/json` is set for every body except a `FormData` one — the browser
 * must set that header itself, because it has to append the multipart boundary. Caller-supplied
 * headers win, so an explicit override is still possible.
 *
 * Callers branch on `err.code` (or `err.status`), **never** on `err.message` (I12): the code is
 * the machine-readable contract and the message is user-presentable English that may be
 * reworded. The editor's conflict handler is
 * `if (err.code === 'CONFLICT') showReloadBanner(err.details as ConflictDetails)`, and a share
 * dialog distinguishes `USER_NOT_FOUND` from `CANNOT_SHARE_WITH_SELF` the same way.
 */
export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });

  // `.catch(() => null)` covers the pathological case — a proxy or the framework returning a
  // non-JSON error page — so a 502 surfaces as INTERNAL_ERROR rather than a raw SyntaxError.
  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const err = (body as ApiErrorBody | null)?.error;
    throw new ApiClientError(
      err?.code ?? "INTERNAL_ERROR",
      err?.message ?? "Unexpected error.",
      res.status,
      err?.details,
    );
  }

  return body as T;
}

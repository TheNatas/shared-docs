import type { ApiErrorCode } from "@/lib/api-types";

/**
 * PARTIAL — T01 created this file in W1 (specs/DECISIONS.md D011).
 *
 * lib/permissions.ts and lib/session.ts both throw ApiError, and both were written in W1, but
 * the task graph assigns this module to T07 in W2. That ordering left `pnpm exec tsc --noEmit`,
 * `pnpm build` and `pnpm test:unit` red across the whole repo — breaking 06-test-plan.md §2.4's
 * headline promise that a reviewer can always run something and see green.
 *
 * **T07 EXTENDS this file** with `ok`, `fail`, `toResponse`, `parseJson`, `parseQuery`,
 * `withSession` and `withPublic` per 02-api-contract.md §4. It must NOT recreate it — ApiError
 * below is already the canonical definition and is thrown from two live modules.
 */
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

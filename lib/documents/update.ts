import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { toPrismaJson, type DocumentContent } from "@/lib/documents/content";
import type { ConflictDetails, PatchDocumentResponse } from "@/lib/api-types";

/**
 * The conditional `PATCH` write (00-foundation.md §5, 01-data-and-persistence.md §5.3).
 *
 * Separated from the route handler for one reason: the optimistic-concurrency guard is the
 * project's whole answer to "we did not build real-time collaboration"
 * (02-api-contract.md §6), and it is a persistence concern — the predicate is evaluated by
 * Postgres, not by JavaScript. Keeping it in a module means the handler reads as
 * authorize → size-check → write, and the interesting part is not buried under it.
 *
 * Nothing here checks access. `requireAccess` has already run by the time this is called;
 * this function answers "does the caller's token still match", not "may they write".
 */

/** Exactly the writable slice of `patchDocumentSchema`. Both fields optional, token required. */
export type DocumentUpdate = {
  title?: string;
  content?: DocumentContent;
  /** ISO 8601. Zod has already proved it parses (`z.iso.datetime()`). */
  lastKnownUpdatedAt: string;
};

/**
 * Applies the patch iff the row's `updatedAt` still equals the caller's token, and returns the
 * NEW token so the client can advance (02-api-contract.md §6.1 — a client that fails to
 * advance 409s itself on its next save, which is risk R4).
 *
 * Throws `ApiError` 409 `CONFLICT` (stale token) or 404 `NOT_FOUND` (row gone). Both are
 * turned into the error envelope by `withSession`'s funnel, so this must only ever be called
 * from inside a wrapped handler.
 */
export async function updateDocument(
  id: string,
  patch: DocumentUpdate,
): Promise<PatchDocumentResponse> {
  // Date instants, never strings: `2026-09-01T14:32:07.913Z` and
  // `2026-09-01T11:32:07.913-03:00` are the same moment, and string equality would 409 on the
  // second. Prisma maps DateTime to timestamp(3) and Date is millisecond-precision, so the
  // DB -> toISOString() -> client -> back round trip is lossless and the equality is exact
  // rather than approximate (02-api-contract.md §6.2).
  const token = new Date(patch.lastKnownUpdatedAt);

  // ONE statement tests the predicate and takes the row lock. A `findUnique` followed by an
  // `update` leaves a window in which a concurrent writer slips between the two and the check
  // passes anyway — the conflict this whole feature exists to catch would be the one it misses.
  const result = await prisma.document.updateMany({
    where: { id, updatedAt: token },
    data: {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.content !== undefined ? { content: toPrismaJson(patch.content) } : {}),
    },
  });

  if (result.count === 0) {
    // Zero rows has two causes and they are two different answers: the token is stale (409),
    // or the row was deleted between the access check and this statement (404).
    const current = await prisma.document.findUnique({
      where: { id },
      select: { updatedAt: true },
    });

    if (!current) throw new ApiError("NOT_FOUND", "Document not found.", 404);

    const details: ConflictDetails = {
      currentUpdatedAt: current.updatedAt.toISOString(),
      lastKnownUpdatedAt: patch.lastKnownUpdatedAt,
    };
    throw new ApiError(
      "CONFLICT",
      "This document was changed somewhere else.",
      409,
      details,
    );
  }

  // `content` is deliberately not selected: §7.8 does not echo it back, and shipping a 1 MB
  // body on every autosave tick is pure waste. `@updatedAt` is applied by Prisma on every
  // UPDATE, including a no-op one — so a save that changed nothing still advances the token,
  // which is correct: it means "someone wrote after you read".
  const fresh = await prisma.document.findUniqueOrThrow({
    where: { id },
    select: { id: true, title: true, updatedAt: true },
  });

  return {
    id: fresh.id,
    title: fresh.title,
    updatedAt: fresh.updatedAt.toISOString(),
  };
}

import { ApiError, ok, parseJson, withSession } from "@/lib/api";
import { prisma } from "@/lib/db";
import { listSharesFor, toShareEntry } from "@/lib/documents/queries";
import { requireAccess } from "@/lib/permissions";
import { createShareSchema } from "@/lib/schemas";
import type { CreateShareResponse, ListSharesResponse } from "@/lib/api-types";

/**
 * The share list and the grant/upsert (02-api-contract.md §7.10).
 *
 * Both methods are OWNER-only, and they say so through different capabilities on purpose:
 * `viewShares` for the read, `manageShares` for the write. They happen to be held by the same
 * role today, but the capability matrix is the thing allowed to change — the call sites are
 * not (03-auth-and-permissions.md §6).
 */

export const runtime = "nodejs"; // Prisma is not Edge-compatible (02-api-contract.md §10)
export const dynamic = "force-dynamic"; // this file exports a GET (I11)

/**
 * `listSharesFor` is the ONE builder of a wire `ShareEntry`, shared with `getDocumentFor`, so
 * `GET /api/documents/:id/shares` and the `shares` array inside `GET /api/documents/:id` cannot
 * drift into two shapes.
 */
export const GET = withSession<{ id: string }>(async (_request, { params, session }) => {
  const { id } = await params;
  await requireAccess(session.id, id, "viewShares");

  return ok<ListSharesResponse>({ shares: await listSharesFor(id) });
});

export const POST = withSession<{ id: string }>(async (request, { params, session }) => {
  const { id } = await params;
  await requireAccess(session.id, id, "manageShares");

  // Zod has already trimmed and lowercased `email` (lib/schemas.ts).
  const { email, role } = await parseJson(request, createShareSchema);

  /**
   * Self-share is rejected BEFORE the directory lookup, so sharing with your own address is
   * always CANNOT_SHARE_WITH_SELF and never USER_NOT_FOUND (02-api-contract.md §7.10). The
   * session email comes from the verified JWT, so this costs no query.
   */
  if (email === session.email.toLowerCase()) {
    throw new ApiError(
      "CANNOT_SHARE_WITH_SELF",
      "You already own this document — you cannot share it with yourself.",
      400,
    );
  }

  const target = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!target) {
    throw new ApiError("USER_NOT_FOUND", "No user with that email.", 404);
  }

  // Belt and braces: the JWT carries the email the session was minted with, so an address
  // changed since then would slip past the check above and land here as a foreign-key-clean
  // share of a document with its own owner.
  if (target.id === session.id) {
    throw new ApiError(
      "CANNOT_SHARE_WITH_SELF",
      "You already own this document — you cannot share it with yourself.",
      400,
    );
  }

  const key = { documentId_userId: { documentId: id, userId: target.id } };

  // `created` is not recoverable from an upsert's result, and the UI needs it to choose
  // between "Shared with Bob" and "Bob is now an editor" (04-ui-spec.md §8.5). A probe read is
  // the honest way to get it. Worst case under a race is a wrong boolean in a toast; the row
  // itself is still correct, because @@unique([documentId, userId]) decides that, not this.
  const existing = await prisma.documentShare.findUnique({ where: key, select: { id: true } });

  const row = await prisma.documentShare.upsert({
    where: key,
    // `grantedById` is written on create only — it records who first opened the door, and a
    // role change by the same owner must not rewrite that history.
    create: { documentId: id, userId: target.id, role, grantedById: session.id },
    update: { role },
    // `select`, not `include`: this is exactly `toShareEntry`'s argument, so the raw row's
    // `id`, `documentId` and `grantedById` never exist in a variable that could be spread into
    // a response by a later edit.
    select: {
      userId: true,
      role: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  // 200 in BOTH branches, never 201 — one status for one operation (02-api-contract.md §7.10).
  return ok<CreateShareResponse>({ share: toShareEntry(row), created: existing === null });
});

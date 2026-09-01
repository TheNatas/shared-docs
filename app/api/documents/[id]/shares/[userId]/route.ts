import { ApiError, ok, parseJson, withSession } from "@/lib/api";
import { prisma } from "@/lib/db";
import { toShareEntry } from "@/lib/documents/queries";
import { requireAccess } from "@/lib/permissions";
import { updateShareSchema } from "@/lib/schemas";
import type { DeleteShareResponse, UpdateShareResponse } from "@/lib/api-types";

/**
 * One share row: change its role, or revoke it (02-api-contract.md §7.11).
 *
 * Both are `manageShares`, so an EDITOR gets 403 here exactly as they do on POST — an editor
 * cannot re-share, cannot promote, cannot revoke.
 *
 * No `dynamic` export: I11 attaches `force-dynamic` to GET route files, and this one has none.
 */

export const runtime = "nodejs";

/** The share select that feeds `toShareEntry`, kept in one place across both re-reads. */
const SHARE_ENTRY_SELECT = {
  userId: true,
  role: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
} as const;

export const PATCH = withSession<{ id: string; userId: string }>(
  async (request, { params, session }) => {
    const { id, userId } = await params;
    await requireAccess(session.id, id, "manageShares");

    const { role } = await parseJson(request, updateShareSchema);

    /**
     * `updateMany` on the (documentId, userId) pair rather than `update` on the compound key:
     * a missing row comes back as `count === 0` instead of a thrown Prisma P2025 that the
     * funnel would render as a 500.
     */
    const { count } = await prisma.documentShare.updateMany({
      where: { documentId: id, userId },
      data: { role },
    });

    // 404 SHARE_NOT_FOUND, not NOT_FOUND: the caller is the proven owner and already knows the
    // document exists, so this is a statement about the *share*. The client branches on `code`
    // and has to be able to tell the two apart (03-auth-and-permissions.md §9.5).
    if (count === 0) {
      throw new ApiError("SHARE_NOT_FOUND", "That share no longer exists.", 404);
    }

    const row = await prisma.documentShare.findUnique({
      where: { documentId_userId: { documentId: id, userId } },
      select: SHARE_ENTRY_SELECT,
    });

    // Revoked between the update and this read. Same answer as "there was never a row".
    if (!row) {
      throw new ApiError("SHARE_NOT_FOUND", "That share no longer exists.", 404);
    }

    return ok<UpdateShareResponse>({ share: toShareEntry(row) });
  },
);

/**
 * Revoking is idempotent: 200 whether it removed one row or zero (02-api-contract.md §7.11,
 * reversing the earlier non-idempotent design; 06-test-plan.md case 21 double-revokes and
 * asserts 200 twice). `deleteMany`, not `delete` — `delete` throws P2025 on a row that is
 * already gone, turning a double-click on **Remove** into an error toast for an outcome the
 * user already has. SHARE_NOT_FOUND survives on PATCH only, where changing the role of a share
 * that does not exist really is a caller error.
 */
export const DELETE = withSession<{ id: string; userId: string }>(
  async (_request, { params, session }) => {
    const { id, userId } = await params;
    await requireAccess(session.id, id, "manageShares");

    await prisma.documentShare.deleteMany({ where: { documentId: id, userId } });

    // 200 with a body, never 204: apiFetch calls res.json() unconditionally (I1).
    return ok<DeleteShareResponse>({ ok: true, userId });
  },
);

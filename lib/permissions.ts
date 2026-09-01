import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api";
import type { Document, ShareRole } from "@prisma/client";

/**
 * ROLES includes NONE, and the matrix has an explicit all-false NONE row, so `can()` is TOTAL
 * over four roles. An earlier draft modelled "no access" as the absence of a resolution, on
 * the grounds that unrepresentable beats defensively handled. It was reversed for one concrete
 * reason: the highest-value test in the repo is a 24-cell table over 4 roles x 6 capabilities,
 * and `can('NONE', c)` has to be a callable expression for that test to exist. A TypeError in
 * the permission suite is a worse outcome than a row of six `false`s
 * (specs/00-foundation.md §6a).
 */
export const ROLES = ["OWNER", "EDITOR", "VIEWER", "NONE"] as const;
export type AccessRole = (typeof ROLES)[number];

export const CAPABILITIES = [
  "read",
  "update",
  "rename",
  "delete",
  "viewShares",
  "manageShares",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** The role of the *caller* once access is known to exist. */
export type MyRole = Exclude<AccessRole, "NONE">;

/**
 * The single source of truth for authorization, mirroring 00-foundation.md §6 row for row.
 * If the two ever disagree, foundation wins and this table is the bug. Adding a Capability to
 * the union without adding it to all four rows is a type error.
 */
export const CAPABILITY_MATRIX: Record<
  AccessRole,
  Record<Capability, boolean>
> = {
  OWNER:  { read: true,  update: true,  rename: true,  delete: true,  viewShares: true,  manageShares: true  },
  EDITOR: { read: true,  update: true,  rename: true,  delete: false, viewShares: false, manageShares: false },
  VIEWER: { read: true,  update: false, rename: false, delete: false, viewShares: false, manageShares: false },
  NONE:   { read: false, update: false, rename: false, delete: false, viewShares: false, manageShares: false },
} as const;

/**
 * Pure: no I/O, no database, no request context, no clock. That purity is the whole reason the
 * authorization policy is exhaustively testable in milliseconds with no Postgres running
 * (24 assertions, lib/permissions.test.ts). Every stateful part of authorization lives in
 * resolveAccess; every *decision* lives here. Do not let a query leak into it.
 */
export function can(role: AccessRole, capability: Capability): boolean {
  return CAPABILITY_MATRIX[role][capability];
}

/**
 * `document` is non-null if and only if `role !== 'NONE'`. Carrying the row out of the
 * resolver is what lets `GET /api/documents/:id` answer from ONE query.
 */
export type ResolvedAccess =
  | { role: MyRole; document: Document }
  | { role: "NONE"; document: null };

function shareRoleToAccessRole(role: ShareRole): MyRole {
  return role === "EDITOR" ? "EDITOR" : "VIEWER";
}

/**
 * The ONE query that answers "can this user see this document, and as what?". A single
 * round-trip: the OR covers ownership and share membership, and the filtered `include` brings
 * back only this user's share row (0 or 1, guaranteed by @@unique([documentId, userId])).
 *
 * Returns role 'NONE' for BOTH "the document does not exist" and "the user has no access".
 * The caller cannot tell them apart, which is what makes the 404 in
 * specs/03-auth-and-permissions.md §8 honest rather than cosmetic: a leaked document id must
 * not become an oracle confirming the document is real.
 */
export async function resolveAccess(
  userId: string,
  documentId: string,
): Promise<ResolvedAccess> {
  const row = await prisma.document.findFirst({
    where: {
      id: documentId,
      OR: [{ ownerId: userId }, { shares: { some: { userId } } }],
    },
    include: {
      shares: {
        where: { userId },
        select: { role: true },
      },
    },
  });

  if (!row) return { role: "NONE", document: null };

  const { shares, ...document } = row;

  // Ownership always wins, even if a stray share row also exists.
  if (document.ownerId === userId) return { document, role: "OWNER" };

  const shareRole = shares[0]?.role;
  if (!shareRole) return { role: "NONE", document: null }; // unreachable; fail closed anyway

  return { document, role: shareRoleToAccessRole(shareRole) };
}

/**
 * The only helper a route handler should call. Encodes the 401 -> 404 -> 403 ordering: by the
 * time this runs the caller is authenticated, visibility is resolved before capability, and
 * checking capability first would 403 a stranger and leak existence.
 *
 * Throws ApiError; `withSession`'s funnel in lib/api.ts turns it into the error envelope.
 * Named `requireAccess`, not `requireCapability` — that is the name every call site in
 * specs/02-api-contract.md already uses.
 */
export async function requireAccess(
  userId: string,
  documentId: string,
  capability: Capability,
): Promise<{ role: MyRole; document: Document }> {
  const access = await resolveAccess(userId, documentId);

  if (access.role === "NONE") {
    throw new ApiError("NOT_FOUND", "Document not found.", 404);
  }

  if (!can(access.role, capability)) {
    throw new ApiError(
      "FORBIDDEN",
      `Your access level (${access.role}) does not allow you to ${capability} this document.`,
      403,
    );
  }

  return access;
}

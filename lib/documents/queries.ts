import type { Prisma, ShareRole as PrismaShareRole } from "@prisma/client";

import { prisma } from "@/lib/db";
import { resolveAccess } from "@/lib/permissions";
import { toDocumentContent } from "@/lib/documents/content";
import type {
  DocumentDetail,
  DocumentSummary,
  ListDocumentsResponse,
  MyRole,
  ShareEntry,
  UserSummary,
} from "@/lib/api-types";

/**
 * The shared read layer (02-api-contract.md §4.3).
 *
 * **Server Components and Route Handlers both call these two functions.** 04-ui-spec.md §1
 * mandates that pages read the database directly rather than fetching their own API — a
 * self-fetch costs a network hop, absolute URLs and cookie forwarding — but done naively that
 * makes the code path a reviewer exercises by *browsing* a second implementation of "what may
 * this person see", and the only one with no test. So the read is a module, not a duplicated
 * query, and both consumers call it. One implementation of the access rule, one test
 * (00-foundation.md §6 rule 2).
 *
 * Everything here returns the **wire shapes** from 02-api-contract.md §3, with `Date` already
 * turned into an ISO string, so a page and `GET /api/documents/:id` render from byte-identical
 * data.
 *
 * No `select` in this file names `passwordHash`. `USER_SUMMARY_SELECT` is the only way a user
 * is ever read here, and it is a positive allowlist — never select-then-delete.
 */

const USER_SUMMARY_SELECT = {
  id: true,
  name: true,
  email: true,
} as const;

/**
 * `_count.shares` rides along in the SAME query as the row it belongs to. A separate
 * `documentShare.count()` per document is the N+1 this exists to avoid.
 */
const DOCUMENT_SUMMARY_SELECT = {
  id: true,
  title: true,
  sourceFilename: true,
  updatedAt: true,
  owner: { select: USER_SUMMARY_SELECT },
  _count: { select: { shares: true } },
} as const;

type DocumentSummaryRow = {
  id: string;
  title: string;
  sourceFilename: string | null;
  updatedAt: Date;
  owner: UserSummary;
  _count: { shares: number };
};

function toMyRole(role: PrismaShareRole | undefined): MyRole {
  // Fail closed: a share row we cannot read as EDITOR is treated as VIEWER, never as more.
  return role === "EDITOR" ? "EDITOR" : "VIEWER";
}

function toDocumentSummary(row: DocumentSummaryRow, myRole: MyRole): DocumentSummary {
  return {
    id: row.id,
    title: row.title,
    owner: row.owner,
    myRole,
    sourceFilename: row.sourceFilename,
    // 0 for a non-owner. `viewShares` is OWNER-only (00-foundation.md §6), and the size of the
    // recipient list is part of what that capability protects — an EDITOR must not learn how
    // many other people hold the document. The dashboard only renders this in "My documents"
    // anyway (04-ui-spec.md §5.2).
    shareCount: myRole === "OWNER" ? row._count.shares : 0,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Maps one DocumentShare row to the nested wire shape. `grantedAt` is the row's `createdAt`. */
export function toShareEntry(row: {
  userId: string;
  role: PrismaShareRole;
  createdAt: Date;
  user: UserSummary;
}): ShareEntry {
  return {
    userId: row.userId,
    user: row.user,
    role: row.role,
    grantedAt: row.createdAt.toISOString(),
  };
}

/**
 * Every share on a document, oldest first (02-api-contract.md §7.10).
 *
 * Callers are responsible for the access check: this function answers "who holds this
 * document", it does not decide who may ask. `getDocumentFor` calls it only for an OWNER, and
 * the shares route reaches it through `requireAccess(uid, id, 'viewShares')`.
 */
export async function listSharesFor(documentId: string): Promise<ShareEntry[]> {
  const rows = await prisma.documentShare.findMany({
    where: { documentId },
    orderBy: { createdAt: "asc" },
    select: {
      userId: true,
      role: true,
      createdAt: true,
      user: { select: USER_SUMMARY_SELECT },
    },
  });

  return rows.map(toShareEntry);
}

/**
 * The dashboard payload. Two queries, run in parallel, each carrying its own `_count.shares`.
 *
 * A document appears in exactly one array: an owner cannot hold a share row on their own
 * document (`CANNOT_SHARE_WITH_SELF`, 02-api-contract.md §7.10), so the two `where` clauses
 * are disjoint by construction rather than by a post-filter.
 *
 * Both arrays are sorted by `updatedAt` descending — in SQL, not in JavaScript; the
 * `@@index([ownerId, updatedAt(sort: Desc)])` in the schema exists for the first one.
 */
export async function listDocumentsFor(userId: string): Promise<ListDocumentsResponse> {
  const [owned, shared] = await Promise.all([
    prisma.document.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: "desc" },
      select: DOCUMENT_SUMMARY_SELECT,
    }),
    prisma.document.findMany({
      where: { shares: { some: { userId } } },
      orderBy: { updatedAt: "desc" },
      select: {
        ...DOCUMENT_SUMMARY_SELECT,
        // The caller's own share row, and only theirs: @@unique([documentId, userId])
        // guarantees at most one. This is what makes `myRole` a property of the same query.
        shares: { where: { userId }, select: { role: true }, take: 1 },
      },
    }),
  ]);

  return {
    owned: owned.map((row) => toDocumentSummary(row, "OWNER")),
    sharedWithMe: shared.map((row) => toDocumentSummary(row, toMyRole(row.shares[0]?.role))),
  };
}

/**
 * The editor payload, or `null`.
 *
 * `null` means BOTH "no such document" and "no access", and the two are indistinguishable to
 * the caller — the page calls `notFound()` and the route handler returns 404 from the same
 * fact, so a leaked id never becomes an oracle confirming the document is real
 * (02-api-contract.md §5).
 *
 * Access is decided by `resolveAccess`, never re-derived here: no `ownerId === userId`
 * comparison appears in this file.
 *
 * `shares` is the full list for an OWNER and `null` for everyone else — `null`, not `[]`, so a
 * non-owner can tell "not allowed to see this" from "there are none" (§7.7). For a non-owner
 * the share query is skipped entirely rather than fetched and discarded.
 */
export async function getDocumentFor(
  userId: string,
  id: string,
): Promise<DocumentDetail | null> {
  const access = await resolveAccess(userId, id);
  if (access.role === "NONE") return null;

  const { document, role } = access;
  const isOwner = role === "OWNER";

  // resolveAccess already returned the row itself, so this second read fetches only what it
  // could not: the owner's UserSummary and the share count, together, in one query.
  const [meta, shares] = await Promise.all([
    prisma.document.findUnique({
      where: { id: document.id },
      select: {
        owner: { select: USER_SUMMARY_SELECT },
        _count: { select: { shares: true } },
      },
    }),
    isOwner ? listSharesFor(document.id) : Promise.resolve(null),
  ]);

  // Deleted between the access check and this read. Same answer as "never existed".
  if (!meta) return null;

  return {
    id: document.id,
    title: document.title,
    owner: meta.owner,
    myRole: role,
    sourceFilename: document.sourceFilename,
    shareCount: isOwner ? meta._count.shares : 0,
    updatedAt: document.updatedAt.toISOString(),
    // Defensive read path: a row written before the content guard existed, or hand-edited in
    // Studio, degrades to EMPTY_DOC instead of white-screening the editor.
    content: toDocumentContent(document.content as Prisma.JsonValue),
    shares,
  };
}

// tests/integration/fixtures.ts
//
// The smallest user/document/share graph in which every access level is ASSERTABLE.
// specs/06-test-plan.md §5.4.
//
// This is NOT `prisma/seed.ts`. The demo seed builds five richly-formatted documents so a
// reviewer can click every access level in ten seconds; this graph exists so a TRUNCATE-per-
// test loop can stay around 2 ms. Neither substitutes for the other. What must never diverge
// is the access MODEL they both encode — and that lives in exactly one place,
// `lib/permissions.ts`, which both go through.
//
// The graph, restated because the assertions read against it:
//
//   alice ── owns ──▶ d1 ──┬── EDITOR ──▶ bob      (bob can update, cannot re-share)
//                          └── VIEWER ──▶ carol    (carol can read, cannot update)
//   alice ── owns ──▶ d2       shared with NOBODY  ← makes 404-not-403 demonstrable
//   bob   ── owns ──▶ d3                           ← makes owned vs sharedWithMe distinguishable
//
// Fixed string ids rather than cuids, so assertions read as prose: `expect(ids).toEqual(['d3'])`.

import { hashSync } from "bcryptjs";
import { prisma } from "@/lib/db";
import { EMPTY_DOC, toPrismaJson } from "@/lib/documents/content";

// Cost 4, not the production 10 (lib/password.ts). These are re-hashed on every module load
// and no test depends on the work factor — only on the hash being genuine, so the login route
// compares a real bcrypt string rather than something `compare()` rejects on sight.
export const FIXTURE_PASSWORD = "demo1234";
const PASSWORD_HASH = hashSync(FIXTURE_PASSWORD, 4);

export const USERS = {
  alice: { id: "u_alice", email: "alice@example.com", name: "Alice" },
  bob: { id: "u_bob", email: "bob@example.com", name: "Bob" },
  carol: { id: "u_carol", email: "carol@example.com", name: "Carol" },
} as const;

export const DOCS = {
  d1: "d1", // alice owns; bob EDITOR, carol VIEWER
  d2: "d2", // alice owns; shared with nobody  <- the 404 case
  d3: "d3", // bob owns
} as const;

/** An id that is guaranteed not to exist, for the anti-enumeration comparison. */
export const NONEXISTENT_DOC_ID = "d_does_not_exist";

/**
 * Seeded `updatedAt` is pinned in the PAST rather than left to `now()`.
 *
 * `Document.updatedAt` is `@updatedAt`, so a successful PATCH stamps it with the current
 * instant. If the fixture were also stamped "now", case 5's `updatedAt` MUST HAVE ADVANCED
 * assertion would be comparing two values that can legitimately land in the same millisecond
 * on a fast machine — a test that passes because the clock happened to tick. A fixed offset
 * makes the assertion mean what it says, deterministically.
 *
 * The three documents get distinct instants so `orderBy: { updatedAt: 'desc' }` is stable.
 */
const SEEDED_AT = new Date("2026-01-01T00:00:00.000Z");
const seededUpdatedAt = (minutesAgo: number) =>
  new Date(SEEDED_AT.getTime() - minutesAgo * 60_000);

export async function seedFixtures(): Promise<void> {
  await prisma.user.createMany({
    data: Object.values(USERS).map((u) => ({ ...u, passwordHash: PASSWORD_HASH })),
  });

  await prisma.document.createMany({
    data: [
      {
        id: DOCS.d1,
        title: "Alice shared doc",
        content: toPrismaJson(EMPTY_DOC),
        ownerId: USERS.alice.id,
        createdAt: seededUpdatedAt(30),
        updatedAt: seededUpdatedAt(10),
      },
      {
        id: DOCS.d2,
        title: "Alice private doc",
        content: toPrismaJson(EMPTY_DOC),
        ownerId: USERS.alice.id,
        createdAt: seededUpdatedAt(30),
        updatedAt: seededUpdatedAt(20),
      },
      {
        id: DOCS.d3,
        title: "Bob own doc",
        content: toPrismaJson(EMPTY_DOC),
        ownerId: USERS.bob.id,
        createdAt: seededUpdatedAt(30),
        updatedAt: seededUpdatedAt(30),
      },
    ],
  });

  await prisma.documentShare.createMany({
    data: [
      {
        documentId: DOCS.d1,
        userId: USERS.bob.id,
        role: "EDITOR",
        grantedById: USERS.alice.id,
      },
      {
        documentId: DOCS.d1,
        userId: USERS.carol.id,
        role: "VIEWER",
        grantedById: USERS.alice.id,
      },
    ],
  });
}

/** Current `updatedAt` as an ISO string — a FRESH optimistic-concurrency token. */
export async function updatedAtOf(documentId: string): Promise<string> {
  const doc = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
    select: { updatedAt: true },
  });
  return doc.updatedAt.toISOString();
}

/** The whole row, for before/after "provably unchanged" comparisons. */
export function documentRow(documentId: string) {
  return prisma.document.findUniqueOrThrow({ where: { id: documentId } });
}

/** Share rows for a document, oldest first — the shape the assertions count and compare. */
export function sharesOf(documentId: string) {
  return prisma.documentShare.findMany({
    where: { documentId },
    orderBy: { createdAt: "asc" },
    select: { userId: true, role: true },
  });
}

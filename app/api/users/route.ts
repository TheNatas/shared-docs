import type { Prisma } from "@prisma/client";

import { ok, parseQuery, withSession } from "@/lib/api";
import { prisma } from "@/lib/db";
import { userSearchSchema } from "@/lib/schemas";
import type { UserSearchResponse } from "@/lib/api-types";

/**
 * The share picker's directory (02-api-contract.md §7.12). Session-gated, nothing more: any
 * signed-in user may look up any other, because the only thing you can do with the result is
 * share a document you already own.
 *
 * **Known simplification (00-foundation.md §7):** this is a user-enumeration endpoint,
 * acceptable only because the directory is three seeded demo accounts. ARCHITECTURE.md names
 * the real fix — invite by exact email match, no listing, no partial search.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** No `take: 5` and no minimum query length: the picker queries at two characters. */
const MAX_RESULTS = 10;

export const GET = withSession(async (request, { session }) => {
  const { q } = parseQuery(request, userSearchSchema);

  // Built as an annotated value rather than inline so `mode: 'insensitive'` keeps its
  // Prisma.QueryMode type instead of widening to `string` through a conditional spread.
  const where: Prisma.UserWhereInput = {
    // You cannot share with yourself, so you are not in your own directory (§7.10).
    id: { not: session.id },
  };

  // Absent or empty after Zod's trim: list everyone else.
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { name: "asc" },
    take: MAX_RESULTS,
    // Literally { id, name, email }. `passwordHash` is not selected and then deleted — it is
    // never read out of the database at all, which is the only version of that claim a
    // reviewer can verify by looking at one line.
    select: { id: true, name: true, email: true },
  });

  return ok<UserSearchResponse>({ users });
});

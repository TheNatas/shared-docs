import { ok, withSession } from "@/lib/api";
import { prisma } from "@/lib/db";
import { createDocumentSchema } from "@/lib/schemas";
import { EMPTY_DOC, toPrismaJson } from "@/lib/documents/content";
import { listDocumentsFor } from "@/lib/documents/queries";
import type { CreateDocumentResponse } from "@/lib/api-types";

/**
 * `GET`/`POST /api/documents` — 02-api-contract.md §7.4 and §7.5.
 *
 * Both handlers are wrapped by `withSession`, so a cookie-less request is
 * `401 UNAUTHENTICATED` before either body runs, and every throw below — a Zod failure
 * included — funnels through `toResponse` (§4). Neither handler builds a response by hand.
 */

export const runtime = "nodejs"; // Prisma cannot run on Edge
export const dynamic = "force-dynamic"; // a per-user list must never be prerendered or cached

/**
 * The dashboard payload. Sorting, the `owned`/`sharedWithMe` split, the "exactly one array"
 * guarantee and the omission of `content` are all properties of `listDocumentsFor` — the same
 * function the dashboard Server Component calls directly (§4.3). This handler exists so the
 * client can refetch the list; it must not grow a second copy of the query.
 */
export const GET = withSession(async (_req, { session }) =>
  ok(await listDocumentsFor(session.id)),
);

export const POST = withSession(async (req, { session }) => {
  // Parsed locally rather than with `parseJson` (§7.5, the one documented exception). The
  // "New document" button sends no body at all, and `parseJson`'s `req.json()` throws on an
  // empty one — which would 400 the single most important create path in the product. The
  // spec's rule is that a JSON parse failure on THIS route degrades to `{}`: every field is
  // optional, so there is nothing a malformed body could have meant that the defaults do not
  // already cover, and a 500 would blame us for the caller's input.
  const raw = await req.text();
  let body: unknown = {};
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      // Intentionally empty — fall through to the defaults, as above.
    }
  }
  const input = createDocumentSchema.parse(body);

  const doc = await prisma.document.create({
    data: {
      // Left undefined when absent so the `@default("Untitled document")` in the schema is the
      // single place that string lives. Restating it here is how the two drift.
      title: input.title,
      content: toPrismaJson(EMPTY_DOC),
      // session.id — NOT session.userId, which does not exist and would write a null FK.
      ownerId: session.id,
    },
    select: {
      id: true,
      title: true,
      sourceFilename: true,
      updatedAt: true,
      // Read back rather than assembled from the JWT claims, so this row is byte-identical to
      // the one `GET /api/documents` returns for the same document — the client drops the
      // response straight into the dashboard list without a refetch.
      owner: { select: { id: true, name: true, email: true } },
    },
  });

  const summary: CreateDocumentResponse = {
    id: doc.id,
    title: doc.title,
    owner: doc.owner,
    myRole: "OWNER",
    sourceFilename: doc.sourceFilename,
    // A document one statement old has no share rows; counting them would be a round trip
    // whose answer is known.
    shareCount: 0,
    updatedAt: doc.updatedAt.toISOString(),
  };

  return ok(summary, 201);
});

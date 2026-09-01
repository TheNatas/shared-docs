import { fail, ok, withSession } from "@/lib/api";
import { prisma } from "@/lib/db";
import { toPrismaJson } from "@/lib/documents/content";
import { parseUpload } from "@/lib/import";
import type { ImportDocumentResponse } from "@/lib/api-types";

/**
 * `POST /api/documents/import` — multipart/form-data, one field: `file`.
 * specs/05-import-spec.md §6.3, 02-api-contract.md §7.6.
 *
 * Node runtime, not Edge: `mammoth` needs Node's Buffer and zip stack, and `@tiptap/html`
 * resolves its server build through the `node` export condition (specs/DECISIONS.md D007).
 */
export const runtime = "nodejs";

/**
 * The whole handler is inside `withSession`, which is the only place a throw becomes a
 * response. Every decision below is either a `fail()` carrying a code from the one registry
 * or the single `ok()` at the end.
 *
 * No `resolveAccess` call: import always CREATES a document, so there is no existing resource
 * to authorise against, and `ownerId` comes from the verified session rather than the request
 * — there is no way to import into someone else's document (§7.4).
 */
export const POST = withSession(async (req, { session }) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");

  // §6.2 row 2. This is the Zod check from §6.2's note, inlined: a multipart body is not JSON,
  // so what is validated is the shape after extraction, and `instanceof File` is that check
  // with one fewer indirection.
  if (!(file instanceof File)) {
    return fail("FILE_MISSING", "No file was selected. Choose a file to import.", 400);
  }

  // Rows 3–11. `parseUpload` never throws and carries its own status, code and sentence.
  const result = await parseUpload(file);
  if (!result.ok) {
    return fail(result.code, result.message, result.status, result.details);
  }

  // One insert, no shares at import time, so no transaction.
  const row = await prisma.document.create({
    data: {
      title: result.title,
      content: toPrismaJson(result.content),
      sourceFilename: result.sourceFilename,
      // session.id — NOT session.userId, which does not exist and would write a null FK.
      ownerId: session.id,
    },
    select: {
      id: true,
      title: true,
      sourceFilename: true,
      updatedAt: true,
      owner: { select: { id: true, name: true, email: true } },
    },
  });

  // 201 DocumentSummary rather than `{ id }`: the contract says so (02 §7.6), it is a strict
  // superset the client may ignore, and going through ok() is what gives the response its
  // `Cache-Control: no-store`.
  const body: ImportDocumentResponse = {
    id: row.id,
    title: row.title,
    owner: row.owner,
    myRole: "OWNER",
    sourceFilename: row.sourceFilename,
    // A document created a microsecond ago has no shares. Counting them would be a second
    // query for a value that is 0 by construction.
    shareCount: 0,
    updatedAt: row.updatedAt.toISOString(),
  };

  return ok(body, 201);
});

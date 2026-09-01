import { prisma } from "@/lib/db";
import { ApiError, fail, ok, parseJson, withSession } from "@/lib/api";
import { requireAccess } from "@/lib/permissions";
import { getDocumentFor } from "@/lib/documents/queries";
import { updateDocument } from "@/lib/documents/update";
import { patchDocumentSchema } from "@/lib/schemas";
import { MAX_CONTENT_BYTES, contentByteSize } from "@/lib/documents/content";
import type {
  DeleteDocumentResponse,
  GetDocumentResponse,
  PatchDocumentResponse,
} from "@/lib/api-types";

export const runtime = "nodejs"; // Prisma is not Edge-compatible (02-api-contract.md §10)
export const dynamic = "force-dynamic"; // never serve a build-time snapshot of someone's doc

/**
 * The single-document routes: read, save, delete (02-api-contract.md §7.7–7.9).
 *
 * Every body is inside `withSession`, which is the only place `toResponse` funnels a throw —
 * `parseJson`, `requireAccess` and `updateDocument` all abort by throwing `ApiError`, and
 * outside the wrapper that would be an unhandled rejection rather than an error envelope.
 */

/**
 * 7.7 — `DocumentDetail`, with `shares` populated for an OWNER and `null` for everyone else.
 *
 * `getDocumentFor` already resolves access, already shapes `shares` and already converts the
 * dates; none of that is re-done here. It returns `null` for BOTH "no such document" and "no
 * access", which is what makes the 404 honest: a leaked id never becomes an oracle confirming
 * the document is real (§5). No 403 is reachable — `read` is granted to every non-NONE role.
 */
export const GET = withSession<{ id: string }>(async (_req, { params, session }) => {
  const { id } = await params;

  const doc = await getDocumentFor(session.id, id);
  if (!doc) return fail("NOT_FOUND", "Document not found.", 404);

  return ok<GetDocumentResponse>(doc);
});

/**
 * 7.8 — the autosave endpoint, and the enforcement point for the whole permission model.
 *
 * The body is parsed BEFORE the access check, which is forced rather than chosen: §4.2 wants
 * `requireAccess` run for each capability the body exercises, and which those are is not
 * knowable until the body has been read. Nothing leaks — a stranger probing an id gets a 400
 * about their own body and a 404 about ours.
 */
export const PATCH = withSession<{ id: string }>(async (req, { params, session }) => {
  const { id } = await params;
  const input = await parseJson(req, patchDocumentSchema);

  // One check per capability the body exercises. `update` and `rename` are held by the same
  // roles today, so this is not currently distinguishable — but the matrix is the thing
  // allowed to change, not the call sites (00-foundation.md §6a).
  if (input.content !== undefined) await requireAccess(session.id, id, "update");
  if (input.title !== undefined) await requireAccess(session.id, id, "rename");

  // A separate step after Zod, never a Zod issue re-mapped by matching on its message: shape
  // failures are 400 and size failures are 413, and neither is inferred from the other's text.
  // It runs after the access check so a VIEWER gets the 403 they have earned rather than a
  // 413 that implies the write would otherwise have been allowed.
  if (input.content !== undefined && contentByteSize(input.content) > MAX_CONTENT_BYTES) {
    throw new ApiError("CONTENT_TOO_LARGE", "Document content is too large (1 MB limit).", 413);
  }

  // Throws 409 CONFLICT on a stale token and 404 if the row vanished under us. The returned
  // `updatedAt` is the NEW token and the client MUST store it (§6.1).
  return ok<PatchDocumentResponse>(await updateDocument(id, input));
});

/**
 * 7.9 — owner only. `DocumentShare` rows cascade; there is no soft delete and no trash.
 *
 * 200 with a body, not 204: `apiFetch` calls `res.json()` unconditionally, so a bodyless
 * success is a SyntaxError in the browser (lib/api.ts, invariant I1).
 */
export const DELETE = withSession<{ id: string }>(async (_req, { params, session }) => {
  const { id } = await params;
  await requireAccess(session.id, id, "delete");

  // `deleteMany`, not `delete`: if the row is removed between the access check and here —
  // two tabs, one dashboard delete each — `delete` throws Prisma's P2025 and the funnel turns
  // it into a 500. "Already deleted" is a 404 (§7.9), and count tells us which happened.
  const { count } = await prisma.document.deleteMany({ where: { id } });
  if (count === 0) return fail("NOT_FOUND", "Document not found.", 404);

  return ok<DeleteDocumentResponse>({ ok: true, id });
});

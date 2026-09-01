import { notFound, redirect } from "next/navigation";

import { DocumentEditor } from "@/components/editor/DocumentEditor";
import { getDocumentFor } from "@/lib/documents/queries";
import { readSession } from "@/lib/session";

// Per-user and cookie-dependent: there is nothing here to cache across requests
// (04-ui-spec.md §1).
export const dynamic = "force-dynamic";

/**
 * `/documents/[id]` — a Server Component that reads Prisma directly through
 * `lib/documents/queries.ts`, the same module `GET /api/documents/:id` calls, and hands the
 * whole `DocumentDetail` to the client editor as props. It does **not** fetch its own API:
 * that would cost a network hop, an absolute URL and cookie forwarding, and it would make the
 * access rule a second implementation with no test (04-ui-spec.md §1, ruling 2).
 *
 * `getDocumentFor` returns `null` for BOTH "no such document" and "no access", and this page
 * cannot tell them apart on purpose — `notFound()` renders the same 404 either way, so a
 * guessed id never confirms that a document exists (00-foundation.md §6.1, NONE → 404).
 */
export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Belt-and-braces. `middleware.ts` already redirects an unauthenticated hit on
  // /documents/* — this is the second line, not the control, and it is here so the page is
  // still correct if the matcher ever changes.
  const session = await readSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(`/documents/${id}`)}`);

  const doc = await getDocumentFor(session.id, id);
  if (!doc) notFound();

  return <DocumentEditor doc={doc} />;
}

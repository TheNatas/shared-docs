import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FileText, Share2 } from "lucide-react";

import type { DocumentSummary } from "@/lib/api-types";
import { listDocumentsFor } from "@/lib/documents/queries";
import { readSession } from "@/lib/session";
import { Separator } from "@/components/ui/separator";
import { DocumentCardMenu } from "@/components/dashboard/DocumentCardMenu";
import { DocumentSection } from "@/components/dashboard/DocumentSection";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { NewDocumentButton } from "@/components/dashboard/NewDocumentButton";
import { ImportButton } from "@/components/documents/import-button";

/**
 * The dashboard (04-ui-spec.md §5).
 *
 * Server Component, and it reads Prisma DIRECTLY through `listDocumentsFor` — it does not
 * fetch its own API. A self-fetch would cost a network hop, an absolute URL and manual cookie
 * forwarding, and would give the access rule a second implementation. The route handler calls
 * the same function, so `GET /api/documents` and this page render from byte-identical data and
 * the integration suite covers both (04 §1).
 *
 * The session field is `session.id`. `session.userId` does not exist and would silently be
 * `undefined`, which `listDocumentsFor` would happily turn into two empty arrays
 * (00-foundation.md §7c).
 */

// Per-user and cookie-dependent: there is nothing here worth caching, and a stale dashboard
// after New document / Import / Delete is the bug this prevents.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Documents",
};

export default async function DocumentsPage() {
  const session = await readSession();
  // Belt and braces. `middleware.ts` already redirects an unauthenticated /documents to
  // /login; this is the second line, not the control (04 §2). It also narrows the type.
  if (!session) redirect(`/login?next=${encodeURIComponent("/documents")}`);

  const { owned, sharedWithMe } = await listDocumentsFor(session.id);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
        <div className="flex items-center gap-2">
          <ImportButton />
          <NewDocumentButton />
        </div>
      </div>

      <div className="space-y-8">
        <DocumentSection
          heading="My documents"
          documents={owned}
          variant="owned"
          // The `⋯` menu is owner-only: Delete is an OWNER capability (00-foundation.md §6),
          // so it is wired here and deliberately not passed to the shared section below.
          renderMenu={(doc: DocumentSummary) => (
            <DocumentCardMenu documentId={doc.id} title={doc.title} />
          )}
          empty={
            <EmptyState
              icon={FileText}
              title="No documents yet"
              description="Create a blank document, or import a .md, .txt or .docx file to turn it into an editable doc."
            >
              <NewDocumentButton />
              <ImportButton />
            </EmptyState>
          }
        />

        <Separator />

        <DocumentSection
          heading="Shared with me"
          documents={sharedWithMe}
          variant="shared"
          // No CTA: the user cannot act to fix this state, and a button that does nothing
          // useful is worse than no button (04 §5.4).
          empty={
            <EmptyState
              icon={Share2}
              title="Nothing shared with you yet"
              description="When someone shares a document with you, it will appear here with your role on it."
            />
          }
        />
      </div>
    </div>
  );
}

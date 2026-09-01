import type { DocumentSummary } from "@/lib/api-types";
import { DocumentCard, type DocumentCardVariant } from "@/components/dashboard/DocumentCard";

/**
 * Heading + count + grid, or the section's own empty panel (04-ui-spec.md §5.1, §5.4).
 *
 * Both dashboard sections ALWAYS render, empty or not. Hiding "Shared with me" when it holds
 * nothing would destroy the owned/shared distinction C11 grades — and empty is exactly the
 * state a reviewer signing in as the third seeded user lands in, so it is the state most
 * likely to be screenshotted.
 *
 * `renderMenu` is a slot rather than a flag: the `⋯` menu is a Client Component owned by T16,
 * and threading it as a callback keeps this file and `DocumentCard` on the server. Omitting it
 * is how the shared section stays menu-less.
 */
export function DocumentSection({
  heading,
  documents,
  variant,
  empty,
  renderMenu,
}: {
  heading: string;
  documents: DocumentSummary[];
  variant: DocumentCardVariant;
  empty: React.ReactNode;
  renderMenu?: (doc: DocumentSummary) => React.ReactNode;
}) {
  const headingId = `dashboard-section-${variant}`;

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="mb-3 text-base font-semibold tracking-tight">
        {heading} <span className="font-normal text-muted-foreground">· {documents.length}</span>
      </h2>

      {documents.length === 0 ? (
        empty
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              variant={variant}
              menu={renderMenu?.(doc)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

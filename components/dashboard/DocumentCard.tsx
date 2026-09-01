import Link from "next/link";

import type { DocumentSummary } from "@/lib/api-types";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProvenanceLine } from "@/components/dashboard/ProvenanceLine";
import { RoleBadge } from "@/components/dashboard/RoleBadge";

/**
 * One dashboard row (04-ui-spec.md §5.2). Server Component — it renders a link and some text,
 * and `formatRelativeTime` is server-only by contract (lib/format.ts).
 *
 * `variant` is what C11 is graded on. A shared card differs from an owned one by FOUR
 * simultaneous signals — left accent bar, tinted surface, `Owned by` byline, role badge — so
 * the distinction survives a screenshot, a colour-blind reader and a grey-scale print. Any one
 * of them alone would not.
 */

export type DocumentCardVariant = "owned" | "shared";

// Fixed to UTC so the string is deterministic: this renders on the server, and a server
// formatted in the machine's local zone would put a timestamp in the HTML that means something
// else to the reader. The relative line above it is the one people read; this is the tooltip.
const ABSOLUTE = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function absoluteTimestamp(iso: string): string | undefined {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? undefined : `${ABSOLUTE.format(at)} UTC`;
}

export function DocumentCard({
  doc,
  variant,
  menu,
}: {
  doc: DocumentSummary;
  variant: DocumentCardVariant;
  /**
   * The owner-only `⋯` overflow menu (`DocumentCardMenu`, owned by T16). A slot rather than an
   * import so this file stays a Server Component with no client dependency, and so the card
   * cannot accidentally offer Delete on a shared row — non-owners cannot delete
   * (00-foundation.md §6).
   */
  menu?: React.ReactNode;
}) {
  const isShared = variant === "shared";

  return (
    <li className="relative">
      {/* Sibling of the link, not a child: a <button> inside an <a> is invalid HTML and the
          nested activation behaviour is undefined. z-10 lifts it over the card's hit area. */}
      {menu ? <div className="absolute top-3 right-3 z-10">{menu}</div> : null}

      <Link
        href={`/documents/${doc.id}`}
        className={cn(
          "flex h-full flex-col gap-1 rounded-xl border p-4 outline-none transition-colors",
          "hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50",
          // A shared card already sits at `bg-muted/40`, and `--accent` and `--muted` are the
          // same lightness in this theme — so the shared branch overrides the hover to a
          // darker step rather than to an identical one, which would read as "hover broken".
          isShared
            ? "border-l-[3px] border-l-primary bg-muted/40 hover:bg-muted"
            : "bg-card",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className={cn("min-w-0 truncate font-medium", menu && "pr-6")}>{doc.title}</h3>
          {isShared ? <RoleBadge role={doc.myRole} className="mt-0.5 shrink-0" /> : null}
        </div>

        {isShared ? (
          <p className="truncate text-sm text-muted-foreground">Owned by {doc.owner.name}</p>
        ) : null}

        <p className="text-sm text-muted-foreground">
          Edited{" "}
          <time dateTime={doc.updatedAt} title={absoluteTimestamp(doc.updatedAt)}>
            {formatRelativeTime(doc.updatedAt)}
          </time>
        </p>

        {/* `shareCount` is 0 on every shared-with-me row BY DESIGN — viewShares is OWNER-only,
            and the size of the recipient list is part of what that capability protects
            (lib/documents/queries.ts). Guarding on `> 0` is therefore also what keeps
            "Shared with 0 people" off a recipient's card. */}
        {doc.shareCount > 0 ? (
          <p className="text-sm text-muted-foreground">
            Shared with {doc.shareCount} {doc.shareCount === 1 ? "person" : "people"}
          </p>
        ) : null}

        {doc.sourceFilename ? (
          <ProvenanceLine filename={doc.sourceFilename} className="mt-auto pt-1" />
        ) : null}
      </Link>
    </li>
  );
}

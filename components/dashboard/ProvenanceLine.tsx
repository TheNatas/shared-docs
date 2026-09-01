import { Upload } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * `⎘ Imported from <filename>` — the dashboard payoff of the upload requirement (C8),
 * 04-ui-spec.md §5.2.
 *
 * Rendered in BOTH sections: provenance belongs to the document, not to the viewer's
 * relationship with it. A recipient of a shared import sees the same line the owner does.
 *
 * Callers gate on `sourceFilename !== null`; this component takes a `string` so the null case
 * cannot reach it and render "Imported from null".
 */
export function ProvenanceLine({
  filename,
  className,
}: {
  filename: string;
  className?: string;
}) {
  return (
    <p className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <Upload aria-hidden="true" className="size-3 shrink-0" />
      {/* min-w-0 is what lets `truncate` win over the flex item's default min-content width;
          without it a long filename widens the card instead of ellipsing. */}
      <span className="min-w-0 truncate">
        Imported from <span className="font-medium">{filename}</span>
      </span>
    </p>
  );
}

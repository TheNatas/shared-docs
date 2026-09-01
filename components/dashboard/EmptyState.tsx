import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The dashed panel a section renders instead of its grid when it holds nothing
 * (04-ui-spec.md §5.4).
 *
 * `children` is the CTA slot, and it is optional on purpose: "My documents" offers New
 * document / Import file, "Shared with me" offers nothing, because a recipient cannot act to
 * fix an empty share list. An empty state with a button the user cannot usefully press is
 * worse than no button.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-lg border border-dashed p-8 text-center",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-6 text-muted-foreground" />
      <p className="mt-3 text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-balance text-muted-foreground">{description}</p>
      {children ? <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div> : null}
    </div>
  );
}

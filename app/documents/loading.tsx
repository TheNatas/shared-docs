import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

/**
 * Dashboard loading state (04-ui-spec.md §2.1).
 *
 * The geometry mirrors `page.tsx` exactly — same container, same 8-unit section rhythm, same
 * grid, same card height — so the real content replaces the skeletons in place instead of
 * making the page jump. A skeleton that does not match the thing it stands in for is a worse
 * experience than a blank screen.
 *
 * `app/documents/layout.tsx` renders the app header outside this boundary, so it stays put.
 */

function CardSkeleton() {
  return (
    <li className="flex h-full flex-col gap-2 rounded-xl border bg-card p-4">
      <Skeleton className="h-5 w-3/5" />
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-4 w-1/3" />
    </li>
  );
}

function SectionSkeleton({ headingWidth }: { headingWidth: string }) {
  return (
    <section>
      <Skeleton className={`mb-3 h-5 ${headingWidth}`} />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <CardSkeleton key={i} />
        ))}
      </ul>
    </section>
  );
}

export default function DocumentsLoading() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-8 w-40" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-32" />
        </div>
      </div>

      <div className="space-y-8">
        <SectionSkeleton headingWidth="w-36" />
        <Separator />
        <SectionSkeleton headingWidth="w-40" />
      </div>
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

/**
 * The editor's shape before the row arrives: title bar, toolbar strip, then six text lines at
 * the same 720px measure the real canvas uses, so nothing jumps when the content lands.
 */
export default function DocumentLoading() {
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex h-12 items-center justify-between border-b px-4">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-20" />
      </div>

      <div className="mx-auto w-full max-w-[720px] px-4 pt-6">
        <Skeleton className="h-9 w-2/3" />
      </div>

      <div className="mt-4 flex items-center gap-2 border-y px-4 py-2">
        <Skeleton className="h-7 w-7" />
        <Skeleton className="h-7 w-7" />
        <Skeleton className="h-7 w-7" />
        <Skeleton className="h-7 w-34" />
        <Skeleton className="h-7 w-7" />
        <Skeleton className="h-7 w-7" />
      </div>

      <div className="mx-auto w-full max-w-[720px] space-y-3 px-4 py-8">
        {/* Ragged widths: a stack of identical bars reads as a loading spinner, not as text. */}
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    </div>
  );
}

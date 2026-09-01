"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Runtime failures below this segment — a dropped database connection, a Prisma error. A
 * missing or forbidden document is NOT one of them: that path calls `notFound()` and renders
 * `not-found.tsx`, which this boundary wraps.
 *
 * `retry` rather than `reset`: Next 16 gives error boundaries both, and only `retry`
 * re-runs the server render. `reset` alone would re-mount the same failed children against
 * the same stale result, so the button would look like it did nothing.
 */
export default function DocumentError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[documents/[id]] render failed", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-24 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Couldn&apos;t open this document.</h1>
      <p className="text-sm text-muted-foreground">
        Something went wrong on our end. Trying again usually works.
      </p>
      <div className="flex items-center gap-2">
        <Button onClick={() => retry()}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/documents">← Back to documents</Link>
        </Button>
      </div>
    </div>
  );
}

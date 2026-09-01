"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Dashboard error boundary (04-ui-spec.md §2.1). Client by necessity — `reset()` is a
 * callback and error boundaries only exist on the client.
 *
 * The user is shown one sentence and one action. `error.message` is deliberately NOT
 * rendered: in production Next.js replaces it with a generic digest anyway, and in
 * development the real text is a Prisma stack trace that says nothing to the person reading
 * it. The digest goes to the console for whoever is actually debugging.
 */
export default function DocumentsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard render failed", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Alert variant="destructive">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>Something went wrong loading your documents.</AlertTitle>
        <AlertDescription>
          The list could not be read. Trying again usually resolves it.
        </AlertDescription>
      </Alert>

      <Button className="mt-4" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}

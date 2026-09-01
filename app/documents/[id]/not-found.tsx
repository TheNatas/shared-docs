import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * The UI half of the `NONE → 404` rule (00-foundation.md §6.1, 03-auth-and-permissions.md).
 *
 * The copy deliberately never says "you don't have permission" as a *fact* about this id: a
 * document you cannot see and a document that does not exist produce the same page, so this
 * screen cannot be used to confirm that an id is real. It names both possibilities and
 * commits to neither.
 */
export default function DocumentNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-24 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Document not found</h1>
      <p className="text-sm text-muted-foreground">
        It may have been deleted, or you don&apos;t have access to it.
      </p>
      <Button asChild variant="outline">
        <Link href="/documents">← Back to documents</Link>
      </Button>
    </div>
  );
}

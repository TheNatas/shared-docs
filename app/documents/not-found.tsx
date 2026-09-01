import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * The fallback for a `notFound()` raised anywhere under `/documents` that has no closer
 * boundary of its own.
 *
 * The copy is deliberately about the *page*, not about a document: `/documents/[id]` ships its
 * own `not-found.tsx` (T17) with the document-specific wording, and a nested boundary wins.
 * Writing document copy here would mean two different sentences could answer the same 404
 * depending on which file Next.js happened to resolve.
 *
 * It never says "you don't have permission". NONE resolves to 404, not 403
 * (00-foundation.md §6.1) — telling a stranger that a document exists but is not theirs turns
 * a guessed id into an oracle.
 */
export default function DocumentsNotFound() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-balance text-muted-foreground">
        This page may have been deleted, or you may not have access to it.
      </p>
      <Button asChild variant="outline" className="mt-6">
        <Link href="/documents">← Back to documents</Link>
      </Button>
    </div>
  );
}

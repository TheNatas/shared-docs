"use client";

import type { MouseEvent, ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * The sticky top strip of 04-ui-spec.md §6.1 — back link on the left, save status and the
 * owner-only actions on the right. The brand and the user menu live one row above, in
 * `app/documents/layout.tsx`'s `AppHeader`, which scrolls away; this strip stays.
 */
export function EditorHeader({
  onBeforeLeave,
  status,
  ownerActions,
}: {
  /**
   * Awaited before navigating away via the back link. This is the in-app half of the
   * route-change flush (04-ui-spec.md §7.3): the App Router has no reliable global
   * navigation hook, so the two exits we own intercept themselves and the unmount flush
   * backs them up.
   */
  onBeforeLeave?: () => Promise<void>;
  /** `SaveStatus` — omitted entirely for a VIEWER, who has nothing to save. */
  status?: ReactNode;
  /** Owner-only controls. Never rendered for an EDITOR or a VIEWER. */
  ownerActions?: ReactNode;
}) {
  const router = useRouter();

  function handleBack(event: MouseEvent<HTMLAnchorElement>) {
    // Let the browser own modified clicks — a ⌘-click opens a new tab and the current one,
    // with its unsaved edits, is not going anywhere.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    event.preventDefault();
    void (async () => {
      await onBeforeLeave?.();
      router.push("/documents");
    })();
  }

  return (
    <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
      <div className="flex h-12 items-center justify-between gap-3 px-4">
        <Link
          href="/documents"
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Documents
        </Link>

        <div className="flex items-center gap-2">
          {status}
          {ownerActions}
        </div>
      </div>
    </div>
  );
}

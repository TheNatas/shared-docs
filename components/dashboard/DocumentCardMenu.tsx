"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DeleteDocumentResponse } from "@/lib/api-types";
import { apiFetch } from "@/lib/client";

/**
 * The `⋯` overflow on an **owned** dashboard card: Delete, behind a confirm (04-ui-spec.md
 * §5.3). Rendered only for owners — the endpoint's 403 for an EDITOR is the real guard, this
 * is just the affordance.
 *
 * There is no `alert-dialog` primitive installed, so the confirm is an AlertDialog-*shaped*
 * `Dialog`: `role="alertdialog"`, no dismissal while the request is in flight.
 */
export function DocumentCardMenu({
  documentId,
  title,
  className,
}: {
  documentId: string;
  title: string;
  className?: string;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [, startRefresh] = useTransition();

  async function remove() {
    setDeleting(true);
    try {
      // 200 with a body, not 204 — apiFetch calls res.json() unconditionally.
      await apiFetch<DeleteDocumentResponse>(`/api/documents/${documentId}`, {
        method: "DELETE",
      });

      setConfirmOpen(false);
      toast.success("Document deleted.");
      // The dashboard is a Server Component reading Prisma directly, so the row disappears
      // only when the server re-renders. `deleting` stays true on purpose: the card is on its
      // way out, and re-arming Delete for the length of the refresh invites a second call
      // against an id that no longer exists.
      startRefresh(() => router.refresh());
    } catch {
      toast.error("Couldn't delete the document.");
      setDeleting(false);
    }
  }

  return (
    // The card places this over its <Link> (04-ui-spec.md §5.2), so positioning is the card's
    // business, not this component's. What is this component's business is swallowing the
    // click: React propagates portalled events through the component tree, so without this a
    // click on Cancel or on a menu item would still reach an ancestor link and navigate.
    <div
      className={className}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${title}`}>
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              // Radix hands focus back to the ⋯ trigger as the menu closes. Opening the
              // dialog in the same tick makes the two fight over it and the dialog can end up
              // open but unfocused, so it waits for the menu to finish.
              setTimeout(() => setConfirmOpen(true), 0);
            }}
          >
            <Trash2 aria-hidden="true" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={confirmOpen}
        onOpenChange={(next) => {
          // Escape and the overlay stop working once the DELETE is in flight — closing the
          // confirm would leave the outcome with nowhere to be reported.
          if (!deleting) setConfirmOpen(next);
        }}
      >
        <DialogContent role="alertdialog" showCloseButton={!deleting}>
          <DialogHeader>
            <DialogTitle>Delete “{title}”?</DialogTitle>
            <DialogDescription>This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={deleting} onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={deleting} onClick={() => void remove()}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

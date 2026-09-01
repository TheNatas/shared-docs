"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Share2 } from "lucide-react";
import { toast } from "sonner";

import type {
  DeleteShareResponse,
  DocumentDetail,
  ListSharesResponse,
  ShareEntry,
  ShareRole,
  UpdateShareResponse,
} from "@/lib/api-types";
import { apiFetch } from "@/lib/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ShareInviteForm } from "@/components/share/ShareInviteForm";
import { OwnerRow, ShareRow } from "@/components/share/ShareRow";

/**
 * The share dialog and its trigger (`specs/04-ui-spec.md` §8). Mount it unconditionally from
 * the editor header — it decides for itself whether it should exist.
 *
 * `doc.shares` is the ownership signal: `null` for a non-owner, **never** `[]`
 * (`04-ui-spec.md` §1.1), so "I may not see the recipient list" is distinguishable from "there
 * are none". Hiding the trigger is UX; the owner-only `403` on every share route is the
 * control (`03-auth-and-permissions.md`).
 *
 * The gate is its own component so the hook-bearing body below can never mount with one hook
 * count and re-render with another.
 */
export function ShareDialog({ doc }: { doc: DocumentDetail }) {
  if (doc.shares === null) return null;
  return <OwnerShareDialog doc={doc} initialShares={doc.shares} />;
}

function OwnerShareDialog({
  doc,
  initialShares,
}: {
  doc: DocumentDetail;
  initialShares: ShareEntry[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<ShareEntry[]>(initialShares);
  // `router.refresh()` re-renders the whole route to make the dashboard's `shareCount`
  // current, so it fires on close only when something actually changed.
  const changed = useRef(false);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    // The server payload already seeded the list; this catches what a second tab did since.
    // A failed refresh keeps the seeded rows — emptying a list that is probably right is worse
    // than showing it slightly stale.
    apiFetch<ListSharesResponse>(`/api/documents/${doc.id}/shares`, { signal: controller.signal })
      .then((res) => setShares(res.shares))
      .catch(() => undefined);

    return () => controller.abort();
  }, [open, doc.id]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next && changed.current) {
      changed.current = false;
      router.refresh();
    }
  }

  /**
   * `POST .../shares` is an **upsert** (`00-foundation.md` §6 rule 4), so re-inviting an
   * existing collaborator must land on their existing row. Appending unconditionally is
   * exactly how the same person shows up twice with two different roles.
   */
  function upsertShare(entry: ShareEntry) {
    setShares((rows) =>
      rows.some((row) => row.userId === entry.userId)
        ? rows.map((row) => (row.userId === entry.userId ? entry : row))
        : [...rows, entry],
    );
    changed.current = true;
  }

  async function changeRole(userId: string, role: ShareRole) {
    const previousRole = shares.find((row) => row.userId === userId)?.role;

    // Optimistic: a role change is cheap to undo and the select should not lag behind the
    // pointer (§8.4).
    setShares((rows) => rows.map((row) => (row.userId === userId ? { ...row, role } : row)));

    try {
      const { share } = await apiFetch<UpdateShareResponse>(
        `/api/documents/${doc.id}/shares/${encodeURIComponent(userId)}`,
        { method: "PATCH", body: JSON.stringify({ role }) },
      );
      setShares((rows) => rows.map((row) => (row.userId === userId ? share : row)));
      changed.current = true;
    } catch {
      // Roll back this row only. Rows act independently, so restoring a whole-array snapshot
      // would silently undo a change to a different row that landed meanwhile.
      if (previousRole) {
        setShares((rows) =>
          rows.map((row) => (row.userId === userId ? { ...row, role: previousRole } : row)),
        );
      }
      toast.error("Couldn't change the role.");
    }
  }

  /**
   * Removal is **not** optimistic: an incorrect optimistic removal reads as data loss. The
   * `DELETE` is idempotent and always `200`, so a double-click is a second success rather than
   * an error toast (`02-api-contract.md` §7.11).
   */
  async function removeShare(share: ShareEntry) {
    try {
      const res = await apiFetch<DeleteShareResponse>(
        `/api/documents/${doc.id}/shares/${encodeURIComponent(share.userId)}`,
        { method: "DELETE" },
      );
      setShares((rows) => rows.filter((row) => row.userId !== res.userId));
      changed.current = true;
    } catch {
      toast.error(`Couldn't remove ${share.user.name}.`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Share2 aria-hidden="true" />
          Share
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share &ldquo;{doc.title}&rdquo;</DialogTitle>
          <DialogDescription>
            Invite people by email address, then choose whether they can view or edit.
          </DialogDescription>
        </DialogHeader>

        <ShareInviteForm documentId={doc.id} shares={shares} onShared={upsertShare} />

        <Separator />

        <section className="space-y-1">
          <h3 className="text-sm font-medium">People with access</h3>
          <ul className="divide-y">
            <OwnerRow owner={doc.owner} />
            {shares.map((share) => (
              <ShareRow
                key={share.userId}
                share={share}
                onRoleChange={(role) => changeRole(share.userId, role)}
                onRemove={() => removeShare(share)}
              />
            ))}
          </ul>
        </section>
      </DialogContent>
    </Dialog>
  );
}

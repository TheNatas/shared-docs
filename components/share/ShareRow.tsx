"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";

import type { ShareEntry, ShareRole, UserSummary } from "@/lib/api-types";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * The two rows of the "People with access" list (`specs/04-ui-spec.md` §8.4).
 *
 * They live in one file because they are one visual row with one difference: the owner has no
 * controls. Splitting them meant duplicating the avatar/identity block, which is the half a
 * reader actually compares between the two.
 */

/** `VIEWER` -> `Viewer`. The wire word is SCREAMING; nothing in the UI shows it raw. */
export const ROLE_LABEL: Record<ShareRole, string> = {
  VIEWER: "Viewer",
  EDITOR: "Editor",
};

/** 32px circle with the initial — decorative, so the name beside it is the accessible text. */
function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

function Identity({ user }: { user: UserSummary }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium">{user.name}</p>
      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
    </div>
  );
}

/**
 * The owner. Always first and always rendered — even with zero shares — so a document's
 * ownership is visible in the dialog that grants access to it (requirement C9).
 *
 * No `Select` and no remove button: ownership transfer is out of scope (`00-foundation.md` §4),
 * and `'OWNER'` is not in `ShareRole` at all, so there is nothing here to change it to.
 */
export function OwnerRow({ owner }: { owner: UserSummary }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <Avatar name={owner.name} />
      <Identity user={owner} />
      <span className="text-sm text-muted-foreground">Owner</span>
    </li>
  );
}

export type ShareRowProps = {
  share: ShareEntry;
  /** Optimistic in the parent: the row already shows `role` when this promise starts. */
  onRoleChange: (role: ShareRole) => Promise<void>;
  /** Deliberately NOT optimistic — this resolves only after the `200` (§8.4). */
  onRemove: () => Promise<void>;
};

export function ShareRow({ share, onRoleChange, onRemove }: ShareRowProps) {
  const [pending, setPending] = useState(false);

  // Busy state is per row, not per dialog: one collaborator's request must not freeze the
  // others. A `setPending(false)` that lands after a successful remove has unmounted the row
  // is a no-op in React 18+, so there is no mounted-ref dance here.
  async function run(action: () => Promise<void>) {
    setPending(true);
    try {
      await action();
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="flex items-center gap-3 py-2" aria-busy={pending}>
      <Avatar name={share.user.name} />
      <Identity user={share.user} />

      <Loader2
        aria-hidden="true"
        className={cn("size-3.5 animate-spin text-muted-foreground", !pending && "invisible")}
      />

      <Select
        value={share.role}
        disabled={pending}
        onValueChange={(next) => {
          // Radix hands back a bare string; narrow it rather than casting, so an added
          // <SelectItem> with a typo cannot reach the wire as a role.
          if (next !== "VIEWER" && next !== "EDITOR") return;
          if (next === share.role) return;
          void run(() => onRoleChange(next));
        }}
      >
        <SelectTrigger size="sm" className="w-28" aria-label={`Role for ${share.user.name}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="VIEWER">{ROLE_LABEL.VIEWER}</SelectItem>
          <SelectItem value="EDITOR">{ROLE_LABEL.EDITOR}</SelectItem>
        </SelectContent>
      </Select>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={pending}
        aria-label={`Remove ${share.user.name}`}
        onClick={() => void run(onRemove)}
      >
        <X aria-hidden="true" />
      </Button>
    </li>
  );
}

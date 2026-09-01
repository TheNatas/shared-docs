"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, CircleSmall, LoaderCircle, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SaveErrorKind, SaveState } from "@/hooks/useAutosave";

/**
 * The save-status indicator of `specs/04-ui-spec.md` §6.6, which in its `conflict` state is
 * also the inline amber banner of §6.9 — the status area expands in place. There is no
 * `ConflictDialog`: `DECISIONS.md` D002 replaced the modal, and Reload is the only action.
 *
 * Hidden entirely for a VIEWER (§6.8): nothing they do can make a document dirty.
 */

export interface SaveStatusProps {
  state: SaveState;
  lastSavedAt?: Date | null;
  errorMessage?: string | null;
  errorKind?: SaveErrorKind | null;
  /** `Retry` — re-sends the pending patch. */
  onRetry?: () => void;
  /** `Reload` — refetches the document and hands it to `autosave.resolveConflict()`. */
  onReload?: () => void;
  /** True while the Reload fetch is in flight. */
  reloading?: boolean;
  className?: string;
}

/** Copy shown when the hook has no more specific message (§6.6). */
const GENERIC_ERROR = "Couldn't save";

/** Below this, the indicator reads a bare `Saved` rather than a relative time (§6.6). */
const JUST_SAVED_MS = 5_000;
const TICK_MS = 30_000;

/**
 * `Saved` → `Saved just now` → `Saved 2 min ago`. Deliberately not `lib/format.ts`'s
 * `formatRelativeTime`: that one is documented as server-render-only (its output depends on
 * the wall clock) and speaks `Intl`'s register — "now", "2 minutes ago" — where §6.6 pins
 * this control's copy to "just now" and "2 min ago".
 */
function savedLabel(lastSavedAt: Date | null, now: number): string {
  if (!lastSavedAt) return "Saved";

  const elapsed = now - lastSavedAt.getTime();
  if (elapsed < JUST_SAVED_MS) return "Saved";
  if (elapsed < 60_000) return "Saved just now";

  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `Saved ${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  return `Saved ${hours} h ago`;
}

export function SaveStatus({
  state,
  lastSavedAt = null,
  errorMessage = null,
  errorKind = null,
  onRetry,
  onReload,
  reloading = false,
  className,
}: SaveStatusProps) {
  // The relative label is derived from a clock read AFTER mount, never during a server
  // render, so there is nothing for hydration to mismatch on.
  const [now, setNow] = useState(() => lastSavedAt?.getTime() ?? 0);

  useEffect(() => {
    if (state !== "saved" || !lastSavedAt) return;

    setNow(Date.now());
    // One shot at the 5 s boundary so `Saved` becomes `Saved just now` on time, then the
    // 30 s tick §6.6 asks for — a minute-granularity label does not need a faster clock.
    const boundary = setTimeout(() => setNow(Date.now()), JUST_SAVED_MS);
    const tick = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => {
      clearTimeout(boundary);
      clearInterval(tick);
    };
  }, [state, lastSavedAt]);

  if (state === "conflict") {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-sm text-amber-900",
          className,
        )}
      >
        <TriangleAlert className="size-4 shrink-0 text-amber-600" aria-hidden="true" />
        {/* Exact copy, one sentence, and no dismiss control: a dismissible warning about
            unsaved work is a warning you can lose (§6.9 point 2). */}
        <span className="flex-1">This document changed elsewhere.</span>
        <Button size="sm" variant="outline" onClick={onReload} disabled={reloading}>
          {reloading ? "Reloading…" : "Reload"}
        </Button>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex items-center gap-1.5 text-sm text-muted-foreground", className)}
    >
      {state === "idle" && (
        <>
          <Check className="size-3.5" aria-hidden="true" />
          <span>Saved</span>
        </>
      )}

      {state === "dirty" && (
        <>
          <CircleSmall className="size-3.5 fill-current" aria-hidden="true" />
          <span>Unsaved changes</span>
        </>
      )}

      {state === "saving" && (
        <>
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
          <span>Saving…</span>
        </>
      )}

      {state === "saved" && (
        <>
          <Check className="size-3.5 text-foreground" aria-hidden="true" />
          <span className="text-foreground">{savedLabel(lastSavedAt, now)}</span>
        </>
      )}

      {state === "error" && (
        <>
          <TriangleAlert className="size-3.5 text-destructive" aria-hidden="true" />
          <span className="text-destructive">{errorMessage ?? GENERIC_ERROR}</span>
          {/* A 403 has nothing to retry and a 404 has nothing to save into, so each failure
              offers the one recovery that exists for it (§6.6 transition table). */}
          {errorKind !== "forbidden" && errorKind !== "gone" && (
            <Button variant="link" size="sm" aria-label="Retry saving" onClick={onRetry}>
              Retry
            </Button>
          )}
          {errorKind === "gone" && (
            <Link href="/documents" className="underline underline-offset-4">
              Back to documents
            </Link>
          )}
        </>
      )}
    </div>
  );
}

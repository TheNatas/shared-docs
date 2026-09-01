"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/react";

import type { DocumentDetail, PatchDocumentResponse } from "@/lib/api-types";
import { apiFetch, isApiClientError } from "@/lib/client";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";

/**
 * The save state machine of `specs/04-ui-spec.md` §6.6 and the optimistic-concurrency client
 * of §7.3, in the reduced form ruled by `DECISIONS.md` D002.
 *
 * The claim this defends is "last write wins, but never silently". Three things make it true
 * and none of them is optional:
 *
 *  1. `lastKnownUpdatedAt` rides on every PATCH and is advanced ONLY from a 200 body (or from
 *     an explicit conflict reload). Never from `Date.now()`, never optimistically.
 *  2. At most one PATCH per document is in flight — see `save()`. This is the whole mitigation
 *     for risk R4: without it a single user editing for two minutes 409s against themselves,
 *     and the server's 409 turns from a correctness feature into a bug.
 *  3. A 409 suspends autosave and parks in `conflict` until the caller reloads, so we never
 *     overwrite the other person's work by accident.
 *
 * What D002 cut is the request-MERGING queue — `queue()` folding into a pending in-flight
 * request and awaiting its turn. Rule 2 above is the in-flight GUARD, which is a different
 * thing: skip if in flight, re-fire once on completion if still dirty. Conflating them
 * reintroduces exactly the bug D002 exists to prevent.
 */

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";

/**
 * How the `error` state can be recovered from. The `error` copy differs per cause
 * (§6.6 transition table) and so does the affordance next to it: a 403 has nothing to retry
 * and a 404 has nothing to save into.
 */
export type SaveErrorKind = "retryable" | "forbidden" | "gone";

export interface AutosavePatch {
  title?: string;
  content?: JSONContent;
}

export interface UseAutosaveOptions {
  documentId: string;
  /** `doc.updatedAt` from the server render — seeds the concurrency token. */
  initialUpdatedAt: string;
  /** false for VIEWER: `queue()` and `flush()` become no-ops. */
  enabled: boolean;
  debounceMs?: number;
  maxWaitMs?: number;
  /** Called on 409 so the page can flip the conflict banner on (§6.9) — no dialog. */
  onConflict?: () => void;
  /**
   * Called on 403 so the page can `editor.setEditable(false)`. Additive to the §7.2
   * signature and optional: the hook owns no editor instance, and the T18 DoD requires the
   * canvas to go read-only when edit access is revoked mid-session.
   */
  onForbidden?: () => void;
}

export interface UseAutosaveResult {
  state: SaveState;
  lastSavedAt: Date | null;
  /** User-facing message for the `error` state. */
  errorMessage: string | null;
  /**
   * Which recovery `SaveStatus` should offer. Null unless `state === 'error'`. Additive to
   * the §7.2 signature: the three error causes have three different recoveries and one
   * message string cannot carry that.
   */
  errorKind: SaveErrorKind | null;
  /**
   * Merge a partial change into the pending patch; marks dirty and (re)arms the timer.
   * If a PATCH is already in flight it only marks dirty — it never queues a second request.
   */
  queue: (patch: AutosavePatch) => void;
  /** Cancel the timer and save now; resolves when the request settles. */
  flush: () => Promise<void>;
  /** Re-send the pending patch after an `error`. */
  retry: () => Promise<void>;
  /** Adopt a freshly fetched document, clearing the conflict (the `Reload` button, §6.9). */
  resolveConflict: (fresh: Pick<DocumentDetail, "title" | "content" | "updatedAt">) => void;
}

/** §6.6's copy for the three ways a save can fail. */
const GENERIC_ERROR = "Couldn't save";
const FORBIDDEN_ERROR = "You no longer have edit access.";
const GONE_ERROR = "This document no longer exists.";

export function useAutosave({
  documentId,
  initialUpdatedAt,
  enabled,
  debounceMs = 800,
  maxWaitMs = 5000,
  onConflict,
  onForbidden,
}: UseAutosaveOptions): UseAutosaveResult {
  const [state, setStateValue] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<SaveErrorKind | null>(null);

  // §7.3 rule 1: the token is a ref, NEVER state. A render is not the right trigger for it,
  // and a stale closure over a state value would send an outdated token and produce a
  // phantom 409 against nobody.
  const tokenRef = useRef(initialUpdatedAt);

  // §7.3 rule 4: title and content share ONE pending patch, and therefore one request.
  const pendingRef = useRef<AutosavePatch | null>(null);
  /** Changes exist that have not been handed to a request yet. */
  const dirtyRef = useRef(false);
  /**
   * The in-flight guard (§7.2). It holds the promise rather than a bare boolean only so that
   * `flush()` can await the request it declined to duplicate; every read of it is a
   * "is one in flight?" test.
   */
  const inFlightRef = useRef<Promise<void> | null>(null);

  // Everything the async paths read goes through a ref, so the returned callbacks keep a
  // stable identity across renders. TipTap's `useEditor` captures `queue`/`flush` once, in a
  // closure it never rebuilds, so a callback that went stale would be a silent dead end.
  const stateRef = useRef<SaveState>("idle");
  const enabledRef = useRef(enabled);
  const onConflictRef = useRef(onConflict);
  const onForbiddenRef = useRef(onForbidden);
  useEffect(() => {
    enabledRef.current = enabled;
    onConflictRef.current = onConflict;
    onForbiddenRef.current = onForbidden;
  });

  const setState = useCallback((next: SaveState) => {
    stateRef.current = next;
    setStateValue(next);
  }, []);

  const fail = useCallback(
    (kind: SaveErrorKind, message: string) => {
      // The pending patch survives so `retry()` re-sends exactly what failed.
      dirtyRef.current = true;
      setErrorKind(kind);
      setErrorMessage(message);
      setState("error");
    },
    [setState],
  );

  const save = useCallback(async (): Promise<void> => {
    if (!enabledRef.current) return;
    // Autosave is suspended in `conflict` until `resolveConflict()` — §6.9 point 1.
    if (stateRef.current === "conflict") return;
    // §7.3 rule 3. Do not send, do not enqueue: the loop below re-fires if the document is
    // still dirty when the request settles. This branch is the R4 fix.
    if (inFlightRef.current) return;

    // One pass is one PATCH. A pass repeats only when the previous one came back 200 while an
    // edit had landed mid-flight — "re-fire once on completion if still dirty", written as a
    // loop rather than as the request-merging queue D002 cut. There is never a backlog: each
    // pass sends the single pending patch as it stands.
    while (pendingRef.current) {
      const patch = pendingRef.current;

      dirtyRef.current = false;
      setErrorKind(null);
      setErrorMessage(null);
      setState("saving");

      // Assigned before this scope reaches an `await`, so two callers can never both get
      // past the guard above.
      const request = (async () => {
        try {
          const res = await apiFetch<PatchDocumentResponse>(`/api/documents/${documentId}`, {
            method: "PATCH",
            body: JSON.stringify({ ...patch, lastKnownUpdatedAt: tokenRef.current }),
          });

          tokenRef.current = res.updatedAt; // §7.3 rule 2 — the only advance on a normal path.
          setLastSavedAt(new Date());

          if (dirtyRef.current) {
            // An edit landed mid-flight; the next pass sends it.
            setState("dirty");
          } else {
            pendingRef.current = null;
            setState("saved");
          }
        } catch (err) {
          if (!isApiClientError(err)) {
            fail("retryable", GENERIC_ERROR);
            return;
          }
          // Branch on the code, never the message (`lib/client.ts`).
          switch (err.code) {
            case "CONFLICT":
              // The token stays where it is: our copy is genuinely behind the server's.
              setErrorKind(null);
              setErrorMessage(null);
              setState("conflict");
              onConflictRef.current?.();
              break;
            case "FORBIDDEN":
              fail("forbidden", FORBIDDEN_ERROR);
              onForbiddenRef.current?.();
              break;
            case "NOT_FOUND":
              fail("gone", GONE_ERROR);
              break;
            default:
              fail("retryable", GENERIC_ERROR);
          }
        }
      })();

      inFlightRef.current = request;
      try {
        await request;
      } finally {
        inFlightRef.current = null;
      }

      // Only a clean 200 that left the document dirty re-fires. `error` waits for `retry()`
      // or the next keystroke, and `conflict` waits for Reload — neither loops.
      if (stateRef.current !== "dirty" || !dirtyRef.current) return;
    }
  }, [documentId, fail, setState]);

  const debounced = useDebouncedCallback(() => void save(), {
    delayMs: debounceMs,
    maxWaitMs,
  });

  const queue = useCallback(
    (patch: AutosavePatch) => {
      if (!enabledRef.current) return; // VIEWER
      if (stateRef.current === "conflict") return; // suspended until Reload

      pendingRef.current = { ...pendingRef.current, ...patch };
      dirtyRef.current = true;
      setState("dirty");

      // While a PATCH is in flight, marking dirty IS the whole of `queue()` — no second
      // request, no backlog (§7.2, the in-flight guard).
      if (!inFlightRef.current) debounced();
    },
    [debounced, setState],
  );

  const flush = useCallback(async () => {
    if (!enabledRef.current) return;
    debounced.cancel();
    // Drain rather than duplicate: a request already in flight (plus the single re-fire it
    // may chain) is the save this flush was asking for.
    while (inFlightRef.current) await inFlightRef.current;
    await save();
  }, [debounced, save]);

  const retry = useCallback(async () => {
    if (stateRef.current !== "error") return;
    debounced.cancel();
    await save();
  }, [debounced, save]);

  const resolveConflict = useCallback(
    (fresh: Pick<DocumentDetail, "title" | "content" | "updatedAt">) => {
      debounced.cancel();
      // The second and last place the token may be advanced (§7.3): the caller has just
      // replaced the canvas and the title with this document.
      tokenRef.current = fresh.updatedAt;
      pendingRef.current = null;
      dirtyRef.current = false;
      setErrorKind(null);
      setErrorMessage(null);
      setLastSavedAt(new Date(fresh.updatedAt));
      setState("saved");
    },
    [debounced, setState],
  );

  // §6.6: warn on a hard tab close while something is unsaved. Registered only in the two
  // states where that is true, so an idle document never shows the browser's dialog.
  useEffect(() => {
    if (!enabled) return;
    if (state !== "dirty" && state !== "saving") return;

    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [enabled, state]);

  return { state, lastSavedAt, errorMessage, errorKind, queue, flush, retry, resolveConflict };
}

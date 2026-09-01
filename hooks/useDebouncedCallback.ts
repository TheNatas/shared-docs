"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

/**
 * A debounce with a max-wait ceiling (`specs/04-ui-spec.md` §3, §7.1).
 *
 * The ceiling is the reason this is not three lines of `setTimeout`: a plain debounce defers
 * forever under continuous input, and a continuous typist never pauses for the 800 ms the
 * autosave debounce waits on. `maxWaitMs` starts at the FIRST call of a burst and is never
 * restarted, so at most that much typing can go unsaved.
 */

export interface UseDebouncedCallbackOptions {
  /** Quiet period after the most recent call before the callback runs. */
  delayMs: number;
  /** Hard ceiling measured from the first call of a burst. Omit to disable the cap. */
  maxWaitMs?: number;
}

export interface DebouncedCallback<Args extends unknown[]> {
  (...args: Args): void;
  /** Run the pending call now. No-op when nothing is pending. */
  flush: () => void;
  /** Drop the pending call and both timers. */
  cancel: () => void;
  isPending: () => boolean;
}

export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  { delayMs, maxWaitMs }: UseDebouncedCallbackOptions,
): DebouncedCallback<Args> {
  // Callers pass an inline arrow, so `callback` is a new function on every render. Reading it
  // through a ref keeps the returned function's identity stable — which matters because the
  // editor captures `queue`/`flush` once, in TipTap's `useEditor` closure — while still
  // invoking the newest closure rather than a stale one.
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const argsRef = useRef<Args | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (maxTimerRef.current !== null) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    argsRef.current = null;
  }, []);

  const invoke = useCallback(() => {
    const args = argsRef.current;
    // Clear first: the callback may schedule the next burst, and it must not be cancelled
    // by our own bookkeeping running after it.
    cancel();
    if (args) callbackRef.current(...args);
  }, [cancel]);

  // A timer that survives unmount would fire into a torn-down tree. The route-change /
  // unmount flush was cut (`10-task-graph.md` §7 item 5), so the pending call is dropped,
  // not sent — blur already flushed the realistic case.
  useEffect(() => cancel, [cancel]);

  return useMemo(() => {
    const debounced = (...args: Args) => {
      argsRef.current = args;

      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(invoke, delayMs);

      if (maxWaitMs !== undefined && maxTimerRef.current === null) {
        maxTimerRef.current = setTimeout(invoke, maxWaitMs);
      }
    };

    debounced.flush = () => {
      if (argsRef.current) invoke();
    };
    debounced.cancel = cancel;
    debounced.isPending = () => argsRef.current !== null;

    return debounced as DebouncedCallback<Args>;
  }, [cancel, delayMs, invoke, maxWaitMs]);
}

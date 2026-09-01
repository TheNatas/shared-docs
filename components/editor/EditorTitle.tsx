"use client";

import { useRef, type KeyboardEvent } from "react";

/** Never persist `""` — `patchDocumentSchema.title` is `min(1)` and would 400. */
export const UNTITLED_DOCUMENT = "Untitled document";

export interface EditorTitleProps {
  value: string;
  /** false for a VIEWER: a static <h1> instead of an input (04-ui-spec.md §6.8). */
  editable: boolean;
  /** Every keystroke. The caller updates its state AND queues the autosave patch. */
  onChange: (next: string) => void;
  /** Blur or Enter — the caller flushes. Receives the normalised value. */
  onCommit: (final: string) => void;
  /** Enter only: move the caret into the canvas. */
  onEnter?: () => void;
}

/**
 * Inline rename (C2), 04-ui-spec.md §6.4.
 *
 * The value is owned by `DocumentEditor`, not by this component, because a conflict reload
 * has to replace the title from outside — a local `useState` seeded from props would keep
 * showing the stale title after the server's copy arrived.
 *
 * The `<h1>` wrapper is present in both modes so the page keeps exactly one level-1 heading
 * in its outline (04-ui-spec.md §10); the input inside it carries the accessible name.
 */
export function EditorTitle({ value, editable, onChange, onCommit, onEnter }: EditorTitleProps) {
  // The value to restore on Escape, stashed when the field takes focus.
  const stashed = useRef(value);
  // Escape blurs to leave the field, but that blur must not commit.
  const reverting = useRef(false);

  if (!editable) {
    return <h1 className="px-2 py-1 text-3xl font-semibold tracking-tight">{value}</h1>;
  }

  function commit(raw: string) {
    const final = raw.trim() === "" ? UNTITLED_DOCUMENT : raw.trim();
    // Re-queue only when normalisation actually changed something, so a plain blur on an
    // untouched title does not mark the document dirty.
    if (final !== raw) onChange(final);
    onCommit(final);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur(); // same commit path as a click-away
      onEnter?.();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      reverting.current = true;
      // Re-queueing the stashed title rather than cancelling the pending patch: `useAutosave`
      // exposes no cancel (04-ui-spec.md §7.2), and a PATCH that writes the title back to what
      // it already was is harmless. What matters is that the typed value never reaches the row.
      onChange(stashed.current);
      event.currentTarget.blur();
    }
  }

  return (
    <h1>
      <input
        value={value}
        aria-label="Document title"
        placeholder={UNTITLED_DOCUMENT}
        maxLength={200}
        spellCheck={false}
        className="w-full rounded-md bg-transparent px-2 py-1 text-3xl font-semibold tracking-tight outline-none transition-colors hover:bg-muted/50 focus:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
        onFocus={() => {
          stashed.current = value;
        }}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          if (reverting.current) {
            reverting.current = false;
            return;
          }
          commit(event.target.value);
        }}
      />
    </h1>
  );
}

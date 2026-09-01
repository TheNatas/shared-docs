"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

export interface ToolbarButtonProps {
  /** Becomes both the `aria-label` and the tooltip text (04-ui-spec.md §6.5). */
  label: string;
  /** e.g. "⌘/Ctrl+B" — appended to the tooltip as "Bold (⌘/Ctrl+B)". */
  shortcut?: string;
  /**
   * Toggle state. **Left `undefined` for Undo/Redo**, which are actions rather than toggles:
   * React then omits `aria-pressed` entirely, instead of announcing "not pressed" about a
   * button that has no pressed state to be in.
   */
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  /** A lucide icon. Always `aria-hidden` — the button's label carries the meaning. */
  children: ReactNode;
}

export function ToolbarButton({
  label,
  shortcut,
  active,
  disabled,
  onClick,
  children,
}: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
      data-active={active}
      disabled={disabled}
      // Mousedown inside the toolbar would blur the canvas and collapse the selection before
      // the click ever lands, so `toggleBold` would run against an empty range and do nothing
      // visible. Preventing the default keeps the selection where the user put it.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      // Active state is exposed twice on purpose (04-ui-spec.md §10): colour for sighted
      // users, `aria-pressed` for everyone else. Never colour alone.
      className="data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
    >
      {children}
    </Button>
  );
}

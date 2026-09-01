"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** The four block types the schema allows — headings are capped at 3 in lib/editor-extensions.ts. */
export type BlockType = "paragraph" | "h1" | "h2" | "h3";

const OPTIONS: readonly { value: BlockType; label: string }[] = [
  { value: "paragraph", label: "Paragraph" },
  { value: "h1", label: "Heading 1" },
  { value: "h2", label: "Heading 2" },
  { value: "h3", label: "Heading 3" },
];

/**
 * One `Select` rather than four segmented buttons (04-ui-spec.md §6.5): 40px of toolbar
 * instead of 200px, and Radix supplies the keyboard handling and `aria-expanded` for free.
 * The trigger renders the option label ("Heading 2"), which is how "text size variation"
 * (C6) is visible at a glance rather than inferred from an icon.
 */
export function BlockTypeSelect({
  value,
  disabled,
  onChange,
}: {
  value: BlockType;
  disabled?: boolean;
  onChange: (next: BlockType) => void;
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => onChange(next as BlockType)}
    >
      {/* No `onMouseDown` preventDefault here, unlike ToolbarButton: Radix opens the menu on
          pointerdown, so suppressing it would make the control unopenable. ProseMirror keeps
          its selection while unfocused and every command chain starts with `.focus()`, so the
          caret survives the round trip through the menu anyway. */}
      <SelectTrigger size="sm" aria-label="Text style" className="w-[8.5rem]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

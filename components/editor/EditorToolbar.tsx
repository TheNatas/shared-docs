"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Redo2,
  Underline,
  Undo2,
} from "lucide-react";

import { BlockTypeSelect, type BlockType } from "@/components/editor/BlockTypeSelect";
import { ToolbarButton } from "@/components/editor/ToolbarButton";
import { Separator } from "@/components/ui/separator";

/**
 * The eight controls of 04-ui-spec.md §6.5, in order, with the two separators.
 *
 * Every shortcut named below ships with the extension list in lib/editor-extensions.ts and
 * works from inside the canvas — we register **no custom keymap**. The buttons are a mouse
 * affordance for shortcuts that already exist, not the mechanism.
 *
 * The `useEditorState` subscription lives here rather than in `DocumentEditor` (where
 * 04-ui-spec.md §6.3 sketches it), because its entire purpose is to keep the re-render local:
 * hoisting it to the editor root would re-render the root on every caret move, which is the
 * cost the hook exists to avoid. A VIEWER never mounts this component and so never pays for
 * the `editor.can()` evaluation at all.
 */
export function EditorToolbar({
  editor,
  controlsId,
}: {
  editor: Editor | null;
  /** id of the ProseMirror surface, for `aria-controls`. */
  controlsId: string;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold") ?? false,
      italic: e?.isActive("italic") ?? false,
      underline: e?.isActive("underline") ?? false,
      h1: e?.isActive("heading", { level: 1 }) ?? false,
      h2: e?.isActive("heading", { level: 2 }) ?? false,
      h3: e?.isActive("heading", { level: 3 }) ?? false,
      bullet: e?.isActive("bulletList") ?? false,
      ordered: e?.isActive("orderedList") ?? false,
      canUndo: e?.can().chain().focus().undo().run() ?? false,
      canRedo: e?.can().chain().focus().redo().run() ?? false,
    }),
  });

  // `immediatelyRender: false` means the editor is null for the first client render (and for
  // the whole server render). The strip still paints, disabled, so the canvas does not jump
  // down the page a frame later.
  const s = state ?? {
    bold: false,
    italic: false,
    underline: false,
    h1: false,
    h2: false,
    h3: false,
    bullet: false,
    ordered: false,
    canUndo: false,
    canRedo: false,
  };

  const blockType: BlockType = s.h1 ? "h1" : s.h2 ? "h2" : s.h3 ? "h3" : "paragraph";

  function setBlockType(next: BlockType) {
    if (!editor) return;
    const chain = editor.chain().focus();
    if (next === "paragraph") {
      chain.setParagraph().run();
      return;
    }
    chain.toggleHeading({ level: Number(next.slice(1)) as 1 | 2 | 3 }).run();
  }

  return (
    <div
      role="toolbar"
      aria-label="Text formatting"
      aria-controls={controlsId}
      // `top-12` is the height of the header strip above it: the two rows stack rather than
      // overlap when the page scrolls (04-ui-spec.md §6.2).
      className="sticky top-12 z-10 mt-4 flex items-center gap-0.5 border-y bg-background/95 px-4 py-1.5 backdrop-blur"
    >
      <ToolbarButton
        label="Bold"
        shortcut="⌘/Ctrl+B"
        active={s.bold}
        disabled={!editor}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      >
        <Bold aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        shortcut="⌘/Ctrl+I"
        active={s.italic}
        disabled={!editor}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      >
        <Italic aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Underline"
        shortcut="⌘/Ctrl+U"
        active={s.underline}
        disabled={!editor}
        onClick={() => editor?.chain().focus().toggleUnderline().run()}
      >
        <Underline aria-hidden="true" />
      </ToolbarButton>

      <Separator orientation="vertical" aria-hidden="true" className="mx-1 h-6" />

      <BlockTypeSelect value={blockType} disabled={!editor} onChange={setBlockType} />

      <Separator orientation="vertical" aria-hidden="true" className="mx-1 h-6" />

      <ToolbarButton
        label="Bulleted list"
        shortcut="⌘/Ctrl+Shift+8"
        active={s.bullet}
        disabled={!editor}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      >
        <List aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        shortcut="⌘/Ctrl+Shift+7"
        active={s.ordered}
        disabled={!editor}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered aria-hidden="true" />
      </ToolbarButton>

      <Separator orientation="vertical" aria-hidden="true" className="mx-1 h-6" />

      {/* Undo/Redo carry no `active` — they are actions, not toggles, so they expose
          `disabled` instead of `aria-pressed` (§6.5 rows 7–8). */}
      <ToolbarButton
        label="Undo"
        shortcut="⌘/Ctrl+Z"
        disabled={!s.canUndo}
        onClick={() => editor?.chain().focus().undo().run()}
      >
        <Undo2 aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Redo"
        shortcut="⌘/Ctrl+Shift+Z"
        disabled={!s.canRedo}
        onClick={() => editor?.chain().focus().redo().run()}
      >
        <Redo2 aria-hidden="true" />
      </ToolbarButton>
    </div>
  );
}

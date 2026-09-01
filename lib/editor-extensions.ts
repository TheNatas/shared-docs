import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";

/**
 * THE SINGLE SOURCE OF THE EDITOR SCHEMA.
 *
 * Both the client editor and the server-side importer build from this file. If they ever
 * build from different lists, an imported document can contain nodes the editor cannot
 * render, and the editor throws a RangeError at mount that points at TipTap rather than at
 * the import code — the subtlest bug available in this project
 * (specs/05-import-spec.md §3.3). Frozen by T03; do not define an extension array anywhere
 * else. A repo-wide grep for "StarterKit" should hit only this file and the spike script.
 *
 * `Underline` is deliberately absent: StarterKit v3 already registers it, and registering it
 * twice throws `Duplicate extension name` at editor init (specs/_toolchain-findings.md
 * TRAP-2). Verified empirically — StarterKit's extension list contains `underline`.
 *
 * The disabled set is the scope cut from 00-foundation.md §4: the brief asks for bold,
 * italic, underline, headings and lists. Everything else is surface area, and every node
 * type we allow is one the importer must also handle.
 */
export const schemaExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    codeBlock: false,
    code: false,
    blockquote: false,
    horizontalRule: false,
    strike: false,
    link: false,
  }),
];

/**
 * Client-only. Adds affordances that need a live editor view and contribute nothing to the
 * document schema — so the importer must NOT use this list.
 */
export const editorExtensions = [
  ...schemaExtensions,
  Placeholder.configure({ placeholder: "Start writing…" }),
];

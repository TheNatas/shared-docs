import { generateHTML, generateJSON } from "@tiptap/html/server";

import { schemaExtensions } from "@/lib/editor-extensions";
import type { PMDoc } from "@/lib/import/types";

/**
 * HTML → ProseMirror JSON, and the schema safety net.
 * specs/05-import-spec.md §3.7.
 *
 * `schemaExtensions` is imported, never rebuilt. If this module assembled an extension list
 * of its own, import could emit nodes the editor's schema does not know and
 * the failure would surface as `RangeError: Unknown node type: …` thrown by TipTap in the
 * browser at editor mount — a white screen on imported documents only, with a stack trace
 * pointing nowhere near the import code (§3.3).
 *
 * `@tiptap/html` resolves its `node` export condition here, so both functions run against
 * happy-dom on the server with no polyfill and no jsdom (specs/DECISIONS.md D007, Plan A).
 * The route is `runtime = 'nodejs'` for the same reason.
 */

/** Belt-and-braces only. See the note on `htmlToDoc` — this is NOT the security control. */
const SCRIPTISH = /<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;

/**
 * `marked` passes raw HTML in a Markdown file straight through, so the input here may
 * genuinely contain `<script>`, `<img onerror=…>` or a `javascript:` href.
 *
 * The regex below removes the obvious two, but regex HTML stripping is defeatable and we do
 * not rely on it. **The ProseMirror schema is the sanitizer**: `generateJSON` parses into the
 * schema built from `schemaExtensions`, which is an allow-list — a node with no matching
 * `parseHTML` rule is not representable, and an attribute no extension declares is not
 * carried over. `link` is disabled, so `href` has nowhere to go either. Adding DOMPurify on
 * top would be theatre against a threat the schema already erases (§7.2).
 */
export function htmlToDoc(html: string): PMDoc {
  const cleaned = html.replace(SCRIPTISH, "");
  return generateJSON(cleaned, schemaExtensions) as PMDoc;
}

/**
 * Proves the document can actually be loaded by an editor built from the SAME list. Throws
 * `RangeError` on an unknown node type, an unknown mark, or an attr no extension declares.
 *
 * This is what turns the §3.3 bug class from "white screen in production" into "422 at import
 * time", and it is mandatory on EVERY parser's output — `.txt` included, because `txtToDoc`
 * hand-builds its nodes and is therefore the path most able to invent an invalid one.
 *
 * ── Why `generateHTML` and not the specced `Node.fromJSON(getSchema(…), doc).check()` ──
 * `getSchema` lives in `@tiptap/core`, which pnpm's strict node_modules does not expose: it is
 * a transitive dependency of the starter kit, not a direct one, and package.json is frozen for
 * this task. `generateHTML` is the same operation reached through a package we already depend on —
 * its server build is literally `getHTMLFromFragment(Node.fromJSON(getSchema(extensions), doc),
 * schema)`, so the load is real and the throw is the real one.
 *
 * Known gap, stated rather than hidden: `Node.fromJSON` validates the node/mark/attr
 * vocabulary but not ProseMirror's content expressions, which the specced trailing `.check()`
 * would also cover. Closing it needs `@tiptap/core` as a direct dependency — reported as a
 * blocker rather than fixed here.
 */
export function assertLoadableByEditor(doc: PMDoc): void {
  generateHTML(doc, schemaExtensions);
}

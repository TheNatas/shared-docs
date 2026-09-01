import mammoth from "mammoth";
import { marked } from "marked";

import { htmlToDoc } from "@/lib/import/html-to-pm";
import type { PMDoc, PMNode } from "@/lib/import/types";

/**
 * One function per accepted format. specs/05-import-spec.md §3.4–§3.6.
 *
 * Two of the three go through HTML and therefore through the shared schema in
 * lib/editor-extensions.ts; `.txt` does not, which is why it is the format that could never
 * have been at risk from R1.
 */

/**
 * `.txt` → ProseMirror JSON with no HTML, no `marked` and no `generateJSON` anywhere in the
 * path.
 *
 * Blank lines separate paragraphs; a single newline inside a paragraph becomes a `hardBreak`,
 * which is the only way to preserve a line-broken address or a signature block in a schema
 * with no `preserveWhitespace`. CRLF is normalised first so a Windows file does not end every
 * line with a stray `\r` in the stored JSON.
 *
 * Empty blocks are filtered out rather than emitted: a `paragraph` with an empty `content`
 * array is not something every ProseMirror build accepts.
 */
export function txtToDoc(text: string): PMDoc {
  const normalised = text.replace(/\r\n?/g, "\n").replace(/\u0000/g, "");
  const blocks = normalised
    .split(/\n{2,}/)
    .map((block) => block.replace(/[ \t]+$/gm, "").trim())
    .filter((block) => block.length > 0);

  const content: PMNode[] = blocks.map((block) => {
    const lines = block.split("\n");
    const inline: PMNode[] = [];
    lines.forEach((line, i) => {
      if (i > 0) inline.push({ type: "hardBreak" });
      if (line.length > 0) inline.push({ type: "text", text: line });
    });
    return { type: "paragraph", content: inline };
  });

  return { type: "doc", content };
}

/**
 * `.md` → HTML → ProseMirror JSON.
 *
 * `async: false` pins the synchronous overload — `marked.parse` is typed
 * `string | Promise<string>` otherwise. `breaks: false` keeps Markdown's own semantics: a
 * single newline is a space, not a line break, which is the opposite of the `.txt` rule above
 * and is correct for both.
 *
 * Raw HTML in the Markdown passes through, which is deliberate: Markdown has no underline
 * syntax, so `<u>text</u>` is the only way a `.md` file can express requirement C5. It is also
 * harmless — see the sanitizer note on `htmlToDoc`.
 */
export function markdownToDoc(md: string): PMDoc {
  const html = marked.parse(md, { async: false, gfm: true, breaks: false });
  return htmlToDoc(html);
}

/**
 * `.docx` → HTML → ProseMirror JSON.
 *
 * Throws on a non-zip, corrupt or password-protected file; `parseUpload` maps that to
 * `422 PARSE_FAILED` with `reason: 'corrupt-docx'`.
 */
export async function docxToDoc(buffer: Buffer): Promise<PMDoc> {
  const { value: html } = await mammoth.convertToHtml(
    { buffer },
    // REQUIRED — see specs/DECISIONS.md D010. Do not remove as "unnecessary config".
    //
    // Mammoth's default style map DISCARDS underline entirely, silently: bold and italic
    // survive, underline vanishes, nothing errors and no test fails unless it asserts the
    // mark. Mammoth does it deliberately because Word documents often use underline as link
    // decoration — but our editor exposes Underline as a first-class control, so for us it is
    // semantic. Underline is requirement C5; without this line, importing a .docx loses every
    // underline and the import still returns 201.
    { styleMap: ["u => u"] },
  );
  return htmlToDoc(html);
}

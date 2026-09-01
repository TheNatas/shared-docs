import { describe, expect, it } from "vitest";

import { assertLoadableByEditor, htmlToDoc } from "@/lib/import/html-to-pm";
import type { PMDoc } from "@/lib/import/types";

/**
 * The R1 spike (specs/05-import-spec.md §5.2), promoted to a permanent test.
 *
 * It imports `htmlToDoc` and therefore the real `schemaExtensions`, never a copy-pasted
 * extension list — a test that built its own list would keep passing through exactly the
 * drift it exists to catch (§3.3).
 */

const SPIKE_HTML =
  "<h1>Title</h1>" +
  "<p><strong>bold</strong> <em>italic</em> <u>underline</u></p>" +
  "<ul><li>one</li><li>two</li></ul>" +
  "<ol><li>first</li></ol>";

function nodeTypes(node: unknown, acc = new Set<string>()): Set<string> {
  if (!node || typeof node !== "object") return acc;
  const n = node as { type?: string; marks?: { type: string }[]; content?: unknown[] };
  if (typeof n.type === "string") acc.add(n.type);
  for (const mark of n.marks ?? []) acc.add(`mark:${mark.type}`);
  for (const child of n.content ?? []) nodeTypes(child, acc);
  return acc;
}

describe("htmlToDoc", () => {
  it("runs on Node with no DOM polyfill and produces a doc node", () => {
    // R1's whole question. `@tiptap/html/server` is the explicit server entrypoint, so this
    // holds under CJS interop too — the package root only reaches the server build through
    // its `import`/`node` condition (specs/DECISIONS.md D007).
    const doc = htmlToDoc(SPIKE_HTML);
    expect(doc.type).toBe("doc");
  });

  it("produces every construct the editor's toolbar can create", () => {
    const types = nodeTypes(htmlToDoc(SPIKE_HTML));

    expect(types).toContain("heading");
    expect(types).toContain("bulletList");
    expect(types).toContain("orderedList");
    expect(types).toContain("listItem");
    expect(types).toContain("mark:bold");
    expect(types).toContain("mark:italic");
    // The one that could not be assumed: `Underline` appears in no extension array, because
    // the starter kit registers it and a second registration throws at editor init (TRAP-2).
    // This assertion is the proof that the bundled mark really is there.
    expect(types).toContain("mark:underline");
  });

  it("clamps headings to the three levels the schema allows", () => {
    const doc = htmlToDoc("<h1>a</h1><h2>b</h2><h3>c</h3>");
    const levels = doc.content
      .filter((node) => node.type === "heading")
      .map((node) => node.attrs?.level);

    expect(levels).toEqual([1, 2, 3]);
  });

  it("drops every construct outside the §3.2 table", () => {
    const types = nodeTypes(
      htmlToDoc(
        "<pre><code>code</code></pre>" +
          "<blockquote><p>quoted</p></blockquote>" +
          "<hr>" +
          "<table><tr><td>cell</td></tr></table>" +
          '<img src="x.png">' +
          "<p><s>struck</s> <a href=\"https://example.com\">linked</a></p>",
      ),
    );

    for (const forbidden of [
      "codeBlock",
      "blockquote",
      "horizontalRule",
      "table",
      "image",
      "mark:strike",
      "mark:link",
      "mark:code",
    ]) {
      expect(types).not.toContain(forbidden);
    }
  });

  it("is a sanitizer because the schema is an allow-list, not because of the regex", () => {
    const doc = htmlToDoc(
      "<p>before</p>" +
        "<script>alert(1)</script>" +
        '<img src=x onerror="alert(1)">' +
        '<a href="javascript:alert(1)">click</a>' +
        '<p style="color:red" onclick="alert(1)">after</p>',
    );
    const json = JSON.stringify(doc);

    // No node, no attribute, no href — none of them are representable in the schema.
    expect(json).not.toContain("script");
    expect(json).not.toContain("onerror");
    expect(json).not.toContain("onclick");
    expect(json).not.toContain("javascript:");
    expect(json).not.toContain("style");
    // …and the surrounding prose survives, so sanitising is not the same as discarding.
    expect(json).toContain("before");
    expect(json).toContain("after");
    // A link's text survives; only the href dies with the mark.
    expect(json).toContain("click");
  });
});

describe("assertLoadableByEditor", () => {
  it("accepts a document the parsers actually produce", () => {
    expect(() => assertLoadableByEditor(htmlToDoc(SPIKE_HTML))).not.toThrow();
  });

  it("throws for a node type the editor has disabled", () => {
    // This is the §3.3 bug class caught at import time. Without this check the same document
    // reaches the browser and throws `RangeError: Unknown node type: codeBlock` at editor
    // mount — a white screen whose stack trace points at TipTap, not at the importer.
    const doc: PMDoc = {
      type: "doc",
      content: [{ type: "codeBlock", content: [{ type: "text", text: "x" }] }],
    };

    expect(() => assertLoadableByEditor(doc)).toThrow(RangeError);
    expect(() => assertLoadableByEditor(doc)).toThrow(/codeBlock/);
  });

  it("throws for a mark the editor has disabled", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "strike" }] }] },
      ],
    } as unknown as PMDoc;

    expect(() => assertLoadableByEditor(doc)).toThrow(RangeError);
  });
});

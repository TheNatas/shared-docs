import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { assertLoadableByEditor } from "@/lib/import/html-to-pm";
import { docxToDoc, markdownToDoc, txtToDoc } from "@/lib/import/parsers";

/**
 * specs/05-import-spec.md §3.4–§3.6, against the committed fixtures in
 * tests/fixtures/import/ — the same files the reviewer-facing copies in samples/ came from.
 */

const FIXTURES = fileURLToPath(new URL("../../tests/fixtures/import/", import.meta.url));

function nodeTypes(node: unknown, acc = new Set<string>()): Set<string> {
  if (!node || typeof node !== "object") return acc;
  const n = node as { type?: string; marks?: { type: string }[]; content?: unknown[] };
  if (typeof n.type === "string") acc.add(n.type);
  for (const mark of n.marks ?? []) acc.add(`mark:${mark.type}`);
  for (const child of n.content ?? []) nodeTypes(child, acc);
  return acc;
}

describe("txtToDoc", () => {
  const text = readFileSync(`${FIXTURES}plain.txt`, "utf8");

  it("splits blank-line-separated blocks into paragraphs", () => {
    expect(txtToDoc(text).content.filter((n) => n.type === "paragraph")).toHaveLength(4);
  });

  it("turns an internal single newline into a hardBreak", () => {
    // The only way a schema with no `preserveWhitespace` keeps a signature block or an
    // address on separate lines.
    expect(nodeTypes(txtToDoc(text))).toContain("hardBreak");
  });

  it("normalises CRLF, so no carriage return reaches the database", () => {
    // The fixture is deliberately CRLF. A stray \r would survive every round trip and show
    // up as a rendering artefact months later.
    expect(JSON.stringify(txtToDoc(text))).not.toContain("\\r");
  });

  it("emits no paragraph with an empty content array", () => {
    // Some ProseMirror builds refuse one, and it would be invisible in the editor anyway.
    for (const node of txtToDoc("a\n\n\n\n\nb").content) {
      expect(node.content?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("produces a document the editor can load", () => {
    // The hand-built path, and therefore the one most able to invent an invalid node.
    expect(() => assertLoadableByEditor(txtToDoc(text))).not.toThrow();
  });

  it("never touches HTML, which is why .txt could not have been at risk from R1", () => {
    // Angle brackets in a plain-text file are characters, not markup: the .txt path goes
    // nowhere near `marked` or `generateJSON`.
    const doc = txtToDoc("<p>not markup</p>");

    expect(doc.content).toHaveLength(1);
    expect(doc.content[0].content?.[0]).toEqual({ type: "text", text: "<p>not markup</p>" });
  });
});

describe("markdownToDoc", () => {
  const md = readFileSync(`${FIXTURES}valid-all-constructs.md`, "utf8");
  const doc = markdownToDoc(md);
  const types = nodeTypes(doc);

  it("yields headings at all three allowed levels", () => {
    const levels = doc.content
      .filter((node) => node.type === "heading")
      .map((node) => node.attrs?.level);

    expect(levels).toEqual([1, 2, 3]);
  });

  it("yields bold, italic and underline", () => {
    expect(types).toContain("mark:bold");
    expect(types).toContain("mark:italic");
    // Markdown has no underline syntax — the fixture uses a raw <u> run, which `marked`
    // passes through and the schema then accepts as the mark.
    expect(types).toContain("mark:underline");
  });

  it("yields both list types", () => {
    expect(types).toContain("bulletList");
    expect(types).toContain("orderedList");
    expect(types).toContain("listItem");
  });

  it("drops the code block and the link mark, keeping the link text", () => {
    // The pinned lossy-by-design behaviour, and the security claim from §7.2 demonstrated
    // rather than asserted: schema filtering is what removes these, not a sanitizer library.
    expect(types).not.toContain("codeBlock");
    expect(types).not.toContain("mark:link");
    expect(JSON.stringify(doc)).toContain("a link");
  });

  it("emits nothing outside the §3.2 node and mark set", () => {
    const allowed = new Set([
      "doc",
      "paragraph",
      "heading",
      "bulletList",
      "orderedList",
      "listItem",
      "hardBreak",
      "text",
      "mark:bold",
      "mark:italic",
      "mark:underline",
    ]);

    expect([...types].filter((type) => !allowed.has(type))).toEqual([]);
  });

  it("produces a document the editor can load", () => {
    expect(() => assertLoadableByEditor(doc)).not.toThrow();
  });
});

describe("docxToDoc", () => {
  const buffer = readFileSync(`${FIXTURES}sample.docx`);

  it("preserves underline — the mark mammoth drops by default (D010)", async () => {
    // THE regression guard for specs/DECISIONS.md D010. Without the `styleMap: ['u => u']`
    // option in parsers.ts, mammoth silently discards every underline: bold and italic still
    // survive, the import still returns 201, and only this assertion fails. Underline is
    // requirement C5, so "silently" is the expensive word in that sentence.
    const types = nodeTypes(await docxToDoc(buffer));

    expect(types).toContain("mark:underline");
    expect(types).toContain("mark:bold");
    expect(types).toContain("mark:italic");
  });

  it("yields headings and a bulleted list", async () => {
    const doc = await docxToDoc(buffer);
    const types = nodeTypes(doc);

    expect(types).toContain("heading");
    expect(types).toContain("bulletList");
    expect(
      doc.content.filter((node) => node.type === "heading").map((node) => node.attrs?.level),
    ).toEqual([1, 2]);
  });

  it("produces a document the editor can load", async () => {
    const doc = await docxToDoc(buffer);
    expect(() => assertLoadableByEditor(doc)).not.toThrow();
  });

  it("rejects a file that is not a zip", async () => {
    // Truncating a real docx is enough; the caller maps this throw to 422 / corrupt-docx.
    await expect(docxToDoc(Buffer.from(buffer.subarray(0, 100)))).rejects.toThrow();
  });
});

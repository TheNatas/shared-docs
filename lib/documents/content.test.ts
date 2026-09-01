import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import {
  EMPTY_DOC,
  MAX_CONTENT_BYTES,
  contentByteSize,
  documentContentSchema,
  toDocumentContent,
} from "./content";

/** The shape every seeded body has: H1, styled paragraph, H2, list. */
const seededShape = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Q3 Product Roadmap" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "This document is " },
        { type: "text", text: "bold", marks: [{ type: "bold" }] },
        { type: "text", text: "italic", marks: [{ type: "italic" }] },
        { type: "text", text: "underline", marks: [{ type: "underline" }] },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "one" }] },
          ],
        },
      ],
    },
    {
      type: "orderedList",
      attrs: { start: 1 },
      content: [
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "step" }] },
          ],
        },
      ],
    },
  ],
};

/** The realistic bad writes: a client bug, a bad import, a hand edit in Studio. Each of
 *  them makes the editor unopenable on the next load, which is visible data loss. */
const BAD_WRITES: Prisma.JsonValue[] = [null, [], "doc", "text", 7, {}];

function nest(depth: number) {
  let node: Record<string, unknown> = {
    type: "paragraph",
    content: [{ type: "text", text: "bottom" }],
  };
  for (let i = 0; i < depth; i++) {
    node = { type: "paragraph", content: [node] };
  }
  return { type: "doc", content: [node] };
}

describe("documentContentSchema", () => {
  it("accepts the canonical empty document", () => {
    expect(documentContentSchema.safeParse(EMPTY_DOC).success).toBe(true);
  });

  it("accepts the shape every seeded document has", () => {
    expect(documentContentSchema.safeParse(seededShape).success).toBe(true);
  });

  it("rejects a root that is not a doc node", () => {
    expect(
      documentContentSchema.safeParse({ type: "paragraph", content: [] })
        .success,
    ).toBe(false);
    expect(documentContentSchema.safeParse({ type: "paragraph" }).success).toBe(
      false,
    );
  });

  it("rejects a root with no type", () => {
    expect(documentContentSchema.safeParse({ content: [] }).success).toBe(
      false,
    );
  });

  it.each(BAD_WRITES.map((v) => [JSON.stringify(v) ?? "undefined", v] as const))(
    "rejects %s",
    (_label, value) => {
      expect(documentContentSchema.safeParse(value).success).toBe(false);
    },
  );

  it("rejects a child with an empty type", () => {
    expect(
      documentContentSchema.safeParse({ type: "doc", content: [{ type: "" }] })
        .success,
    ).toBe(false);
  });

  // Policy, not oversight: a node-type allowlist would break the moment a TipTap extension
  // is added, and TipTap discards unknown nodes on load. We guard shape, not vocabulary.
  it("accepts an unknown child node type", () => {
    expect(
      documentContentSchema.safeParse({
        type: "doc",
        content: [{ type: "unknownFromTheFuture" }],
      }).success,
    ).toBe(true);
  });

  // There is no depth bound in the product, so this asserts the behaviour that exists
  // rather than one that does not. MAX_CONTENT_BYTES bounds the only thing that needs
  // bounding; see specs/06-test-plan.md §4.3 and specs/10-task-graph.md ruling 40.
  it("accepts a deeply nested chain — no depth bound exists", () => {
    expect(documentContentSchema.safeParse(nest(60)).success).toBe(true);
  });
});

describe("toDocumentContent", () => {
  it.each(BAD_WRITES.map((v) => [JSON.stringify(v) ?? "undefined", v] as const))(
    "degrades %s to EMPTY_DOC instead of throwing",
    (_label, value) => {
      expect(toDocumentContent(value)).toEqual(EMPTY_DOC);
    },
  );

  it("returns a valid stored body unchanged", () => {
    expect(toDocumentContent(seededShape)).toEqual(seededShape);
  });
});

describe("contentByteSize", () => {
  it("measures bytes, not UTF-16 code units", () => {
    // "é" is one JS character and two UTF-8 bytes. String.length would disagree, and bytes
    // are what the column and the request body actually cost.
    expect(contentByteSize("é")).toBe(JSON.stringify("é").length + 1);
  });

  it("puts a >1 MiB body over the ceiling", () => {
    const huge = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "a".repeat(1_100_000) }],
        },
      ],
    };
    // The shape is fine — it is the size that is not. The route turns this into
    // 413 CONTENT_TOO_LARGE; the schema has nothing to say about it.
    expect(documentContentSchema.safeParse(huge).success).toBe(true);
    expect(contentByteSize(huge)).toBeGreaterThan(MAX_CONTENT_BYTES);
  });

  it("leaves the empty document far under the ceiling", () => {
    expect(contentByteSize(EMPTY_DOC)).toBeLessThan(MAX_CONTENT_BYTES);
  });
});

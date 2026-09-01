import { z } from "zod";
import type { Prisma } from "@prisma/client";

/** Max serialised size of a document body. Guards the DB and the JSON parser. */
export const MAX_CONTENT_BYTES = 1_000_000; // 1 MB

/**
 * Minimal structural guard for a ProseMirror document node.
 *
 * The ROOT shape only. The authoritative document schema already exists — it is the TipTap
 * extension list in lib/editor-extensions.ts — and a Zod copy of it would be a second source
 * of truth whose failure mode is "valid documents rejected in production". ProseMirror
 * validates node and mark vocabulary on load anyway. What it cannot survive is a body that is
 * not a doc node at all (null, "text", [], {}, a bare paragraph), because that makes the
 * editor unopenable on the next load — visible data loss. That is what these ten lines catch.
 *
 * Consequences worth knowing before changing this: unknown child node types are ACCEPTED on
 * purpose (we guard shape, not vocabulary), and there is no depth bound anywhere in the
 * product — MAX_CONTENT_BYTES bounds the only thing that needs bounding.
 * See specs/01-data-and-persistence.md §5.2 and specs/06-test-plan.md §4.3.
 */
export const documentContentSchema = z.looseObject({
  type: z.literal("doc"),
  content: z.array(z.looseObject({ type: z.string().min(1) })).max(10_000),
});

export type DocumentContent = z.infer<typeof documentContentSchema>;

/** Canonical empty document. Used by POST /api/documents. */
export const EMPTY_DOC: DocumentContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

/**
 * Byte size of the serialised body, for the 413 check.
 * Buffer.byteLength, not String.length — the two differ on any non-ASCII document, and bytes
 * are what the column and the request body actually cost.
 */
export function contentByteSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
}

/**
 * Defensive READ path: a row written before this guard existed, or hand-edited in
 * Studio, must not white-screen the editor. Bad shape degrades to an empty doc.
 */
export function toDocumentContent(value: Prisma.JsonValue): DocumentContent {
  const parsed = documentContentSchema.safeParse(value);
  return parsed.success ? parsed.data : EMPTY_DOC;
}

/** Prisma's write type for a non-nullable Json column. */
export function toPrismaJson(content: DocumentContent): Prisma.InputJsonValue {
  return content as unknown as Prisma.InputJsonValue;
}

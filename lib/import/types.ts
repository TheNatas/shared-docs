import type { ApiErrorCode, ParseFailedReason } from "@/lib/api-types";
import type { DocumentContent } from "@/lib/documents/content";

/**
 * The parser's working types. specs/05-import-spec.md §4.
 *
 * These describe what a parser *produces*; lib/documents/content.ts owns what is *persisted*.
 * The two meet at `documentContentSchema.parse()` on the write path, which is the boundary
 * that matters (05-import-spec.md ruling 4). They are a producer type and a persisted type,
 * not two definitions of one thing.
 */

/** The only three marks in the schema (05-import-spec.md §3.2). */
export type PMMark = { type: "bold" | "italic" | "underline" };

export type PMNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: PMMark[];
};

export type PMDoc = { type: "doc"; content: PMNode[] };

/**
 * `content` is the *validated* shape, not the raw parser output: `parseUpload` runs
 * `documentContentSchema.parse()` as its last step, so the route can hand the result straight
 * to `toPrismaJson` without a second guard and without a throw outside the wrapper.
 */
export type ImportSuccess = {
  ok: true;
  title: string;
  sourceFilename: string;
  content: DocumentContent;
};

/**
 * `code` comes from the ONE registry in lib/api-types.ts — there is no bespoke
 * `ImportErrorCode` union (05-import-spec.md ruling 1). A route emitting a code outside
 * `ApiErrorCode` does not typecheck, which is what makes that guarantee free.
 */
export type ImportFailure = {
  ok: false;
  status: 400 | 413 | 415 | 422;
  code: ApiErrorCode;
  message: string;
  /** Only ever set for PARSE_FAILED, and then it is the discriminator for the four causes. */
  details?: { reason: ParseFailedReason };
};

export type ImportResult = ImportSuccess | ImportFailure;

import { ACCEPTED_EXTENSIONS } from "@/lib/import/constants";

/**
 * Filename → document title, and filename → stored provenance string.
 * specs/05-import-spec.md §8.
 *
 * Both functions are pure and neither throws: a filename is attacker-controlled text that
 * arrives on a multipart part header, so nothing here may assume it is well formed, and
 * nothing here ever treats it as a filesystem path.
 */

export const MAX_TITLE_LENGTH = 120;

/** Identical to Prisma's `@default` on Document.title, so an unusable filename produces a
 *  document indistinguishable from a freshly created one. */
export const FALLBACK_TITLE = "Untitled document";

/** `(\.md|\.txt|\.docx)$`, case-insensitive, built from the allowlist rather than retyped. */
const TRAILING_EXTENSION = new RegExp(
  `(${ACCEPTED_EXTENSIONS.map((ext) => `\\${ext}`).join("|")})$`,
  "i",
);

/**
 * "Q3 Report.docx"        -> "Q3 Report"
 * "a.b.c.md"              -> "a.b.c"      (the LAST extension only)
 * "notes.exe"             -> "notes.exe"  (not in the allowlist, so not stripped)
 * ".md"                   -> "Untitled document"
 * "C:\\Users\\a\\x.txt"   -> "x"
 * 400-char name           -> first 120 chars, trimmed
 *
 * Only allowlisted extensions are stripped. That is what makes `a.b.c.md` keep `.b.c` — a
 * generic "drop everything after the last dot" would mangle every filename with a version
 * number in it.
 */
export function titleFromFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "";
  const withoutExt = base.replace(TRAILING_EXTENSION, "");
  const cleaned = withoutExt
    // Control characters become spaces before the collapse, so "my\nnotes\t" -> "my notes"
    // rather than "mynotes" — and so a NUL cannot survive into a rendered title.
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length === 0) return FALLBACK_TITLE;

  return cleaned.length > MAX_TITLE_LENGTH
    ? cleaned.slice(0, MAX_TITLE_LENGTH).trimEnd()
    : cleaned;
}

/**
 * What lands in `Document.sourceFilename`. Display text only — never a link, never a path,
 * never a download, because there is no endpoint that serves the original bytes back
 * (05-import-spec.md §7.1). Control characters are stripped so the string cannot smuggle a
 * newline into a log line, and 255 is a length any UI can render.
 */
export function safeSourceFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "";
  return base.replace(/[\u0000-\u001F\u007F]/g, "").slice(0, 255);
}

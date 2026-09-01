/**
 * Import limits and the one user-facing sentence that states them.
 * specs/05-import-spec.md §2.
 *
 * Every number and every string a human reads about import lives here. The UI, the error
 * messages and the README all derive from these constants, so a change to the cap or to the
 * accepted set cannot leave one of the three saying something else.
 */

/**
 * 2 MB. Vercel caps a serverless request body around 4.5 MB, so this keeps the rejection a
 * clean 413 from our own code rather than an opaque platform error — and it bounds the
 * decompression window for `.docx`, which is a zip (05-import-spec.md §7.3).
 */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** The extension is authoritative. `.markdown`, `.doc`, `.rtf`, `.pdf` are all rejected. */
export const ACCEPTED_EXTENSIONS = [".md", ".txt", ".docx"] as const;

export type AcceptedExtension = (typeof ACCEPTED_EXTENSIONS)[number];

/** What each accepted extension maps to internally. */
export type ImportKind = "md" | "txt" | "docx";

export const EXTENSION_KIND: Record<AcceptedExtension, ImportKind> = {
  ".md": "md",
  ".txt": "txt",
  ".docx": "docx",
};

/**
 * "The browser has no idea" — always tolerated, for every extension. Firefox on Linux sends
 * `''` for Markdown; Windows without Office installed sends `application/octet-stream` for
 * `.docx`. Rejecting those would reject legitimate uploads (05-import-spec.md §2.1 rule 2).
 */
export const GENERIC_MIME_TYPES: readonly string[] = ["", "application/octet-stream"];

/**
 * MIME is corroborating, never a gate: we reject only a *positively wrong* type, such as
 * `image/png` on a `.docx`. Neither this nor the extension check is a security control — the
 * real defence is decoding and parsing the bytes (§3, §7).
 */
export const ACCEPTED_MIME_TYPES: Record<AcceptedExtension, readonly string[]> = {
  ".md": ["text/markdown", "text/x-markdown", "text/plain"],
  ".txt": ["text/plain"],
  ".docx": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip",
  ],
};

/**
 * THE canonical user-facing statement of import limits.
 * Must appear character-for-character in:
 *   - the dashboard Import control's helper text
 *   - README.md, under "## File import"
 *
 * The em dash is part of the string. If this changes, the README must change with it.
 */
export const IMPORT_LIMITS_COPY =
  "Supported files: .md, .txt, .docx — maximum 2 MB per file.";

/**
 * Derived, so the OS file picker can never advertise something the server rejects.
 * `accept` is a hint only — every picker lets the user switch to "All files" — which is why
 * the server-side checks in lib/import/validate.ts exist regardless.
 */
export const IMPORT_ACCEPT_ATTR = [
  ".md",
  ".txt",
  ".docx",
  "text/markdown",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
].join(",");

/**
 * The nine sentences from specs/05-import-spec.md §6.2, in one place.
 *
 * `message` is rendered verbatim by the UI — there is no client-side re-wording — so these
 * strings ARE the error UI. Three of them end in `IMPORT_LIMITS_COPY`, which is why the copy
 * constant is interpolated rather than retyped.
 *
 * The client's instant pre-check reads the same two entries the server would have used
 * (`unsupportedType`, `fileTooLarge`), so picking a `.pdf` says exactly what the server says
 * about a `.pdf`. Do not inline these into a component: two spellings of one sentence is how
 * the pre-check and the response start disagreeing about the same file.
 *
 * Two deliberate collisions:
 *   - a positively-wrong MIME reuses the unsupported-type sentence; "your MIME type is wrong"
 *     is not something a user can act on.
 *   - "no file" and "a file with nothing in it" share `FILE_MISSING`; the codes match because
 *     the problem is the same, and only the sentences differ.
 */
export const IMPORT_MESSAGES = {
  fileMissing: "No file was selected. Choose a file to import.",
  fileEmpty: "That file is empty. Choose a file with some content in it.",
  unsupportedType: `That file type isn't supported. ${IMPORT_LIMITS_COPY}`,
  fileTooLarge: `That file is too large. ${IMPORT_LIMITS_COPY}`,
  notText: `That file doesn't look like a text file. ${IMPORT_LIMITS_COPY}`,
  corruptDocx: "We couldn't read that .docx file. It may be corrupt or password-protected.",
  emptyResult: "We couldn't find any text in that file.",
  unsupportedContent: "We couldn't convert that file into a document. Try a simpler file.",
  contentTooLarge: "That document is too long to import. Try splitting it into smaller files.",
} as const;

import {
  ACCEPTED_EXTENSIONS,
  ACCEPTED_MIME_TYPES,
  EXTENSION_KIND,
  GENERIC_MIME_TYPES,
  IMPORT_MESSAGES,
  MAX_FILE_BYTES,
  type AcceptedExtension,
  type ImportKind,
} from "@/lib/import/constants";

/**
 * Steps 1–4 of `parseUpload` (specs/05-import-spec.md §3.8), split out because
 * 06-test-plan.md §4.2 drives an 18-row table straight at it.
 *
 * It touches only metadata — name, declared type, byte count — so it runs BEFORE
 * `file.arrayBuffer()` and an oversized upload is never materialised.
 */

export type { ImportKind };

export type FileCheck =
  | { ok: true; kind: ImportKind }
  | {
      ok: false;
      // From the ONE registry in lib/api-types.ts. No bespoke import codes.
      code: "UNSUPPORTED_FILE_TYPE" | "FILE_TOO_LARGE" | "FILE_MISSING";
      status: 415 | 413 | 400;
      message: string;
    };

/**
 * Lowercased last extension of the basename, or `''`.
 *
 * `dot <= 0` is what makes `.gitignore` extension-less rather than an extension named
 * `.gitignore`, and taking the LAST dot is what rejects `evil.md.exe`.
 */
function extensionOf(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot).toLowerCase();
}

function isAccepted(ext: string): ext is AcceptedExtension {
  return (ACCEPTED_EXTENSIONS as readonly string[]).includes(ext);
}

const UNSUPPORTED: FileCheck = {
  ok: false,
  code: "UNSUPPORTED_FILE_TYPE",
  status: 415,
  message: IMPORT_MESSAGES.unsupportedType,
};

/**
 * Evaluation order is **extension → MIME → empty → size**, and it is asserted.
 *
 * A `.exe` that is also over the cap must report `UNSUPPORTED_FILE_TYPE`: answering "your
 * executable was too big" implies we would have accepted a smaller one.
 */
export function checkImportFile(input: {
  filename: string;
  /** `''` when the browser sends none. */
  mimeType: string;
  size: number;
}): FileCheck {
  const ext = extensionOf(input.filename);
  if (!isAccepted(ext)) return UNSUPPORTED;

  const mime = input.mimeType.trim().toLowerCase();
  const tolerated =
    GENERIC_MIME_TYPES.includes(mime) || ACCEPTED_MIME_TYPES[ext].includes(mime);
  if (!tolerated) return UNSUPPORTED;

  if (input.size <= 0) {
    return {
      ok: false,
      code: "FILE_MISSING",
      status: 400,
      message: IMPORT_MESSAGES.fileEmpty,
    };
  }

  // Inclusive boundary: exactly MAX_FILE_BYTES is accepted.
  if (input.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      code: "FILE_TOO_LARGE",
      status: 413,
      message: IMPORT_MESSAGES.fileTooLarge,
    };
  }

  return { ok: true, kind: EXTENSION_KIND[ext] };
}

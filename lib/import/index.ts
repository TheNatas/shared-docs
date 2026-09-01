import {
  MAX_CONTENT_BYTES,
  contentByteSize,
  documentContentSchema,
} from "@/lib/documents/content";
import { IMPORT_MESSAGES } from "@/lib/import/constants";
import { assertLoadableByEditor } from "@/lib/import/html-to-pm";
import { docxToDoc, markdownToDoc, txtToDoc } from "@/lib/import/parsers";
import { safeSourceFilename, titleFromFilename } from "@/lib/import/title";
import { checkImportFile } from "@/lib/import/validate";
import type { ImportFailure, ImportResult, PMDoc, PMNode } from "@/lib/import/types";
import type { ParseFailedReason } from "@/lib/api-types";

export type { ImportFailure, ImportResult, ImportSuccess, PMDoc, PMNode } from "@/lib/import/types";

/**
 * The import orchestrator. specs/05-import-spec.md §3.8.
 *
 * `parseUpload` never throws and never touches the database, the filesystem or the network:
 * it turns one `File` into either a document ready to insert or a fully-formed failure
 * carrying its own status, code and human sentence. That is what keeps the route handler
 * eleven lines long and what makes the whole §6.2 error table testable without a server.
 *
 * The upload's bytes exist only inside this function. Nothing is written to disk, to a temp
 * directory or to a bucket, and no endpoint serves an uploaded file back — which deletes the
 * stored-XSS and content-sniffing classes of bug outright rather than managing them (§7.1).
 */

function parseFailed(reason: ParseFailedReason, message: string): ImportFailure {
  return { ok: false, status: 422, code: "PARSE_FAILED", message, details: { reason } };
}

/**
 * Strict UTF-8, plus a NUL sniff. This is what catches an `.exe` renamed to `.md`: PE and ELF
 * headers are full of NUL bytes, and `TextDecoder`'s non-fatal mode would happily turn them
 * into replacement characters and "succeed".
 *
 * Only the first 8 KB is sniffed — enough for any real binary's header, and bounded so a 2 MB
 * legitimate document does not pay for the check.
 */
function decodeUtf8Strict(buf: Buffer): string | null {
  if (buf.subarray(0, 8192).includes(0x00)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return null;
  }
}

/**
 * True when the parsed document carries no visible text.
 *
 * Whitespace-only Markdown parses perfectly happily into an empty (or all-empty-paragraph)
 * doc, and importing it would create a blank document the user then has to delete. The
 * `hardBreak` case matters for `.txt`: a file of nothing but newlines has structure and no
 * content, and that is still nothing to import.
 */
function hasVisibleText(node: PMNode): boolean {
  if (typeof node.text === "string" && node.text.trim().length > 0) return true;
  return (node.content ?? []).some(hasVisibleText);
}

/** Steps 1–11 of §3.8, in that exact order. The order is part of the contract. */
export async function parseUpload(file: File): Promise<ImportResult> {
  // 1–4 — extension, MIME, empty, size. All metadata: `file.arrayBuffer()` has not been
  // called yet, so an oversized upload is rejected before its body is ever materialised.
  const check = checkImportFile({
    filename: file.name,
    mimeType: file.type,
    size: file.size,
  });
  if (!check.ok) {
    return { ok: false, status: check.status, code: check.code, message: check.message };
  }

  // 5 — now, and only now, we hold the bytes.
  const buf = Buffer.from(await file.arrayBuffer());

  let doc: PMDoc;
  if (check.kind === "docx") {
    try {
      // 7 — mammoth throws on a non-zip, corrupt or password-protected file.
      doc = await docxToDoc(buf);
    } catch {
      return parseFailed("corrupt-docx", IMPORT_MESSAGES.corruptDocx);
    }
  } else {
    // 6 — the binary sniff, for the two text formats only.
    const text = decodeUtf8Strict(buf);
    if (text === null) return parseFailed("not-text", IMPORT_MESSAGES.notText);

    // 7 — dispatch. `.txt` never sees HTML; `.md` goes through marked -> the shared schema.
    doc = check.kind === "md" ? markdownToDoc(text) : txtToDoc(text);
  }

  // 8 — a document with no words in it is not a document.
  if (!hasVisibleText(doc)) {
    return parseFailed("empty-result", IMPORT_MESSAGES.emptyResult);
  }

  // 9 — the schema safety net. Should never fire in production: if it does, either
  // schemaExtensions drifted or a parser invented a node. Log the cause, it is one grep away.
  try {
    assertLoadableByEditor(doc);
  } catch (err) {
    console.error("[import] document rejected by the editor schema:", err);
    return parseFailed("unsupported-content", IMPORT_MESSAGES.unsupportedContent);
  }

  // 10 — the SAME ceiling the autosave PATCH enforces, so an import can never produce a
  // document the editor is then unable to save. This is also the bound that closes the
  // decompression-bomb window on `.docx` (§7.3).
  if (contentByteSize(doc) > MAX_CONTENT_BYTES) {
    return {
      ok: false,
      status: 413,
      code: "CONTENT_TOO_LARGE",
      message: IMPORT_MESSAGES.contentTooLarge,
    };
  }

  // The producer type meets the persisted type here, and nowhere else (§ ruling 4). Doing it
  // inside parseUpload rather than in the route keeps the failure a 422 with a reason instead
  // of a ZodError surfacing as a 400 VALIDATION_FAILED about a body the caller never sent.
  const content = documentContentSchema.safeParse(doc);
  if (!content.success) {
    console.error("[import] parsed document failed the stored-content guard:", content.error);
    return parseFailed("unsupported-content", IMPORT_MESSAGES.unsupportedContent);
  }

  // 11
  return {
    ok: true,
    title: titleFromFilename(file.name),
    sourceFilename: safeSourceFilename(file.name),
    content: content.data,
  };
}
